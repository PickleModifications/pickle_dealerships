Config = {}
Config.Language = "en"
Config.Debug = true
Config.RenderDistance = 100.0
Config.InteractDistance = 2.0
Config.UseTarget = true
Config.Currency = { currency = "USD", countryCode = "en-US" }
Config.ImageDirectory = "nui://ox_inventory/web/images/"
Config.ImageExtension = "png"
Config.XPEnabled = false
Config.IdentifierPrefix = "license2"

Config.AdminGroups = {
    "qbcore.admin",
    "qbcore.god",
    "god",
    "admin",
    "mod",
    "superadmin",
}

Config.TargetIcons = {
    dealership = "fas fa-car",
    management = "fas fa-briefcase",
    sales = "fas fa-handshake",
    employee = "fas fa-id-badge",
    npc_customer = "fas fa-user",
    kiosk = "fas fa-tablet-alt",
}

Config.FrameworkSettings = {
    dirtyMoney = "DEFAULT",
    society = "qb-management",
    usableItemMetadata = function(item, data)
        if type(data) == "table" and data.metadata then return data.metadata end
        if type(item) == "table" and item.metadata then return item.metadata end
        if type(data) == "table" and data.info then return data.info end
        if type(item) == "table" and item.info then return item.info end
    end
}

-- Economy Settings
Config.ImportTax = 0.10
Config.SalesTax = 0.05
Config.DefaultCommission = 0.08
Config.SellbackRate = 0.60

-- Delivery Settings
Config.DeliveryTime = 20 -- Minutes for timed delivery mode

-- Test Drive Settings
Config.TestDriveTime = 120 -- Seconds
Config.TestDriveRadius = 500.0

-- Lot Rent (0 = disabled, otherwise daily cost)
Config.LotRent = 0

-- Financing Settings
Config.FinancingMinDown = 0.30
Config.FinancingInterest = 0.05
Config.FinancingMaxMissed = 3
Config.FinancingPaymentInterval = 24 -- Hours between installments

-- Tier Definitions
Config.Tiers = {
    [1] = {
        label = "Starter Lot",
        stockCap = 5,
        employeeCap = 2,
        displaySpots = 2,
        upgradeCost = 0,
        catalogAccess = "basic",
        features = {},
    },
    [2] = {
        label = "Established",
        stockCap = 10,
        employeeCap = 4,
        displaySpots = 4,
        upgradeCost = 200000,
        catalogAccess = "expanded",
        features = {},
    },
    [3] = {
        label = "Premium",
        stockCap = 20,
        employeeCap = 6,
        displaySpots = 8,
        upgradeCost = 500000,
        catalogAccess = "full",
        features = { "test_drives", "financing", "showroom" },
    },
    [4] = {
        label = "Enterprise",
        stockCap = 35,
        employeeCap = 10,
        displaySpots = 12,
        upgradeCost = 1500000,
        catalogAccess = "exclusive",
        features = { "test_drives", "financing", "showroom", "coupons", "bulk_discount", "multi_trailer" },
    },
}

-- Delivery Routes
Config.DeliveryRoutes = {
    ["short"] = {
        label = "Local Depot",
        distance = "short",
        discount = 0,
        riskLevel = 0,
        pickupCoords = vector4(895.59, -1053.24, 32.83, 180.0),
        dropoffRadius = 50.0,
    },
    ["medium"] = {
        label = "Port of LS",
        distance = "medium",
        discount = 0.05,
        riskLevel = 1,
        pickupCoords = vector4(1214.63, -3233.49, 5.86, 175.0),
        dropoffRadius = 50.0,
    },
    ["long"] = {
        label = "Paleto Import Dock",
        distance = "long",
        discount = 0.10,
        riskLevel = 2,
        pickupCoords = vector4(-204.78, 6528.86, 1.50, 45.0),
        dropoffRadius = 50.0,
    },
}

-- Trailer model for trucking deliveries
Config.TrailerModel = `tr2`
Config.DeliveryTruckModel = `flatbed`

