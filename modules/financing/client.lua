-- =============================================
--  pickle_dealerships | modules/financing/client.lua
--  Client-side financing interactions
-- =============================================

-- ─── NUI Callbacks ──────────────────────────────────────────────────────────

RegisterNUICallback("createFinancing", function(data, cb)
    local result = lib.callback.await("pickle_dealerships:createFinancing", false, {
        dealershipId = data.dealershipId,
        stockId = data.stockId,
        downPayment = tonumber(data.downPayment) or 0,
        installments = tonumber(data.installments) or 12,
    })

    if result and result.success then
        ShowNotification(("Financing approved for %s! Down: %s, %d payments of %s."):format(
            result.label or result.model,
            GetCurrencyString(result.downPayment),
            result.totalInstallments,
            GetCurrencyString(result.installmentAmount)
        ))

        -- Spawn the financed vehicle at the dealership spawn point
        local spawnPoint = nil
        for locationId, cfg in pairs(Config.Dealerships) do
            if cfg.spawnPoint then
                spawnPoint = cfg.spawnPoint
                break
            end
        end

        if data.spawnPoint then
            spawnPoint = vector4(data.spawnPoint.x, data.spawnPoint.y, data.spawnPoint.z, data.spawnPoint.w or 0.0)
        end

        if spawnPoint and result.model then
            local modelHash = joaat(result.model)
            RequestModel(modelHash)
            local timeout = 0
            while not HasModelLoaded(modelHash) and timeout < 5000 do
                Wait(10)
                timeout = timeout + 10
            end
            if HasModelLoaded(modelHash) then
                local veh = CreateVeh(modelHash, spawnPoint.x, spawnPoint.y, spawnPoint.z, spawnPoint.w or 0.0, true, false)
                local ped = PlayerPedId()
                TaskWarpPedIntoVehicle(ped, veh, -1)
                SetVehicleEngineOn(veh, true, true, false)
                SetVehicleOnGroundProperly(veh)
            end
        end
    else
        ShowNotification(result and result.message or "Financing request failed.")
    end

    cb(result or { success = false })
end)

RegisterNUICallback("makePayment", function(data, cb)
    local result = lib.callback.await("pickle_dealerships:makePayment", false, {
        financingId = data.financingId,
    })

    if result and result.success then
        if result.fullyPaid then
            ShowNotification("Vehicle fully paid off! Congratulations!")
        else
            ShowNotification(("Payment of %s received. Remaining balance: %s"):format(
                GetCurrencyString(result.amountPaid),
                GetCurrencyString(result.remaining)
            ))
        end
    else
        ShowNotification(result and result.message or "Payment failed.")
    end

    cb(result or { success = false })
end)

RegisterNUICallback("getMyFinancing", function(data, cb)
    local result = lib.callback.await("pickle_dealerships:getMyFinancing", false, {})
    cb(result or {})
end)

-- ─── Server Events ──────────────────────────────────────────────────────────

RegisterNetEvent("pickle_dealerships:financingReminder", function(data)
    local missedStr = ""
    if data.missedPayments and data.missedPayments > 0 then
        missedStr = (" You have %d/%d missed payments."):format(data.missedPayments, data.maxMissed or Config.FinancingMaxMissed or 3)
    end

    lib.notify({
        title = "Financing Reminder",
        description = ("Payment of %s is overdue for vehicle %s.%s Remaining: %s"):format(
            GetCurrencyString(data.installmentAmount),
            data.plate,
            missedStr,
            GetCurrencyString(data.remaining)
        ),
        type = "warning",
        duration = 10000,
    })
end)

RegisterNetEvent("pickle_dealerships:vehicleRepossessed", function(data)
    lib.notify({
        title = "Vehicle Repossessed",
        description = ("Your vehicle (%s) has been repossessed due to %d missed payments."):format(
            data.plate,
            data.missedPayments
        ),
        type = "error",
        duration = 15000,
    })
end)
