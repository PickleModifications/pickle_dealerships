-- =============================================
--  pickle_dealerships | modules/employees/server.lua
--  Employee management via framework jobs
-- =============================================

local OnDutyEmployees = {}

-- ─── Faction helpers ───────────────────────────────────────────────────────
-- The dealership's faction can be a job or a gang. These helpers dispatch to
-- the appropriate bridge function so the rest of the module stays agnostic.

local function FactionGetGrades(faction)
    if not faction or not faction.name or faction.name == "" then return {} end
    if faction.type == "gang" then
        return GetGangGrades and GetGangGrades(faction.name) or {}
    end
    return GetJobGrades and GetJobGrades(faction.name) or {}
end

local function FactionGetMembers(faction)
    if not faction or not faction.name or faction.name == "" then return {} end
    if faction.type == "gang" then
        return GetGangMembers and GetGangMembers(faction.name) or {}
    end
    return GetEmployees and GetEmployees(faction.name) or {}
end

local function PlayerFactionName(source, faction)
    if faction and faction.type == "gang" then
        return GetPlayerGangName and GetPlayerGangName(source) or nil
    end
    return GetPlayerJobName and GetPlayerJobName(source) or nil
end

local function PlayerFactionGrade(source, faction)
    if faction and faction.type == "gang" then
        return GetPlayerGangGrade and GetPlayerGangGrade(source) or 0
    end
    return GetPlayerJobGrade and GetPlayerJobGrade(source) or 0
end

local function SetPlayerFaction(source, faction, grade)
    if faction and faction.type == "gang" then
        if SetPlayerGang then return SetPlayerGang(source, faction.name, grade) end
        return false
    end
    if SetPlayerJob then SetPlayerJob(source, faction.name, grade) end
    return true
end

-- Employees are identified by their actual framework grade (number) and the
-- grade label pulled live from the framework. We no longer map grades to
-- synthetic owner/manager/salesperson roles — those were stale and fought
-- with per-grade commission configuration.

--- Looks up the framework grade label for `grade` on this faction.
local function FactionGradeLabel(faction, grade)
    for _, g in ipairs(FactionGetGrades(faction) or {}) do
        if tonumber(g.level) == tonumber(grade) then return g.label end
    end
    return ("Grade " .. tostring(grade))
end

-- ─── Hire Employee ──────────────────────────────────────────────────────────

lib.callback.register("pickle_dealerships:hireEmployee", function(source, data)
    local dealershipId = tonumber(data.dealershipId)
    local targetId = tonumber(data.targetId)
    local grade = tonumber(data.grade) or 0

    if not dealershipId or not targetId then
        return { success = false, message = _L("invalid_request") }
    end

    if not CanPlayerManage(source, dealershipId) then
        return { success = false, message = _L("no_permission_hire") }
    end

    local dealership = GetDealership(dealershipId)
    if not dealership then
        return { success = false, message = _L("dealership_not_found") }
    end

    local faction = GetDealershipFaction(dealership)
    if not faction.name or faction.name == "" then
        return { success = false, message = _L("dealership_no_job") }
    end

    -- Validate grade exists on this faction so admins can't hire someone into a
    -- phantom level that commission rates can't reach.
    local gradeLabel
    for _, g in ipairs(FactionGetGrades(faction) or {}) do
        if tonumber(g.level) == grade then gradeLabel = g.label; break end
    end
    if not gradeLabel then
        return { success = false, message = _L("employees_invalid_grade") }
    end

    -- Validate target player exists
    local targetName = GetPlayerName(targetId)
    if not targetName then
        return { success = false, message = _L("target_player_not_found") }
    end

    -- Check if target already belongs to this faction
    local targetFactionName = PlayerFactionName(targetId, faction)
    if targetFactionName == faction.name then
        return { success = false, message = _L("employee_already_works") }
    end

    if not SetPlayerFaction(targetId, faction, grade) then
        return { success = false, message = _L("faction_set_failed") }
    end

    local charName = GetPlayerCharacterName(targetId)
    AddLedgerEntry(dealershipId, "employee_hire", 0, ("Hired %s as %s"):format(charName, gradeLabel), GetIdentifier(targetId))

    -- The target's framework will already emit its own "you've been assigned X" notification
    -- when SetPlayerFaction runs; skip ours to avoid the duplicate toast on the new hire.

    return { success = true, message = _L("employee_hired_success", charName) }
end)

