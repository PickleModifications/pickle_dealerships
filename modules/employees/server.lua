-- =============================================
--  pickle_dealerships | modules/employees/server.lua
--  Employee management system
-- =============================================

-- ─── On-Duty Runtime State ──────────────────────────────────────────────────

local OnDutyEmployees = {} -- keyed by source: { citizenid, dealershipId, name, clockedInAt }

-- ─── Hire Employee ──────────────────────────────────────────────────────────

lib.callback.register("pickle_dealerships:hireEmployee", function(source, data)
    local dealershipId = tonumber(data.dealershipId)
    local targetId = tonumber(data.targetId)
    local role = data.role or "salesperson"

    if not dealershipId or not targetId then
        return { success = false, message = "Invalid request." }
    end

    -- Check permission: only owner/manager can hire
    if not CanPlayerManage(source, dealershipId) then
        return { success = false, message = "You do not have permission to hire employees." }
    end

    local dealership = GetDealership(dealershipId)
    if not dealership then
        return { success = false, message = "Dealership not found." }
    end

    -- Check employee cap based on tier
    local tierData = Config.Tiers[dealership.tier]
    if tierData then
        local currentEmployees = MySQL.query.await(
            "SELECT COUNT(*) AS cnt FROM `dealership_employees` WHERE `dealership_id` = ?",
            { dealershipId }
        )
        local count = currentEmployees and currentEmployees[1] and currentEmployees[1].cnt or 0
        if count >= tierData.employeeCap then
            return { success = false, message = ("Employee cap reached (%d/%d). Upgrade your tier to hire more."):format(count, tierData.employeeCap) }
        end
    end

    -- Validate target player exists
    local targetName = GetPlayerName(targetId)
    if not targetName then
        return { success = false, message = "Target player not found." }
    end

    local targetCitizenid = GetIdentifier(targetId)
    if not targetCitizenid then
        return { success = false, message = "Could not identify target player." }
    end

    -- Check if already employed at this dealership
    local existing = MySQL.query.await(
        "SELECT `id` FROM `dealership_employees` WHERE `dealership_id` = ? AND `citizenid` = ? LIMIT 1",
        { dealershipId, targetCitizenid }
    )
    if existing and existing[1] then
        return { success = false, message = "This player is already employed at this dealership." }
    end

    -- Validate role
    local validRoles = { salesperson = true, manager = true }
    if not validRoles[role] then
        role = "salesperson"
    end

    -- Create employee record
    local defaultCommission = Config.DefaultCommission * 100 -- stored as percentage
    MySQL.insert(
        "INSERT INTO `dealership_employees` (`dealership_id`, `citizenid`, `role`, `commission_rate`) VALUES (?, ?, ?, ?)",
        { dealershipId, targetCitizenid, role, defaultCommission }
    )

    local charName = GetPlayerCharacterName(targetId)
    AddLedgerEntry(dealershipId, "employee_hire", 0, ("Hired %s as %s"):format(charName, role), targetCitizenid)

    ShowNotification(source, ("You hired %s as a %s."):format(charName, role))
    ShowNotification(targetId, ("You have been hired as a %s at %s!"):format(role, dealership.name))

    debugPrint(("[Employees] %s hired %s at dealership #%d as %s"):format(GetIdentifier(source), targetCitizenid, dealershipId, role))

    return { success = true, message = ("Successfully hired %s."):format(charName) }
end)

-- ─── Fire Employee ──────────────────────────────────────────────────────────

lib.callback.register("pickle_dealerships:fireEmployee", function(source, data)
    local dealershipId = tonumber(data.dealershipId)
    local employeeId = tonumber(data.employeeId)

    if not dealershipId or not employeeId then
        return { success = false, message = "Invalid request." }
    end

    if not CanPlayerManage(source, dealershipId) then
        return { success = false, message = "You do not have permission to fire employees." }
    end

    -- Get employee info before deleting
    local empRows = MySQL.query.await(
        "SELECT * FROM `dealership_employees` WHERE `id` = ? AND `dealership_id` = ? LIMIT 1",
        { employeeId, dealershipId }
    )
    local employee = empRows and empRows[1] or nil
    if not employee then
        return { success = false, message = "Employee not found." }
    end

    -- Cannot fire yourself if you are the owner
    local myRole = GetPlayerDealershipRole(source, dealershipId)
    if myRole == "manager" and employee.role == "manager" then
        return { success = false, message = "Managers cannot fire other managers. Only the owner can." }
    end

    -- Delete employee record
    MySQL.update(
        "DELETE FROM `dealership_employees` WHERE `id` = ?",
        { employeeId }
    )

    -- Remove from on-duty if applicable
    for src, duty in pairs(OnDutyEmployees) do
        if duty.citizenid == employee.citizenid and duty.dealershipId == dealershipId then
            OnDutyEmployees[src] = nil
            break
        end
    end

    AddLedgerEntry(dealershipId, "employee_fire", 0, ("Fired employee: %s"):format(employee.citizenid), employee.citizenid)

    -- Notify the fired employee if online
    local firedSource = GetSourceFromIdentifier(employee.citizenid)
    if firedSource then
        ShowNotification(firedSource, "You have been terminated from the dealership.")
    end

    ShowNotification(source, "Employee has been fired.")
    debugPrint(("[Employees] Employee #%d (%s) fired from dealership #%d"):format(employeeId, employee.citizenid, dealershipId))

    return { success = true, message = "Employee has been fired." }
end)

