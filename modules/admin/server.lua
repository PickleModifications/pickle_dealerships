--- Get all dealerships (admin only)
lib.callback.register("pickle_dealerships:adminGetAllDealerships", function(source)
    if not IsPlayerAdmin(source) then
        return nil
    end

    local dealerships = MySQL.query.await("SELECT * FROM dealerships ORDER BY id ASC")
    if dealerships then
        for _, d in ipairs(dealerships) do
            if d.owner_identifier then
                local ownerSource = GetSourceFromIdentifier(d.owner_identifier)
                if ownerSource then
                    d.owner_name = GetPlayerCharacterName(ownerSource) or GetPlayerName(ownerSource)
                else
                    d.owner_name = d.owner_identifier
                end
            end
        end
    end
    return dealerships or {}
end)

--- Get online players for admin dropdown
lib.callback.register("pickle_dealerships:adminGetOnlinePlayers", function(source)
    if not IsPlayerAdmin(source) then return {} end

    local players = {}
    for _, playerId in ipairs(GetPlayers()) do
        local src = tonumber(playerId)
        if src then
            local identifier = GetIdentifier(src)
            local name = GetPlayerCharacterName(src) or GetPlayerName(src)
            if identifier and name then
                players[#players + 1] = {
                    source = src,
                    name = name,
                    identifier = identifier,
                }
            end
        end
    end
    return players
end)

--- Force transfer dealership ownership
lib.callback.register("pickle_dealerships:adminTransferOwnership", function(source, data)
    if not IsPlayerAdmin(source) then
        return { success = false, message = _L("admin_no_permission") }
    end

    local dealershipId = data.dealershipId
    local newOwnerId = data.newOwnerId

    if not dealershipId or not newOwnerId then
        return { success = false, message = _L("admin_missing_owner_data") }
    end

    local dealership = GetDealership(dealershipId)
    if not dealership then
        return { success = false, message = _L("dealership_not_found") }
    end

    MySQL.update.await("UPDATE dealerships SET owner_identifier = ? WHERE id = ?", { newOwnerId, dealershipId })
    UpdateDealershipCache(dealershipId, { owner_identifier = newOwnerId })

    local adminName = GetPlayerCharacterName(source) or GetPlayerName(source)
    AddLedgerEntry(dealershipId, "admin", 0, "Ownership transferred to " .. newOwnerId .. " by admin " .. adminName, GetIdentifier(source))

    debugPrint("Admin " .. adminName .. " transferred dealership #" .. dealershipId .. " to " .. newOwnerId)

    return { success = true, message = _L("admin_ownership_transferred_msg") }
end)

--- Set dealership balance
lib.callback.register("pickle_dealerships:adminSetBalance", function(source, data)
    if not IsPlayerAdmin(source) then
        return { success = false, message = _L("admin_no_permission") }
    end

    local dealershipId = data.dealershipId
    local amount = tonumber(data.amount)

    if not dealershipId or not amount then
        return { success = false, message = _L("admin_missing_amount") }
    end

    if amount < 0 then
        return { success = false, message = _L("admin_balance_negative") }
    end

    local dealership = GetDealership(dealershipId)
    if not dealership then
        return { success = false, message = _L("dealership_not_found") }
    end

    MySQL.update.await("UPDATE dealerships SET balance = ? WHERE id = ?", { amount, dealershipId })
    UpdateDealershipCache(dealershipId, { balance = amount })

    local adminName = GetPlayerCharacterName(source) or GetPlayerName(source)
    AddLedgerEntry(dealershipId, "admin", amount, "Balance set to " .. GetCurrencyString(amount) .. " by admin " .. adminName, GetIdentifier(source))

    return { success = true, newBalance = amount, message = _L("admin_balance_set_to", GetCurrencyString(amount)) }
end)

