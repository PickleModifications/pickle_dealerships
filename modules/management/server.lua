--- Get dealership financial overview
lib.callback.register("pickle_dealerships:getDealershipFinances", function(source, dealershipId)
    if not CanPlayerManage(source, dealershipId) then
        return nil
    end

    local dealership = GetDealership(dealershipId)
    if not dealership then return nil end

    -- Read fresh balance from DB
    local freshBalance = MySQL.scalar.await("SELECT `balance` FROM `pickle_dealerships` WHERE `id` = ?", { dealershipId })
    if freshBalance then
        UpdateDealershipCache(dealershipId, { balance = tonumber(freshBalance) })
    end

    -- Fetch last 50 ledger entries
    local ledger = MySQL.query.await("SELECT * FROM pickle_dealership_ledger WHERE dealership_id = ? ORDER BY created_at DESC LIMIT 50", { dealershipId })

    -- Revenue stats: positive amounts = income, negative = expenses
    local stats = MySQL.query.await([[
        SELECT
            COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS total_income,
            COALESCE(SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END), 0) AS total_expenses
        FROM pickle_dealership_ledger
        WHERE dealership_id = ?
    ]], { dealershipId })

    local totalSales = stats[1] and stats[1].total_income or 0
    local totalExpenses = math.abs(stats[1] and stats[1].total_expenses or 0)

    return {
        balance       = tonumber(freshBalance) or dealership.balance or 0,
        ledger        = ledger or {},
        totalSales    = totalSales,
        totalExpenses = totalExpenses,
        profit        = totalSales - totalExpenses,
    }
end)

--- Withdraw funds from dealership to personal bank
lib.callback.register("pickle_dealerships:withdrawFunds", function(source, data)
    local dealershipId = data.dealershipId
    local amount = tonumber(data.amount)

    if not amount or amount <= 0 then
        return { success = false, message = "Invalid amount." }
    end

    if not CanPlayerManage(source, dealershipId) then
        return { success = false, message = "You do not have permission to withdraw funds." }
    end

    local dealership = GetDealership(dealershipId)
    if not dealership then
        return { success = false, message = "Dealership not found." }
    end

    local minBalance = Config.Management and Config.Management.minimumBalance or 0
    if (dealership.balance - amount) < minBalance then
        return { success = false, message = "Withdrawal would put the balance below the minimum (" .. GetCurrencyString(minBalance) .. ")." }
    end

    if amount > dealership.balance then
        return { success = false, message = "Insufficient dealership funds." }
    end

    -- Deduct from dealership
    local newBalance = dealership.balance - amount
    MySQL.update.await("UPDATE pickle_dealerships SET balance = ? WHERE id = ?", { newBalance, dealershipId })
    UpdateDealershipCache(dealershipId, { balance = newBalance })

    -- Add to player bank
    AddMoney(source, amount, "bank")

    local identifier = GetIdentifier(source)
    local playerName = GetPlayerCharacterName(source) or "Unknown"
    AddLedgerEntry(dealershipId, "withdrawal", -amount, "Withdrawal by " .. playerName, identifier)

    -- Webhook for large withdrawals
    local webhookThreshold = Config.Management and Config.Management.largeWithdrawalThreshold or 100000
    if amount >= webhookThreshold and Config.Webhooks and Config.Webhooks.management then
        PerformHttpRequest(Config.Webhooks.management, function() end, "POST", json.encode({
            embeds = {{
                title = "Large Withdrawal",
                description = string.format("%s withdrew %s from dealership #%d", playerName, GetCurrencyString(amount), dealershipId),
                color = 16711680,
            }}
        }), { ["Content-Type"] = "application/json" })
    end

    return { success = true, newBalance = newBalance, message = "Successfully withdrew " .. GetCurrencyString(amount) .. "." }
end)

