local displayVehicles = {}
local ghostVehicles = {}
local currentDealership = nil
local isInZone = false

local GHOST_MODEL = `xm_prop_lab_barrier02` -- prop for empty display spots

--- Parse a display spot into x, y, z, w regardless of format (vector4, table)
local function ParseSpot(spot)
    if type(spot) == "vector4" then
        return spot.x, spot.y, spot.z, spot.w
    elseif type(spot) == "table" then
        return spot.x or spot[1], spot.y or spot[2], spot.z or spot[3], spot.w or spot[4] or 0.0
    end
    return nil, nil, nil, nil
end

--- Cleanup ghost vehicles
local function DeleteGhostVehicles()
    for _, data in ipairs(ghostVehicles) do
        if data.entity and DoesEntityExist(data.entity) then
            DeleteEntity(data.entity)
        end
    end
    ghostVehicles = {}
end

--- Spawn transparent placeholder vehicles on empty display spots (staff only)
local function SpawnGhostVehicles(locationKey, occupiedSpots)
    DeleteGhostVehicles()

    local cfg = DealershipConfigs[locationKey]
    if not cfg or not cfg.displaySpots then return end

    -- Check if player has a role at this dealership
    local role = lib.callback.await('pickle_dealerships:getPlayerRole', false, locationKey)
    if not role then return end -- not staff, no ghosts

    for _, spot in ipairs(cfg.displaySpots) do
        local spotId = spot.id and tonumber(spot.id)
        if spotId and not occupiedSpots[spotId] then
            local x, y, z, w = ParseSpot(spot)
            if x and y and z then
                local obj = CreateProp(GHOST_MODEL, x, y, z - 1.26, false, false, false)
                if obj and DoesEntityExist(obj) then
                    SetEntityRotation(obj, 90.0, 0.0, w or 0.0, 2, true)
                    FreezeEntityPosition(obj, true)
                    SetEntityCollision(obj, false, false)
                    SetEntityAlpha(obj, 200, false)
                    SetEntityInvincible(obj, true)

                    ghostVehicles[#ghostVehicles + 1] = {
                        entity = obj,
                        spotId = spotId,
                    }
                end
            end
        end
    end

    SetModelAsNoLongerNeeded(GHOST_MODEL)
end

--- Spawns display vehicles for the current dealership
---@param locationKey string
local function SpawnDisplayVehicles(locationKey)
    -- Clean up existing
    DeleteDisplayVehicles()
    DeleteGhostVehicles()

    local cfg = DealershipConfigs[locationKey]
    if not cfg or not cfg.displaySpots then return end

    local stock = lib.callback.await('pickle_dealerships:getStock', false, locationKey)
    if not stock then stock = {} end

    local occupiedSpots = {}

    for _, item in ipairs(stock) do
        local isDelivered = item.delivered_at and item.delivered_at ~= "" and not item.sold_at
        if item.display_spot and isDelivered then
            local spotId = tonumber(item.display_spot)
            -- Find the spot in displaySpots by its unique id
            local spot = nil
            local spotArrayIndex = nil
            for i, s in ipairs(cfg.displaySpots) do
                if s.id and tonumber(s.id) == spotId then
                    spot = s
                    spotArrayIndex = i
                    break
                end
            end

            if spot then
                local x, y, z, w = ParseSpot(spot)
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
                            displaySpot = spotId,
                        }

                        occupiedSpots[spotId] = true
                    end
                end
            end
        end
    end

    -- Spawn ghosts on empty spots for staff
    SpawnGhostVehicles(locationKey, occupiedSpots)
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
        DeleteGhostVehicles()
    end
end)

--- Listen for stock changes to refresh display
RegisterNetEvent('pickle_dealerships:refreshDisplay', function(locationKey)
    if currentDealership == locationKey and isInZone then
        SpawnDisplayVehicles(locationKey)
    end
end)

