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
        mode     = data.mode,
        type     = data.type,
    })
    if result and result.success then
        ShowNotification(result.message)
        cb({ success = true, dealershipId = result.dealershipId })
    else
        ShowNotification(result and result.message or "Failed to create dealership.")
        cb({ success = false, message = result and result.message or "Failed to create dealership." })
    end
end)

--- Start gizmo placement for a dealership position
--- The NUI closes, player places with gizmo, result is saved to server, NUI re-opens
RegisterNUICallback("adminStartGizmo", function(data, cb)
    -- Close the NUI so the player can use the gizmo
    CloseNui()

    local model = `prop_tennis_ball`
    local result = StartGizmoEditor({
        model = model,
        enableCancel = true,
        deleteEntity = true,
    })

    if result and result.position then
        local position = result.position
        local rotation = result.rotation

        -- Save position to the server
        local saveResult = lib.callback.await("pickle_dealerships:adminSavePosition", false, {
            dealershipId = data.dealershipId,
            field = data.field,
            pointType = data.pointType,
            value = {
                x = position.x,
                y = position.y,
                z = position.z,
                w = rotation and rotation.z or 0.0,
            },
        })

        -- Re-open admin panel in setup mode
        OpenNui('admin', {
            dealershipId = 0,
            dealershipName = 'Admin Panel',
            role = 'admin',
            tier = 4,
            setupDealershipId = data.dealershipId,
            metadata = saveResult and saveResult.metadata or nil,
        })

        cb(saveResult or { success = false })
    else
        -- Player cancelled — re-open UI
        OpenNui('admin', {
            dealershipId = 0,
            dealershipName = 'Admin Panel',
            role = 'admin',
            tier = 4,
            setupDealershipId = data.dealershipId,
        })

        cb({ success = false, message = "Placement cancelled." })
    end
end)

-- ─── Catalog Management NUI Callbacks ───────────────────────────────────────

RegisterNUICallback("adminGetCatalog", function(_, cb)
    local result = lib.callback.await("pickle_dealerships:adminGetCatalog", false)
    if result then
        cb({ success = true, catalog = result })
    else
        cb({ success = false, message = "Failed to fetch catalog." })
    end
end)

RegisterNUICallback("adminAddCatalogVehicle", function(data, cb)
    local result = lib.callback.await("pickle_dealerships:adminAddCatalogVehicle", false, data)
    if result and result.success then
        ShowNotification(result.message)
    else
        ShowNotification(result and result.message or "Failed to add vehicle.")
    end
    cb(result or { success = false })
end)

RegisterNUICallback("adminUpdateCatalogVehicle", function(data, cb)
    local result = lib.callback.await("pickle_dealerships:adminUpdateCatalogVehicle", false, data)
    if result and result.success then
        ShowNotification(result.message)
    else
        ShowNotification(result and result.message or "Failed to update vehicle.")
    end
    cb(result or { success = false })
end)

RegisterNUICallback("adminRemoveCatalogVehicle", function(data, cb)
    local result = lib.callback.await("pickle_dealerships:adminRemoveCatalogVehicle", false, data)
    if result and result.success then
        ShowNotification(result.message)
    else
        ShowNotification(result and result.message or "Failed to remove vehicle.")
    end
    cb(result or { success = false })
end)