--- Deposit funds into dealership balance
lib.callback.register("pickle_dealerships:depositFunds", function(source, data)
    local dealershipId = data.dealershipId
    local amount = tonumber(data.amount)

    if not amount or amount <= 0 then
        return { success = false, message = "Invalid amount." }
    end

    if not CanPlayerManage(source, dealershipId) then
        return { success = false, message = "You do not have permission to deposit funds." }
    end

    local dealership = GetDealership(dealershipId)
    if not dealership then
        return { success = false, message = "Dealership not found." }
    end

    -- Check player has enough cash
    local playerCash = GetMoney(source, "money")
    if playerCash < amount then
        return { success = false, message = "You don't have enough cash." }
    end

    RemoveMoney(source, amount, "money")

    local newBalance = (dealership.balance or 0) + amount
    MySQL.update.await("UPDATE pickle_dealerships SET balance = ? WHERE id = ?", { newBalance, dealershipId })
    UpdateDealershipCache(dealershipId, { balance = newBalance })

    local identifier = GetIdentifier(source)
    local playerName = GetPlayerCharacterName(source) or "Unknown"
    AddLedgerEntry(dealershipId, "deposit", amount, "Deposit by " .. playerName, identifier)

    return { success = true, newBalance = newBalance, message = "Successfully deposited " .. GetCurrencyString(amount) .. "." }
end)

--- Upgrade dealership tier
lib.callback.register("pickle_dealerships:upgradeTier", function(source, data)
    local dealershipId = data.dealershipId

    if not CanPlayerManage(source, dealershipId) then
        return { success = false, message = "You do not have permission to upgrade this dealership." }
    end

    local dealership = GetDealership(dealershipId)
    if not dealership then
        return { success = false, message = "Dealership not found." }
    end

    local currentTier = dealership.tier or 1
    if currentTier >= 4 then
        return { success = false, message = "Dealership is already at maximum tier." }
    end

    local upgradeCosts = Config.TierUpgradeCosts or { [1] = 50000, [2] = 150000, [3] = 500000 }
    local cost = upgradeCosts[currentTier]
    if not cost then
        return { success = false, message = "No upgrade cost defined for this tier." }
    end

    if (dealership.balance or 0) < cost then
        return { success = false, message = "Insufficient dealership funds. Need " .. GetCurrencyString(cost) .. "." }
    end

    local newBalance = dealership.balance - cost
    local newTier = currentTier + 1

    MySQL.update.await("UPDATE pickle_dealerships SET balance = ?, tier = ? WHERE id = ?", { newBalance, newTier, dealershipId })
    UpdateDealershipCache(dealershipId, { balance = newBalance, tier = newTier })

    local identifier = GetIdentifier(source)
    local playerName = GetPlayerCharacterName(source) or "Unknown"
    AddLedgerEntry(dealershipId, "expense", -cost, "Tier upgrade to " .. newTier .. " by " .. playerName, identifier)

    return { success = true, newTier = newTier, newBalance = newBalance, message = "Dealership upgraded to Tier " .. newTier .. "!" }
end)

--- Create a coupon
lib.callback.register("pickle_dealerships:createCoupon", function(source, data)
    local dealershipId = data.dealershipId

    if not CanPlayerManage(source, dealershipId) then
        return { success = false, message = "You do not have permission to create coupons." }
    end

    if not data.code or data.code == "" then
        return { success = false, message = "Coupon code is required." }
    end

    -- Check for duplicate code
    local existing = MySQL.scalar.await("SELECT id FROM pickle_dealership_coupons WHERE dealership_id = ? AND code = ?", { dealershipId, toupper(data.code) })
    if existing then
        return { success = false, message = "A coupon with that code already exists." }
    end

    MySQL.insert.await("INSERT INTO pickle_dealership_coupons (dealership_id, code, discount_type, discount_value, max_uses, uses, min_purchase, vehicle_filter, expires_at, created_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, NOW())", {
        dealershipId,
        toupper(data.code),
        data.discountType or "percentage",
        tonumber(data.discountValue) or 0,
        tonumber(data.maxUses) or 0,
        tonumber(data.minPurchase) or 0,
        data.vehicleFilter and json.encode(data.vehicleFilter) or nil,
        data.expiresAt or nil,
    })

    return { success = true, message = "Coupon created successfully." }
end)

--- Delete a coupon
lib.callback.register("pickle_dealerships:deleteCoupon", function(source, data)
    local dealershipId = data.dealershipId
    local couponId = data.couponId

    if not CanPlayerManage(source, dealershipId) then
        return { success = false, message = "You do not have permission to delete coupons." }
    end

    local affected = MySQL.update.await("DELETE FROM pickle_dealership_coupons WHERE id = ? AND dealership_id = ?", { couponId, dealershipId })
    if affected and affected > 0 then
        return { success = true, message = "Coupon deleted." }
    else
        return { success = false, message = "Coupon not found." }
    end
end)

--- Get all coupons for a dealership
lib.callback.register("pickle_dealerships:getCoupons", function(source, dealershipId)
    if not CanPlayerManage(source, dealershipId) then
        return nil
    end

    local coupons = MySQL.query.await("SELECT * FROM pickle_dealership_coupons WHERE dealership_id = ? ORDER BY created_at DESC", { dealershipId })
    return coupons or {}
end)

