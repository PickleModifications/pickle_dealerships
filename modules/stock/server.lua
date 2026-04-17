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

    -- Process any orders that have arrived
    ProcessDeliveredOrders(dealership.id)

    local isManager = CanPlayerManage(source, dealership.id)
    local stockQuery = isManager
        and 'SELECT ds.*, wc.image, wc.class FROM dealership_stock ds LEFT JOIN wholesale_catalog wc ON wc.model = ds.vehicle_model WHERE ds.dealership_id = ? AND ds.sold_at IS NULL ORDER BY ds.ordered_at DESC'
        or  'SELECT ds.*, wc.image, wc.class FROM dealership_stock ds LEFT JOIN wholesale_catalog wc ON wc.model = ds.vehicle_model WHERE ds.dealership_id = ? AND ds.sold_at IS NULL AND ds.unlisted = 0 ORDER BY ds.ordered_at DESC'
    local stock = MySQL.query.await(stockQuery, { dealership.id }) or {}

    -- Also include pending orders, formatted like stock items so the UI can render them as in-transit cards
    local orders = MySQL.query.await(
        'SELECT dor.*, wc.image, wc.class FROM dealership_orders dor LEFT JOIN wholesale_catalog wc ON wc.model = dor.vehicle_model WHERE dor.dealership_id = ? ORDER BY dor.ordered_at DESC',
        { dealership.id }
    ) or {}

    -- Tag orders with a prefix ID so the UI can distinguish them (negative IDs to avoid collision)
    for _, o in ipairs(orders) do
        o.is_order = true
        o.is_used = 0
        o.id = -o.id -- negative ID so UI keys don't collide with real stock IDs
        o.sold_at = nil
        o.sold_to = nil
        o.sold_by = nil
        o.display_spot = nil
        stock[#stock + 1] = o
    end

    return stock
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

    -- Process any orders that have arrived
    ProcessDeliveredOrders(dealership.id)

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

    local where = 'ds.dealership_id = ? AND ds.sold_at IS NULL AND ds.unlisted = 0 AND ds.delivered_at IS NOT NULL AND ds.delivered_at <= NOW()'
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
            'SELECT DISTINCT wc.class FROM dealership_stock ds LEFT JOIN wholesale_catalog wc ON wc.model = ds.vehicle_model WHERE ds.dealership_id = ? AND ds.sold_at IS NULL AND ds.unlisted = 0 AND ds.delivered_at IS NOT NULL AND ds.delivered_at <= NOW() AND wc.class IS NOT NULL ORDER BY wc.class',
            { dealership.id }
        )
        if classRows then
            for _, row in ipairs(classRows) do
                classes[#classes + 1] = row.class
            end
        end

        highestPrice = MySQL.scalar.await(
            'SELECT COALESCE(MAX(ds.retail_price), 0) FROM dealership_stock ds WHERE ds.dealership_id = ? AND ds.sold_at IS NULL AND ds.unlisted = 0 AND ds.delivered_at IS NOT NULL AND ds.delivered_at <= NOW()',
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
lib.callback.register('pickle_dealerships:orderVehicle', function(source, locationKey, model, wholesalePrice, orderQuantity)
    -- Verify player role
    local identifier = GetIdentifier(source)
    if not identifier then return false, 'Unable to identify player.' end

    local dealership = MySQL.single.await(
        'SELECT * FROM dealerships WHERE location = ?',
        { locationKey }
    )
    if not dealership then return false, 'Dealership not found.' end

    -- Check role
    local isOwner = dealership.owner_identifier == identifier
    local employee = nil
    if not isOwner then
        employee = MySQL.single.await(
            'SELECT role FROM dealership_employees WHERE dealership_id = ? AND identifier = ?',
            { dealership.id, identifier }
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

    -- Finalize any delivered orders first so stock counts are accurate
    ProcessDeliveredOrders(dealership.id)

    -- Check stock capacity
    local tierCfg = Config.Tiers[dealership.tier or 1]
    local stockCapacity = (tierCfg and tierCfg.stockCap) or 20
    local stockCount = MySQL.scalar.await(
        'SELECT COALESCE(SUM(quantity), 0) FROM dealership_stock WHERE dealership_id = ? AND sold_at IS NULL',
        { dealership.id }
    ) or 0
    local pendingCount = MySQL.scalar.await(
        'SELECT COALESCE(SUM(quantity), 0) FROM dealership_orders WHERE dealership_id = ?',
        { dealership.id }
    ) or 0
    local currentCount = tonumber(stockCount) + tonumber(pendingCount)

    local qty = math.max(1, math.min(100, tonumber(orderQuantity) or 1))

    if tonumber(currentCount or 0) + qty > stockCapacity then
        return false, 'Stock capacity reached. Sell or remove vehicles first.'
    end

    -- Calculate total cost with import tax (multiplied by quantity)
    local importTax = Config.ImportTax or 0
    local unitCost = math.floor(wholesalePrice * (1 + importTax))
    local totalCost = unitCost * qty

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
        local deliveryMinutes = (Config.DeliveryTime or 20) * qty
        deliveredAt = os.date('%Y-%m-%d %H:%M:%S', os.time() + (deliveryMinutes * 60))
    end
    -- For 'trucking' mode, delivered_at stays NULL until delivery mission completes

    local retailPrice = math.floor(wholesalePrice * 1.3)
    local isInstant = deliveredAt and deliveredAt <= os.date('%Y-%m-%d %H:%M:%S')

    local stockId
    if isInstant then
        -- Instant delivery: stack onto existing available stock of this model, or create new stock entry
        local existing = MySQL.single.await(
            'SELECT id FROM dealership_stock WHERE dealership_id = ? AND vehicle_model = ? AND sold_at IS NULL AND display_spot IS NULL AND is_used = 0 AND (`condition` = 100.00 OR `condition` IS NULL) ORDER BY id ASC LIMIT 1',
            { dealership.id, model }
        )
        if existing then
            MySQL.update.await('UPDATE dealership_stock SET quantity = quantity + ? WHERE id = ?', { qty, existing.id })
            stockId = existing.id
        else
            stockId = MySQL.insert.await(
                'INSERT INTO dealership_stock (dealership_id, vehicle_model, vehicle_label, wholesale_cost, retail_price, ordered_at, delivered_at, quantity) VALUES (?, ?, ?, ?, ?, NOW(), NOW(), ?)',
                { dealership.id, model, catalogEntry.label or model, wholesalePrice, retailPrice, qty }
            )
        end
    else
        -- Timed delivery: stack onto an existing pending order or create a new one in dealership_orders
        local existingOrder = MySQL.single.await(
            'SELECT id FROM dealership_orders WHERE dealership_id = ? AND vehicle_model = ? AND (delivered_at IS NULL OR delivered_at > NOW()) ORDER BY id ASC LIMIT 1',
            { dealership.id, model }
        )
        if existingOrder then
            MySQL.update.await(
                'UPDATE dealership_orders SET quantity = quantity + ?, delivered_at = GREATEST(COALESCE(delivered_at, ?), ?) WHERE id = ?',
                { qty, deliveredAt, deliveredAt, existingOrder.id }
            )
            stockId = existingOrder.id
        else
            stockId = MySQL.insert.await(
                'INSERT INTO dealership_orders (dealership_id, vehicle_model, vehicle_label, wholesale_cost, retail_price, quantity, ordered_at, delivered_at) VALUES (?, ?, ?, ?, ?, ?, NOW(), ?)',
                { dealership.id, model, catalogEntry.label or model, wholesalePrice, retailPrice, qty, deliveredAt }
            )
        end
    end

    -- Create ledger entry
    MySQL.insert.await(
        'INSERT INTO dealership_ledger (dealership_id, type, amount, description, identifier, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
        { dealership.id, 'expense', -totalCost, 'Vehicle order: ' .. model .. ' x' .. qty, identifier }
    )

    ShowNotification(source, _L('stock_ordered_server', qty, model, GetCurrencyString(totalCost)))

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
    local identifier = GetIdentifier(source)
    if not identifier then return false, 'Unable to identify player.' end

    local dealership = MySQL.single.await(
        'SELECT * FROM dealerships WHERE location = ?',
        { locationKey }
    )
    if not dealership then return false, 'Dealership not found.' end

    -- Verify permission
    local isOwner = dealership.owner_identifier == identifier
    if not isOwner then
        local employee = MySQL.single.await(
            'SELECT role FROM dealership_employees WHERE dealership_id = ? AND identifier = ?',
            { dealership.id, identifier }
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

    ShowNotification(source, _L('stock_retail_price_updated', GetCurrencyString(retailPrice)), 'success')
    return true
end)

--- Owner/manager toggles the unlisted flag on a stock item
lib.callback.register('pickle_dealerships:toggleUnlisted', function(source, locationKey, stockId)
    local identifier = GetIdentifier(source)
    if not identifier then return false, 'Unable to identify player.' end

    local dealership = MySQL.single.await(
        'SELECT * FROM dealerships WHERE location = ?',
        { locationKey }
    )
    if not dealership then return false, 'Dealership not found.' end
    if not CanPlayerManage(source, dealership.id) then return false, 'You do not have permission.' end

    local stock = MySQL.single.await(
        'SELECT id, unlisted, vehicle_label, auction_id FROM dealership_stock WHERE id = ? AND dealership_id = ? AND sold_at IS NULL',
        { stockId, dealership.id }
    )
    if not stock then return false, 'Stock item not found.' end

    local newValue = (stock.unlisted == 1 or stock.unlisted == true) and 0 or 1

    -- If unlisting and the vehicle is at auction, cancel the auction (only if no bids)
    if newValue == 1 and stock.auction_id then
        local auction = MySQL.single.await(
            "SELECT id, current_bid, status FROM dealership_auctions WHERE id = ?",
            { stock.auction_id }
        )
        if auction and auction.status == 'active' then
            if auction.current_bid and auction.current_bid > 0 then
                return false, 'Cannot unlist while auction has active bids.'
            end
            MySQL.update.await(
                "UPDATE dealership_auctions SET status = 'cancelled', ended_at = NOW() WHERE id = ?",
                { stock.auction_id }
            )
            MySQL.update.await("UPDATE dealership_stock SET auction_id = NULL WHERE id = ?", { stockId })
        end
    end

    -- If unlisting, also remove from display spot
    if newValue == 1 then
        MySQL.update.await('UPDATE dealership_stock SET unlisted = 1, display_spot = NULL WHERE id = ?', { stockId })
    else
        MySQL.update.await('UPDATE dealership_stock SET unlisted = 0 WHERE id = ?', { stockId })
    end

    local statusKey = newValue == 1 and 'stock_unlisted' or 'stock_listed'
    ShowNotification(source, _L(statusKey, stock.vehicle_label or 'Vehicle'), 'success')
    return true, newValue == 1
end)

--- Assigns a stock item to a display spot (or removes from display)
---@param source number
---@param locationKey string
---@param stockId number
---@param spot number|nil
lib.callback.register('pickle_dealerships:setDisplaySpot', function(source, locationKey, stockId, spot)
    local identifier = GetIdentifier(source)
    if not identifier then return false, 'Unable to identify player.' end

    local dealership = MySQL.single.await(
        'SELECT * FROM dealerships WHERE location = ?',
        { locationKey }
    )
    if not dealership then return false, 'Dealership not found.' end

    -- Verify permission
    local isOwner = dealership.owner_identifier == identifier
    if not isOwner then
        local employee = MySQL.single.await(
            'SELECT role FROM dealership_employees WHERE dealership_id = ? AND identifier = ?',
            { dealership.id, identifier }
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
    if spot and (stock.unlisted == 1 or stock.unlisted == true) then return false, 'Cannot display an unlisted vehicle.' end

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

    ShowNotification(source, spot and _L('stock_display_spot_set', spot) or _L('stock_display_removed_server'), 'success')
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

--- Returns a wholesale MSRP suggestion + resolved model name for a vehicle by plate
lib.callback.register('pickle_dealerships:getTradeInSuggestion', function(source, locationKey, plate)
    if not plate then return nil end
    plate = string.upper(tostring(plate):gsub('^%s*(.-)%s*$', '%1'))

    local dealership = MySQL.single.await('SELECT id FROM dealerships WHERE location = ?', { locationKey })
    if not dealership then return nil end
    if not CanPlayerManage(source, dealership.id) then return nil end

    local owned = GetOwnedVehicleFromPlate(plate)
    if not owned then return { ownerless = true } end

    local model = owned.model
    if not model then
        return { model = nil, label = nil, wholesale = nil, owner = owned.owner }
    end

    local entry = MySQL.single.await('SELECT label, wholesale FROM wholesale_catalog WHERE model = ?', { model })
    return {
        model = model,
        label = (entry and entry.label) or model,
        wholesale = entry and tonumber(entry.wholesale) or nil,
        owner = owned.owner,
    }
end)

--- Quick lookup: is this plate registered to a player? (for client-side pre-flight checks)
lib.callback.register('pickle_dealerships:isPlateOwned', function(source, plate)
    if not plate then return false end
    plate = string.upper(tostring(plate):gsub('^%s*(.-)%s*$', '%1'))
    local owned = GetOwnedVehicleFromPlate(plate)
    return owned and owned.owner ~= nil
end)

--- Manager trades in a player vehicle as pre-owned stock
lib.callback.register('pickle_dealerships:tradeInVehicle', function(source, locationKey, payload)
    local identifier = GetIdentifier(source)
    if not identifier then return false, 'Unable to identify player.' end
    if type(payload) ~= 'table' then return false, 'Invalid payload.' end

    local plate = payload.plate and string.upper(tostring(payload.plate):gsub('^%s*(.-)%s*$', '%1')) or nil
    local properties = payload.properties
    local buyPrice = math.max(0, math.floor(tonumber(payload.buyPrice) or 0))
    local retailPrice = math.max(0, math.floor(tonumber(payload.retailPrice) or 0))

    if not plate or not properties then return false, 'Missing vehicle data.' end
    if buyPrice <= 0 or retailPrice <= 0 then return false, 'Buy and retail prices must be set.' end

    local dealership = MySQL.single.await('SELECT * FROM dealerships WHERE location = ?', { locationKey })
    if not dealership then return false, 'Dealership not found.' end
    if not CanPlayerManage(source, dealership.id) then return false, 'You do not have permission.' end

    -- Look up owner + model of the plate from the framework record (server-trusted)
    local owned = GetOwnedVehicleFromPlate(plate)
    if not owned or not owned.owner then return false, 'This vehicle is not registered to anyone.' end
    local sellerIdentifier = owned.owner
    local model = owned.model
    if not model then return false, 'Could not resolve vehicle model.' end

    -- Require consent from the online owner before taking their vehicle
    local sellerSource = GetSourceFromIdentifier(sellerIdentifier)
    if not sellerSource then
        return false, 'The vehicle owner is not online.'
    end

    local catalogLookup = MySQL.single.await('SELECT label FROM wholesale_catalog WHERE model = ?', { model })
    local displayLabel = (catalogLookup and catalogLookup.label) or model

    local consented = lib.callback.await('pickle_dealerships:confirmTradeIn', sellerSource, {
        dealershipName = dealership.name,
        label = displayLabel,
        plate = plate,
        buyPrice = buyPrice,
    })
    if not consented then
        return false, 'The owner declined the trade-in.'
    end

    -- Re-verify ownership after consent in case something changed during the prompt
    local recheck = GetOwnedVehicleFromPlate(plate)
    if not recheck or recheck.owner ~= sellerIdentifier then
        return false, 'Ownership changed before the trade-in completed.'
    end

    -- Block trade-in if vehicle is under active financing
    local activeFinancing = MySQL.scalar.await(
        "SELECT COUNT(*) FROM `dealership_financing` WHERE `vehicle_plate` = ? AND `status` = 'active'",
        { plate }
    )
    if activeFinancing and tonumber(activeFinancing) > 0 then
        return false, 'This vehicle is under active financing and cannot be traded in.'
    end

    -- Capacity check
    ProcessDeliveredOrders(dealership.id)
    local tierCfg = Config.Tiers[dealership.tier or 1]
    local stockCapacity = (tierCfg and tierCfg.stockCap) or 20
    local stockCount = MySQL.scalar.await(
        'SELECT COALESCE(SUM(quantity), 0) FROM dealership_stock WHERE dealership_id = ? AND sold_at IS NULL',
        { dealership.id }
    ) or 0
    local pendingCount = MySQL.scalar.await(
        'SELECT COALESCE(SUM(quantity), 0) FROM dealership_orders WHERE dealership_id = ?',
        { dealership.id }
    ) or 0
    if (tonumber(stockCount) + tonumber(pendingCount) + 1) > stockCapacity then
        return false, 'Stock capacity reached.'
    end

    -- Balance check
    if dealership.balance < buyPrice then
        return false, 'Insufficient dealership funds.'
    end

    -- Derive condition from health (0-1000 in props.bodyHealth/engineHealth → percent)
    local props = properties
    if type(props) == 'string' then props = json.decode(props) or {} end
    local body = tonumber(props.bodyHealth) or 1000
    local engine = tonumber(props.engineHealth) or 1000
    local condition = math.max(0, math.min(100, ((body + engine) / 2) / 10))

    local catalog = MySQL.single.await('SELECT label FROM wholesale_catalog WHERE model = ?', { model })
    local label = (catalog and catalog.label) or model

    -- Deduct from dealership balance
    MySQL.update.await('UPDATE dealerships SET balance = balance - ? WHERE id = ?', { buyPrice, dealership.id })

    -- Pay the seller (consent already confirmed above)
    AddMoney(sellerSource, buyPrice, 'bank')
    ShowNotification(sellerSource, _L('stock_trade_in_seller', label, GetCurrencyString(buyPrice)))

    -- Remove ownership from the seller's framework records
    RemoveOwnedVehicle(sellerIdentifier, plate)

    -- Insert pre-owned stock row (captured vehicle properties stored in metadata)
    local stockId = MySQL.insert.await(
        'INSERT INTO dealership_stock (dealership_id, vehicle_model, vehicle_label, wholesale_cost, retail_price, ordered_at, delivered_at, quantity, is_used, metadata, plate, acquired_from, `condition`) VALUES (?, ?, ?, ?, ?, NOW(), NOW(), 1, 1, ?, ?, ?, ?)',
        {
            dealership.id, model, label, buyPrice, retailPrice,
            json.encode(props), plate, sellerIdentifier, condition,
        }
    )

    AddLedgerEntry(dealership.id, 'expense', -buyPrice, 'Trade-in: ' .. label .. ' (' .. plate .. ')', identifier)

    ShowNotification(source, _L('stock_trade_in_buyer', label, GetCurrencyString(buyPrice)))
    TriggerClientEvent('pickle_dealerships:refreshDisplay', -1, locationKey)

    return true, stockId
end)

--- Returns seize-enabled dealerships that this player can manage
lib.callback.register('pickle_dealerships:getSeizeDealerships', function(source)
    local identifier = GetIdentifier(source)
    if not identifier then return {} end

    local dealerships = MySQL.query.await(
        'SELECT id, name, location FROM dealerships WHERE seize_enabled = 1'
    ) or {}

    local result = {}
    for _, d in ipairs(dealerships) do
        if CanPlayerManage(source, d.id) then
            result[#result + 1] = { id = d.id, name = d.name, location = d.location }
        end
    end
    return result
end)

--- Manager seizes a vehicle (no consent, no payment, unlisted by default)
lib.callback.register('pickle_dealerships:seizeVehicle', function(source, data)
    local identifier = GetIdentifier(source)
    if not identifier then return false, 'Unable to identify player.' end
    if type(data) ~= 'table' then return false, 'Invalid payload.' end

    local dealershipId = tonumber(data.dealershipId)
    local plate = data.plate and string.upper(tostring(data.plate):gsub('^%s*(.-)%s*$', '%1')) or nil
    local properties = data.properties

    if not dealershipId or not plate or not properties then return false, 'Missing data.' end

    local dealership = MySQL.single.await('SELECT * FROM dealerships WHERE id = ?', { dealershipId })
    if not dealership then return false, 'Dealership not found.' end
    if not dealership.seize_enabled or dealership.seize_enabled == 0 or dealership.seize_enabled == false then return false, 'Seize mode is not enabled for this dealership.' end
    if not CanPlayerManage(source, dealership.id) then return false, 'You do not have permission.' end

    -- Only player-owned vehicles can be seized. NPC / unregistered vehicles are rejected.
    local owned = GetOwnedVehicleFromPlate(plate)
    if not owned or not owned.owner then
        return false, 'Only player-owned vehicles can be seized.'
    end

    -- Prefer the framework-stored model name, but fall back to the client-supplied
    -- name (resolved from the entity hash) when the bridge doesn't persist the model.
    local model = owned.model
    if (not model or model == '') and data.modelName and data.modelName ~= '' then
        model = tostring(data.modelName):lower()
    end
    if not model then return false, 'Could not resolve vehicle model.' end

    -- Capacity check
    ProcessDeliveredOrders(dealership.id)
    local tierCfg = Config.Tiers[dealership.tier or 1]
    local stockCapacity = (tierCfg and tierCfg.stockCap) or 20
    local stockCount = MySQL.scalar.await(
        'SELECT COALESCE(SUM(quantity), 0) FROM dealership_stock WHERE dealership_id = ? AND sold_at IS NULL',
        { dealership.id }
    ) or 0
    local pendingCount = MySQL.scalar.await(
        'SELECT COALESCE(SUM(quantity), 0) FROM dealership_orders WHERE dealership_id = ?',
        { dealership.id }
    ) or 0
    if (tonumber(stockCount) + tonumber(pendingCount) + 1) > stockCapacity then
        return false, 'Stock capacity reached.'
    end

    -- Derive condition from health
    local props = properties
    if type(props) == 'string' then props = json.decode(props) or {} end
    local body = tonumber(props.bodyHealth) or 1000
    local engine = tonumber(props.engineHealth) or 1000
    local condition = math.max(0, math.min(100, ((body + engine) / 2) / 10))

    local catalog = MySQL.single.await('SELECT label FROM wholesale_catalog WHERE model = ?', { model })
    local label = (catalog and catalog.label) or (data.label and data.label ~= '' and data.label) or model

    -- Remove ownership if the vehicle is registered
    local previousOwner = nil
    if owned and owned.owner then
        previousOwner = owned.owner
        RemoveOwnedVehicle(owned.owner, plate)
    end

    -- Cancel any active financing on this vehicle (no refund — the player loses the vehicle)
    local activeLoan = MySQL.single.await(
        "SELECT id, identifier, dealership_id FROM dealership_financing WHERE vehicle_plate = ? AND status = 'active'",
        { plate }
    )
    if activeLoan then
        MySQL.update.await(
            "UPDATE dealership_financing SET status = 'repossessed' WHERE id = ?",
            { activeLoan.id }
        )
        AddLedgerEntry(activeLoan.dealership_id, "repossession", 0, ("Vehicle seized — financing cancelled: plate %s"):format(plate), activeLoan.identifier)
        local debtorSource = GetSourceFromIdentifier(activeLoan.identifier)
        if debtorSource then
            TriggerClientEvent("pickle_dealerships:vehicleRepossessed", debtorSource, {
                plate = plate,
                missedPayments = 0,
            })
        end
    end

    -- Insert as unlisted pre-owned stock (no cost to dealership)
    local stockId = MySQL.insert.await(
        'INSERT INTO dealership_stock (dealership_id, vehicle_model, vehicle_label, wholesale_cost, retail_price, ordered_at, delivered_at, quantity, is_used, unlisted, metadata, plate, acquired_from, `condition`) VALUES (?, ?, ?, 0, 0, NOW(), NOW(), 1, 1, 1, ?, ?, ?, ?)',
        {
            dealership.id, model, label,
            json.encode(props), plate, previousOwner or 'seized', condition,
        }
    )

    AddLedgerEntry(dealership.id, 'seize', 0, 'Seized: ' .. label .. ' (' .. plate .. ')' .. (previousOwner and (' from ' .. previousOwner) or ''), identifier)

    ShowNotification(source, _L('seize_success', label, plate))
    TriggerClientEvent('pickle_dealerships:refreshDisplay', -1, dealership.location)

    return true, stockId
end)

--- On-demand: process any delivered orders for a dealership
--- Moves delivered orders from dealership_orders into dealership_stock (stacking onto existing stock)
function ProcessDeliveredOrders(dealershipId)
    local completed = MySQL.query.await(
        'SELECT * FROM dealership_orders WHERE dealership_id = ? AND delivered_at IS NOT NULL AND delivered_at <= NOW()',
        { dealershipId }
    )
    if not completed or #completed == 0 then return false end

    for _, order in ipairs(completed) do
        -- Try to stack onto existing stock of the same model
        local existing = MySQL.single.await(
            'SELECT id FROM dealership_stock WHERE dealership_id = ? AND vehicle_model = ? AND sold_at IS NULL AND display_spot IS NULL AND is_used = 0 AND (`condition` = 100.00 OR `condition` IS NULL) ORDER BY id ASC LIMIT 1',
            { dealershipId, order.vehicle_model }
        )
        if existing then
            MySQL.update.await('UPDATE dealership_stock SET quantity = quantity + ? WHERE id = ?', { order.quantity, existing.id })
        else
            local orderedAtSql
            if type(order.ordered_at) == 'number' then
                orderedAtSql = os.date('%Y-%m-%d %H:%M:%S', math.floor(order.ordered_at / 1000))
            elseif type(order.ordered_at) == 'string' and order.ordered_at ~= '' then
                orderedAtSql = order.ordered_at
            else
                orderedAtSql = os.date('%Y-%m-%d %H:%M:%S')
            end
            MySQL.insert.await(
                'INSERT INTO dealership_stock (dealership_id, vehicle_model, vehicle_label, wholesale_cost, retail_price, ordered_at, delivered_at, quantity) VALUES (?, ?, ?, ?, ?, ?, NOW(), ?)',
                { dealershipId, order.vehicle_model, order.vehicle_label, order.wholesale_cost, order.retail_price, orderedAtSql, order.quantity }
            )
        end
        MySQL.update.await('DELETE FROM dealership_orders WHERE id = ?', { order.id })
    end

    return true
end
