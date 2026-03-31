Templates = {}

function lerp(a, b, t) return a + (b-a) * t end

function v3(coords) return vec3(coords.x, coords.y, coords.z), coords.w end

function GetRandomInt(min, max, exclude)
    for i=1, 1000 do
        local int = math.random(min, max)
        if exclude == nil or exclude ~= int then
            return int
        end
    end
end

function debugPrint(...)
    if Config.Debug then
        print(...)
    end
end

function NumberWithCommas(x, noCurrency)
    local left, num, right = string.match(x, '^([^%d]*%d)(%d*)(.-)$')
    return (not noCurrency and "$" or "") .. left..(num:reverse():gsub('(%d%d%d)','%1,'):reverse())
end

function tolower(str)
    return string.lower(str)
end

function toupper(str)
    return string.upper(str)
end

function GetItemLabel(name)
    if Inventory and Inventory.Items and Inventory.Items[name] then
        return Inventory.Items[name].label
    elseif Inventory and Inventory.Items and Inventory.Items[toupper(name)] then
        return Inventory.Items[toupper(name)].label
    end
    return name
end

function GetCurrencyString(amount)
    return NumberWithCommas(amount)
end

function GeneratePlate()
    local letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    local plate = ""
    for i = 1, 3 do
        local idx = math.random(1, #letters)
        plate = plate .. letters:sub(idx, idx)
    end
    plate = plate .. " "
    for i = 1, 3 do
        plate = plate .. tostring(math.random(0, 9))
    end
    return plate
end

function HasTierFeature(tier, feature)
    local tierData = Config.Tiers[tier]
    if not tierData or not tierData.features then return false end
    for _, f in ipairs(tierData.features) do
        if f == feature then return true end
    end
    return false
end

function CanAccessCatalogTier(dealershipTier, vehicleTier)
    local accessLevel = Config.Tiers[dealershipTier] and Config.Tiers[dealershipTier].catalogAccess or "basic"
    local hierarchy = { basic = 1, expanded = 2, full = 3, exclusive = 4 }
    local vehicleLevel = hierarchy[vehicleTier] or 1
    local accessLevelNum = hierarchy[accessLevel] or 1
    return accessLevelNum >= vehicleLevel
end

function GetCatalogForDealership(dealershipType, dealershipTier)
    local catalog = {}
    local types = {}
    if dealershipType == "mixed" then
        types = { "car", "boat", "air" }
    else
        types = { dealershipType }
    end
    for _, vtype in ipairs(types) do
        local vehicles = Config.WholesaleCatalog[vtype]
        if vehicles then
            for _, vehicle in ipairs(vehicles) do
                if CanAccessCatalogTier(dealershipTier, vehicle.tier) then
                    local entry = {}
                    for k, v in pairs(vehicle) do entry[k] = v end
                    entry.vehicleType = vtype
                    catalog[#catalog + 1] = entry
                end
            end
        end
    end
    return catalog
end

function WeightedRandom(weights)
    local total = 0
    for _, w in pairs(weights) do total = total + w end
    local roll = math.random() * total
    local cumulative = 0
    for key, w in pairs(weights) do
        cumulative = cumulative + w
        if roll <= cumulative then return key end
    end
    local last
    for key in pairs(weights) do last = key end
    return last
end