-- Wholesale Vehicle Catalog
Config.WholesaleCatalog = {
    ["car"] = {
        -- Basic tier
        { model = "blista", label = "Blista", wholesale = 8000, tier = "basic", class = "compact" },
        { model = "brioso", label = "Brioso R/A", wholesale = 12000, tier = "basic", class = "compact" },
        { model = "dilettante", label = "Dilettante", wholesale = 6000, tier = "basic", class = "compact" },
        { model = "issi2", label = "Issi", wholesale = 10000, tier = "basic", class = "compact" },
        { model = "prairie", label = "Prairie", wholesale = 9000, tier = "basic", class = "compact" },
        { model = "asea", label = "Asea", wholesale = 5000, tier = "basic", class = "sedan" },
        { model = "emperor", label = "Emperor", wholesale = 4000, tier = "basic", class = "sedan" },
        { model = "fugitive", label = "Fugitive", wholesale = 12000, tier = "basic", class = "sedan" },
        { model = "ingot", label = "Ingot", wholesale = 5500, tier = "basic", class = "sedan" },
        { model = "intruder", label = "Intruder", wholesale = 8000, tier = "basic", class = "sedan" },
        { model = "premier", label = "Premier", wholesale = 7000, tier = "basic", class = "sedan" },
        { model = "stanier", label = "Stanier", wholesale = 6000, tier = "basic", class = "sedan" },
        { model = "stratum", label = "Stratum", wholesale = 7500, tier = "basic", class = "sedan" },
        { model = "sultan", label = "Sultan", wholesale = 15000, tier = "basic", class = "sports" },
        { model = "bison", label = "Bison", wholesale = 18000, tier = "basic", class = "van" },
        { model = "bobcatxl", label = "Bobcat XL", wholesale = 16000, tier = "basic", class = "van" },
        { model = "dominator", label = "Dominator", wholesale = 25000, tier = "basic", class = "muscle" },
        { model = "gauntlet", label = "Gauntlet", wholesale = 22000, tier = "basic", class = "muscle" },
        { model = "ruiner", label = "Ruiner", wholesale = 20000, tier = "basic", class = "muscle" },
        { model = "sabregt", label = "Sabre Turbo", wholesale = 18000, tier = "basic", class = "muscle" },
        { model = "sandking", label = "Sandking", wholesale = 28000, tier = "basic", class = "offroad" },
        { model = "baller", label = "Baller", wholesale = 30000, tier = "basic", class = "suv" },
        { model = "cavalcade", label = "Cavalcade", wholesale = 25000, tier = "basic", class = "suv" },
        { model = "granger", label = "Granger", wholesale = 22000, tier = "basic", class = "suv" },

        -- Expanded tier
        { model = "buffalo", label = "Buffalo", wholesale = 35000, tier = "expanded", class = "sports" },
        { model = "elegy2", label = "Elegy RH8", wholesale = 45000, tier = "expanded", class = "sports" },
        { model = "feltzer2", label = "Feltzer", wholesale = 55000, tier = "expanded", class = "sports" },
        { model = "jester", label = "Jester", wholesale = 65000, tier = "expanded", class = "sports" },
        { model = "massacro", label = "Massacro", wholesale = 60000, tier = "expanded", class = "sports" },
        { model = "rapidgt", label = "Rapid GT", wholesale = 50000, tier = "expanded", class = "sports" },
        { model = "schafter2", label = "Schafter", wholesale = 40000, tier = "expanded", class = "sedan" },
        { model = "tailgater", label = "Tailgater", wholesale = 38000, tier = "expanded", class = "sedan" },
        { model = "exemplar", label = "Exemplar", wholesale = 42000, tier = "expanded", class = "coupe" },
        { model = "felon", label = "Felon", wholesale = 45000, tier = "expanded", class = "coupe" },
        { model = "jackal", label = "Jackal", wholesale = 40000, tier = "expanded", class = "coupe" },
        { model = "oracle", label = "Oracle", wholesale = 35000, tier = "expanded", class = "coupe" },
        { model = "rocoto", label = "Rocoto", wholesale = 48000, tier = "expanded", class = "suv" },
        { model = "xls", label = "XLS", wholesale = 52000, tier = "expanded", class = "suv" },
        { model = "huntley", label = "Huntley S", wholesale = 55000, tier = "expanded", class = "suv" },

        -- Full tier
        { model = "ninef", label = "9F", wholesale = 95000, tier = "full", class = "sports" },
        { model = "comet2", label = "Comet", wholesale = 85000, tier = "full", class = "sports" },
        { model = "coquette", label = "Coquette", wholesale = 100000, tier = "full", class = "sports" },
        { model = "carbonizzare", label = "Carbonizzare", wholesale = 110000, tier = "full", class = "sports" },
        { model = "surano", label = "Surano", wholesale = 90000, tier = "full", class = "sports" },
        { model = "voltic", label = "Voltic", wholesale = 120000, tier = "full", class = "sports" },
        { model = "infernus", label = "Infernus", wholesale = 180000, tier = "full", class = "super" },
        { model = "bullet", label = "Bullet", wholesale = 150000, tier = "full", class = "super" },
        { model = "cheetah", label = "Cheetah", wholesale = 200000, tier = "full", class = "super" },
        { model = "entityxf", label = "Entity XF", wholesale = 250000, tier = "full", class = "super" },
        { model = "vacca", label = "Vacca", wholesale = 170000, tier = "full", class = "super" },
        { model = "turismor", label = "Turismo R", wholesale = 220000, tier = "full", class = "super" },

        -- Exclusive tier
        { model = "zentorno", label = "Zentorno", wholesale = 350000, tier = "exclusive", class = "super" },
        { model = "t20", label = "T20", wholesale = 500000, tier = "exclusive", class = "super" },
        { model = "osiris", label = "Osiris", wholesale = 450000, tier = "exclusive", class = "super" },
        { model = "entity2", label = "Entity XXR", wholesale = 1500000, tier = "exclusive", class = "super" },
        { model = "emerus", label = "Emerus", wholesale = 1200000, tier = "exclusive", class = "super" },
        { model = "krieger", label = "Krieger", wholesale = 1400000, tier = "exclusive", class = "super" },
        { model = "thrax", label = "Thrax", wholesale = 1100000, tier = "exclusive", class = "super" },
        { model = "furia", label = "Furia", wholesale = 1300000, tier = "exclusive", class = "super" },
    },
    ["boat"] = {
        { model = "dinghy", label = "Dinghy", wholesale = 15000, tier = "basic", class = "boat" },
        { model = "jetmax", label = "Jetmax", wholesale = 50000, tier = "expanded", class = "boat" },
        { model = "marquis", label = "Marquis", wholesale = 80000, tier = "expanded", class = "boat" },
        { model = "speeder", label = "Speeder", wholesale = 120000, tier = "full", class = "boat" },
        { model = "squalo", label = "Squalo", wholesale = 90000, tier = "full", class = "boat" },
        { model = "toro", label = "Toro", wholesale = 200000, tier = "exclusive", class = "boat" },
    },
    ["air"] = {
        { model = "dodo", label = "Dodo", wholesale = 100000, tier = "expanded", class = "plane" },
        { model = "mammatus", label = "Mammatus", wholesale = 150000, tier = "expanded", class = "plane" },
        { model = "cuban800", label = "Cuban 800", wholesale = 80000, tier = "basic", class = "plane" },
        { model = "duster", label = "Duster", wholesale = 60000, tier = "basic", class = "plane" },
        { model = "velum", label = "Velum", wholesale = 200000, tier = "full", class = "plane" },
        { model = "luxor", label = "Luxor", wholesale = 800000, tier = "exclusive", class = "plane" },
        { model = "buzzard2", label = "Buzzard", wholesale = 500000, tier = "full", class = "helicopter" },
        { model = "frogger", label = "Frogger", wholesale = 350000, tier = "full", class = "helicopter" },
        { model = "maverick", label = "Maverick", wholesale = 300000, tier = "expanded", class = "helicopter" },
        { model = "swift", label = "Swift", wholesale = 900000, tier = "exclusive", class = "helicopter" },
        { model = "volatus", label = "Volatus", wholesale = 1200000, tier = "exclusive", class = "helicopter" },
    },
}

