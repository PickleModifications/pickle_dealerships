local dealershipCache = {}

-- Initialize cache from database on resource start
CreateThread(function()
    local results = MySQL.query.await('SELECT * FROM dealerships')
    if results then
        for _, row in ipairs(results) do
            dealershipCache[row.location] = {
                id = row.id,
                location = row.location,
                name = row.name,
                owner_citizenid = row.owner_citizenid,
                balance = row.balance or 0,
                tier = row.tier or 1,
                created_at = row.created_at,
            }
        end
    end
end)

--- Returns summary data for all dealership locations (config + DB merged)
---@param source number
lib.callback.register('pickle_dealerships:getDealerships', function(source)
    local dealerships = {}

    for locationKey, locationConfig in pairs(Config.Dealerships) do
        local cached = dealershipCache[locationKey]
        local stockCount = 0

        if cached then
            local result = MySQL.scalar.await(
                'SELECT COUNT(*) FROM dealership_stock WHERE dealership_id = ? AND sold = 0',
                { cached.id }
            )
            stockCount = result or 0
        end

        dealerships[locationKey] = {
            location = locationKey,
            name = cached and cached.name or locationConfig.name,
            mode = locationConfig.mode,
            type = locationConfig.type or 'car',
            owner_citizenid = cached and cached.owner_citizenid or nil,
            purchasePrice = locationConfig.purchasePrice,
            tier = cached and cached.tier or locationConfig.defaultTier or 1,
            coords = locationConfig.coords,
            blip = locationConfig.blip,
            stockCount = stockCount,
            owned = cached and cached.owner_citizenid ~= nil or false,
        }
    end

    return dealerships
end)

--- Returns full dealership data for a specific location
---@param source number
---@param locationKey string
lib.callback.register('pickle_dealerships:getDealershipData', function(source, locationKey)
    local locationConfig = Config.Dealerships[locationKey]
    if not locationConfig then return nil end

    local cached = dealershipCache[locationKey]

    local stock = {}
    local employees = {}

    if cached then
        local stockResults = MySQL.query.await(
            'SELECT * FROM dealership_stock WHERE dealership_id = ? AND sold = 0',
            { cached.id }
        )
        stock = stockResults or {}

        local employeeResults = MySQL.query.await(
            'SELECT * FROM dealership_employees WHERE dealership_id = ?',
            { cached.id }
        )
        employees = employeeResults or {}
    end

    return {
        location = locationKey,
        name = cached and cached.name or locationConfig.name,
        mode = locationConfig.mode,
        type = locationConfig.type or 'car',
        owner_citizenid = cached and cached.owner_citizenid or nil,
        balance = cached and cached.balance or 0,
        tier = cached and cached.tier or locationConfig.defaultTier or 1,
        purchasePrice = locationConfig.purchasePrice,
        coords = locationConfig.coords,
        displaySpots = locationConfig.displaySpots or {},
        deliveryMode = locationConfig.deliveryMode or 'instant',
        stock = stock,
        employees = employees,
        stockCapacity = locationConfig.stockCapacity or Config.DefaultStockCapacity or 20,
    }
end)

--- Player purchases an unclaimed player-owned dealership
---@param source number
---@param locationKey string
lib.callback.register('pickle_dealerships:purchaseDealership', function(source, locationKey)
    local locationConfig = Config.Dealerships[locationKey]
    if not locationConfig then
        return false, 'Invalid dealership location.'
    end

    if locationConfig.mode ~= 'player-owned' then
        return false, 'This dealership cannot be purchased.'
    end

    local cached = dealershipCache[locationKey]
    if cached and cached.owner_citizenid then
        return false, 'This dealership is already owned.'
    end

    local price = locationConfig.purchasePrice or 0
    local citizenid = GetIdentifier(source)
    if not citizenid then
        return false, 'Unable to identify player.'
    end

    local money = GetMoney(source, 'bank')
    if money < price then
        return false, 'You do not have enough money.'
    end

    local success = RemoveMoney(source, 'bank', price)
    if not success then
        return false, 'Failed to deduct payment.'
    end

    if cached then
        MySQL.update.await(
            'UPDATE dealerships SET owner_citizenid = ?, name = ?, balance = 0 WHERE location = ?',
            { citizenid, locationConfig.name, locationKey }
        )
        cached.owner_citizenid = citizenid
        cached.balance = 0
    else
        local id = MySQL.insert.await(
            'INSERT INTO dealerships (location, name, owner_citizenid, balance, tier) VALUES (?, ?, ?, 0, ?)',
            { locationKey, locationConfig.name, citizenid, locationConfig.defaultTier or 1 }
        )
        dealershipCache[locationKey] = {
            id = id,
            location = locationKey,
            name = locationConfig.name,
            owner_citizenid = citizenid,
            balance = 0,
            tier = locationConfig.defaultTier or 1,
        }
    end

    ShowNotification(source, 'You purchased the dealership for $' .. price .. '!', 'success')
    return true
end)

