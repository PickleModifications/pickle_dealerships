---@param dealershipId number
---@return table npcProfile
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

    -- Determine budget range based on tier
    local budgetRanges = {
        economy  = { min = 5000,   max = 25000  },
        midrange = { min = 20000,  max = 60000  },
        premium  = { min = 50000,  max = 150000 },
        luxury   = { min = 120000, max = 500000 },
    }
    local range = budgetRanges[budgetTier] or budgetRanges["economy"]
    local budget = math.random(range.min, range.max)

    -- Patience time based on personality
    local patienceTimes = {
        impatient  = math.random(30, 60),
        easygoing  = math.random(90, 180),
        aggressive = math.random(45, 90),
        shy        = math.random(60, 120),
        savvy      = math.random(60, 100),
    }
    local patienceTime = patienceTimes[personality] or math.random(60, 120)

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
    }

    return profile
end

---Generate NPC customer profile
lib.callback.register("pickle_dealerships:generateNPCCustomer", function(source, dealershipId)
    local profile = GenerateNPCProfile(dealershipId)
    if not profile then
        return nil
    end
    return profile
end)

---Evaluate how well a vehicle matches an NPC's preferences
lib.callback.register("pickle_dealerships:evaluateVehicleMatch", function(source, data)
    local profile = data.npcProfile
    local stockItem = data.stockItem
    if not profile or not stockItem then
        return { quality = "terrible", score = 0 }
    end

    local score = 0
    local maxScore = 0

    -- Type match (worth 30 points)
    maxScore = maxScore + 30
    if stockItem.vehicleType and profile.typePreference then
        if stockItem.vehicleType == profile.typePreference then
            score = score + 30
        elseif stockItem.vehicleType ~= profile.typePreference then
            score = score + 5
        end
    end

    -- Budget fit (worth 40 points)
    maxScore = maxScore + 40
    local price = stockItem.price or 0
    local budget = profile.budget or 0
    if price <= budget then
        local ratio = price / math.max(budget, 1)
        if ratio >= 0.7 and ratio <= 1.0 then
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
        else
            score = score + 0
        end
    end

    -- Color match (worth 15 points)
    maxScore = maxScore + 15
    if profile.colorPreference then
        if stockItem.color and toupper(stockItem.color) == toupper(profile.colorPreference) then
            score = score + 15
        else
            score = score + 5
        end
    else
        score = score + 10
    end

    -- Priority stat bonus (worth 15 points)
    maxScore = maxScore + 15
    if profile.priorityStat == "price" and price <= budget * 0.8 then
        score = score + 15
    elseif profile.priorityStat == "speed" and stockItem.topSpeed and stockItem.topSpeed > 150 then
        score = score + 15
    elseif profile.priorityStat == "style" and (profile.budgetTier == "premium" or profile.budgetTier == "luxury") then
        score = score + 10
    elseif profile.priorityStat == "practicality" and (stockItem.vehicleType == "suv" or stockItem.vehicleType == "sedan") then
        score = score + 15
    else
        score = score + 5
    end

    local pct = score / math.max(maxScore, 1)
    local quality
    if pct >= 0.75 then
        quality = "great"
    elseif pct >= 0.50 then
        quality = "good"
    elseif pct >= 0.30 then
        quality = "poor"
    else
        quality = "terrible"
    end

    -- Generate reaction dialogue
    local dialogues = {
        great    = { "Oh wow, this is exactly what I was looking for!", "Now we're talking! I love this one.", "This is perfect, let's talk numbers." },
        good     = { "Hmm, not bad. I could see myself in this.", "It's decent, what kind of deal can you give me?", "I like it, but let's see if the price is right." },
        poor     = { "Eh, it's not really what I had in mind...", "I don't know about this one.", "Not my first choice, but I'll hear you out." },
        terrible = { "No way, this isn't for me at all.", "You're joking, right?", "I'd rather walk than drive this." },
    }
    local pool = dialogues[quality]
    local dialogue = pool[math.random(#pool)]

    return { quality = quality, score = score, dialogue = dialogue }
end)

---Process a negotiation round
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

    -- Tactic effectiveness vs personality
    local tacticEffectiveness = {
        friendly = {
            easygoing  = 0.8,
            shy        = 0.7,
            aggressive = 0.3,
            impatient  = 0.5,
            savvy      = 0.5,
        },
        pressure = {
            easygoing  = 0.4,
            shy        = 0.6,
            aggressive = 0.2,
            impatient  = 0.7,
            savvy      = 0.3,
        },
        logical = {
            easygoing  = 0.5,
            shy        = 0.5,
            aggressive = 0.4,
            impatient  = 0.4,
            savvy      = 0.8,
        },
        emotional = {
            easygoing  = 0.6,
            shy        = 0.8,
            aggressive = 0.3,
            impatient  = 0.3,
            savvy      = 0.4,
        },
        discount = {
            easygoing  = 0.5,
            shy        = 0.5,
            aggressive = 0.6,
            impatient  = 0.6,
            savvy      = 0.7,
        },
    }

    local effectiveness = 0.5
    if tacticEffectiveness[tactic] and tacticEffectiveness[tactic][personality] then
        effectiveness = tacticEffectiveness[tactic][personality]
    end

    -- Roll for success
    local roll = math.random()
    local success = roll <= effectiveness

    local newOffer = currentOffer
    local reaction, emotionState, dialogue
    local roundOver = false
    local saleComplete = false

    -- Max budget the NPC will ever pay (budget + flexibility margin)
    local maxWillPay = budget * (1 + flexibility)

    if success then
        -- NPC moves offer up toward asking price
        local bump = currentOffer * (0.02 + math.random() * 0.06)
        newOffer = math.floor(currentOffer + bump)
        reaction = "positive"
        emotionState = "happy"

        local positiveDialogues = {
            "Alright, you've got a point. I can go a bit higher.",
            "Fair enough, let me reconsider.",
            "You make a good case. How about this?",
            "Okay okay, I'll bump my offer.",
        }
        dialogue = positiveDialogues[math.random(#positiveDialogues)]
    else
        -- NPC holds firm or lowers offer slightly
        local drop = currentOffer * (0.01 + math.random() * 0.03)
        newOffer = math.floor(currentOffer - drop)
        reaction = "negative"
        emotionState = "annoyed"

        local negativeDialogues = {
            "That's not gonna work for me.",
            "I'm not feeling it. My offer stands.",
            "You'll have to do better than that.",
            "Nah, I'm going lower after that pitch.",
        }
        dialogue = negativeDialogues[math.random(#negativeDialogues)]
    end

    -- Clamp offer
    if newOffer > maxWillPay then
        newOffer = math.floor(maxWillPay)
    end
    if newOffer < budget * 0.5 then
        newOffer = math.floor(budget * 0.5)
    end

    -- Check if NPC walks away (too many rounds or too frustrated)
    local maxRounds = 5
    if personality == "impatient" then maxRounds = 3 end
    if personality == "easygoing" then maxRounds = 7 end

    if round >= maxRounds then
        roundOver = true
        if newOffer >= currentOffer then
            saleComplete = true
            dialogue = "Alright, you've got yourself a deal. Let's wrap this up."
            emotionState = "happy"
            reaction = "deal"
        else
            dialogue = "I've had enough. I'm walking away."
            emotionState = "angry"
            reaction = "walkaway"
        end
    end

    return {
        newOffer    = newOffer,
        reaction    = reaction,
        emotionState = emotionState,
        dialogue    = dialogue,
        roundOver   = roundOver,
        saleComplete = saleComplete,
    }
end)

---Complete an NPC sale
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

    local role = GetPlayerDealershipRole(source, dealershipId)
    if not role then
        return { success = false, message = "You do not work at this dealership." }
    end

    -- Apply NPC sale multiplier
    local multiplier = Config.NPCCustomers.npcSaleMultiplier or 1.0
    local adjustedAmount = math.floor(saleAmount * multiplier)

    -- Add to dealership balance
    local newBalance = (dealership.balance or 0) + adjustedAmount
    MySQL.update("UPDATE dealerships SET balance = ? WHERE id = ?", { newBalance, dealershipId })
    UpdateDealershipCache(dealershipId, { balance = newBalance })

    -- Calculate and pay commission
    local commissionRate = Config.NPCCustomers.commissionRate or 0.10
    local commission = math.floor(adjustedAmount * commissionRate)
    if commission > 0 then
        AddMoney(source, "bank", commission)
        ShowNotification(source, "You earned " .. GetCurrencyString(commission) .. " commission!")
    end

    -- Consume stock if configured
    if Config.NPCCustomers.consumeStock then
        MySQL.update("DELETE FROM dealership_stock WHERE id = ?", { stockId })
    end

    -- Add XP if pickle_xp is available
    if GetResourceState("pickle_xp") == "started" then
        local xpAmount = Config.NPCCustomers.xpReward or 50
        exports["pickle_xp"]:AddPlayerXP(source, xpAmount)
    end

    -- Update dealership reputation
    local repGain = Config.NPCCustomers.reputationGain or 1
    local newRep = (dealership.reputation or 0) + repGain
    MySQL.update("UPDATE dealerships SET reputation = ? WHERE id = ?", { newRep, dealershipId })
    UpdateDealershipCache(dealershipId, { reputation = newRep })

    -- Add ledger entry
    local playerName = GetPlayerCharacterName(source) or "Unknown"
    AddLedgerEntry(dealershipId, "npc_sale", adjustedAmount, "NPC sale by " .. playerName .. " (Commission: " .. GetCurrencyString(commission) .. ")", identifier)

    -- Record sale in sales table
    MySQL.insert("INSERT INTO dealership_sales (dealership_id, seller_id, stock_id, sale_price, sale_type, created_at) VALUES (?, ?, ?, ?, 'npc', NOW())", {
        dealershipId, identifier, stockId, adjustedAmount
    })

    return {
        success    = true,
        saleAmount = adjustedAmount,
        commission = commission,
        message    = "Sale complete! You earned " .. GetCurrencyString(commission) .. " in commission.",
    }
end)