-- Vehicle class labels for UI display
Config.VehicleClasses = {
    compact = "Compact",
    sedan = "Sedan",
    sports = "Sports",
    super = "Super",
    muscle = "Muscle",
    coupe = "Coupe",
    suv = "SUV",
    offroad = "Off-Road",
    van = "Van",
    boat = "Boat",
    plane = "Plane",
    helicopter = "Helicopter",
}

-- Color mode options for dealerships
Config.ColorModes = {
    rgb_wheel = "Full RGB Color Wheel",
    rgb_palette = "Curated RGB Palette",
    color_ids = "GTA Color IDs",
}

-- Default RGB palette (used when colorMode = 'rgb_palette')
Config.DefaultColorPalette = {
    { label = "Midnight Black", r = 10, g = 10, b = 10 },
    { label = "Arctic White", r = 252, g = 252, b = 252 },
    { label = "Racing Red", r = 192, g = 14, b = 26 },
    { label = "Electric Blue", r = 30, g = 80, b = 190 },
    { label = "Forest Green", r = 20, g = 100, b = 36 },
    { label = "Sunset Orange", r = 230, g = 100, b = 20 },
    { label = "Royal Purple", r = 80, g = 20, b = 140 },
    { label = "Silver Metallic", r = 180, g = 185, b = 190 },
    { label = "Gold", r = 200, g = 170, b = 50 },
    { label = "Matte Gray", r = 100, g = 100, b = 100 },
    { label = "Navy Blue", r = 15, g = 25, b = 80 },
    { label = "Wine Red", r = 100, g = 10, b = 20 },
}

