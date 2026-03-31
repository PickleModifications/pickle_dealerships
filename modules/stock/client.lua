local displayVehicles = {}
local currentDealership = nil
local isInZone = false

--- Spawns display vehicles for the current dealership
---@param locationKey string
local function SpawnDisplayVehicles(locationKey)
    -- Clean up any existing display vehicles first
    DeleteDisplayVehicles()

    local cfg = Config.Dealerships[locationKey]
    if not cfg or not cfg.displaySpots then return end

    local stock = lib.callback.await('pickle_dealerships:getStock', false, locationKey)
    if not stock then return end

    for _, item in ipairs(stock) do
        if item.display_spot then
            local spotIndex = item.display_spot
            local spot = cfg.displaySpots[spotIndex]

            if spot then
                local coords = spot.coords
                local heading = spot.heading or 0.0

                local veh = CreateVeh(item.model, coords, heading, false)
                if veh and DoesEntityExist(veh) then
                    FreezeEntityPosition(veh, true)
                    SetVehicleDoorsLocked(veh, 2)
                    SetEntityInvincible(veh, true)
                    SetVehicleNumberPlateText(veh, 'DISPLAY')

                    displayVehicles[#displayVehicles + 1] = {
                        entity = veh,
                        stockId = item.id,
                        model = item.model,
                        retailPrice = item.retail_price,
                        wholesalePrice = item.wholesale_price,
                        displaySpot = spotIndex,
                    }

                    -- Create interaction for viewing vehicle details
                    CreateInteraction(coords, {
                        label = 'View Details',
                        icon = 'fas fa-car',
                        distance = 3.0,
                        onSelect = function()
                            OpenVehicleDetails(locationKey, item)
                        end,
                        canInteract = function()
                            return isInZone and currentDealership == locationKey
                        end,
                    })
                end
            end
        end
    end
end

--- Deletes all display vehicles
function DeleteDisplayVehicles()
    for _, data in ipairs(displayVehicles) do
        if data.entity and DoesEntityExist(data.entity) then
            DeleteEntity(data.entity)
        end
    end
    displayVehicles = {}
end

--- Opens NUI with vehicle detail information
---@param locationKey string
---@param stockItem table
function OpenVehicleDetails(locationKey, stockItem)
    SetNuiFocus(true, true)
    SendNUIMessage({
        type = 'open',
        page = 'vehicleDetails',
        data = {
            location = locationKey,
            stockId = stockItem.id,
            model = stockItem.model,
            retailPrice = stockItem.retail_price,
            wholesalePrice = stockItem.wholesale_price,
            displaySpot = stockItem.display_spot,
        },
    })
end

--- Listen for zone enter/exit from main module
RegisterNetEvent('pickle_dealerships:enteredDealership', function(locationKey, data)
    currentDealership = locationKey
    isInZone = true
    SpawnDisplayVehicles(locationKey)
end)

RegisterNetEvent('pickle_dealerships:exitedDealership', function(locationKey)
    if currentDealership == locationKey then
        isInZone = false
        currentDealership = nil
        DeleteDisplayVehicles()
    end
end)

--- Listen for stock changes to refresh display
RegisterNetEvent('pickle_dealerships:refreshDisplay', function(locationKey)
    if currentDealership == locationKey and isInZone then
        SpawnDisplayVehicles(locationKey)
    end
end)

--- Cleanup on resource stop
AddEventHandler('onResourceStop', function(resourceName)
    if resourceName ~= GetCurrentResourceName() then return end
    DeleteDisplayVehicles()
end)
