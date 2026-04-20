local currentDealership = nil
local dealershipData = nil
local dealershipBlips = {}
local dealershipZones = {}
local dealershipInteractions = {} -- keyed by locationKey -> array of interaction ids
local isNuiOpen = false
DealershipConfigs = {} -- resolved configs from server, shared across modules

--- Interaction point definitions
local interactionDefs = {
    management = function(locationKey)
        return {
            label = _L("interact_management"),
            icon = Config.TargetIcons.management,
        }, function(selection)
            if currentDealership == locationKey then
                OpenManagementMenu(locationKey)
            end
        end
    end,
    sales = function(locationKey)
        return {
            label = _L("interact_sales"),
            icon = Config.TargetIcons.sales,
        }, function(selection)
            if currentDealership == locationKey then
                OpenSalesTablet(locationKey)
            end
        end
    end,
    kiosk = function(locationKey)
        return {
            label = _L("interact_kiosk"),
            icon = Config.TargetIcons.kiosk,
        }, function(selection)
            if currentDealership == locationKey then
                OpenKiosk(locationKey)
            end
        end
    end,
}

--- Creates a single interaction point and returns its ID
local function CreateSingleInteraction(locationKey, pointType, coords)
    local defFn = interactionDefs[pointType]
    if not defFn then return nil end

    local opt, callback = defFn(locationKey)
    return CreateInteraction({
        label = opt.label,
        icon = opt.icon,
        coords = vector3(coords.x, coords.y, coords.z),
        rotation = vector3(0.0, 0.0, coords.w or 0.0),
        distance = Config.InteractDistance,
        options = { { label = opt.label, icon = opt.icon } },
    }, callback)
end

--- Creates all interaction points for a dealership, returns keyed table { management = id, sales = id, ... }
local function CreateDealershipInteractions(locationKey, cfg)
    local ids = {}
    if not cfg.interactionPoints then return ids end

    for pointType, coords in pairs(cfg.interactionPoints) do
        local id = CreateSingleInteraction(locationKey, pointType, coords)
        if id then ids[pointType] = id end
    end

    return ids
end

--- Tears down all dealerships
local function CleanupAllDealerships()
    for _, blip in pairs(dealershipBlips) do
        RemoveBlip(blip)
    end
    dealershipBlips = {}

    for _, zone in pairs(dealershipZones) do
        if zone and zone.remove then zone:remove() end
    end
    dealershipZones = {}

    for _, ids in pairs(dealershipInteractions) do
        for _, id in pairs(ids) do
            DeleteInteraction(id)
        end
    end
    dealershipInteractions = {}

    DealershipConfigs = {}
end

--- Sets up a single dealership from server data
local function SetupDealership(locationKey, data)
    local cfg = data.resolvedConfig
    if not cfg then return end

    DealershipConfigs[locationKey] = cfg

    if cfg.blip and cfg.coords then
        local blip = CreateBlip({
            coords = cfg.coords,
            sprite = cfg.blip.sprite,
            color = cfg.blip.color,
            scale = cfg.blip.scale or 0.85,
            label = data.name or cfg.label,
        })
        dealershipBlips[locationKey] = blip
    end

    if cfg.zones then
        for i, zoneData in ipairs(cfg.zones) do
            local zone = lib.zones.sphere({
                coords = zoneData.coords,
                radius = zoneData.radius or 30.0,
                debug = Config.Debug or false,
                onEnter = function()
                    OnEnterDealership(locationKey)
                end,
                onExit = function()
                    OnExitDealership(locationKey)
                end,
            })
            dealershipZones[locationKey .. "_" .. i] = zone
        end
    end

    dealershipInteractions[locationKey] = CreateDealershipInteractions(locationKey, cfg)
end

--- Full initial load
function LoadDealershipWorld()
    CleanupAllDealerships()

    local dealerships = lib.callback.await('pickle_dealerships:getDealerships', false)
    if not dealerships then return end

    for locationKey, data in pairs(dealerships) do
        SetupDealership(locationKey, data)
    end
end

-- Initial load on resource start
CreateThread(function()
    Wait(1000)
    LoadDealershipWorld()
end)

