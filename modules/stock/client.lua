local displayVehicles = {}
local ghostVehicles = {}
local currentDealership = nil
local isInZone = false
local seizeDealerships = {}  -- cached list of seize-enabled dealerships this player can manage

local GHOST_MODEL = `xm_prop_lab_barrier02` -- prop for empty display spots

--- Refresh the cached list of seize-enabled dealerships this player can manage
local function RefreshSeizeDealerships()
    seizeDealerships = lib.callback.await('pickle_dealerships:getSeizeDealerships', false) or {}
end

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
        local isUnlisted = item.unlisted == 1 or item.unlisted == true
        if item.display_spot and isDelivered and not isUnlisted then
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

                        -- For pre-owned units, apply captured vehicle properties so the
                        -- lot displays the exact unit a buyer would receive
                        local isUsed = item.is_used == true or tonumber(item.is_used) == 1
                        local props = item.metadata
                        if isUsed and props then
                            if type(props) == 'string' then props = json.decode(props) or {} end
                            if type(props) == 'table' then
                                props.plate = nil -- keep DISPLAY plate cosmetically
                                lib.setVehicleProperties(veh, props)
                            end
                        end

                        SetVehicleNumberPlateText(veh, 'DISPLAY')

                        displayVehicles[#displayVehicles + 1] = {
                            entity = veh,
                            stockId = item.id,
                            model = model,
                            retailPrice = item.retail_price,
                            wholesalePrice = item.wholesale_cost,
                            displaySpot = spotId,
                            isUsed = isUsed,
                        }

                        if isUsed and Config.UseTarget then
                            local capturedStockId = item.id
                            AddTargetPed(veh, {
                                {
                                    name = 'pickle_dealerships:pickleFax',
                                    label = 'View PickleFAX',
                                    icon = 'fa-solid fa-file-invoice',
                                    distance = 3.0,
                                    onSelect = function()
                                        OpenNui('pickleFax', { stockId = capturedStockId })
                                    end,
                                    action = function()
                                        OpenNui('pickleFax', { stockId = capturedStockId })
                                    end,
                                },
                            })
                        end

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
    RefreshSeizeDealerships()
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

    local success, result = lib.callback.await('pickle_dealerships:orderVehicle', false, location, data.model, data.wholesale, tonumber(data.quantity) or 1)
    if success then
        ShowNotification(_L("stock_order_success"))
        cb({ success = true, stockId = result })
    else
        ShowNotification(result or _L("stock_order_failed"))
        cb({ success = false, message = result or _L("stock_order_failed") })
    end
end)

RegisterNUICallback("getPickleFax", function(data, cb)
    local result = lib.callback.await('pickle_dealerships:getPickleFax', false, { stockId = tonumber(data.stockId) })
    cb(result)
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
        ShowNotification(err or _L("stock_retail_price_failed"))
        cb({ success = false, message = err or "Failed." })
    end
end)

