-- =============================================
--  pickle_dealerships | modules/employees/server.lua
--  Employee management via framework jobs
-- =============================================

local OnDutyEmployees = {}

-- ─── Grade-to-role mapping ─────────────────────────────────────────────────
-- Determines role based on the player's job grade relative to the max grade

local function GradeToRole(grade, maxGrade)
    if grade >= maxGrade then
        return 'owner'
    elseif grade >= math.ceil(maxGrade / 2) then
        return 'manager'
    else
        return 'salesperson'
    end
end

local function RoleToGrade(role, jobName)
    local grades = GetJobGrades(jobName)
    if not grades or #grades == 0 then return 0 end

    local maxGrade = 0
    for _, g in ipairs(grades) do
        if g.level > maxGrade then maxGrade = g.level end
    end

    if role == 'owner' then
        return maxGrade
    elseif role == 'manager' then
        return math.ceil(maxGrade / 2)
    else
        return 0
    end
end

-- ─── Hire Employee ──────────────────────────────────────────────────────────

lib.callback.register("pickle_dealerships:hireEmployee", function(source, data)
    local dealershipId = tonumber(data.dealershipId)
    local targetId = tonumber(data.targetId)
    local role = data.role or "salesperson"

    if not dealershipId or not targetId then
        return { success = false, message = "Invalid request." }
    end

    if not CanPlayerManage(source, dealershipId) then
        return { success = false, message = "You do not have permission to hire employees." }
    end

    local dealership = GetDealership(dealershipId)
    if not dealership then
        return { success = false, message = "Dealership not found." }
    end

    if not dealership.job or dealership.job == "" then
        return { success = false, message = "This dealership has no job assigned. Set a job in the admin panel first." }
    end

    -- Validate target player exists
    local targetName = GetPlayerName(targetId)
    if not targetName then
        return { success = false, message = "Target player not found." }
    end

    -- Check if target already has this job
    local targetJob = GetPlayerJobName(targetId)
    if targetJob == dealership.job then
        return { success = false, message = "This player already works at this dealership." }
    end

    -- Set their framework job
    local grade = RoleToGrade(role, dealership.job)
    SetPlayerJob(targetId, dealership.job, grade)

    local charName = GetPlayerCharacterName(targetId)
    AddLedgerEntry(dealershipId, "employee_hire", 0, ("Hired %s as %s"):format(charName, role), GetIdentifier(targetId))

    ShowNotification(source, ("You hired %s as a %s."):format(charName, role))
    ShowNotification(targetId, ("You have been hired as a %s at %s!"):format(role, dealership.name))

    return { success = true, message = ("Successfully hired %s."):format(charName) }
end)

-- ─── Fire Employee ──────────────────────────────────────────────────────────

lib.callback.register("pickle_dealerships:fireEmployee", function(source, data)
    local dealershipId = tonumber(data.dealershipId)
    local targetServerId = tonumber(data.targetServerId)

    if not dealershipId or not targetServerId then
        return { success = false, message = "Invalid request." }
    end

    if not CanPlayerManage(source, dealershipId) then
        return { success = false, message = "You do not have permission to fire employees." }
    end

    local dealership = GetDealership(dealershipId)
    if not dealership or not dealership.job then
        return { success = false, message = "Dealership not found or has no job." }
    end

    -- Verify target has this job
    local targetJob = GetPlayerJobName(targetServerId)
    if targetJob ~= dealership.job then
        return { success = false, message = "This player does not work at this dealership." }
    end

    -- Cannot fire yourself
    if targetServerId == source then
        return { success = false, message = "You cannot fire yourself." }
    end

    -- Check hierarchy: managers can't fire managers
    local myGrade = GetPlayerJobGrade(source)
    local targetGrade = GetPlayerJobGrade(targetServerId)
    if targetGrade >= myGrade then
        return { success = false, message = "You cannot fire someone of equal or higher rank." }
    end

    local charName = GetPlayerCharacterName(targetServerId)
    SetPlayerJob(targetServerId, 'unemployed', 0)

    AddLedgerEntry(dealershipId, "employee_fire", 0, ("Fired %s"):format(charName), GetIdentifier(targetServerId))
    ShowNotification(source, ("You fired %s."):format(charName))
    ShowNotification(targetServerId, "You have been terminated from the dealership.")

    return { success = true, message = ("Fired %s."):format(charName) }
end)

-- ─── Set Employee Role (change job grade) ──────────────────────────────────

