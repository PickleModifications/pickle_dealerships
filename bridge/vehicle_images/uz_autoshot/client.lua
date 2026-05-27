-- =============================================
--  pickle_dealerships | bridge/vehicle_images/uz_autoshot/client.lua
--  Vehicle-image provider backed by uz-autoshot's client exports.
--
--  API:  exports['uz_AutoShot']:getVehiclePhotoURL(model) -> string
--
--  Registers only when enabled in Config.VehicleImages. Waits for the
--  uz_AutoShot resource to start before binding (same pattern as the
--  alt_currencies / credit_score bridges). If uz_AutoShot never comes up
--  the default provider stays in place and the NUI falls back to the
--  packaged vehicle_images/ folder.
--
--  Docs: https://uz-scripts.com/docs/free/uz-autoshot/exports
-- =============================================

if not Config.VehicleImages or Config.VehicleImages.provider ~= "uz-autoshot" then return end

CreateThread(function()
    local deadline = GetGameTimer() + 15000
    while GetResourceState("uz_AutoShot") ~= "started" and GetGameTimer() < deadline do
        Wait(500)
    end
    if GetResourceState("uz_AutoShot") ~= "started" then
        print("[pickle_dealerships] VehicleImage provider 'uz-autoshot' configured but the uz_AutoShot resource didn't start within 15s — images will fall back to the packaged set.")
        return
    end

    VehicleImageProvider = {
        name = "uz-autoshot",
        get  = function(model)
            -- Wrap the export in pcall so an exception (e.g. uz_AutoShot
            -- is restarted mid-session) falls through to nil and the NUI
            -- default instead of throwing out of the NUI callback.
            local ok, url = pcall(function()
                return exports['uz_AutoShot']:getVehiclePhotoURL(model)
            end)
            if not ok then return nil end
            if type(url) ~= "string" or url == "" then return nil end
            return url
        end,
    }
end)