--- Surgically refresh display spots: remove vehicles on deleted spots, rebuild ghosts
RegisterNetEvent('pickle_dealerships:refreshDisplaySpots', function(locationKey)
    if currentDealership ~= locationKey or not isInZone then return end

    local cfg = DealershipConfigs[locationKey]

    -- Build a set of valid spot IDs from current config
    local validSpotIds = {}
    if cfg and cfg.displaySpots then
        for _, spot in ipairs(cfg.displaySpots) do
            if spot.id then validSpotIds[tonumber(spot.id)] = true end
        end
    end

    -- Remove display vehicles whose spot ID no longer exists
    local kept = {}
    local occupiedSpots = {}
    for _, dv in ipairs(displayVehicles) do
        if dv.displaySpot and not validSpotIds[dv.displaySpot] then
            if dv.entity and DoesEntityExist(dv.entity) then
                DeleteEntity(dv.entity)
            end
        else
            kept[#kept + 1] = dv
            if dv.displaySpot then
                occupiedSpots[dv.displaySpot] = true
            end
        end
    end
    displayVehicles = kept

    -- Rebuild just the ghosts
    DeleteGhostVehicles()
    SpawnGhostVehicles(locationKey, occupiedSpots)
end)

-- ─── NUI Callbacks ──────────────────────────────────────────────────────────

local function ResolveLocation(data)
    if data.location then return data.location end
    local current = exports.pickle_dealerships:GetCurrentDealership()
    return current
end

RegisterNUICallback("getCatalog", function(data, cb)
    local location = ResolveLocation(data)
    if not location then
        cb({ items = {}, total = 0, page = 1, pageSize = 50 })
        return
    end
    local result = lib.callback.await('pickle_dealerships:getCatalog', false, {
        location = location,
        page = data.page or 1,
        pageSize = data.pageSize or 50,
        search = data.search or '',
        classFilter = data.classFilter or 'all',
        tierFilter = data.tierFilter or 'all',
    })
    cb(result or { items = {}, total = 0, page = 1, pageSize = 50 })
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

RegisterNUICallback("getShowroomStock", function(data, cb)
    local location = ResolveLocation(data)
    if not location then
        cb({ items = {}, total = 0, page = 1, pageSize = 20 })
        return
    end
    local result = lib.callback.await('pickle_dealerships:getShowroomStock', false, {
        location = location,
        page = data.page or 1,
        pageSize = data.pageSize or 20,
        search = data.search or '',
        classFilter = data.classFilter or 'all',
        minPrice = data.minPrice,
        maxPrice = data.maxPrice,
        sortBy = data.sortBy,
    })
    cb(result or { items = {}, total = 0, page = 1, pageSize = 20 })
end)

RegisterNUICallback("setRetailPrice", function(data, cb)
    local location = ResolveLocation(data)
    if not location then
        cb({ success = false, message = "Could not resolve location." })
        return
    end

    local success, err = lib.callback.await('pickle_dealerships:setRetailPrice', false, location, data.stockId, data.retailPrice)
    if success then
        cb({ success = true })
    else
        ShowNotification(err or "Failed to set retail price.")
        cb({ success = false, message = err or "Failed." })
    end
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

RegisterNUICallback("getDisplaySpots", function(data, cb)
    local location = ResolveLocation(data)
    if not location then
        cb({ spots = {} })
        return
    end
    local cfg = DealershipConfigs[location]
    local spots = {}
    if cfg and cfg.displaySpots then
        for i, spot in ipairs(cfg.displaySpots) do
            spots[#spots + 1] = {
                id = spot.id and tonumber(spot.id) or i,
                index = i,
            }
        end
    end
    cb({ spots = spots })
end)

--- Cleanup on resource stop
AddEventHandler('onResourceStop', function(resourceName)
    if resourceName ~= GetCurrentResourceName() then return end
    DeleteDisplayVehicles()
    DeleteGhostVehicles()
end)