lib.callback.register("pickle_dealerships:setEmployeeRole", function(source, data)
    local dealershipId = tonumber(data.dealershipId)
    local targetServerId = tonumber(data.targetServerId)
    local newRole = data.role

    if not dealershipId or not targetServerId or not newRole then
        return { success = false, message = "Invalid request." }
    end

    local dealership = GetDealership(dealershipId)
    if not dealership or not dealership.job then
        return { success = false, message = "Dealership not found or has no job." }
    end

    -- Only owner/admin can change roles
    local myRole = GetPlayerDealershipRole(source, dealershipId)
    if myRole ~= "owner" and not IsPlayerAdmin(source) then
        return { success = false, message = "Only the owner can change employee roles." }
    end

    local targetJob = GetPlayerJobName(targetServerId)
    if targetJob ~= dealership.job then
        return { success = false, message = "This player does not work at this dealership." }
    end

    local grade = RoleToGrade(newRole, dealership.job)
    SetPlayerJob(targetServerId, dealership.job, grade)

    local charName = GetPlayerCharacterName(targetServerId)
    ShowNotification(source, ("Changed %s's role to %s."):format(charName, newRole))
    ShowNotification(targetServerId, ("Your role has been changed to %s."):format(newRole))

    return { success = true, message = ("Role updated to %s."):format(newRole) }
end)

-- ─── Get Employees (from framework job) ────────────────────────────────────

lib.callback.register("pickle_dealerships:getEmployees", function(source, data)
    local dealershipId = tonumber(data.dealershipId)
    if not dealershipId then return { employees = {} } end

    local dealership = GetDealership(dealershipId)
    if not dealership then return { employees = {} } end

    if not dealership.job or dealership.job == "" then
        return { employees = {} }
    end

    -- Get online employees from the framework
    local jobEmployees = GetEmployees(dealership.job)
    local grades = GetJobGrades(dealership.job)
    local maxGrade = 0
    for _, g in ipairs(grades) do
        if g.level > maxGrade then maxGrade = g.level end
    end

    local employees = {}
    for _, emp in ipairs(jobEmployees) do
        local role = GradeToRole(emp.grade, maxGrade)
        employees[#employees + 1] = {
            id = emp.source, -- use server ID as the identifier
            serverId = emp.source,
            identifier = GetIdentifier(emp.source),
            name = emp.name,
            role = role,
            gradeLabel = emp.gradeLabel,
            grade = emp.grade,
            commission_rate = Config.DefaultCommission or 0.08,
            clocked_in = OnDutyEmployees[emp.source] ~= nil,
            online = true,
        }
    end

    return { employees = employees }
end)

-- ─── Clock In/Out ──────────────────────────────────────────────────────────

lib.callback.register("pickle_dealerships:clockIn", function(source, data)
    local dealershipId = tonumber(data.dealershipId)
    if not dealershipId then return { success = false } end

    local dealership = GetDealership(dealershipId)
    if not dealership then
        return { success = false, message = "Dealership not found." }
    end

    -- Allow admins, owners, and employees with matching job to clock in
    local canClockIn = false
    if IsPlayerAdmin(source) then
        canClockIn = true
    elseif dealership.owner_identifier and dealership.owner_identifier == GetIdentifier(source) then
        canClockIn = true
    elseif dealership.job then
        local playerJob = GetPlayerJobName(source)
        if playerJob == dealership.job then
            canClockIn = true
        end
    else
        -- No job set — check if they're an employee in the DB
        local identifier = GetIdentifier(source)
        local emp = MySQL.single.await("SELECT id FROM dealership_employees WHERE dealership_id = ? AND identifier = ? LIMIT 1", { dealershipId, identifier })
        if emp then canClockIn = true end
    end

    if not canClockIn then
        print(("[ClockIn] DENIED source=%s dealershipId=%s job=%s playerJob=%s"):format(
            tostring(source), tostring(dealershipId), tostring(dealership.job), tostring(GetPlayerJobName(source))
        ))
        return { success = false, message = "You do not work at this dealership." }
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

    return { success = true, message = "You are now on duty." }
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
        return { success = true, message = "You are now off duty." }
    end
    return { success = false, message = "You are not on duty." }
end)

-- Clean up on player disconnect
AddEventHandler('playerDropped', function()
    local src = tonumber(source)
    if src then OnDutyEmployees[src] = nil end
end)

RegisterNetEvent("pickle_dealerships:customerArrived", function(data)
    -- handled client-side
end)