--- Set dealership tier
lib.callback.register("pickle_dealerships:adminSetTier", function(source, data)
    if not IsPlayerAdmin(source) then
        return { success = false, message = _L("admin_no_permission") }
    end

    local dealershipId = data.dealershipId
    local tier = tonumber(data.tier)

    if not dealershipId or not tier then
        return { success = false, message = _L("admin_missing_tier") }
    end

    if tier < 1 or tier > 4 then
        return { success = false, message = _L("admin_tier_range") }
    end

    local dealership = GetDealership(dealershipId)
    if not dealership then
        return { success = false, message = _L("dealership_not_found") }
    end

    MySQL.update.await("UPDATE dealerships SET tier = ? WHERE id = ?", { tier, dealershipId })
    UpdateDealershipCache(dealershipId, { tier = tier })

    local adminName = GetPlayerCharacterName(source) or GetPlayerName(source)
    AddLedgerEntry(dealershipId, "admin", 0, "Tier set to " .. tier .. " by admin " .. adminName, GetIdentifier(source))

    return { success = true, newTier = tier, message = _L("admin_tier_set_to", tier) }
end)

--- Reset dealership (wipe owner, employees, stock, tier, balance)
lib.callback.register("pickle_dealerships:adminResetDealership", function(source, data)
    if not IsPlayerAdmin(source) then
        return { success = false, message = _L("admin_no_permission") }
    end

    local dealershipId = data.dealershipId
    if not dealershipId then
        return { success = false, message = _L("admin_missing_dealership_id") }
    end

    local dealership = GetDealership(dealershipId)
    if not dealership then
        return { success = false, message = _L("dealership_not_found") }
    end

    -- Wipe all related data
    MySQL.update.await("UPDATE dealerships SET owner_id = NULL, balance = 0, tier = 1, reputation = 0 WHERE id = ?", { dealershipId })
    MySQL.update.await("DELETE FROM dealership_employees WHERE dealership_id = ?", { dealershipId })
    MySQL.update.await("DELETE FROM dealership_stock WHERE dealership_id = ?", { dealershipId })
    MySQL.update.await("DELETE FROM dealership_orders WHERE dealership_id = ?", { dealershipId })
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

    return { success = true, message = _L("admin_dealership_reset_msg") }
end)

--- Permanently delete a dealership and all related data (employees, stock, orders, coupons,
--- ledger, financing, deliveries, auctions + bids). Unrecoverable — confirmation is handled client-side.
lib.callback.register("pickle_dealerships:adminDeleteDealership", function(source, data)
    if not IsPlayerAdmin(source) then
        return { success = false, message = _L("admin_no_permission") }
    end

    local dealershipId = data.dealershipId
    if not dealershipId then
        return { success = false, message = _L("admin_missing_dealership_id") }
    end

    local dealership = GetDealership(dealershipId)
    if not dealership then
        return { success = false, message = _L("dealership_not_found") }
    end

    -- Auction bids reference auctions, not the dealership directly — wipe them first via subquery.
    MySQL.update.await("DELETE FROM dealership_auction_bids WHERE auction_id IN (SELECT id FROM dealership_auctions WHERE dealership_id = ?)", { dealershipId })
    MySQL.update.await("DELETE FROM dealership_auctions WHERE dealership_id = ?",   { dealershipId })
    MySQL.update.await("DELETE FROM dealership_deliveries WHERE dealership_id = ?", { dealershipId })
    MySQL.update.await("DELETE FROM dealership_financing WHERE dealership_id = ?",  { dealershipId })
    MySQL.update.await("DELETE FROM dealership_ledger WHERE dealership_id = ?",     { dealershipId })
    MySQL.update.await("DELETE FROM dealership_coupons WHERE dealership_id = ?",    { dealershipId })
    MySQL.update.await("DELETE FROM dealership_orders WHERE dealership_id = ?",     { dealershipId })
    MySQL.update.await("DELETE FROM dealership_stock WHERE dealership_id = ?",      { dealershipId })
    MySQL.update.await("DELETE FROM dealership_employees WHERE dealership_id = ?",  { dealershipId })
    MySQL.update.await("DELETE FROM dealerships WHERE id = ?",                      { dealershipId })

    DealershipCache[tonumber(dealershipId)] = nil

    local adminName = GetPlayerCharacterName(source) or GetPlayerName(source)
    debugPrint("Admin " .. adminName .. " deleted dealership #" .. dealershipId .. " (" .. (dealership.label or "?") .. ")")

    -- Seize-cache refresh covers clients that had this dealership flagged for seizure.
    TriggerClientEvent('pickle_dealerships:refreshSeizeCache', -1)

    return { success = true, message = _L("admin_dealership_deleted_msg") }
end)

