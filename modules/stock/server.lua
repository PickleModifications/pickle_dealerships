--- Returns the wholesale catalog filtered by dealership tier and type (DB-driven)
---@param source number
---@param locationKey string
lib.callback.register('pickle_dealerships:getCatalog', function(source, locationKey)
    local dealership = MySQL.single.await(
        'SELECT * FROM dealerships WHERE location = ?',
        { locationKey }
    )
    if not dealership then return {} end

    local tier = dealership.tier or 1
    local vehicleType = dealership.type or 'car'

    -- Build type filter
    local types = {}
    if vehicleType == 'mixed' then
        types = { 'car', 'boat', 'air' }
    else
        types = { vehicleType }
    end

    -- Get access level for this tier
    local accessLevel = Config.Tiers[tier] and Config.Tiers[tier].catalogAccess or 'basic'
    local hierarchy = { basic = 1, expanded = 2, full = 3, exclusive = 4 }
    local accessNum = hierarchy[accessLevel] or 1

    -- Tiers the dealership can access
    local allowedTiers = {}
    for tierName, tierNum in pairs(hierarchy) do
        if tierNum <= accessNum then
            allowedTiers[#allowedTiers + 1] = tierName
        end
    end

    if #allowedTiers == 0 then return {} end

    -- Build query with placeholders
    local typePlaceholders = {}
    local tierPlaceholders = {}
    local params = {}

    for _, t in ipairs(types) do
        typePlaceholders[#typePlaceholders + 1] = '?'
        params[#params + 1] = t
    end
    for _, t in ipairs(allowedTiers) do
        tierPlaceholders[#tierPlaceholders + 1] = '?'
        params[#params + 1] = t
    end

    local query = string.format(
        'SELECT * FROM wholesale_catalog WHERE vehicle_type IN (%s) AND tier IN (%s) ORDER BY wholesale ASC',
        table.concat(typePlaceholders, ','),
        table.concat(tierPlaceholders, ',')
    )

    local results = MySQL.query.await(query, params)
    return results or {}
end)

--- Returns all unsold stock for a dealership (including pending deliveries)
---@param source number
---@param locationKey string
lib.callback.register('pickle_dealerships:getStock', function(source, locationKey)
    local dealership = MySQL.single.await(
        'SELECT * FROM dealerships WHERE location = ?',
        { locationKey }
    )
    if not dealership then return {} end

    local stock = MySQL.query.await(
        'SELECT * FROM dealership_stock WHERE dealership_id = ? AND sold_at IS NULL ORDER BY ordered_at DESC',
        { dealership.id }
    )

    return stock or {}
end)

--- Owner/manager orders a vehicle from wholesale catalog
---@param source number
---@param locationKey string
---@param model string
---@param wholesalePrice number
lib.callback.register('pickle_dealerships:orderVehicle', function(source, locationKey, model, wholesalePrice)
    -- Verify player role
    local citizenid = GetIdentifier(source)
    if not citizenid then return false, 'Unable to identify player.' end

    local dealership = MySQL.single.await(
        'SELECT * FROM dealerships WHERE location = ?',
        { locationKey }
    )
    if not dealership then return false, 'Dealership not found.' end

    -- Check role
    local isOwner = dealership.owner_citizenid == citizenid
    local employee = nil
    if not isOwner then
        employee = MySQL.single.await(
            'SELECT role FROM dealership_employees WHERE dealership_id = ? AND citizenid = ?',
            { dealership.id, citizenid }
        )
        if not employee or (employee.role ~= 'manager' and not IsPlayerAdmin(source)) then
            return false, 'You do not have permission to order vehicles.'
        end
    end

    -- Verify the model is in the DB catalog
    local catalogEntry = MySQL.single.await(
        'SELECT * FROM wholesale_catalog WHERE model = ?',
        { model }
    )

    if not catalogEntry then
        return false, 'This vehicle is not available in the catalog.'
    end

    -- Verify tier access
    if not CanAccessCatalogTier(dealership.tier or 1, catalogEntry.tier) then
        return false, 'Your dealership tier cannot access this vehicle.'
    end

    -- Verify wholesale price matches
    if catalogEntry.wholesale ~= wholesalePrice then
        return false, 'Price mismatch. Please refresh the catalog.'
    end

    -- Check stock capacity
    local tierCfg = Config.Tiers[dealership.tier or 1]
    local stockCapacity = (tierCfg and tierCfg.stockCap) or 20
    local currentCount = MySQL.scalar.await(
        'SELECT COUNT(*) FROM dealership_stock WHERE dealership_id = ? AND sold_at IS NULL',
        { dealership.id }
    )

    if (currentCount or 0) >= stockCapacity then
        return false, 'Stock capacity reached. Sell or remove vehicles first.'
    end

    -- Calculate total cost with import tax
    local importTax = Config.ImportTax or 0
    local totalCost = math.floor(wholesalePrice * (1 + importTax))

    -- Check dealership balance
    if dealership.balance < totalCost then
        return false, 'Insufficient dealership funds. Need $' .. totalCost .. ', have $' .. dealership.balance .. '.'
    end

    -- Deduct from dealership balance
    MySQL.update.await(
        'UPDATE dealerships SET balance = balance - ? WHERE id = ?',
        { totalCost, dealership.id }
    )

    -- Determine delivery time
    local deliveredAt = nil
    local meta = dealership.metadata
    if type(meta) == "string" then meta = json.decode(meta) or {} end
    if type(meta) ~= "table" then meta = {} end
    local deliveryMode = (meta and meta.deliveryMode) or (Config.DealershipDefaults and Config.DealershipDefaults.deliveryMode) or 'timed'

    if deliveryMode == 'instant' then
        deliveredAt = os.date('%Y-%m-%d %H:%M:%S')
    elseif deliveryMode == 'timed' then
        local deliveryMinutes = Config.DeliveryTime or 20
        deliveredAt = os.date('%Y-%m-%d %H:%M:%S', os.time() + (deliveryMinutes * 60))
    end
    -- For 'trucking' mode, delivered_at stays NULL until delivery mission completes

    -- Create stock entry
    local retailPrice = math.floor(wholesalePrice * 1.3)
    local stockId = MySQL.insert.await(
        'INSERT INTO dealership_stock (dealership_id, vehicle_model, vehicle_label, wholesale_cost, retail_price, ordered_at, delivered_at) VALUES (?, ?, ?, ?, ?, NOW(), ?)',
        { dealership.id, model, catalogEntry.label or model, wholesalePrice, retailPrice, deliveredAt }
    )

    -- Create ledger entry
    MySQL.insert.await(
        'INSERT INTO dealership_ledger (dealership_id, type, amount, description, citizenid, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
        { dealership.id, 'expense', totalCost, 'Vehicle order: ' .. model, citizenid }
    )

    ShowNotification(source, 'Vehicle ordered: ' .. model .. ' for $' .. totalCost .. '.', 'success')

    -- Notify clients to refresh display
    TriggerClientEvent('pickle_dealerships:refreshDisplay', -1, locationKey)

    return true, stockId
end)

--- Owner/manager sets the retail price for a stock item
---@param source number
---@param locationKey string
---@param stockId number
---@param retailPrice number
lib.callback.register('pickle_dealerships:setRetailPrice', function(source, locationKey, stockId, retailPrice)
    local citizenid = GetIdentifier(source)
    if not citizenid then return false, 'Unable to identify player.' end

    local dealership = MySQL.single.await(
        'SELECT * FROM dealerships WHERE location = ?',
        { locationKey }
    )
    if not dealership then return false, 'Dealership not found.' end

    -- Verify permission
    local isOwner = dealership.owner_citizenid == citizenid
    if not isOwner then
        local employee = MySQL.single.await(
            'SELECT role FROM dealership_employees WHERE dealership_id = ? AND citizenid = ?',
            { dealership.id, citizenid }
        )
        if not employee or (employee.role ~= 'manager' and not IsPlayerAdmin(source)) then
            return false, 'You do not have permission.'
        end
    end

    if not retailPrice or retailPrice < 0 then
        return false, 'Invalid retail price.'
    end

    -- Verify stock belongs to this dealership
    local stock = MySQL.single.await(
        'SELECT * FROM dealership_stock WHERE id = ? AND dealership_id = ? AND sold_at IS NULL',
        { stockId, dealership.id }
    )
    if not stock then return false, 'Stock item not found.' end

    MySQL.update.await(
        'UPDATE dealership_stock SET retail_price = ? WHERE id = ?',
        { retailPrice, stockId }
    )

    ShowNotification(source, 'Retail price updated to $' .. retailPrice .. '.', 'success')
    return true
end)

--- Assigns a stock item to a display spot (or removes from display)
---@param source number
---@param locationKey string
---@param stockId number
---@param spot number|nil
lib.callback.register('pickle_dealerships:setDisplaySpot', function(source, locationKey, stockId, spot)
    local citizenid = GetIdentifier(source)
    if not citizenid then return false, 'Unable to identify player.' end

    local dealership = MySQL.single.await(
        'SELECT * FROM dealerships WHERE location = ?',
        { locationKey }
    )
    if not dealership then return false, 'Dealership not found.' end

    -- Verify permission
    local isOwner = dealership.owner_citizenid == citizenid
    if not isOwner then
        local employee = MySQL.single.await(
            'SELECT role FROM dealership_employees WHERE dealership_id = ? AND citizenid = ?',
            { dealership.id, citizenid }
        )
        if not employee or (employee.role ~= 'manager' and not IsPlayerAdmin(source)) then
            return false, 'You do not have permission.'
        end
    end

    -- Verify stock belongs to this dealership and is delivered
    local stock = MySQL.single.await(
        'SELECT * FROM dealership_stock WHERE id = ? AND dealership_id = ? AND sold_at IS NULL',
        { stockId, dealership.id }
    )
    if not stock then return false, 'Stock item not found.' end

    if spot then
        -- Check if spot is already occupied by another vehicle
        local existing = MySQL.single.await(
            'SELECT id FROM dealership_stock WHERE dealership_id = ? AND display_spot = ? AND sold_at IS NULL AND id != ?',
            { dealership.id, spot, stockId }
        )
        if existing then
            -- Remove previous vehicle from spot
            MySQL.update.await(
                'UPDATE dealership_stock SET display_spot = NULL WHERE id = ?',
                { existing.id }
            )
        end
    end

    MySQL.update.await(
        'UPDATE dealership_stock SET display_spot = ? WHERE id = ?',
        { spot, stockId }
    )

    -- Notify clients to refresh display
    TriggerClientEvent('pickle_dealerships:refreshDisplay', -1, locationKey)

    ShowNotification(source, spot and ('Vehicle placed on display spot #' .. spot .. '.') or 'Vehicle removed from display.', 'success')
    return true
end)

--- Checks for stock items whose delivery time has passed and marks them delivered
---@param source number
---@param locationKey string
lib.callback.register('pickle_dealerships:checkDeliveries', function(source, locationKey)
    local dealership = MySQL.single.await(
        'SELECT * FROM dealerships WHERE location = ?',
        { locationKey }
    )
    if not dealership then return {} end

    -- Find items that have a future delivered_at that has now passed
    local delivered = MySQL.query.await(
        'SELECT * FROM dealership_stock WHERE dealership_id = ? AND sold_at IS NULL AND delivered_at IS NOT NULL AND delivered_at <= NOW()',
        { dealership.id }
    )

    return delivered or {}
end)

--- Background thread: check timed deliveries every 60 seconds
CreateThread(function()
    while true do
        Wait(60000)

        local dealerships = MySQL.query.await('SELECT id, location FROM dealerships')
        if dealerships then
            for _, dealership in ipairs(dealerships) do
                -- Check if any vehicles were recently delivered
                local deliveredCount = MySQL.scalar.await(
                    'SELECT COUNT(*) FROM dealership_stock WHERE dealership_id = ? AND sold_at IS NULL AND delivered_at IS NOT NULL AND delivered_at <= NOW()',
                    { dealership.id }
                )

                if deliveredCount and deliveredCount > 0 then
                    TriggerClientEvent('pickle_dealerships:refreshDisplay', -1, dealership.location)
                end
            end
        end
    end
end)