-- ─── Set Employee Role ──────────────────────────────────────────────────────

lib.callback.register("pickle_dealerships:setEmployeeRole", function(source, data)
    local dealershipId = tonumber(data.dealershipId)
    local employeeId = tonumber(data.employeeId)
    local newRole = data.newRole

    if not dealershipId or not employeeId or not newRole then
        return { success = false, message = "Invalid request." }
    end

    -- Only the owner can change roles
    local myRole = GetPlayerDealershipRole(source, dealershipId)
    if myRole ~= "owner" then
        return { success = false, message = "Only the owner can change employee roles." }
    end

    local validRoles = { salesperson = true, manager = true }
    if not validRoles[newRole] then
        return { success = false, message = "Invalid role." }
    end

    local empRows = MySQL.query.await(
        "SELECT * FROM `dealership_employees` WHERE `id` = ? AND `dealership_id` = ? LIMIT 1",
        { employeeId, dealershipId }
    )
    if not empRows or not empRows[1] then
        return { success = false, message = "Employee not found." }
    end

    MySQL.update(
        "UPDATE `dealership_employees` SET `role` = ? WHERE `id` = ?",
        { newRole, employeeId }
    )

    AddLedgerEntry(dealershipId, "employee_role_change", 0, ("Changed %s role to %s"):format(empRows[1].citizenid, newRole), empRows[1].citizenid)
    ShowNotification(source, ("Employee role updated to %s."):format(newRole))

    -- Notify employee if online
    local empSource = GetSourceFromIdentifier(empRows[1].citizenid)
    if empSource then
        ShowNotification(empSource, ("Your role has been changed to %s."):format(newRole))
    end

    return { success = true, message = ("Role updated to %s."):format(newRole) }
end)

-- ─── Set Commission Rate ────────────────────────────────────────────────────

lib.callback.register("pickle_dealerships:setCommissionRate", function(source, data)
    local dealershipId = tonumber(data.dealershipId)
    local employeeId = tonumber(data.employeeId)
    local rate = tonumber(data.rate)

    if not dealershipId or not employeeId or not rate then
        return { success = false, message = "Invalid request." }
    end

    -- Only owner can set commission rates
    local myRole = GetPlayerDealershipRole(source, dealershipId)
    if myRole ~= "owner" then
        return { success = false, message = "Only the owner can set commission rates." }
    end

    -- Clamp rate between 0 and 50 percent
    rate = math.max(0, math.min(50, rate))

    local empRows = MySQL.query.await(
        "SELECT * FROM `dealership_employees` WHERE `id` = ? AND `dealership_id` = ? LIMIT 1",
        { employeeId, dealershipId }
    )
    if not empRows or not empRows[1] then
        return { success = false, message = "Employee not found." }
    end

    MySQL.update(
        "UPDATE `dealership_employees` SET `commission_rate` = ? WHERE `id` = ?",
        { rate, employeeId }
    )

    ShowNotification(source, ("Commission rate set to %d%%."):format(rate))

    return { success = true, message = ("Commission rate set to %d%%."):format(rate) }
end)

-- ─── Get Employees ──────────────────────────────────────────────────────────

