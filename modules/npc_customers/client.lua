local activeNPCs = {}
local npcSpawnTimer = 0
local currentNPCInteraction = nil
local isOnDuty = false
local currentDealershipId = nil

--- Clean up a single NPC
---@param npcData table
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
    currentNPCInteraction = nil
end

--- Dismiss the current NPC interaction target
---@param npcData table
local function DismissNPC(npcData)
    if not npcData or not npcData.entity or not DoesEntityExist(npcData.entity) then return end

    -- Make NPC walk away
    local ped = npcData.entity
    ClearPedTasks(ped)
    TaskWanderStandard(ped, 10.0, 10)

    -- Remove interaction
    if npcData.interaction then
        DeleteInteraction(npcData.interaction)
        npcData.interaction = nil
    end

    -- Delayed cleanup
    SetTimeout(10000, function()
        if DoesEntityExist(ped) then
            DeleteEntity(ped)
        end
        for i = #activeNPCs, 1, -1 do
            if activeNPCs[i].entity == ped then
                table.remove(activeNPCs, i)
                break
            end
        end
    end)
end

--- Find NPC data by entity handle
---@param entity number
---@return table|nil
local function FindNPCByEntity(entity)
    for _, npc in ipairs(activeNPCs) do
        if npc.entity == entity then
            return npc
        end
    end
    return nil
end

