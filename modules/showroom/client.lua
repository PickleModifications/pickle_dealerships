local ShowroomState = nil
local ShowroomInput = { lookX = 0.0, lookY = 0.0, dragging = false, zoom = 0.0 }
local ShowroomCamThread = nil

--- Spawn a frozen display vehicle at the showroom position
---@param model string
---@param coords vector4
---@return number|nil entity
---@return vector3|nil center
---@return number|nil radius
function SpawnShowroomVehicle(model, coords, properties)
    local modelHash = type(model) == "string" and joaat(model) or model
    RequestModel(modelHash)
    local timeout = GetGameTimer() + 10000
    while not HasModelLoaded(modelHash) and GetGameTimer() < timeout do Wait(0) end
    if not HasModelLoaded(modelHash) then return nil end

    local veh = CreateVeh(modelHash, vector3(coords.x, coords.y, coords.z), coords.w or 0.0, false)
    if not veh or not DoesEntityExist(veh) then return nil end

    FreezeEntityPosition(veh, true)
    SetEntityInvincible(veh, true)
    SetVehicleDoorsLocked(veh, 2)
    SetVehicleOnGroundProperly(veh)
    SetModelAsNoLongerNeeded(modelHash)

    -- Pre-owned units: apply captured properties so the showroom shows the actual unit
    if properties then
        if type(properties) == "string" then properties = json.decode(properties) end
        if type(properties) == "table" then
            properties.plate = nil
            local ok, err = pcall(lib.setVehicleProperties, veh, properties)
            print(('[pickle_dealerships] Showroom applied props ok=%s err=%s keys=%d'):format(tostring(ok), tostring(err), (function() local n=0 for _ in pairs(properties) do n=n+1 end return n end)()))
        end
    end

    -- Calculate camera orbit parameters from vehicle dimensions
    local dimMin, dimMax = GetModelDimensions(modelHash)
    local vehPos = GetEntityCoords(veh)
    local vehHeight = dimMax.z - dimMin.z
    local vehSize = math.max(dimMax.y - dimMin.y, dimMax.x - dimMin.x, vehHeight)
    local centerZ = vehPos.z + (dimMin.z + dimMax.z) * 0.5
    local center = vector3(vehPos.x, vehPos.y, centerZ)
    local radius = math.max(4.0, vehSize * 1.2)

    return veh, center, radius
end

--- Swap the currently displayed showroom vehicle
---@param model string
---@param properties table|nil
local function SwapShowroomVehicle(model, properties)
    if not ShowroomState then return false end

    -- Load new model before deleting old one for a clean swap
    local modelHash = type(model) == "string" and joaat(model) or model
    RequestModel(modelHash)
    local timeout = GetGameTimer() + 10000
    while not HasModelLoaded(modelHash) and GetGameTimer() < timeout do Wait(0) end
    if not HasModelLoaded(modelHash) then return false end

    -- Delete old vehicle
    if ShowroomState.vehicle and DoesEntityExist(ShowroomState.vehicle) then
        DeleteEntity(ShowroomState.vehicle)
    end

    -- Spawn new one
    local veh, center, radius = SpawnShowroomVehicle(model, ShowroomState.spawnCoords, properties)
    if not veh then return false end

    ShowroomState.vehicle = veh
    ShowroomState.currentModel = model
    ShowroomState.targetCenter = center
    ShowroomState.orbitRadius = radius
    ShowroomState.defaultRadius = radius

    -- Update camera to look at new vehicle
    local s = ShowroomState
    local camX = s.targetCenter.x + s.orbitRadius * math.cos(s.orbitAngle)
    local camY = s.targetCenter.y + s.orbitRadius * math.sin(s.orbitAngle)
    local camZ = s.targetCenter.z + s.orbitRadius * math.sin(s.orbitPitch) * 0.5
    SetCamCoord(s.cam, camX, camY, camZ)
    PointCamAtCoord(s.cam, s.targetCenter.x, s.targetCenter.y, s.targetCenter.z)

    return true
end