--- Toggle dealership between public and player-owned mode
lib.callback.register("pickle_dealerships:adminToggleMode", function(source, data)
    if not IsPlayerAdmin(source) then
        return { success = false, message = _L("admin_no_permission") }
    end

    local dealershipId = data.dealershipId
    if not dealershipId then
        return { success = false, message = _L("admin_missing_dealership_id") }
    end

    local dealership = GetDealership(dealershipId)
    if not dealership then
        return { success = false, message = _L("dealership_not_found") }
    end

    local currentMode = dealership.mode or "public"
    local newMode = currentMode == "public" and "player_owned" or "public"

    MySQL.update.await("UPDATE dealerships SET mode = ? WHERE id = ?", { newMode, dealershipId })
    UpdateDealershipCache(dealershipId, { mode = newMode })

    local adminName = GetPlayerCharacterName(source) or GetPlayerName(source)
    AddLedgerEntry(dealershipId, "admin", 0, "Mode changed to " .. newMode .. " by admin " .. adminName, GetIdentifier(source))

    return { success = true, newMode = newMode, message = _L("admin_mode_set_to", newMode) }
end)

--- Toggle seize mode for a dealership
lib.callback.register("pickle_dealerships:adminToggleSeize", function(source, data)
    if not IsPlayerAdmin(source) then
        return { success = false, message = _L("admin_no_permission") }
    end

    local dealershipId = data.dealershipId
    if not dealershipId then
        return { success = false, message = _L("admin_missing_dealership_id") }
    end

    local dealership = GetDealership(dealershipId)
    if not dealership then
        return { success = false, message = _L("dealership_not_found") }
    end

    local current = (dealership.seize_enabled == 1 or dealership.seize_enabled == true) and 1 or 0
    local newValue = current == 1 and 0 or 1

    MySQL.update.await("UPDATE dealerships SET seize_enabled = ? WHERE id = ?", { newValue, dealershipId })
    UpdateDealershipCache(dealershipId, { seize_enabled = newValue })

    local adminName = GetPlayerCharacterName(source) or GetPlayerName(source)
    AddLedgerEntry(dealershipId, "admin", 0, "Seize mode " .. (newValue == 1 and "enabled" or "disabled") .. " by admin " .. adminName, GetIdentifier(source))

    -- Notify all clients to refresh their seize dealership cache
    TriggerClientEvent('pickle_dealerships:refreshSeizeCache', -1)

    return { success = true, seizeEnabled = newValue == 1, message = _L("admin_seize_set_to", newValue == 1 and "enabled" or "disabled") }
end)

--- Create a new dealership from admin panel
lib.callback.register("pickle_dealerships:adminCreateDealership", function(source, data)
    if not IsPlayerAdmin(source) then
        return { success = false, message = _L("admin_no_permission") }
    end

    if not data.label or data.label == "" then
        return { success = false, message = _L("admin_name_required") }
    end

    -- Generate a location key from the DB id (set after insert)
    local mode = data.mode or "player-owned"
    local dealershipType = data.type or "car"

    -- Optional positions placed inline in the create dialog (same pattern as depot create).
    -- Each is { x, y, z, w } or nil. Coords is required for the dealership to be functional,
    -- but we accept creation without it so admins can still place later on the positions tab.
    local metadata = {}
    if type(data.coords) == "table" and data.coords.x then
        metadata.coords = { x = data.coords.x, y = data.coords.y, z = data.coords.z, w = data.coords.w or 0.0 }
    end
    if type(data.spawnPoint) == "table" and data.spawnPoint.x then
        metadata.spawnPoint = { x = data.spawnPoint.x, y = data.spawnPoint.y, z = data.spawnPoint.z, w = data.spawnPoint.w or 0.0 }
    end
    if type(data.deliveryPoint) == "table" and data.deliveryPoint.x then
        metadata.deliveryPoint = { x = data.deliveryPoint.x, y = data.deliveryPoint.y, z = data.deliveryPoint.z, w = data.deliveryPoint.w or 0.0 }
    end

    local metaJson = next(metadata) and json.encode(metadata) or nil

    local id = MySQL.insert.await(
        "INSERT INTO dealerships (name, location, type, mode, tier, balance, reputation, metadata) VALUES (?, ?, ?, ?, 1, 0, 0, ?)",
        { data.label, "pending", dealershipType, mode, metaJson }
    )

    if id then
        -- Set location to the DB id so it's always unique
        local location = "dealership_" .. id
        MySQL.update.await("UPDATE dealerships SET location = ? WHERE id = ?", { location, id })

        LoadDealerships()

        local adminName = GetPlayerCharacterName(source) or GetPlayerName(source)
        debugPrint("Admin " .. adminName .. " created dealership #" .. id .. " (" .. data.label .. ")")

        return { success = true, dealershipId = id, message = _L("admin_dealership_created_msg", data.label) }
    else
        return { success = false, message = _L("admin_db_create_failed") }
    end
end)