--- Spawn an NPC customer at the dealership
---@param dealershipId number
---@param dealershipConfig table
local function SpawnNPCCustomer(dealershipId, dealershipConfig)
    local profile = lib.callback.await("pickle_dealerships:generateNPCCustomer", false, dealershipId)
    if not profile then
        debugPrint("Failed to generate NPC profile")
        return
    end

    -- Pick a random spawn point
    local spawnPoints = dealershipConfig.npcSpawnPoints
    if not spawnPoints or #spawnPoints == 0 then
        debugPrint("No NPC spawn points configured for dealership " .. dealershipId)
        return
    end
    local spawnPoint = spawnPoints[math.random(#spawnPoints)]

    -- Load and create the ped
    local model = profile.pedModel
    if not IsModelInCdimage(GetHashKey(model)) then
        model = "a_m_y_business_01"
    end

    local ped = CreateNPC(model, spawnPoint.x, spawnPoint.y, spawnPoint.z, spawnPoint.w or 0.0)
    if not ped then
        debugPrint("Failed to create NPC ped")
        return
    end

    -- Set ped properties
    SetBlockingOfNonTemporaryEvents(ped, true)
    SetPedFleeAttributes(ped, 0, false)
    SetPedCombatAttributes(ped, 46, true)
    FreezeEntityPosition(ped, false)

    -- Walk to a display vehicle or waiting area
    local waitingAreas = dealershipConfig.npcWaitingArea or dealershipConfig.npcSpawnPoints
    if waitingAreas and #waitingAreas > 0 then
        local dest = waitingAreas[math.random(#waitingAreas)]
        TaskGoStraightToCoord(ped, dest.x, dest.y, dest.z, 1.0, -1, 0.0, 0.0)
    end

    -- Create interaction zone for the NPC
    local interactionId = "npc_customer_" .. ped
    CreateInteraction(interactionId, ped, {
        label = "Assist Customer",
        icon = "fa-solid fa-comments",
        distance = 2.5,
        onSelect = function()
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

            -- Stop NPC from wandering
            ClearPedTasks(ped)
            TaskTurnPedToFaceEntity(ped, PlayerPedId(), 2000)

            -- Cancel patience timer
            npcData.assisted = true

            -- Send NUI message to open negotiation UI
            local greetings = {
                easygoing  = "Hey there! I'm looking to buy a vehicle today. What do you have?",
                impatient  = "I don't have all day. Show me something good.",
                aggressive = "I want the best deal you've got. Don't try to rip me off.",
                shy        = "Um, hi... I was wondering if you could help me find a car?",
                savvy      = "I've done my research. Let's see what you've got on the lot.",
            }
            local greeting = greetings[npcData.profile.personality] or "Hi, I'm looking for a vehicle."

            SendNUIMessage({
                type = "openNPCNegotiation",
                profile = npcData.profile,
                greeting = greeting,
            })
            SetNuiFocus(true, true)
        end,
    })

    local npcData = {
        entity       = ped,
        profile      = profile,
        interaction  = interactionId,
        spawnTime    = GetGameTimer(),
        assisted     = false,
        dealershipId = dealershipId,
    }
    table.insert(activeNPCs, npcData)

    -- Patience timer: NPC leaves if not assisted
    CreateThread(function()
        local waitTime = profile.patienceTime * 1000
        local startTime = GetGameTimer()
        while DoesEntityExist(ped) and not npcData.assisted do
            Wait(1000)
            if GetGameTimer() - startTime >= waitTime then
                debugPrint("NPC customer left due to impatience")
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
            local interval = math.random(minInterval, maxInterval)

            Wait(interval)

            if not isOnDuty or currentDealershipId ~= dealershipId then break end

            local maxConcurrent = Config.NPCCustomers.maxConcurrent or 3
            if #activeNPCs < maxConcurrent then
                SpawnNPCCustomer(dealershipId, dealershipConfig)
            end
        end
    end)
end

--- Called when player goes on duty at a dealership
RegisterNetEvent("pickle_dealerships:npc:startDuty", function(dealershipId, dealershipConfig)
    isOnDuty = true
    currentDealershipId = dealershipId
    StartNPCSpawnLoop(dealershipId, dealershipConfig)
end)

--- Called when player goes off duty
RegisterNetEvent("pickle_dealerships:npc:stopDuty", function()
    isOnDuty = false
    currentDealershipId = nil
    CleanupAllNPCs()
end)

--- Present a vehicle to the NPC
RegisterNUICallback("presentVehicle", function(data, cb)
    if not currentNPCInteraction then
        return cb({ success = false, message = "No active NPC interaction." })
    end

    local result = lib.callback.await("pickle_dealerships:evaluateVehicleMatch", false, {
        npcProfile = currentNPCInteraction.profile,
        stockItem  = data.stockItem,
    })

    if result then
        cb({ success = true, quality = result.quality, score = result.score, dialogue = result.dialogue })
    else
        cb({ success = false, message = "Failed to evaluate vehicle." })
    end
end)

--- Send a negotiation tactic
RegisterNUICallback("negotiate", function(data, cb)
    if not currentNPCInteraction then
        return cb({ success = false, message = "No active NPC interaction." })
    end

    local result = lib.callback.await("pickle_dealerships:processNegotiation", false, {
        dealershipId = currentNPCInteraction.dealershipId,
        npcProfile   = currentNPCInteraction.profile,
        stockId      = data.stockId,
        tactic       = data.tactic,
        currentOffer = data.currentOffer,
        round        = data.round,
    })

    if result then
        -- Animate NPC based on reaction
        local ped = currentNPCInteraction.npcEntity
        if DoesEntityExist(ped) then
            if result.reaction == "positive" or result.reaction == "deal" then
                TaskPlayAnim(ped, "gestures@m@standing@casual", "gesture_you_welcome", 8.0, -8.0, 2000, 49, 0, false, false, false)
            elseif result.reaction == "negative" then
                TaskPlayAnim(ped, "gestures@m@standing@casual", "gesture_shrug_hard", 8.0, -8.0, 2000, 49, 0, false, false, false)
            elseif result.reaction == "walkaway" then
                TaskPlayAnim(ped, "gestures@m@standing@casual", "gesture_hand_down", 8.0, -8.0, 2000, 49, 0, false, false, false)
            end
        end

        cb({
            success      = true,
            newOffer     = result.newOffer,
            reaction     = result.reaction,
            emotionState = result.emotionState,
            dialogue     = result.dialogue,
            roundOver    = result.roundOver,
            saleComplete = result.saleComplete,
        })
    else
        cb({ success = false, message = "Negotiation failed." })
    end
end)

--- Complete the NPC sale
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

        -- NPC celebrates and leaves
        local ped = currentNPCInteraction.npcEntity
        if DoesEntityExist(ped) then
            TaskPlayAnim(ped, "anim@mp_player_intcelebrationmale@wave", "wave", 8.0, -8.0, 3000, 49, 0, false, false, false)
        end

        -- Dismiss NPC after short delay
        local npcData = currentNPCInteraction.npcData
        SetTimeout(3000, function()
            DismissNPC(npcData)
        end)

        -- Close NUI
        SendNUIMessage({ type = "closeNPCNegotiation" })
        SetNuiFocus(false, false)
        currentNPCInteraction = nil

        cb({ success = true, saleAmount = result.saleAmount, commission = result.commission })
    else
        cb({ success = false, message = result and result.message or "Sale failed." })
    end
end)

--- Dismiss the NPC and close interaction
RegisterNUICallback("dismissNPC", function(_, cb)
    if currentNPCInteraction then
        local npcData = currentNPCInteraction.npcData
        DismissNPC(npcData)

        SendNUIMessage({ type = "closeNPCNegotiation" })
        SetNuiFocus(false, false)
        currentNPCInteraction = nil
    end
    cb({ success = true })
end)

--- Cleanup on resource stop
AddEventHandler("onResourceStop", function(resourceName)
    if resourceName ~= GetCurrentResourceName() then return end
    CleanupAllNPCs()
end)
