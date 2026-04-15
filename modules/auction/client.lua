-- =============================================
--  pickle_dealerships | modules/auction/client.lua
--  Auction showcase: spawn at PhotoBooth class-location, orbit camera, NUI glue
-- =============================================

local AuctionState = nil
local AuctionInput = { lookX = 0.0, lookY = 0.0, dragging = false, zoom = 0.0 }
local AuctionCamThread = nil

-- Global: when true, dealership zone-exit handlers will not auto-close the NUI.
-- The showcase teleports the player out of the zone intentionally.
ImmersiveShowcaseActive = ImmersiveShowcaseActive or false

--- Pick the PhotoBooth location that matches a vehicle class (first match, falls back to any with empty classes)
local function PickPhotoBoothLocation(vehicleClass)
    if not Config.PhotoBooth or not Config.PhotoBooth.locations then return nil end
    local fallback = nil
    for _, loc in ipairs(Config.PhotoBooth.locations) do
        if not loc.classes or #loc.classes == 0 then
            fallback = fallback or loc
        else
            for _, cls in ipairs(loc.classes) do
                if cls == vehicleClass then return loc end
            end
        end
    end
    return fallback or Config.PhotoBooth.locations[1]
end

local function DestroyAuctionVehicle()
    if AuctionState and AuctionState.vehicle and DoesEntityExist(AuctionState.vehicle) then
        DeleteEntity(AuctionState.vehicle)
    end
    if AuctionState then AuctionState.vehicle = nil end
end

--- Spawn a showcase vehicle for an auction lot at the class-appropriate PhotoBooth location
local function SpawnAuctionVehicle(model, properties, vehicleClass)
    local loc = PickPhotoBoothLocation(vehicleClass or 'sedan')
    if not loc then return nil end

    local coords = loc.coords
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

    if properties then
        if type(properties) == "string" then properties = json.decode(properties) end
        if type(properties) == "table" then
            properties.plate = nil
            pcall(lib.setVehicleProperties, veh, properties)
        end
    end

    local dimMin, dimMax = GetModelDimensions(modelHash)
    local vehPos = GetEntityCoords(veh)
    local vehHeight = dimMax.z - dimMin.z
    local vehSize = math.max(dimMax.y - dimMin.y, dimMax.x - dimMin.x, vehHeight)
    local centerZ = vehPos.z + (dimMin.z + dimMax.z) * 0.5
    local center = vector3(vehPos.x, vehPos.y, centerZ)
    local radius = math.max(4.0, vehSize * 1.2)

    return veh, center, radius, coords
end

--- Orbit camera thread (mirrors showroom pattern)
local function StartAuctionCamThread()
    if AuctionCamThread then return end
    AuctionCamThread = true
    AuctionInput = { lookX = 0.0, lookY = 0.0, dragging = false, zoom = 0.0 }

    CreateThread(function()
        local orbitSensitivity = 0.005
        local zoomSpeed = 0.5
        local minRadius = 2.5
        local maxRadius = 15.0
        local smoothing = 0.15

        local s0 = AuctionState
        local smoothAngle = s0.orbitAngle
        local smoothPitch = s0.orbitPitch
        local smoothRadius = s0.orbitRadius

        while AuctionState and AuctionCamThread do
            local s = AuctionState
            if not s or not s.cam then break end
            local inp = AuctionInput

            if inp.lookX ~= 0.0 or inp.lookY ~= 0.0 then
                s.orbitAngle = s.orbitAngle - inp.lookX * orbitSensitivity
                s.orbitPitch = math.max(-0.8, math.min(0.8, s.orbitPitch - inp.lookY * orbitSensitivity))
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

            local minZ = s.spawnCoords.z + 0.3
            if camZ < minZ then camZ = minZ end

            SetCamCoord(s.cam, camX, camY, camZ)
            PointCamAtCoord(s.cam, s.targetCenter.x, s.targetCenter.y, s.targetCenter.z)
            Wait(0)
        end
        AuctionCamThread = nil
    end)
end

