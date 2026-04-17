-- =============================================
--  pickle_dealerships | modules/sales/server.lua
--  Vehicle sales to players
-- =============================================

-- ─── Helpers ────────────────────────────────────────────────────────────────

local function GetStockItem(stockId)
    local rows = MySQL.query.await(
        "SELECT * FROM `dealership_stock` WHERE `id` = ? LIMIT 1",
        { tonumber(stockId) }
    )
    return rows and rows[1] or nil
end

local function ValidateCoupon(dealershipId, code, purchasePrice)
    if not code or code == "" then return nil end
    local rows = MySQL.query.await(
        "SELECT * FROM `dealership_coupons` WHERE `dealership_id` = ? AND `code` = ? LIMIT 1",
        { tonumber(dealershipId), tostring(code) }
    )
    local coupon = rows and rows[1] or nil
    if not coupon then return nil end
    if coupon.uses >= coupon.max_uses then return nil end
    if coupon.expires_at and os.time() > coupon.expires_at then return nil end
    if coupon.min_purchase > 0 and purchasePrice < coupon.min_purchase then return nil end

    local discount = 0
    if coupon.discount_type == "percent" then
        discount = math.floor(purchasePrice * (tonumber(coupon.discount_value) / 100))
    else
        discount = math.floor(tonumber(coupon.discount_value))
    end

    -- Increment uses
    MySQL.update("UPDATE `dealership_coupons` SET `uses` = `uses` + 1 WHERE `id` = ?", { coupon.id })

    return discount, coupon
end

local function MarkStockSold(stockId, identifier, soldBy)
    local stock = MySQL.single.await(
        "SELECT `quantity` FROM `dealership_stock` WHERE `id` = ?",
        { tonumber(stockId) }
    )
    if stock and stock.quantity > 1 then
        MySQL.update(
            "UPDATE `dealership_stock` SET `quantity` = `quantity` - 1 WHERE `id` = ?",
            { tonumber(stockId) }
        )
    else
        MySQL.update(
            "UPDATE `dealership_stock` SET `sold_at` = NOW(), `sold_to` = ?, `sold_by` = ? WHERE `id` = ?",
            { identifier, soldBy, tonumber(stockId) }
        )
    end
end

local function AddDealershipBalance(dealershipId, amount)
    MySQL.update.await(
        "UPDATE `dealerships` SET `balance` = `balance` + ? WHERE `id` = ?",
        { tonumber(amount), tonumber(dealershipId) }
    )
    -- Read fresh balance from DB to keep cache accurate
    local freshBalance = MySQL.scalar.await(
        "SELECT `balance` FROM `dealerships` WHERE `id` = ?",
        { tonumber(dealershipId) }
    )
    if freshBalance then
        UpdateDealershipCache(dealershipId, { balance = tonumber(freshBalance) })
    end
end

