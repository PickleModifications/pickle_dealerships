-- =============================================
--  pickle_dealerships | core/server.lua
--  Server-side initialisation, caching & utils
-- =============================================

-- ─── Dealership Cache ────────────────────────────────────────────────────────

DealershipCache = {}

-- ─── Database Initialisation ─────────────────────────────────────────────────

CreateThread(function()
    MySQL.ready(function()
        -- dealerships
        MySQL.Async.execute([[
            CREATE TABLE IF NOT EXISTS `dealerships` (
                `id`               INT UNSIGNED    NOT NULL AUTO_INCREMENT,
                `name`             VARCHAR(100)    NOT NULL,
                `location`         VARCHAR(100)    NOT NULL,
                `type`             VARCHAR(50)     NOT NULL DEFAULT 'car',
                `mode`             VARCHAR(50)     NOT NULL DEFAULT 'managed',
                `owner_citizenid`  VARCHAR(50)     DEFAULT NULL,
                `tier`             INT UNSIGNED    NOT NULL DEFAULT 1,
                `balance`          BIGINT          NOT NULL DEFAULT 0,
                `reputation`       INT             NOT NULL DEFAULT 0,
                `metadata`         JSON            DEFAULT NULL,
                `created_at`       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
                `updated_at`       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (`id`),
                KEY `idx_location` (`location`),
                KEY `idx_owner`    (`owner_citizenid`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ]])

        -- dealership_employees
        MySQL.Async.execute([[
            CREATE TABLE IF NOT EXISTS `dealership_employees` (
                `id`              INT UNSIGNED   NOT NULL AUTO_INCREMENT,
                `dealership_id`   INT UNSIGNED   NOT NULL,
                `citizenid`       VARCHAR(50)    NOT NULL,
                `role`            VARCHAR(30)    NOT NULL DEFAULT 'salesperson',
                `commission_rate` DECIMAL(5,2)   NOT NULL DEFAULT 0.00,
                `hired_at`        TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
                `metadata`        JSON           DEFAULT NULL,
                PRIMARY KEY (`id`),
                KEY `idx_dealership` (`dealership_id`),
                KEY `idx_citizen`    (`citizenid`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ]])

        -- dealership_stock
        MySQL.Async.execute([[
            CREATE TABLE IF NOT EXISTS `dealership_stock` (
                `id`              INT UNSIGNED   NOT NULL AUTO_INCREMENT,
                `dealership_id`   INT UNSIGNED   NOT NULL,
                `vehicle_model`   VARCHAR(100)   NOT NULL,
                `vehicle_label`   VARCHAR(150)   DEFAULT NULL,
                `retail_price`    BIGINT         NOT NULL DEFAULT 0,
                `wholesale_cost`  BIGINT         NOT NULL DEFAULT 0,
                `display_spot`    VARCHAR(50)    DEFAULT NULL,
                `color`           JSON           DEFAULT NULL,
                `condition`       DECIMAL(5,2)   NOT NULL DEFAULT 100.00,
                `ordered_at`      TIMESTAMP      NULL DEFAULT NULL,
                `delivered_at`    TIMESTAMP      NULL DEFAULT NULL,
                `sold_at`         TIMESTAMP      NULL DEFAULT NULL,
                `sold_to`         VARCHAR(50)    DEFAULT NULL,
                `sold_by`         VARCHAR(50)    DEFAULT NULL,
                `metadata`        JSON           DEFAULT NULL,
                PRIMARY KEY (`id`),
                KEY `idx_dealership` (`dealership_id`),
                KEY `idx_model`      (`vehicle_model`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ]])

        -- dealership_ledger
        MySQL.Async.execute([[
            CREATE TABLE IF NOT EXISTS `dealership_ledger` (
                `id`              INT UNSIGNED   NOT NULL AUTO_INCREMENT,
                `dealership_id`   INT UNSIGNED   NOT NULL,
                `type`            VARCHAR(50)    NOT NULL,
                `amount`          BIGINT         NOT NULL DEFAULT 0,
                `description`     TEXT           DEFAULT NULL,
                `citizenid`       VARCHAR(50)    DEFAULT NULL,
                `created_at`      TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (`id`),
                KEY `idx_dealership` (`dealership_id`),
                KEY `idx_type`       (`type`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ]])

        -- dealership_financing
        MySQL.Async.execute([[
            CREATE TABLE IF NOT EXISTS `dealership_financing` (
                `id`                 INT UNSIGNED   NOT NULL AUTO_INCREMENT,
                `dealership_id`      INT UNSIGNED   NOT NULL,
                `citizenid`          VARCHAR(50)    NOT NULL,
                `vehicle_plate`      VARCHAR(20)    NOT NULL,
                `total_amount`       BIGINT         NOT NULL DEFAULT 0,
                `amount_paid`        BIGINT         NOT NULL DEFAULT 0,
                `installment_amount` BIGINT         NOT NULL DEFAULT 0,
                `interest_rate`      DECIMAL(5,2)   NOT NULL DEFAULT 0.00,
                `next_payment`       TIMESTAMP      NULL DEFAULT NULL,
                `missed_payments`    INT UNSIGNED   NOT NULL DEFAULT 0,
                `status`             VARCHAR(30)    NOT NULL DEFAULT 'active',
                `created_at`         TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (`id`),
                KEY `idx_dealership` (`dealership_id`),
                KEY `idx_citizen`    (`citizenid`),
                KEY `idx_plate`      (`vehicle_plate`),
                KEY `idx_status`     (`status`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ]])

        -- dealership_coupons
        MySQL.Async.execute([[
            CREATE TABLE IF NOT EXISTS `dealership_coupons` (
                `id`              INT UNSIGNED   NOT NULL AUTO_INCREMENT,
                `dealership_id`   INT UNSIGNED   NOT NULL,
                `code`            VARCHAR(50)    NOT NULL,
                `discount_type`   VARCHAR(30)    NOT NULL DEFAULT 'percent',
                `discount_value`  DECIMAL(12,2)  NOT NULL DEFAULT 0.00,
                `max_uses`        INT UNSIGNED   NOT NULL DEFAULT 1,
                `uses`            INT UNSIGNED   NOT NULL DEFAULT 0,
                `min_purchase`    BIGINT         NOT NULL DEFAULT 0,
                `vehicle_filter`  JSON           DEFAULT NULL,
                `expires_at`      TIMESTAMP      NULL DEFAULT NULL,
                `created_by`      VARCHAR(50)    DEFAULT NULL,
                `created_at`      TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (`id`),
                KEY `idx_dealership` (`dealership_id`),
                UNIQUE KEY `idx_code` (`dealership_id`, `code`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ]])

        -- dealership_deliveries
        MySQL.Async.execute([[
            CREATE TABLE IF NOT EXISTS `dealership_deliveries` (
                `id`               INT UNSIGNED   NOT NULL AUTO_INCREMENT,
                `dealership_id`    INT UNSIGNED   NOT NULL,
                `stock_ids`        JSON           DEFAULT NULL,
                `pickup_location`  VARCHAR(100)   DEFAULT NULL,
                `route`            VARCHAR(100)   DEFAULT NULL,
                `status`           VARCHAR(30)    NOT NULL DEFAULT 'pending',
                `assigned_to`      VARCHAR(50)    DEFAULT NULL,
                `started_at`       TIMESTAMP      NULL DEFAULT NULL,
                `completed_at`     TIMESTAMP      NULL DEFAULT NULL,
                `metadata`         JSON           DEFAULT NULL,
                PRIMARY KEY (`id`),
                KEY `idx_dealership` (`dealership_id`),
                KEY `idx_status`     (`status`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ]])

        -- Load dealerships into cache after tables are ready
        LoadDealerships()
    end)
end)

-- ─── Player Identifier Utilities ─────────────────────────────────────────────

function GetPlayerIdentifiersArray(source)
    local source = tonumber(source)
    if not source then return {} end
    local identifierTypes = {"steam", "discord", "xbl", "live", "license", "license2", "fivem", "ip"}
    local identifiers = {}
    for i = 1, #identifierTypes do
        local identifier = GetPlayerIdentifierByType(source, identifierTypes[i])
        if identifier then
            table.insert(identifiers, identifier)
        end
    end
    return identifiers
end

function GetFilteredPlayerIdentifiers(source)
    local source = tonumber(source)
    if not source then return end
    local identifiers = GetPlayerIdentifiersArray(source)
    local filteredIdentifiers = {}
    for i = 1, #identifiers do
        if not string.match(identifiers[i], "ip:") or not Config.DisableIPIdentifier then
            table.insert(filteredIdentifiers, identifiers[i])
        end
    end
    return filteredIdentifiers
end

function GetPlayerPrefixIdentifier(source)
    local source = tonumber(source)
    if not source then return end
    local prefix = Config.IdentifierPrefix
    local identifiers = GetPlayerIdentifiersArray(source)
    for i = 1, #identifiers do
        if string.match(identifiers[i], prefix .. ":") then
            return identifiers[i]
        end
    end
    if prefix == "license2" then
        for i = 1, #identifiers do
            if string.match(identifiers[i], "license:") then
                return identifiers[i]
            end
        end
    end
end

-- ─── Dealership Cache Functions ──────────────────────────────────────────────

function LoadDealerships()
    local rows = MySQL.query.await("SELECT * FROM `dealerships`")
    if not rows then return end

    DealershipCache = {}
    for i = 1, #rows do
        local row = rows[i]
        if row.metadata and type(row.metadata) == "string" then
            row.metadata = json.decode(row.metadata) or {}
        end
        DealershipCache[row.id] = row
    end

    print(("[pickle_dealerships] Loaded %d dealership(s) into cache."):format(#rows))
end

function GetDealership(id)
    if not id then return nil end
    return DealershipCache[tonumber(id)]
end

function GetDealershipByLocation(location)
    if not location then return nil end
    for _, dealership in pairs(DealershipCache) do
        if dealership.location == location then
            return dealership
        end
    end
    return nil
end

function UpdateDealershipCache(id, data)
    id = tonumber(id)
    if not id or not data then return end
    if DealershipCache[id] then
        for k, v in pairs(data) do
            DealershipCache[id][k] = v
        end
    else
        DealershipCache[id] = data
    end
end

function AddLedgerEntry(dealershipId, type, amount, description, citizenid)
    if not dealershipId or not type or not amount then return end
    MySQL.insert(
        "INSERT INTO `dealership_ledger` (`dealership_id`, `type`, `amount`, `description`, `citizenid`) VALUES (?, ?, ?, ?, ?)",
        { tonumber(dealershipId), type, tonumber(amount), description or "", citizenid }
    )
end

-- ─── Permission Checking ─────────────────────────────────────────────────────

function GetPlayerDealershipRole(source, dealershipId)
    local source = tonumber(source)
    dealershipId = tonumber(dealershipId)
    if not source or not dealershipId then return nil end

    -- Check if the player is the owner
    local dealership = GetDealership(dealershipId)
    if not dealership then return nil end

    local citizenid = nil

    -- Attempt to resolve citizenid via QBCore / framework
    local QBCore = exports["qb-core"]:GetCoreObject()
    if QBCore then
        local Player = QBCore.Functions.GetPlayer(source)
        if Player then
            citizenid = Player.PlayerData.citizenid
        end
    end

    if not citizenid then return nil end

    -- Owner check via dealership table
    if dealership.owner_citizenid == citizenid then
        return "owner"
    end

    -- Employee check via dealership_employees table
    local rows = MySQL.query.await(
        "SELECT `role` FROM `dealership_employees` WHERE `dealership_id` = ? AND `citizenid` = ? LIMIT 1",
        { dealershipId, citizenid }
    )

    if rows and rows[1] then
        return rows[1].role
    end

    return nil
end

function CanPlayerManage(source, dealershipId)
    local role = GetPlayerDealershipRole(source, dealershipId)
    return role == "owner" or role == "manager"
end

function CanPlayerSell(source, dealershipId)
    local role = GetPlayerDealershipRole(source, dealershipId)
    return role == "owner" or role == "manager" or role == "salesperson"
end
