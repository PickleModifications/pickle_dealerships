local activeMission = nil
local missionBlip = nil
local pickupBlip = nil
local trailerEntity = nil
local missionVehicles = {}
local isAtPickup = false

--- Starts the client-side delivery mission
---@param data table Mission data from server
RegisterNetEvent('pickle_dealerships:startDeliveryMission', function(data)
    if activeMission then
        ShowNotification('You already have an active delivery.', 'error')
        return
    end

    activeMission = {
        deliveryId = data.deliveryId,
        locationKey = data.locationKey,
        route = data.route,
        vehicles = data.vehicles,
        dealershipCoords = data.dealershipCoords,
        phase = 'pickup', -- pickup -> transport -> dropoff
    }

    isAtPickup = false

    -- Set GPS waypoint to pickup location
    local pickupCoords = data.route.pickup
    SetNewWaypoint(pickupCoords.x, pickupCoords.y)

    -- Create pickup blip
    pickupBlip = AddBlipForCoord(pickupCoords.x, pickupCoords.y, pickupCoords.z or 0.0)
    SetBlipSprite(pickupBlip, 477)
    SetBlipColour(pickupBlip, 5)
    SetBlipScale(pickupBlip, 0.9)
    SetBlipRoute(pickupBlip, true)
    SetBlipRouteColour(pickupBlip, 5)
    BeginTextCommandSetBlipName('STRING')
    AddTextComponentSubstringPlayerName('Delivery Pickup')
    EndTextCommandSetBlipName(pickupBlip)

    ShowNotification('Delivery mission started! Head to the pickup location.', 'info')

    -- Start mission monitoring thread
    CreateThread(MissionMonitorLoop)
end)

--- Main mission loop: handles phases and HUD text
function MissionMonitorLoop()
    while activeMission do
        local playerCoords = GetEntityCoords(PlayerPedId())

        if activeMission.phase == 'pickup' then
            -- Draw mission HUD text
            DrawMissionText('~y~DELIVERY~w~ - Drive to the ~b~pickup~w~ location')

            -- Check proximity to pickup point
            local pickupCoords = activeMission.route.pickup
            local dist = #(playerCoords - vector3(pickupCoords.x, pickupCoords.y, pickupCoords.z or playerCoords.z))

            if dist < 15.0 and not isAtPickup then
                isAtPickup = true
                OnArriveAtPickup()
            end

        elseif activeMission.phase == 'transport' then
            DrawMissionText('~y~DELIVERY~w~ - Transport vehicles to the ~g~dealership~w~')

            -- Check proximity to dealership
            local dealerCoords = activeMission.dealershipCoords
            local dist = #(playerCoords - vector3(dealerCoords.x, dealerCoords.y, dealerCoords.z or playerCoords.z))

            if dist < 25.0 then
                OnArriveAtDealership()
            end
        end

        Wait(500)
    end
end

--- Draws mission objective text on screen
---@param text string
function DrawMissionText(text)
    BeginTextCommandDisplayHelp('STRING')
    AddTextComponentSubstringPlayerName(text)
    EndTextCommandDisplayHelp(0, false, true, -1)
end

--- Called when the player arrives at the pickup location
function OnArriveAtPickup()
    if not activeMission then return end

    ShowNotification('Loading vehicles onto trailer...', 'info')

    -- Remove pickup blip
    if pickupBlip then
        RemoveBlip(pickupBlip)
        pickupBlip = nil
    end

    local pickupCoords = activeMission.route.pickup
    local heading = activeMission.route.pickupHeading or 0.0

    -- Spawn the trailer
    local trailerModel = Config.TrailerModel or 'tr2'
    local trailerCoord = vector3(pickupCoords.x, pickupCoords.y, pickupCoords.z or 0.0)

    trailerEntity = CreateVeh(trailerModel, trailerCoord, heading, true)
    if trailerEntity and DoesEntityExist(trailerEntity) then
        SetEntityAsMissionEntity(trailerEntity, true, true)
    end

    -- Spawn ordered vehicles near the trailer
    local offset = 0.0
    for _, vehicle in ipairs(activeMission.vehicles) do
        local spawnCoords = vector3(
            pickupCoords.x + offset,
            pickupCoords.y + 6.0,
            pickupCoords.z or 0.0
        )

        local veh = CreateVeh(vehicle.model, spawnCoords, heading + 90.0, true)
        if veh and DoesEntityExist(veh) then
            SetEntityAsMissionEntity(veh, true, true)
            FreezeEntityPosition(veh, true)
            SetVehicleDoorsLocked(veh, 2)
            missionVehicles[#missionVehicles + 1] = veh
        end

        offset = offset + 5.0
    end

    -- Transition to transport phase
    activeMission.phase = 'transport'

    -- Create dropoff blip at dealership
    local dealerCoords = activeMission.dealershipCoords
    missionBlip = AddBlipForCoord(dealerCoords.x, dealerCoords.y, dealerCoords.z or 0.0)
    SetBlipSprite(missionBlip, 326)
    SetBlipColour(missionBlip, 2)
    SetBlipScale(missionBlip, 0.9)
    SetBlipRoute(missionBlip, true)
    SetBlipRouteColour(missionBlip, 2)
    BeginTextCommandSetBlipName('STRING')
    AddTextComponentSubstringPlayerName('Dealership Dropoff')
    EndTextCommandSetBlipName(missionBlip)

    -- Set waypoint to dealership
    SetNewWaypoint(dealerCoords.x, dealerCoords.y)

    ShowNotification('Vehicles loaded! Drive the trailer back to the dealership.', 'success')
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

    ShowNotification('Delivery arriving...', 'info')

    -- Complete the delivery via server
    local success, err = lib.callback.await('pickle_dealerships:completeDelivery', false, activeMission.deliveryId)
    if success then
        ShowNotification('Delivery complete!', 'success')
    else
        ShowNotification(err or 'Failed to complete delivery.', 'error')
    end

    CleanupMission()
end

--- Cleans up all mission entities and state
function CleanupMission()
    -- Remove blips
    if missionBlip then
        RemoveBlip(missionBlip)
        missionBlip = nil
    end

    if pickupBlip then
        RemoveBlip(pickupBlip)
        pickupBlip = nil
    end

    -- Delete trailer
    if trailerEntity and DoesEntityExist(trailerEntity) then
        DeleteEntity(trailerEntity)
        trailerEntity = nil
    end

    -- Delete mission vehicles
    for _, veh in ipairs(missionVehicles) do
        if DoesEntityExist(veh) then
            DeleteEntity(veh)
        end
    end
    missionVehicles = {}

    isAtPickup = false
    activeMission = nil
end

--- Cancel/fail delivery via command or event
RegisterNetEvent('pickle_dealerships:cancelDelivery', function()
    if not activeMission then return end

    lib.callback.await('pickle_dealerships:failDelivery', false, activeMission.deliveryId)
    ShowNotification('Delivery mission cancelled.', 'error')
    CleanupMission()
end)

--- Cleanup on resource stop
AddEventHandler('onResourceStop', function(resourceName)
    if resourceName ~= GetCurrentResourceName() then return end
    CleanupMission()
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
                    ShowNotification('Delivery failed - you died.', 'error')
                    CleanupMission()
                end
            end)
        end
    end
end)