--- Validate a coupon code for a specific purchase
lib.callback.register("pickle_dealerships:validateCoupon", function(source, data)
    local dealershipId = data.dealershipId
    local code = toupper(data.code or "")
    local purchaseAmount = tonumber(data.purchaseAmount) or 0
    local vehicleModel = data.vehicleModel

    local coupon = MySQL.query.await("SELECT * FROM pickle_dealership_coupons WHERE dealership_id = ? AND code = ? LIMIT 1", { dealershipId, code })
    if not coupon or #coupon == 0 then
        return { valid = false, message = "Invalid coupon code." }
    end

    coupon = coupon[1]

    -- Check expiry
    if coupon.expires_at and os.time() > coupon.expires_at then
        return { valid = false, message = "This coupon has expired." }
    end

    -- Check max uses
    if coupon.max_uses > 0 and coupon.uses >= coupon.max_uses then
        return { valid = false, message = "This coupon has reached its maximum uses." }
    end

    -- Check minimum purchase
    if coupon.min_purchase and purchaseAmount < coupon.min_purchase then
        return { valid = false, message = "Minimum purchase of " .. GetCurrencyString(coupon.min_purchase) .. " required." }
    end

    -- Check vehicle filter
    if coupon.vehicle_filter and coupon.vehicle_filter ~= "" then
        local filter = json.decode(coupon.vehicle_filter)
        if filter and vehicleModel then
            local allowed = false
            for _, model in ipairs(filter) do
                if tolower(model) == tolower(vehicleModel) then
                    allowed = true
                    break
                end
            end
            if not allowed then
                return { valid = false, message = "This coupon is not valid for this vehicle." }
            end
        end
    end

    -- Calculate discount
    local discount = 0
    if coupon.discount_type == "percentage" then
        discount = math.floor(purchaseAmount * (coupon.discount_value / 100))
    elseif coupon.discount_type == "flat" then
        discount = math.min(coupon.discount_value, purchaseAmount)
    end

    return {
        valid        = true,
        couponId     = coupon.id,
        discountType = coupon.discount_type,
        discountValue = coupon.discount_value,
        discount     = discount,
        message      = "Coupon applied! Discount: " .. GetCurrencyString(discount),
    }
end)

