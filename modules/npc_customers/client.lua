local activeNPCs = {}
local npcSpawnTimer = 0
local currentNPCInteraction = nil
local isOnDuty = false
local currentDealershipId = nil
local currentLocationKey = nil
local currentDealershipName = nil
local npcCam = nil

-- NPC Showroom state
local NPCShowroomState = nil
local NPCShowroomInput = { lookX = 0.0, lookY = 0.0, dragging = false, zoom = 0.0 }
local NPCShowroomCamThread = nil

--- Create a camera focused on the NPC for greeting
local function StartNPCCamera(npcPed)
    if npcCam then DestroyCam(npcCam, false) end

    local playerPed = PlayerPedId()
    local npcCoords = GetEntityCoords(npcPed)
    local playerCoords = GetEntityCoords(playerPed)

    local midX = (npcCoords.x + playerCoords.x) / 2
    local midY = (npcCoords.y + playerCoords.y) / 2
    local dx = npcCoords.x - playerCoords.x
    local dy = npcCoords.y - playerCoords.y
    local dist = math.sqrt(dx * dx + dy * dy)
    local perpX = -dy / dist * 0.8
    local perpY = dx / dist * 0.8

    npcCam = CreateCam("DEFAULT_SCRIPTED_CAMERA", true)
    SetCamCoord(npcCam, midX + perpX, midY + perpY, npcCoords.z + 0.5)
    PointCamAtCoord(npcCam, npcCoords.x, npcCoords.y, npcCoords.z + 0.3)
    SetCamActive(npcCam, true)
    RenderScriptCams(true, true, 800, true, true)
end

local function StopNPCCamera()
    if npcCam then
        RenderScriptCams(false, true, 800, true, true)
        DestroyCam(npcCam, false)
        npcCam = nil
    end
end

--- Start orbit camera thread for NPC showroom
local function StartNPCShowroomCamThread()
    if NPCShowroomCamThread then return end
    NPCShowroomCamThread = true
    NPCShowroomInput = { lookX = 0.0, lookY = 0.0, dragging = false, zoom = 0.0 }

    CreateThread(function()
        local orbitSensitivity = 0.005
        local zoomSpeed = 0.5
        local minRadius = 2.5
        local maxRadius = 15.0
        local smoothing = 0.15

        local smoothAngle = NPCShowroomState and NPCShowroomState.orbitAngle or 0
        local smoothPitch = NPCShowroomState and NPCShowroomState.orbitPitch or 0
        local smoothRadius = NPCShowroomState and NPCShowroomState.orbitRadius or 6

        while NPCShowroomState and NPCShowroomCamThread do
            local s = NPCShowroomState
            if not s or not s.cam then break end

            local inp = NPCShowroomInput
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
        NPCShowroomCamThread = nil
    end)
end

--- Clean up the NPC showroom state
local function CleanupNPCShowroom(skipFadeIn)
    if not NPCShowroomState then return end

    NPCShowroomCamThread = nil
    CloseNui()

    DoScreenFadeOut(500)
    while not IsScreenFadedOut() do Wait(0) end

    -- Delete display vehicle
    if NPCShowroomState.vehicle and DoesEntityExist(NPCShowroomState.vehicle) then
        DeleteEntity(NPCShowroomState.vehicle)
    end

    -- Destroy camera
    RenderScriptCams(false, false, 0, true, true)
    if NPCShowroomState.cam then
        DestroyCam(NPCShowroomState.cam, false)
    end

    -- Restore player
    local ped = PlayerPedId()
    SetEntityCoords(ped, NPCShowroomState.savedPlayerCoords.x, NPCShowroomState.savedPlayerCoords.y, NPCShowroomState.savedPlayerCoords.z, false, false, false, false)
    SetEntityHeading(ped, NPCShowroomState.savedPlayerHeading)
    FreezeEntityPosition(ped, false)
    SetEntityVisible(ped, true, false)

    -- Restore NPC position
    local npcPed = NPCShowroomState.npcEntity
    if npcPed and DoesEntityExist(npcPed) then
        FreezeEntityPosition(npcPed, false)
        SetEntityCoords(npcPed, NPCShowroomState.savedNPCCoords.x, NPCShowroomState.savedNPCCoords.y, NPCShowroomState.savedNPCCoords.z, false, false, false, false)
    end

    DisplayRadar(true)
    DisplayHud(true)

    NPCShowroomState = nil

    if not skipFadeIn then
        DoScreenFadeIn(500)
        while not IsScreenFadedIn() do Wait(0) end
    end
