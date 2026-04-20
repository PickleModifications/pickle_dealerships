-- =============================================
--  pickle_dealerships | bridge/alt_currencies/registry/server.lua
--  Alternative payment currencies (pickle_store coins, item currencies, etc.)
--
--  Each entry exposes a uniform interface so the sales flow can stay agnostic:
--      def = { label, type, valuePerUnit, get(source), remove(source, n), add(source, n) }
-- =============================================

AltCurrencies = AltCurrencies or {}

--- Registers an alt currency. No-ops if inputs are malformed. Safe to call from
--- any bridge file; the last registration wins.
function RegisterAltCurrency(key, def)
    if type(key) ~= "string" or key == "" or type(def) ~= "table" then return end
    if type(def.get) ~= "function" or type(def.remove) ~= "function" then return end
    def.key = key
    def.label = def.label or key
    def.type = def.type or "custom"
    def.valuePerUnit = tonumber(def.valuePerUnit) or 1
    if def.valuePerUnit <= 0 then def.valuePerUnit = 1 end
    AltCurrencies[key] = def
end

function GetAltCurrency(key)
    if not key then return nil end
    return AltCurrencies[key]
end

--- Converts a dollar price into the native amount of this currency, rounded up.
function AltCurrencyNativeAmount(def, dollarPrice)
    if not def then return 0 end
    local per = def.valuePerUnit or 1
    return math.ceil((tonumber(dollarPrice) or 0) / per)
end

--- Returns all registered currencies as [{ key, label, type, valuePerUnit }, ...]
function ListAltCurrencies()
    local out = {}
    for key, def in pairs(AltCurrencies) do
        out[#out + 1] = {
            key = key,
            label = def.label,
            type = def.type,
            valuePerUnit = def.valuePerUnit,
        }
    end
    table.sort(out, function(a, b) return a.key < b.key end)
    return out
end

-- ─── Built-in: pickle_store coins ─────────────────────────────────────────
CreateThread(function()
    Wait(500)
    local cfg = Config.AltCurrencies and Config.AltCurrencies.pickle_store
    if not cfg or not cfg.enabled then return end
    if GetResourceState("pickle_store") ~= "started" then
        print("[pickle_dealerships] AltCurrency 'pickle_store' enabled in config but resource not started.")
        return
    end

    RegisterAltCurrency("pickle_store", {
        label        = cfg.label or "Store Coins",
        type         = "pickle_store",
        valuePerUnit = tonumber(cfg.valuePerUnit) or 1,
        get = function(source)
            local ok, coins = pcall(function() return exports["pickle_store"]:GetCoins(source) end)
            return ok and tonumber(coins) or 0
        end,
        remove = function(source, amount)
            local ok = pcall(function() exports["pickle_store"]:RemoveCoins(source, amount, "pickle_dealerships") end)
            return ok
        end,
        add = function(source, amount)
            pcall(function() exports["pickle_store"]:AddCoins(source, amount, "pickle_dealerships refund") end)
        end,
    })
    print("[pickle_dealerships] Registered alt currency: pickle_store")
end)

-- ─── Built-in: item currencies ────────────────────────────────────────────
CreateThread(function()
    Wait(500)
    if not Config.AltCurrencies then return end

    for key, cfg in pairs(Config.AltCurrencies) do
        if cfg.type == "item" and cfg.enabled and type(cfg.item) == "string" and cfg.item ~= "" then
            local itemName = cfg.item
            RegisterAltCurrency(key, {
                label        = cfg.label or key,
                type         = "item",
                item         = itemName,
                valuePerUnit = tonumber(cfg.valuePerUnit) or 1,
                get = function(source)
                    if Inventory and Inventory.GetItemCount then
                        return tonumber(Inventory.GetItemCount(source, itemName)) or 0
                    end
                    return 0
                end,
                remove = function(source, amount)
                    if Inventory and Inventory.RemoveItem then
                        Inventory.RemoveItem(source, itemName, amount)
                        return true
                    end
                    return false
                end,
                add = function(source, amount)
                    if Inventory and Inventory.AddItem then
                        Inventory.AddItem(source, itemName, amount)
                    end
                end,
            })
            print(("[pickle_dealerships] Registered alt currency: %s (item=%s)"):format(key, itemName))
        end
    end
end)
