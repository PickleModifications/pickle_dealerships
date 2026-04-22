-- =============================================
--  pickle_dealerships | modules/sales/client.lua
--  Client-side sales, test drives, vehicle spawn
-- =============================================

-- ─── Test Drive State ───────────────────────────────────────────────────────

local testDriveActive = false
local testDriveVehicle = nil
local testDriveTimer = 0
local testDriveBlip = nil
local testDriveRadiusBlip = nil
local testDriveDealershipId = nil
local testDriveOrigin = nil

-- ─── Vehicle Spawn Helper ───────────────────────────────────────────────────

function SpawnPurchasedVehicle(model, spawnPoint, color, secondaryColor, properties, plate)
    local modelHash = type(model) == "number" and model or joaat(model)
    RequestModel(modelHash)
    local timeout = 0
    while not HasModelLoaded(modelHash) and timeout < 5000 do
        Wait(10)
        timeout = timeout + 10
    end
    if not HasModelLoaded(modelHash) then
        ShowNotification(_L("sales_load_failed"))
        return nil
    end

    local coords = spawnPoint
    local heading = coords.w or 0.0
    -- Spawn slightly above ground to avoid clipping
    local veh = CreateVeh(modelHash, coords.x, coords.y, coords.z + 0.5, heading, true, false)

    -- Immediately freeze and protect from damage until placed properly
    FreezeEntityPosition(veh, true)
    SetEntityInvincible(veh, true)
    SetVehicleOnGroundProperly(veh)

    -- Pre-owned: apply full captured properties (overrides color-only path)
    if properties then
        if type(properties) == "string" then properties = json.decode(properties) end
        if type(properties) == "table" then
            lib.setVehicleProperties(veh, properties)
        end
    elseif color and type(color) == "table" then
        if color.r and color.g and color.b then
            SetVehicleCustomPrimaryColour(veh, color.r, color.g, color.b)
            if secondaryColor and type(secondaryColor) == "table" and secondaryColor.r then
                SetVehicleCustomSecondaryColour(veh, secondaryColor.r, secondaryColor.g, secondaryColor.b)
            else
                SetVehicleCustomSecondaryColour(veh, color.r, color.g, color.b)
            end
        elseif color.colorId then
            SetVehicleColours(veh, color.colorId, color.colorId)
        end
    end

    -- Apply the DB-assigned plate so the in-world vehicle matches ownership records
    if plate and plate ~= '' then
        SetVehicleNumberPlateText(veh, plate)
    end

    -- Warp player in, then unfreeze
    local ped = PlayerPedId()
    TaskWarpPedIntoVehicle(ped, veh, -1)
    SetVehicleEngineOn(veh, true, true, false)

    -- Small delay to let ground placement settle, then release
    Wait(100)
    FreezeEntityPosition(veh, false)
    SetEntityInvincible(veh, false)

    GiveVehicleKeys(veh)

    return veh
end

local function GetDealershipSpawnPoint(dealershipId)
    -- Find dealership location config by matching dealership DB id to config
    local dealership = lib.callback.await("pickle_dealerships:getDealershipConfig", false, { dealershipId = dealershipId })
    if dealership and dealership.spawnPoint then
        return vector4(dealership.spawnPoint.x, dealership.spawnPoint.y, dealership.spawnPoint.z, dealership.spawnPoint.w)
    end
    -- Fallback: try local config
    for locationId, cfg in pairs(DealershipConfigs) do
        if cfg.spawnPoint then
            return cfg.spawnPoint
        end
    end
    return vector4(0, 0, 0, 0)
end

-- ─── NUI Callbacks ──────────────────────────────────────────────────────────

