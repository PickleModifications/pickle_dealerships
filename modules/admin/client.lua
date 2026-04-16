--- Open admin panel via net event (triggered by server command)
RegisterNetEvent("pickle_dealerships:openAdminPanel", function()
    OpenNui('admin', {
        dealershipId = 0,
        dealershipName = 'Admin Panel',
        role = 'admin',
        tier = 4,
    })
end)

--- Fetch online players for admin dropdown
RegisterNUICallback("adminGetOnlinePlayers", function(_, cb)
    local result = lib.callback.await("pickle_dealerships:adminGetOnlinePlayers", false)
    cb(result or {})
end)

--- Fetch all dealerships for admin view
RegisterNUICallback("adminGetAllDealerships", function(_, cb)
    local result = lib.callback.await("pickle_dealerships:adminGetAllDealerships", false)
    if result then
        cb({ success = true, dealerships = result })
    else
        ShowNotification(_L("admin_fetch_failed"))
        cb({ success = false, message = _L("admin_fetch_failed") })
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
        ShowNotification(result and result.message or _L("admin_transfer_failed"))
        cb({ success = false, message = result and result.message or _L("admin_transfer_failed") })
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
        ShowNotification(result and result.message or _L("admin_balance_failed"))
        cb({ success = false, message = result and result.message or _L("admin_balance_failed") })
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
        ShowNotification(result and result.message or _L("admin_tier_failed"))
        cb({ success = false, message = result and result.message or _L("admin_tier_failed") })
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
        ShowNotification(result and result.message or _L("admin_reset_failed"))
        cb({ success = false, message = result and result.message or _L("admin_reset_failed") })
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
        ShowNotification(result and result.message or _L("admin_mode_failed"))
        cb({ success = false, message = result and result.message or _L("admin_mode_failed") })
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
        ShowNotification(result and result.message or _L("admin_create_failed"))
        cb({ success = false, message = result and result.message or _L("admin_create_failed") })
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

        cb({ success = false, message = _L("admin_placement_cancelled") })
    end
end)

RegisterNUICallback("adminRemovePosition", function(data, cb)
    local result = lib.callback.await("pickle_dealerships:adminRemovePosition", false, data)
    if result and result.success then
        ShowNotification(result.message)
    else
        ShowNotification(result and result.message or _L("admin_position_failed"))
    end
    cb(result or { success = false })
end)

RegisterNUICallback("adminSetJob", function(data, cb)
    local result = lib.callback.await("pickle_dealerships:adminSetJob", false, data)
    if result and result.success then
        ShowNotification(result.message)
    else
        ShowNotification(result and result.message or _L("admin_job_failed"))
    end
    cb(result or { success = false })
end)

-- ─── Catalog Management NUI Callbacks ───────────────────────────────────────

RegisterNUICallback("adminGetCatalog", function(data, cb)
    local result = lib.callback.await("pickle_dealerships:adminGetCatalog", false, {
        page = data.page or 1,
        pageSize = data.pageSize or 50,
        search = data.search or "",
        typeFilter = data.typeFilter or "all",
    })
    if result then
        cb({ success = true, items = result.items, total = result.total, page = result.page, pageSize = result.pageSize })
    else
        cb({ success = false, message = _L("admin_catalog_fetch_failed") })
    end
end)

RegisterNUICallback("adminAddCatalogVehicle", function(data, cb)
    local result = lib.callback.await("pickle_dealerships:adminAddCatalogVehicle", false, data)
    if result and result.success then
        ShowNotification(result.message)
    else
        ShowNotification(result and result.message or _L("admin_catalog_add_failed"))
    end
    cb(result or { success = false })
end)

RegisterNUICallback("adminUpdateCatalogVehicle", function(data, cb)
    local result = lib.callback.await("pickle_dealerships:adminUpdateCatalogVehicle", false, data)
    if result and result.success then
        ShowNotification(result.message)
    else
        ShowNotification(result and result.message or _L("admin_catalog_update_failed"))
    end
    cb(result or { success = false })
end)

RegisterNUICallback("adminRemoveCatalogVehicle", function(data, cb)
    local result = lib.callback.await("pickle_dealerships:adminRemoveCatalogVehicle", false, data)
    if result and result.success then
        ShowNotification(result.message)
    else
        ShowNotification(result and result.message or _L("admin_catalog_remove_failed"))
    end
    cb(result or { success = false })
end)

-- ─── Photo Booth ────────────────────────────────────────────────────────────