--- Get commission rates indexed by real framework grade level. Returns both the grade list
--- (pulled live from the framework via the bridge so labels always reflect the server's actual
--- job definition) and the saved rate table keyed by numeric grade. Dealerships with no job
--- configured return an empty grades list and rely solely on Config.DefaultCommission.
lib.callback.register("pickle_dealerships:getCommissionRates", function(source, dealershipId)
    print(("[pickle_dealerships] getCommissionRates called: source=%s dealershipId=%s"):format(tostring(source), tostring(dealershipId)))
    if not CanPlayerManage(source, dealershipId) then
        print("[pickle_dealerships] getCommissionRates: CanPlayerManage=false")
        return nil
    end

    local dealership = GetDealership(dealershipId)
    if not dealership then return nil end

    local meta = dealership.metadata
    if type(meta) == "string" then meta = json.decode(meta) or {} end
    if type(meta) ~= "table" then meta = {} end

    local faction = GetDealershipFaction(dealership)
    local grades = {}
    if faction.name and faction.name ~= "" then
        if faction.type == "gang" and GetGangGrades then
            grades = GetGangGrades(faction.name) or {}
        elseif GetJobGrades then
            grades = GetJobGrades(faction.name) or {}
        end
    end

    print(("[pickle_dealerships] getCommissionRates: dealership=%s faction=%s:%s grades=%d"):format(
        tostring(dealershipId), tostring(faction.type), tostring(faction.name), #grades))

    -- JSON serialisation collapses integer-keyed tables to arrays with holes; normalise the
    -- stored map into a { level = rate } list so the NUI can find each grade by level reliably.
    local rates = {}
    if type(meta.commissionRates) == "table" then
        for k, v in pairs(meta.commissionRates) do
            local lvl = tonumber(k)
            if lvl then rates[#rates + 1] = { level = lvl, rate = tonumber(v) or 0 } end
        end
    end

    return {
        job = faction.name or nil,
        factionType = faction.type,
        grades = grades,                                                   -- [{ level, label }, ...]
        rates = rates,                                                     -- [{ level, rate }, ...]
        defaultRate = math.floor((Config.DefaultCommission or 0.08) * 100),
    }
end)

--- Returns the list of server-wide alt currencies along with the subset this dealership accepts.
lib.callback.register("pickle_dealerships:getAcceptedAltCurrencies", function(source, dealershipId)
    if not CanPlayerManage(source, dealershipId) then return nil end
    local dealership = GetDealership(dealershipId)
    if not dealership then return nil end

    local meta = dealership.metadata
    if type(meta) == "string" then meta = json.decode(meta) or {} end
    if type(meta) ~= "table" then meta = {} end

    local accepted = {}
    if type(meta.acceptedAltCurrencies) == "table" then
        for _, k in ipairs(meta.acceptedAltCurrencies) do
            if type(k) == "string" then accepted[#accepted + 1] = k end
        end
    end

    local available = ListAltCurrencies and ListAltCurrencies() or {}
    return { available = available, accepted = accepted }
end)

--- Admin-only update of the dealership's accepted alt currencies. Silently drops unknown keys.
--- Owners can VIEW their enabled methods (getAcceptedAltCurrencies) but cannot change them —
--- which payment rails are available is a server-operator decision.
lib.callback.register("pickle_dealerships:setAcceptedAltCurrencies", function(source, data)
    if not IsPlayerAdmin(source) then
        return { success = false, message = _L("no_permission") }
    end

    local dealershipId = data and data.dealershipId
    if not dealershipId then return { success = false, message = "Invalid request." } end

    local dealership = GetDealership(dealershipId)
    if not dealership then return { success = false, message = "Dealership not found." } end

    local meta = dealership.metadata
    if type(meta) == "string" then meta = json.decode(meta) or {} end
    if type(meta) ~= "table" then meta = {} end

    local cleaned = {}
    if type(data.accepted) == "table" then
        for _, k in ipairs(data.accepted) do
            if type(k) == "string" and GetAltCurrency and GetAltCurrency(k) then
                cleaned[#cleaned + 1] = k
            end
        end
    end
    meta.acceptedAltCurrencies = cleaned

    MySQL.update.await("UPDATE pickle_dealerships SET metadata = ? WHERE id = ?", { json.encode(meta), dealershipId })
    UpdateDealershipCache(dealershipId, { metadata = meta })

    return { success = true, message = _L("alt_currencies_updated") }
end)

--- Returns the dealership's society-funds allowlist and the faction (job/gang) it maps to.
--- Allowlist entries: { type = 'job'|'gang', name = string, minGrade = number }
lib.callback.register("pickle_dealerships:getSocietyAllowlist", function(source, dealershipId)
    if not CanPlayerManage(source, dealershipId) then return nil end
    local dealership = GetDealership(dealershipId)
    if not dealership then return nil end

    local meta = dealership.metadata
    if type(meta) == "string" then meta = json.decode(meta) or {} end
    if type(meta) ~= "table" then meta = {} end

    local allowlist = {}
    if type(meta.societyAllowlist) == "table" then
        for _, entry in ipairs(meta.societyAllowlist) do
            if entry and entry.type and entry.name then
                allowlist[#allowlist + 1] = {
                    type = tostring(entry.type),
                    name = tostring(entry.name),
                    minGrade = tonumber(entry.minGrade) or 0,
                }
            end
        end
    end

    return { allowlist = allowlist }
end)

--- Owner-only update of the society allowlist. Entries with invalid type/name are skipped.
lib.callback.register("pickle_dealerships:setSocietyAllowlist", function(source, data)
    local dealershipId = data and data.dealershipId
    if not dealershipId then return { success = false, message = "Invalid request." } end

    local identifier = GetIdentifier(source)
    if not identifier then return { success = false, message = "Unable to identify player." } end

    local dealership = GetDealership(dealershipId)
    if not dealership then return { success = false, message = "Dealership not found." } end

    local isOwner = dealership.owner_identifier == identifier
    if not isOwner and not IsPlayerAdmin(source) then
        return { success = false, message = "Only the owner can change society payment rules." }
    end

    local meta = dealership.metadata
    if type(meta) == "string" then meta = json.decode(meta) or {} end
    if type(meta) ~= "table" then meta = {} end

    local cleaned = {}
    if type(data.allowlist) == "table" then
        for _, entry in ipairs(data.allowlist) do
            local t = entry and entry.type
            local n = entry and entry.name
            if (t == "job" or t == "gang") and type(n) == "string" and n ~= "" then
                cleaned[#cleaned + 1] = {
                    type = t,
                    name = n,
                    minGrade = math.max(0, math.floor(tonumber(entry.minGrade) or 0)),
                }
            end
        end
    end
    meta.societyAllowlist = cleaned

    MySQL.update.await("UPDATE pickle_dealerships SET metadata = ? WHERE id = ?", { json.encode(meta), dealershipId })
    UpdateDealershipCache(dealershipId, { metadata = meta })

    return { success = true, message = _L("society_allowlist_updated") }
end)

--- Returns the matched allowlist entry for the calling player, or nil if they are
--- not permitted to use society funds at this dealership. Called by the sales UI
--- to decide whether to show the "Pay with Society Funds" tab.
lib.callback.register("pickle_dealerships:canUseSocietyFunds", function(source, dealershipId)
    local dealership = GetDealership(dealershipId)
    if not dealership then return nil end

    local meta = dealership.metadata
    if type(meta) == "string" then meta = json.decode(meta) or {} end
    if type(meta) ~= "table" then return nil end

    local allowlist = meta.societyAllowlist
    if type(allowlist) ~= "table" or #allowlist == 0 then return nil end

    local jobName = GetPlayerJobName and GetPlayerJobName(source) or nil
    local jobGrade = GetPlayerJobGrade and GetPlayerJobGrade(source) or 0
    local gangName = GetPlayerGangName and GetPlayerGangName(source) or nil
    local gangGrade = GetPlayerGangGrade and GetPlayerGangGrade(source) or 0

    for _, entry in ipairs(allowlist) do
        local minGrade = tonumber(entry.minGrade) or 0
        if entry.type == "job" and entry.name == jobName and jobGrade >= minGrade then
            return { type = entry.type, name = entry.name, minGrade = minGrade }
        elseif entry.type == "gang" and entry.name == gangName and gangGrade >= minGrade then
            return { type = entry.type, name = entry.name, minGrade = minGrade }
        end
    end
    return nil
end)

--- Returns the live progression snapshot (current level, xp, next threshold).
--- Any caller with access to the dealership can read this — it's not sensitive.
lib.callback.register("pickle_dealerships:getDealershipProgression", function(_, dealershipId)
    local dealership = GetDealership(dealershipId)
    if not dealership then return nil end
    return GetDealershipProgression(dealership)
end)

--- Set commission rates. Accepts `rates = [{ level, rate }, ...]`; any grade not in the payload
--- is cleared. Rates are clamped to 0-100. Only levels that exist on the dealership's current
--- job (per the framework) are persisted — we never store rates for phantom grades.
lib.callback.register("pickle_dealerships:setCommissionRates", function(source, data)
    local dealershipId = data.dealershipId
    if not CanPlayerManage(source, dealershipId) then
        return { success = false, message = "You do not have permission." }
    end

    local dealership = GetDealership(dealershipId)
    if not dealership then return { success = false, message = "Dealership not found." } end

    local meta = dealership.metadata
    if type(meta) == "string" then meta = json.decode(meta) or {} end
    if type(meta) ~= "table" then meta = {} end

    local validLevels = {}
    local faction = GetDealershipFaction(dealership)
    local factionGrades = {}
    if faction.name and faction.name ~= "" then
        if faction.type == "gang" and GetGangGrades then
            factionGrades = GetGangGrades(faction.name) or {}
        elseif GetJobGrades then
            factionGrades = GetJobGrades(faction.name) or {}
        end
    end
    for _, g in ipairs(factionGrades) do
        validLevels[tonumber(g.level)] = true
    end

    local nextRates = {}
    if type(data.rates) == "table" then
        for _, entry in ipairs(data.rates) do
            local lvl = tonumber(entry.level)
            local rate = tonumber(entry.rate) or 0
            if lvl and validLevels[lvl] then
                nextRates[tostring(lvl)] = math.max(0, math.min(100, rate))
            end
        end
    end
    meta.commissionRates = nextRates

    MySQL.update.await("UPDATE pickle_dealerships SET metadata = ? WHERE id = ?", { json.encode(meta), dealershipId })
    UpdateDealershipCache(dealershipId, { metadata = meta })

    return { success = true, message = "Commission rates updated." }
end)

--- Get comprehensive dashboard stats
lib.callback.register("pickle_dealerships:getDashboardStats", function(source, dealershipId)
    if not CanPlayerManage(source, dealershipId) then
        return nil
    end

    local dealership = GetDealership(dealershipId)
    local tierCfg = Config.Tiers[dealership and dealership.tier or 1]

    -- Total sales (sold stock items)
    local totalSales = MySQL.scalar.await(
        "SELECT COUNT(*) FROM pickle_dealership_stock WHERE dealership_id = ? AND sold_at IS NOT NULL",
        { dealershipId }
    ) or 0

    -- Total revenue from sold stock
    local totalRevenue = MySQL.scalar.await(
        "SELECT COALESCE(SUM(retail_price), 0) FROM pickle_dealership_stock WHERE dealership_id = ? AND sold_at IS NOT NULL",
        { dealershipId }
    ) or 0

    -- Total profit (revenue - wholesale cost)
    local totalCost = MySQL.scalar.await(
        "SELECT COALESCE(SUM(wholesale_cost), 0) FROM pickle_dealership_stock WHERE dealership_id = ? AND sold_at IS NOT NULL",
        { dealershipId }
    ) or 0
    local totalProfit = totalRevenue - totalCost

    -- Total commission paid (from ledger). Commission is stored as a negative
    -- expense; present it as a positive amount so the dashboard reads naturally.
    local totalCommission = MySQL.scalar.await(
        "SELECT COALESCE(ABS(SUM(amount)), 0) FROM pickle_dealership_ledger WHERE dealership_id = ? AND type = 'commission'",
        { dealershipId }
    ) or 0

    -- Sales this week
    local salesThisWeek = MySQL.scalar.await(
        "SELECT COUNT(*) FROM pickle_dealership_stock WHERE dealership_id = ? AND sold_at IS NOT NULL AND sold_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)",
        { dealershipId }
    ) or 0

    local revenueThisWeek = MySQL.scalar.await(
        "SELECT COALESCE(SUM(retail_price), 0) FROM pickle_dealership_stock WHERE dealership_id = ? AND sold_at IS NOT NULL AND sold_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)",
        { dealershipId }
    ) or 0

    -- Top seller. Join against `players` so offline sellers still get their
    -- character name (rather than a bare citizenid). Works on QB/QBX — ESX
    -- servers that don't have a `players` table will hit the COALESCE fallback
    -- and show the raw identifier.
    local topSellerRow = MySQL.single.await([[
        SELECT
            ds.sold_by AS identifier,
            COUNT(*) AS sales,
            COALESCE(SUM(ds.retail_price), 0) AS revenue,
            p.charinfo AS charinfo
        FROM pickle_dealership_stock ds
        LEFT JOIN players p ON p.citizenid = ds.sold_by
        WHERE ds.dealership_id = ?
          AND ds.sold_at IS NOT NULL
          AND ds.sold_by IS NOT NULL
        GROUP BY ds.sold_by
        ORDER BY sales DESC
        LIMIT 1
    ]], { dealershipId })

    local topSeller = nil
    if topSellerRow then
        local displayName = topSellerRow.identifier
        if topSellerRow.charinfo then
            local info = type(topSellerRow.charinfo) == "string"
                and (json.decode(topSellerRow.charinfo) or {})
                or topSellerRow.charinfo
            if info.firstname or info.lastname then
                displayName = ((info.firstname or "") .. " " .. (info.lastname or "")):gsub("^%s+", ""):gsub("%s+$", "")
            end
        end
        topSeller = {
            name = displayName,
            sales = tonumber(topSellerRow.sales) or 0,
            revenue = tonumber(topSellerRow.revenue) or 0,
        }
    end

    -- Current stock & employee counts
    local stockCount = MySQL.scalar.await(
        "SELECT COUNT(*) FROM pickle_dealership_stock WHERE dealership_id = ? AND sold_at IS NULL",
        { dealershipId }
    ) or 0

    local employeeCount = MySQL.scalar.await(
        "SELECT COUNT(*) FROM pickle_dealership_employees WHERE dealership_id = ?",
        { dealershipId }
    ) or 0

    return {
        totalSales       = totalSales,
        totalRevenue     = totalRevenue,
        totalProfit      = totalProfit,
        totalCommission  = totalCommission,
        salesThisWeek    = salesThisWeek,
        revenueThisWeek  = revenueThisWeek,
        topSeller        = topSeller,
        stockCount       = stockCount,
        stockCapacity    = tierCfg and tierCfg.stockCap or 20,
        employeeCount    = employeeCount,
        employeeCapacity = tierCfg and tierCfg.employeeCap or 2,
    }
end)
