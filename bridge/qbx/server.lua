if GetResourceState('qbx_core') ~= 'started' then return end

-- QBX Core bridge. QBX differs from QBCore in key ways:
--   • No GetCoreObject — everything is accessed via exports.qbx_core directly.
--   • Player state is in `Player.PlayerData` (same shape) but setters are exports.
--   • Shared data (jobs/items) via exports.qbx_core:GetSharedJobs() / GetSharedItems().
--   • Money / job setters are first-class exports, not `Player.Functions.*`.
--   • Inventory is ox_inventory-first; fallback only covers bare setups.

local function GetPlayer(source)
    return exports.qbx_core:GetPlayer(tonumber(source))
end

function RegisterUsableItem(item, cb)
    exports.qbx_core:CreateUseableItem(item, cb)
end

function ShowNotification(target, text)
    TriggerClientEvent(GetCurrentResourceName()..":showNotification", target, text)
end

function GetIdentifier(source)
    local player = GetPlayer(source)
    return player and player.PlayerData and player.PlayerData.citizenid or nil
end

function GetSourceFromIdentifier(identifier)
    local player = exports.qbx_core:GetPlayerByCitizenId(identifier)
    return player and player.PlayerData and player.PlayerData.source or nil
end

function GetPlayerCharacterName(source)
    local player = GetPlayer(source)
    if not player or not player.PlayerData then return "Unknown Name" end
    local info = player.PlayerData.charinfo or {}
    return (info.firstname or "Unknown") .. " " .. (info.lastname or "")
end

function GetEmployees(jobName, cb)
    local employees = {}
    local sources = exports.qbx_core:GetPlayersOfJob(jobName) or {}
    for _, src in ipairs(sources) do
        local player = GetPlayer(src)
        if player and player.PlayerData then
            local info = player.PlayerData.charinfo or {}
            employees[#employees + 1] = {
                source = src,
                name = (info.firstname or "Unknown") .. " " .. (info.lastname or ""),
                grade = player.PlayerData.job.grade.level,
                gradeLabel = player.PlayerData.job.grade.name,
                online = true,
            }
        end
    end
    if type(cb) == "function" then cb(employees) end
    return employees
end

function GetJobGrades(jobName)
    local jobs = exports.qbx_core:GetSharedJobs() or {}
    local job = jobs[jobName]
    if not job or not job.grades then return {} end
    local grades = {}
    for level, grade in pairs(job.grades) do
        grades[#grades + 1] = {
            level = tonumber(level),
            label = grade.name or ("Grade " .. level),
        }
    end
    table.sort(grades, function(a, b) return a.level < b.level end)
    return grades
end

function CanAccessGroup(source, data)
    if not data then return true end
    local player = GetPlayer(source)
    if not player or not player.PlayerData then return false end
    local job = player.PlayerData.job
    for k, v in pairs(data) do
        if job.name == k and job.grade.level >= v then return true end
    end
    return false
end

function CheckPermission(source, permission)
    if permission.ignorePermissions then return true end
    source = tonumber(source)
    local player = GetPlayer(source)
    if not player or not player.PlayerData then return end
    local name = player.PlayerData.job.name
    local rank = player.PlayerData.job.grade.level
    if permission.jobs[name] and permission.jobs[name] <= rank then
        return true
    end
    for i = 1, #(permission.groups or {}) do
        if exports.qbx_core:HasPermission(source, permission.groups[i]) then
            return true
        end
    end
end

function AddMoney(source, count, currency)
    source = tonumber(source)
    currency = currency or "money"
    if currency == "money" then
        exports.qbx_core:AddMoney(source, 'cash', count, 'pickle_dealerships')
    elseif currency == "bank" then
        exports.qbx_core:AddMoney(source, 'bank', count, 'pickle_dealerships')
    elseif currency == "dirty" then
        local setting = Config.FrameworkSettings.dirtyMoney
        Inventory.AddItem(source, setting == "DEFAULT" and 'dirty_money' or setting, count)
    end
    return true
end