local PhotoBoothState = nil

local PhotoBoothCamThread = nil
local PhotoBoothInput = {
    forward = false, back = false, left = false, right = false,
    up = false, down = false,
    lookX = 0.0, lookY = 0.0,
    dragging = false,
}

RegisterNUICallback("photoBoothInput", function(data, cb)
    if data.forward ~= nil then PhotoBoothInput.forward = data.forward end
    if data.back ~= nil then PhotoBoothInput.back = data.back end
    if data.left ~= nil then PhotoBoothInput.left = data.left end
    if data.right ~= nil then PhotoBoothInput.right = data.right end
    if data.up ~= nil then PhotoBoothInput.up = data.up end
    if data.down ~= nil then PhotoBoothInput.down = data.down end
    if data.lookX then PhotoBoothInput.lookX = PhotoBoothInput.lookX + (tonumber(data.lookX) or 0.0) end
    if data.lookY then PhotoBoothInput.lookY = PhotoBoothInput.lookY + (tonumber(data.lookY) or 0.0) end
    if data.dragging ~= nil then PhotoBoothInput.dragging = data.dragging end
    cb({})
end)

local function StartPhotoBoothCamThread()
    if PhotoBoothCamThread then return end
    PhotoBoothCamThread = true

    -- Reset input
    PhotoBoothInput = {
        forward = false, back = false, left = false, right = false,
        up = false, down = false,
        lookX = 0.0, lookY = 0.0,
        dragging = false,
    }

    CreateThread(function()
        local moveSpeed = 0.05
        local vertSpeed = 0.04
        local dragSpeed = 0.01
        local camMode = 'free' -- 'free' (WASD on s.cam) or 'drag' (mouse pans s.dragCam)

        while PhotoBoothState and PhotoBoothCamThread do
            local s = PhotoBoothState
            if not s or not s.cam then break end

            local inp = PhotoBoothInput
            local hasMovement = inp.forward or inp.back or inp.left or inp.right or inp.up or inp.down

            -- Mode switching: drag starts → create independent dragCam from current cam state
            if inp.dragging and not hasMovement and camMode == 'free' then
                local coord = GetCamCoord(s.cam)
                local rot = GetCamRot(s.cam, 2)
                s.dragCam = CreateCam("DEFAULT_SCRIPTED_CAMERA", true)
                SetCamCoord(s.dragCam, coord.x, coord.y, coord.z)
                SetCamRot(s.dragCam, rot.x, 0.0, rot.z, 2)
                SetCamActive(s.dragCam, true)
                SetCamActive(s.cam, false)
                camMode = 'drag'
            elseif hasMovement and camMode == 'drag' then
                -- WASD pressed → sync main cam to dragCam position, switch back
                local coord = GetCamCoord(s.dragCam)
                SetCamCoord(s.cam, coord.x, coord.y, coord.z)
                SetCamActive(s.cam, true)
                SetCamActive(s.dragCam, false)
                DestroyCam(s.dragCam, false)
                s.dragCam = nil
                camMode = 'free'
                inp.lookX = 0.0
                inp.lookY = 0.0
            end

            if camMode == 'drag' and s.dragCam then
                -- Drag moves dragCam position laterally/vertically (rotation stays fixed)
                if inp.lookX ~= 0.0 or inp.lookY ~= 0.0 then
                    local rot = GetCamRot(s.dragCam, 2)
                    local headingRad = math.rad(rot.z)
                    local rightX = math.cos(headingRad)
                    local rightY = math.sin(headingRad)

                    local coord = GetCamCoord(s.dragCam)
                    local mx = coord.x - rightX * inp.lookX * dragSpeed
                    local my = coord.y - rightY * inp.lookX * dragSpeed
                    local mz = coord.z + inp.lookY * dragSpeed

                    local minZ = s.groundZ + 0.3
                    if mz < minZ then mz = minZ end

                    SetCamCoord(s.dragCam, mx, my, mz)
                    inp.lookX = 0.0
                    inp.lookY = 0.0
                end
            else
                -- Free movement on main cam (PointCamAtCoord keeps it aimed at vehicle)
                local rot = GetCamRot(s.cam, 2)
                local headingRad = math.rad(rot.z)
                local fwdX = -math.sin(headingRad)
                local fwdY = math.cos(headingRad)
                local rightX = math.cos(headingRad)
                local rightY = math.sin(headingRad)

                local camCoord = GetCamCoord(s.cam)
                local mx, my, mz = camCoord.x, camCoord.y, camCoord.z

                if inp.forward then mx = mx + fwdX * moveSpeed; my = my + fwdY * moveSpeed end
                if inp.back then mx = mx - fwdX * moveSpeed; my = my - fwdY * moveSpeed end
                if inp.left then mx = mx - rightX * moveSpeed; my = my - rightY * moveSpeed end
                if inp.right then mx = mx + rightX * moveSpeed; my = my + rightY * moveSpeed end
                if inp.up then mz = mz + vertSpeed end
                if inp.down then mz = mz - vertSpeed end

                local minZ = s.groundZ + 0.3
                if mz < minZ then mz = minZ end

                SetCamCoord(s.cam, mx, my, mz)
            end

            Wait(0)
        end

        PhotoBoothCamThread = nil
    end)
