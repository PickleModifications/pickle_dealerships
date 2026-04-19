local activeMission = nil
local missionBlip = nil
local truckEntity = nil
local trailerEntity = nil
local missionVehicles = {}

-- Depot interaction state — peds we spawn at each depot + the interaction indices CreateInteraction returned.
local depotPeds = {}
local depotInteractions = {}
local depotBlips = {}

--- Loads a model synchronously (short-circuit return nil on timeout).
local function LoadModel(modelHash)
    if not IsModelInCdimage(modelHash) then return false end
    RequestModel(modelHash)
    local t = GetGameTimer() + 10000
    while not HasModelLoaded(modelHash) and GetGameTimer() < t do Wait(0) end
    return HasModelLoaded(modelHash)
end

--- Samples the best available "condition" for payout preview.
--- Prefers an attached cargo vehicle; falls back to the trailer itself (so enclosed runs still track damage).
local function SampleVehicleCondition()
    local entity = missionVehicles[1]
    if not entity or not DoesEntityExist(entity) then entity = trailerEntity end
    if not entity or not DoesEntityExist(entity) then return 100.0 end
    local body = GetVehicleBodyHealth(entity)
    local engine = GetVehicleEngineHealth(entity)
    local worst = math.min(body, engine)
    return math.max(0.0, math.min(100.0, worst / 10.0))
end

--- Computes the damage multiplier the server will apply at completion — mirrored here so the UI preview matches.
local function ComputeDamageMult(condition)
    local cfg = activeMission and activeMission.damagePenalty
    if not cfg or not cfg.enabled then return 1.0 end
    local full = cfg.fullPayoutAboveCondition or 90
    local zero = cfg.zeroPayoutBelowCondition or 25
    if condition >= full then return 1.0 end
    if condition <= zero then return 0.0 end
    return (condition - zero) / (full - zero)
end

local function PushMissionOverlay(phase, distanceMeters, condition, damageMult)
    if not activeMission then return end
    local base = activeMission.baseFee or 0
    local streak = activeMission.streakMultiplier or 1.0
    local payoutPreview = math.floor(base * streak * damageMult)

    -- Summarize the bundle: pick the primary vehicle's label, sum qty across all lines.
    local primaryLabel, totalQty = nil, 0
    if activeMission.vehicles then
        for i, v in ipairs(activeMission.vehicles) do
            if i == 1 then primaryLabel = v.label end
            totalQty = totalQty + (v.quantity or 1)
        end
    end
    local bundledLines = activeMission.vehicles and #activeMission.vehicles or 1

    SendNUIMessage({
        type = 'missionOverlay',
        state = {
            visible = true,
            phase = phase,
            phaseKey = phase == 'pickup' and 'hud_delivery_drive_to_pickup' or 'hud_delivery_transport',
            vehicleLabel = primaryLabel,
            quantity = totalQty > 0 and totalQty or 1,
            bundledLines = bundledLines, -- the UI can show "+N more" when this is > 1
            trailerSize = activeMission.trailerPlan and activeMission.trailerPlan.size or 'enclosed',
            distanceMeters = distanceMeters,
            condition = condition,
            baseFee = base,
            streakMultiplier = streak,
            damageMultiplier = damageMult,
            payoutPreview = payoutPreview,
        }
    })
end

local function HideMissionOverlay()
    SendNUIMessage({ type = 'missionOverlay', state = { visible = false } })
end

