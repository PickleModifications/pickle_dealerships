local currentDealership = nil
local dealershipData = nil
local dealershipBlips = {}
local dealershipZones = {}
local interactionIds = {}
local isNuiOpen = false

-- Create blips and zones on resource start
CreateThread(function()
    Wait(1000)
    local dealerships = lib.callback.await('pickle_dealerships:getDealerships', false)
    if not dealerships then return end

    for locationKey, data in pairs(dealerships) do
        local cfg = Config.Dealerships[locationKey]
        if not cfg then goto continue end

        -- Create map blip
        if cfg.blip then
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

--- Opens the management menu for dealership owners/managers
function OpenManagementMenu(locationKey)
    local role = lib.callback.await('pickle_dealerships:getPlayerRole', false, locationKey)
    local data = lib.callback.await('pickle_dealerships:getDealershipData', false, locationKey)
    if not data then return end

    local cfg = Config.Dealerships[locationKey]
    if not cfg then return end

    -- If dealership is unowned and player-owned mode, offer purchase
    if not data.owner_citizenid and data.mode == 'player-owned' then
        lib.registerContext({
            id = 'dealership_purchase',
            title = (cfg.label or 'Dealership') .. ' - For Sale',
            options = {
                {
                    title = _L("menu_purchase_dealership"),
                    description = string.format(_L("menu_purchase_dealership_desc"), GetCurrencyString(cfg.purchasePrice or 0)),
                    icon = 'fas fa-dollar-sign',
                    onSelect = function()
                        local confirm = lib.alertDialog({
                            header = _L("sale_confirm_title"),
                            content = 'Purchase this dealership for ' .. GetCurrencyString(cfg.purchasePrice or 0) .. '?',
                            centered = true,
                            cancel = true,
                        })
                        if confirm == 'confirm' then
                            local result = lib.callback.await('pickle_dealerships:purchaseDealership', false, locationKey)
                            if result and result.success then
                                ShowNotification(string.format(_L("dealership_purchased"), cfg.label))
                            else
                                ShowNotification(result and result.error or _L("something_went_wrong"))
                            end
                        end
                    end,
                },
            },
        })
        lib.showContext('dealership_purchase')
        return
    end

    -- If no role access, deny
    if not role then
        ShowNotification(_L("no_permission"))
        return
    end

    local options = {
        {
            title = _L("menu_stock_catalog"),
            description = _L("menu_stock_catalog_desc"),
            icon = 'fas fa-warehouse',
            onSelect = function()
                OpenNui('stock', {
                    dealershipId = data.id,
                    dealershipName = data.name,
                    role = role,
                    tier = data.tier,
                    location = locationKey,
                })
            end,
        },
        {
            title = 'Order Vehicles',
            description = 'Browse wholesale catalog and order stock',
            icon = 'fas fa-truck-loading',
            onSelect = function()
                OpenNui('catalog', {
                    dealershipId = data.id,
                    dealershipName = data.name,
                    role = role,
                    tier = data.tier,
                    location = locationKey,
                    type = data.type,
                })
            end,
        },
    }

    -- Manager+ options
    if role == 'owner' or role == 'manager' or role == 'admin' then
        options[#options + 1] = {
            title = _L("menu_employees"),
            description = _L("menu_employees_desc"),
            icon = 'fas fa-users',
            onSelect = function()
                OpenNui('employees', {
                    dealershipId = data.id,
                    dealershipName = data.name,
                    role = role,
                    tier = data.tier,
                })
            end,
        }
        options[#options + 1] = {
            title = _L("menu_finances"),
            description = _L("menu_finances_desc") .. ' | Balance: ' .. GetCurrencyString(data.balance or 0),
            icon = 'fas fa-chart-line',
            onSelect = function()
                OpenNui('finances', {
                    dealershipId = data.id,
                    dealershipName = data.name,
                    role = role,
                    tier = data.tier,
                })
            end,
        }
        options[#options + 1] = {
            title = _L("menu_dashboard"),
            description = _L("menu_dashboard_desc"),
            icon = 'fas fa-chart-bar',
            onSelect = function()
                OpenNui('dashboard', {
                    dealershipId = data.id,
                    dealershipName = data.name,
                    role = role,
                    tier = data.tier,
                })
            end,
        }
    end

    -- Owner-only options
    if role == 'owner' or role == 'admin' then
        options[#options + 1] = {
            title = _L("menu_upgrades"),
            description = _L("menu_upgrades_desc") .. ' | Tier ' .. (data.tier or 1),
            icon = 'fas fa-arrow-up',
            onSelect = function()
                local nextTier = (data.tier or 1) + 1
                local tierData = Config.Tiers[nextTier]
                if not tierData then
                    ShowNotification(_L("upgrade_max_tier"))
                    return
                end
                local confirm = lib.alertDialog({
                    header = 'Upgrade to ' .. tierData.label,
                    content = 'Upgrade cost: ' .. GetCurrencyString(tierData.upgradeCost) .. '\nNew stock capacity: ' .. tierData.stockCap .. '\nNew employee cap: ' .. tierData.employeeCap,
                    centered = true,
                    cancel = true,
                })
                if confirm == 'confirm' then
                    local result = lib.callback.await('pickle_dealerships:upgradeTier', false, { dealershipId = data.id })
                    if result and result.success then
                        ShowNotification(string.format(_L("upgrade_success"), tierData.label, tierData.stockCap, tierData.employeeCap))
                    else
                        ShowNotification(result and result.error or _L("something_went_wrong"))
                    end
                end
            end,
        }

        if HasTierFeature(data.tier, "coupons") then
            options[#options + 1] = {
                title = _L("menu_coupons"),
                description = _L("menu_coupons_desc"),
                icon = 'fas fa-ticket-alt',
                onSelect = function()
                    OpenNui('coupons', {
                        dealershipId = data.id,
                        dealershipName = data.name,
                        role = role,
                        tier = data.tier,
                    })
                end,
            }
        end

        options[#options + 1] = {
            title = _L("menu_settings"),
            description = _L("menu_settings_desc"),
            icon = 'fas fa-cog',
            onSelect = function()
                local input = lib.inputDialog('Rename Dealership', {
                    { type = 'input', label = 'New Name', required = true, min = 1, max = 50, default = data.name },
                })
                if input and input[1] then
                    local result = lib.callback.await('pickle_dealerships:renameDealership', false, locationKey, input[1])
                    if result and result.success then
                        ShowNotification(string.format(_L("dealership_renamed"), input[1]))
                    else
                        ShowNotification(result and result.error or _L("something_went_wrong"))
                    end
                end
            end,
        }

        options[#options + 1] = {
            title = _L("menu_sell_dealership"),
            description = string.format(_L("menu_sell_dealership_desc"), GetCurrencyString(math.floor((cfg.purchasePrice or 0) * Config.SellbackRate))),
            icon = 'fas fa-hand-holding-usd',
            onSelect = function()
                local confirm = lib.alertDialog({
                    header = 'Sell Dealership',
                    content = 'Are you sure you want to sell this dealership? All employees will be fired and stock will be lost. You will receive ' .. GetCurrencyString(math.floor((cfg.purchasePrice or 0) * Config.SellbackRate)) .. '.',
                    centered = true,
                    cancel = true,
                })
                if confirm == 'confirm' then
                    local result = lib.callback.await('pickle_dealerships:sellDealership', false, locationKey)
                    if result and result.success then
                        ShowNotification(string.format(_L("dealership_sold"), cfg.label, GetCurrencyString(result.refund or 0)))
                    else
                        ShowNotification(result and result.error or _L("something_went_wrong"))
                    end
                end
            end,
        }
    end

    lib.registerContext({
        id = 'dealership_management',
        title = (data.name or cfg.label) .. ' - ' .. _L("menu_management_title"),
        options = options,
    })
    lib.showContext('dealership_management')
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
    local cfg = Config.Dealerships[locationKey]
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
