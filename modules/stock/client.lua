local displayVehicles = {}
local currentDealership = nil
local isInZone = false

--- Spawns display vehicles for the current dealership
---@param locationKey string
local function SpawnDisplayVehicles(locationKey)
    -- Clean up any existing display vehicles first
    DeleteDisplayVehicles()

    local cfg = DealershipConfigs[locationKey]
    if not cfg or not cfg.displaySpots then return end

    local stock = lib.callback.await('pickle_dealerships:getStock', false, locationKey)
    if not stock then return end

    for _, item in ipairs(stock) do
        -- Only spawn delivered vehicles that are assigned to a display spot
        local isDelivered = item.delivered_at and item.delivered_at ~= "" and not item.sold_at
        if item.display_spot and isDelivered then
            local spotIndex = tonumber(item.display_spot)
            local spot = cfg.displaySpots[spotIndex]

            if spot then
                -- Handle both vector4 and table formats
                local x, y, z, w
                if type(spot) == "vector4" then
                    x, y, z, w = spot.x, spot.y, spot.z, spot.w
                elseif type(spot) == "table" then
                    x = spot.x or spot[1]
                    y = spot.y or spot[2]
                    z = spot.z or spot[3]
                    w = spot.w or spot[4] or 0.0
                end

                if x and y and z then
                    local model = item.vehicle_model or item.model
                    local modelHash = type(model) == "string" and joaat(model) or model
                    local veh = CreateVeh(modelHash, vector3(x, y, z), w or 0.0, false)
                    if veh and DoesEntityExist(veh) then
                        FreezeEntityPosition(veh, true)
                        SetVehicleDoorsLocked(veh, 2)
                        SetEntityInvincible(veh, true)
                        SetVehicleNumberPlateText(veh, 'DISPLAY')

                        displayVehicles[#displayVehicles + 1] = {
                            entity = veh,
                            stockId = item.id,
                            model = model,
                            retailPrice = item.retail_price,
                            wholesalePrice = item.wholesale_cost,
                            displaySpot = spotIndex,
                        }
                    end
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
            model = stockItem.vehicle_model or stockItem.model,
            retailPrice = stockItem.retail_price,
            wholesalePrice = stockItem.wholesale_cost,
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

-- ─── NUI Callbacks ──────────────────────────────────────────────────────────

--- Resolve a dealership location key from NUI data
local function ResolveLocation(data)
    if data.location then return data.location end
    local current = exports.pickle_dealerships:GetCurrentDealership()
    return current
end

RegisterNUICallback("getCatalog", function(data, cb)
    local location = ResolveLocation(data)
    if not location then
        cb({ catalog = {} })
        return
    end
    local result = lib.callback.await('pickle_dealerships:getCatalog', false, location)
    cb({ catalog = result or {} })
end)

RegisterNUICallback("orderVehicle", function(data, cb)
    local location = ResolveLocation(data)
    if not location then
        cb({ success = false, message = "Could not resolve dealership location." })
        return
    end

    local success, result = lib.callback.await('pickle_dealerships:orderVehicle', false, location, data.model, data.wholesale)
    if success then
        ShowNotification("Vehicle ordered successfully!")
        cb({ success = true, stockId = result })
    else
        ShowNotification(result or "Failed to order vehicle.")
        cb({ success = false, message = result or "Order failed." })
    end
end)

RegisterNUICallback("getStock", function(data, cb)
    local location = ResolveLocation(data)
    if not location then
        cb({})
        return
    end
    local result = lib.callback.await('pickle_dealerships:getStock', false, location)
    cb(result or {})
end)

RegisterNUICallback("setDisplaySpot", function(data, cb)
    local location = ResolveLocation(data)
    if not location then
        cb({ success = false, message = "Could not resolve location." })
        return
    end

    local success, err = lib.callback.await('pickle_dealerships:setDisplaySpot', false, location, data.stockId, data.spot)
    if success then
        cb({ success = true })
    else
        ShowNotification(err or "Failed to set display spot.")
        cb({ success = false, message = err or "Failed." })
    end
end)

--- Cleanup on resource stop
AddEventHandler('onResourceStop', function(resourceName)
    if resourceName ~= GetCurrentResourceName() then return end
    DeleteDisplayVehicles()
end)