--- Start the orbit camera thread
local function StartShowroomCamThread()
    if ShowroomCamThread then return end
    ShowroomCamThread = true

    ShowroomInput = { lookX = 0.0, lookY = 0.0, dragging = false, zoom = 0.0 }

    CreateThread(function()
        local orbitSensitivity = 0.005
        local zoomSpeed = 0.5
        local minRadius = 2.5
        local maxRadius = 15.0
        local smoothing = 0.15 -- lower = smoother but laggier

        -- Smoothed values that lerp toward the target
        local smoothAngle = ShowroomState.orbitAngle
        local smoothPitch = ShowroomState.orbitPitch
        local smoothRadius = ShowroomState.orbitRadius

        while ShowroomState and ShowroomCamThread do
            local s = ShowroomState
            if not s or not s.cam then break end

            local inp = ShowroomInput

            -- Accumulate raw input into target values
            if inp.lookX ~= 0.0 or inp.lookY ~= 0.0 then
                s.orbitAngle = s.orbitAngle - inp.lookX * orbitSensitivity
                s.orbitPitch = math.max(-0.8, math.min(0.8, s.orbitPitch - inp.lookY * orbitSensitivity))
                inp.lookX = 0.0
                inp.lookY = 0.0
            end

            if inp.zoom ~= 0.0 then
                -- Use the vehicle's default radius + margin as max so we can always zoom back out fully
                local effectiveMax = math.max(maxRadius, (s.defaultRadius or maxRadius) * 1.3)
                s.orbitRadius = math.max(minRadius, math.min(effectiveMax, s.orbitRadius - inp.zoom * zoomSpeed))
                inp.zoom = 0.0
            end

            -- Lerp smoothed values toward targets
            smoothAngle = smoothAngle + (s.orbitAngle - smoothAngle) * smoothing
            smoothPitch = smoothPitch + (s.orbitPitch - smoothPitch) * smoothing
            smoothRadius = smoothRadius + (s.orbitRadius - smoothRadius) * smoothing

            -- Update camera position every frame
            local camX = s.targetCenter.x + smoothRadius * math.cos(smoothAngle)
            local camY = s.targetCenter.y + smoothRadius * math.sin(smoothAngle)
            local camZ = s.targetCenter.z + smoothRadius * math.sin(smoothPitch) * 0.5

            -- Clamp camera Z to showroom floor level (spawn coords Z + small offset)
            local minZ = s.spawnCoords.z + 0.3
            if camZ < minZ then camZ = minZ end

            SetCamCoord(s.cam, camX, camY, camZ)
            PointCamAtCoord(s.cam, s.targetCenter.x, s.targetCenter.y, s.targetCenter.z)

            Wait(0)
        end

        ShowroomCamThread = nil
    end)
end

--- Clean up the showroom and restore player state
--- If skipFadeIn is true, the screen stays faded out (caller handles fade-in)
local function CleanupShowroom(skipFadeIn)
    if not ShowroomState then return end

    local locationKey = ShowroomState.locationKey

    ShowroomCamThread = nil
    CloseNui()

    DoScreenFadeOut(500)
    while not IsScreenFadedOut() do Wait(0) end

    -- Delete display vehicle
    if ShowroomState.vehicle and DoesEntityExist(ShowroomState.vehicle) then
        DeleteEntity(ShowroomState.vehicle)
    end

    -- Destroy camera
    RenderScriptCams(false, false, 0, true, true)
    if ShowroomState.cam then
        DestroyCam(ShowroomState.cam, false)
    end

    -- Restore player
    local ped = PlayerPedId()
    SetEntityCoords(ped, ShowroomState.savedCoords.x, ShowroomState.savedCoords.y, ShowroomState.savedCoords.z, false, false, false, false)
    SetEntityHeading(ped, ShowroomState.savedHeading)
    FreezeEntityPosition(ped, false)
    SetEntityVisible(ped, true, false)

    -- Restore HUD
    DisplayRadar(true)
    DisplayHud(true)

    ShowroomState = nil

    if not skipFadeIn then
        DoScreenFadeIn(500)
        while not IsScreenFadedIn() do Wait(0) end
    end

    -- Refresh display vehicles in case a purchase was made
    TriggerEvent('pickle_dealerships:refreshDisplay', locationKey)
end

