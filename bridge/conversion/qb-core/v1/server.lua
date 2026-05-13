-- =============================================
--  pickle_dealerships | bridge/conversion/qb-core/v1/server.lua
--  Adapter for qb-core's shared vehicle catalog (shared/vehicles.lua).
--  Reads QBShared.Vehicles at import time so any owner-curated additions
--  in their qb-core fork are honored without us re-parsing the file.
-- =============================================

local function qbTypeToPickleType(t)
    if t == nil then return 'car' end
    t = string.lower(tostring(t))
    if t == 'automobile' or t == 'car' then return 'car' end
    if t == 'boat' then return 'boat' end
    if t == 'helicopter' or t == 'plane' or t == 'heli' then return 'air' end
    return 'car'
end

-- Resolve QBShared.Vehicles. Prefer the global (qb-core publishes it into
-- _G when its shared script runs). Fall back to the GetCoreObject export.
-- Cached for the life of the registry; restart to refresh.
local _vehiclesCache
local _resolved = false
local function resolveQbVehicles()
    if _resolved then return _vehiclesCache end
    _resolved = true
    if GetResourceState('qb-core') ~= 'started' then
        _vehiclesCache = nil
        return nil
    end
    if type(_G.QBShared) == 'table' and type(_G.QBShared.Vehicles) == 'table' then
        _vehiclesCache = _G.QBShared.Vehicles
        return _vehiclesCache
    end
    local ok, core = pcall(function() return exports['qb-core']:GetCoreObject() end)
    if ok and type(core) == 'table' and type(core.Shared) == 'table' and type(core.Shared.Vehicles) == 'table' then
        _vehiclesCache = core.Shared.Vehicles
        return _vehiclesCache
    end
    _vehiclesCache = nil
    return nil
end

--- Normalize one QBShared.Vehicles entry into a flat row keyed by the spawn
--- model. qb-core entries vary: some use `model`, some only have the table key
--- as the model name; price is sometimes a string.
local function normalizeEntry(key, v)
    if type(v) ~= 'table' then return nil end
    local model = tostring(v.model or v.spawncode or key or ''):lower()
    if model == '' then return nil end
    local name = v.name or v.label or model
    local price = tonumber(v.price) or 0
    local category = v.category or v.class or 'sedan'
    local vehType = qbTypeToPickleType(v.type)
    return {
        model = model,
        name = name,
        price = price,
        category = category,
        vehicle_type = vehType,
    }
end

local catalogEntity = {
    label = 'Vehicle Catalog',
    -- Soft gate: if QBShared.Vehicles never resolves, list() returns an empty
    -- table and the UI shows zero rows. The hard gate is the conditional
    -- RegisterConversionAdapter below — we don't register at all without qb-core.
    list = function()
        local vehicles = resolveQbVehicles()
        local out = {}
        if type(vehicles) ~= 'table' then return out end
        for k, v in pairs(vehicles) do
            local row = normalizeEntry(k, v)
            if row then
                out[#out + 1] = {
                    id = row.model,
                    label = row.name .. ' — $' .. row.price,
                    meta = { class = row.category, type = row.vehicle_type, wholesale = row.price },
                }
            end
        end
        table.sort(out, function(a, b) return a.id < b.id end)
        return out
    end,
    import = function(selectedIds, options, _ctx)
        options = options or {}
        local policy = options.conflictPolicy or 'skip'
        local prefix = options.namePrefix or ''
        local res = { inserted = 0, skipped = 0, notFound = {} }
        local vehicles = resolveQbVehicles()
        if type(vehicles) ~= 'table' then
            for _, id in ipairs(selectedIds) do res.notFound[#res.notFound + 1] = id end
            return res
        end
        -- Build a lookup by normalized model so a user picking "adder" still
        -- matches a QBShared entry keyed "Adder".
        local byModel = {}
        for k, v in pairs(vehicles) do
            local row = normalizeEntry(k, v)
            if row then byModel[row.model] = row end
        end
        for _, id in ipairs(selectedIds) do
            local row = byModel[tostring(id):lower()]
            if not row then
                res.notFound[#res.notFound + 1] = id
            else
                local sql = policy == 'overwrite'
                    and "INSERT INTO pickle_wholesale_catalog (model, label, wholesale, tier, class, vehicle_type) VALUES (?, ?, ?, 'basic', ?, ?) ON DUPLICATE KEY UPDATE wholesale = VALUES(wholesale), label = VALUES(label), class = VALUES(class), vehicle_type = VALUES(vehicle_type)"
                    or  "INSERT IGNORE INTO pickle_wholesale_catalog (model, label, wholesale, tier, class, vehicle_type) VALUES (?, ?, ?, 'basic', ?, ?)"
                local affected = MySQL.update.await(sql, {
                    row.model, prefix .. row.name, row.price, row.category, row.vehicle_type,
                })
                if affected and affected > 0 then
                    res.inserted = res.inserted + 1
                    AssignCatalogModelToGroups(row.model, options)
                else
                    res.skipped = res.skipped + 1
                end
            end
        end
        return res
    end,
}

-- Only register when qb-core is actually started. The registry has no
-- adapter-level detect() hook, so this conditional registration is the
-- equivalent: the UI's ListConversionResources() will never see this adapter
-- on non-QBCore servers.
CreateThread(function()
    if GetResourceState('qb-core') ~= 'started' then return end
    if not resolveQbVehicles() then return end
    RegisterConversionAdapter({
        resource = 'qb-core',
        version = 'v1',
        label = 'QBCore (shared/vehicles.lua)',
        resourceLabel = 'QBCore',
        order = { 'catalog' },
        entities = {
            catalog = catalogEntity,
        },
    })
end)
