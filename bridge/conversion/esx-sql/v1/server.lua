-- =============================================
--  pickle_dealerships | bridge/conversion/esx-sql/v1/server.lua
--  Adapter for ESX legacy/old's `vehicles` table (name, model, price, category).
--  Pure SQL — works without ESX being running, as long as the table exists in
--  the active schema.
-- =============================================

local catalogEntity = {
    label = 'Vehicle Catalog',
    -- Entity-level availability is gated by the registry's `requires` check
    -- against information_schema. If `vehicles` is absent the UI marks this
    -- entity unavailable; combined with the conditional registration below
    -- it means servers without ESX's table never see this option.
    requires = { 'vehicles' },
    list = function()
        local rows = MySQL.query.await("SELECT name, model, price, category FROM vehicles") or {}
        local out = {}
        for _, r in ipairs(rows) do
            local model = r.model and tostring(r.model) or ''
            if model ~= '' then
                -- ESX's `price` is the sticker players pay; back-derive wholesale
                -- so pickle's ×1.3 markup reproduces it on seed/order.
                local price = tonumber(r.price) or 0
                local wholesale = price > 0 and math.max(1, math.floor(price / 1.3)) or 0
                out[#out + 1] = {
                    id = model,
                    label = (r.name or model) .. ' — $' .. price,
                    meta = { class = r.category, type = 'car', wholesale = wholesale },
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
        -- Single round-trip is cheaper than per-id SELECTs when the user
        -- imports the full catalog.
        local rows = MySQL.query.await("SELECT name, model, price, category FROM vehicles") or {}
        local byModel = {}
        for _, r in ipairs(rows) do
            local model = r.model and tostring(r.model) or ''
            if model ~= '' then byModel[model] = r end
        end
        for _, id in ipairs(selectedIds) do
            local r = byModel[tostring(id)]
            if not r then
                res.notFound[#res.notFound + 1] = id
            else
                local sql = policy == 'overwrite'
                    and "INSERT INTO pickle_wholesale_catalog (model, label, wholesale, tier, class, vehicle_type) VALUES (?, ?, ?, 'basic', ?, ?) ON DUPLICATE KEY UPDATE wholesale = VALUES(wholesale), label = VALUES(label), class = VALUES(class), vehicle_type = VALUES(vehicle_type)"
                    or  "INSERT IGNORE INTO pickle_wholesale_catalog (model, label, wholesale, tier, class, vehicle_type) VALUES (?, ?, ?, 'basic', ?, ?)"
                -- Back-derive wholesale from ESX's sticker `price` so pickle's
                -- ×1.3 markup reproduces the original listing on seed/order.
                local price = tonumber(r.price) or 0
                local wholesale = price > 0 and math.max(1, math.floor(price / 1.3)) or 0
                local affected = MySQL.update.await(sql, {
                    tostring(r.model),
                    prefix .. (r.name or tostring(r.model)),
                    wholesale,
                    r.category or 'sedan',
                    'car',
                })
                if affected and affected > 0 then
                    res.inserted = res.inserted + 1
                    AssignCatalogModelToGroups(tostring(r.model), options)
                else
                    res.skipped = res.skipped + 1
                end
            end
        end
        return res
    end,
}

-- Register the adapter only when the source table is actually present, so
-- non-ESX servers don't see it in the import dropdown. The entity's
-- `requires` field still gates re-availability if the table later disappears.
CreateThread(function()
    if not ConversionTableExists('vehicles') then return end
    RegisterConversionAdapter({
        resource = 'esx-sql',
        version = 'v1',
        label = 'ESX (legacy/old vehicles table)',
        resourceLabel = 'ESX SQL',
        order = { 'catalog' },
        entities = {
            catalog = catalogEntity,
        },
    })
end)
