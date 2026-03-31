--- Get dealership financial overview
lib.callback.register("pickle_dealerships:getDealershipFinances", function(source, dealershipId)
    if not CanPlayerManage(source, dealershipId) then
        return nil
    end

    local dealership = GetDealership(dealershipId)
    if not dealership then return nil end

    -- Fetch last 50 ledger entries
    local ledger = MySQL.query.await("SELECT * FROM dealership_ledger WHERE dealership_id = ? ORDER BY created_at DESC LIMIT 50", { dealershipId })

    -- Revenue stats
    local stats = MySQL.query.await([[
        SELECT
            COALESCE(SUM(CASE WHEN type LIKE '%sale%' THEN amount ELSE 0 END), 0) AS total_sales,
            COALESCE(SUM(CASE WHEN type LIKE '%expense%' OR type = 'withdrawal' OR type = 'stock_purchase' THEN amount ELSE 0 END), 0) AS total_expenses
        FROM dealership_ledger
        WHERE dealership_id = ?
    ]], { dealershipId })

    local totalSales = stats[1] and stats[1].total_sales or 0
    local totalExpenses = stats[1] and stats[1].total_expenses or 0

    return {
        balance       = dealership.balance or 0,
        ledger        = ledger or {},
        totalSales    = totalSales,
        totalExpenses = totalExpenses,
        profit        = totalSales - totalExpenses,
    }
end)

--- Withdraw funds from dealership to personal bank
lib.callback.register("pickle_dealerships:withdrawFunds", function(source, data)
    local dealershipId = data.dealershipId
    local amount = tonumber(data.amount)

    if not amount or amount <= 0 then
        return { success = false, message = "Invalid amount." }
    end

    if not CanPlayerManage(source, dealershipId) then
        return { success = false, message = "You do not have permission to withdraw funds." }
    end

    local dealership = GetDealership(dealershipId)
    if not dealership then
        return { success = false, message = "Dealership not found." }
    end

    local minBalance = Config.Management and Config.Management.minimumBalance or 0
    if (dealership.balance - amount) < minBalance then
        return { success = false, message = "Withdrawal would put the balance below the minimum (" .. GetCurrencyString(minBalance) .. ")." }
    end

    if amount > dealership.balance then
        return { success = false, message = "Insufficient dealership funds." }
    end

    -- Deduct from dealership
    local newBalance = dealership.balance - amount
    MySQL.update.await("UPDATE dealerships SET balance = ? WHERE id = ?", { newBalance, dealershipId })
    UpdateDealershipCache(dealershipId, { balance = newBalance })

    -- Add to player bank
    AddMoney(source, "bank", amount)

    local identifier = GetIdentifier(source)
    local playerName = GetPlayerCharacterName(source) or "Unknown"
    AddLedgerEntry(dealershipId, "withdrawal", amount, "Withdrawal by " .. playerName, identifier)

    -- Webhook for large withdrawals
    local webhookThreshold = Config.Management and Config.Management.largeWithdrawalThreshold or 100000
    if amount >= webhookThreshold and Config.Webhooks and Config.Webhooks.management then
        PerformHttpRequest(Config.Webhooks.management, function() end, "POST", json.encode({
            embeds = {{
                title = "Large Withdrawal",
                description = string.format("%s withdrew %s from dealership #%d", playerName, GetCurrencyString(amount), dealershipId),
                color = 16711680,
            }}
        }), { ["Content-Type"] = "application/json" })
    end

    return { success = true, newBalance = newBalance, message = "Successfully withdrew " .. GetCurrencyString(amount) .. "." }
end)

--- Deposit funds into dealership balance
lib.callback.register("pickle_dealerships:depositFunds", function(source, data)
    local dealershipId = data.dealershipId
    local amount = tonumber(data.amount)

    if not amount or amount <= 0 then
        return { success = false, message = "Invalid amount." }
    end

    if not CanPlayerManage(source, dealershipId) then
        return { success = false, message = "You do not have permission to deposit funds." }
    end

    local dealership = GetDealership(dealershipId)
    if not dealership then
        return { success = false, message = "Dealership not found." }
    end

    -- Check player has enough cash
    local playerCash = GetMoney(source, "cash")
    if playerCash < amount then
        return { success = false, message = "You don't have enough cash." }
    end

    RemoveMoney(source, "cash", amount)

    local newBalance = (dealership.balance or 0) + amount
    MySQL.update.await("UPDATE dealerships SET balance = ? WHERE id = ?", { newBalance, dealershipId })
    UpdateDealershipCache(dealershipId, { balance = newBalance })

    local identifier = GetIdentifier(source)
    local playerName = GetPlayerCharacterName(source) or "Unknown"
    AddLedgerEntry(dealershipId, "deposit", amount, "Deposit by " .. playerName, identifier)

    return { success = true, newBalance = newBalance, message = "Successfully deposited " .. GetCurrencyString(amount) .. "." }
end)

