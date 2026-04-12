-- =============================================
--  pickle_dealerships | modules/financing/server.lua
--  Vehicle financing system
-- =============================================

-- ─── Helpers ────────────────────────────────────────────────────────────────

local function GetStockItem(stockId)
    local rows = MySQL.query.await(
        "SELECT * FROM `dealership_stock` WHERE `id` = ? LIMIT 1",
        { tonumber(stockId) }
    )
    return rows and rows[1] or nil
end

local function MarkStockSold(stockId, identifier, soldBy)
    MySQL.update(
        "UPDATE `dealership_stock` SET `sold_at` = NOW(), `sold_to` = ?, `sold_by` = ? WHERE `id` = ?",
        { identifier, soldBy, tonumber(stockId) }
    )
end

local function AddDealershipBalance(dealershipId, amount)
    MySQL.update.await(
        "UPDATE `dealerships` SET `balance` = `balance` + ? WHERE `id` = ?",
        { tonumber(amount), tonumber(dealershipId) }
    )
    local freshBalance = MySQL.scalar.await(
        "SELECT `balance` FROM `dealerships` WHERE `id` = ?",
        { tonumber(dealershipId) }
    )
    if freshBalance then
        UpdateDealershipCache(dealershipId, { balance = tonumber(freshBalance) })
    end
end

-- ─── Create Financing ───────────────────────────────────────────────────────

lib.callback.register("pickle_dealerships:createFinancing", function(source, data)
    local dealershipId = tonumber(data.dealershipId)
    local stockId = tonumber(data.stockId)
    local downPayment = tonumber(data.downPayment) or 0
    local installments = tonumber(data.installments) or 12

    if not dealershipId or not stockId then
        return { success = false, message = "Invalid request." }
    end

    local dealership = GetDealership(dealershipId)
    if not dealership then
        return { success = false, message = "Dealership not found." }
    end

    -- Check if financing feature is available for this tier
    if not HasTierFeature(dealership.tier, "financing") then
        return { success = false, message = "This dealership does not offer financing." }
    end

    local stockItem = GetStockItem(stockId)
    if not stockItem then
        return { success = false, message = "Vehicle not found in stock." }
    end
    if stockItem.dealership_id ~= dealershipId then
        return { success = false, message = "Vehicle does not belong to this dealership." }
    end
    if not stockItem.delivered_at then
        return { success = false, message = "Vehicle has not been delivered yet." }
    end
    if stockItem.sold_at then
        return { success = false, message = "Vehicle has already been sold." }
    end

    local price = stockItem.retail_price
    local minDown = math.floor(price * Config.FinancingMinDown)

    if downPayment < minDown then
        return { success = false, message = ("Minimum down payment is %s (%d%%)."):format(GetCurrencyString(minDown), Config.FinancingMinDown * 100) }
    end

    local identifier = GetIdentifier(source)
    if not identifier then
        return { success = false, message = "Could not identify player." }
    end

    -- Check player has funds for down payment
    local playerMoney = GetMoney(source, "bank")
    if playerMoney < downPayment then
        return { success = false, message = "Insufficient funds for down payment." }
    end

    -- Calculate financing details
    local remainingBalance = price - downPayment
    local interestRate = Config.FinancingInterest or 0.05
    local totalWithInterest = remainingBalance + math.floor(remainingBalance * interestRate)
    local installmentAmount = math.ceil(totalWithInterest / installments)

    -- Deduct down payment
    RemoveMoney(source, downPayment, "bank")

    -- Sales tax on full price
    local salesTax = math.floor(price * Config.SalesTax)
    local netDownPayment = downPayment - math.floor(downPayment * Config.SalesTax)

    -- Credit down payment to dealership
    AddDealershipBalance(dealershipId, netDownPayment)

    -- Mark stock as sold
    MarkStockSold(stockId, identifier, nil)

    -- Generate plate and register vehicle
    local plate = GeneratePlate()
    AddOwnedVehicle(source, stockItem.vehicle_model)

    -- Calculate next payment time
    local paymentIntervalSeconds = (Config.FinancingPaymentInterval or 24) * 3600
    local nextPaymentTimestamp = os.time() + paymentIntervalSeconds

    -- Create financing record
    MySQL.insert(
        "INSERT INTO `dealership_financing` (`dealership_id`, `identifier`, `vehicle_plate`, `total_amount`, `amount_paid`, `installment_amount`, `interest_rate`, `next_payment`, `status`) VALUES (?, ?, ?, ?, ?, ?, ?, FROM_UNIXTIME(?), 'active')",
        {
            dealershipId,
            identifier,
            toupper(plate),
            totalWithInterest,
            0,
            installmentAmount,
            interestRate * 100,
            nextPaymentTimestamp,
        }
    )

    -- Ledger entries
    AddLedgerEntry(dealershipId, "sale", price, ("Financed vehicle: %s (down: %s)"):format(stockItem.vehicle_label or stockItem.vehicle_model, GetCurrencyString(downPayment)), identifier)
    if salesTax > 0 then
        AddLedgerEntry(dealershipId, "tax", -salesTax, ("Sales tax on financed %s"):format(stockItem.vehicle_label or stockItem.vehicle_model), nil)
    end

    ShowNotification(source, ("You financed a %s! Down payment: %s. Monthly payment: %s for %d installments."):format(
        stockItem.vehicle_label or stockItem.vehicle_model,
        GetCurrencyString(downPayment),
        GetCurrencyString(installmentAmount),
        installments
    ))

    debugPrint(("[Financing] Player %s financed %s - Down: %s, Installments: %d x %s"):format(
        identifier, stockItem.vehicle_model, GetCurrencyString(downPayment), installments, GetCurrencyString(installmentAmount)
    ))

    return {
        success = true,
        plate = plate,
        model = stockItem.vehicle_model,
        label = stockItem.vehicle_label or stockItem.vehicle_model,
        downPayment = downPayment,
        installmentAmount = installmentAmount,
        totalInstallments = installments,
        totalWithInterest = totalWithInterest,
    }
end)