end

--- Clean up a single NPC
local function CleanupNPC(npcData)
    if npcData.interaction then
        DeleteInteraction(npcData.interaction)
    end
    if npcData.entity and DoesEntityExist(npcData.entity) then
        DeleteEntity(npcData.entity)
    end
end

--- Clean up all active NPCs
local function CleanupAllNPCs()
    for i = #activeNPCs, 1, -1 do
        CleanupNPC(activeNPCs[i])
        table.remove(activeNPCs, i)
    end
    StopNPCCamera()
    if NPCShowroomState then CleanupNPCShowroom() end
    DisplayRadar(true)
    DisplayHud(true)
    currentNPCInteraction = nil
end

--- Dismiss the current NPC interaction target
local function DismissNPC(npcData)
    if not npcData or not npcData.entity or not DoesEntityExist(npcData.entity) then return end

    local ped = npcData.entity
    ClearPedTasks(ped)
    TaskWanderStandard(ped, 10.0, 10)

    if npcData.interaction then
        DeleteInteraction(npcData.interaction)
        npcData.interaction = nil
    end

    SetTimeout(10000, function()
        if DoesEntityExist(ped) then DeleteEntity(ped) end
        for i = #activeNPCs, 1, -1 do
            if activeNPCs[i].entity == ped then
                table.remove(activeNPCs, i)
                break
            end
        end
    end)
end

local function FindNPCByEntity(entity)
    for _, npc in ipairs(activeNPCs) do
        if npc.entity == entity then return npc end
    end
    return nil
end

