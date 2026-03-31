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

local function MarkStockSold(stockId, citizenid, soldBy)
    MySQL.update(
        "UPDATE `dealership_stock` SET `sold_at` = NOW(), `sold_to` = ?, `sold_by` = ? WHERE `id` = ?",
        { citizenid, soldBy, tonumber(stockId) }
    )
end

local function AddDealershipBalance(dealershipId, amount)
    MySQL.update(
        "UPDATE `dealerships` SET `balance` = `balance` + ? WHERE `id` = ?",
        { tonumber(amount), tonumber(dealershipId) }
    )
    local dealership = GetDealership(dealershipId)
    if dealership then
        UpdateDealershipCache(dealershipId, { balance = dealership.balance + amount })
    end
end

local function ProcessSale(source, dealershipId, stockItem, paymentMethod, couponCode, soldByCitizenid)
    local citizenid = GetIdentifier(source)
    if not citizenid then return false, "Could not identify player." end

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
    MarkStockSold(stockItem.id, citizenid, soldByCitizenid)

    -- Calculate tax and net revenue
    local salesTax = math.floor(finalPrice * Config.SalesTax)
    local netRevenue = finalPrice - salesTax

    -- Add revenue to dealership balance
    AddDealershipBalance(dealershipId, netRevenue)

    -- Ledger: sale
    AddLedgerEntry(dealershipId, "sale", finalPrice, ("Vehicle sold: %s for %s"):format(stockItem.vehicle_label or stockItem.vehicle_model, GetCurrencyString(finalPrice)), citizenid)

    -- Ledger: tax
    if salesTax > 0 then
        AddLedgerEntry(dealershipId, "tax", -salesTax, ("Sales tax on %s"):format(stockItem.vehicle_label or stockItem.vehicle_model), nil)
    end

    -- Commission
    if soldByCitizenid then
        local empRows = MySQL.query.await(
            "SELECT `commission_rate` FROM `dealership_employees` WHERE `dealership_id` = ? AND `citizenid` = ? LIMIT 1",
            { tonumber(dealershipId), soldByCitizenid }
        )
        local commissionRate = Config.DefaultCommission
        if empRows and empRows[1] and tonumber(empRows[1].commission_rate) > 0 then
            commissionRate = tonumber(empRows[1].commission_rate) / 100
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

    -- Generate plate and register vehicle
    local plate = GeneratePlate()
    AddOwnedVehicle(source, stockItem.vehicle_model)

    -- Notify
    ShowNotification(source, ("You purchased a %s for %s!"):format(stockItem.vehicle_label or stockItem.vehicle_model, GetCurrencyString(finalPrice)))

    debugPrint(("[Sales] Player %s purchased %s (stock #%d) for %s"):format(citizenid, stockItem.vehicle_model, stockItem.id, GetCurrencyString(finalPrice)))

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

    -- Parse color JSON if stored as string
    local color = stockItem.color
    if color and type(color) == "string" then
        color = json.decode(color)
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
    }
end)