--- Surgically update only the specific position that changed
RegisterNetEvent('pickle_dealerships:positionUpdated', function(locationKey, field, pointType)
    -- Fetch fresh data for just this dealership
    local dealerships = lib.callback.await('pickle_dealerships:getDealerships', false)
    if not dealerships or not dealerships[locationKey] then return end

    local newCfg = dealerships[locationKey].resolvedConfig
    if not newCfg then return end

    DealershipConfigs[locationKey] = newCfg

    -- Blip: only update if coords changed
    if field == "coords" then
        if dealershipBlips[locationKey] then
            RemoveBlip(dealershipBlips[locationKey])
            dealershipBlips[locationKey] = nil
        end
        -- Remove old zones
        for key, zone in pairs(dealershipZones) do
            if key:find(locationKey, 1, true) == 1 then
                if zone and zone.remove then zone:remove() end
                dealershipZones[key] = nil
            end
        end
        -- Recreate blip + zones
        if newCfg.blip and newCfg.coords then
            local blip = CreateBlip({
                coords = newCfg.coords,
                sprite = newCfg.blip.sprite,
                color = newCfg.blip.color,
                scale = newCfg.blip.scale or 0.85,
                label = dealerships[locationKey].name or newCfg.label,
            })
            dealershipBlips[locationKey] = blip
        end
        if newCfg.zones then
            for i, zoneData in ipairs(newCfg.zones) do
                local zone = lib.zones.sphere({
                    coords = zoneData.coords,
                    radius = zoneData.radius or 30.0,
                    debug = Config.Debug or false,
                    onEnter = function() OnEnterDealership(locationKey) end,
                    onExit = function() OnExitDealership(locationKey) end,
                })
                dealershipZones[locationKey .. "_" .. i] = zone
            end
        end
    end

    -- Interaction point: only replace the specific one that changed
    if field == "interactionPoint" and pointType then
        if not dealershipInteractions[locationKey] then
            dealershipInteractions[locationKey] = {}
        end

        -- Remove old interaction for this point type
        if dealershipInteractions[locationKey][pointType] then
            DeleteInteraction(dealershipInteractions[locationKey][pointType])
            dealershipInteractions[locationKey][pointType] = nil
        end

        -- Create new one if coords exist
        if newCfg.interactionPoints and newCfg.interactionPoints[pointType] then
            local id = CreateSingleInteraction(locationKey, pointType, newCfg.interactionPoints[pointType])
            if id then
                dealershipInteractions[locationKey][pointType] = id
            end
        end
    end

    -- Spawn point: just update config, no in-world entity to change
    -- (spawnPoint is only used when purchasing/spawning vehicles)

    -- Display spots: refresh ghosts and clean up any orphaned display vehicles
    if field == "displaySpot" then
        if currentDealership == locationKey then
            TriggerEvent('pickle_dealerships:refreshDisplaySpots', locationKey)
        end
    end
end)

--- Called when player enters a dealership zone
function OnEnterDealership(locationKey)
    currentDealership = locationKey
    dealershipData = lib.callback.await('pickle_dealerships:getDealershipData', false, locationKey)
    TriggerEvent('pickle_dealerships:enteredDealership', locationKey, dealershipData)
    debugPrint("[Dealerships] Entered zone: " .. locationKey)
end

--- Called when player exits a dealership zone
function OnExitDealership(locationKey)
    if currentDealership == locationKey then
        TriggerEvent('pickle_dealerships:exitedDealership', locationKey)
        currentDealership = nil
        dealershipData = nil
        -- Showcase UIs (auction, photo booth) teleport the player far from the dealership zone
        -- intentionally and manage their own NUI close. Don't tear their UI down on zone exit.
        if not ImmersiveShowcaseActive then
            CloseNui()
        end
        debugPrint("[Dealerships] Exited zone: " .. locationKey)
    end
end

