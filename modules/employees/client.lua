-- =============================================
--  pickle_dealerships | modules/employees/client.lua
--  Employee management NUI callbacks
-- =============================================

RegisterNUICallback("hireEmployee", function(data, cb)
    local result = lib.callback.await("pickle_dealerships:hireEmployee", false, data)
    cb(result)
end)

RegisterNUICallback("fireEmployee", function(data, cb)
    local result = lib.callback.await("pickle_dealerships:fireEmployee", false, data)
    cb(result)
end)

RegisterNUICallback("getEmployees", function(data, cb)
    local result = lib.callback.await("pickle_dealerships:getEmployees", false, data)
    cb(result)
end)

RegisterNUICallback("clockIn", function(data, cb)
    local result = lib.callback.await("pickle_dealerships:clockIn", false, data)
    if result and result.message then
        ShowNotification(result.message)
    end
    cb(result)
end)

RegisterNUICallback("clockOut", function(data, cb)
    local result = lib.callback.await("pickle_dealerships:clockOut", false, data)
    if result and result.message then
        ShowNotification(result.message)
    end
    cb(result)
end)

RegisterNUICallback("setEmployeeRole", function(data, cb)
    local result = lib.callback.await("pickle_dealerships:setEmployeeRole", false, data)
    cb(result)
end)

RegisterNUICallback("setCommissionRate", function(data, cb)
    local result = lib.callback.await("pickle_dealerships:setCommissionRate", false, data)
    cb(result)
end)

RegisterNetEvent("pickle_dealerships:customerArrived", function(data)
    ShowNotification("A customer has arrived at the dealership!")
end)