local function CleanupAuctionShowcase()
    if not AuctionState then return end

    AuctionCamThread = nil
    CloseNui()

    DoScreenFadeOut(500)
    while not IsScreenFadedOut() do Wait(0) end

    DestroyAuctionVehicle()

    RenderScriptCams(false, false, 0, true, true)
    if AuctionState.cam then
        DestroyCam(AuctionState.cam, false)
    end

    local ped = PlayerPedId()
    SetEntityCoords(ped, AuctionState.savedCoords.x, AuctionState.savedCoords.y, AuctionState.savedCoords.z, false, false, false, false)
    SetEntityHeading(ped, AuctionState.savedHeading)
    FreezeEntityPosition(ped, false)
    SetEntityVisible(ped, true, false)
    DisplayRadar(true)
    DisplayHud(true)

    -- Leave per-viewer routing bucket
    lib.callback.await("pickle_dealerships:auctionSetViewerBucket", false, { enter = false })

    AuctionState = nil
    ImmersiveShowcaseActive = false

    DoScreenFadeIn(500)
    while not IsScreenFadedIn() do Wait(0) end
end

--- Swap the showcase to a different auction lot
local function SwapAuctionVehicle(model, properties, vehicleClass)
    if not AuctionState then return false end

    DestroyAuctionVehicle()

    local veh, center, radius, coords = SpawnAuctionVehicle(model, properties, vehicleClass)
    if not veh then return false end

    AuctionState.vehicle = veh
    AuctionState.currentModel = model
    AuctionState.targetCenter = center
    AuctionState.orbitRadius = radius
    AuctionState.defaultRadius = radius
    AuctionState.spawnCoords = coords

    local s = AuctionState
    local camX = s.targetCenter.x + s.orbitRadius * math.cos(s.orbitAngle)
    local camY = s.targetCenter.y + s.orbitRadius * math.sin(s.orbitAngle)
    local camZ = s.targetCenter.z + s.orbitRadius * math.sin(s.orbitPitch) * 0.5
    SetCamCoord(s.cam, camX, camY, camZ)
    PointCamAtCoord(s.cam, s.targetCenter.x, s.targetCenter.y, s.targetCenter.z)

    return true
end

--- Public entry: open the auction showcase UI (from terminal or sales tablet button)
---@param locationKey string|nil  dealership location the user came from (for return teleport context)
---@param opts table|nil          { skipFadeOut = bool, savedCoords = vector3, savedHeading = number }
function OpenAuctionShowcase(locationKey, opts)
    if AuctionState then return end
    opts = opts or {}
    ImmersiveShowcaseActive = true

    local ped = PlayerPedId()
    local savedCoords = opts.savedCoords or GetEntityCoords(ped)
    local savedHeading = opts.savedHeading or GetEntityHeading(ped)

    if not opts.skipFadeOut then
        DoScreenFadeOut(500)
        while not IsScreenFadedOut() do Wait(0) end
    end

    -- Enter per-viewer routing bucket so different viewers don't see each other's cars
    lib.callback.await("pickle_dealerships:auctionSetViewerBucket", false, { enter = true })

    -- Use the first PhotoBooth location as the default/fallback stage until a lot is selected
    local defaultLoc = Config.PhotoBooth.locations[1]
    local spawnCoords = vector4(defaultLoc.coords.x, defaultLoc.coords.y, defaultLoc.coords.z, defaultLoc.coords.w or 0.0)

    -- Teleport the (invisible) player to the stage so the game streams the area around the camera
    SetEntityCoords(ped, spawnCoords.x, spawnCoords.y, spawnCoords.z, false, false, false, true)
    FreezeEntityPosition(ped, true)
    SetEntityVisible(ped, false, false)
    DisplayRadar(false)
    DisplayHud(false)

    RequestCollisionAtCoord(spawnCoords.x, spawnCoords.y, spawnCoords.z)
    NewLoadSceneStart(spawnCoords.x, spawnCoords.y, spawnCoords.z, spawnCoords.x, spawnCoords.y, spawnCoords.z, 50.0, 0)
    local loadTimeout = GetGameTimer() + 10000
    while not IsNewLoadSceneLoaded() and GetGameTimer() < loadTimeout do Wait(0) end
    NewLoadSceneStop()

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

    AuctionState = {
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
        defaultRadius = defaultRadius,
        targetCenter = center,
    }

    StartAuctionCamThread()

    OpenNui('auction', {
        dealershipId = 0,
        dealershipName = "Auction House",
        role = 'customer',
        tier = 1,
        location = locationKey or '',
    })

    DoScreenFadeIn(500)
end

-- ─── NUI Callbacks ──────────────────────────────────────────────────────────

RegisterNUICallback("openAuctionShowcase", function(data, cb)
    OpenAuctionShowcase(data and data.location)
    cb({})
end)