RegisterNUICallback("purchaseVehicle", function(data, cb)
    -- Fetch stock details first so we know whether this is a pre-owned unit
    local details = lib.callback.await("pickle_dealerships:getVehicleDetails", false, { stockId = data.stockId })

    local result = lib.callback.await("pickle_dealerships:purchaseVehicle", false, {
        dealershipId = data.dealershipId,
        stockId = data.stockId,
        paymentMethod = data.paymentMethod or "cash",
        color = data.color,
        couponCode = data.couponCode,
    })

    if result and result.success then
        -- Spawn the purchased vehicle
        local spawnPoint = nil
        for locationId, cfg in pairs(DealershipConfigs) do
            if cfg.spawnPoint then
                -- Try to find matching dealership
                spawnPoint = cfg.spawnPoint
                break
            end
        end

        if data.spawnPoint then
            spawnPoint = vector4(data.spawnPoint.x, data.spawnPoint.y, data.spawnPoint.z, data.spawnPoint.w or 0.0)
        end

        if spawnPoint then
            local color = data.color
            if color and type(color) == "string" then
                color = json.decode(color)
            end
            local secColor = data.secondaryColor
            if secColor and type(secColor) == "string" then
                secColor = json.decode(secColor)
            end
            local props = nil
            if details and details.isUsed then
                props = details.properties
                if result.plate and type(props) == "table" then
                    props.plate = result.plate
                end
            end
            SpawnPurchasedVehicle(result.model, spawnPoint, color, secColor, props, result.plate)
        end

        ShowNotification(_L("sales_purchase_success", result.label or result.model))
    else
        ShowNotification(result and result.message or _L("sales_purchase_failed"))
    end

    cb(result or { success = false })
end)

RegisterNUICallback("getStockDetails", function(data, cb)
    local result = lib.callback.await("pickle_dealerships:getVehicleDetails", false, {
        stockId = data.stockId,
    })
    cb(result or {})
end)

RegisterNUICallback("getAltPaymentOptions", function(data, cb)
    local result = lib.callback.await("pickle_dealerships:getAltPaymentOptions", false, {
        dealershipId = data.dealershipId,
        price = data.price,
    })
    cb({ options = result or {} })
end)

-- ─── Test Drive System ──────────────────────────────────────────────────────

local function EndTestDrive()
    if not testDriveActive then return end
    testDriveActive = false

    SendNUIMessage({ action = "testDriveSubtitle", data = { visible = false } })

    -- Restore original routing bucket before teardown so the player rejoins
    -- the main instance cleanly.
    TriggerServerEvent('pickle_dealerships:leaveTestDriveBucket')

    -- Delete test drive vehicle
    if testDriveVehicle and DoesEntityExist(testDriveVehicle) then
        local ped = PlayerPedId()
        if GetVehiclePedIsIn(ped, false) == testDriveVehicle then
            TaskLeaveVehicle(ped, testDriveVehicle, 0)
            Wait(1500)
        end
        DeleteEntity(testDriveVehicle)
    end
    testDriveVehicle = nil

    -- Remove blips
    if testDriveBlip then
        RemoveBlip(testDriveBlip)
        testDriveBlip = nil
    end
    if testDriveRadiusBlip then
        RemoveBlip(testDriveRadiusBlip)
        testDriveRadiusBlip = nil
    end

    testDriveTimer = 0
    testDriveDealershipId = nil
    testDriveOrigin = nil

    ShowNotification(_L("sales_test_drive_ended"))
end