-- ─── Make Payment ───────────────────────────────────────────────────────────

lib.callback.register("pickle_dealerships:makePayment", function(source, data)
    local financingId = tonumber(data.financingId)
    if not financingId then
        return { success = false, message = "Invalid request." }
    end

    local identifier = GetIdentifier(source)
    if not identifier then
        return { success = false, message = "Could not identify player." }
    end

    local rows = MySQL.query.await(
        "SELECT * FROM `dealership_financing` WHERE `id` = ? AND `identifier` = ? AND `status` = 'active' LIMIT 1",
        { financingId, identifier }
    )
    local financing = rows and rows[1] or nil
    if not financing then
        return { success = false, message = "Financing agreement not found or already completed." }
    end

    local paymentAmount = financing.installment_amount
    local remaining = financing.total_amount - financing.amount_paid

    -- Cap payment at remaining balance
    if paymentAmount > remaining then
        paymentAmount = remaining
    end

    -- Check player funds
    local playerMoney = GetMoney(source, "bank")
    if playerMoney < paymentAmount then
        return { success = false, message = "Insufficient funds for payment." }
    end

    -- Deduct money
    RemoveMoney(source, paymentAmount, "bank")

    -- Update financing record
    local newAmountPaid = financing.amount_paid + paymentAmount
    local fullyPaid = newAmountPaid >= financing.total_amount

    -- Credit dealership (minus tax)
    local netPayment = paymentAmount - math.floor(paymentAmount * Config.SalesTax)
    AddDealershipBalance(financing.dealership_id, netPayment)

    -- Calculate next payment timestamp
    local paymentIntervalSeconds = (Config.FinancingPaymentInterval or 24) * 3600
    local nextPaymentTimestamp = os.time() + paymentIntervalSeconds

    if fullyPaid then
        MySQL.update(
            "UPDATE `dealership_financing` SET `amount_paid` = ?, `status` = 'paid', `missed_payments` = 0 WHERE `id` = ?",
            { newAmountPaid, financingId }
        )
        AddLedgerEntry(financing.dealership_id, "financing_payment", paymentAmount, ("Final financing payment for plate %s"):format(financing.vehicle_plate), identifier)
        ShowNotification(source, ("Congratulations! Your vehicle (%s) is fully paid off!"):format(financing.vehicle_plate))
    else
        MySQL.update(
            "UPDATE `dealership_financing` SET `amount_paid` = ?, `next_payment` = FROM_UNIXTIME(?), `missed_payments` = 0 WHERE `id` = ?",
            { newAmountPaid, nextPaymentTimestamp, financingId }
        )
        AddLedgerEntry(financing.dealership_id, "financing_payment", paymentAmount, ("Financing payment for plate %s"):format(financing.vehicle_plate), identifier)
        ShowNotification(source, ("Payment of %s received. Remaining: %s"):format(GetCurrencyString(paymentAmount), GetCurrencyString(financing.total_amount - newAmountPaid)))
    end

    debugPrint(("[Financing] Player %s paid %s on financing #%d"):format(identifier, GetCurrencyString(paymentAmount), financingId))

    return {
        success = true,
        amountPaid = paymentAmount,
        totalPaid = newAmountPaid,
        remaining = financing.total_amount - newAmountPaid,
        fullyPaid = fullyPaid,
    }
end)

