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

    local isDisplaySpot = data.field == "displaySpot"
    local model = isDisplaySpot and `xm_prop_lab_barrier02` or `prop_tennis_ball`
    local result = StartGizmoEditor({
        model = model,
        enableCancel = true,
        deleteEntity = true,
        coordsOffset = isDisplaySpot and vector3(0.0, 0.0, -0.03) or nil,
        rotationOffset = isDisplaySpot and vector3(90.0, 0.0, 0.0) or nil,
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

        -- Re-open admin panel on the positions tab
        OpenNui('admin', {
            dealershipId = 0,
            dealershipName = 'Admin Panel',
            role = 'admin',
            tier = 4,
            positionsDealershipId = data.dealershipId,
            metadata = saveResult and saveResult.metadata or nil,
            scrollToSpots = data.field == "displaySpot",
        })

        cb(saveResult or { success = false })
    else
        -- Player cancelled — re-open UI
        OpenNui('admin', {
            dealershipId = 0,
            dealershipName = 'Admin Panel',
            role = 'admin',
            tier = 4,
            positionsDealershipId = data.dealershipId,
        })

        cb({ success = false, message = "Placement cancelled." })
    end
end)

RegisterNUICallback("adminRemovePosition", function(data, cb)
    local result = lib.callback.await("pickle_dealerships:adminRemovePosition", false, data)
    if result and result.success then
        ShowNotification(result.message)
    else
        ShowNotification(result and result.message or "Failed to remove position.")
    end
    cb(result or { success = false })
end)

RegisterNUICallback("adminSetJob", function(data, cb)
    local result = lib.callback.await("pickle_dealerships:adminSetJob", false, data)
    if result and result.success then
        ShowNotification(result.message)
    else
        ShowNotification(result and result.message or "Failed to set job.")
    end
    cb(result or { success = false })
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

-- ─── Photo Booth ────────────────────────────────────────────────────────────

local PhotoBoothState = nil

local function UpdatePhotoBoothCamera()
    if not PhotoBoothState then return end
    local s = PhotoBoothState
    local rad = math.rad(s.angle)
    local camX = s.center.x + s.radius * math.cos(rad)
    local camY = s.center.y + s.radius * math.sin(rad)
    local camZ = s.center.z + s.camHeight
    SetCamCoord(s.cam, camX, camY, camZ)
    PointCamAtCoord(s.cam, s.center.x, s.center.y, s.camLookZ or (s.center.z + 0.5))
end

local function CleanupPhotoBooth()
    if not PhotoBoothState then return end

    -- Delete vehicle
    if DoesEntityExist(PhotoBoothState.vehicle) then
        DeleteEntity(PhotoBoothState.vehicle)
    end

    -- Destroy camera
    RenderScriptCams(false, false, 0, true, true)
    if PhotoBoothState.cam then
        DestroyCam(PhotoBoothState.cam, false)
    end

    -- Restore player
    local ped = PlayerPedId()
    FreezeEntityPosition(ped, false)
    SetEntityVisible(ped, true, false)
    SetEntityCoords(ped, PhotoBoothState.savedCoords.x, PhotoBoothState.savedCoords.y, PhotoBoothState.savedCoords.z, false, false, false, true)
    SetEntityHeading(ped, PhotoBoothState.savedHeading)

    -- Restore routing bucket
    lib.callback.await("pickle_dealerships:adminSetPhotoBucket", false, { bucket = 0 })

    -- Restore HUD
    DisplayRadar(true)
    DisplayHud(true)

    -- Clear weather override
    ClearWeatherTypePersist()
    ClearOverrideWeather()

    PhotoBoothState = nil

    -- Close current NUI state before reopening admin panel
    CloseNui()

    -- Reopen admin panel
    OpenNui('admin', {
        dealershipId = 0,
        dealershipName = 'Admin Panel',
        role = 'admin',
        tier = 4,
    })
end

RegisterNUICallback("adminStartPhotoCapture", function(data, cb)
    CloseNui()
    cb({ success = true })

    local ped = PlayerPedId()
    local savedCoords = GetEntityCoords(ped)
    local savedHeading = GetEntityHeading(ped)

    -- Pick the right photo booth location based on vehicle class
    local vehicleClass = data.class or ''
    local location = nil
    local fallback = nil
    for _, loc in ipairs(Config.PhotoBooth.locations) do
        if not loc.classes or #loc.classes == 0 then
            fallback = loc
        else
            for _, cls in ipairs(loc.classes) do
                if cls == vehicleClass then
                    location = loc
                    break
                end
            end
        end
        if location then break end
    end
    location = location or fallback or Config.PhotoBooth.locations[1]

    -- Move to isolated routing bucket
    lib.callback.await("pickle_dealerships:adminSetPhotoBucket", false, { bucket = Config.PhotoBooth.routingBucket })

    -- Teleport to photo booth
    local boothCoords = location.coords
    SetEntityCoords(ped, boothCoords.x, boothCoords.y, boothCoords.z, false, false, false, true)
    FreezeEntityPosition(ped, true)
    SetEntityVisible(ped, false, false)

    -- Spawn vehicle
    local modelHash = joaat(data.model)
    RequestModel(modelHash)
    while not HasModelLoaded(modelHash) do Wait(0) end
    local vehCoords = vector3(boothCoords.x, boothCoords.y, boothCoords.z)
    local vehHeading = boothCoords.w or 0.0
    local veh = CreateVehicle(modelHash, vehCoords.x, vehCoords.y, vehCoords.z, vehHeading, false, false)
    SetEntityHeading(veh, vehHeading)
    FreezeEntityPosition(veh, true)
    SetVehicleOnGroundProperly(veh)
    SetModelAsNoLongerNeeded(modelHash)

    -- Set consistent weather/time
    SetWeatherTypeNowPersist('EXTRASUNNY')
    NetworkOverrideClockTime(12, 0, 0)

    -- Hide HUD
    DisplayRadar(false)
    DisplayHud(false)

    -- Scale camera distance based on vehicle dimensions
    local dimMin, dimMax = GetModelDimensions(modelHash)
    local vehLength = dimMax.y - dimMin.y
    local vehWidth = dimMax.x - dimMin.x
    local vehHeight = dimMax.z - dimMin.z
    local vehSize = math.max(vehLength, vehWidth, vehHeight)
    local sizeScale = vehSize / 5.0 -- normalize: ~5m is a standard sedan

    local baseCamRadius = location.camRadius or 6.0
    local baseCamHeight = location.camHeight or 2.0
    local camRadius = baseCamRadius * math.max(0.8, sizeScale)
    local camHeight = baseCamHeight * math.max(0.8, sizeScale)
    local camLookZ = boothCoords.z + (vehHeight * 0.4)

    -- Create orbital camera
    local angle = 225.0
    local rad = math.rad(angle)
    local camX = boothCoords.x + camRadius * math.cos(rad)
    local camY = boothCoords.y + camRadius * math.sin(rad)
    local camZ = boothCoords.z + camHeight
    local cam = CreateCam("DEFAULT_SCRIPTED_CAMERA", true)
    SetCamCoord(cam, camX, camY, camZ)
    PointCamAtCoord(cam, boothCoords.x, boothCoords.y, camLookZ)
    SetCamActive(cam, true)
    RenderScriptCams(true, false, 0, true, true)

    -- Store state
    PhotoBoothState = {
        vehicle = veh,
        cam = cam,
        angle = angle,
        radius = camRadius,
        camHeight = camHeight,
        camLookZ = camLookZ,
        sizeScale = math.max(0.8, sizeScale),
        center = boothCoords,
        savedCoords = savedCoords,
        savedHeading = savedHeading,
        catalogId = data.catalogId,
        model = data.model,
        label = data.label or data.model,
    }

    -- Open photo booth UI
    Wait(200)
    OpenNui('photoBooth', {
        dealershipId = 0,
        dealershipName = 'Photo Booth',
        role = 'admin',
        tier = 4,
        catalogId = data.catalogId,
        model = data.model,
        label = data.label or data.model,
    })
end)

RegisterNUICallback("photoBoothRotate", function(data, cb)
    if not PhotoBoothState then cb({ success = false }) return end

    if data.deltaAngle then
        PhotoBoothState.angle = PhotoBoothState.angle + (tonumber(data.deltaAngle) or 0)
    end
    local scale = PhotoBoothState.sizeScale or 1.0
    if data.deltaZoom then
        local newRadius = PhotoBoothState.radius + ((tonumber(data.deltaZoom) or 0) * scale)
        PhotoBoothState.radius = math.max(3.0 * scale, math.min(12.0 * scale, newRadius))
    end
    if data.deltaHeight then
        local newHeight = PhotoBoothState.camHeight + ((tonumber(data.deltaHeight) or 0) * scale)
        PhotoBoothState.camHeight = math.max(0.5 * scale, math.min(6.0 * scale, newHeight))
    end

    UpdatePhotoBoothCamera()
    cb({ success = true })
end)

RegisterNUICallback("photoBoothCapture", function(_, cb)
    if not PhotoBoothState then cb({ success = false }) return end

    -- Hide NUI for a clean screenshot
    CloseNui()
    Wait(200)

    exports['screenshot-basic']:requestScreenshot(function(screenshotData)
        -- Reopen the photo booth UI first so the component is mounted
        OpenNui('photoBooth', {
            dealershipId = 0,
            dealershipName = 'Photo Booth',
            role = 'admin',
            tier = 4,
            catalogId = PhotoBoothState and PhotoBoothState.catalogId,
            model = PhotoBoothState and PhotoBoothState.model,
            label = PhotoBoothState and PhotoBoothState.label,
        })

        -- Give React a frame to mount, then send the captured image
        Wait(100)
        SendNUIMessage({ type = 'photoBoothCaptured', imageData = screenshotData })
    end)

    cb({ success = true })
end)

RegisterNUICallback("photoBoothSave", function(data, cb)
    if not PhotoBoothState then cb({ success = false }) return end

    local result = lib.callback.await("pickle_dealerships:adminSaveCatalogImage", false, {
        catalogId = PhotoBoothState.catalogId,
        imageData = data.imageData,
    })

    if result and result.success then
        ShowNotification(result.message)
    else
        ShowNotification(result and result.message or "Failed to save image.")
    end

    cb(result or { success = false })
    CleanupPhotoBooth()
end)

RegisterNUICallback("photoBoothCancel", function(_, cb)
    CleanupPhotoBooth()
    cb({ success = true })
end)