--- Save dealership position data from gizmo placement
lib.callback.register("pickle_dealerships:adminSavePosition", function(source, data)
    if not IsPlayerAdmin(source) then
        return { success = false, message = _L("admin_no_permission") }
    end

    local dealershipId = data.dealershipId
    if not dealershipId then
        return { success = false, message = _L("admin_missing_dealership_id") }
    end

    local dealership = GetDealership(dealershipId)
    if not dealership then
        return { success = false, message = _L("dealership_not_found") }
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

    if field == "coords" or field == "spawnPoint" or field == "deliveryPoint" then
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

    return { success = true, metadata = metadata, message = _L("admin_position_saved") }
end)

--- Remove a position from dealership metadata
lib.callback.register("pickle_dealerships:adminRemovePosition", function(source, data)
    if not IsPlayerAdmin(source) then
        return { success = false, message = _L("admin_no_permission") }
    end

    local dealershipId = data.dealershipId
    if not dealershipId then
        return { success = false, message = _L("admin_missing_dealership_id") }
    end

    local dealership = GetDealership(dealershipId)
    if not dealership then
        return { success = false, message = _L("dealership_not_found") }
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

    if field == "coords" or field == "spawnPoint" or field == "deliveryPoint" then
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
            return { success = false, message = _L("admin_display_spot_not_found") }
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

    return { success = true, metadata = metadata, message = _L("admin_position_removed") }
end)

-- ─── Catalog Management ─────────────────────────────────────────────────────

