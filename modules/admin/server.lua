--- Get all dealerships (admin only)
lib.callback.register("pickle_dealerships:adminGetAllDealerships", function(source)
    if not IsPlayerAdmin(source) then
        return nil
    end

    local dealerships = MySQL.query.await("SELECT * FROM dealerships ORDER BY id ASC")
    return dealerships or {}
end)

--- Force transfer dealership ownership
lib.callback.register("pickle_dealerships:adminTransferOwnership", function(source, data)
    if not IsPlayerAdmin(source) then
        return { success = false, message = "You do not have admin permissions." }
    end

    local dealershipId = data.dealershipId
    local newOwnerId = data.newOwnerId

    if not dealershipId or not newOwnerId then
        return { success = false, message = "Missing dealership ID or new owner ID." }
    end

    local dealership = GetDealership(dealershipId)
    if not dealership then
        return { success = false, message = "Dealership not found." }
    end

    MySQL.update.await("UPDATE dealerships SET owner_id = ? WHERE id = ?", { newOwnerId, dealershipId })
    UpdateDealershipCache(dealershipId, { owner_id = newOwnerId })

    local adminName = GetPlayerCharacterName(source) or GetPlayerName(source)
    AddLedgerEntry(dealershipId, "admin", 0, "Ownership transferred to " .. newOwnerId .. " by admin " .. adminName, GetIdentifier(source))

    debugPrint("Admin " .. adminName .. " transferred dealership #" .. dealershipId .. " to " .. newOwnerId)

    return { success = true, message = "Ownership transferred successfully." }
end)

--- Set dealership balance
lib.callback.register("pickle_dealerships:adminSetBalance", function(source, data)
    if not IsPlayerAdmin(source) then
        return { success = false, message = "You do not have admin permissions." }
    end

    local dealershipId = data.dealershipId
    local amount = tonumber(data.amount)

    if not dealershipId or not amount then
        return { success = false, message = "Missing dealership ID or amount." }
    end

    if amount < 0 then
        return { success = false, message = "Balance cannot be negative." }
    end

    local dealership = GetDealership(dealershipId)
    if not dealership then
        return { success = false, message = "Dealership not found." }
    end

    MySQL.update.await("UPDATE dealerships SET balance = ? WHERE id = ?", { amount, dealershipId })
    UpdateDealershipCache(dealershipId, { balance = amount })

    local adminName = GetPlayerCharacterName(source) or GetPlayerName(source)
    AddLedgerEntry(dealershipId, "admin", amount, "Balance set to " .. GetCurrencyString(amount) .. " by admin " .. adminName, GetIdentifier(source))

    return { success = true, newBalance = amount, message = "Balance set to " .. GetCurrencyString(amount) .. "." }
end)

--- Set dealership tier
lib.callback.register("pickle_dealerships:adminSetTier", function(source, data)
    if not IsPlayerAdmin(source) then
        return { success = false, message = "You do not have admin permissions." }
    end

    local dealershipId = data.dealershipId
    local tier = tonumber(data.tier)

    if not dealershipId or not tier then
        return { success = false, message = "Missing dealership ID or tier." }
    end

    if tier < 1 or tier > 4 then
        return { success = false, message = "Tier must be between 1 and 4." }
    end

    local dealership = GetDealership(dealershipId)
    if not dealership then
        return { success = false, message = "Dealership not found." }
    end

    MySQL.update.await("UPDATE dealerships SET tier = ? WHERE id = ?", { tier, dealershipId })
    UpdateDealershipCache(dealershipId, { tier = tier })

    local adminName = GetPlayerCharacterName(source) or GetPlayerName(source)
    AddLedgerEntry(dealershipId, "admin", 0, "Tier set to " .. tier .. " by admin " .. adminName, GetIdentifier(source))

    return { success = true, newTier = tier, message = "Tier set to " .. tier .. "." }
end)