function RemoveMoney(source, count, currency)
    source = tonumber(source)
    currency = currency or "money"
    if currency == "money" then
        return exports.qbx_core:RemoveMoney(source, 'cash', count, 'pickle_dealerships')
    elseif currency == "bank" then
        return exports.qbx_core:RemoveMoney(source, 'bank', count, 'pickle_dealerships')
    elseif currency == "dirty" then
        local setting = Config.FrameworkSettings.dirtyMoney
        Inventory.RemoveItem(source, setting == "DEFAULT" and 'dirty_money' or setting, count)
        return true
    end
    return false
end

function GetMoney(source, currency)
    local player = GetPlayer(source)
    if not player or not player.PlayerData then return 0 end
    currency = currency or "money"
    if currency == "money" then
        return player.PlayerData.money.cash or 0
    elseif currency == "bank" then
        return player.PlayerData.money.bank or 0
    elseif currency == "dirty" then
        local setting = Config.FrameworkSettings.dirtyMoney
        return Inventory.GetItemCount(source, setting == "DEFAULT" and 'dirty_money' or setting)
    end
    return 0
end

function GetOwnedVehicleFromPlate(plate)
    if not plate then return nil end
    local normalized = string.upper(tostring(plate):gsub('%s+', ''))
    local data = MySQL.Sync.fetchAll("SELECT * FROM player_vehicles WHERE REPLACE(UPPER(plate), ' ', '')=@plate LIMIT 1;", {
        ['@plate'] = normalized,
    })[1]
    return data and { owner = data.citizenid, model = data.vehicle } or nil
end