--- Main entry point: opens the immersive showroom
---@param locationKey string
---@param dealershipData table
function StartShowroom(locationKey, dealershipData)
    if ShowroomState then return end

    local cfg = DealershipConfigs[locationKey]
    if not cfg or not cfg.interactionPoints or not cfg.interactionPoints.showroom then
        ShowNotification(_L("something_went_wrong"))
        return
    end

    local showroomCoords = cfg.interactionPoints.showroom
    local spawnCoords = vector4(showroomCoords.x, showroomCoords.y, showroomCoords.z, showroomCoords.w or 0.0)

    local ped = PlayerPedId()
    local savedCoords = GetEntityCoords(ped)
    local savedHeading = GetEntityHeading(ped)

    -- Fade out
    DoScreenFadeOut(500)
    while not IsScreenFadedOut() do Wait(0) end

    -- Freeze and hide player
    FreezeEntityPosition(ped, true)
    SetEntityVisible(ped, false, false)
    DisplayRadar(false)
    DisplayHud(false)

    -- Create orbit camera pointing at showroom position (no vehicle yet)
    local initAngle = math.rad(225.0)
    local defaultRadius = 6.0
    local center = vector3(spawnCoords.x, spawnCoords.y, spawnCoords.z + 0.5)
    local camX = center.x + defaultRadius * math.cos(initAngle)
    local camY = center.y + defaultRadius * math.sin(initAngle)
    local camZ = center.z
    local cam = CreateCam("DEFAULT_SCRIPTED_CAMERA", true)
    SetCamCoord(cam, camX, camY, camZ)
    PointCamAtCoord(cam, center.x, center.y, center.z)
    SetCamActive(cam, true)
    RenderScriptCams(true, false, 0, true, true)

    ShowroomState = {
        vehicle = nil,
        cam = cam,
        locationKey = locationKey,
        spawnCoords = spawnCoords,
        savedCoords = savedCoords,
        savedHeading = savedHeading,
        currentModel = nil,
        orbitAngle = initAngle,
        orbitPitch = 0.0,
        orbitRadius = defaultRadius,
        targetCenter = center,
    }

    StartShowroomCamThread()

    -- Open NUI before fade so it's ready when screen appears
    OpenNui('showroom', {
        dealershipId = dealershipData.id,
        dealershipName = dealershipData.name,
        role = 'customer',
        tier = dealershipData.tier,
        location = locationKey,
    })

    DoScreenFadeIn(500)
end

-- ─── NUI Callbacks ──────────────────────────────────────────────────────────

RegisterNUICallback("showroomSwapVehicle", function(data, cb)
    if not ShowroomState then cb({ success = false }) return end
    -- Properties can be passed directly (auctions) or fetched via stockId (pre-owned stock)
    local properties = nil
    if data.properties then
        properties = data.properties
        if type(properties) == "string" then properties = json.decode(properties) end
    elseif data.stockId then
        local details = lib.callback.await("pickle_dealerships:getVehicleDetails", false, { stockId = data.stockId })
        if details and details.isUsed then properties = details.properties end
    end
    local ok = SwapShowroomVehicle(data.model, properties)
    cb({ success = ok })
end)

RegisterNUICallback("showroomOrbitInput", function(data, cb)
    if ShowroomState then
        if data.lookX then ShowroomInput.lookX = ShowroomInput.lookX + (tonumber(data.lookX) or 0.0) end
        if data.lookY then ShowroomInput.lookY = ShowroomInput.lookY + (tonumber(data.lookY) or 0.0) end
        if data.dragging ~= nil then ShowroomInput.dragging = data.dragging end
        if data.zoom then ShowroomInput.zoom = ShowroomInput.zoom + (tonumber(data.zoom) or 0.0) end
    end
    cb({})
end)

RegisterNUICallback("showroomClearVehicle", function(_, cb)
    if ShowroomState and ShowroomState.vehicle and DoesEntityExist(ShowroomState.vehicle) then
        DeleteEntity(ShowroomState.vehicle)
        ShowroomState.vehicle = nil
        ShowroomState.currentModel = nil
    end
    cb({})
end)

RegisterNUICallback("showroomSetColor", function(data, cb)
    if not ShowroomState or not ShowroomState.vehicle or not DoesEntityExist(ShowroomState.vehicle) then
        cb({})
        return
    end
    local veh = ShowroomState.vehicle
    if data.primaryR and data.primaryG and data.primaryB then
        SetVehicleCustomPrimaryColour(veh, data.primaryR, data.primaryG, data.primaryB)
    end
    if data.secondaryR and data.secondaryG and data.secondaryB then
        SetVehicleCustomSecondaryColour(veh, data.secondaryR, data.secondaryG, data.secondaryB)
    end
    cb({})
end)