end

local function StopPhotoBoothCamThread()
    PhotoBoothCamThread = nil
end

local function CleanupPhotoBooth()
    if not PhotoBoothState then return end

    -- Stop camera thread
    StopPhotoBoothCamThread()

    -- Close NUI first so it's gone before fade
    CloseNui()

    -- Fade out
    DoScreenFadeOut(500)
    while not IsScreenFadedOut() do Wait(0) end

    -- Delete vehicle
    if DoesEntityExist(PhotoBoothState.vehicle) then
        DeleteEntity(PhotoBoothState.vehicle)
    end

    -- Destroy cameras
    RenderScriptCams(false, false, 0, true, true)
    if PhotoBoothState.dragCam then
        DestroyCam(PhotoBoothState.dragCam, false)
    end
    if PhotoBoothState.cam then
        DestroyCam(PhotoBoothState.cam, false)
    end

    -- Restore routing bucket first (before teleport so collision loads in correct bucket)
    lib.callback.await("pickle_dealerships:adminSetPhotoBucket", false, { bucket = 0 })

    -- Restore player
    local ped = PlayerPedId()
    local sc = PhotoBoothState.savedCoords
    SetEntityVisible(ped, true, false)
    SetEntityCoords(ped, sc.x, sc.y, sc.z - 1.0, false, false, false, false)
    FreezeEntityPosition(ped, false)
    PlaceObjectOnGroundProperly(ped)
    SetEntityHeading(ped, PhotoBoothState.savedHeading)

    -- Restore HUD
    DisplayRadar(true)
    DisplayHud(true)

    -- Clear weather override
    ClearWeatherTypePersist()
    ClearOverrideWeather()

    PhotoBoothState = nil

    -- Fade back in and reopen admin panel
    DoScreenFadeIn(500)
    while not IsScreenFadedIn() do Wait(0) end

    OpenNui('admin', {
        dealershipId = 0,
        dealershipName = 'Admin Panel',
        role = 'admin',
        tier = 4,
        initialTab = 'catalog',
    })
end