RegisterNUICallback("startTestDrive", function(data, cb)
    if testDriveActive then
        ShowNotification(_L("sales_test_drive_active"))
        cb({ success = false, message = "Already on a test drive." })
        return
    end

    local dealershipId = data.dealershipId
    local model = data.model
    local color = data.color

    if not model then
        cb({ success = false, message = "No vehicle model specified." })
        return
    end

    -- Find dealership config for spawn point and origin coords
    local spawnPoint = nil
    local originCoords = nil
    for locationId, cfg in pairs(DealershipConfigs) do
        if cfg.spawnPoint then
            spawnPoint = cfg.spawnPoint
            originCoords = cfg.coords
            break
        end
    end

    if data.spawnPoint then
        spawnPoint = vector4(data.spawnPoint.x, data.spawnPoint.y, data.spawnPoint.z, data.spawnPoint.w or 0.0)
    end
    if data.originCoords then
        originCoords = vector3(data.originCoords.x, data.originCoords.y, data.originCoords.z)
    end

    if not spawnPoint then
        cb({ success = false, message = "No spawn point available." })
        return
    end

    -- Parse color
    if color and type(color) == "string" then
        color = json.decode(color)
    end

    -- Tear the showroom scene down FIRST (ped restoration, camera, fade). If
    -- we spawn the vehicle and warp the player while the showroom still has
    -- them frozen off-world, CleanupShowroom runs afterwards and teleports
    -- them back to the interaction point — clobbering the warp. Running it
    -- inline here serializes the transition cleanly.
    if CleanupShowroom then
        CleanupShowroom(true) -- skip fade-in; we'll handle it after the spawn
        Wait(100)
    end

    -- Move the player to a dedicated routing bucket BEFORE spawning so the
    -- test-drive vehicle is created in the same instance. Everyone else at
    -- the dealership stays in the default bucket — no cross-player collisions
    -- during the drive.
    TriggerServerEvent('pickle_dealerships:enterTestDriveBucket')
    Wait(200) -- let the server-side bucket change take effect

    -- Spawn test drive vehicle
    local veh = SpawnPurchasedVehicle(model, spawnPoint, color)
    if not veh then
        TriggerServerEvent('pickle_dealerships:leaveTestDriveBucket')
        DoScreenFadeIn(300)
        cb({ success = false, message = "Failed to spawn test drive vehicle." })
        return
    end

    -- Force the player into the driver seat. SpawnPurchasedVehicle already
    -- issues TaskWarpPedIntoVehicle, but SetPedIntoVehicle is the synchronous
    -- "just put them there" call — run both and retry a couple of times, since
    -- bucket transitions can drop the first assignment.
    local ped = PlayerPedId()
    local attempts = 0
    while attempts < 5 and GetVehiclePedIsIn(ped, false) ~= veh do
        local vc = GetEntityCoords(veh)
        SetEntityCoords(ped, vc.x, vc.y, vc.z, false, false, false, false)
        SetPedIntoVehicle(ped, veh, -1)
        Wait(100)
        attempts = attempts + 1
    end
    DoScreenFadeIn(400)

    -- Lock vehicle so only the player can enter
    SetVehicleDoorsLocked(veh, 2)
    SetVehicleDoorsLockedForAllPlayers(veh, true)
    SetVehicleDoorsLockedForPlayer(veh, PlayerId(), false)

    -- SpawnPurchasedVehicle already handed out keys; re-issue here so the
    -- test driver still owns the plate after any lock/bucket reshuffle above.
    GiveVehicleKeys(veh)

    testDriveActive = true
    testDriveVehicle = veh
    testDriveTimer = Config.TestDriveTime or 120
    testDriveDealershipId = dealershipId
    testDriveOrigin = originCoords or GetEntityCoords(PlayerPedId())

    -- Create radius blip
    if testDriveOrigin then
        local radius = Config.TestDriveRadius or 500.0
        testDriveRadiusBlip = AddBlipForRadius(testDriveOrigin.x, testDriveOrigin.y, testDriveOrigin.z, radius)
        SetBlipColour(testDriveRadiusBlip, 1)
        SetBlipAlpha(testDriveRadiusBlip, 80)
        SetBlipHighDetail(testDriveRadiusBlip, true)

        testDriveBlip = AddBlipForCoord(testDriveOrigin.x, testDriveOrigin.y, testDriveOrigin.z)
        SetBlipSprite(testDriveBlip, 326)
        SetBlipColour(testDriveBlip, 1)
        SetBlipScale(testDriveBlip, 0.8)
        SetBlipRoute(testDriveBlip, false)
        BeginTextCommandSetBlipName("STRING")
        AddTextComponentString(_L("blip_test_drive_area"))
        EndTextCommandSetBlipName(testDriveBlip)
    end

    ShowNotification(_L("sales_test_drive_started", testDriveTimer))
    SendNUIMessage({
        action = "testDriveSubtitle",
        data = { visible = true, text = _L("sales_test_drive_end_hint") },
    })
    cb({ success = true })
end)

