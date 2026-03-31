--- Open admin panel via net event (triggered by server command)
RegisterNetEvent("pickle_dealerships:openAdminPanel", function()
    OpenNui('admin', {
        dealershipId = 0,
        dealershipName = 'Admin Panel',
        role = 'admin',
        tier = 4,
    })
end)

--- Fetch all dealerships for admin view
RegisterNUICallback("adminGetAllDealerships", function(_, cb)
    local result = lib.callback.await("pickle_dealerships:adminGetAllDealerships", false)
    if result then
        cb({ success = true, dealerships = result })
    else
        ShowNotification("Failed to fetch dealerships or insufficient permissions.")
        cb({ success = false, message = "Failed to fetch dealerships." })
    end
end)

--- Transfer ownership of a dealership
RegisterNUICallback("adminTransferOwnership", function(data, cb)
    local result = lib.callback.await("pickle_dealerships:adminTransferOwnership", false, {
        dealershipId = data.dealershipId,
        newOwnerId   = data.newOwnerId,
    })
    if result and result.success then
        ShowNotification(result.message)
        cb({ success = true })
    else
        ShowNotification(result and result.message or "Transfer failed.")
        cb({ success = false, message = result and result.message or "Transfer failed." })
    end
end)

--- Set dealership balance
RegisterNUICallback("adminSetBalance", function(data, cb)
    local result = lib.callback.await("pickle_dealerships:adminSetBalance", false, {
        dealershipId = data.dealershipId,
        amount       = data.amount,
    })
    if result and result.success then
        ShowNotification(result.message)
        cb({ success = true, newBalance = result.newBalance })
    else
        ShowNotification(result and result.message or "Failed to set balance.")
        cb({ success = false, message = result and result.message or "Failed to set balance." })
    end
end)

--- Set dealership tier
RegisterNUICallback("adminSetTier", function(data, cb)
    local result = lib.callback.await("pickle_dealerships:adminSetTier", false, {
        dealershipId = data.dealershipId,
        tier         = data.tier,
    })
    if result and result.success then
        ShowNotification(result.message)
        cb({ success = true, newTier = result.newTier })
    else
        ShowNotification(result and result.message or "Failed to set tier.")
        cb({ success = false, message = result and result.message or "Failed to set tier." })
    end
end)

--- Reset dealership
RegisterNUICallback("adminResetDealership", function(data, cb)
    local result = lib.callback.await("pickle_dealerships:adminResetDealership", false, {
        dealershipId = data.dealershipId,
    })
    if result and result.success then
        ShowNotification(result.message)
        cb({ success = true })
    else
        ShowNotification(result and result.message or "Failed to reset dealership.")
        cb({ success = false, message = result and result.message or "Failed to reset dealership." })
    end
end)

--- Toggle dealership mode (public / player-owned)
RegisterNUICallback("adminToggleMode", function(data, cb)
    local result = lib.callback.await("pickle_dealerships:adminToggleMode", false, {
        dealershipId = data.dealershipId,
    })
    if result and result.success then
        ShowNotification(result.message)
        cb({ success = true, newMode = result.newMode })
    else
        ShowNotification(result and result.message or "Failed to toggle mode.")
        cb({ success = false, message = result and result.message or "Failed to toggle mode." })
    end
end)

--- Create a new dealership
RegisterNUICallback("adminCreateDealership", function(data, cb)
    local result = lib.callback.await("pickle_dealerships:adminCreateDealership", false, {
        label    = data.label,
        location = data.location,
        mode     = data.mode,
    })
    if result and result.success then
        ShowNotification(result.message)
        cb({ success = true, dealershipId = result.dealershipId })
    else
        ShowNotification(result and result.message or "Failed to create dealership.")
        cb({ success = false, message = result and result.message or "Failed to create dealership." })
    end
end)

--- Close admin panel (handled by main module's "close" callback)
