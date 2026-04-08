--- Returns the wholesale catalog filtered by dealership tier and type (DB-driven)
---@param source number
---@param data table|string
lib.callback.register('pickle_dealerships:getCatalog', function(source, data)
    local locationKey = type(data) == 'string' and data or (data and data.location)
    if not locationKey then return { items = {}, total = 0, page = 1, pageSize = 50 } end

    local dealership = MySQL.single.await(
        'SELECT * FROM dealerships WHERE location = ?',
        { locationKey }
    )
    if not dealership then return { items = {}, total = 0, page = 1, pageSize = 50 } end

    local tier = dealership.tier or 1
    local vehicleType = dealership.type or 'car'

    local page = tonumber(data and data.page) or 1
    local pageSize = tonumber(data and data.pageSize) or 50
    local search = data and data.search or ''
    local classFilter = data and data.classFilter or 'all'
    local tierFilter = data and data.tierFilter or 'all'
    local offset = (page - 1) * pageSize

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

    if #allowedTiers == 0 then return { items = {}, total = 0, page = 1, pageSize = pageSize } end

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

    local where = string.format(
        'vehicle_type IN (%s) AND tier IN (%s)',
        table.concat(typePlaceholders, ','),
        table.concat(tierPlaceholders, ',')
    )

    if search ~= '' then
        where = where .. ' AND (label LIKE ? OR model LIKE ?)'
        local pattern = '%' .. search .. '%'
        params[#params + 1] = pattern
        params[#params + 1] = pattern
    end

    if classFilter ~= 'all' then
        where = where .. ' AND class = ?'
        params[#params + 1] = classFilter
    end

    if tierFilter ~= 'all' then
        where = where .. ' AND tier = ?'
        params[#params + 1] = tierFilter
    end

    local countParams = { table.unpack(params) }
    local countResult = MySQL.scalar.await(
        ('SELECT COUNT(*) FROM wholesale_catalog WHERE %s'):format(where),
        countParams
    )

    params[#params + 1] = pageSize
    params[#params + 1] = offset

    local results = MySQL.query.await(
        ('SELECT * FROM wholesale_catalog WHERE %s ORDER BY wholesale ASC LIMIT ? OFFSET ?'):format(where),
        params
    )

    return {
        items = results or {},
        total = countResult or 0,
        page = page,
        pageSize = pageSize,
    }
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
        'SELECT ds.*, wc.image, wc.class FROM dealership_stock ds LEFT JOIN wholesale_catalog wc ON wc.model = ds.vehicle_model WHERE ds.dealership_id = ? AND ds.sold_at IS NULL ORDER BY ds.ordered_at DESC',
        { dealership.id }
    )

    return stock or {}
end)

--- Returns paginated available stock for the showroom
---@param source number
---@param data table
lib.callback.register('pickle_dealerships:getShowroomStock', function(source, data)
    local locationKey = data and data.location
    if not locationKey then return { items = {}, total = 0, page = 1, pageSize = 20 } end

    local dealership = MySQL.single.await(
        'SELECT * FROM dealerships WHERE location = ?',
        { locationKey }
    )
    if not dealership then return { items = {}, total = 0, page = 1, pageSize = 20 } end

    local page = tonumber(data.page) or 1
    local pageSize = tonumber(data.pageSize) or 20
    local search = data.search or ''
    local classFilter = data.classFilter or 'all'
    local minPrice = tonumber(data.minPrice)
    local maxPrice = tonumber(data.maxPrice)
    local sortBy = data.sortBy or 'name_asc'
    local offset = (page - 1) * pageSize

    local sortMap = {
        name_asc = 'ds.vehicle_label ASC',
        name_desc = 'ds.vehicle_label DESC',
        price_asc = 'ds.retail_price ASC',
        price_desc = 'ds.retail_price DESC',
    }
    local orderBy = sortMap[sortBy] or 'ds.vehicle_label ASC'

    local where = 'ds.dealership_id = ? AND ds.sold_at IS NULL AND ds.delivered_at IS NOT NULL AND ds.delivered_at <= NOW()'
    local params = { dealership.id }

    if search ~= '' then
        where = where .. ' AND (ds.vehicle_label LIKE ? OR ds.vehicle_model LIKE ?)'
        local pattern = '%' .. search .. '%'
        params[#params + 1] = pattern
        params[#params + 1] = pattern
    end

    if classFilter ~= 'all' then
        where = where .. ' AND wc.class = ?'
        params[#params + 1] = classFilter
    end

    if minPrice then
        where = where .. ' AND ds.retail_price >= ?'
        params[#params + 1] = minPrice
    end

    if maxPrice then
        where = where .. ' AND ds.retail_price <= ?'
        params[#params + 1] = maxPrice
    end

    local countParams = { table.unpack(params) }
    local countResult = MySQL.scalar.await(
        ('SELECT COUNT(*) FROM dealership_stock ds LEFT JOIN wholesale_catalog wc ON wc.model = ds.vehicle_model WHERE %s'):format(where),
        countParams
    )

    params[#params + 1] = pageSize
    params[#params + 1] = offset

    local results = MySQL.query.await(
        ('SELECT ds.*, wc.image, wc.class FROM dealership_stock ds LEFT JOIN wholesale_catalog wc ON wc.model = ds.vehicle_model WHERE %s ORDER BY %s LIMIT ? OFFSET ?'):format(where, orderBy),
        params
    )

    -- Get filter metadata (only on first unfiltered page)
    local classes = {}
    local highestPrice = 0
    if page == 1 and search == '' and classFilter == 'all' and not minPrice and not maxPrice then
        local classRows = MySQL.query.await(
            'SELECT DISTINCT wc.class FROM dealership_stock ds LEFT JOIN wholesale_catalog wc ON wc.model = ds.vehicle_model WHERE ds.dealership_id = ? AND ds.sold_at IS NULL AND ds.delivered_at IS NOT NULL AND ds.delivered_at <= NOW() AND wc.class IS NOT NULL ORDER BY wc.class',
            { dealership.id }
        )
        if classRows then
            for _, row in ipairs(classRows) do
                classes[#classes + 1] = row.class
            end
        end

        highestPrice = MySQL.scalar.await(
            'SELECT COALESCE(MAX(ds.retail_price), 0) FROM dealership_stock ds WHERE ds.dealership_id = ? AND ds.sold_at IS NULL AND ds.delivered_at IS NOT NULL AND ds.delivered_at <= NOW()',
            { dealership.id }
        ) or 0
    end

    return {
        items = results or {},
        total = countResult or 0,
        page = page,
        pageSize = pageSize,
        classes = classes,
        maxRetailPrice = tonumber(highestPrice) or 0,
    }
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
        'SELECT COALESCE(SUM(quantity), 0) FROM dealership_stock WHERE dealership_id = ? AND sold_at IS NULL',
        { dealership.id }
    )

    if tonumber(currentCount or 0) >= stockCapacity then
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

    -- Check if we can stack onto an existing already-delivered stock entry (same model, not on display, not sold, new condition)
    local retailPrice = math.floor(wholesalePrice * 1.3)
    local existing = nil

    -- Only stack if the new order is instant delivery, otherwise it needs its own in-transit row
    if deliveredAt and deliveredAt <= os.date('%Y-%m-%d %H:%M:%S') then
        existing = MySQL.single.await(
            'SELECT id FROM dealership_stock WHERE dealership_id = ? AND vehicle_model = ? AND sold_at IS NULL AND display_spot IS NULL AND delivered_at IS NOT NULL AND delivered_at <= NOW() AND (`condition` = 100.00 OR `condition` IS NULL) LIMIT 1',
            { dealership.id, model }
        )
    end

    local stockId
    if existing then
        -- Increment quantity on existing delivered stack
        MySQL.update.await(
            'UPDATE dealership_stock SET quantity = quantity + 1 WHERE id = ?',
            { existing.id }
        )
        stockId = existing.id
    else
        -- Create new stock entry (in-transit orders always get their own row until delivered)
        stockId = MySQL.insert.await(
            'INSERT INTO dealership_stock (dealership_id, vehicle_model, vehicle_label, wholesale_cost, retail_price, ordered_at, delivered_at) VALUES (?, ?, ?, ?, ?, NOW(), ?)',
            { dealership.id, model, catalogEntry.label or model, wholesalePrice, retailPrice, deliveredAt }
        )
    end

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

        -- Assign the spot directly on the stock entry (no splitting)
        MySQL.update.await(
            'UPDATE dealership_stock SET display_spot = ? WHERE id = ?',
            { spot, stockId }
        )
    else
        MySQL.update.await(
            'UPDATE dealership_stock SET display_spot = NULL WHERE id = ?',
            { stockId }
        )
    end

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
--- Only triggers refresh when a vehicle actually transitions from in-transit to delivered
CreateThread(function()
    while true do
        Wait(60000)

        -- Find vehicles that were delivered in the last 65 seconds (with small overlap margin)
        local newlyDelivered = MySQL.query.await(
            'SELECT DISTINCT ds.dealership_id, d.location FROM dealership_stock ds JOIN dealerships d ON d.id = ds.dealership_id WHERE ds.sold_at IS NULL AND ds.delivered_at IS NOT NULL AND ds.delivered_at <= NOW() AND ds.delivered_at >= DATE_SUB(NOW(), INTERVAL 65 SECOND)',
            {}
        )

        if newlyDelivered then
            -- Consolidate newly delivered vehicles into existing stacks
            local toConsolidate = MySQL.query.await(
                'SELECT * FROM dealership_stock WHERE sold_at IS NULL AND display_spot IS NULL AND delivered_at IS NOT NULL AND delivered_at <= NOW() AND delivered_at >= DATE_SUB(NOW(), INTERVAL 65 SECOND) AND (`condition` = 100.00 OR `condition` IS NULL)',
                {}
            )
            if toConsolidate then
                for _, item in ipairs(toConsolidate) do
                    local target = MySQL.single.await(
                        'SELECT id FROM dealership_stock WHERE dealership_id = ? AND vehicle_model = ? AND sold_at IS NULL AND display_spot IS NULL AND delivered_at IS NOT NULL AND delivered_at <= NOW() AND (`condition` = 100.00 OR `condition` IS NULL) AND id != ? LIMIT 1',
                        { item.dealership_id, item.vehicle_model, item.id }
                    )
                    if target then
                        MySQL.update.await('UPDATE dealership_stock SET quantity = quantity + ? WHERE id = ?', { item.quantity or 1, target.id })
                        MySQL.update.await('DELETE FROM dealership_stock WHERE id = ?', { item.id })
                    end
                end
            end

            for _, row in ipairs(newlyDelivered) do
                TriggerClientEvent('pickle_dealerships:refreshDisplay', -1, row.location)
            end
        end
    end
end)
