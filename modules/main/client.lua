local currentDealership = nil
local dealershipData = nil
local dealershipBlips = {}
local dealershipZones = {}
local interactionIds = {}
local isNuiOpen = false
DealershipConfigs = {} -- resolved configs from server, shared across modules

-- Create blips and zones on resource start
CreateThread(function()
    Wait(1000)
    local dealerships = lib.callback.await('pickle_dealerships:getDealerships', false)
    if not dealerships then return end

    for locationKey, data in pairs(dealerships) do
        local cfg = data.resolvedConfig
        if not cfg then goto continue end

        -- Store resolved config for later use
        DealershipConfigs[locationKey] = cfg

        -- Create map blip
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

        -- Create zone(s)
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

        -- Create interaction points
        if cfg.interactionPoints then
            if cfg.interactionPoints.management then
                local coords = cfg.interactionPoints.management
                local id = CreateInteraction({
                    label = _L("interact_management"),
                    icon = Config.TargetIcons.management,
                    coords = vector3(coords.x, coords.y, coords.z),
                    rotation = vector3(0.0, 0.0, coords.w or 0.0),
                    distance = Config.InteractDistance,
                    options = {
                        {
                            label = _L("interact_management"),
                            icon = Config.TargetIcons.management,
                        },
                    },
                }, function(selection)
                    if currentDealership == locationKey then
                        OpenManagementMenu(locationKey)
                    end
                end)
                interactionIds[#interactionIds + 1] = id
            end

            if cfg.interactionPoints.sales then
                local coords = cfg.interactionPoints.sales
                local id = CreateInteraction({
                    label = _L("interact_sales"),
                    icon = Config.TargetIcons.sales,
                    coords = vector3(coords.x, coords.y, coords.z),
                    rotation = vector3(0.0, 0.0, coords.w or 0.0),
                    distance = Config.InteractDistance,
                    options = {
                        {
                            label = _L("interact_sales"),
                            icon = Config.TargetIcons.sales,
                        },
                    },
                }, function(selection)
                    if currentDealership == locationKey then
                        OpenSalesTablet(locationKey)
                    end
                end)
                interactionIds[#interactionIds + 1] = id
            end

            if cfg.interactionPoints.kiosk then
                local coords = cfg.interactionPoints.kiosk
                local id = CreateInteraction({
                    label = _L("interact_kiosk"),
                    icon = Config.TargetIcons.kiosk,
                    coords = vector3(coords.x, coords.y, coords.z),
                    rotation = vector3(0.0, 0.0, coords.w or 0.0),
                    distance = Config.InteractDistance,
                    options = {
                        {
                            label = _L("interact_kiosk"),
                            icon = Config.TargetIcons.dealership,
                        },
                    },
                }, function(selection)
                    if currentDealership == locationKey then
                        OpenKiosk(locationKey)
                    end
                end)
                interactionIds[#interactionIds + 1] = id
            end
        end

        ::continue::
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
        CloseNui()
        debugPrint("[Dealerships] Exited zone: " .. locationKey)
    end
end

--- Opens the management UI for dealership owners/managers
function OpenManagementMenu(locationKey)
    local role = lib.callback.await('pickle_dealerships:getPlayerRole', false, locationKey)
    local data = lib.callback.await('pickle_dealerships:getDealershipData', false, locationKey)
    if not data then return end

    -- If dealership is unowned and player-owned mode, open purchase UI
    if not data.owner_citizenid and data.mode == 'player-owned' then
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

    OpenNui('management', {
        dealershipId = data.id,
        dealershipName = data.name or "Dealership",
        role = role,
        tier = data.tier or 1,
        location = locationKey,
        type = data.type,
        isOwned = data.owner_citizenid ~= nil,
        purchasePrice = data.purchasePrice or 0,
        mode = data.mode,
    })
end

--- Opens the sales tablet UI
function OpenSalesTablet(locationKey)
    local role = lib.callback.await('pickle_dealerships:getPlayerRole', false, locationKey)
    if not role then
        ShowNotification(_L("no_permission"))
        return
    end

    local data = lib.callback.await('pickle_dealerships:getDealershipData', false, locationKey)
    if not data then return end

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
        ShowNotification("Self-service is not available at this dealership.")
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

-- Cleanup on resource stop
AddEventHandler('onResourceStop', function(resourceName)
    if GetCurrentResourceName() ~= resourceName then return end
    for _, blip in pairs(dealershipBlips) do
        RemoveBlip(blip)
    end
    for _, zone in pairs(dealershipZones) do
        if zone and zone.remove then zone:remove() end
    end
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