-- ─── Get My Financing ───────────────────────────────────────────────────────

lib.callback.register("pickle_dealerships:getMyFinancing", function(source, data)
    local identifier = GetIdentifier(source)
    if not identifier then return {} end

    local rows = MySQL.query.await(
        "SELECT f.*, d.name AS dealership_name FROM `dealership_financing` f LEFT JOIN `dealerships` d ON f.dealership_id = d.id WHERE f.identifier = ? AND f.status = 'active' ORDER BY f.created_at DESC",
        { identifier }
    )

    if not rows then return {} end

    local results = {}
    for i = 1, #rows do
        local row = rows[i]
        results[#results + 1] = {
            id = row.id,
            dealershipId = row.dealership_id,
            dealershipName = row.dealership_name,
            vehiclePlate = row.vehicle_plate,
            totalAmount = row.total_amount,
            amountPaid = row.amount_paid,
            remaining = row.total_amount - row.amount_paid,
            installmentAmount = row.installment_amount,
            interestRate = row.interest_rate,
            nextPayment = row.next_payment,
            missedPayments = row.missed_payments,
            status = row.status,
            createdAt = row.created_at,
        }
    end

    return results
end)

-- ─── Financing Check Thread (Overdue Payments) ─────────────────────────────

CreateThread(function()
    -- Wait for database to be ready
    Wait(10000)

    while true do
        Wait(5 * 60 * 1000) -- Every 5 minutes

        local now = os.time()
        local rows = MySQL.query.await(
            "SELECT * FROM `dealership_financing` WHERE `status` = 'active' AND `next_payment` IS NOT NULL AND `next_payment` < NOW()"
        )

        if rows then
            for i = 1, #rows do
                local financing = rows[i]
                local newMissed = financing.missed_payments + 1

                if newMissed >= (Config.FinancingMaxMissed or 3) then
                    -- Repossess the vehicle
                    MySQL.update(
                        "UPDATE `dealership_financing` SET `status` = 'repossessed', `missed_payments` = ? WHERE `id` = ?",
                        { newMissed, financing.id }
                    )

                    -- Remove vehicle from player_vehicles
                    MySQL.update(
                        "DELETE FROM `player_vehicles` WHERE `plate` = ?",
                        { financing.vehicle_plate }
                    )

                    AddLedgerEntry(financing.dealership_id, "repossession", 0, ("Vehicle repossessed: plate %s after %d missed payments"):format(financing.vehicle_plate, newMissed), financing.identifier)

                    -- Notify player if online
                    local playerSource = GetSourceFromIdentifier(financing.identifier)
                    if playerSource then
                        TriggerClientEvent("pickle_dealerships:vehicleRepossessed", playerSource, {
                            plate = financing.vehicle_plate,
                            missedPayments = newMissed,
                        })
                    end

                    debugPrint(("[Financing] Vehicle %s repossessed from %s after %d missed payments"):format(financing.vehicle_plate, financing.identifier, newMissed))
                else
                    -- Increment missed payments and push next_payment forward
                    local paymentIntervalSeconds = (Config.FinancingPaymentInterval or 24) * 3600
                    local nextPaymentTimestamp = now + paymentIntervalSeconds

                    MySQL.update(
                        "UPDATE `dealership_financing` SET `missed_payments` = ?, `next_payment` = FROM_UNIXTIME(?) WHERE `id` = ?",
                        { newMissed, nextPaymentTimestamp, financing.id }
                    )

                    -- Notify player if online
                    local playerSource = GetSourceFromIdentifier(financing.identifier)
                    if playerSource then
                        TriggerClientEvent("pickle_dealerships:financingReminder", playerSource, {
                            plate = financing.vehicle_plate,
                            missedPayments = newMissed,
                            maxMissed = Config.FinancingMaxMissed or 3,
                            installmentAmount = financing.installment_amount,
                            remaining = financing.total_amount - financing.amount_paid,
                        })
                    end

                    debugPrint(("[Financing] Player %s missed payment #%d on plate %s"):format(financing.identifier, newMissed, financing.vehicle_plate))
                end
            end
        end
    end
end)