lib.callback.register("pickle_dealerships:getEmployees", function(source, data)
    local dealershipId = tonumber(data.dealershipId)
    if not dealershipId then return {} end

    -- Must have at least sell permission to view employees
    if not CanPlayerSell(source, dealershipId) and not IsPlayerAdmin(source) then
        return {}
    end

    local rows = MySQL.query.await(
        "SELECT * FROM `dealership_employees` WHERE `dealership_id` = ? ORDER BY `role` DESC, `hired_at` ASC",
        { dealershipId }
    )

    if not rows then return {} end

    local employees = {}
    for i = 1, #rows do
        local emp = rows[i]

        -- Get character name
        local charName = "Unknown"
        local empSource = GetSourceFromIdentifier(emp.citizenid)
        if empSource then
            charName = GetPlayerCharacterName(empSource)
        end

        -- Get stats from stock table (sales by this employee)
        local statsRows = MySQL.query.await(
            "SELECT COUNT(*) AS total_sales, COALESCE(SUM(retail_price), 0) AS total_revenue FROM `dealership_stock` WHERE `dealership_id` = ? AND `sold_by` = ? AND `sold_at` IS NOT NULL",
            { dealershipId, emp.citizenid }
        )
        local totalSales = statsRows and statsRows[1] and statsRows[1].total_sales or 0
        local totalRevenue = statsRows and statsRows[1] and statsRows[1].total_revenue or 0

        -- Get commission earned from ledger
        local commRows = MySQL.query.await(
            "SELECT COALESCE(SUM(ABS(amount)), 0) AS total_commission FROM `dealership_ledger` WHERE `dealership_id` = ? AND `citizenid` = ? AND `type` = 'commission'",
            { dealershipId, emp.citizenid }
        )
        local totalCommission = commRows and commRows[1] and commRows[1].total_commission or 0

        -- Check on-duty status
        local onDuty = false
        for src, duty in pairs(OnDutyEmployees) do
            if duty.citizenid == emp.citizenid and duty.dealershipId == dealershipId then
                onDuty = true
                break
            end
        end

        employees[#employees + 1] = {
            id = emp.id,
            citizenid = emp.citizenid,
            name = charName,
            role = emp.role,
            commissionRate = emp.commission_rate,
            hiredAt = emp.hired_at,
            online = empSource ~= nil,
            onDuty = onDuty,
            stats = {
                totalSales = totalSales,
                totalRevenue = totalRevenue,
                totalCommission = totalCommission,
            },
        }
    end

    return employees
end)

-- ─── Clock In / Clock Out ───────────────────────────────────────────────────

lib.callback.register("pickle_dealerships:clockIn", function(source, data)
    local dealershipId = tonumber(data.dealershipId)
    if not dealershipId then
        return { success = false, message = "Invalid request." }
    end

    if not CanPlayerSell(source, dealershipId) then
        return { success = false, message = "You are not employed at this dealership." }
    end

    -- Check if already clocked in
    if OnDutyEmployees[source] then
        return { success = false, message = "You are already clocked in." }
    end

    local citizenid = GetIdentifier(source)
    local charName = GetPlayerCharacterName(source)

    OnDutyEmployees[source] = {
        citizenid = citizenid,
        dealershipId = dealershipId,
        name = charName,
        clockedInAt = os.time(),
    }

    ShowNotification(source, "You have clocked in.")
    debugPrint(("[Employees] %s (%s) clocked in at dealership #%d"):format(charName, citizenid, dealershipId))

    return { success = true, message = "Clocked in successfully." }
end)

lib.callback.register("pickle_dealerships:clockOut", function(source, data)
    local dealershipId = tonumber(data.dealershipId)
    if not dealershipId then
        return { success = false, message = "Invalid request." }
    end

    if not OnDutyEmployees[source] then
        return { success = false, message = "You are not clocked in." }
    end

    if OnDutyEmployees[source].dealershipId ~= dealershipId then
        return { success = false, message = "You are not clocked in at this dealership." }
    end

    local charName = OnDutyEmployees[source].name
    OnDutyEmployees[source] = nil

    ShowNotification(source, "You have clocked out.")
    debugPrint(("[Employees] %s clocked out from dealership #%d"):format(charName, dealershipId))

    return { success = true, message = "Clocked out successfully." }
end)

-- ─── Get On-Duty Employees ──────────────────────────────────────────────────

lib.callback.register("pickle_dealerships:getOnDutyEmployees", function(source, data)
    local dealershipId = tonumber(data.dealershipId)
    if not dealershipId then return {} end

    local onDuty = {}
    for src, duty in pairs(OnDutyEmployees) do
        if duty.dealershipId == dealershipId then
            onDuty[#onDuty + 1] = {
                source = src,
                citizenid = duty.citizenid,
                name = duty.name,
                clockedInAt = duty.clockedInAt,
            }
        end
    end

    return onDuty
end)

-- ─── Cleanup on Player Drop ────────────────────────────────────────────────

AddEventHandler("playerDropped", function()
    local src = source
    if OnDutyEmployees[src] then
        debugPrint(("[Employees] %s disconnected, removing from on-duty"):format(OnDutyEmployees[src].name))
        OnDutyEmployees[src] = nil
    end
end)
