RegisterNUICallback("getDealershipFinances", function(data, cb)
    local result = lib.callback.await("pickle_dealerships:getDealershipFinances", false, data.dealershipId)
    if result then
        cb({ success = true, data = result })
    else
        cb({ success = false, message = "Failed to fetch finances." })
    end
end)

RegisterNUICallback("withdrawFunds", function(data, cb)
    local result = lib.callback.await("pickle_dealerships:withdrawFunds", false, {
        dealershipId = data.dealershipId,
        amount       = data.amount,
    })
    if result and result.success then
        ShowNotification(result.message)
        cb({ success = true, newBalance = result.newBalance })
    else
        ShowNotification(result and result.message or "Withdrawal failed.")
        cb({ success = false, message = result and result.message or "Withdrawal failed." })
    end
end)

RegisterNUICallback("depositFunds", function(data, cb)
    local result = lib.callback.await("pickle_dealerships:depositFunds", false, {
        dealershipId = data.dealershipId,
        amount       = data.amount,
    })
    if result and result.success then
        ShowNotification(result.message)
        cb({ success = true, newBalance = result.newBalance })
    else
        ShowNotification(result and result.message or "Deposit failed.")
        cb({ success = false, message = result and result.message or "Deposit failed." })
    end
end)

RegisterNUICallback("upgradeTier", function(data, cb)
    local result = lib.callback.await("pickle_dealerships:upgradeTier", false, {
        dealershipId = data.dealershipId,
    })
    if result and result.success then
        ShowNotification(result.message)
        -- Refresh the UI with updated tier info
        SendNUIMessage({
            type    = "tierUpgraded",
            newTier = result.newTier,
            newBalance = result.newBalance,
        })
        cb({ success = true, newTier = result.newTier, newBalance = result.newBalance })
    else
        ShowNotification(result and result.message or "Upgrade failed.")
        cb({ success = false, message = result and result.message or "Upgrade failed." })
    end
end)

RegisterNUICallback("createCoupon", function(data, cb)
    local result = lib.callback.await("pickle_dealerships:createCoupon", false, {
        dealershipId  = data.dealershipId,
        code          = data.code,
        discountType  = data.discountType,
        discountValue = data.discountValue,
        maxUses       = data.maxUses,
        minPurchase   = data.minPurchase,
        vehicleFilter = data.vehicleFilter,
        expiresAt     = data.expiresAt,
    })
    if result and result.success then
        ShowNotification(result.message)
        cb({ success = true })
    else
        ShowNotification(result and result.message or "Failed to create coupon.")
        cb({ success = false, message = result and result.message or "Failed to create coupon." })
    end
end)

RegisterNUICallback("deleteCoupon", function(data, cb)
    local result = lib.callback.await("pickle_dealerships:deleteCoupon", false, {
        dealershipId = data.dealershipId,
        couponId     = data.couponId,
    })
    if result and result.success then
        ShowNotification(result.message)
        cb({ success = true })
    else
        ShowNotification(result and result.message or "Failed to delete coupon.")
        cb({ success = false, message = result and result.message or "Failed to delete coupon." })
    end
end)

RegisterNUICallback("getCoupons", function(data, cb)
    local result = lib.callback.await("pickle_dealerships:getCoupons", false, data.dealershipId)
    if result then
        cb({ success = true, coupons = result })
    else
        cb({ success = false, message = "Failed to fetch coupons." })
    end
end)

RegisterNUICallback("getCommissionRates", function(data, cb)
    local result = lib.callback.await("pickle_dealerships:getCommissionRates", false, data.dealershipId)
    if result then
        cb({ success = true, rates = result })
    else
        cb({ success = false, message = "Failed to fetch commission rates." })
    end
end)

RegisterNUICallback("setCommissionRates", function(data, cb)
    local result = lib.callback.await("pickle_dealerships:setCommissionRates", false, {
        dealershipId = data.dealershipId,
        salesperson  = data.salesperson,
        manager      = data.manager,
    })
    if result and result.success then
        ShowNotification(result.message)
        cb({ success = true })
    else
        ShowNotification(result and result.message or "Failed to update commission rates.")
        cb({ success = false, message = result and result.message or "Failed." })
    end
end)

RegisterNUICallback("getDashboardStats", function(data, cb)
    local result = lib.callback.await("pickle_dealerships:getDashboardStats", false, data.dealershipId)
    if result then
        cb({ success = true, data = result })
    else
        cb({ success = false, message = "Failed to fetch dashboard stats." })
    end
end)