-- Dealership Locations
Config.Dealerships = {
    ["pdm"] = {
        label = "Premium Deluxe Motorsport",
        mode = "public",
        type = "car",
        purchasePrice = 750000,
        selfService = true,
        deliveryMode = "timed",
        colorMode = "rgb_wheel",
        colorPalette = nil,
        acceptedCurrency = "both",
        customCurrency = nil,
        blip = { sprite = 326, color = 3, scale = 0.8 },
        coords = vector3(-56.49, -1096.42, 26.42),
        heading = 290.0,
        spawnPoint = vector4(-44.46, -1082.97, 26.68, 70.0),
        zones = {
            { coords = vector3(-56.49, -1096.42, 26.42), radius = 40.0 },
        },
        displaySpots = {
            vector4(-49.43, -1098.44, 26.42, 66.0),
            vector4(-46.01, -1092.51, 26.42, 66.0),
            vector4(-50.69, -1088.15, 26.42, 156.0),
            vector4(-57.35, -1089.97, 26.42, 156.0),
            vector4(-61.63, -1092.68, 26.42, 246.0),
            vector4(-59.72, -1098.80, 26.42, 246.0),
        },
        interactionPoints = {
            management = vector4(-33.22, -1102.38, 26.42, 250.0),
            sales = vector4(-56.49, -1096.42, 26.42, 290.0),
            kiosk = vector4(-45.67, -1095.01, 26.42, 70.0),
        },
        npcSpawnPoints = {
            vector4(-38.60, -1104.27, 26.42, 70.0),
            vector4(-43.15, -1107.45, 26.42, 340.0),
        },
    },
    ["luxury_autos"] = {
        label = "Luxury Autos",
        mode = "player-owned",
        type = "car",
        purchasePrice = 500000,
        selfService = false,
        deliveryMode = "trucking",
        colorMode = "rgb_palette",
        colorPalette = nil,
        acceptedCurrency = "bank",
        customCurrency = nil,
        blip = { sprite = 326, color = 5, scale = 0.8 },
        coords = vector3(-1260.09, -349.04, 36.69),
        heading = 207.0,
        spawnPoint = vector4(-1253.45, -360.14, 36.69, 207.0),
        zones = {
            { coords = vector3(-1260.09, -349.04, 36.69), radius = 35.0 },
        },
        displaySpots = {
            vector4(-1261.87, -353.94, 36.69, 207.0),
            vector4(-1256.92, -355.60, 36.69, 207.0),
            vector4(-1265.63, -347.59, 36.69, 117.0),
            vector4(-1264.04, -342.18, 36.69, 117.0),
        },
        interactionPoints = {
            management = vector4(-1268.92, -354.64, 36.69, 297.0),
            sales = vector4(-1260.09, -349.04, 36.69, 207.0),
        },
        npcSpawnPoints = {
            vector4(-1251.52, -348.69, 36.69, 207.0),
            vector4(-1255.83, -344.11, 36.69, 117.0),
        },
    },
    ["paleto_boats"] = {
        label = "Paleto Bay Marine",
        mode = "player-owned",
        type = "boat",
        purchasePrice = 300000,
        selfService = false,
        deliveryMode = "timed",
        colorMode = "color_ids",
        colorPalette = nil,
        acceptedCurrency = "both",
        customCurrency = nil,
        blip = { sprite = 410, color = 26, scale = 0.8 },
        coords = vector3(-807.33, -1496.82, 1.60),
        heading = 110.0,
        spawnPoint = vector4(-808.76, -1502.48, -0.47, 110.0),
        zones = {
            { coords = vector3(-807.33, -1496.82, 1.60), radius = 30.0 },
        },
        displaySpots = {
            vector4(-804.09, -1498.89, -0.47, 110.0),
            vector4(-810.67, -1491.21, -0.47, 110.0),
        },
        interactionPoints = {
            management = vector4(-803.93, -1493.27, 1.60, 200.0),
            sales = vector4(-807.33, -1496.82, 1.60, 110.0),
        },
        npcSpawnPoints = {
            vector4(-800.40, -1495.31, 1.60, 290.0),
        },
    },
    ["lsia_air"] = {
        label = "LSIA Aircraft Sales",
        mode = "player-owned",
        type = "air",
        purchasePrice = 1000000,
        selfService = false,
        deliveryMode = "timed",
        colorMode = "color_ids",
        colorPalette = nil,
        acceptedCurrency = "bank",
        customCurrency = nil,
        blip = { sprite = 307, color = 1, scale = 0.8 },
        coords = vector3(-1642.37, -3143.98, 13.99),
        heading = 330.0,
        spawnPoint = vector4(-1639.96, -3152.69, 13.99, 330.0),
        zones = {
            { coords = vector3(-1642.37, -3143.98, 13.99), radius = 45.0 },
        },
        displaySpots = {
            vector4(-1648.45, -3140.19, 13.99, 330.0),
            vector4(-1636.21, -3137.49, 13.99, 330.0),
        },
        interactionPoints = {
            management = vector4(-1643.89, -3149.26, 13.99, 240.0),
            sales = vector4(-1642.37, -3143.98, 13.99, 330.0),
        },
        npcSpawnPoints = {
            vector4(-1638.52, -3147.85, 13.99, 150.0),
        },
    },
}

