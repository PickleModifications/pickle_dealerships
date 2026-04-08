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

-- UI Settings
Config.UI = {
    accentColor = "FF1CA717", -- Hex color for accent/primary UI elements (default: rose)
}
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
Config.DeliveryTime = 1 -- Minutes for timed delivery mode

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
        stockCap = 1000,
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

-- Default dealership settings (applied to all admin-created dealerships)
Config.DealershipDefaults = {
    selfService = false,
    deliveryMode = "timed",
    colorMode = "rgb_wheel",
    acceptedCurrency = "both",
    blip = { sprite = 326, color = 3, scale = 0.8 },
    zoneRadius = 40.0,
}

-- NPC Customer System
Config.NPCCustomers = {
    enabled = true,
    spawnInterval =  {min = 1, max = 3}, -- { min = 300, max = 900 },
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

-- Photo Booth (vehicle catalog photography)
-- Multiple locations can be defined; each can restrict which vehicle classes use it.
-- The first location whose `classes` list contains the vehicle's class is used.
-- A location with no `classes` (or classes = {}) acts as the fallback for anything unmatched.
Config.PhotoBooth = {
    routingBucket = 999,
    locations = {
        {
            label = "Interior Studio",
            coords = vector4(-1508.0502, -2992.9255, -81.2074, 181.9531),
            camRadius = 6.0,
            camHeight = 2.0,
            classes = { "compact", "sedan", "sports", "super", "muscle", "coupe", "suv", "offroad", "van" },
        },
        {
            label = "Ocean View",
            coords = vector4(0.0, 0.0, 1500.0, 0.0),
            camRadius = 10.0,
            camHeight = 3.0,
            classes = { "boat" },
        },
        {
            label = "Airport",
            coords = vector4(-1052.4316, -3505.4155, 14.1398, 329.4947),
            camRadius = 10.0,
            camHeight = 3.0,
            classes = { "plane", "helicopter" },
        },
    },
}