--- Opens the management UI for dealership owners/managers
function OpenManagementMenu(locationKey)
    local role = lib.callback.await('pickle_dealerships:getPlayerRole', false, locationKey)
    local data = lib.callback.await('pickle_dealerships:getDealershipData', false, locationKey)
    if not data then return end

    -- If dealership is unowned and player-owned mode, open purchase UI
    if not data.owner_identifier and data.mode == 'player-owned' then
        -- Still allow admins to access management
        if not role then
            OpenNui('management', {
                dealershipId = data.id,
                dealershipName = data.name or "Dealership",
                role = 'customer',
                tier = data.tier or 1,
                location = locationKey,
                type = data.type,
                isOwned = false,
                purchasePrice = data.purchasePrice or 0,
                mode = data.mode,
            })
            return
        end
    end

    -- If no role access, deny
    if not role then
        ShowNotification(_L("no_permission"))
        return
    end

    -- Fetch fresh finances to supply the initial balance
    local initialBalance = data.balance or 0
    if role == 'owner' or role == 'manager' or role == 'admin' then
        local finances = lib.callback.await('pickle_dealerships:getDealershipFinances', false, data.id)
        if finances and finances.balance then
            initialBalance = finances.balance
        end
    end

    OpenNui('management', {
        dealershipId = data.id,
        dealershipName = data.name or "Dealership",
        role = role,
        tier = data.tier or 1,
        location = locationKey,
        type = data.type,
        isOwned = data.owner_identifier ~= nil,
        purchasePrice = data.purchasePrice or 0,
        mode = data.mode,
        initialBalance = initialBalance,
    })
end

--- Opens the sales point — immersive showroom if a showroom position is set, otherwise sales tablet
function OpenSalesTablet(locationKey)
    if not lib.callback.await('pickle_dealerships:canAccessDealership', false, locationKey) then
        ShowNotification(_L("error_access_denied"))
        return
    end

    local data = lib.callback.await('pickle_dealerships:getDealershipData', false, locationKey)
    if not data then return end

    -- If a showroom position is set, open the immersive showroom
    local cfg = DealershipConfigs[locationKey]
    if cfg and cfg.interactionPoints and cfg.interactionPoints.showroom then
        StartShowroom(locationKey, data)
        return
    end

    -- Fallback to regular sales tablet (requires employee role)
    local role = lib.callback.await('pickle_dealerships:getPlayerRole', false, locationKey)
    if not role then
        ShowNotification(_L("no_permission"))
        return
    end

    OpenNui('sales', {
        dealershipId = data.id,
        dealershipName = data.name,
        role = role,
        tier = data.tier,
        location = locationKey,
    })
end

--- Opens the self-service kiosk
function OpenKiosk(locationKey)
    local cfg = DealershipConfigs[locationKey]
    if cfg and not cfg.selfService then
        ShowNotification(_L("showroom_self_service_unavailable"))
        return
    end

    if not lib.callback.await('pickle_dealerships:canAccessDealership', false, locationKey) then
        ShowNotification(_L("error_access_denied"))
        return
    end

    local data = lib.callback.await('pickle_dealerships:getDealershipData', false, locationKey)
    if not data then return end

    OpenNui('sales', {
        dealershipId = data.id,
        dealershipName = data.name,
        role = 'customer',
        tier = data.tier,
        location = locationKey,
        selfService = true,
    })
end

--- Opens the NUI with specified page and data
function OpenNui(page, data)
    if isNuiOpen then return end
    isNuiOpen = true

    SetNuiFocus(true, true)
    SendNUIMessage({
        type = 'open',
        page = page,
        data = data,
        accentColor = Config.UI and Config.UI.accentColor or "#e11d48",
    })
end

--- Closes the NUI and releases focus
function CloseNui()
    if not isNuiOpen then return end
    isNuiOpen = false

    SetNuiFocus(false, false)
    SendNUIMessage({
        type = 'close',
    })
end

-- NUI Callbacks
RegisterNUICallback('close', function(_, cb)
    CloseNui()
    cb('ok')
end)

RegisterNUICallback('ready', function(_, cb)
    cb('ok')
end)

RegisterNUICallback('getLocale', function(_, cb)
    cb(Language[Config.Language] or {})
end)

-- Cleanup on resource stop
AddEventHandler('onResourceStop', function(resourceName)
    if GetCurrentResourceName() ~= resourceName then return end
    CleanupAllDealerships()
end)

-- Exports for other modules
exports('GetCurrentDealership', function()
    return currentDealership
end)

exports('GetDealershipData', function()
    return dealershipData
end)

exports('IsNuiOpen', function()
    return isNuiOpen
end)

CreateThread(function()
    -- REMOVE THIS THREAD BEFORE DEPLOYMENT
    Wait(1000)
    DoScreenFadeIn(0)
end)