RegisterNUICallback("auctionSwapVehicle", function(data, cb)
    if not AuctionState then cb({ success = false }) return end
    local ok = SwapAuctionVehicle(data.model, data.properties, data.class)
    cb({ success = ok })
end)

RegisterNUICallback("auctionOrbitInput", function(data, cb)
    if AuctionState then
        if data.lookX then AuctionInput.lookX = AuctionInput.lookX + (tonumber(data.lookX) or 0.0) end
        if data.lookY then AuctionInput.lookY = AuctionInput.lookY + (tonumber(data.lookY) or 0.0) end
        if data.dragging ~= nil then AuctionInput.dragging = data.dragging end
        if data.zoom then AuctionInput.zoom = AuctionInput.zoom + (tonumber(data.zoom) or 0.0) end
    end
    cb({})
end)

RegisterNUICallback("getMyIdentifier", function(_, cb)
    local id = lib.callback.await("pickle_dealerships:getMyIdentifier", false)
    cb(id)
end)

RegisterNUICallback("getActiveAuctions", function(_, cb)
    local result = lib.callback.await("pickle_dealerships:getActiveAuctions", false)
    cb(result or {})
end)

RegisterNUICallback("getAuctionState", function(data, cb)
    local result = lib.callback.await("pickle_dealerships:getAuctionState", false, { auctionId = data.auctionId })
    cb(result)
end)

RegisterNUICallback("placeBid", function(data, cb)
    local ok, result = lib.callback.await("pickle_dealerships:placeBid", false, {
        auctionId = data.auctionId,
        amount = data.amount,
    })
    if not ok then ShowNotification(result or "Bid failed.") end
    cb({ success = ok, result = result })
end)

RegisterNUICallback("createAuction", function(data, cb)
    local ok, result = lib.callback.await("pickle_dealerships:createAuction", false, data)
    if not ok then ShowNotification(result or "Failed to list.") end
    cb({ success = ok, auctionId = ok and result or nil, message = not ok and result or nil })
end)

RegisterNUICallback("cancelAuction", function(data, cb)
    local ok, result = lib.callback.await("pickle_dealerships:cancelAuction", false, { auctionId = data.auctionId })
    if not ok then ShowNotification(result or "Cancel failed.") end
    cb({ success = ok, message = not ok and result or nil })
end)

RegisterNUICallback("getPendingPickups", function(_, cb)
    local result = lib.callback.await("pickle_dealerships:getPendingPickups", false)
    cb(result or {})
end)

RegisterNUICallback("claimAuctionVehicle", function(data, cb)
    local ok, result = lib.callback.await("pickle_dealerships:claimAuctionVehicle", false, { auctionId = data.auctionId })
    if not ok then
        ShowNotification(result or "Claim failed.")
        cb({ success = false })
        return
    end

    -- Spawn at seller dealership spawnPoint (need to resolve its location key)
    local cfgs = DealershipConfigs or {}
    local targetKey, targetCfg = nil, nil
    for key, cfg in pairs(cfgs) do
        if cfg.id == result.dealershipId then
            targetKey, targetCfg = key, cfg
            break
        end
    end

    CleanupAuctionShowcase()

    if targetCfg and targetCfg.spawnPoint then
        local props = result.properties
        if type(props) == "string" then props = json.decode(props) end
        SpawnPurchasedVehicle(result.model, targetCfg.spawnPoint, nil, nil, props, result.plate)
        ShowNotification(("Claimed %s"):format(result.label or result.model))
    else
        ShowNotification("Claimed — visit the seller dealership to pick up.")
    end
    cb({ success = true })
end)

RegisterNUICallback("auctionClose", function(_, cb)
    CleanupAuctionShowcase()
    cb({})
end)

-- ─── Server broadcast listener ──────────────────────────────────────────────

RegisterNetEvent('pickle_dealerships:auctionUpdate', function(auctionId)
    -- Forward to NUI so an open AuctionPage can refetch the lot
    SendNUIMessage({ type = 'auctionUpdate', auctionId = auctionId })
end)

RegisterNetEvent('pickle_dealerships:notify', function(msg)
    ShowNotification(msg)
end)

-- Cleanup on resource stop
AddEventHandler('onResourceStop', function(resourceName)
    if resourceName ~= GetCurrentResourceName() then return end
    if AuctionState then
        DestroyAuctionVehicle()
        if AuctionState.cam then
            RenderScriptCams(false, false, 0, true, true)
            DestroyCam(AuctionState.cam, false)
        end
        AuctionState = nil
    end
    ImmersiveShowcaseActive = false
end)