--- Spawn an NPC customer at the dealership
local function SpawnNPCCustomer(dealershipId, dealershipConfig)
    local profile = lib.callback.await("pickle_dealerships:generateNPCCustomer", false, dealershipId)
    if not profile then return end

    local spawnPoints = dealershipConfig.npcSpawnPoints
    if not spawnPoints or #spawnPoints == 0 then return end

    -- Find spawn points not already occupied by an active NPC
    -- Check both by tracked index AND by proximity (in case of edge cases)
    local occupiedPoints = {}
    for _, npc in ipairs(activeNPCs) do
        if npc.spawnPointIndex then
            occupiedPoints[npc.spawnPointIndex] = true
        end
        -- Also block by proximity to any living NPC
        if npc.entity and DoesEntityExist(npc.entity) then
            local npcCoords = GetEntityCoords(npc.entity)
            for i = 1, #spawnPoints do
                local sp = spawnPoints[i]
                if #(npcCoords - vector3(sp.x, sp.y, sp.z)) < 5.0 then
                    occupiedPoints[i] = true
                end
            end
        end
    end

    local availableIndices = {}
    for i = 1, #spawnPoints do
        if not occupiedPoints[i] then
            availableIndices[#availableIndices + 1] = i
        end
    end

    if #availableIndices == 0 then return end -- all spawn points occupied

    local chosenIndex = availableIndices[math.random(#availableIndices)]
    local spawnPoint = spawnPoints[chosenIndex]

    local model = profile.pedModel
    if not IsModelInCdimage(GetHashKey(model)) then
        model = "a_m_y_business_01"
    end

    local ped = CreateNPC(model, spawnPoint.x, spawnPoint.y, spawnPoint.z, spawnPoint.w or 0.0)
    if not ped then return end

    SetBlockingOfNonTemporaryEvents(ped, true)
    SetPedFleeAttributes(ped, 0, false)
    SetPedCombatAttributes(ped, 46, true)
    FreezeEntityPosition(ped, false)

    local waitingAreas = dealershipConfig.npcWaitingArea or dealershipConfig.npcSpawnPoints
    if waitingAreas and #waitingAreas > 0 then
        local dest = waitingAreas[math.random(#waitingAreas)]
        TaskGoStraightToCoord(ped, dest.x, dest.y, dest.z, 1.0, -1, 0.0, 0.0)
    end

    local pedCoords = GetEntityCoords(ped)
    local interactionId = CreateInteraction({
        label = _L("interact_assist_customer"),
        icon = Config.TargetIcons.npc_customer,
        coords = vector3(pedCoords.x, pedCoords.y, pedCoords.z),
        distance = 2.5,
        targetPed = ped,
    }, function()
        if currentNPCInteraction then
            ShowNotification("You are already assisting a customer.")
            return
        end

        local npcData = FindNPCByEntity(ped)
        if not npcData then return end

        currentNPCInteraction = {
            npcEntity    = ped,
            profile      = npcData.profile,
            dealershipId = dealershipId,
            npcData      = npcData,
        }

        ClearPedTasks(ped)
        TaskTurnPedToFaceEntity(ped, PlayerPedId(), 2000)
        npcData.assisted = true

        Wait(500)
        StartNPCCamera(ped)
        DisplayRadar(false)
        DisplayHud(false)

        local typePref = npcData.profile.typePreference or "default"
        local greetingPool = Config.NPCCustomers.greetings and (Config.NPCCustomers.greetings[typePref] or Config.NPCCustomers.greetings["default"])
        local greeting = greetingPool and greetingPool[math.random(#greetingPool)] or "Hi, I'm looking for a vehicle."
        currentNPCInteraction.greeting = greeting

        SendNUIMessage({
            type = "openNPCNegotiation",
            profile = npcData.profile,
            greeting = greeting,
            accentColor = Config.UI and Config.UI.accentColor or "#e11d48",
        })
        SetNuiFocus(true, true)
    end)

    local npcData = {
        entity          = ped,
        profile         = profile,
        interaction     = interactionId,
        spawnTime       = GetGameTimer(),
        assisted        = false,
        dealershipId    = dealershipId,
        spawnPointIndex = chosenIndex,
    }
    table.insert(activeNPCs, npcData)

    CreateThread(function()
        local waitTime = profile.patienceTime * 1000
        local startTime = GetGameTimer()
        while DoesEntityExist(ped) and not npcData.assisted do
            Wait(1000)
            if GetGameTimer() - startTime >= waitTime then
                DismissNPC(npcData)
                return
            end
        end
    end)
end

--- NPC spawning thread
local function StartNPCSpawnLoop(dealershipId, dealershipConfig)
    CreateThread(function()
        while isOnDuty and currentDealershipId == dealershipId do
            local spawnInterval = Config.NPCCustomers.spawnInterval or {}
            local minInterval = (spawnInterval.min or 60) * 1000
            local maxInterval = (spawnInterval.max or 180) * 1000
            Wait(math.random(minInterval, maxInterval))

            if not isOnDuty or currentDealershipId ~= dealershipId then break end

            local maxConcurrent = Config.NPCCustomers.maxConcurrent or 3
            if #activeNPCs < maxConcurrent then
                SpawnNPCCustomer(dealershipId, dealershipConfig)
            end
        end
    end)
end

RegisterNetEvent("pickle_dealerships:npc:startDuty", function(dealershipId, dealershipConfig)
    isOnDuty = true
    currentDealershipId = dealershipId
    currentLocationKey = dealershipConfig.location
    currentDealershipName = dealershipConfig.dealershipName or 'Dealership'
    StartNPCSpawnLoop(dealershipId, dealershipConfig)
end)

RegisterNetEvent("pickle_dealerships:npc:stopDuty", function()
    isOnDuty = false
    currentDealershipId = nil
    currentLocationKey = nil
    currentDealershipName = nil
    CleanupAllNPCs()
end)

-- ─── NUI Callbacks ──────────────────────────────────────────────────────────

--- Transition from greeting to showroom mode
RegisterNUICallback("npcStartShowroom", function(_, cb)
    if not currentNPCInteraction then return cb({ success = false }) end

    local locationKey = currentLocationKey
    if not locationKey then return cb({ success = false, message = "No location." }) end

    local cfg = DealershipConfigs[locationKey]
    local showroomCoords = cfg and cfg.interactionPoints and cfg.interactionPoints.showroom
    local spawnCoords = showroomCoords and vector4(showroomCoords.x, showroomCoords.y, showroomCoords.z, showroomCoords.w or 0.0)
        or (cfg and cfg.spawnPoint)

    if not spawnCoords then return cb({ success = false, message = "No showroom position." }) end

    -- Close greeting NUI
    SendNUIMessage({ type = "closeNPCNegotiation" })
    SetNuiFocus(false, false)

    local npcPed = currentNPCInteraction.npcEntity
    local playerPed = PlayerPedId()

    -- Save positions
    local savedPlayerCoords = GetEntityCoords(playerPed)
    local savedPlayerHeading = GetEntityHeading(playerPed)
    local savedNPCCoords = GetEntityCoords(npcPed)

    -- Fade out
    DoScreenFadeOut(500)
    while not IsScreenFadedOut() do Wait(0) end

    StopNPCCamera()

    -- Hide and freeze player
    FreezeEntityPosition(playerPed, true)
    SetEntityVisible(playerPed, false, false)

    -- Teleport NPC next to showroom position (offset to the side)
    local npcOffset = vector3(spawnCoords.x + 2.0, spawnCoords.y + 1.0, spawnCoords.z)
    SetEntityCoords(npcPed, npcOffset.x, npcOffset.y, npcOffset.z, false, false, false, false)
    FreezeEntityPosition(npcPed, true)
    local headingToVeh = math.deg(math.atan(spawnCoords.y - npcOffset.y, spawnCoords.x - npcOffset.x)) + 90
    SetEntityHeading(npcPed, headingToVeh)

    -- Create orbit camera at showroom position (no vehicle yet)
    local initAngle = math.rad(225.0)
    local defaultRadius = 6.0
    local center = vector3(spawnCoords.x, spawnCoords.y, spawnCoords.z + 0.5)
    local camX = center.x + defaultRadius * math.cos(initAngle)
    local camY = center.y + defaultRadius * math.sin(initAngle)
    local cam = CreateCam("DEFAULT_SCRIPTED_CAMERA", true)
    SetCamCoord(cam, camX, camY, center.z)
    PointCamAtCoord(cam, center.x, center.y, center.z)
    SetCamActive(cam, true)
    RenderScriptCams(true, false, 0, true, true)

    NPCShowroomState = {
        vehicle = nil,
        cam = cam,
        spawnCoords = spawnCoords,
        savedPlayerCoords = savedPlayerCoords,
        savedPlayerHeading = savedPlayerHeading,
        savedNPCCoords = savedNPCCoords,
        npcEntity = npcPed,
        currentModel = nil,
        orbitAngle = initAngle,
        orbitPitch = 0.0,
        orbitRadius = defaultRadius,
        defaultRadius = defaultRadius,
        targetCenter = center,
        locationKey = locationKey,
    }

    StartNPCShowroomCamThread()

    -- Open NPC showroom NUI
    SendNUIMessage({
        type = "openNPCShowroom",
        profile = currentNPCInteraction.profile,
        greeting = currentNPCInteraction.greeting or "",
        dealershipId = currentNPCInteraction.dealershipId,
        location = locationKey,
        dealershipName = currentDealershipName,
        accentColor = Config.UI and Config.UI.accentColor or "#e11d48",
    })
    SetNuiFocus(true, true)

    DoScreenFadeIn(500)

    cb({ success = true })
end)

--- Swap vehicle in NPC showroom
RegisterNUICallback("npcShowroomSwapVehicle", function(data, cb)
    if not NPCShowroomState then cb({ success = false }) return end

    local model = data.model
    if model == NPCShowroomState.currentModel then return cb({ success = true }) end

    -- Load new model before deleting old
    local modelHash = type(model) == "string" and joaat(model) or model
    RequestModel(modelHash)
    local timeout = GetGameTimer() + 10000
    while not HasModelLoaded(modelHash) and GetGameTimer() < timeout do Wait(0) end
    if not HasModelLoaded(modelHash) then return cb({ success = false }) end

    -- Delete old vehicle
    if NPCShowroomState.vehicle and DoesEntityExist(NPCShowroomState.vehicle) then
        DeleteEntity(NPCShowroomState.vehicle)
    end

    -- Spawn new one using the global SpawnShowroomVehicle
    local veh, center, radius = SpawnShowroomVehicle(model, NPCShowroomState.spawnCoords)
    if not veh then return cb({ success = false }) end

    NPCShowroomState.vehicle = veh
    NPCShowroomState.currentModel = model
    NPCShowroomState.targetCenter = center
    NPCShowroomState.orbitRadius = radius
    NPCShowroomState.defaultRadius = radius

    cb({ success = true })
end)

--- Orbit camera input for NPC showroom
RegisterNUICallback("npcShowroomOrbitInput", function(data, cb)
    if NPCShowroomState then
        if data.lookX then NPCShowroomInput.lookX = NPCShowroomInput.lookX + (tonumber(data.lookX) or 0.0) end
        if data.lookY then NPCShowroomInput.lookY = NPCShowroomInput.lookY + (tonumber(data.lookY) or 0.0) end
        if data.dragging ~= nil then NPCShowroomInput.dragging = data.dragging end
        if data.zoom then NPCShowroomInput.zoom = NPCShowroomInput.zoom + (tonumber(data.zoom) or 0.0) end
    end
    cb({})
end)

--- Present vehicle to NPC (evaluation)
RegisterNUICallback("presentVehicle", function(data, cb)
    if not currentNPCInteraction then
        return cb({ success = false, message = "No active NPC interaction." })
    end

    local result = lib.callback.await("pickle_dealerships:evaluateVehicleMatch", false, {
        npcProfile = currentNPCInteraction.profile,
        stockItem  = data.stockItem,
    })

    if result then
        cb({ success = true, quality = result.quality, score = result.score, dialogue = result.dialogue, openingOffer = result.openingOffer })
    else
        cb({ success = false, message = "Failed to evaluate vehicle." })
    end
end)

--- Evaluate a price offer from the player
RegisterNUICallback("npcEvaluateOffer", function(data, cb)
    if not currentNPCInteraction then
        return cb({ success = false, message = "No active NPC interaction." })
    end

    local result = lib.callback.await("pickle_dealerships:evaluateOffer", false, {
        npcProfile    = currentNPCInteraction.profile,
        offerPrice    = data.offerPrice,
        currentStress = data.currentStress,
    })

    if result then
        -- Animate NPC based on result
        local ped = NPCShowroomState and NPCShowroomState.npcEntity or currentNPCInteraction.npcEntity
        if ped and DoesEntityExist(ped) then
            if result.accepted then
                TaskPlayAnim(ped, "gestures@m@standing@casual", "gesture_you_welcome", 8.0, -8.0, 2000, 49, 0, false, false, false)
            elseif result.walkaway then
                TaskPlayAnim(ped, "gestures@m@standing@casual", "gesture_hand_down", 8.0, -8.0, 2000, 49, 0, false, false, false)
            elseif result.stress >= 70 then
                TaskPlayAnim(ped, "gestures@m@standing@casual", "gesture_shrug_hard", 8.0, -8.0, 2000, 49, 0, false, false, false)
            end
        end

        cb({
            success       = true,
            accepted      = result.accepted,
            walkaway      = result.walkaway,
            stress        = result.stress,
            stressIncrease = result.stressIncrease,
            dialogue      = result.dialogue,
        })
    else
        cb({ success = false, message = "Evaluation failed." })
    end
end)

--- Complete the NPC sale with drive-off
RegisterNUICallback("completeNPCSale", function(data, cb)
    if not currentNPCInteraction then
        return cb({ success = false, message = "No active NPC interaction." })
    end

    local result = lib.callback.await("pickle_dealerships:completeNPCSale", false, {
        dealershipId = currentNPCInteraction.dealershipId,
        stockId      = data.stockId,
        saleAmount   = data.saleAmount,
        npcProfile   = currentNPCInteraction.profile,
    })

    if result and result.success then
        ShowNotification(result.message)

        local vehicleModel = data.vehicleModel
        local npcPed = NPCShowroomState and NPCShowroomState.npcEntity or currentNPCInteraction.npcEntity
        local locationKey = NPCShowroomState and NPCShowroomState.locationKey or currentLocationKey

        -- Clean up showroom, keep screen faded
        if NPCShowroomState then
            CleanupNPCShowroom(true)
        else
            StopNPCCamera()
            DoScreenFadeOut(500)
            while not IsScreenFadedOut() do Wait(0) end
        end

        SendNUIMessage({ type = "closeNPCShowroom" })
        SetNuiFocus(false, false)

        -- Spawn a driveable vehicle at the dealership spawn point
        local cfg = DealershipConfigs[locationKey]
        local spawnPoint = cfg and cfg.spawnPoint
        local driveVeh = nil

        if spawnPoint and vehicleModel then
            local modelHash = joaat(vehicleModel)
            RequestModel(modelHash)
            while not HasModelLoaded(modelHash) do Wait(0) end
            driveVeh = CreateVeh(modelHash, spawnPoint.x, spawnPoint.y, spawnPoint.z, spawnPoint.w or 0.0, false, false)
            SetVehicleOnGroundProperly(driveVeh)
            SetModelAsNoLongerNeeded(modelHash)
        end

        -- Position NPC near vehicle
        if npcPed and DoesEntityExist(npcPed) then
            FreezeEntityPosition(npcPed, false)
            if spawnPoint then
                SetEntityCoords(npcPed, spawnPoint.x + 1.5, spawnPoint.y, spawnPoint.z, false, false, false, false)
            end
        end

        DisplayRadar(true)
        DisplayHud(true)

        -- Fade in
        DoScreenFadeIn(500)
        while not IsScreenFadedIn() do Wait(0) end

        -- NPC enters vehicle and drives off
        if driveVeh and npcPed and DoesEntityExist(npcPed) and DoesEntityExist(driveVeh) then
            TaskEnterVehicle(npcPed, driveVeh, 5000, -1, 2.0, 1, 0)
            Wait(6000)
            TaskVehicleDriveWander(npcPed, driveVeh, 20.0, 786603)

            -- Cleanup after NPC drives away
            SetTimeout(30000, function()
                if DoesEntityExist(driveVeh) then DeleteEntity(driveVeh) end
                if DoesEntityExist(npcPed) then DeleteEntity(npcPed) end
            end)
        end

        -- Remove from active NPCs
        if currentNPCInteraction and currentNPCInteraction.npcData then
            for i = #activeNPCs, 1, -1 do
                if activeNPCs[i].entity == currentNPCInteraction.npcData.entity then
                    if activeNPCs[i].interaction then DeleteInteraction(activeNPCs[i].interaction) end
                    table.remove(activeNPCs, i)
                    break
                end
            end
        end

        currentNPCInteraction = nil
        cb({ success = true, saleAmount = result.saleAmount, commission = result.commission })
    else
        cb({ success = false, message = result and result.message or "Sale failed." })
    end
end)

--- Dismiss the NPC and close interaction
RegisterNUICallback("dismissNPC", function(_, cb)
    -- Clean up NPC showroom if active
    if NPCShowroomState then
        CleanupNPCShowroom()
    else
        StopNPCCamera()
    end

    SendNUIMessage({ type = "closeNPCNegotiation" })
    SendNUIMessage({ type = "closeNPCShowroom" })
    SetNuiFocus(false, false)
    DisplayRadar(true)
    DisplayHud(true)

    if currentNPCInteraction then
        DismissNPC(currentNPCInteraction.npcData)
        currentNPCInteraction = nil
    end

    cb({ success = true })
end)

--- Cleanup on resource stop
AddEventHandler("onResourceStop", function(resourceName)
    if resourceName ~= GetCurrentResourceName() then return end
    CleanupAllNPCs()
    if NPCShowroomState then
        if NPCShowroomState.vehicle and DoesEntityExist(NPCShowroomState.vehicle) then
            DeleteEntity(NPCShowroomState.vehicle)
        end
        if NPCShowroomState.cam then
            RenderScriptCams(false, false, 0, true, true)
            DestroyCam(NPCShowroomState.cam, false)
        end
        NPCShowroomState = nil
    end
end)