--- Reset dealership (wipe owner, employees, stock, tier, balance)
lib.callback.register("pickle_dealerships:adminResetDealership", function(source, data)
    if not IsPlayerAdmin(source) then
        return { success = false, message = "You do not have admin permissions." }
    end

    local dealershipId = data.dealershipId
    if not dealershipId then
        return { success = false, message = "Missing dealership ID." }
    end

    local dealership = GetDealership(dealershipId)
    if not dealership then
        return { success = false, message = "Dealership not found." }
    end

    -- Wipe all related data
    MySQL.update.await("UPDATE dealerships SET owner_id = NULL, balance = 0, tier = 1, reputation = 0 WHERE id = ?", { dealershipId })
    MySQL.update.await("DELETE FROM dealership_employees WHERE dealership_id = ?", { dealershipId })
    MySQL.update.await("DELETE FROM dealership_stock WHERE dealership_id = ?", { dealershipId })
    MySQL.update.await("DELETE FROM dealership_coupons WHERE dealership_id = ?", { dealershipId })

    UpdateDealershipCache(dealershipId, {
        owner_id   = nil,
        balance    = 0,
        tier       = 1,
        reputation = 0,
    })

    local adminName = GetPlayerCharacterName(source) or GetPlayerName(source)
    AddLedgerEntry(dealershipId, "admin", 0, "Dealership reset by admin " .. adminName, GetIdentifier(source))

    debugPrint("Admin " .. adminName .. " reset dealership #" .. dealershipId)

    return { success = true, message = "Dealership has been reset." }
end)

--- Toggle dealership between public and player-owned mode
lib.callback.register("pickle_dealerships:adminToggleMode", function(source, data)
    if not IsPlayerAdmin(source) then
        return { success = false, message = "You do not have admin permissions." }
    end

    local dealershipId = data.dealershipId
    if not dealershipId then
        return { success = false, message = "Missing dealership ID." }
    end

    local dealership = GetDealership(dealershipId)
    if not dealership then
        return { success = false, message = "Dealership not found." }
    end

    local currentMode = dealership.mode or "public"
    local newMode = currentMode == "public" and "player_owned" or "public"

    MySQL.update.await("UPDATE dealerships SET mode = ? WHERE id = ?", { newMode, dealershipId })
    UpdateDealershipCache(dealershipId, { mode = newMode })

    local adminName = GetPlayerCharacterName(source) or GetPlayerName(source)
    AddLedgerEntry(dealershipId, "admin", 0, "Mode changed to " .. newMode .. " by admin " .. adminName, GetIdentifier(source))

    return { success = true, newMode = newMode, message = "Dealership mode set to " .. newMode .. "." }
end)

--- Create a new dealership from admin panel
lib.callback.register("pickle_dealerships:adminCreateDealership", function(source, data)
    if not IsPlayerAdmin(source) then
        return { success = false, message = "You do not have admin permissions." }
    end

    if not data.label or data.label == "" then
        return { success = false, message = "Dealership label is required." }
    end

    if not data.location then
        return { success = false, message = "Location is required." }
    end

    local id = MySQL.insert.await("INSERT INTO dealerships (label, location, mode, tier, balance, reputation, created_at) VALUES (?, ?, ?, 1, 0, 0, NOW())", {
        data.label,
        data.location,
        data.mode or "public",
    })

    if id then
        -- Reload dealership cache
        LoadDealerships()

        local adminName = GetPlayerCharacterName(source) or GetPlayerName(source)
        debugPrint("Admin " .. adminName .. " created dealership #" .. id .. " (" .. data.label .. ")")

        return { success = true, dealershipId = id, message = "Dealership '" .. data.label .. "' created successfully." }
    else
        return { success = false, message = "Failed to create dealership in database." }
    end
end)

--- Admin command to open admin panel
RegisterCommand("dealership", function(source, args, rawCommand)
    if source == 0 then
        print("This command cannot be used from the console.")
        return
    end

    if not IsPlayerAdmin(source) then
        ShowNotification(source, "You do not have permission to use this command.")
        return
    end

    TriggerClientEvent("pickle_dealerships:openAdminPanel", source)
end, false)