-- NUI-driven subtitle. Lua fires one message on start/end; the React overlay
-- (components/TestDriveSubtitle.tsx) handles the actual drawing. Keybind
-- listener runs at per-frame cadence only while a drive is active.
CreateThread(function()
    while true do
        if testDriveActive then
            if IsControlJustReleased(0, 177) then -- INPUT_FRONTEND_CANCEL (Backspace on PC)
                EndTestDrive()
            end
            Wait(0)
        else
            Wait(500)
        end
    end
end)

-- ─── Test Drive Monitor Thread ──────────────────────────────────────────────

CreateThread(function()
    while true do
        if testDriveActive then
            local wait = 1000
            testDriveTimer = testDriveTimer - 1

            -- Check timer expiry
            if testDriveTimer <= 0 then
                ShowNotification(_L("sales_test_drive_expired"))
                EndTestDrive()
            else
                -- Check distance from dealership
                if testDriveOrigin then
                    local playerCoords = GetEntityCoords(PlayerPedId())
                    local dist = #(playerCoords - testDriveOrigin)
                    local radius = Config.TestDriveRadius or 500.0

                    if dist > radius then
                        ShowNotification(_L("sales_test_drive_too_far"))
                        EndTestDrive()
                    elseif dist > radius * 0.85 then
                        ShowNotification(_L("sales_test_drive_boundary"))
                    end
                end

                -- Check if vehicle still exists
                if testDriveVehicle and not DoesEntityExist(testDriveVehicle) then
                    ShowNotification(_L("sales_test_drive_lost"))
                    EndTestDrive()
                end

                -- Show remaining time every 30 seconds
                if testDriveTimer > 0 and testDriveTimer % 30 == 0 then
                    ShowNotification(_L("sales_test_drive_remaining", testDriveTimer))
                end
            end

            Wait(wait)
        else
            Wait(1000)
        end
    end
end)

-- ─── Employee Sale Confirmation ─────────────────────────────────────────────

RegisterNetEvent("pickle_dealerships:confirmPurchase", function(data)
    local alert = lib.alertDialog({
        header = _L("sales_confirm_header"),
        content = _L("sales_confirm_body",
            data.sellerName or "A salesperson",
            data.label or data.model,
            GetCurrencyString(data.price)
        ),
        centered = true,
        cancel = true,
    })

    if alert == "confirm" then
        -- Ask payment method
        local paymentMethod = "bank"
        local input = lib.inputDialog(_L("sales_payment_method"), {
            { type = "select", label = _L("sales_payment_method"), options = {
                { value = "cash", label = _L("sales_payment_cash") },
                { value = "bank", label = _L("sales_payment_bank") },
            }, default = "bank" },
        })

        if input and input[1] then
            paymentMethod = input[1]
        end

        local result = lib.callback.await("pickle_dealerships:confirmEmployeeSale", false, {
            dealershipId = data.dealershipId,
            stockId = data.stockId,
            paymentMethod = paymentMethod,
            couponCode = data.couponCode,
            soldBy = data.soldBy,
            price = data.price,
        })

        if result and result.success then
            -- Find spawn point for vehicle
            local spawnPoint = nil
            for locationId, cfg in pairs(DealershipConfigs) do
                if cfg.spawnPoint then
                    spawnPoint = cfg.spawnPoint
                    break
                end
            end
            if spawnPoint then
                SpawnPurchasedVehicle(result.model, spawnPoint, nil)
            end
            ShowNotification(_L("sales_purchase_success", result.label or result.model))
        else
            ShowNotification(result and result.message or _L("sales_purchase_failed"))
        end
    else
        ShowNotification(_L("sales_purchase_declined"))
    end
end)

-- ─── Cleanup ────────────────────────────────────────────────────────────────

AddEventHandler("onResourceStop", function(resourceName)
    if GetCurrentResourceName() ~= resourceName then return end
    if testDriveActive then
        EndTestDrive()
    end
end)
