-- =============================================
--  pickle_dealerships | modules/npc_customers/server.lua
--  NPC customer generation, evaluation, negotiation & sale
-- =============================================

--- Check if current time is within business hours
---@return boolean
local function IsWithinBusinessHours()
    local hours = Config.NPCCustomers.businessHours
    if not hours then return true end -- nil = always open
    local currentHour = tonumber(os.date("%H"))
    return currentHour >= (hours.start or 0) and currentHour < (hours.stop or 24)
end

--- Generate an NPC customer profile based on dealership tier & reputation
---@param dealershipId number
---@return table|nil npcProfile
local function GenerateNPCProfile(dealershipId)
    local dealership = GetDealership(dealershipId)
    if not dealership then return nil end

    local tier = dealership.tier or 1

    -- Query actual available stock with wholesale costs and classes
    local availableStock = MySQL.query.await(
        'SELECT ds.wholesale_cost, wc.class FROM dealership_stock ds LEFT JOIN wholesale_catalog wc ON wc.model = ds.vehicle_model WHERE ds.dealership_id = ? AND ds.sold_at IS NULL AND ds.unlisted = 0 AND ds.delivered_at IS NOT NULL AND ds.delivered_at <= NOW()',
        { dealershipId }
    )

    if not availableStock or #availableStock == 0 then return nil end

    -- Build available classes and MSRP price range from stock
    local availableClasses = {}
    local classSet = {}
    local minMSRP = math.huge
    local maxMSRP = 0
    for _, item in ipairs(availableStock) do
        local cls = item.class
        if cls and cls ~= '' then
            local clsLower = string.lower(cls)
            if not classSet[clsLower] then
                classSet[clsLower] = true
                availableClasses[#availableClasses + 1] = clsLower
            end
        end
        local msrp = tonumber(item.wholesale_cost) or 0
        if msrp > 0 then
            if msrp < minMSRP then minMSRP = msrp end
            if msrp > maxMSRP then maxMSRP = msrp end
        end
    end

    if #availableClasses == 0 or maxMSRP == 0 then return nil end

    -- Pick type preference from what's actually in stock
    local typePreference = availableClasses[math.random(#availableClasses)]

    -- Build budget based on MSRP of available vehicles in this class (+ 5% margin)
    local classMinMSRP = math.huge
    local classMaxMSRP = 0
    for _, item in ipairs(availableStock) do
        local cls = item.class and string.lower(item.class) or ''
        if cls == typePreference then
            local msrp = tonumber(item.wholesale_cost) or 0
            if msrp > 0 then
                if msrp < classMinMSRP then classMinMSRP = msrp end
                if msrp > classMaxMSRP then classMaxMSRP = msrp end
            end
        end
    end

    -- Fallback to all stock if class has no MSRP data
    if classMaxMSRP == 0 then
        classMinMSRP = minMSRP
        classMaxMSRP = maxMSRP
    end

    -- Pick a random vehicle from this class as the budget target
    local classMSRPs = {}
    for _, item in ipairs(availableStock) do
        local cls = item.class and string.lower(item.class) or ''
        if cls == typePreference then
            local msrp = tonumber(item.wholesale_cost) or 0
            if msrp > 0 then
                classMSRPs[#classMSRPs + 1] = msrp
            end
        end
    end

    local targetMSRP
    if #classMSRPs > 0 then
        targetMSRP = classMSRPs[math.random(#classMSRPs)]
    else
        -- Fallback: pick a random MSRP from all stock
        local allMSRPs = {}
        for _, item in ipairs(availableStock) do
            local msrp = tonumber(item.wholesale_cost) or 0
            if msrp > 0 then allMSRPs[#allMSRPs + 1] = msrp end
        end
        targetMSRP = allMSRPs[math.random(#allMSRPs)]
    end

    -- Budget = target vehicle MSRP + 5-15% random margin so they can afford it
    local budget = math.floor(targetMSRP * (1.05 + math.random() * 0.10))

    local personality = WeightedRandom(Config.NPCCustomers.personalityWeights)

    local flexRange = Config.NPCCustomers.flexibilityRange
    local flexibility = flexRange.min + math.random() * (flexRange.max - flexRange.min)

    local colorPreference = nil
    if math.random() <= 0.5 and Config.DefaultColorPalette and #Config.DefaultColorPalette > 0 then
        colorPreference = Config.DefaultColorPalette[math.random(#Config.DefaultColorPalette)]
    end

    local priorityStats = { "speed", "style", "practicality", "price" }
    local priorityStat = priorityStats[math.random(#priorityStats)]

    -- Budget tier label for ped model selection
    local budgetTier = "economy"
    if budget >= 200000 then budgetTier = "luxury"
    elseif budget >= 80000 then budgetTier = "premium"
    elseif budget >= 30000 then budgetTier = "midrange"
    end

    local pedModels = Config.NPCCustomers.pedModels
    local pedPool = pedModels[budgetTier] or pedModels["economy"] or pedModels[next(pedModels)]
    local pedModel = pedPool[math.random(#pedPool)]

    -- Patience time based on personality
    local patienceTimes = {
        haggler       = math.random(60, 120),
        impulse_buyer = math.random(30, 60),
        researcher    = math.random(90, 150),
        skeptic       = math.random(60, 100),
        walkaway      = math.random(30, 60),
    }
    local patienceTime = patienceTimes[personality] or math.random(60, 120)

    -- Max negotiation rounds based on personality
    local maxRoundsByPersonality = {
        haggler       = 6,
        impulse_buyer = 3,
        researcher    = 5,
        skeptic       = 5,
        walkaway      = 3,
    }

    local profile = {
        budgetTier      = budgetTier,
        budget          = budget,
        personality     = personality,
        typePreference  = typePreference,
        flexibility     = flexibility,
        colorPreference = colorPreference,
        priorityStat    = priorityStat,
        pedModel        = pedModel,
        patienceTime    = patienceTime,
        dealershipId    = dealershipId,
        maxPresentations = Config.NPCCustomers.maxPresentations or 3,
        maxRounds       = maxRoundsByPersonality[personality] or (Config.NPCCustomers.maxNegotiationRounds or 5),
    }

    return profile
end

-- ─── Callbacks ──────────────────────────────────────────────────────────────

--- Generate NPC customer profile
lib.callback.register("pickle_dealerships:generateNPCCustomer", function(source, dealershipId)
    -- Enforce business hours
    if not IsWithinBusinessHours() then return nil end

    return GenerateNPCProfile(dealershipId)
end)

--- Evaluate how well a vehicle matches an NPC's preferences
lib.callback.register("pickle_dealerships:evaluateVehicleMatch", function(source, data)
    local profile = data.npcProfile
    local stockItem = data.stockItem
    if not profile or not stockItem then
        return { quality = "terrible", score = 0, dialogue = "..." }
    end

    local score = 0
    local maxScore = 100

    -- Type match (40 pts — most important)
    local itemClass = stockItem.class or stockItem.vehicle_class or ""
    local itemClassLower = string.lower(itemClass)
    local prefLower = string.lower(profile.typePreference or "")
    if itemClassLower == prefLower then
        score = score + 40
    elseif itemClass ~= "" then
        score = score + 5
    end

    -- Budget fit (35 pts)
    local price = tonumber(stockItem.retail_price) or tonumber(stockItem.price) or 0
    local budget = profile.budget or 0
    local maxBudget = budget * (1 + (profile.flexibility or 0))
    if price <= budget then
        local ratio = price / math.max(budget, 1)
        if ratio >= 0.6 then
            score = score + 35
        elseif ratio >= 0.4 then
            score = score + 25
        else
            score = score + 10
        end
    elseif price <= maxBudget then
        score = score + 20
    else
        -- Over max budget — small penalty but not zero if type matches
        score = score + 5
    end

    -- Color match (10 pts)
    if profile.colorPreference then
        score = score + 5
    else
        score = score + 10
    end

    -- Priority stat (15 pts)
    if profile.priorityStat == "price" and price <= budget * 0.8 then
        score = score + 15
    elseif profile.priorityStat == "style" then
        score = score + 10
    elseif profile.priorityStat == "practicality" and (itemClassLower == "suv" or itemClassLower == "sedan") then
        score = score + 15
    elseif profile.priorityStat == "speed" and (itemClassLower == "sports" or itemClassLower == "super") then
        score = score + 15
    else
        score = score + 5
    end

    local pct = score / maxScore
    local quality
    if pct >= 0.75 then quality = "great"
    elseif pct >= 0.50 then quality = "good"
    elseif pct >= 0.30 then quality = "poor"
    else quality = "terrible" end

    -- Reaction dialogue from config
    local pool = Config.NPCCustomers.reactions and Config.NPCCustomers.reactions[quality]
    local dialogue = pool and pool[math.random(#pool)] or "Hmm..."

    -- Calculate opening offer based on score
    local openingOfferPct = 0.5 + (pct * 0.45) -- 50% to 95% of asking price
    if profile.personality == "impulse_buyer" then openingOfferPct = openingOfferPct + 0.1 end
    if profile.personality == "haggler" then openingOfferPct = openingOfferPct - 0.15 end

    local openingOffer = math.floor(price * math.min(openingOfferPct, 1.0))
    -- Clamp to budget
    if openingOffer > budget * (1 + profile.flexibility) then
        openingOffer = math.floor(budget * (1 + profile.flexibility))
    end

    return { quality = quality, score = score, dialogue = dialogue, openingOffer = openingOffer }
end)

--- Evaluate a player's price offer against the NPC's secret max willingness
--- Returns stress increase, whether they accept, and dialogue
lib.callback.register("pickle_dealerships:evaluateOffer", function(source, data)
    local npcProfile = data.npcProfile
    local offerPrice = tonumber(data.offerPrice) or 0
    local currentStress = tonumber(data.currentStress) or 0

    if not npcProfile then
        return { accepted = false, walkaway = true, stress = 100, dialogue = "Something went wrong." }
    end

    local budget = npcProfile.budget or 0
    local flexibility = npcProfile.flexibility or 0.3
    local personality = npcProfile.personality or "researcher"
    -- Max willingness is budget + 5-15% based on flexibility (tight range, not 2x)
    local maxWillPay = math.floor(budget * (1 + 0.05 + flexibility * 0.10))

    -- Personality stress multipliers (how easily stressed)
    local stressMultiplier = {
        haggler = 0.6,       -- hard to stress, expects tough negotiation
        impulse_buyer = 1.4, -- stresses quickly, wants a quick deal
        researcher = 0.8,    -- patient, moderate stress
        skeptic = 1.2,       -- gets stressed easily
        walkaway = 1.5,      -- very easily stressed
    }
    local personalityMult = stressMultiplier[personality] or 1.0

    local dialogue = ""
    local stressIncrease = 0
    local accepted = false

    if offerPrice <= maxWillPay then
        -- Offer is within their willingness — they accept!
        accepted = true
        stressIncrease = 0

        if offerPrice <= budget * 0.8 then
            dialogue = "That's a great deal! I'll take it!"
        elseif offerPrice <= budget then
            dialogue = "That works for me. You've got a deal."
        else
            dialogue = "It's a stretch, but okay — deal."
        end
    else
        -- Over their max — calculate stress based on how far over
        local overAmount = offerPrice - maxWillPay
        local overPct = overAmount / math.max(maxWillPay, 1)

        -- Base stress: 20-50% per offer depending on how far over
        stressIncrease = math.floor((20 + overPct * 300) * personalityMult)
        stressIncrease = math.max(10, math.min(70, stressIncrease)) -- clamp 10-70 per offer

        -- Add small random variance
        stressIncrease = stressIncrease + math.random(-5, 5)

        local newStress = currentStress + stressIncrease

        if newStress >= 100 then
            -- Walked away
            local walkawayDialogues = {
                "That's way too much. I'm done here.",
                "You're not serious with that price. Goodbye.",
                "I can't deal with this. I'm leaving.",
                "Forget it, this isn't going to work.",
            }
            dialogue = walkawayDialogues[math.random(#walkawayDialogues)]
            return { accepted = false, walkaway = true, stress = 100, stressIncrease = stressIncrease, dialogue = dialogue }
        else
            -- Still negotiating but stressed
            if newStress >= 70 then
                local highStress = {
                    "You're really pushing it...",
                    "I'm about to walk out of here.",
                    "This is getting ridiculous.",
                    "Last chance to give me a real price.",
                }
                dialogue = highStress[math.random(#highStress)]
            elseif newStress >= 40 then
                local midStress = {
                    "That's too high. Can you do better?",
                    "Come on, be reasonable.",
                    "I like the car but not at that price.",
                    "You're going to have to come down.",
                }
                dialogue = midStress[math.random(#midStress)]
            else
                local lowStress = {
                    "Hmm, that's a bit more than I was thinking.",
                    "Can we work on the price a little?",
                    "I was hoping for something lower.",
                    "Not bad, but can you do a bit better?",
                }
                dialogue = lowStress[math.random(#lowStress)]
            end
        end
    end

    return {
        accepted = accepted,
        walkaway = false,
        stress = math.min(100, currentStress + stressIncrease),
        stressIncrease = stressIncrease,
        dialogue = dialogue,
    }
end)

--- Complete an NPC sale
lib.callback.register("pickle_dealerships:completeNPCSale", function(source, data)
    local dealershipId = data.dealershipId
    local stockId      = data.stockId
    local saleAmount   = data.saleAmount
    local npcProfile   = data.npcProfile

    if not dealershipId or not stockId or not saleAmount then
        return { success = false, message = _L("npc_invalid_sale_data") }
    end

    local dealership = GetDealership(dealershipId)
    if not dealership then
        return { success = false, message = _L("dealership_not_found") }
    end

    local identifier = GetIdentifier(source)
    if not identifier then
        return { success = false, message = _L("npc_player_identifier_not_found") }
    end

    -- Apply NPC sale multiplier
    local multiplier = Config.NPCCustomers.npcSaleMultiplier or 1.0
    local adjustedAmount = math.floor(saleAmount * multiplier)

    -- Add to dealership balance
    local newBalance = (dealership.balance or 0) + adjustedAmount
    MySQL.update("UPDATE dealerships SET balance = ? WHERE id = ?", { newBalance, dealershipId })
    UpdateDealershipCache(dealershipId, { balance = newBalance })

    -- Calculate and pay commission
    local commissionRate = Config.DefaultCommission or 0.08
    local commission = math.floor(adjustedAmount * commissionRate)
    if commission > 0 then
        AddMoney(source, commission, "bank")
        ShowNotification(source, _L("npc_commission_earned", GetCurrencyString(commission)))
    end

    -- Satisfaction bonus reputation
    local bonusRep = 0
    if npcProfile then
        local budgetRatio = adjustedAmount / math.max(npcProfile.budget or 1, 1)
        if budgetRatio >= 0.9 then
            bonusRep = 1
        end
    end

    -- Always deduct from stock
    local stock = MySQL.single.await("SELECT quantity FROM dealership_stock WHERE id = ?", { stockId })
    if stock and stock.quantity > 1 then
        MySQL.update("UPDATE dealership_stock SET quantity = quantity - 1 WHERE id = ?", { stockId })
    else
        MySQL.update("UPDATE dealership_stock SET sold_at = NOW(), sold_to = 'NPC', sold_by = ? WHERE id = ?", { identifier, stockId })
    end

    -- Add XP if pickle_xp is available
    if Config.XPEnabled and GetResourceState("pickle_xp") == "started" then
        local xpAmount = Config.NPCCustomers.xpPerSale or 15
        exports["pickle_xp"]:AddPlayerXP(source, xpAmount)
    end

    -- Update dealership reputation
    local repGain = (Config.NPCCustomers.reputationPerSale or 1) + bonusRep
    local newRep = (dealership.reputation or 0) + repGain
    MySQL.update("UPDATE dealerships SET reputation = ? WHERE id = ?", { newRep, dealershipId })
    UpdateDealershipCache(dealershipId, { reputation = newRep })

    -- Add ledger entry
    local playerName = GetPlayerCharacterName(source) or "Unknown"
    AddLedgerEntry(dealershipId, "npc_sale", adjustedAmount, "NPC sale by " .. playerName .. " (Commission: " .. GetCurrencyString(commission) .. ")", identifier)

    return {
        success    = true,
        saleAmount = adjustedAmount,
        commission = commission,
        message    = _L("npc_sale_complete_message", GetCurrencyString(commission)),
    }
end)