--- Upgrade dealership tier
lib.callback.register("pickle_dealerships:upgradeTier", function(source, data)
    local dealershipId = data.dealershipId

    if not CanPlayerManage(source, dealershipId) then
        return { success = false, message = "You do not have permission to upgrade this dealership." }
    end

    local dealership = GetDealership(dealershipId)
    if not dealership then
        return { success = false, message = "Dealership not found." }
    end

    local currentTier = dealership.tier or 1
    if currentTier >= 4 then
        return { success = false, message = "Dealership is already at maximum tier." }
    end

    local upgradeCosts = Config.TierUpgradeCosts or { [1] = 50000, [2] = 150000, [3] = 500000 }
    local cost = upgradeCosts[currentTier]
    if not cost then
        return { success = false, message = "No upgrade cost defined for this tier." }
    end

    if (dealership.balance or 0) < cost then
        return { success = false, message = "Insufficient dealership funds. Need " .. GetCurrencyString(cost) .. "." }
    end

    local newBalance = dealership.balance - cost
    local newTier = currentTier + 1

    MySQL.update.await("UPDATE dealerships SET balance = ?, tier = ? WHERE id = ?", { newBalance, newTier, dealershipId })
    UpdateDealershipCache(dealershipId, { balance = newBalance, tier = newTier })

    local identifier = GetIdentifier(source)
    local playerName = GetPlayerCharacterName(source) or "Unknown"
    AddLedgerEntry(dealershipId, "expense", cost, "Tier upgrade to " .. newTier .. " by " .. playerName, identifier)

    return { success = true, newTier = newTier, newBalance = newBalance, message = "Dealership upgraded to Tier " .. newTier .. "!" }
end)

--- Create a coupon
lib.callback.register("pickle_dealerships:createCoupon", function(source, data)
    local dealershipId = data.dealershipId

    if not CanPlayerManage(source, dealershipId) then
        return { success = false, message = "You do not have permission to create coupons." }
    end

    if not data.code or data.code == "" then
        return { success = false, message = "Coupon code is required." }
    end

    -- Check for duplicate code
    local existing = MySQL.scalar.await("SELECT id FROM dealership_coupons WHERE dealership_id = ? AND code = ?", { dealershipId, toupper(data.code) })
    if existing then
        return { success = false, message = "A coupon with that code already exists." }
    end

    MySQL.insert.await("INSERT INTO dealership_coupons (dealership_id, code, discount_type, discount_value, max_uses, uses, min_purchase, vehicle_filter, expires_at, created_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, NOW())", {
        dealershipId,
        toupper(data.code),
        data.discountType or "percentage",
        tonumber(data.discountValue) or 0,
        tonumber(data.maxUses) or 0,
        tonumber(data.minPurchase) or 0,
        data.vehicleFilter and json.encode(data.vehicleFilter) or nil,
        data.expiresAt or nil,
    })

    return { success = true, message = "Coupon created successfully." }
end)

--- Delete a coupon
lib.callback.register("pickle_dealerships:deleteCoupon", function(source, data)
    local dealershipId = data.dealershipId
    local couponId = data.couponId

    if not CanPlayerManage(source, dealershipId) then
        return { success = false, message = "You do not have permission to delete coupons." }
    end

    local affected = MySQL.update.await("DELETE FROM dealership_coupons WHERE id = ? AND dealership_id = ?", { couponId, dealershipId })
    if affected and affected > 0 then
        return { success = true, message = "Coupon deleted." }
    else
        return { success = false, message = "Coupon not found." }
    end
end)