--- Owner sells their dealership back
---@param source number
---@param locationKey string
lib.callback.register('pickle_dealerships:sellDealership', function(source, locationKey)
    local locationConfig = Config.Dealerships[locationKey]
    if not locationConfig then
        return false, 'Invalid dealership location.'
    end

    local cached = dealershipCache[locationKey]
    if not cached or not cached.owner_citizenid then
        return false, 'This dealership is not owned.'
    end

    local citizenid = GetIdentifier(source)
    if citizenid ~= cached.owner_citizenid then
        return false, 'You do not own this dealership.'
    end

    local sellbackRate = Config.SellbackRate or 0.5
    local refund = math.floor((locationConfig.purchasePrice or 0) * sellbackRate)

    -- Remove all employees
    MySQL.update.await(
        'DELETE FROM dealership_employees WHERE dealership_id = ?',
        { cached.id }
    )

    -- Clear all unsold stock
    MySQL.update.await(
        'DELETE FROM dealership_stock WHERE dealership_id = ? AND sold = 0',
        { cached.id }
    )

    -- Clear ownership
    MySQL.update.await(
        'UPDATE dealerships SET owner_citizenid = NULL, balance = 0 WHERE id = ?',
        { cached.id }
    )

    cached.owner_citizenid = nil
    cached.balance = 0

    AddMoney(source, 'bank', refund)
    ShowNotification(source, 'You sold the dealership and received $' .. refund .. '.', 'success')

    -- Notify clients to refresh display vehicles
    TriggerClientEvent('pickle_dealerships:refreshDisplay', -1, locationKey)

    return true
end)

--- Owner renames their dealership
---@param source number
---@param locationKey string
---@param newName string
lib.callback.register('pickle_dealerships:renameDealership', function(source, locationKey, newName)
    local cached = dealershipCache[locationKey]
    if not cached or not cached.owner_citizenid then
        return false, 'This dealership is not owned.'
    end

    local citizenid = GetIdentifier(source)
    if citizenid ~= cached.owner_citizenid then
        return false, 'You do not own this dealership.'
    end

    if not newName or #newName < 1 or #newName > 50 then
        return false, 'Invalid name. Must be between 1 and 50 characters.'
    end

    MySQL.update.await(
        'UPDATE dealerships SET name = ? WHERE id = ?',
        { newName, cached.id }
    )

    cached.name = newName
    ShowNotification(source, 'Dealership renamed to "' .. newName .. '".', 'success')
    return true
end)

--- Returns the player's role at a specific dealership
---@param source number
---@param locationKey string
lib.callback.register('pickle_dealerships:getPlayerRole', function(source, locationKey)
    local citizenid = GetIdentifier(source)
    if not citizenid then return nil end

    local cached = dealershipCache[locationKey]
    if not cached then return nil end

    -- Check if owner
    if cached.owner_citizenid == citizenid then
        return 'owner'
    end

    -- Check if employee
    local employee = MySQL.single.await(
        'SELECT role FROM dealership_employees WHERE dealership_id = ? AND citizenid = ?',
        { cached.id, citizenid }
    )

    if employee then
        return employee.role
    end

    -- Check if admin
    if IsPlayerAdmin(source) then
        return 'admin'
    end

    return nil
end)
