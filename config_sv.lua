if not IsDuplicityVersion() then return end

ServerConfig = {}

-- Image Upload Provider
-- Supported: "fivemanage", "custom"
ServerConfig.ImageUpload = {
    provider = "fivemanage",
    token = "vX7G4UCDJLUSm19U1DGSdvUUpEiOSERv", -- Your FiveManage API token (https://www.fivemanage.com)

    -- Custom provider (only used when provider = "custom")
    custom = {
        url = "",              -- Upload endpoint URL
        field = "image",       -- Form field name for the image
        headers = {},          -- Additional headers, e.g. { ["Authorization"] = "Bearer ..." }
        returnPathKey = "url", -- Key in the JSON response that contains the image URL
    },
}