-- ─── Fire Employee ──────────────────────────────────────────────────────────

lib.callback.register("pickle_dealerships:fireEmployee", function(source, data)
    local dealershipId = tonumber(data.dealershipId)
    local targetServerId = tonumber(data.targetServerId)
    local targetIdentifier = data.targetIdentifier  -- used when target is offline

    if not dealershipId or (not targetServerId and not targetIdentifier) then
        return { success = false, message = _L("invalid_request") }
    end

    if not CanPlayerManage(source, dealershipId) then
        return { success = false, message = _L("no_permission_fire") }
    end

    local dealership = GetDealership(dealershipId)
    if not dealership or not dealership.job then
        return { success = false, message = _L("dealership_not_found_no_job") }
    end

    local faction = GetDealershipFaction(dealership)

    -- Cannot fire yourself
    if targetServerId and targetServerId == source then
        return { success = false, message = _L("cannot_fire_self") }
    end

    -- Resolve identifier + a display name that works for both online and offline targets.
    local charName, effectiveIdentifier
    if targetServerId then
        local targetFactionName = PlayerFactionName(targetServerId, faction)
        if targetFactionName ~= faction.name then
            return { success = false, message = _L("employee_not_at_dealership") }
        end

        local myGrade = PlayerFactionGrade(source, faction)
        local targetGrade = PlayerFactionGrade(targetServerId, faction)
        if targetGrade >= myGrade then
            return { success = false, message = _L("cannot_fire_higher_rank") }
        end

        charName = GetPlayerCharacterName(targetServerId)
        effectiveIdentifier = GetIdentifier(targetServerId)
        if faction.type == "gang" then
            if SetPlayerGang then SetPlayerGang(targetServerId, 'none', 0) end
        else
            SetPlayerJob(targetServerId, 'unemployed', 0)
        end
    else
        effectiveIdentifier = targetIdentifier
        local row = MySQL.single.await(
            "SELECT charinfo FROM players WHERE citizenid = ? LIMIT 1",
            { targetIdentifier }
        )
        if row and row.charinfo then
            local info = type(row.charinfo) == "string" and (json.decode(row.charinfo) or {}) or row.charinfo
            charName = (info.firstname or "Unknown") .. " " .. (info.lastname or "")
        else
            charName = targetIdentifier
        end

        if SetFactionByIdentifier then
            SetFactionByIdentifier(faction.type, targetIdentifier, faction.type == "gang" and "none" or "unemployed", 0)
        end
    end

    AddLedgerEntry(dealershipId, "employee_fire", 0, ("Fired %s"):format(charName), effectiveIdentifier)
    -- Framework notifies online targets via its own job-change flow; skip our duplicate toast.

    return { success = true, message = _L("employee_fired_success", charName) }
end)

-- ─── Set Employee Grade (change faction grade directly) ────────────────────

lib.callback.register("pickle_dealerships:setEmployeeGrade", function(source, data)
    local dealershipId = tonumber(data.dealershipId)
    local targetServerId = tonumber(data.targetServerId)
    local grade = tonumber(data.grade)

    if not dealershipId or not targetServerId or grade == nil then
        return { success = false, message = _L("invalid_request") }
    end

    local dealership = GetDealership(dealershipId)
    if not dealership or not dealership.job then
        return { success = false, message = _L("dealership_not_found_no_job") }
    end

    -- Only owner/admin can change grades
    local myRole = GetPlayerDealershipRole(source, dealershipId)
    if myRole ~= "owner" and not IsPlayerAdmin(source) then
        return { success = false, message = _L("only_owner_change_roles") }
    end

    local faction = GetDealershipFaction(dealership)
    local targetFactionName = PlayerFactionName(targetServerId, faction)
    if targetFactionName ~= faction.name then
        return { success = false, message = _L("employee_not_at_dealership") }
    end

    local gradeLabel = FactionGradeLabel(faction, grade)

    SetPlayerFaction(targetServerId, faction, grade)

    -- Framework handles the target-side "you were promoted" notification.

    return { success = true, message = _L("employee_role_updated", gradeLabel) }
end)