local function ProcessSale(source, dealershipId, stockItem, paymentMethod, couponCode, soldByCitizenid)
    local identifier = GetIdentifier(source)
    if not identifier then return false, "Could not identify player." end

    local price = stockItem.retail_price
    local discount = 0
    if couponCode and couponCode ~= "" then
        discount = ValidateCoupon(dealershipId, couponCode, price) or 0
    end
    local finalPrice = math.max(0, price - discount)

    -- Determine currency
    local currency = "money"
    if paymentMethod == "bank" then
        currency = "bank"
    end

    -- Check funds
    local playerMoney = GetMoney(source, currency)
    if playerMoney < finalPrice then
        return false, "Insufficient funds."
    end

    -- Deduct money
    RemoveMoney(source, finalPrice, currency)

    -- Mark stock as sold
    MarkStockSold(stockItem.id, identifier, soldByCitizenid)

    -- Calculate tax and net revenue
    local salesTax = math.floor(finalPrice * Config.SalesTax)
    local netRevenue = finalPrice - salesTax

    -- Add revenue to dealership balance
    AddDealershipBalance(dealershipId, netRevenue)

    -- Ledger: sale
    AddLedgerEntry(dealershipId, "sale", finalPrice, ("Vehicle sold: %s for %s"):format(stockItem.vehicle_label or stockItem.vehicle_model, GetCurrencyString(finalPrice)), identifier)

    -- Ledger: tax
    if salesTax > 0 then
        AddLedgerEntry(dealershipId, "tax", -salesTax, ("Sales tax on %s"):format(stockItem.vehicle_label or stockItem.vehicle_model), nil)
    end

    -- Commission
    if soldByCitizenid then
        -- Look up employee role, then get role-based commission from dealership metadata
        local empRows = MySQL.query.await(
            "SELECT `role`, `commission_rate` FROM `dealership_employees` WHERE `dealership_id` = ? AND `identifier` = ? LIMIT 1",
            { tonumber(dealershipId), soldByCitizenid }
        )
        local commissionRate = Config.DefaultCommission or 0.08
        if empRows and empRows[1] then
            local empRole = empRows[1].role or 'salesperson'
            -- Check dealership metadata for role-based commission rates
            local dealership = GetDealership(tonumber(dealershipId))
            local meta = dealership and dealership.metadata
            if type(meta) == "string" then meta = json.decode(meta) or {} end
            if type(meta) == "table" and meta.commissionRates and meta.commissionRates[empRole] then
                commissionRate = tonumber(meta.commissionRates[empRole]) / 100
            end
        end
        local commission = math.floor(finalPrice * commissionRate)
        if commission > 0 then
            -- Deduct commission from dealership balance
            AddDealershipBalance(dealershipId, -commission)

            -- Pay the salesperson
            local sellerSource = GetSourceFromIdentifier(soldByCitizenid)
            if sellerSource then
                AddMoney(sellerSource, commission, "bank")
            end

            AddLedgerEntry(dealershipId, "commission", -commission, ("Commission to salesperson for %s"):format(stockItem.vehicle_label or stockItem.vehicle_model), soldByCitizenid)
        end
    end

    -- Register vehicle with a single, authoritative plate
    local isUsed = stockItem.is_used == true or tonumber(stockItem.is_used) == 1
    local plate
    local props
    if isUsed and stockItem.plate and stockItem.plate ~= '' then
        plate = stockItem.plate
        props = stockItem.metadata
        if type(props) == 'string' then props = json.decode(props) or {} end
        if type(props) ~= 'table' then props = {} end
        props.plate = plate
    else
        plate = GeneratePlate()
        props = { plate = plate }
    end
    AddOwnedVehicleWithProps(source, stockItem.vehicle_model, plate, props)

    -- Notify
    ShowNotification(source, ("You purchased a %s for %s!"):format(stockItem.vehicle_label or stockItem.vehicle_model, GetCurrencyString(finalPrice)))

    debugPrint(("[Sales] Player %s purchased %s (stock #%d) for %s"):format(identifier, stockItem.vehicle_model, stockItem.id, GetCurrencyString(finalPrice)))

    return true, plate, finalPrice
end

-- ─── Callbacks ──────────────────────────────────────────────────────────────

lib.callback.register("pickle_dealerships:purchaseVehicle", function(source, data)
    local dealershipId = tonumber(data.dealershipId)
    local stockId = tonumber(data.stockId)
    local paymentMethod = data.paymentMethod or "cash"
    local couponCode = data.couponCode
    if not dealershipId or not stockId then
        return { success = false, message = "Invalid request." }
    end

    local dealership = GetDealership(dealershipId)
    if not dealership then
        return { success = false, message = "Dealership not found." }
    end

    local stockItem = GetStockItem(stockId)
    if not stockItem then
        return { success = false, message = "Vehicle not found in stock." }
    end
    if stockItem.dealership_id ~= dealershipId then
        return { success = false, message = "Vehicle does not belong to this dealership." }
    end
    if not stockItem.delivered_at then
        return { success = false, message = "Vehicle has not been delivered yet." }
    end
    if stockItem.sold_at then
        return { success = false, message = "Vehicle has already been sold." }
    end
    if stockItem.unlisted == 1 or stockItem.unlisted == true then
        return { success = false, message = "This vehicle is not available for purchase." }
    end

    local success, plate, finalPrice = ProcessSale(source, dealershipId, stockItem, paymentMethod, couponCode, nil)
    if not success then
        return { success = false, message = plate } -- plate holds error message on failure
    end

    return {
        success = true,
        plate = plate,
        price = finalPrice,
        model = stockItem.vehicle_model,
        label = stockItem.vehicle_label or stockItem.vehicle_model,
    }
end)

lib.callback.register("pickle_dealerships:employeeSale", function(source, data)
    local dealershipId = tonumber(data.dealershipId)
    local stockId = tonumber(data.stockId)
    local targetPlayerId = tonumber(data.targetPlayerId)
    local couponCode = data.couponCode
    if not dealershipId or not stockId or not targetPlayerId then
        return { success = false, message = "Invalid request." }
    end

    -- Verify the employee can sell
    if not CanPlayerSell(source, dealershipId) then
        return { success = false, message = "You do not have permission to sell vehicles." }
    end

    local dealership = GetDealership(dealershipId)
    if not dealership then
        return { success = false, message = "Dealership not found." }
    end

    local stockItem = GetStockItem(stockId)
    if not stockItem then
        return { success = false, message = "Vehicle not found in stock." }
    end
    if stockItem.dealership_id ~= dealershipId then
        return { success = false, message = "Vehicle does not belong to this dealership." }
    end
    if not stockItem.delivered_at then
        return { success = false, message = "Vehicle has not been delivered yet." }
    end
    if stockItem.sold_at then
        return { success = false, message = "Vehicle has already been sold." }
    end

    -- Verify target player exists
    local targetName = GetPlayerName(targetPlayerId)
    if not targetName then
        return { success = false, message = "Target player not found." }
    end

    local sellerCitizenid = GetIdentifier(source)

    -- Use custom price if provided, otherwise use retail price
    local salePrice = data.price and tonumber(data.price) or stockItem.retail_price
    if salePrice and salePrice ~= stockItem.retail_price then
        -- Update the retail price temporarily for this sale
        stockItem.retail_price = salePrice
    end

    -- Trigger confirmation on the target player's client
    TriggerClientEvent("pickle_dealerships:confirmPurchase", targetPlayerId, {
        dealershipId = dealershipId,
        stockId = stockId,
        model = stockItem.vehicle_model,
        label = stockItem.vehicle_label or stockItem.vehicle_model,
        price = stockItem.retail_price,
        couponCode = couponCode,
        soldBy = sellerCitizenid,
        sellerName = GetPlayerCharacterName(source),
    })

    return { success = true, message = "Purchase confirmation sent to customer." }
end)