RegisterNUICallback("showroomPurchase", function(data, cb)
    if not ShowroomState then cb({ success = false }) return end

    -- Save colors before cleanup clears state
    local color = data.color
    local secColor = data.secondaryColor
    if color and type(color) == "string" then color = json.decode(color) end
    if secColor and type(secColor) == "string" then secColor = json.decode(secColor) end

    -- Fetch details so we know if pre-owned (carries captured properties)
    local details = lib.callback.await("pickle_dealerships:getVehicleDetails", false, { stockId = data.stockId })

    -- Run the server-side purchase
    local result = lib.callback.await("pickle_dealerships:purchaseVehicle", false, {
        dealershipId = data.dealershipId,
        stockId = data.stockId,
        paymentMethod = data.paymentMethod or "cash",
        couponCode = data.couponCode,
    })

    if not result or not result.success then
        ShowNotification(result and result.message or _L("showroom_purchase_failed"))
        cb(result or { success = false })
        return
    end

    -- Clean up showroom but keep screen faded out
    local location = data.location
    CleanupShowroom(true)

    -- Spawn the purchased vehicle and warp player in while screen is still black
    local cfg = DealershipConfigs[location]
    local spawnPoint = cfg and cfg.spawnPoint
    if spawnPoint then
        local props = nil
        if details and details.isUsed then
            props = details.properties
            if result.plate and type(props) == "table" then props.plate = result.plate end
        end
        SpawnPurchasedVehicle(result.model, spawnPoint, color, secColor, props, result.plate)
    end

    -- Now fade in with player already in the vehicle
    DoScreenFadeIn(500)

    ShowNotification(_L("showroom_purchase_success", result.label or result.model))
    cb(result)
end)

-- Finance a vehicle: create loan, exit showroom, spawn vehicle
RegisterNUICallback("showroomFinance", function(data, cb)
    if not ShowroomState then cb({ success = false }) return end

    local result = lib.callback.await("pickle_dealerships:createFinancing", false, {
        dealershipId = data.dealershipId,
        stockId = data.stockId,
        downPayment = data.downPayment,
        installments = data.installments,
    })

    if not result or not result.success then
        ShowNotification(result and result.message or _L("showroom_financing_failed"))
        cb(result or { success = false })
        return
    end

    local location = data.location
    CleanupShowroom(true)

    local cfg = DealershipConfigs[location]
    local spawnPoint = cfg and cfg.spawnPoint
    if spawnPoint then
        local props = nil
        if result.isUsed and result.properties then
            props = result.properties
            if type(props) == "string" then props = json.decode(props) end
            if type(props) == "table" and result.plate then props.plate = result.plate end
        end
        SpawnPurchasedVehicle(result.model, spawnPoint, nil, nil, props, result.plate)
    end

    DoScreenFadeIn(500)
    ShowNotification(_L("showroom_financed",
        result.label, GetCurrencyString(result.downPayment),
        result.totalInstallments, GetCurrencyString(result.installmentAmount)
    ))
    cb(result)
end)

RegisterNUICallback("showroomClose", function(_, cb)
    CleanupShowroom()
    cb({})
end)

-- Claim an auction vehicle: close showroom, teleport to dealership spawn, spawn vehicle, warp in
RegisterNUICallback("showroomClaimAuction", function(data, cb)
    local ok, result = lib.callback.await("pickle_dealerships:claimAuctionVehicle", false, {
        auctionId = tonumber(data.auctionId),
        toGarage = data.toGarage == true,
    })
    if not ok then
        ShowNotification(result or _L("auction_claim_failed"))
        cb({ success = false })
        return
    end

    -- Send to garage — no spawn needed, stay in showroom
    if data.toGarage then
        ShowNotification(_L("showroom_sent_to_garage", result.label or "vehicle"))
        cb({ success = true, toGarage = true })
        return
    end

    -- Claim vehicle — exit showroom, spawn at dealership
    local locationKey = result.dealershipLocation
    local targetCfg = locationKey and DealershipConfigs[locationKey] or nil

    CleanupShowroom(true) -- keep screen faded out

    if targetCfg and targetCfg.spawnPoint then
        local sp = targetCfg.spawnPoint
        local ped = PlayerPedId()
        SetEntityCoords(ped, sp.x, sp.y, sp.z, false, false, false, true)
        RequestCollisionAtCoord(sp.x, sp.y, sp.z)
        Wait(500)

        local props = result.properties
        if type(props) == "string" then props = json.decode(props) end
        SpawnPurchasedVehicle(result.model, sp, nil, nil, props, result.plate)
        ShowNotification(_L("showroom_claimed", result.label or result.model))
    else
        ShowNotification(_L("showroom_claimed_no_spawn"))
    end

    DoScreenFadeIn(500)
    cb({ success = true })
end)


-- Cleanup on resource stop
AddEventHandler('onResourceStop', function(resourceName)
    if resourceName ~= GetCurrentResourceName() then return end
    if ShowroomState then
        if ShowroomState.vehicle and DoesEntityExist(ShowroomState.vehicle) then
            DeleteEntity(ShowroomState.vehicle)
        end
        if ShowroomState.cam then
            RenderScriptCams(false, false, 0, true, true)
            DestroyCam(ShowroomState.cam, false)
        end
        ShowroomState = nil
    end
end)