-- ─── Get Employees (from framework job) ────────────────────────────────────

lib.callback.register("pickle_dealerships:getEmployees", function(source, data)
    local dealershipId = tonumber(data.dealershipId)
    if not dealershipId then return { employees = {} } end

    local dealership = GetDealership(dealershipId)
    if not dealership then return { employees = {} } end

    local faction = GetDealershipFaction(dealership)
    if not faction.name or faction.name == "" then
        return { employees = {} }
    end

    -- Get online members from the appropriate framework source (job or gang)
    local jobEmployees = FactionGetMembers(faction)

    -- Pull all saved per-employee commission overrides for this dealership in one query and
    -- index by identifier so we can attach them to the online list without N+1 lookups.
    local overrideByIdentifier = {}
    local overrideRows = MySQL.query.await(
        "SELECT `identifier`, `commission_rate` FROM `pickle_dealership_employees` WHERE `dealership_id` = ?",
        { dealershipId }
    ) or {}
    for _, row in ipairs(overrideRows) do
        overrideByIdentifier[row.identifier] = tonumber(row.commission_rate) or 0
    end

    local employees = {}
    for _, emp in ipairs(jobEmployees) do
        -- Prefer the identifier the bridge populated (works for both online and
        -- offline members); fall back to resolving from source for older bridges
        -- that only set `source`.
        local identifier = emp.identifier or (emp.source and GetIdentifier(emp.source)) or nil
        local override = identifier and overrideByIdentifier[identifier] or 0
        employees[#employees + 1] = {
            id = emp.source or identifier,
            serverId = emp.source,
            identifier = identifier,
            name = emp.name,
            gradeLabel = emp.gradeLabel,
            grade = emp.grade,
            -- Percentage (0-100). 0 means "no override — use the dealership grade rate".
            commission_override = override,
            clocked_in = emp.source and OnDutyEmployees[emp.source] ~= nil or false,
            online = emp.online ~= false, -- nil defaults to true for back-compat
        }
    end

    return { employees = employees }
end)

--- Owner/manager sets a per-employee commission override (percentage, 0-100). Set to 0 to
--- clear the override and fall back to the dealership's grade-based rate. Upserts the row
--- so employees who haven't been "hired" in the DB yet still get their override persisted.
lib.callback.register("pickle_dealerships:setEmployeeCommissionOverride", function(source, data)
    local dealershipId = tonumber(data.dealershipId)
    if not dealershipId then return { success = false, message = "Invalid dealership." } end
    if not CanPlayerManage(source, dealershipId) then
        return { success = false, message = "You do not have permission." }
    end

    local targetIdentifier = data.identifier
    if not targetIdentifier or targetIdentifier == "" then
        return { success = false, message = "Missing target identifier." }
    end

    local rate = math.max(0, math.min(100, tonumber(data.rate) or 0))

    local existing = MySQL.single.await(
        "SELECT `id` FROM `pickle_dealership_employees` WHERE `dealership_id` = ? AND `identifier` = ? LIMIT 1",
        { dealershipId, targetIdentifier }
    )
    if existing and existing.id then
        MySQL.update.await(
            "UPDATE `pickle_dealership_employees` SET `commission_rate` = ? WHERE `id` = ?",
            { rate, existing.id }
        )
    else
        MySQL.insert.await(
            "INSERT INTO `pickle_dealership_employees` (`dealership_id`, `identifier`, `role`, `commission_rate`) VALUES (?, ?, ?, ?)",
            { dealershipId, targetIdentifier, 'salesperson', rate }
        )
    end

    return { success = true }
end)

-- ─── Clock In/Out ──────────────────────────────────────────────────────────

