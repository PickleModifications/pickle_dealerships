local activeDeliveries = {}

--- Starts a delivery mission for pending stock items
---@param source number
---@param locationKey string
lib.callback.register('pickle_dealerships:startDelivery', function(source, locationKey)
    local identifier = GetIdentifier(source)
    if not identifier then return false, 'Unable to identify player.' end

    local dealership = MySQL.single.await(
        'SELECT * FROM dealerships WHERE location = ?',
        { locationKey }
    )
    if not dealership then return false, 'Dealership not found.' end

    local meta = dealership.metadata
    if type(meta) == "string" then meta = json.decode(meta) or {} end
    if type(meta) ~= "table" then meta = {} end
    local deliveryMode = (meta and meta.deliveryMode) or (Config.DealershipDefaults and Config.DealershipDefaults.deliveryMode) or 'timed'

    if deliveryMode ~= 'trucking' then
        return false, 'This dealership does not use trucking deliveries.'
    end
    if not dealership then return false, 'Dealership not found.' end

    -- Check player has a role at this dealership
    local isOwner = dealership.owner_identifier == identifier
    if not isOwner then
        local employee = MySQL.single.await(
            'SELECT role FROM dealership_employees WHERE dealership_id = ? AND identifier = ?',
            { dealership.id, identifier }
        )
        if not employee and not IsPlayerAdmin(source) then
            return false, 'You do not have permission to start deliveries.'
        end
    end

    -- Check if player already has an active delivery
    if activeDeliveries[source] then
        return false, 'You already have an active delivery mission.'
    end

    -- Get pending stock items (delivered_at IS NULL means awaiting delivery)
    local pendingStock = MySQL.query.await(
        'SELECT * FROM dealership_stock WHERE dealership_id = ? AND sold_at IS NULL AND delivered_at IS NULL',
        { dealership.id }
    )

    if not pendingStock or #pendingStock == 0 then
        return false, 'No pending deliveries.'
    end

    -- Select a delivery route
    local routes = Config.DeliveryRoutes
    local route = nil
    if routes and #routes > 0 then
        route = routes[math.random(#routes)]
    else
        return false, 'No delivery routes configured.'
    end

    -- Create delivery record
    local deliveryId = MySQL.insert.await(
        'INSERT INTO dealership_deliveries (dealership_id, identifier, status, route_id, created_at) VALUES (?, ?, ?, ?, NOW())',
        { dealership.id, identifier, 'in_progress', route.id }
    )

    -- Link pending stock items to this delivery
    local stockIds = {}
    for _, item in ipairs(pendingStock) do
        stockIds[#stockIds + 1] = item.id
    end

    for _, stockId in ipairs(stockIds) do
        MySQL.update.await(
            'UPDATE dealership_stock SET delivery_id = ? WHERE id = ?',
            { deliveryId, stockId }
        )
    end

    -- Track active delivery
    activeDeliveries[source] = {
        id = deliveryId,
        dealershipId = dealership.id,
        locationKey = locationKey,
        identifier = identifier,
        route = route,
        stockIds = stockIds,
        vehicles = pendingStock,
    }

    -- Notify the client to start the mission
    TriggerClientEvent('pickle_dealerships:startDeliveryMission', source, {
        deliveryId = deliveryId,
        locationKey = locationKey,
        route = route,
        vehicles = pendingStock,
        dealershipCoords = meta.coords and vector3(meta.coords.x, meta.coords.y, meta.coords.z) or nil,
    })

    ShowNotification(source, _L('delivery_mission_started_server', #pendingStock), 'success')
    return true, deliveryId
end)

--- Marks a delivery as complete
---@param source number
---@param deliveryId number
lib.callback.register('pickle_dealerships:completeDelivery', function(source, deliveryId)
    local delivery = activeDeliveries[source]
    if not delivery or delivery.id ~= deliveryId then
        return false, 'No matching active delivery found.'
    end

    -- Mark all stock items as delivered
    for _, stockId in ipairs(delivery.stockIds) do
        MySQL.update.await(
            'UPDATE dealership_stock SET delivered_at = NOW() WHERE id = ?',
            { stockId }
        )
    end

    -- Update delivery status
    MySQL.update.await(
        'UPDATE dealership_deliveries SET status = ?, completed_at = NOW() WHERE id = ?',
        { 'completed', deliveryId }
    )

    -- Add ledger entry for completed delivery
    MySQL.insert.await(
        'INSERT INTO dealership_ledger (dealership_id, type, amount, description, identifier, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
        { delivery.dealershipId, 'info', 0, 'Delivery completed: ' .. #delivery.stockIds .. ' vehicle(s)', delivery.identifier }
    )

    -- Clean up active delivery
    activeDeliveries[source] = nil

    -- Notify clients to refresh display
    TriggerClientEvent('pickle_dealerships:refreshDisplay', -1, delivery.locationKey)

    ShowNotification(source, _L('delivery_completed_server', #delivery.stockIds), 'success')
    return true
end)

--- Marks a delivery as failed, refunds partial wholesale cost
---@param source number
---@param deliveryId number
lib.callback.register('pickle_dealerships:failDelivery', function(source, deliveryId)
    local delivery = activeDeliveries[source]
    if not delivery or delivery.id ~= deliveryId then
        return false, 'No matching active delivery found.'
    end

    -- Calculate partial refund
    local refundRate = Config.DeliveryFailRefundRate or 0.5
    local totalRefund = 0

    for _, vehicle in ipairs(delivery.vehicles) do
        local refundAmount = math.floor((vehicle.wholesale_price or 0) * refundRate)
        totalRefund = totalRefund + refundAmount
    end

    -- Refund to dealership balance
    if totalRefund > 0 then
        MySQL.update.await(
            'UPDATE dealerships SET balance = balance + ? WHERE id = ?',
            { totalRefund, delivery.dealershipId }
        )
    end

    -- Remove the undelivered stock items
    for _, stockId in ipairs(delivery.stockIds) do
        MySQL.update.await(
            'DELETE FROM dealership_stock WHERE id = ? AND delivered_at IS NULL',
            { stockId }
        )
    end

    -- Update delivery status
    MySQL.update.await(
        'UPDATE dealership_deliveries SET status = ?, completed_at = NOW() WHERE id = ?',
        { 'failed', deliveryId }
    )

    -- Add ledger entry
    MySQL.insert.await(
        'INSERT INTO dealership_ledger (dealership_id, type, amount, description, identifier, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
        { delivery.dealershipId, 'refund', totalRefund, 'Delivery failed: partial refund', delivery.identifier }
    )

    -- Clean up
    activeDeliveries[source] = nil

    ShowNotification(source, _L('delivery_failed_server', GetCurrencyString(totalRefund)), 'error')
    return true
end)

--- Returns pending deliveries for a dealership
---@param source number
---@param locationKey string
lib.callback.register('pickle_dealerships:getPendingDeliveries', function(source, locationKey)
    local dealership = MySQL.single.await(
        'SELECT * FROM dealerships WHERE location = ?',
        { locationKey }
    )
    if not dealership then return {} end

    local pending = MySQL.query.await(
        'SELECT ds.* FROM dealership_stock ds WHERE ds.dealership_id = ? AND ds.sold_at IS NULL AND ds.delivered_at IS NULL',
        { dealership.id }
    )

    return pending or {}
end)

--- Returns route data from Config
---@param source number
---@param routeId number|string
lib.callback.register('pickle_dealerships:getDeliveryRoute', function(source, routeId)
    if not Config.DeliveryRoutes then return nil end

    for _, route in ipairs(Config.DeliveryRoutes) do
        if route.id == routeId then
            return route
        end
    end

    return nil
end)

--- Clean up active delivery when player drops
AddEventHandler('playerDropped', function()
    local src = source
    if activeDeliveries[src] then
        local delivery = activeDeliveries[src]

        -- Mark delivery as failed
        MySQL.update.await(
            'UPDATE dealership_deliveries SET status = ?, completed_at = NOW() WHERE id = ?',
            { 'failed', delivery.id }
        )

        -- Refund partial cost
        local refundRate = Config.DeliveryFailRefundRate or 0.5
        local totalRefund = 0
        for _, vehicle in ipairs(delivery.vehicles) do
            totalRefund = totalRefund + math.floor((vehicle.wholesale_price or 0) * refundRate)
        end

        if totalRefund > 0 then
            MySQL.update.await(
                'UPDATE dealerships SET balance = balance + ? WHERE id = ?',
                { totalRefund, delivery.dealershipId }
            )
        end

        -- Remove undelivered stock
        for _, stockId in ipairs(delivery.stockIds) do
            MySQL.update.await(
                'DELETE FROM dealership_stock WHERE id = ? AND delivered_at IS NULL',
                { stockId }
            )
        end

        activeDeliveries[src] = nil
    end
end)
