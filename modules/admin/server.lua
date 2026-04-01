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
        return { success = false, message = "Dealership name is required." }
    end

    -- Generate a location key from the DB id (set after insert)
    local mode = data.mode or "player-owned"
    local dealershipType = data.type or "car"

    local id = MySQL.insert.await(
        "INSERT INTO dealerships (name, location, type, mode, tier, balance, reputation) VALUES (?, ?, ?, ?, 1, 0, 0)",
        { data.label, "pending", dealershipType, mode }
    )

    if id then
        -- Set location to the DB id so it's always unique
        local location = "dealership_" .. id
        MySQL.update.await("UPDATE dealerships SET location = ? WHERE id = ?", { location, id })

        LoadDealerships()

        local adminName = GetPlayerCharacterName(source) or GetPlayerName(source)
        debugPrint("Admin " .. adminName .. " created dealership #" .. id .. " (" .. data.label .. ")")

        return { success = true, dealershipId = id, message = "Dealership '" .. data.label .. "' created successfully." }
    else
        return { success = false, message = "Failed to create dealership in database." }
    end
end)

--- Save dealership position data from gizmo placement
lib.callback.register("pickle_dealerships:adminSavePosition", function(source, data)
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

    -- Get existing metadata or start fresh
    local metadata = dealership.metadata
    if type(metadata) == "string" then
        metadata = json.decode(metadata) or {}
    elseif type(metadata) ~= "table" then
        metadata = {}
    end

    -- Update the specific field
    local field = data.field
    local value = data.value

    if field == "coords" or field == "spawnPoint" then
        metadata[field] = value
    elseif field == "displaySpot" then
        if not metadata.displaySpots then
            metadata.displaySpots = {}
        end
        -- Give each spot a unique ID for reliable deletion
        value.id = (metadata._nextSpotId or #metadata.displaySpots) + 1
        metadata._nextSpotId = value.id
        metadata.displaySpots[#metadata.displaySpots + 1] = value
    elseif field == "interactionPoint" then
        if not metadata.interactionPoints then
            metadata.interactionPoints = {}
        end
        metadata.interactionPoints[data.pointType] = value
    elseif field == "npcSpawnPoint" then
        if not metadata.npcSpawnPoints then
            metadata.npcSpawnPoints = {}
        end
        metadata.npcSpawnPoints[#metadata.npcSpawnPoints + 1] = value
    elseif field == "zone" then
        if not metadata.zones then
            metadata.zones = {}
        end
        metadata.zones[#metadata.zones + 1] = value
    end

    MySQL.update.await("UPDATE dealerships SET metadata = ? WHERE id = ?", { json.encode(metadata), dealershipId })
    UpdateDealershipCache(dealershipId, { metadata = metadata })

    -- Tell clients exactly what changed so they can surgically update
    local location = dealership.location
    TriggerClientEvent('pickle_dealerships:positionUpdated', -1, location, data.field, data.pointType)

    return { success = true, metadata = metadata, message = "Position saved." }
end)

--- Remove a position from dealership metadata
lib.callback.register("pickle_dealerships:adminRemovePosition", function(source, data)
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

    -- Always re-read metadata fresh from DB to avoid stale cache references
    local row = MySQL.single.await("SELECT metadata FROM dealerships WHERE id = ?", { dealershipId })
    local metadata = {}
    if row and row.metadata then
        if type(row.metadata) == "string" then
            metadata = json.decode(row.metadata) or {}
        elseif type(row.metadata) == "table" then
            metadata = row.metadata
        end
    end

    local field = data.field

    if field == "coords" or field == "spawnPoint" then
        metadata[field] = nil
    elseif field == "displaySpot" and metadata.displaySpots then
        local spotId = tonumber(data.spotId)
        debugPrint("[RemovePosition] Removing spotId=" .. tostring(spotId) .. " from " .. tostring(#metadata.displaySpots) .. " spots")

        -- Rebuild the array without the target spot
        local newSpots = {}
        local removedIndex = nil
        for i, spot in ipairs(metadata.displaySpots) do
            debugPrint("[RemovePosition]   Spot " .. i .. " id=" .. tostring(spot.id) .. " target=" .. tostring(spotId))
            if tonumber(spot.id) == spotId then
                removedIndex = i
            else
                newSpots[#newSpots + 1] = spot
            end
        end

        if removedIndex then
            -- Unassign any vehicle on this spot (by spot ID, not array index)
            MySQL.update.await(
                'UPDATE dealership_stock SET display_spot = NULL WHERE dealership_id = ? AND (display_spot = ? OR display_spot = ?)',
                { dealershipId, spotId, tostring(spotId) }
            )
            metadata.displaySpots = newSpots
        else
            debugPrint("[RemovePosition] Spot not found!")
            return { success = false, message = "Display spot not found." }
        end
    elseif field == "interactionPoint" and data.pointType and metadata.interactionPoints then
        metadata.interactionPoints[data.pointType] = nil
    elseif field == "npcSpawnPoint" and data.index and metadata.npcSpawnPoints then
        local idx = math.floor(tonumber(data.index))
        if idx >= 1 and idx <= #metadata.npcSpawnPoints then
            table.remove(metadata.npcSpawnPoints, idx)
        end
    end

    MySQL.update.await("UPDATE dealerships SET metadata = ? WHERE id = ?", { json.encode(metadata), dealershipId })
    UpdateDealershipCache(dealershipId, { metadata = metadata })

    local location = dealership.location
    TriggerClientEvent('pickle_dealerships:positionUpdated', -1, location, data.field, data.pointType)

    return { success = true, metadata = metadata, message = "Position removed." }
end)

-- ─── Catalog Management ─────────────────────────────────────────────────────

--- Get all catalog vehicles
lib.callback.register("pickle_dealerships:adminGetCatalog", function(source)
    if not IsPlayerAdmin(source) then return nil end
    local results = MySQL.query.await("SELECT * FROM wholesale_catalog ORDER BY vehicle_type ASC, tier ASC, wholesale ASC")
    return results or {}
end)

--- Add a vehicle to the catalog
lib.callback.register("pickle_dealerships:adminAddCatalogVehicle", function(source, data)
    if not IsPlayerAdmin(source) then
        return { success = false, message = "You do not have admin permissions." }
    end

    if not data.model or data.model == "" then
        return { success = false, message = "Vehicle model is required." }
    end
    if not data.label or data.label == "" then
        return { success = false, message = "Vehicle label is required." }
    end

    local existing = MySQL.single.await("SELECT id FROM wholesale_catalog WHERE model = ?", { data.model })
    if existing then
        return { success = false, message = "Vehicle model '" .. data.model .. "' already exists in catalog." }
    end

    local id = MySQL.insert.await(
        "INSERT INTO wholesale_catalog (model, label, wholesale, tier, class, vehicle_type) VALUES (?, ?, ?, ?, ?, ?)",
        {
            data.model,
            data.label,
            tonumber(data.wholesale) or 0,
            data.tier or "basic",
            data.class or "sedan",
            data.vehicleType or "car",
        }
    )

    if id then
        return { success = true, id = id, message = "'" .. data.label .. "' added to catalog." }
    end
    return { success = false, message = "Failed to add vehicle." }
end)

--- Update a catalog vehicle
lib.callback.register("pickle_dealerships:adminUpdateCatalogVehicle", function(source, data)
    if not IsPlayerAdmin(source) then
        return { success = false, message = "You do not have admin permissions." }
    end

    if not data.id then
        return { success = false, message = "Missing vehicle ID." }
    end

    MySQL.update.await(
        "UPDATE wholesale_catalog SET label = ?, wholesale = ?, tier = ?, class = ?, vehicle_type = ? WHERE id = ?",
        {
            data.label,
            tonumber(data.wholesale) or 0,
            data.tier or "basic",
            data.class or "sedan",
            data.vehicleType or "car",
            data.id,
        }
    )

    return { success = true, message = "Vehicle updated." }
end)

--- Remove a vehicle from the catalog
lib.callback.register("pickle_dealerships:adminRemoveCatalogVehicle", function(source, data)
    if not IsPlayerAdmin(source) then
        return { success = false, message = "You do not have admin permissions." }
    end

    if not data.id then
        return { success = false, message = "Missing vehicle ID." }
    end

    MySQL.update.await("DELETE FROM wholesale_catalog WHERE id = ?", { data.id })
    return { success = true, message = "Vehicle removed from catalog." }
end)

--- Set dealership job
lib.callback.register("pickle_dealerships:adminSetJob", function(source, data)
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

    local job = data.job
    if job == "" then job = nil end

    MySQL.update.await("UPDATE dealerships SET job = ? WHERE id = ?", { job, dealershipId })
    UpdateDealershipCache(dealershipId, { job = job })

    return { success = true, message = "Dealership job set to " .. (job or "none") .. "." }
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