--- Get all catalog vehicles
lib.callback.register("pickle_dealerships:adminGetCatalog", function(source, data)
    if not IsPlayerAdmin(source) then return nil end

    local page = tonumber(data and data.page) or 1
    local pageSize = tonumber(data and data.pageSize) or 50
    local search = data and data.search or ""
    local typeFilter = data and data.typeFilter or "all"
    local offset = (page - 1) * pageSize

    local where = {}
    local params = {}

    if typeFilter ~= "all" then
        where[#where + 1] = "vehicle_type = ?"
        params[#params + 1] = typeFilter
    end

    if search ~= "" then
        where[#where + 1] = "(label LIKE ? OR model LIKE ?)"
        local pattern = "%" .. search .. "%"
        params[#params + 1] = pattern
        params[#params + 1] = pattern
    end

    local whereClause = #where > 0 and ("WHERE " .. table.concat(where, " AND ")) or ""

    local countParams = { table.unpack(params) }
    local countResult = MySQL.scalar.await(
        ("SELECT COUNT(*) FROM wholesale_catalog %s"):format(whereClause),
        countParams
    )

    params[#params + 1] = pageSize
    params[#params + 1] = offset

    local results = MySQL.query.await(
        ("SELECT * FROM wholesale_catalog %s ORDER BY vehicle_type ASC, tier ASC, wholesale ASC LIMIT ? OFFSET ?"):format(whereClause),
        params
    )

    return {
        items = results or {},
        total = countResult or 0,
        page = page,
        pageSize = pageSize,
    }
end)

--- Add a vehicle to the catalog
lib.callback.register("pickle_dealerships:adminAddCatalogVehicle", function(source, data)
    if not IsPlayerAdmin(source) then
        return { success = false, message = _L("admin_no_permission") }
    end

    if not data.model or data.model == "" then
        return { success = false, message = _L("admin_vehicle_model_required") }
    end
    if not data.label or data.label == "" then
        return { success = false, message = _L("admin_vehicle_label_required") }
    end

    local existing = MySQL.single.await("SELECT id FROM wholesale_catalog WHERE model = ?", { data.model })
    if existing then
        return { success = false, message = _L("admin_vehicle_exists", data.model) }
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
        return { success = true, id = id, message = _L("admin_vehicle_added", data.label) }
    end
    return { success = false, message = _L("admin_failed_add_vehicle") }
end)

--- Update a catalog vehicle
lib.callback.register("pickle_dealerships:adminUpdateCatalogVehicle", function(source, data)
    if not IsPlayerAdmin(source) then
        return { success = false, message = _L("admin_no_permission") }
    end

    if not data.id then
        return { success = false, message = _L("admin_missing_vehicle_id") }
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

    return { success = true, message = _L("admin_vehicle_updated") }
end)

--- Remove a vehicle from the catalog
lib.callback.register("pickle_dealerships:adminRemoveCatalogVehicle", function(source, data)
    if not IsPlayerAdmin(source) then
        return { success = false, message = _L("admin_no_permission") }
    end

    if not data.id then
        return { success = false, message = _L("admin_missing_vehicle_id") }
    end

    MySQL.update.await("DELETE FROM wholesale_catalog WHERE id = ?", { data.id })
    return { success = true, message = _L("admin_vehicle_removed") }
end)

--- Set dealership faction (job OR gang). `factionType` must be "job" or "gang".
--- The faction name is stored in `dealerships.job` (legacy column kept for back-compat);
--- the type lives in metadata.factionType.
lib.callback.register("pickle_dealerships:adminSetFaction", function(source, data)
    if not IsPlayerAdmin(source) then
        return { success = false, message = _L("admin_no_permission") }
    end

    local dealershipId = data.dealershipId
    if not dealershipId then
        return { success = false, message = _L("admin_missing_dealership_id") }
    end

    local dealership = GetDealership(dealershipId)
    if not dealership then
        return { success = false, message = _L("dealership_not_found") }
    end

    local factionName = data.name
    if factionName == "" then factionName = nil end

    local factionType = data.factionType
    if factionType ~= "gang" then factionType = "job" end

    local meta = dealership.metadata
    if type(meta) == "string" then meta = json.decode(meta) or {} end
    if type(meta) ~= "table" then meta = {} end
    if factionName then
        meta.factionType = factionType
    else
        meta.factionType = nil
    end

    MySQL.update.await("UPDATE dealerships SET job = ?, metadata = ? WHERE id = ?", { factionName, json.encode(meta), dealershipId })
    UpdateDealershipCache(dealershipId, { job = factionName, metadata = meta })

    return { success = true, message = _L("admin_faction_set_to", factionType, factionName or "none") }
end)


--- Admin sets customer access rules for a dealership. Stored in metadata.
--- mode: 'public' | 'faction' (only faction members can enter/purchase)
--- minGrade: only enforced when mode = 'faction'
lib.callback.register("pickle_dealerships:adminSetAccess", function(source, data)
    if not IsPlayerAdmin(source) then
        return { success = false, message = _L("admin_no_permission") }
    end

    local dealershipId = data.dealershipId
    if not dealershipId then
        return { success = false, message = _L("admin_missing_dealership_id") }
    end

    local dealership = GetDealership(dealershipId)
    if not dealership then
        return { success = false, message = _L("dealership_not_found") }
    end

    local mode = data.mode
    if mode ~= "faction" then mode = "public" end

    local meta = dealership.metadata
    if type(meta) == "string" then meta = json.decode(meta) or {} end
    if type(meta) ~= "table" then meta = {} end

    meta.accessMode = mode
    if mode == "faction" then
        meta.accessMinGrade = math.max(0, math.floor(tonumber(data.minGrade) or 0))
    else
        meta.accessMinGrade = nil
    end

    MySQL.update.await("UPDATE dealerships SET metadata = ? WHERE id = ?", { json.encode(meta), dealershipId })
    UpdateDealershipCache(dealershipId, { metadata = meta })

    return { success = true, message = _L("admin_access_set_to", mode) }
end)

-- ─── Photo Booth ────────────────────────────────────────────────────────────

--- Get image upload config for the client
lib.callback.register("pickle_dealerships:adminGetUploadConfig", function(source)
    if not IsPlayerAdmin(source) then
        return nil
    end

    local cfg = ServerConfig.ImageUpload
    if not cfg or not cfg.provider then
        print("[PhotoBooth:Server] ERROR: ServerConfig.ImageUpload is not configured")
        return nil
    end

    if cfg.provider == "fivemanage" then
        if not cfg.token or cfg.token == "" then
            print("[PhotoBooth:Server] ERROR: FiveManage token is not set in config_sv.lua")
            return nil
        end
        return {
            url = "https://api.fivemanage.com/api/image",
            field = "image",
            headers = { ["Authorization"] = cfg.token },
        }
    elseif cfg.provider == "custom" then
        local custom = cfg.custom
        if not custom or not custom.url or custom.url == "" then
            print("[PhotoBooth:Server] ERROR: Custom upload URL is not set in config_sv.lua")
            return nil
        end
        return {
            url = custom.url,
            field = custom.field or "image",
            headers = custom.headers or {},
            returnPathKey = custom.returnPathKey or "url",
        }
    end

    print(("[PhotoBooth:Server] ERROR: Unknown image upload provider '%s'"):format(cfg.provider))
    return nil
end)

--- Save a catalog vehicle image URL
lib.callback.register("pickle_dealerships:adminSaveCatalogImage", function(source, data)
    if not IsPlayerAdmin(source) then
        return { success = false, message = _L("admin_no_permission") }
    end

    if not data.catalogId or not data.imageUrl then
        return { success = false, message = _L("admin_missing_catalog_data") }
    end

    MySQL.update.await("UPDATE wholesale_catalog SET image = ? WHERE id = ?", { data.imageUrl, data.catalogId })
    return { success = true, message = _L("admin_vehicle_image_saved") }
end)

--- Remove a catalog vehicle image
lib.callback.register("pickle_dealerships:adminRemoveCatalogImage", function(source, data)
    if not IsPlayerAdmin(source) then
        return { success = false, message = _L("admin_no_permission") }
    end

    if not data.catalogId then
        return { success = false, message = _L("admin_missing_dealership_id") }
    end

    MySQL.update.await("UPDATE wholesale_catalog SET image = NULL WHERE id = ?", { data.catalogId })
    return { success = true, message = _L("admin_vehicle_image_removed") }
end)

--- Set player routing bucket for photo booth isolation
lib.callback.register("pickle_dealerships:adminSetPhotoBucket", function(source, data)
    if not IsPlayerAdmin(source) then
        return { success = false, message = _L("admin_no_permission") }
    end

    local bucket = tonumber(data.bucket) or 0
    SetPlayerRoutingBucket(source, bucket)
    return { success = true }
end)

--- Admin command to open admin panel
RegisterCommand("dealership", function(source, args, rawCommand)
    if source == 0 then
        print("This command cannot be used from the console.")
        return
    end

    if not IsPlayerAdmin(source) then
        ShowNotification(source, _L("admin_no_command_permission"))
        return
    end

    TriggerClientEvent("pickle_dealerships:openAdminPanel", source)
end, false)

--- Debug: add all catalog vehicles to a dealership's stock
RegisterCommand("dealership_stockall", function(source, args, rawCommand)
    if source == 0 then
        print("This command cannot be used from the console.")
        return
    end

    if not IsPlayerAdmin(source) then
        ShowNotification(source, _L("admin_no_command_permission"))
        return
    end

    local dealershipId = tonumber(args[1])
    if not dealershipId then
        ShowNotification(source, _L("admin_stockall_usage"))
        return
    end

    local dealership = MySQL.single.await("SELECT * FROM dealerships WHERE id = ?", { dealershipId })
    if not dealership then
        ShowNotification(source, _L("dealership_not_found"))
        return
    end

    local catalog = MySQL.query.await("SELECT * FROM wholesale_catalog", {})
    if not catalog or #catalog == 0 then
        ShowNotification(source, _L("admin_no_catalog_vehicles"))
        return
    end

    local count = 0
    for _, v in ipairs(catalog) do
        local exists = MySQL.single.await(
            "SELECT id FROM dealership_stock WHERE dealership_id = ? AND vehicle_model = ? AND sold_at IS NULL",
            { dealershipId, v.model }
        )
        if not exists then
            MySQL.insert.await(
                "INSERT INTO dealership_stock (dealership_id, vehicle_model, vehicle_label, wholesale_cost, retail_price, ordered_at, delivered_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())",
                { dealershipId, v.model, v.label or v.model, v.wholesale, math.floor(v.wholesale * 1.3) }
            )
            count = count + 1
        end
    end

    ShowNotification(source, _L("admin_stockall_complete", count, dealershipId))
    TriggerClientEvent('pickle_dealerships:refreshDisplay', -1, dealership.location)
end, false)
