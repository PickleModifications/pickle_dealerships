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

function SpawnPurchasedVehicle(model, spawnPoint, color, secondaryColor)
    local modelHash = type(model) == "number" and model or joaat(model)
    RequestModel(modelHash)
    local timeout = 0
    while not HasModelLoaded(modelHash) and timeout < 5000 do
        Wait(10)
        timeout = timeout + 10
    end
    if not HasModelLoaded(modelHash) then
        ShowNotification("Failed to load vehicle model.")
        return nil
    end

    local coords = spawnPoint
    local heading = coords.w or 0.0
    local veh = CreateVeh(modelHash, coords.x, coords.y, coords.z, heading, true, false)

    -- Apply color
    if color and type(color) == "table" then
        if color.r and color.g and color.b then
            SetVehicleCustomPrimaryColour(veh, color.r, color.g, color.b)
            -- Use secondary color if provided, otherwise fall back to primary
            if secondaryColor and type(secondaryColor) == "table" and secondaryColor.r then
                SetVehicleCustomSecondaryColour(veh, secondaryColor.r, secondaryColor.g, secondaryColor.b)
            else
                SetVehicleCustomSecondaryColour(veh, color.r, color.g, color.b)
            end
        elseif color.colorId then
            SetVehicleColours(veh, color.colorId, color.colorId)
        end
    end

    -- Set player into vehicle
    local ped = PlayerPedId()
    TaskWarpPedIntoVehicle(ped, veh, -1)
    SetVehicleEngineOn(veh, true, true, false)
    SetVehicleOnGroundProperly(veh)

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
            SpawnPurchasedVehicle(result.model, spawnPoint, color, secColor)
        end

        ShowNotification(("Congratulations! You purchased a %s."):format(result.label or result.model))
    else
        ShowNotification(result and result.message or "Purchase failed.")
    end

    cb(result or { success = false })
end)

RegisterNUICallback("getStockDetails", function(data, cb)
    local result = lib.callback.await("pickle_dealerships:getVehicleDetails", false, {
        stockId = data.stockId,
    })
    cb(result or {})
end)

-- ─── Test Drive System ──────────────────────────────────────────────────────

local function EndTestDrive()
    if not testDriveActive then return end
    testDriveActive = false

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

    ShowNotification("Test drive has ended.")
end

RegisterNUICallback("startTestDrive", function(data, cb)
    if testDriveActive then
        ShowNotification("You are already on a test drive.")
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

    -- Spawn test drive vehicle
    local veh = SpawnPurchasedVehicle(model, spawnPoint, color)
    if not veh then
        cb({ success = false, message = "Failed to spawn test drive vehicle." })
        return
    end

    -- Lock vehicle so only the player can enter
    SetVehicleDoorsLocked(veh, 2)
    SetVehicleDoorsLockedForAllPlayers(veh, true)
    SetVehicleDoorsLockedForPlayer(veh, PlayerId(), false)

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
        AddTextComponentString("Test Drive Area")
        EndTextCommandSetBlipName(testDriveBlip)
    end

    ShowNotification(("Test drive started! You have %d seconds."):format(testDriveTimer))
    cb({ success = true })
end)

-- ─── Test Drive Monitor Thread ──────────────────────────────────────────────

CreateThread(function()
    while true do
        if testDriveActive then
            local wait = 1000
            testDriveTimer = testDriveTimer - 1

            -- Check timer expiry
            if testDriveTimer <= 0 then
                ShowNotification("Test drive time expired!")
                EndTestDrive()
            else
                -- Check distance from dealership
                if testDriveOrigin then
                    local playerCoords = GetEntityCoords(PlayerPedId())
                    local dist = #(playerCoords - testDriveOrigin)
                    local radius = Config.TestDriveRadius or 500.0

                    if dist > radius then
                        ShowNotification("You drove too far from the dealership!")
                        EndTestDrive()
                    elseif dist > radius * 0.85 then
                        ShowNotification("Warning: You are approaching the test drive boundary!")
                    end
                end

                -- Check if vehicle still exists
                if testDriveVehicle and not DoesEntityExist(testDriveVehicle) then
                    ShowNotification("Test drive vehicle lost!")
                    EndTestDrive()
                end

                -- Show remaining time every 30 seconds
                if testDriveTimer > 0 and testDriveTimer % 30 == 0 then
                    ShowNotification(("%d seconds remaining on test drive."):format(testDriveTimer))
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
        header = "Vehicle Purchase",
        content = ("**%s** is offering you a **%s** for **%s**.\n\nWould you like to purchase this vehicle?"):format(
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
        local input = lib.inputDialog("Payment Method", {
            { type = "select", label = "Payment Method", options = {
                { value = "cash", label = "Cash" },
                { value = "bank", label = "Bank" },
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
            ShowNotification(("Congratulations! You purchased a %s."):format(result.label or result.model))
        else
            ShowNotification(result and result.message or "Purchase failed.")
        end
    else
        ShowNotification("You declined the purchase.")
    end
end)

-- ─── Cleanup ────────────────────────────────────────────────────────────────

AddEventHandler("onResourceStop", function(resourceName)
    if GetCurrentResourceName() ~= resourceName then return end
    if testDriveActive then
        EndTestDrive()
    end
end)
