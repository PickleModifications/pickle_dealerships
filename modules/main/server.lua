local dealershipCache = {}

-- Initialize cache from database on resource start
CreateThread(function()
    local results = MySQL.query.await('SELECT * FROM dealerships')
    if results then
        for _, row in ipairs(results) do
            local meta = row.metadata
            if type(meta) == "string" then
                meta = json.decode(meta) or {}
            end
            dealershipCache[row.location] = {
                id = row.id,
                location = row.location,
                name = row.name,
                owner_citizenid = row.owner_citizenid,
                balance = row.balance or 0,
                tier = row.tier or 1,
                type = row.type or "car",
                mode = row.mode or "public",
                metadata = meta or {},
                created_at = row.created_at,
            }
        end
    end
end)

--- Builds a resolved config for a dealership from its DB metadata
---@param cached table
---@return table|nil
local function ResolveDealershipConfig(cached)
    if not cached then return nil end
    local meta = cached.metadata or {}
    local defaults = Config.DealershipDefaults or {}

    -- Must have coords to be a valid placed dealership
    if not meta.coords then return nil end

    local resolved = {
        label = cached.name or "Dealership",
        mode = cached.mode or "player-owned",
        type = cached.type or "car",
        purchasePrice = meta.purchasePrice or 0,
        selfService = meta.selfService or defaults.selfService or false,
        deliveryMode = meta.deliveryMode or defaults.deliveryMode or "timed",
        colorMode = meta.colorMode or defaults.colorMode or "rgb_wheel",
        acceptedCurrency = meta.acceptedCurrency or defaults.acceptedCurrency or "both",
        blip = meta.blip or defaults.blip or { sprite = 326, color = 3, scale = 0.8 },
    }

    -- Coords
    resolved.coords = vector3(meta.coords.x, meta.coords.y, meta.coords.z)
    resolved.heading = meta.coords.w or 0.0
    resolved.zones = {
        { coords = vector3(meta.coords.x, meta.coords.y, meta.coords.z), radius = meta.zoneRadius or defaults.zoneRadius or 40.0 },
    }

    -- Spawn point
    if meta.spawnPoint then
        resolved.spawnPoint = vector4(meta.spawnPoint.x, meta.spawnPoint.y, meta.spawnPoint.z, meta.spawnPoint.w or 0.0)
    end

    -- Interaction points
    if meta.interactionPoints then
        resolved.interactionPoints = {}
        for pointType, point in pairs(meta.interactionPoints) do
            resolved.interactionPoints[pointType] = vector4(point.x, point.y, point.z, point.w or 0.0)
        end
    end

    -- Display spots
    if meta.displaySpots then
        resolved.displaySpots = {}
        for _, spot in ipairs(meta.displaySpots) do
            resolved.displaySpots[#resolved.displaySpots + 1] = vector4(spot.x, spot.y, spot.z, spot.w or 0.0)
        end
    end

    -- NPC spawn points
    if meta.npcSpawnPoints then
        resolved.npcSpawnPoints = {}
        for _, point in ipairs(meta.npcSpawnPoints) do
            resolved.npcSpawnPoints[#resolved.npcSpawnPoints + 1] = vector4(point.x, point.y, point.z, point.w or 0.0)
        end
    end

    return resolved
end

--- Returns summary data for all dealership locations
---@param source number
lib.callback.register('pickle_dealerships:getDealerships', function(source)
    local dealerships = {}

    for locationKey, cached in pairs(dealershipCache) do
        local resolved = ResolveDealershipConfig(cached)
        if resolved then
            local stockCount = 0
            local result = MySQL.scalar.await(
                'SELECT COUNT(*) FROM dealership_stock WHERE dealership_id = ? AND sold_at IS NULL',
                { cached.id }
            )
            stockCount = result or 0

            dealerships[locationKey] = {
                location = locationKey,
                name = cached.name,
                mode = cached.mode or "player-owned",
                type = cached.type or "car",
                owner_citizenid = cached.owner_citizenid,
                purchasePrice = resolved.purchasePrice,
                tier = cached.tier or 1,
                stockCount = stockCount,
                owned = cached.owner_citizenid ~= nil,
                resolvedConfig = resolved,
            }
        end
    end

    return dealerships
end)

--- Returns full dealership data for a specific location
---@param source number
---@param locationKey string
lib.callback.register('pickle_dealerships:getDealershipData', function(source, locationKey)
    local cached = dealershipCache[locationKey]
    local resolved = ResolveDealershipConfig(cached)
    if not resolved then return nil end

    local stock = {}
    local employees = {}

    if cached then
        local stockResults = MySQL.query.await(
            'SELECT * FROM dealership_stock WHERE dealership_id = ? AND sold_at IS NULL',
            { cached.id }
        )
        stock = stockResults or {}

        local employeeResults = MySQL.query.await(
            'SELECT * FROM dealership_employees WHERE dealership_id = ?',
            { cached.id }
        )
        employees = employeeResults or {}
    end

    local tierCfg = Config.Tiers[cached and cached.tier or 1]

    return {
        id = cached and cached.id or nil,
        location = locationKey,
        name = cached and cached.name or resolved.label,
        mode = resolved.mode,
        type = resolved.type or 'car',
        owner_citizenid = cached and cached.owner_citizenid or nil,
        balance = cached and cached.balance or 0,
        tier = cached and cached.tier or 1,
        purchasePrice = resolved.purchasePrice or 0,
        coords = resolved.coords,
        displaySpots = resolved.displaySpots or {},
        deliveryMode = resolved.deliveryMode or 'timed',
        selfService = resolved.selfService or false,
        stock = stock,
        employees = employees,
        stockCapacity = tierCfg and tierCfg.stockCap or 20,
    }
end)

--- Player purchases an unclaimed player-owned dealership
---@param source number
---@param locationKey string
lib.callback.register('pickle_dealerships:purchaseDealership', function(source, locationKey)
    local cached = dealershipCache[locationKey]
    local resolved = ResolveDealershipConfig(cached)
    if not resolved then
        return { success = false, error = 'Invalid dealership location.' }
    end

    if resolved.mode ~= 'player-owned' then
        return { success = false, error = 'This dealership cannot be purchased.' }
    end

    if cached and cached.owner_citizenid then
        return { success = false, error = 'This dealership is already owned.' }
    end

    local price = resolved.purchasePrice or 0
    local citizenid = GetIdentifier(source)
    if not citizenid then
        return { success = false, error = 'Unable to identify player.' }
    end

    local money = GetMoney(source, 'bank')
    if money < price then
        return { success = false, error = 'You do not have enough money.' }
    end

    local success = RemoveMoney(source, price, 'bank')
    if not success then
        return { success = false, error = 'Failed to deduct payment.' }
    end

    MySQL.update.await(
        'UPDATE dealerships SET owner_citizenid = ?, balance = 0 WHERE id = ?',
        { citizenid, cached.id }
    )
    cached.owner_citizenid = citizenid
    cached.balance = 0

    ShowNotification(source, 'You purchased the dealership for $' .. price .. '!')
    return { success = true }
end)

--- Owner sells their dealership back
---@param source number
---@param locationKey string
lib.callback.register('pickle_dealerships:sellDealership', function(source, locationKey)
    local cached = dealershipCache[locationKey]
    local resolved = ResolveDealershipConfig(cached)
    if not resolved then
        return { success = false, error = 'Invalid dealership location.' }
    end

    if not cached or not cached.owner_citizenid then
        return { success = false, error = 'This dealership is not owned.' }
    end

    local citizenid = GetIdentifier(source)
    if citizenid ~= cached.owner_citizenid then
        return { success = false, error = 'You do not own this dealership.' }
    end

    local sellbackRate = Config.SellbackRate or 0.5
    local refund = math.floor((resolved.purchasePrice or 0) * sellbackRate)

    MySQL.update.await('DELETE FROM dealership_employees WHERE dealership_id = ?', { cached.id })
    MySQL.update.await('DELETE FROM dealership_stock WHERE dealership_id = ? AND sold_at IS NULL', { cached.id })
    MySQL.update.await('UPDATE dealerships SET owner_citizenid = NULL, balance = 0 WHERE id = ?', { cached.id })

    cached.owner_citizenid = nil
    cached.balance = 0

    AddMoney(source, refund, 'bank')
    ShowNotification(source, 'You sold the dealership and received $' .. refund .. '.')
    TriggerClientEvent('pickle_dealerships:refreshDisplay', -1, locationKey)

    return { success = true, refund = refund }
end)

--- Owner renames their dealership
---@param source number
---@param locationKey string
---@param newName string
lib.callback.register('pickle_dealerships:renameDealership', function(source, locationKey, newName)
    local cached = dealershipCache[locationKey]
    if not cached or not cached.owner_citizenid then
        return { success = false, error = 'This dealership is not owned.' }
    end

    local citizenid = GetIdentifier(source)
    if citizenid ~= cached.owner_citizenid then
        return { success = false, error = 'You do not own this dealership.' }
    end

    if not newName or #newName < 1 or #newName > 50 then
        return { success = false, error = 'Invalid name. Must be between 1 and 50 characters.' }
    end

    MySQL.update.await('UPDATE dealerships SET name = ? WHERE id = ?', { newName, cached.id })
    cached.name = newName
    ShowNotification(source, 'Dealership renamed to "' .. newName .. '".')
    return { success = true }
end)

--- Returns the player's role at a specific dealership
---@param source number
---@param locationKey string
lib.callback.register('pickle_dealerships:getPlayerRole', function(source, locationKey)
    local citizenid = GetIdentifier(source)
    if not citizenid then return nil end

    local cached = dealershipCache[locationKey]
    if not cached then return nil end

    if cached.owner_citizenid == citizenid then
        return 'owner'
    end

    local employee = MySQL.single.await(
        'SELECT role FROM dealership_employees WHERE dealership_id = ? AND citizenid = ?',
        { cached.id, citizenid }
    )

    if employee then
        return employee.role
    end

    if IsPlayerAdmin(source) then
        return 'admin'
    end

    return nil
end)
