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
    local reputation = dealership.reputation or 0

    -- Budget tier weights shift toward premium/luxury with higher reputation
    local budgetWeights = {
        economy  = math.max(10, 50 - reputation * 0.3),
        midrange = 30 + reputation * 0.1,
        premium  = math.max(5, 10 + reputation * 0.15),
        luxury   = math.max(2, 5 + reputation * 0.2),
    }
    local budgetTier = WeightedRandom(budgetWeights)

    local personality = WeightedRandom(Config.NPCCustomers.personalityWeights)
    local typePreference = WeightedRandom(Config.NPCCustomers.typePreferences)

    local flexRange = Config.NPCCustomers.flexibilityRange
    local flexibility = flexRange.min + math.random() * (flexRange.max - flexRange.min)

    local colorPreference = nil
    if math.random() <= 0.5 and Config.DefaultColorPalette and #Config.DefaultColorPalette > 0 then
        colorPreference = Config.DefaultColorPalette[math.random(#Config.DefaultColorPalette)]
    end

    local priorityStats = { "speed", "style", "practicality", "price" }
    local priorityStat = priorityStats[math.random(#priorityStats)]

    local pedModels = Config.NPCCustomers.pedModels
    local pedPool = pedModels[budgetTier] or pedModels["economy"] or pedModels[next(pedModels)]
    local pedModel = pedPool[math.random(#pedPool)]

    -- Budget range from config
    local budgetRanges = {}
    if Config.NPCCustomers.budgetTiers then
        for _, bt in ipairs(Config.NPCCustomers.budgetTiers) do
            local key = bt.label:lower():gsub("%-", "")
            budgetRanges[key] = { min = bt.min, max = bt.max }
        end
    end
    if not budgetRanges[budgetTier] then
        budgetRanges[budgetTier] = { min = 5000, max = 25000 }
    end
    local range = budgetRanges[budgetTier]
    local budget = math.random(range.min, range.max)

    -- Apply tier budget multiplier
    local tierMultiplier = Config.NPCCustomers.tierBudgetMultiplier and Config.NPCCustomers.tierBudgetMultiplier[tier] or 1.0
    budget = math.floor(budget * tierMultiplier)

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

    -- Type match (30 pts)
    local itemClass = stockItem.class or stockItem.vehicle_class or ""
    if itemClass == profile.typePreference then
        score = score + 30
    elseif itemClass ~= "" then
        score = score + 5
    end

    -- Budget fit (40 pts)
    local price = tonumber(stockItem.retail_price) or tonumber(stockItem.price) or 0
    local budget = profile.budget or 0
    if price <= budget then
        local ratio = price / math.max(budget, 1)
        if ratio >= 0.7 then
            score = score + 40
        elseif ratio >= 0.5 then
            score = score + 25
        else
            score = score + 10
        end
    else
        local overBudget = (price - budget) / math.max(budget, 1)
        if overBudget <= profile.flexibility then
            score = score + 15
        end
    end

    -- Color match (15 pts)
    if profile.colorPreference then
        score = score + 5 -- partial credit, color check is loose
    else
        score = score + 10 -- no preference = easy match
    end

    -- Priority stat (15 pts)
    if profile.priorityStat == "price" and price <= budget * 0.8 then
        score = score + 15
    elseif profile.priorityStat == "style" then
        score = score + 10
    elseif profile.priorityStat == "practicality" and (itemClass == "suv" or itemClass == "sedan") then
        score = score + 15
    elseif profile.priorityStat == "speed" and (itemClass == "sports" or itemClass == "super") then
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

--- Process a negotiation round
lib.callback.register("pickle_dealerships:processNegotiation", function(source, data)
    local dealershipId = data.dealershipId
    local npcProfile   = data.npcProfile
    local stockId      = data.stockId
    local tactic       = data.tactic
    local currentOffer = data.currentOffer
    local round        = data.round or 1

    if not dealershipId or not npcProfile or not stockId then
        return { newOffer = currentOffer, reaction = "confused", emotionState = "neutral", dialogue = "Something went wrong.", roundOver = true, saleComplete = false }
    end

    local personality = npcProfile.personality
    local flexibility = npcProfile.flexibility or 0.1
    local budget      = npcProfile.budget or 0
    local maxRounds   = npcProfile.maxRounds or 5

    -- Tactic → personality effectiveness mapping
    local tacticMap = {
        stand_firm         = { haggler = 0.3, impulse_buyer = 0.7, researcher = 0.5, skeptic = 0.4, walkaway = 0.2 },
        concession         = { haggler = 0.7, impulse_buyer = 0.6, researcher = 0.6, skeptic = 0.5, walkaway = 0.6 },
        highlight_features = { haggler = 0.4, impulse_buyer = 0.5, researcher = 0.8, skeptic = 0.3, walkaway = 0.4 },
        urgency            = { haggler = 0.3, impulse_buyer = 0.8, researcher = 0.3, skeptic = 0.2, walkaway = 0.5 },
        sweeten            = { haggler = 0.6, impulse_buyer = 0.7, researcher = 0.5, skeptic = 0.6, walkaway = 0.7 },
        match_need         = { haggler = 0.5, impulse_buyer = 0.5, researcher = 0.7, skeptic = 0.7, walkaway = 0.5 },
        final_offer        = { haggler = 0.4, impulse_buyer = 0.6, researcher = 0.4, skeptic = 0.3, walkaway = 0.3 },
    }

    local effectiveness = 0.5
    if tacticMap[tactic] and tacticMap[tactic][personality] then
        effectiveness = tacticMap[tactic][personality]
    end

    local roll = math.random()
    local success = roll <= effectiveness

    local newOffer = currentOffer
    local reaction, emotionState, dialogue
    local roundOver = false
    local saleComplete = false

    local maxWillPay = budget * (1 + flexibility)

    if success then
        local bump = currentOffer * (0.02 + math.random() * 0.06)
        newOffer = math.floor(currentOffer + bump)
        reaction = "positive"
        emotionState = "interested"

        local pool = Config.NPCCustomers.negotiation and Config.NPCCustomers.negotiation[tactic]
        if pool and pool.success then
            dialogue = pool.success[math.random(#pool.success)]
        else
            dialogue = "Alright, you've got a point."
        end
    else
        local drop = currentOffer * (0.01 + math.random() * 0.03)
        newOffer = math.floor(currentOffer - drop)
        reaction = "negative"
        emotionState = "annoyed"

        local pool = Config.NPCCustomers.negotiation and Config.NPCCustomers.negotiation[tactic]
        if pool and pool.fail then
            dialogue = pool.fail[math.random(#pool.fail)]
        else
            dialogue = "That's not gonna work for me."
        end
    end

    -- Sweeten deal cost: deduct a small fee from dealership
    if tactic == "sweeten" and success then
        local sweetenCost = math.floor((npcProfile.budget or 10000) * 0.02) -- 2% of NPC budget
        local dealership = GetDealership(dealershipId)
        if dealership and dealership.balance >= sweetenCost then
            local newBalance = dealership.balance - sweetenCost
            MySQL.update("UPDATE dealerships SET balance = ? WHERE id = ?", { newBalance, dealershipId })
            UpdateDealershipCache(dealershipId, { balance = newBalance })
        end
    end

    -- Final offer tactic: ends negotiation immediately
    if tactic == "final_offer" then
        roundOver = true
        if success then
            saleComplete = true
            local pool = Config.NPCCustomers.negotiation and Config.NPCCustomers.negotiation.final_offer
            dialogue = pool and pool.accept and pool.accept[math.random(#pool.accept)] or "Fine, deal."
            emotionState = "satisfied"
            reaction = "deal"
        else
            local pool = Config.NPCCustomers.negotiation and Config.NPCCustomers.negotiation.final_offer
            dialogue = pool and pool.reject and pool.reject[math.random(#pool.reject)] or "No deal. I'm out."
            emotionState = "angry"
            reaction = "walkaway"
        end
    end

    -- Clamp offer
    if newOffer > maxWillPay then newOffer = math.floor(maxWillPay) end
    if newOffer < budget * 0.4 then newOffer = math.floor(budget * 0.4) end

    -- Check max rounds (except final_offer which already handled above)
    if not roundOver and round >= maxRounds then
        roundOver = true
        if newOffer >= currentOffer then
            saleComplete = true
            dialogue = "Alright, let's just close the deal."
            emotionState = "satisfied"
            reaction = "deal"
        else
            dialogue = "I've had enough. I'm leaving."
            emotionState = "angry"
            reaction = "walkaway"
        end
    end

    return {
        newOffer     = newOffer,
        reaction     = reaction,
        emotionState = emotionState,
        dialogue     = dialogue,
        roundOver    = roundOver,
        saleComplete = saleComplete,
        maxRounds    = maxRounds,
    }
end)

--- Complete an NPC sale
lib.callback.register("pickle_dealerships:completeNPCSale", function(source, data)
    local dealershipId = data.dealershipId
    local stockId      = data.stockId
    local saleAmount   = data.saleAmount
    local npcProfile   = data.npcProfile

    if not dealershipId or not stockId or not saleAmount then
        return { success = false, message = "Invalid sale data." }
    end

    local dealership = GetDealership(dealershipId)
    if not dealership then
        return { success = false, message = "Dealership not found." }
    end

    local identifier = GetIdentifier(source)
    if not identifier then
        return { success = false, message = "Player identifier not found." }
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
        ShowNotification(source, "You earned " .. GetCurrencyString(commission) .. " commission!")
    end

    -- Satisfaction bonuses
    local tip = 0
    local bonusRep = 0
    if npcProfile then
        local budgetRatio = adjustedAmount / math.max(npcProfile.budget or 1, 1)
        -- If NPC paid close to or above their budget, they're very satisfied
        if budgetRatio >= 0.9 then
            -- Tip: 5-10% of commission
            tip = math.floor(commission * (0.05 + math.random() * 0.05))
            if tip > 0 then
                AddMoney(source, tip, "bank")
                ShowNotification(source, "The customer left a " .. GetCurrencyString(tip) .. " tip!")
            end
            bonusRep = 1
        end
    end

    -- Consume stock if configured
    if Config.NPCCustomers.consumeStock then
        local stock = MySQL.single.await("SELECT quantity FROM dealership_stock WHERE id = ?", { stockId })
        if stock and stock.quantity > 1 then
            MySQL.update("UPDATE dealership_stock SET quantity = quantity - 1 WHERE id = ?", { stockId })
        else
            MySQL.update("UPDATE dealership_stock SET sold_at = NOW(), sold_to = 'NPC', sold_by = ? WHERE id = ?", { identifier, stockId })
        end
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
        tip        = tip,
        message    = "Sale complete! You earned " .. GetCurrencyString(commission) .. " in commission.",
    }
end)