RegisterNUICallback("adminStartPhotoCapture", function(data, cb)
    CloseNui()

    -- Fetch upload config from server before proceeding
    local uploadConfig = lib.callback.await("pickle_dealerships:adminGetUploadConfig", false)
    if not uploadConfig then
        ShowNotification(_L("admin_upload_not_configured"))
        cb({ success = false })
        return
    end

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
    local boothCoords = location.coords

    -- Fade out
    DoScreenFadeOut(500)
    while not IsScreenFadedOut() do Wait(0) end

    -- Move to isolated routing bucket
    lib.callback.await("pickle_dealerships:adminSetPhotoBucket", false, { bucket = Config.PhotoBooth.routingBucket })

    -- Teleport player to booth and load the area
    SetEntityCoords(ped, boothCoords.x, boothCoords.y, boothCoords.z, false, false, false, true)
    FreezeEntityPosition(ped, true)
    SetEntityVisible(ped, false, false)

    -- Request collision and wait for the area to fully load
    RequestCollisionAtCoord(boothCoords.x, boothCoords.y, boothCoords.z)
    NewLoadSceneStart(boothCoords.x, boothCoords.y, boothCoords.z, boothCoords.x, boothCoords.y, boothCoords.z, 50.0, 0)
    local loadTimeout = GetGameTimer() + 10000
    while not IsNewLoadSceneLoaded() and GetGameTimer() < loadTimeout do Wait(0) end
    NewLoadSceneStop()

    -- Load the vehicle model while the scene loads
    local modelHash = joaat(data.model)
    RequestModel(modelHash)
    while not HasModelLoaded(modelHash) do Wait(0) end

    -- Spawn vehicle now that collision is ready
    local vehHeading = boothCoords.w or 0.0
    local veh = CreateVehicle(modelHash, boothCoords.x, boothCoords.y, boothCoords.z, vehHeading, false, false)
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

    -- Scale camera start position based on vehicle dimensions
    local dimMin, dimMax = GetModelDimensions(modelHash)
    local vehHeight = dimMax.z - dimMin.z
    local vehSize = math.max(dimMax.y - dimMin.y, dimMax.x - dimMin.x, vehHeight)
    local sizeScale = math.max(0.8, vehSize / 5.0)

    local camRadius = (location.camRadius or 6.0) * sizeScale

    -- Get actual vehicle position after ground placement, then find its vertical center
    local vehPos = GetEntityCoords(veh)
    local vehCenterZ = vehPos.z + (dimMin.z + dimMax.z) * 0.5

    -- Create free camera at initial position looking at vehicle center
    local initAngle = math.rad(225.0)
    local camX = vehPos.x + camRadius * math.cos(initAngle)
    local camY = vehPos.y + camRadius * math.sin(initAngle)
    local camZ = vehCenterZ
    local cam = CreateCam("DEFAULT_SCRIPTED_CAMERA", true)
    SetCamCoord(cam, camX, camY, camZ)
    PointCamAtCoord(cam, vehPos.x, vehPos.y, vehCenterZ)
    SetCamActive(cam, true)
    RenderScriptCams(true, false, 0, true, true)

    -- Store state
    PhotoBoothState = {
        vehicle = veh,
        cam = cam,
        center = boothCoords,
        groundZ = boothCoords.z - 2.0,
        savedCoords = savedCoords,
        savedHeading = savedHeading,
        catalogId = data.catalogId,
        model = data.model,
        label = data.label or data.model,
        vehicleClass = data.class,
        uploadConfig = uploadConfig,
    }

    -- Start noclip camera thread
    StartPhotoBoothCamThread()

    -- Fade in and open UI
    DoScreenFadeIn(500)
    while not IsScreenFadedIn() do Wait(0) end

    local nuiData = {
        dealershipId = 0,
        dealershipName = 'Photo Booth',
        role = 'admin',
        tier = 4,
        catalogId = data.catalogId,
        model = data.model,
        label = data.label or data.model,
        vehicleClass = data.class,
        uploadConfig = uploadConfig,
    }

    OpenNui('photoBooth', nuiData)
end)

RegisterNUICallback("photoBoothCapture", function(_, cb)
    if not PhotoBoothState then cb({ success = false }) return end

    -- Hide NUI for a clean screenshot
    CloseNui()
    Wait(200)

    exports['screenshot-basic']:requestScreenshot(function(screenshotData)
        -- Reopen the photo booth UI so the component is mounted
        OpenNui('photoBooth', {
            dealershipId = 0,
            dealershipName = 'Photo Booth',
            role = 'admin',
            tier = 4,
            catalogId = PhotoBoothState and PhotoBoothState.catalogId,
            model = PhotoBoothState and PhotoBoothState.model,
            label = PhotoBoothState and PhotoBoothState.label,
            vehicleClass = PhotoBoothState and PhotoBoothState.vehicleClass,
            uploadConfig = PhotoBoothState and PhotoBoothState.uploadConfig,
        })

        Wait(100)
        SendNUIMessage({ type = 'photoBoothCaptured', imageData = screenshotData })
    end)

    cb({ success = true })
end)

RegisterNUICallback("photoBoothSave", function(data, cb)
    if not PhotoBoothState then cb({ success = false }) return end

    if not data.imageData or data.imageData == "" then
        ShowNotification(_L("admin_no_image"))
        cb({ success = false })
        CleanupPhotoBooth()
        return
    end

    local result = lib.callback.await("pickle_dealerships:adminSaveCatalogImage", false, {
        catalogId = PhotoBoothState.catalogId,
        imageUrl = data.imageData,
    })

    if result and result.success then
        ShowNotification(result.message)
    else
        ShowNotification(result and result.message or _L("admin_image_failed"))
    end

    cb(result or { success = false })
    CleanupPhotoBooth()
end)

RegisterNUICallback("photoBoothCancel", function(_, cb)
    CleanupPhotoBooth()
    cb({ success = true })
end)