lib.callback.register("pickle_dealerships:clockIn", function(source, data)
    local dealershipId = tonumber(data.dealershipId)
    if not dealershipId then return { success = false } end

    local dealership = GetDealership(dealershipId)
    if not dealership then
        return { success = false, message = _L("dealership_not_found") }
    end

    -- Allow admins, owners, and employees with matching job to clock in
    local canClockIn = false
    if IsPlayerAdmin(source) then
        canClockIn = true
    elseif dealership.owner_identifier and dealership.owner_identifier == GetIdentifier(source) then
        canClockIn = true
    elseif dealership.job then
        local faction = GetDealershipFaction(dealership)
        local playerFaction = PlayerFactionName(source, faction)
        if playerFaction == faction.name then
            canClockIn = true
        end
    else
        -- No job set — check if they're an employee in the DB
        local identifier = GetIdentifier(source)
        local emp = MySQL.single.await("SELECT id FROM pickle_dealership_employees WHERE dealership_id = ? AND identifier = ? LIMIT 1", { dealershipId, identifier })
        if emp then canClockIn = true end
    end

    if not canClockIn then
        print(("[ClockIn] DENIED source=%s dealershipId=%s job=%s playerJob=%s"):format(
            tostring(source), tostring(dealershipId), tostring(dealership.job), tostring(GetPlayerJobName(source))
        ))
        return { success = false, message = _L("employee_not_work_here") }
    end

    local src = tonumber(source)
    print(("[ClockIn] GRANTED source=%s dealershipId=%s"):format(tostring(src), tostring(dealershipId)))

    -- If already on duty at another dealership, clock out first
    if OnDutyEmployees[src] then
        TriggerClientEvent("pickle_dealerships:npc:stopDuty", src)
    end

    OnDutyEmployees[src] = {
        identifier = GetIdentifier(source),
        dealershipId = dealershipId,
        name = GetPlayerCharacterName(source),
        clockedInAt = os.time(),
    }

    -- Start NPC customer spawning for this employee
    if Config.NPCCustomers and Config.NPCCustomers.enabled then
        local meta = dealership.metadata
        if type(meta) == "string" then meta = json.decode(meta) or {} end
        if type(meta) ~= "table" then meta = {} end

        local npcSpawnPoints = {}
        if meta.npcSpawnPoints then
            for _, p in ipairs(meta.npcSpawnPoints) do
                npcSpawnPoints[#npcSpawnPoints + 1] = vector4(p.x, p.y, p.z, p.w or 0.0)
            end
        elseif meta.coords then
            -- Fallback: spawn near the dealership center
            npcSpawnPoints[1] = vector4(meta.coords.x + 3.0, meta.coords.y + 3.0, meta.coords.z, meta.coords.w or 0.0)
        end

        TriggerClientEvent("pickle_dealerships:npc:startDuty", source, dealershipId, {
            npcSpawnPoints = npcSpawnPoints,
            location = dealership.location,
            dealershipName = dealership.name or 'Dealership',
        })
    end

    return { success = true, message = _L("employee_on_duty") }
end)

lib.callback.register("pickle_dealerships:getClockStatus", function(source, data)
    local src = tonumber(source)
    local dealershipId = tonumber(data.dealershipId)
    print(("[ClockStatus] src=%s, dealershipId=%s, OnDutyEmployees[src]=%s"):format(
        tostring(src), tostring(dealershipId),
        src and OnDutyEmployees[src] and json.encode(OnDutyEmployees[src]) or "nil"
    ))
    if not dealershipId or not src then return { clockedIn = false } end
    local duty = OnDutyEmployees[src]
    local result = duty ~= nil and duty.dealershipId == dealershipId
    print(("[ClockStatus] result=%s"):format(tostring(result)))
    return { clockedIn = result }
end)

lib.callback.register("pickle_dealerships:clockOut", function(source, data)
    local src = tonumber(source)
    if src and OnDutyEmployees[src] then
        OnDutyEmployees[src] = nil
        TriggerClientEvent("pickle_dealerships:npc:stopDuty", src)
        return { success = true, message = _L("employee_off_duty") }
    end
    return { success = false, message = _L("employee_not_on_duty") }
end)

-- Clean up on player disconnect
AddEventHandler('playerDropped', function()
    local src = tonumber(source)
    if src then OnDutyEmployees[src] = nil end
end)

RegisterNetEvent("pickle_dealerships:customerArrived", function(data)
    -- handled client-side
end)