-- Handle confirmed employee sale from the target player
lib.callback.register("pickle_dealerships:confirmEmployeeSale", function(source, data)
    local dealershipId = tonumber(data.dealershipId)
    local stockId = tonumber(data.stockId)
    local paymentMethod = data.paymentMethod or "bank"
    local couponCode = data.couponCode
    local soldBy = data.soldBy

    if not dealershipId or not stockId then
        return { success = false, message = "Invalid request." }
    end

    local stockItem = GetStockItem(stockId)
    if not stockItem then
        return { success = false, message = "Vehicle no longer available." }
    end
    if stockItem.sold_at then
        return { success = false, message = "Vehicle has already been sold." }
    end

    -- Override retail price if custom price was set
    if data.price then
        stockItem.retail_price = tonumber(data.price)
    end

    local success, plate, finalPrice = ProcessSale(source, dealershipId, stockItem, paymentMethod, couponCode, soldBy)
    if not success then
        return { success = false, message = plate }
    end

    return {
        success = true,
        plate = plate,
        price = finalPrice,
        model = stockItem.vehicle_model,
        label = stockItem.vehicle_label or stockItem.vehicle_model,
    }
end)

lib.callback.register("pickle_dealerships:getVehicleDetails", function(source, data)
    local stockId = tonumber(data.stockId)
    if not stockId then return nil end

    local stockItem = GetStockItem(stockId)
    if not stockItem then return nil end
    if stockItem.unlisted == 1 or stockItem.unlisted == true then return nil end

    -- Parse color JSON if stored as string
    local color = stockItem.color
    if color and type(color) == "string" then
        color = json.decode(color)
    end

    -- Pre-owned units store the full vehicle property blob in `metadata`
    local isUsed = stockItem.is_used == true or tonumber(stockItem.is_used) == 1
    local properties = nil
    if isUsed then
        properties = stockItem.metadata
        if properties and type(properties) == "string" then
            properties = json.decode(properties)
        end
    end

    return {
        id = stockItem.id,
        dealershipId = stockItem.dealership_id,
        model = stockItem.vehicle_model,
        label = stockItem.vehicle_label or stockItem.vehicle_model,
        price = stockItem.retail_price,
        wholesaleCost = stockItem.wholesale_cost,
        color = color,
        condition = stockItem.condition,
        displaySpot = stockItem.display_spot,
        delivered = stockItem.delivered_at ~= nil,
        sold = stockItem.sold_at ~= nil,
        soldTo = stockItem.sold_to,
        soldBy = stockItem.sold_by,
        orderedAt = stockItem.ordered_at,
        deliveredAt = stockItem.delivered_at,
        soldAt = stockItem.sold_at,
        isUsed = isUsed,
        plate = stockItem.plate,
        acquiredFrom = stockItem.acquired_from,
        properties = properties,
    }
end)

lib.callback.register("pickle_dealerships:getPickleFax", function(_, data)
    local stockId = tonumber(data and data.stockId)
    if not stockId then return nil end

    local stockItem = GetStockItem(stockId)
    if not stockItem then return nil end

    local isUsed = stockItem.is_used == true or tonumber(stockItem.is_used) == 1
    if not isUsed then return nil end

    local properties = stockItem.metadata
    if properties and type(properties) == "string" then
        properties = json.decode(properties)
    end

    return {
        id = stockItem.id,
        model = stockItem.vehicle_model,
        label = stockItem.vehicle_label or stockItem.vehicle_model,
        isUsed = true,
        condition = tonumber(stockItem.condition) or 0,
        plate = stockItem.plate,
        acquiredFrom = stockItem.acquired_from,
        orderedAt = stockItem.ordered_at,
        deliveredAt = stockItem.delivered_at,
        retailPrice = stockItem.retail_price,
        wholesaleCost = stockItem.wholesale_cost,
        properties = properties,
    }
end)