function AddOwnedVehicle(source, model)
    local player = GetPlayer(source)
    if not player then return end
    local plate = ""
    local letters = { "A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z" }
    local numbers = { "0","1","2","3","4","5","6","7","8","9" }
    for i = 1, 3 do plate = plate .. letters[math.random(1, #letters)] end
    plate = plate .. " "
    for i = 1, 3 do plate = plate .. numbers[math.random(1, #numbers)] end
    MySQL.Async.fetchAll('INSERT INTO player_vehicles (license, citizenid, vehicle, hash, plate, garage, state) VALUES (@license, @citizenid, @vehicle, @hash, @plate, @garage, @state)', {
        ['@license'] = player.PlayerData.license,
        ['@citizenid'] = player.PlayerData.citizenid,
        ['@vehicle'] = model,
        ['@hash'] = joaat(model),
        ['@plate'] = string.upper(plate),
        ['@garage'] = "pillboxgarage",
        ['@state'] = 0,
    })
end

function AddOwnedVehicleWithProps(source, model, plate, properties)
    local player = GetPlayer(source)
    if not player or not plate then return false end
    local mods = type(properties) == "table" and json.encode(properties) or (properties or "{}")
    MySQL.Async.execute('INSERT INTO player_vehicles (license, citizenid, vehicle, hash, mods, plate, garage, state) VALUES (@license, @citizenid, @vehicle, @hash, @mods, @plate, @garage, @state)', {
        ['@license'] = player.PlayerData.license,
        ['@citizenid'] = player.PlayerData.citizenid,
        ['@vehicle'] = model,
        ['@hash'] = joaat(model),
        ['@mods'] = mods,
        ['@plate'] = string.upper(plate),
        ['@garage'] = "pillboxgarage",
        ['@state'] = 0,
    })
    return true
end

function RemoveOwnedVehicle(identifier, plate)
    if not identifier or not plate then return false end
    MySQL.Async.execute('DELETE FROM player_vehicles WHERE plate = @plate AND citizenid = @citizenid', {
        ['@plate'] = plate,
        ['@citizenid'] = identifier,
    })
    return true
end

function UpdateVehiclePlate(source, plate, newPlate)
    local player = GetPlayer(source)
    if not player then return end
    MySQL.Async.execute('UPDATE player_vehicles SET plate = @newPlate WHERE plate = @plate AND citizenid = @citizenid', {
        ['@newPlate'] = newPlate,
        ['@plate'] = plate,
        ['@citizenid'] = player.PlayerData.citizenid,
    })
end

function GetPlayerJob(source)
    local player = GetPlayer(source)
    if not player or not player.PlayerData then return end
    return { label = player.PlayerData.job.label, rank_label = player.PlayerData.job.grade.name }
end

function GetPlayerJobName(source)
    local player = GetPlayer(source)
    if not player or not player.PlayerData or not player.PlayerData.job then return nil end
    return player.PlayerData.job.name
end

function GetPlayerJobGrade(source)
    local player = GetPlayer(source)
    if not player or not player.PlayerData or not player.PlayerData.job then return 0 end
    return player.PlayerData.job.grade.level or 0
end

function SetPlayerJob(source, job, grade)
    exports.qbx_core:SetJob(tonumber(source), job, grade)
end

function IsPlayerAdmin(source)
    source = tonumber(source)
    for i = 1, #Config.AdminGroups do
        if exports.qbx_core:HasPermission(source, Config.AdminGroups[i]) or IsPlayerAceAllowed(source, "command") then
            return true
        end
    end
    return false
end

function AddAlcohol(source, amount)
    if not amount or amount <= 0 then return end
    local player = GetPlayer(source)
    if not player then return end
    TriggerClientEvent("pickle_dealerships:addAlcohol", source, amount)
end

function AddSocietyMoney(name, amount)
    if Config.FrameworkSettings.society == "qb-management" then
        exports["qb-management"]:AddMoney(name, amount)
    else
        exports["qb-banking"]:AddMoney(name, amount)
    end
end

function GetSocietyBalance(name, cb)
    if type(cb) ~= "function" then return end
    local system = Config.FrameworkSettings.society or "qb-banking"
    local ok, balance = pcall(function()
        if system == "qb-management" then
            return exports["qb-management"]:GetAccount(name) or 0
        end
        return exports["qb-banking"]:GetAccount(name) or 0
    end)
    cb(ok and balance or 0)
end

function RemoveSocietyMoney(name, amount, cb)
    local system = Config.FrameworkSettings.society or "qb-banking"
    if system == "qb-management" then
        exports["qb-management"]:RemoveMoney(name, amount)
    else
        exports["qb-banking"]:RemoveMoney(name, amount)
    end
    if type(cb) == "function" then cb() end
end

-- Inventory Fallback
CreateThread(function()
    Wait(100)

    if InitializeInventory then return InitializeInventory() end -- ox_inventory / custom bridge took over

    Inventory = {}
    Inventory.Items = {}
    Inventory.Ready = false

    Inventory.CanCarryItem = function(source, name, count)
        -- ox_inventory is the standard for QBX; if we're in the fallback we assume no limits.
        return true
    end

    Inventory.GetInventory = function(source)
        local player = GetPlayer(source)
        if not player or not player.PlayerData then return {} end
        local items = {}
        for _, item in pairs(player.PlayerData.items or {}) do
            items[#items + 1] = {
                name = item.name,
                label = item.label,
                count = item.amount,
                weight = item.weight,
            }
        end
        return items
    end

    Inventory.UpdateInventory = function(source)
        SetTimeout(1000, function()
            TriggerClientEvent("pickle_dealerships:updateInventory", source, Inventory.GetInventory(source))
        end)
    end

    Inventory.AddItem = function(source, name, count, metadata)
        exports.qbx_core:AddItem(source, name, count, nil, metadata)
        Inventory.UpdateInventory(source)
    end

    Inventory.RemoveItem = function(source, name, count)
        exports.qbx_core:RemoveItem(source, name, count)
        Inventory.UpdateInventory(source)
    end

    Inventory.AddWeapon = function(source, name, count, metadata)
        Inventory.AddItem(source, name, count, metadata)
    end

    Inventory.RemoveWeapon = function(source, name, count)
        Inventory.RemoveItem(source, name, count)
    end

    Inventory.GetItemCount = function(source, name)
        local player = GetPlayer(source)
        if not player then return 0 end
        for _, item in pairs(player.PlayerData.items or {}) do
            if item.name == name then return item.amount end
        end
        return 0
    end

    Inventory.HasWeapon = function(source, name)
        return Inventory.GetItemCount(source, name) > 0
    end

    lib.callback.register("pickle_dealerships:getInventory", function(source)
        return Inventory.GetInventory(source)
    end)

    local sharedItems = exports.qbx_core:GetSharedItems() or {}
    for item, itemData in pairs(sharedItems) do
        Inventory.Items[item] = { label = itemData.label }
    end
    Inventory.Ready = true
end)
