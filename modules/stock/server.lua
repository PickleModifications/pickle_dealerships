--- Returns the wholesale catalog filtered by dealership tier and type
---@param source number
---@param locationKey string
lib.callback.register('pickle_dealerships:getCatalog', function(source, locationKey)
    local cfg = Config.Dealerships[locationKey]
    if not cfg then return {} end

    local dealership = MySQL.single.await(
        'SELECT * FROM dealerships WHERE location = ?',
        { locationKey }
    )

    local tier = dealership and dealership.tier or cfg.defaultTier or 1
    local vehicleType = cfg.type or 'car'

    local catalog = GetCatalogForDealership(vehicleType, tier)
    return catalog or {}
end)

--- Returns all available (unsold) stock for a dealership
---@param source number
---@param locationKey string
lib.callback.register('pickle_dealerships:getStock', function(source, locationKey)
    local dealership = MySQL.single.await(
        'SELECT * FROM dealerships WHERE location = ?',
        { locationKey }
    )
    if not dealership then return {} end

    local stock = MySQL.query.await(
        'SELECT * FROM dealership_stock WHERE dealership_id = ? AND sold = 0 AND (delivered_at IS NOT NULL OR delivered_at <= NOW())',
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
    local cfg = Config.Dealerships[locationKey]
    if not cfg then return false, 'Invalid dealership.' end

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

    -- Verify the model is in the catalog for this dealership
    local tier = dealership.tier or cfg.defaultTier or 1
    local vehicleType = cfg.type or 'car'
    local catalog = GetCatalogForDealership(vehicleType, tier)
    local catalogEntry = nil

    if catalog then
        for _, entry in ipairs(catalog) do
            if entry.model == model then
                catalogEntry = entry
                break
            end
        end
    end

    if not catalogEntry then
        return false, 'This vehicle is not available in your catalog.'
    end

    -- Verify wholesale price matches
    if catalogEntry.wholesalePrice ~= wholesalePrice then
        return false, 'Price mismatch. Please refresh the catalog.'
    end

    -- Check stock capacity
    local stockCapacity = cfg.stockCapacity or Config.DefaultStockCapacity or 20
    local currentCount = MySQL.scalar.await(
        'SELECT COUNT(*) FROM dealership_stock WHERE dealership_id = ? AND sold = 0',
        { dealership.id }
    )

    if (currentCount or 0) >= stockCapacity then
        return false, 'Stock capacity reached. Sell or remove vehicles first.'
    end

    -- Calculate total cost with import tax
    local importTax = Config.ImportTaxRate or 0
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
    local deliveryMode = cfg.deliveryMode or 'instant'

    if deliveryMode == 'instant' then
        deliveredAt = os.date('%Y-%m-%d %H:%M:%S')
    elseif deliveryMode == 'timed' then
        local deliverySeconds = Config.DeliveryTimeSeconds or 300
        deliveredAt = os.date('%Y-%m-%d %H:%M:%S', os.time() + deliverySeconds)
    end
    -- For 'trucking' mode, delivered_at stays NULL until delivery mission completes

    -- Create stock entry
    local stockId = MySQL.insert.await(
        'INSERT INTO dealership_stock (dealership_id, model, wholesale_price, retail_price, delivered_at, sold, display_spot) VALUES (?, ?, ?, ?, ?, 0, NULL)',
        { dealership.id, model, wholesalePrice, catalogEntry.defaultRetailPrice or math.floor(wholesalePrice * 1.2), deliveredAt }
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
        'SELECT * FROM dealership_stock WHERE id = ? AND dealership_id = ? AND sold = 0',
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
        'SELECT * FROM dealership_stock WHERE id = ? AND dealership_id = ? AND sold = 0',
        { stockId, dealership.id }
    )
    if not stock then return false, 'Stock item not found.' end

    if spot then
        -- Check if spot is already occupied by another vehicle
        local existing = MySQL.single.await(
            'SELECT id FROM dealership_stock WHERE dealership_id = ? AND display_spot = ? AND sold = 0 AND id != ?',
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
        'SELECT * FROM dealership_stock WHERE dealership_id = ? AND sold = 0 AND delivered_at IS NOT NULL AND delivered_at <= NOW()',
        { dealership.id }
    )

    return delivered or {}
end)

--- Background thread: check timed deliveries every 60 seconds
CreateThread(function()
    while true do
        Wait(60000)

        for locationKey, cfg in pairs(Config.Dealerships) do
            if cfg.deliveryMode == 'timed' then
                local dealership = MySQL.single.await(
                    'SELECT id FROM dealerships WHERE location = ?',
                    { locationKey }
                )

                if dealership then
                    -- Count newly delivered items
                    local newlyDelivered = MySQL.scalar.await(
                        'SELECT COUNT(*) FROM dealership_stock WHERE dealership_id = ? AND sold = 0 AND delivered_at IS NOT NULL AND delivered_at <= NOW() AND notified = 0',
                        { dealership.id }
                    )

                    if newlyDelivered and newlyDelivered > 0 then
                        -- Mark as notified
                        MySQL.update.await(
                            'UPDATE dealership_stock SET notified = 1 WHERE dealership_id = ? AND sold = 0 AND delivered_at <= NOW() AND notified = 0',
                            { dealership.id }
                        )

                        -- Notify clients to refresh display
                        TriggerClientEvent('pickle_dealerships:refreshDisplay', -1, locationKey)
                    end
                end
            end
        end
    end
end)