--- Get all coupons for a dealership
lib.callback.register("pickle_dealerships:getCoupons", function(source, dealershipId)
    if not CanPlayerManage(source, dealershipId) then
        return nil
    end

    local coupons = MySQL.query.await("SELECT * FROM dealership_coupons WHERE dealership_id = ? ORDER BY created_at DESC", { dealershipId })
    return coupons or {}
end)

--- Validate a coupon code for a specific purchase
lib.callback.register("pickle_dealerships:validateCoupon", function(source, data)
    local dealershipId = data.dealershipId
    local code = toupper(data.code or "")
    local purchaseAmount = tonumber(data.purchaseAmount) or 0
    local vehicleModel = data.vehicleModel

    local coupon = MySQL.query.await("SELECT * FROM dealership_coupons WHERE dealership_id = ? AND code = ? LIMIT 1", { dealershipId, code })
    if not coupon or #coupon == 0 then
        return { valid = false, message = "Invalid coupon code." }
    end

    coupon = coupon[1]

    -- Check expiry
    if coupon.expires_at and os.time() > coupon.expires_at then
        return { valid = false, message = "This coupon has expired." }
    end

    -- Check max uses
    if coupon.max_uses > 0 and coupon.uses >= coupon.max_uses then
        return { valid = false, message = "This coupon has reached its maximum uses." }
    end

    -- Check minimum purchase
    if coupon.min_purchase and purchaseAmount < coupon.min_purchase then
        return { valid = false, message = "Minimum purchase of " .. GetCurrencyString(coupon.min_purchase) .. " required." }
    end

    -- Check vehicle filter
    if coupon.vehicle_filter and coupon.vehicle_filter ~= "" then
        local filter = json.decode(coupon.vehicle_filter)
        if filter and vehicleModel then
            local allowed = false
            for _, model in ipairs(filter) do
                if tolower(model) == tolower(vehicleModel) then
                    allowed = true
                    break
                end
            end
            if not allowed then
                return { valid = false, message = "This coupon is not valid for this vehicle." }
            end
        end
    end

    -- Calculate discount
    local discount = 0
    if coupon.discount_type == "percentage" then
        discount = math.floor(purchaseAmount * (coupon.discount_value / 100))
    elseif coupon.discount_type == "flat" then
        discount = math.min(coupon.discount_value, purchaseAmount)
    end

    return {
        valid        = true,
        couponId     = coupon.id,
        discountType = coupon.discount_type,
        discountValue = coupon.discount_value,
        discount     = discount,
        message      = "Coupon applied! Discount: " .. GetCurrencyString(discount),
    }
end)

--- Get comprehensive dashboard stats
lib.callback.register("pickle_dealerships:getDashboardStats", function(source, dealershipId)
    if not CanPlayerManage(source, dealershipId) then
        return nil
    end

    -- Total sales count
    local salesCount = MySQL.scalar.await("SELECT COUNT(*) FROM dealership_sales WHERE dealership_id = ?", { dealershipId }) or 0

    -- Revenue by day (last 7 days)
    local revenueByDay = MySQL.query.await([[
        SELECT DATE(created_at) AS sale_date, SUM(sale_price) AS revenue, COUNT(*) AS count
        FROM dealership_sales
        WHERE dealership_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        GROUP BY DATE(created_at)
        ORDER BY sale_date ASC
    ]], { dealershipId }) or {}

    -- Top selling vehicles
    local topVehicles = MySQL.query.await([[
        SELECT s.vehicle_model, COUNT(*) AS sold, SUM(s.sale_price) AS total_revenue
        FROM dealership_sales s
        WHERE s.dealership_id = ?
        GROUP BY s.vehicle_model
        ORDER BY sold DESC
        LIMIT 10
    ]], { dealershipId }) or {}

    -- Employee performance rankings
    local employeePerformance = MySQL.query.await([[
        SELECT s.seller_id, COUNT(*) AS sales_count, SUM(s.sale_price) AS total_revenue
        FROM dealership_sales s
        WHERE s.dealership_id = ?
        GROUP BY s.seller_id
        ORDER BY total_revenue DESC
        LIMIT 10
    ]], { dealershipId }) or {}

    return {
        totalSales          = salesCount,
        revenueByDay        = revenueByDay,
        topVehicles         = topVehicles,
        employeePerformance = employeePerformance,
    }
end)