RegisterNUICallback("toggleUnlisted", function(data, cb)
    local location = ResolveLocation(data)
    if not location then
        cb({ success = false, message = "Could not resolve location." })
        return
    end

    local success, unlisted = lib.callback.await('pickle_dealerships:toggleUnlisted', false, location, data.stockId)
    if success then
        cb({ success = true, unlisted = unlisted })
    else
        cb({ success = false, message = unlisted or "Failed." })
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
        ShowNotification(err or _L("stock_display_spot_failed"))
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

-- ─── Pre-owned trade-in flow ────────────────────────────────────────────────

--- Vehicle owner confirms / declines a pending trade-in
lib.callback.register('pickle_dealerships:confirmTradeIn', function(data)
    if type(data) ~= 'table' then return false end
    local header = ('%s Trade-In Offer'):format(data.dealershipName or 'Dealership')
    local content = ('**%s** is offering **$%s** for your **%s** (plate %s).\n\nAccept the trade-in?'):format(
        data.dealershipName or 'A dealership',
        data.buyPrice or 0,
        data.label or 'vehicle',
        data.plate or '?'
    )
    local answer = lib.alertDialog({
        header = header,
        content = content,
        centered = true,
        cancel = true,
        labels = { confirm = 'Accept', cancel = 'Decline' },
    })
    return answer == 'confirm'
end)


--- Open the trade-in dialog for a targeted vehicle
local function StartTradeIn(vehicle)
    if not currentDealership then
        ShowNotification(_L('trade_in_not_in_dealership'))
        return
    end
    if not vehicle or not DoesEntityExist(vehicle) or GetEntityType(vehicle) ~= 2 then return end

    local rawPlate = GetVehicleNumberPlateText(vehicle)
    if not rawPlate then return end
    local plate = rawPlate:gsub('^%s*(.-)%s*$', '%1')
    if plate == '' then
        ShowNotification(_L('trade_in_no_plate'))
        return
    end

    local properties = lib.getVehicleProperties(vehicle)
    if not properties then
        ShowNotification(_L('trade_in_no_props'))
        return
    end

    -- Ask the server to resolve the model (and any catalog suggestion) from the plate's framework record
    local suggestion = lib.callback.await('pickle_dealerships:getTradeInSuggestion', false, currentDealership, plate)
    if not suggestion or suggestion.ownerless then
        ShowNotification(_L('trade_in_not_registered'))
        return
    end
    local msrp = suggestion.wholesale
    local suggestedOffer = msrp and math.floor(msrp * 0.9) or 1000
    local label = suggestion.label or 'Vehicle'

    local input = lib.inputDialog('Trade-In: ' .. tostring(label), {
        { type = 'number', label = 'Offer Price', description = msrp and ('Suggested: $' .. suggestedOffer .. ' (MSRP: $' .. msrp .. ')') or 'No catalog reference for this model.', default = suggestedOffer, required = true, min = 1 },
        { type = 'number', label = 'Retail Price (lot)', description = 'Price the dealership will sell it for.', default = msrp or 1000, required = true, min = 1 },
    })
    if not input then return end

    local buyPrice = tonumber(input[1])
    local retailPrice = tonumber(input[2])
    if not buyPrice or not retailPrice then return end

    local ok, err = lib.callback.await('pickle_dealerships:tradeInVehicle', false, currentDealership, {
        plate = plate,
        properties = properties,
        buyPrice = buyPrice,
        retailPrice = retailPrice,
    })
    if not ok then
        ShowNotification(err or _L('trade_in_failed'))
        return
    end

    -- Despawn the world vehicle now that it's in the lot
    if DoesEntityExist(vehicle) then
        SetEntityAsMissionEntity(vehicle, true, true)
        DeleteEntity(vehicle)
    end
end

--- Seize a vehicle (no consent, no payment, unlisted stock)
local function StartSeize(vehicle)
    if not vehicle or not DoesEntityExist(vehicle) or GetEntityType(vehicle) ~= 2 then return end

    local rawPlate = GetVehicleNumberPlateText(vehicle)
    if not rawPlate then return end
    local plate = rawPlate:gsub('^%s*(.-)%s*$', '%1')
    if plate == '' then
        ShowNotification(_L('trade_in_no_plate'))
        return
    end

    local properties = lib.getVehicleProperties(vehicle)
    if not properties then
        ShowNotification(_L('trade_in_no_props'))
        return
    end

    -- Reject NPC / unregistered vehicles up front
    local isOwned = lib.callback.await('pickle_dealerships:isPlateOwned', false, plate)
    if not isOwned then
        ShowNotification(_L('seize_not_player_owned'))
        return
    end

    -- Resolve the model name + display label from the entity (hash → name → game label)
    local modelHash = GetEntityModel(vehicle)
    local modelName = tostring(GetDisplayNameFromVehicleModel(modelHash)):lower()
    local labelKey = GetDisplayNameFromVehicleModel(modelHash)
    local displayLabel = GetLabelText(labelKey)
    if not displayLabel or displayLabel == '' or displayLabel == 'NULL' then
        displayLabel = labelKey or modelName
    end

    -- Pick which dealership to seize into
    local targetDealership
    if #seizeDealerships == 1 then
        targetDealership = seizeDealerships[1]
    else
        local options = {}
        for _, d in ipairs(seizeDealerships) do
            options[#options + 1] = { label = d.name, value = d.id }
        end
        local choice = lib.inputDialog(_L('seize_select_dealership'), {
            { type = 'select', label = _L('label_dealership'), options = options, required = true },
        })
        if not choice then return end
        for _, d in ipairs(seizeDealerships) do
            if d.id == tonumber(choice[1]) then targetDealership = d break end
        end
    end
    if not targetDealership then return end

    -- Confirmation
    local confirm = lib.alertDialog({
        header = _L('seize_confirm_header'),
        content = _L('seize_confirm_body', plate, targetDealership.name),
        centered = true,
        cancel = true,
    })
    if confirm ~= 'confirm' then return end

    local ok, err = lib.callback.await('pickle_dealerships:seizeVehicle', false, {
        dealershipId = targetDealership.id,
        plate = plate,
        properties = properties,
        modelName = modelName,
        label = displayLabel,
    })
    if not ok then
        ShowNotification(err or _L('seize_failed'))
        return
    end

    -- Despawn the world vehicle
    if DoesEntityExist(vehicle) then
        SetEntityAsMissionEntity(vehicle, true, true)
        DeleteEntity(vehicle)
    end
end

CreateThread(function()
    if not Config.UseTarget then return end
    Wait(2000) -- wait for target bridge

    -- Initial fetch of seize dealerships
    RefreshSeizeDealerships()

    AddTargetGlobalVehicle({
        {
            name = 'pickle_dealerships:tradeIn',
            label = _L('interact_trade_in'),
            icon = 'fa-solid fa-handshake-simple',
            distance = 2.5,
            canInteract = function(entity)
                if not currentDealership then return false end
                -- Hide trade-in if this dealership has seize enabled
                for _, d in ipairs(seizeDealerships) do
                    if d.location == currentDealership then return false end
                end
                local role = lib.callback.await('pickle_dealerships:getPlayerRole', false, currentDealership)
                return role == 'owner' or role == 'manager' or role == 'admin'
            end,
            onSelect = function(data)
                StartTradeIn(data.entity)
            end,
            -- qb-target compatibility
            action = function(entity)
                StartTradeIn(entity)
            end,
        },
        {
            name = 'pickle_dealerships:seizeVehicle',
            label = _L('interact_seize_vehicle'),
            icon = 'fa-solid fa-shield-halved',
            distance = 2.5,
            canInteract = function(entity)
                return #seizeDealerships > 0
            end,
            onSelect = function(data)
                StartSeize(data.entity)
            end,
            -- qb-target compatibility
            action = function(entity)
                StartSeize(entity)
            end,
        },
    })
end)

--- Refresh seize cache when server notifies us (admin toggled seize mode)
RegisterNetEvent('pickle_dealerships:refreshSeizeCache', function()
    RefreshSeizeDealerships()
end)

--- Cleanup on resource stop
AddEventHandler('onResourceStop', function(resourceName)
    if resourceName ~= GetCurrentResourceName() then return end
    DeleteDisplayVehicles()
    DeleteGhostVehicles()
end)
