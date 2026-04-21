--- Open admin panel via net event (triggered by server command)
RegisterNetEvent("pickle_dealerships:openAdminPanel", function()
    OpenNui('admin', {
        dealershipId = 0,
        dealershipName = 'Dealership Panel',
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

--- Toggle seize mode
RegisterNUICallback("adminToggleSeize", function(data, cb)
    local result = lib.callback.await("pickle_dealerships:adminToggleSeize", false, {
        dealershipId = data.dealershipId,
    })
    if result and result.success then
        ShowNotification(result.message)
        cb({ success = true, seizeEnabled = result.seizeEnabled })
    else
        ShowNotification(result and result.message or _L("admin_seize_failed"))
        cb({ success = false, message = result and result.message or _L("admin_seize_failed") })
    end
end)

--- Permanently delete a dealership (confirmation handled in NUI)
RegisterNUICallback("adminDeleteDealership", function(data, cb)
    local result = lib.callback.await("pickle_dealerships:adminDeleteDealership", false, {
        dealershipId = data.dealershipId,
    })
    if result and result.success then
        ShowNotification(result.message)
        cb({ success = true })
    else
        ShowNotification(result and result.message or _L("admin_delete_failed"))
        cb({ success = false, message = result and result.message or _L("admin_delete_failed") })
    end
end)

--- Create a new dealership
RegisterNUICallback("adminCreateDealership", function(data, cb)
    local result = lib.callback.await("pickle_dealerships:adminCreateDealership", false, {
        label            = data.label,
        mode             = data.mode,
        type             = data.type,
        tier             = data.tier,
        factionType      = data.factionType,
        factionName      = data.factionName,
        ownerIdentifier  = data.ownerIdentifier,
        coords           = data.coords,
        spawnPoint       = data.spawnPoint,
        deliveryPoint    = data.deliveryPoint,
        managementPoint  = data.managementPoint,
        salesPoint       = data.salesPoint,
        showroomPoint    = data.showroomPoint,
    })
    if result and result.success then
        ShowNotification(result.message)
        cb({ success = true, dealershipId = result.dealershipId })
    else
        ShowNotification(result and result.message or _L("admin_create_failed"))
        cb({ success = false, message = result and result.message or _L("admin_create_failed") })
    end
end)

--- DRAFT MODE for the create-dealership dialog. Closes the NUI, runs the appropriate
--- gizmo for the chosen field, then re-opens the admin panel with a `pendingDealership`
--- draft so the create dialog can repopulate with the previously entered values plus
--- the freshly placed coord. Mirrors the depot create flow exactly.
RegisterNUICallback("adminPlaceDealershipPoint", function(payload, cb)
    CloseNui()

    local field = payload.field   -- 'coords' | 'spawnPoint' | 'deliveryPoint'
    local draft = payload.draft or {}

    local result
    if field == "deliveryPoint" then
        -- Use a ghost tr2 trailer so the placement shows the exact footprint
        local model = `tr2`
        RequestModel(model)
        local t = GetGameTimer() + 5000
        while not HasModelLoaded(model) and GetGameTimer() < t do Wait(0) end
        if HasModelLoaded(model) then
            local ped = PlayerPedId()
            local spawn = GetEntityCoords(ped) + GetEntityForwardVector(ped) * 6.0
            local trailer = CreateVehicle(model, spawn.x, spawn.y, spawn.z, GetEntityHeading(ped), false, false)
            SetModelAsNoLongerNeeded(model)
            SetEntityAsMissionEntity(trailer, true, true)
            SetEntityInvincible(trailer, true)
            SetEntityCollision(trailer, false, false)
            SetEntityAlpha(trailer, 160, false)
            result = StartGizmoEditor({ entity = trailer, enableCancel = true })
            if DoesEntityExist(trailer) then DeleteEntity(trailer) end
        end
    else
        result = StartGizmoEditor({
            model = `prop_tennis_ball`,
            enableCancel = true,
            deleteEntity = true,
        })
    end

    if result and result.position then
        local coord = {
            x = result.position.x,
            y = result.position.y,
            z = result.position.z,
            w = result.rotation and result.rotation.z or 0.0,
        }
        if field == "coords" then draft.coords = coord
        elseif field == "spawnPoint" then draft.spawnPoint = coord
        elseif field == "deliveryPoint" then draft.deliveryPoint = coord
        elseif field == "managementPoint" then draft.managementPoint = coord
        elseif field == "salesPoint" then draft.salesPoint = coord
        elseif field == "showroomPoint" then draft.showroomPoint = coord end
    end

    OpenNui('admin', {
        dealershipId = 0,
        dealershipName = 'Dealership Panel',
        role = 'admin',
        tier = 4,
        pendingDealership = draft,
    })
    cb({ success = result ~= nil and result.position ~= nil })
end)

--- Start gizmo placement for a dealership position
--- The NUI closes, player places with gizmo, result is saved to server, NUI re-opens
RegisterNUICallback("adminStartGizmo", function(data, cb)
    -- Close the NUI so the player can use the gizmo
    CloseNui()

    local isDisplaySpot = data.field == "displaySpot"
    local isDeliveryPoint = data.field == "deliveryPoint"
    local result

    if isDeliveryPoint then
        -- Delivery point is placed using a ghost tr2 trailer so the admin sees the exact footprint
        -- drivers will drop their trailer into. Pass the pre-spawned entity to the gizmo so it
        -- moves the trailer directly instead of a placeholder prop.
        local model = `tr2`
        RequestModel(model)
        local t = GetGameTimer() + 5000
        while not HasModelLoaded(model) and GetGameTimer() < t do Wait(0) end
        if not HasModelLoaded(model) then
            ShowNotification(_L("admin_placement_cancelled"))
            OpenNui('admin', { dealershipId = 0, dealershipName = 'Dealership Panel', role = 'admin', tier = 4, positionsDealershipId = data.dealershipId })
            cb({ success = false })
            return
        end
        local ped = PlayerPedId()
        local spawn = GetEntityCoords(ped) + GetEntityForwardVector(ped) * 6.0
        local trailer = CreateVehicle(model, spawn.x, spawn.y, spawn.z, GetEntityHeading(ped), false, false)
        SetModelAsNoLongerNeeded(model)
        SetEntityAsMissionEntity(trailer, true, true)
        SetEntityInvincible(trailer, true)
        SetEntityCollision(trailer, false, false)
        SetEntityAlpha(trailer, 160, false)

        result = StartGizmoEditor({
            entity = trailer,
            enableCancel = true,
        })

        if DoesEntityExist(trailer) then DeleteEntity(trailer) end
    else
        local model = isDisplaySpot and `xm_prop_lab_barrier02` or `prop_tennis_ball`
        result = StartGizmoEditor({
            model = model,
            enableCancel = true,
            deleteEntity = true,
            coordsOffset = isDisplaySpot and vector3(0.0, 0.0, -0.03) or nil,
            rotationOffset = isDisplaySpot and vector3(90.0, 0.0, 0.0) or nil,
        })
    end

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
            dealershipName = 'Dealership Panel',
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
            dealershipName = 'Dealership Panel',
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

RegisterNUICallback("adminSetAccess", function(data, cb)
    local result = lib.callback.await("pickle_dealerships:adminSetAccess", false, data)
    if result and result.success then
        ShowNotification(result.message)
    else
        ShowNotification(result and result.message or "Failed to update access.")
    end
    cb(result or { success = false })
end)

RegisterNUICallback("adminSetAltCurrencies", function(data, cb)
    local result = lib.callback.await("pickle_dealerships:setAcceptedAltCurrencies", false, {
        dealershipId = data.dealershipId,
        accepted     = data.accepted,
    })
    if result and result.success then
        ShowNotification(result.message)
    else
        ShowNotification(result and result.message or _L("alt_currencies_update_failed"))
    end
    cb(result or { success = false })
end)

RegisterNUICallback("adminSetFaction", function(data, cb)
    local result = lib.callback.await("pickle_dealerships:adminSetFaction", false, data)
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
    lookX = 0.0, lookY = 0.0, dragging = false, zoom = 0.0, panning = false,
}

RegisterNUICallback("photoBoothInput", function(data, cb)
    if data.lookX then PhotoBoothInput.lookX = PhotoBoothInput.lookX + (tonumber(data.lookX) or 0.0) end
    if data.lookY then PhotoBoothInput.lookY = PhotoBoothInput.lookY + (tonumber(data.lookY) or 0.0) end
    if data.dragging ~= nil then PhotoBoothInput.dragging = data.dragging end
    if data.panning ~= nil then PhotoBoothInput.panning = data.panning end
    if data.zoom then PhotoBoothInput.zoom = PhotoBoothInput.zoom + (tonumber(data.zoom) or 0.0) end
    cb({})
end)

--- Orbit camera thread (mirrors modules/showroom/client.lua, with Shift+drag to pan)
local function StartPhotoBoothCamThread()
    if PhotoBoothCamThread then return end
    PhotoBoothCamThread = true

    PhotoBoothInput = { lookX = 0.0, lookY = 0.0, dragging = false, zoom = 0.0, panning = false }

    CreateThread(function()
        local orbitSensitivity = 0.005
        local panSpeed = 0.015
        local zoomSpeed = 0.5
        local minRadius = 2.5
        local maxRadius = 15.0
        local smoothing = 0.15

        local smoothAngle = PhotoBoothState.orbitAngle
        local smoothPitch = PhotoBoothState.orbitPitch
        local smoothRadius = PhotoBoothState.orbitRadius

        while PhotoBoothState and PhotoBoothCamThread do
            local s = PhotoBoothState
            if not s or not s.cam then break end

            local inp = PhotoBoothInput

            if inp.lookX ~= 0.0 or inp.lookY ~= 0.0 then
                if inp.panning then
                    -- Shift+drag: slide the orbit target along the camera's right axis + world up/down
                    local rightX = -math.sin(s.orbitAngle)
                    local rightY = math.cos(s.orbitAngle)
                    s.targetCenter = vector3(
                        s.targetCenter.x - rightX * inp.lookX * panSpeed,
                        s.targetCenter.y - rightY * inp.lookX * panSpeed,
                        math.max(s.groundZ + 0.3, s.targetCenter.z + inp.lookY * panSpeed)
                    )
                else
                    -- Default drag: orbit
                    s.orbitAngle = s.orbitAngle - inp.lookX * orbitSensitivity
                    s.orbitPitch = math.max(-0.8, math.min(0.8, s.orbitPitch - inp.lookY * orbitSensitivity))
                end
                inp.lookX = 0.0
                inp.lookY = 0.0
            end

            if inp.zoom ~= 0.0 then
                local effectiveMax = math.max(maxRadius, (s.defaultRadius or maxRadius) * 1.3)
                s.orbitRadius = math.max(minRadius, math.min(effectiveMax, s.orbitRadius - inp.zoom * zoomSpeed))
                inp.zoom = 0.0
            end

            smoothAngle = smoothAngle + (s.orbitAngle - smoothAngle) * smoothing
            smoothPitch = smoothPitch + (s.orbitPitch - smoothPitch) * smoothing
            smoothRadius = smoothRadius + (s.orbitRadius - smoothRadius) * smoothing

            local camX = s.targetCenter.x + smoothRadius * math.cos(smoothAngle)
            local camY = s.targetCenter.y + smoothRadius * math.sin(smoothAngle)
            local camZ = s.targetCenter.z + smoothRadius * math.sin(smoothPitch) * 0.5

            local minZ = s.groundZ + 0.3
            if camZ < minZ then camZ = minZ end

            SetCamCoord(s.cam, camX, camY, camZ)
            PointCamAtCoord(s.cam, s.targetCenter.x, s.targetCenter.y, s.targetCenter.z)

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
    if PhotoBoothState.cam then
        DestroyCam(PhotoBoothState.cam, false)
    end

    -- Restore weather/time via bridge
    RestorePhotoWeather()

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
        dealershipName = 'Dealership Panel',
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

    -- Set consistent daytime weather via bridge (handles qb-weathersync, Renewed-Weathersync, cd_easytime, standalone)
    LockPhotoWeather()

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
    local targetCenter = vector3(vehPos.x, vehPos.y, vehCenterZ)

    -- Create orbit camera at initial angle (matches showroom)
    local initAngle = math.rad(225.0)
    local initPitch = 0.0
    local camX = targetCenter.x + camRadius * math.cos(initAngle)
    local camY = targetCenter.y + camRadius * math.sin(initAngle)
    local camZ = targetCenter.z + camRadius * math.sin(initPitch) * 0.5
    local cam = CreateCam("DEFAULT_SCRIPTED_CAMERA", true)
    SetCamCoord(cam, camX, camY, camZ)
    PointCamAtCoord(cam, targetCenter.x, targetCenter.y, targetCenter.z)
    SetCamActive(cam, true)
    RenderScriptCams(true, false, 0, true, true)

    -- Store state (includes orbit params used by the cam thread)
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
        targetCenter = targetCenter,
        orbitAngle = initAngle,
        orbitPitch = initPitch,
        orbitRadius = camRadius,
        defaultRadius = camRadius,
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

    CaptureScreenshot(function(screenshotData)
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