-- NPC Customer System
Config.NPCCustomers = {
    enabled = true,
    spawnInterval = { min = 300, max = 900 },
    maxConcurrent = 3,
    patienceTime = { min = 60, max = 120 },
    maxPresentations = 3,
    maxNegotiationRounds = 5,
    consumeStock = true,
    businessHours = nil,
    xpPerSale = 15,
    reputationPerSale = 1,
    walkAwayPenalty = -1,
    npcSaleMultiplier = 0.75,

    tierBudgetMultiplier = {
        [1] = 1.0,
        [2] = 1.2,
        [3] = 1.5,
        [4] = 2.0,
    },

    budgetTiers = {
        { label = "Budget", min = 5000, max = 25000, weight = 40 },
        { label = "Mid-Range", min = 25000, max = 100000, weight = 30 },
        { label = "Premium", min = 100000, max = 500000, weight = 20 },
        { label = "Luxury", min = 500000, max = 2000000, weight = 10 },
    },

    personalityWeights = {
        haggler = 25,
        impulse_buyer = 20,
        researcher = 25,
        skeptic = 20,
        walkaway = 10,
    },

    typePreferences = {
        sports = 20, sedan = 25, suv = 20, truck = 10,
        muscle = 10, offroad = 5, coupe = 10,
    },

    flexibilityRange = { min = 0.3, max = 1.0 },

    pedModels = {
        budget = {
            "a_m_y_skater_01", "a_f_y_hipster_01", "a_m_y_hipster_01",
            "a_f_y_tourist_01", "a_m_y_genstreet_01", "a_f_y_genhot_01",
        },
        midrange = {
            "a_m_y_business_01", "a_f_y_business_01", "a_m_y_business_02",
            "a_f_y_business_02", "a_m_y_scdressy_01", "a_f_y_scdressy_01",
        },
        premium = {
            "a_m_y_bevhills_01", "a_f_y_bevhills_01", "a_m_y_bevhills_02",
            "a_f_y_bevhills_02", "a_m_m_bevhills_01", "a_f_m_bevhills_01",
        },
        luxury = {
            "a_m_m_bevhills_02", "a_f_y_bevhills_04", "a_m_y_clubcust_01",
            "a_f_m_bevhills_02", "ig_bankman", "ig_car3guy1",
        },
    },

    greetings = {
        sports = {
            "I'm looking for something fast. Something that really moves, you know?",
            "Need a car that turns heads on the highway. Speed is everything.",
            "My buddy just got a sports car and I can't let him show me up.",
        },
        sedan = {
            "I need something reliable. Good on gas, comfortable ride.",
            "Looking for a family car, nothing too flashy.",
            "Just need something practical to get to work and back.",
        },
        suv = {
            "I need something with space. Got a big family, you know?",
            "Looking for an SUV, something that handles well on rough roads.",
            "Want something big and safe. Safety is my priority.",
        },
        muscle = {
            "I want something with raw power. American muscle, baby.",
            "Looking for something loud. I want people to hear me coming.",
            "Need a car with some real grunt under the hood.",
        },
        super = {
            "Money's not really an object. Show me the best you've got.",
            "I want the fastest car on your lot. Period.",
            "Looking for something exclusive. Something nobody else has.",
        },
        default = {
            "Hey, I'm looking to buy a vehicle today.",
            "Hi there! What do you have available?",
            "I'm in the market for something new. What can you show me?",
        },
    },

    reactions = {
        great = {
            "Now THAT'S what I'm talking about! This is perfect!",
            "Oh wow, this is exactly what I had in mind!",
            "Yes! This is the one. Let's talk numbers.",
        },
        good = {
            "Hmm, not exactly what I had in mind, but I could see it...",
            "It's nice. Not perfect, but I'm interested.",
            "Okay, this has potential. What's the price?",
        },
        poor = {
            "That's... not really my style.",
            "Ehh, I was hoping for something different.",
            "I don't know about this one. Got anything else?",
        },
        terrible = {
            "Are you serious? That's not even close to what I asked for.",
            "No. Just... no. Were you even listening?",
            "Come on, I told you what I wanted. This isn't it.",
        },
    },

    negotiation = {
        stand_firm = {
            success = { "Alright, I guess that's fair.", "Fine, you drive a hard bargain." },
            fail = { "That's too high. Come on, work with me here.", "I can find a better deal elsewhere." },
        },
        concession = {
            success = { "Now we're getting somewhere!", "That's more like it. I appreciate you working with me." },
            fail = { "Still too much. Can you do better?", "Getting closer, but not there yet." },
        },
        highlight_features = {
            success = { "You know what, you're right. It is worth it.", "I didn't think about it that way. Good point." },
            fail = { "Yeah, but that doesn't justify the price.", "Features are nice, but the price has to be right." },
        },
        urgency = {
            success = { "Wait, someone else is looking at it? Okay, let's do this.", "I don't want to miss out. Let's close this deal." },
            fail = { "Nice try, but I'm not falling for that.", "I'll take my chances. Drop the price." },
        },
        sweeten = {
            success = { "Oh, that's a nice touch! Okay, I'm in.", "With that thrown in? Deal." },
            fail = { "That's nice but it doesn't change the price issue.", "A freebie doesn't make up for the markup." },
        },
        match_need = {
            success = { "You actually listened! That means a lot. Let's do it.", "You're right, this does match what I need. I'll take it." },
            fail = { "Close, but not quite what I meant.", "I appreciate the effort, but the price still needs work." },
        },
        final_offer = {
            accept = { "Fine, you got yourself a deal.", "Alright, final answer: I'll take it." },
            reject = { "No deal. I'm walking.", "Sorry, that's still too much. I'm out." },
        },
    },
}

-- Webhook Configuration
Config.Webhooks = {
    enabled = false,
    url = "",
    botName = "Dealership Logs",
    events = {
        sales = true,
        stock_orders = true,
        ownership_changes = true,
        large_withdrawals = true,
        employee_changes = true,
    },
    largeWithdrawalThreshold = 100000,
}