--- Spawns truck + trailer + cargo at the depot and hitches them together, so the player can just
--- walk to the truck and drive. No more "go pick up the trailer" phase.
local function SpawnMissionRig(pickupCoords, plan, vehicles)
    local heading = pickupCoords.w or 0.0
    local cfg = (Config and Config.Trailer) or {}
    local models = cfg.models or {}

    -- Truck first — spawn at the depot coords + heading.
    local truckHash = joaat(models.truck or 'phantom')
    if LoadModel(truckHash) then
        truckEntity = CreateVeh(truckHash, vector3(pickupCoords.x, pickupCoords.y, pickupCoords.z), heading, true)
        if truckEntity and DoesEntityExist(truckEntity) then
            SetEntityAsMissionEntity(truckEntity, true, true)
            SetVehicleDoorsLocked(truckEntity, 1) -- unlocked for the driver
        end
        SetModelAsNoLongerNeeded(truckHash)
    end

    -- Trailer spawns ~10 m behind the truck so AttachVehicleToTrailer finds both in range.
    local trailerModel = type(plan.trailerModel) == 'string' and joaat(plan.trailerModel) or plan.trailerModel
    if LoadModel(trailerModel) then
        local trailerPos = truckEntity and DoesEntityExist(truckEntity)
            and GetOffsetFromEntityInWorldCoords(truckEntity, 0.0, -10.0, 0.0)
            or vector3(pickupCoords.x, pickupCoords.y, pickupCoords.z)
        trailerEntity = CreateVeh(trailerModel, trailerPos, heading, true)
        if trailerEntity and DoesEntityExist(trailerEntity) then
            SetEntityAsMissionEntity(trailerEntity, true, true)
        end
        SetModelAsNoLongerNeeded(trailerModel)
    end

    -- Hitch the trailer to the truck with a generous search radius; game engine snaps it to the hitch.
    if truckEntity and trailerEntity and DoesEntityExist(truckEntity) and DoesEntityExist(trailerEntity) then
        AttachVehicleToTrailer(truckEntity, trailerEntity, 20.0)
    end

    -- Cargo vehicles (tr2 only — enclosed trailers haul cargo "inside" with no visible attachments).
    if plan.size ~= 'enclosed' and trailerEntity and DoesEntityExist(trailerEntity) and plan.slots and #plan.slots > 0 then
        local bedBone = GetEntityBoneIndexByName(trailerEntity, 'bodyshell')
        if bedBone == -1 then bedBone = GetEntityBoneIndexByName(trailerEntity, 'chassis') end
        if bedBone == -1 then bedBone = 0 end

        for _, slot in ipairs(plan.slots) do
            local modelName = slot.model or (vehicles and vehicles[1] and vehicles[1].model)
            if modelName then
                local modelHash = joaat(modelName)
                if LoadModel(modelHash) then
                    local veh = CreateVeh(modelHash, GetEntityCoords(trailerEntity), heading, true)
                    Wait(0)
                    if veh and DoesEntityExist(veh) then
                        SetEntityAsMissionEntity(veh, true, true)
                        SetVehicleDoorsLocked(veh, 2)
                        AttachEntityToEntity(veh, trailerEntity, bedBone, slot.x, slot.y, slot.z, slot.rotX or 0.0, slot.rotY or 0.0, slot.rotZ or 0.0, false, false, false, false, 2, true)
                        FreezeEntityPosition(veh, true)
                        SetEntityInvincible(veh, true)
                        SetEntityCollision(veh, false, false)
                        missionVehicles[#missionVehicles + 1] = veh
                    end
                    SetModelAsNoLongerNeeded(modelHash)
                end
            end
        end
    end
end

--- Starts the client-side delivery mission. Player is already at the depot (they triggered this by
--- talking to the depot ped), so we spawn the truck + trailer + cargo right here and let them drive.
---@param data table Mission data from server
RegisterNetEvent('pickle_dealerships:startDeliveryMission', function(data)
    if activeMission then
        ShowNotification(_L('delivery_active'), 'error')
        return
    end

    local pickupCoords = data.pickupCoords or (data.route and (data.route.pickupCoords or data.route.pickup))
    if not pickupCoords then
        ShowNotification('Missing pickup coordinates.', 'error')
        return
    end

    activeMission = {
        deliveryId = data.deliveryId,
        locationKey = data.locationKey,
        pickupCoords = pickupCoords,
        vehicles = data.vehicles,
        dealershipCoords = data.dealershipCoords,
        trailerPlan = data.trailerPlan or { trailerModel = 'trailers', size = 'enclosed', slots = {} },
        baseFee = data.baseFee or 0,
        streakMultiplier = data.streakMultiplier or 1.0,
        damagePenalty = data.damagePenalty or { enabled = false },
    }

    SpawnMissionRig(pickupCoords, activeMission.trailerPlan, activeMission.vehicles)

    -- Dealership dropoff blip/waypoint
    local dealerCoords = data.dealershipCoords
    missionBlip = AddBlipForCoord(dealerCoords.x, dealerCoords.y, dealerCoords.z or 0.0)
    SetBlipSprite(missionBlip, 326)
    SetBlipColour(missionBlip, 2)
    SetBlipScale(missionBlip, 0.9)
    SetBlipRoute(missionBlip, true)
    SetBlipRouteColour(missionBlip, 2)
    BeginTextCommandSetBlipName('STRING')
    AddTextComponentSubstringPlayerName(_L('blip_dealership_dropoff'))
    EndTextCommandSetBlipName(missionBlip)
    SetNewWaypoint(dealerCoords.x, dealerCoords.y)

    ShowNotification(_L('delivery_vehicles_loaded'), 'success')
    CreateThread(MissionMonitorLoop)
end)

--- Main mission loop: track distance to dealership, push live overlay, trigger drop-off.
function MissionMonitorLoop()
    while activeMission do
        local playerCoords = GetEntityCoords(PlayerPedId())
        local d = activeMission.dealershipCoords
        local target = vector3(d.x, d.y, d.z or playerCoords.z)
        local dist = #(playerCoords - target)

        local condition = SampleVehicleCondition()
        local damageMult = ComputeDamageMult(condition)
        PushMissionOverlay('transport', math.floor(dist), condition, damageMult)

        if dist < 25.0 then OnArriveAtDealership() end

        Wait(500)
    end
end

--- Called when the player arrives at the dealership with the trailer
function OnArriveAtDealership()
    if not activeMission then return end

    -- Check if player is in or near a vehicle (should be driving the trailer)
    local ped = PlayerPedId()
    local currentVehicle = GetVehiclePedIsIn(ped, false)

    if currentVehicle == 0 then
        -- Player is on foot, check if trailer is nearby
        if trailerEntity and DoesEntityExist(trailerEntity) then
            local trailerCoords = GetEntityCoords(trailerEntity)
            local playerCoords = GetEntityCoords(ped)
            local dist = #(playerCoords - trailerCoords)

            if dist > 30.0 then
                return -- Trailer is too far
            end
        else
            return
        end
    end

    ShowNotification(_L('delivery_arriving'), 'info')

    -- Shared sampler handles both tr2-cargo and enclosed-trailer fallbacks.
    local condition = SampleVehicleCondition()
    local result, err = lib.callback.await('pickle_dealerships:completeDelivery', false, activeMission.deliveryId, condition)
    if result then
        ShowNotification(_L('delivery_complete_client'), 'success')
        if type(result) == 'table' and result.payout and result.payout > 0 then
            ShowNotification(_L('delivery_payout_received', result.payout), 'success')
        end
    else
        ShowNotification(err or _L('delivery_complete_failed'), 'error')
    end

    CleanupMission()
end

--- Cleans up all mission entities and state
function CleanupMission()
    if missionBlip then
        RemoveBlip(missionBlip)
        missionBlip = nil
    end

    for _, veh in ipairs(missionVehicles) do
        if DoesEntityExist(veh) then DeleteEntity(veh) end
    end
    missionVehicles = {}

    if trailerEntity and DoesEntityExist(trailerEntity) then
        DeleteEntity(trailerEntity)
        trailerEntity = nil
    end

    if truckEntity and DoesEntityExist(truckEntity) then
        DeleteEntity(truckEntity)
        truckEntity = nil
    end

    activeMission = nil
    HideMissionOverlay()
end

--- Cancel/fail delivery via command or event
RegisterNetEvent('pickle_dealerships:cancelDelivery', function()
    if not activeMission then return end

    lib.callback.await('pickle_dealerships:failDelivery', false, activeMission.deliveryId)
    ShowNotification(_L('delivery_cancelled'), 'error')
    CleanupMission()
end)

--- Cleanup on resource stop
AddEventHandler('onResourceStop', function(resourceName)
    if resourceName ~= GetCurrentResourceName() then return end
    CleanupMission()
end)

--- Notify the driver when they hit a new progression tier
RegisterNetEvent('pickle_dealerships:driverLevelUp', function(newLevel)
    ShowNotification(_L('delivery_level_up', newLevel), 'success')
end)

--- Push live queue refreshes to any open UI so Local offers appear/disappear in real time
RegisterNetEvent('pickle_dealerships:deliveryQueueChanged', function()
    SendNUIMessage({ type = 'deliveryQueueChanged' })
end)

--- Depot ped interaction: the player targets the ped at a depot, selects "Start Delivery", which
--- opens the queue UI. depotId is threaded through so acceptDelivery uses THIS depot (not closest).
local function OpenDepotQueue(depotId)
    local data = lib.callback.await('pickle_dealerships:getDeliveryQueue', false)
    if not data then
        ShowNotification(_L('delivery_queue_empty'), 'error')
        return
    end
    OpenNui('deliveries', { deliveryQueue = data, depotId = depotId })
end

RegisterNUICallback('acceptDelivery', function(payload, cb)
    local arg = payload.orderIds or payload.orderId
    local ok, err = lib.callback.await('pickle_dealerships:acceptDelivery', false, arg, payload.depotId)
    cb({ ok = ok, err = err })
    if ok then SetNuiFocus(false, false) end
end)

RegisterNUICallback('getDeliveryQueue', function(_, cb)
    local data = lib.callback.await('pickle_dealerships:getDeliveryQueue', false)
    cb(data or { ['local'] = {}, premium = {}, driver = { level = 1, xp = 0, streak = 0, streakMultiplier = 1.0, completed = 0, failed = 0 } })
end)

-- ─── Depot peds ──────────────────────────────────────────────────────────────
--- Removes every depot ped, target interaction, and map blip we spawned.
local function ClearDepotPeds()
    for id, idx in pairs(depotInteractions) do
        if DeleteInteraction then pcall(DeleteInteraction, idx) end
        depotInteractions[id] = nil
    end
    for id, ped in pairs(depotPeds) do
        if DoesEntityExist(ped) then DeleteEntity(ped) end
        depotPeds[id] = nil
    end
    for id, blip in pairs(depotBlips) do
        if DoesBlipExist(blip) then RemoveBlip(blip) end
        depotBlips[id] = nil
    end
end

--- Spawns a stationary NPC at each active depot. Target-interacting opens the delivery queue UI
--- scoped to that depot (so acceptDelivery pins the mission to this location).
local function SpawnDepotPeds()
    ClearDepotPeds()
    local depots = lib.callback.await('pickle_dealerships:getDeliveryDepots', false) or {}
    local cfg = (Config and Config.Trailer) or {}
    local pedModel = joaat(cfg.depotPedModel or 's_m_y_dockwork_01')
    local label    = cfg.depotInteractLabel or 'Start Delivery'
    local icon     = cfg.depotInteractIcon  or 'fas fa-truck'
    local blipCfg  = cfg.depotBlip or {}

    for _, d in ipairs(depots) do
        local c = d.pickupCoords
        if c and c.x and c.y and c.z then
            -- CreateNPC handles model load + entity tracking; falls back to a_m_m_skater_01 if model is bad.
            local ped = CreateNPC(pedModel, c.x, c.y, c.z - 1.0, c.w or 0.0)
            if ped and DoesEntityExist(ped) then
                SetBlockingOfNonTemporaryEvents(ped, true)
                SetEntityInvincible(ped, true)
                FreezeEntityPosition(ped, true)
                depotPeds[d.id] = ped
                -- Wire the target interaction. Captures d.id in closure so each ped opens its own depot's queue.
                local depotId = d.id
                local idx = CreateInteraction({
                    targetPed = ped,
                    label = label,
                    icon = icon,
                    coords = vector3(c.x, c.y, c.z),
                    distance = 2.5,
                }, function() OpenDepotQueue(depotId) end)
                depotInteractions[d.id] = idx
            end

            -- Map blip. Uses the depot's DB name as the label so admins can rename from the UI.
            if blipCfg.enabled ~= false then
                local blip = AddBlipForCoord(c.x, c.y, c.z)
                SetBlipSprite(blip, blipCfg.sprite or 477)
                SetBlipColour(blip, blipCfg.color or 5)
                SetBlipScale(blip, blipCfg.scale or 0.8)
                SetBlipAsShortRange(blip, blipCfg.shortRange ~= false)
                BeginTextCommandSetBlipName('STRING')
                AddTextComponentSubstringPlayerName(d.name or d.label or 'Delivery Depot')
                EndTextCommandSetBlipName(blip)
                depotBlips[d.id] = blip
            end
        end
    end
    print(('[pickle_dealerships] Spawned %d depot ped(s).'):format(#depots))
end

--- When admins add/remove/rename depots via the management panel, fire this to refresh the peds.
RegisterNetEvent('pickle_dealerships:depotsChanged', function() SpawnDepotPeds() end)

--- Boot: wait a moment for core to populate the depot cache, then spawn.
CreateThread(function()
    while not lib or not lib.callback do Wait(100) end
    Wait(1500)
    SpawnDepotPeds()
end)

AddEventHandler('onResourceStop', function(resourceName)
    if resourceName == GetCurrentResourceName() then ClearDepotPeds() end
end)

-- ─── Debug: interactive tr2 slot tuner ───────────────────────────────────────
-- Workflow:
--   1. `/debug_trailer` spawns an empty tr2 + a driveable Dominator (large muscle car, ~4.8m ×
--      ~1.96m — a realistic upper bound for what a tr2 hauls).
--   2. Drive the test car onto the trailer, park it exactly where you want slot N to be, then
--      `/debug_trailer capture <1-6>` while still sitting in it. The current position + heading
--      gets stored as that slot's offset (relative to the trailer's entity root / bone 0).
--   3. Repeat for all 6 slots (lower deck first, then upper deck).
--   4. `/debug_trailer preview` clears the test car and re-spawns 6 frozen copies at every
--      captured slot — so you can see the whole layout, verify it looks right.
--   5. `/debug_trailer print` dumps a paste-ready `TR2_SLOTS` block to F8.
--
-- Fine-tune shortcuts (after capture):
--   `/debug_trailer <1-6> <x|y|z|rotz> <delta>` — nudge one axis
--   `/debug_trailer set <1-6> <x> <y> <z> [rz]` — absolute set
--   `/debug_trailer model <name>` — change the test vehicle (e.g. `bmx` to see bike fit)
--   `/debug_trailer testcar` — respawn the test car at the trailer (if you wrecked it)
local debugTrailer = nil
local debugTestCar = nil      -- driveable reference vehicle
local debugGhosts = {}        -- [idx] = entity — transparent no-collide marker at each captured slot
local debugModel = 'dominator'
-- rotX = pitch (nose up/down), rotY = roll (bank left/right), rotZ = yaw (heading)
-- Full 3-axis rotation matters when a slot sits on a tilted deck (e.g. upper ramp slope on tr2).
local debugOffsets = {
    [1] = { x = 0.0, y = -4.0, z = 1.2, rotX = 0.0, rotY = 0.0, rotZ = 0.0 },
    [2] = { x = 0.0, y = -1.5, z = 1.2, rotX = 0.0, rotY = 0.0, rotZ = 0.0 },
    [3] = { x = 0.0, y = -6.5, z = 1.2, rotX = 0.0, rotY = 0.0, rotZ = 0.0 },
    [4] = { x = 0.0, y = -4.0, z = 2.8, rotX = 0.0, rotY = 0.0, rotZ = 0.0 },
    [5] = { x = 0.0, y = -1.5, z = 2.8, rotX = 0.0, rotY = 0.0, rotZ = 0.0 },
    [6] = { x = 0.0, y = -6.5, z = 2.8, rotX = 0.0, rotY = 0.0, rotZ = 0.0 },
}

local function normalizeAngle(a)
    while a >  180.0 do a = a - 360.0 end
    while a < -180.0 do a = a + 360.0 end
    return a
end

local function dbgNotify(msg)
    TriggerEvent('chat:addMessage', { args = { '[debug_trailer]', msg } })
end

local function dbgClearGhosts()
    for i, v in pairs(debugGhosts) do
        if DoesEntityExist(v) then DeleteEntity(v) end
        debugGhosts[i] = nil
    end
end

local function dbgClear()
    dbgClearGhosts()
    if debugTestCar and DoesEntityExist(debugTestCar) then DeleteEntity(debugTestCar) end
    debugTestCar = nil
    if debugTrailer and DoesEntityExist(debugTrailer) then DeleteEntity(debugTrailer) end
    debugTrailer = nil
end

--- Spawns (or respawns) a transparent no-collide ghost at slot `idx`'s current offset. The ghost
--- stays attached to the trailer so it tracks the trailer's position if it ever moves. Calling
--- this on a slot that already has a ghost replaces it.
local function dbgSpawnGhost(idx)
    if not debugTrailer or not DoesEntityExist(debugTrailer) then return end
    if debugGhosts[idx] and DoesEntityExist(debugGhosts[idx]) then DeleteEntity(debugGhosts[idx]) end
    debugGhosts[idx] = nil

    local vehHash = joaat(debugModel)
    if not LoadModel(vehHash) then return end
    local trailerCoord = GetEntityCoords(debugTrailer)
    local ghost = CreateVeh(vehHash, trailerCoord, 0.0, true)
    Wait(0)
    if ghost and DoesEntityExist(ghost) then
        SetEntityAsMissionEntity(ghost, true, true)
        local o = debugOffsets[idx]
        AttachEntityToEntity(ghost, debugTrailer, 0, o.x, o.y, o.z, o.rotX or 0.0, o.rotY or 0.0, o.rotZ or 0.0, false, false, false, false, 2, true)
        FreezeEntityPosition(ghost, true)
        SetEntityInvincible(ghost, true)
        SetEntityCollision(ghost, false, false)
        SetEntityAlpha(ghost, 128, false) -- ~50% opacity so you can see real cars behind it
        SetVehicleEngineOn(ghost, false, true, true)
        debugGhosts[idx] = ghost
    end
    SetModelAsNoLongerNeeded(vehHash)
end

local function dbgSpawnTestCar()
    if debugTestCar and DoesEntityExist(debugTestCar) then DeleteEntity(debugTestCar) end
    local vehHash = joaat(debugModel)
    if not LoadModel(vehHash) then dbgNotify('Failed to load ' .. debugModel); return end
    local ped = PlayerPedId()
    local base = GetEntityCoords(ped)
    local heading = GetEntityHeading(ped)
    debugTestCar = CreateVeh(vehHash, vector3(base.x, base.y + 4.0, base.z), heading, true)
    Wait(0)
    if debugTestCar and DoesEntityExist(debugTestCar) then
        SetEntityAsMissionEntity(debugTestCar, true, true)
    end
    SetModelAsNoLongerNeeded(vehHash)
end

local function dbgSpawn()
    dbgClear()
    local ped = PlayerPedId()
    local base = GetEntityCoords(ped)
    local heading = GetEntityHeading(ped)
    local fwd = GetEntityForwardVector(ped)
    local pos = vector3(base.x + fwd.x * 15.0, base.y + fwd.y * 15.0, base.z)

    local trailerHash = joaat('tr2')
    if not LoadModel(trailerHash) then dbgNotify('Failed to load tr2.'); return end
    debugTrailer = CreateVeh(trailerHash, pos, heading, true)
    if not debugTrailer or not DoesEntityExist(debugTrailer) then
        dbgNotify('Trailer spawn failed.')
        SetModelAsNoLongerNeeded(trailerHash)
        return
    end
    SetEntityAsMissionEntity(debugTrailer, true, true)
    SetEntityCollision(debugTrailer, true, true)
    SetVehicleHandbrake(debugTrailer, true) -- keeps it parked without freezing (freeze was killing collision)
    SetModelAsNoLongerNeeded(trailerHash)

    dbgSpawnTestCar()
    dbgNotify(('Spawned tr2 + %s. Use /debug_trailer door <0-7> or extra <1-12> to find the rear-ramp toggle.'):format(debugModel))
end

local function dbgCapture(idx)
    if not debugTrailer or not DoesEntityExist(debugTrailer) then dbgNotify('No trailer — run /debug_trailer first.'); return end
    local ped = PlayerPedId()
    local car = GetVehiclePedIsIn(ped, false)
    if car == 0 or not DoesEntityExist(car) then dbgNotify('Get in a vehicle first.'); return end

    local carCoords = GetEntityCoords(car)
    -- Trailer-local position via GetOffsetFromEntityGivenWorldCoords — matches the bone-0 attach.
    local offset = GetOffsetFromEntityGivenWorldCoords(debugTrailer, carCoords.x, carCoords.y, carCoords.z)
    local ox, oy, oz = offset.x, offset.y, offset.z
    -- Trailer-local rotation: capture full pitch/roll/yaw relative to the trailer's own orientation.
    -- Rotation order 2 (YXZ) is GTA's default for both GetEntityRotation and AttachEntityToEntity.
    local carRot = GetEntityRotation(car, 2)
    local trailerRot = GetEntityRotation(debugTrailer, 2)
    local rotX = normalizeAngle(carRot.x - trailerRot.x)
    local rotY = normalizeAngle(carRot.y - trailerRot.y)
    local rotZ = normalizeAngle(carRot.z - trailerRot.z)

    debugOffsets[idx] = { x = ox, y = oy, z = oz, rotX = rotX, rotY = rotY, rotZ = rotZ }
    dbgSpawnGhost(idx) -- leave a transparent marker at the captured position so overlaps are visible
    dbgNotify(('Slot %d captured → x=%.2f y=%.2f z=%.2f rotX=%.2f rotY=%.2f rotZ=%.2f'):format(idx, ox, oy, oz, rotX, rotY, rotZ))
end

--- Respawns ghosts for all 6 slots. Handy after changing the test model — existing ghosts keep the
--- old model until this refreshes them.
local function dbgPreview()
    if not debugTrailer or not DoesEntityExist(debugTrailer) then dbgNotify('No trailer — run /debug_trailer first.'); return end
    for i = 1, 6 do dbgSpawnGhost(i) end
    dbgNotify('All 6 ghosts respawned with current model + offsets.')
end

local function dbgReattachGhost(idx)
    local veh = debugGhosts[idx]
    if not veh or not DoesEntityExist(veh) or not debugTrailer then return end
    local o = debugOffsets[idx]
    AttachEntityToEntity(veh, debugTrailer, 0, o.x, o.y, o.z, o.rotX or 0.0, o.rotY or 0.0, o.rotZ or 0.0, false, false, false, false, 2, true)
end

local function dbgPrint()
    print('[debug_trailer] Paste into modules/delivery/server.lua TR2_SLOTS:')
    print('local TR2_SLOTS = {')
    for i = 1, 6 do
        local o = debugOffsets[i]
        print(("    { x = %.2f, y = %.2f, z = %.2f, rotX = %.2f, rotY = %.2f, rotZ = %.2f }, -- slot %d")
            :format(o.x, o.y, o.z, o.rotX or 0.0, o.rotY or 0.0, o.rotZ or 0.0, i))
    end
    print('}')
    dbgNotify('Printed offsets to F8 console.')
end

RegisterCommand('debug_trailer', function(_, args)
    local sub = args[1]

    if not sub or sub == '' then
        if debugTrailer and DoesEntityExist(debugTrailer) then dbgClear(); dbgNotify('Cleared.') else dbgSpawn() end
        return
    end
    if sub == 'clear'   then dbgClear(); dbgNotify('Cleared.'); return end
    if sub == 'spawn'   then dbgSpawn(); return end
    if sub == 'testcar' then dbgSpawnTestCar(); dbgNotify('Test car respawned.'); return end
    if sub == 'preview' then dbgPreview(); return end
    if sub == 'print'   then dbgPrint(); return end
    if sub == 'model' then
        if args[2] then debugModel = args[2]; dbgNotify('Model set to ' .. debugModel .. ' — /debug_trailer testcar to apply.') end
        return
    end
    if sub == 'capture' then
        local idx = tonumber(args[2])
        if not idx or idx < 1 or idx > 6 then dbgNotify('Usage: /debug_trailer capture <1-6>'); return end
        dbgCapture(idx)
        return
    end
    if sub == 'door' then
        if not debugTrailer or not DoesEntityExist(debugTrailer) then dbgNotify('No trailer.'); return end
        local d = tonumber(args[2])
        if not d then dbgNotify('Usage: /debug_trailer door <0-7>'); return end
        -- Toggle: if currently open, close; otherwise open
        local ratio = GetVehicleDoorAngleRatio(debugTrailer, d)
        if ratio > 0.01 then
            SetVehicleDoorShut(debugTrailer, d, false)
            dbgNotify(('Door %d closed.'):format(d))
        else
            SetVehicleDoorOpen(debugTrailer, d, false, false)
            dbgNotify(('Door %d opened.'):format(d))
        end
        return
    end
    if sub == 'extra' then
        if not debugTrailer or not DoesEntityExist(debugTrailer) then dbgNotify('No trailer.'); return end
        local e = tonumber(args[2])
        if not e then dbgNotify('Usage: /debug_trailer extra <1-12>'); return end
        if not DoesExtraExist(debugTrailer, e) then dbgNotify(('Extra %d does not exist on tr2.'):format(e)); return end
        -- SetVehicleExtra toggle: arg 3 false = enabled (shown), true = disabled (hidden)
        local isOn = IsVehicleExtraTurnedOn(debugTrailer, e)
        SetVehicleExtra(debugTrailer, e, isOn)
        dbgNotify(('Extra %d → %s.'):format(e, isOn and 'off' or 'on'))
        return
    end
    if sub == 'set' then
        local idx = tonumber(args[2])
        local x, y, z = tonumber(args[3]), tonumber(args[4]), tonumber(args[5])
        local rotX = tonumber(args[6]) or 0.0
        local rotY = tonumber(args[7]) or 0.0
        local rotZ = tonumber(args[8]) or 0.0
        if not idx or idx < 1 or idx > 6 or not x or not y or not z then
            dbgNotify('Usage: /debug_trailer set <1-6> <x> <y> <z> [rotX rotY rotZ]')
            return
        end
        debugOffsets[idx] = { x = x, y = y, z = z, rotX = rotX, rotY = rotY, rotZ = rotZ }
        dbgReattachGhost(idx)
        dbgNotify(('Slot %d → x=%.2f y=%.2f z=%.2f rotX=%.2f rotY=%.2f rotZ=%.2f'):format(idx, x, y, z, rotX, rotY, rotZ))
        return
    end

    -- Shorthand nudge: /debug_trailer <idx> <axis> <delta>
    -- axis ∈ { x, y, z, rotx, roty, rotz }
    local idx = tonumber(sub)
    if idx and idx >= 1 and idx <= 6 then
        local axis = (args[2] or ''):lower()
        local delta = tonumber(args[3])
        local keyMap = { x = 'x', y = 'y', z = 'z', rotx = 'rotX', roty = 'rotY', rotz = 'rotZ' }
        local key = keyMap[axis]
        if not delta or not key then
            dbgNotify('Usage: /debug_trailer <1-6> <x|y|z|rotx|roty|rotz> <delta>')
            return
        end
        debugOffsets[idx][key] = (debugOffsets[idx][key] or 0.0) + delta
        if key == 'rotX' or key == 'rotY' or key == 'rotZ' then
            debugOffsets[idx][key] = normalizeAngle(debugOffsets[idx][key])
        end
        dbgReattachGhost(idx)
        local o = debugOffsets[idx]
        dbgNotify(('Slot %d → x=%.2f y=%.2f z=%.2f rotX=%.2f rotY=%.2f rotZ=%.2f'):format(idx, o.x, o.y, o.z, o.rotX or 0.0, o.rotY or 0.0, o.rotZ or 0.0))
        return
    end

    dbgNotify('Commands: [spawn|clear|testcar|capture <i>|preview|print|model <name>|set|<i> <axis> <delta>|door <d>|extra <e>]')
end, false)

AddEventHandler('onResourceStop', function(res)
    if res == GetCurrentResourceName() then dbgClear() end
end)

-- ─── Admin: Depot Management NUI bridges ─────────────────────────────────────
-- Depots are managed from the /dealership admin panel; these wire up the React UI to the server.
RegisterNUICallback('adminGetDepots', function(_, cb)
    local depots = lib.callback.await('pickle_dealerships:getDeliveryDepots', false) or {}
    cb(depots)
end)

--- Captures the caller's current position and creates a depot at that coord.
RegisterNUICallback('adminCreateDepot', function(payload, cb)
    local ped = PlayerPedId()
    local coords = GetEntityCoords(ped)
    local heading = GetEntityHeading(ped)
    local ok, id = lib.callback.await('pickle_dealerships:createDeliveryDepot', false, {
        name = payload.name or 'Depot',
        coords = { x = coords.x, y = coords.y, z = coords.z, w = heading },
    })
    cb({ ok = ok, id = id })
end)

RegisterNUICallback('adminUpdateDepot', function(payload, cb)
    local ok = lib.callback.await('pickle_dealerships:updateDeliveryDepot', false, tonumber(payload.id), payload.fields or {})
    cb({ ok = ok })
end)

RegisterNUICallback('adminDeleteDepot', function(payload, cb)
    local ok = lib.callback.await('pickle_dealerships:deleteDeliveryDepot', false, tonumber(payload.id))
    cb({ ok = ok })
end)

--- Lets the admin UI drop a waypoint on an existing depot so they can drive over and check it.
RegisterNUICallback('adminWaypointDepot', function(payload, cb)
    local depots = lib.callback.await('pickle_dealerships:getDeliveryDepots', false) or {}
    for _, d in ipairs(depots) do
        if d.id == tonumber(payload.id) and d.pickupCoords then
            SetNewWaypoint(d.pickupCoords.x, d.pickupCoords.y)
            break
        end
    end
    cb({ ok = true })
end)

--- Clears the truck-spawn point on a depot so it falls back to the dispatch ped's coords.
RegisterNUICallback('adminClearDepotSpawn', function(payload, cb)
    local ok = lib.callback.await('pickle_dealerships:setDeliveryDepotSpawn', false,
        { id = tonumber(payload.id), clear = true })
    cb({ ok = ok })
end)

--- Opens the gizmo editor so the admin can place a truck-spawn point visually. Mirrors the
--- dealership display-spot flow — spawns a lab barrier prop at either the current spawn point
--- (if one's set) or the admin's position, lets them nudge/rotate it with arrow keys + G/E/ESC,
--- then saves on confirm and re-opens the admin panel on the Depots tab.
RegisterNUICallback('adminStartDepotSpawnGizmo', function(payload, cb)
    CloseNui()

    -- Seed the gizmo at the existing spawn point if the depot already has one set.
    local depotId = tonumber(payload.id)
    local initialCoords, initialRot
    local depots = lib.callback.await('pickle_dealerships:getDeliveryDepots', false) or {}
    for _, d in ipairs(depots) do
        if d.id == depotId and d.spawnCoords then
            initialCoords = vector3(d.spawnCoords.x, d.spawnCoords.y, d.spawnCoords.z)
            initialRot    = vector3(0.0, 0.0, d.spawnCoords.w or 0.0)
            break
        end
    end

    local result = StartGizmoEditor({
        model = `xm_prop_lab_barrier02`,
        enableCancel = true,
        deleteEntity = true,
        coords = initialCoords,
        rotation = initialRot,
        coordsOffset = vector3(0.0, 0.0, -0.03),
        rotationOffset = vector3(90.0, 0.0, 0.0),
    })

    local saved = false
    if result and result.position then
        local pos = result.position
        local rot = result.rotation
        saved = lib.callback.await('pickle_dealerships:setDeliveryDepotSpawn', false, {
            id = depotId,
            coords = { x = pos.x, y = pos.y, z = pos.z, w = rot and rot.z or 0.0 },
        }) and true or false
    end

    -- Re-open the admin panel on the Depots tab whether saved or cancelled, so the admin can
    -- verify the placement on the depot list without running /dealership again.
    OpenNui('admin', {
        dealershipId = 0,
        dealershipName = 'Admin Panel',
        role = 'admin',
        tier = 4,
        initialTab = 'depots',
    })

    cb({ ok = saved })
end)

--- Cleanup if player dies during delivery
AddEventHandler('gameEventTriggered', function(name, args)
    if name == 'CEventNetworkEntityDamage' then
        local victim = args[1]
        local isDead = args[4]

        if victim == PlayerPedId() and isDead == 1 and activeMission then
            -- Give player a moment, then fail the delivery
            SetTimeout(5000, function()
                if activeMission then
                    lib.callback.await('pickle_dealerships:failDelivery', false, activeMission.deliveryId)
                    ShowNotification(_L('delivery_failed_died'), 'error')
                    CleanupMission()
                end
            end)
        end
    end
end)
