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
                `owner_identifier`  VARCHAR(50)     DEFAULT NULL,
                `tier`             INT UNSIGNED    NOT NULL DEFAULT 1,
                `balance`          BIGINT          NOT NULL DEFAULT 0,
                `reputation`       INT             NOT NULL DEFAULT 0,
                `job`              VARCHAR(50)     DEFAULT NULL,
                `metadata`         JSON            DEFAULT NULL,
                `created_at`       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
                `updated_at`       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (`id`),
                KEY `idx_location` (`location`),
                KEY `idx_owner`    (`owner_identifier`),
                KEY `idx_job`      (`job`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ]])

        -- dealership_employees
        MySQL.Async.execute([[
            CREATE TABLE IF NOT EXISTS `dealership_employees` (
                `id`              INT UNSIGNED   NOT NULL AUTO_INCREMENT,
                `dealership_id`   INT UNSIGNED   NOT NULL,
                `identifier`       VARCHAR(50)    NOT NULL,
                `role`            VARCHAR(30)    NOT NULL DEFAULT 'salesperson',
                `commission_rate` DECIMAL(5,2)   NOT NULL DEFAULT 0.00,
                `hired_at`        TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
                `metadata`        JSON           DEFAULT NULL,
                PRIMARY KEY (`id`),
                KEY `idx_dealership` (`dealership_id`),
                KEY `idx_citizen`    (`identifier`)
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
                `quantity`        INT UNSIGNED   NOT NULL DEFAULT 1,
                `metadata`        JSON           DEFAULT NULL,
                PRIMARY KEY (`id`),
                KEY `idx_dealership` (`dealership_id`),
                KEY `idx_model`      (`vehicle_model`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ]])

        -- Migration: rename citizenid columns to identifier for framework-agnostic support
        MySQL.Async.execute([[ ALTER TABLE `dealerships` CHANGE COLUMN IF EXISTS `owner_citizenid` `owner_identifier` VARCHAR(50) DEFAULT NULL ]])
        MySQL.Async.execute([[ ALTER TABLE `dealership_employees` CHANGE COLUMN IF EXISTS `citizenid` `identifier` VARCHAR(50) NOT NULL ]])
        MySQL.Async.execute([[ ALTER TABLE `dealership_ledger` CHANGE COLUMN IF EXISTS `citizenid` `identifier` VARCHAR(50) DEFAULT NULL ]])
        MySQL.Async.execute([[ ALTER TABLE `dealership_financing` CHANGE COLUMN IF EXISTS `citizenid` `identifier` VARCHAR(50) NOT NULL ]])

        -- Migration: add quantity column for existing databases
        MySQL.Async.execute([[
            ALTER TABLE `dealership_stock` ADD COLUMN IF NOT EXISTS `quantity` INT UNSIGNED NOT NULL DEFAULT 1 AFTER `sold_by`;
        ]])

        -- Migration: pre-owned vehicle support (metadata reused for captured vehicle properties)
        MySQL.Async.execute([[ ALTER TABLE `dealership_stock` ADD COLUMN IF NOT EXISTS `is_used` TINYINT(1) NOT NULL DEFAULT 0 AFTER `quantity` ]])
        MySQL.Async.execute([[ ALTER TABLE `dealership_stock` ADD COLUMN IF NOT EXISTS `plate` VARCHAR(20) DEFAULT NULL AFTER `metadata` ]])
        MySQL.Async.execute([[ ALTER TABLE `dealership_stock` ADD COLUMN IF NOT EXISTS `acquired_from` VARCHAR(50) DEFAULT NULL AFTER `plate` ]])

        -- Migration: seize vehicle support
        MySQL.Async.execute([[ ALTER TABLE `dealerships` ADD COLUMN IF NOT EXISTS `seize_enabled` TINYINT(1) NOT NULL DEFAULT 0 AFTER `job` ]])
        MySQL.Async.execute([[ ALTER TABLE `dealership_stock` ADD COLUMN IF NOT EXISTS `unlisted` TINYINT(1) NOT NULL DEFAULT 0 AFTER `is_used` ]])

        -- dealership_orders — pending/in-transit orders (separate from available stock)
        MySQL.Async.execute([[
            CREATE TABLE IF NOT EXISTS `dealership_orders` (
                `id`              INT UNSIGNED   NOT NULL AUTO_INCREMENT,
                `dealership_id`   INT UNSIGNED   NOT NULL,
                `vehicle_model`   VARCHAR(100)   NOT NULL,
                `vehicle_label`   VARCHAR(150)   DEFAULT NULL,
                `retail_price`    BIGINT         NOT NULL DEFAULT 0,
                `wholesale_cost`  BIGINT         NOT NULL DEFAULT 0,
                `quantity`        INT UNSIGNED   NOT NULL DEFAULT 1,
                `ordered_at`      TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
                `delivered_at`    TIMESTAMP      NULL DEFAULT NULL,
                PRIMARY KEY (`id`),
                KEY `idx_dealership` (`dealership_id`),
                KEY `idx_model`      (`vehicle_model`),
                KEY `idx_delivered`  (`delivered_at`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ]])

        -- One-time migration: move any existing in-transit entries from dealership_stock to dealership_orders
        MySQL.Async.execute([[
            INSERT INTO dealership_orders (dealership_id, vehicle_model, vehicle_label, retail_price, wholesale_cost, quantity, ordered_at, delivered_at)
            SELECT dealership_id, vehicle_model, vehicle_label, retail_price, wholesale_cost, quantity, COALESCE(ordered_at, NOW()), delivered_at
            FROM dealership_stock
            WHERE sold_at IS NULL AND display_spot IS NULL AND delivered_at IS NOT NULL AND delivered_at > NOW()
        ]])
        MySQL.Async.execute([[
            DELETE FROM dealership_stock
            WHERE sold_at IS NULL AND display_spot IS NULL AND delivered_at IS NOT NULL AND delivered_at > NOW()
        ]])

        -- Migration: consolidation of duplicate stock entries is handled by the background thread
        -- in modules/stock/server.lua (runs every 30s with safe per-row updates/deletes)

        -- dealership_ledger
        MySQL.Async.execute([[
            CREATE TABLE IF NOT EXISTS `dealership_ledger` (
                `id`              INT UNSIGNED   NOT NULL AUTO_INCREMENT,
                `dealership_id`   INT UNSIGNED   NOT NULL,
                `type`            VARCHAR(50)    NOT NULL,
                `amount`          BIGINT         NOT NULL DEFAULT 0,
                `description`     TEXT           DEFAULT NULL,
                `identifier`       VARCHAR(50)    DEFAULT NULL,
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
                `identifier`          VARCHAR(50)    NOT NULL,
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
                KEY `idx_citizen`    (`identifier`),
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

        -- wholesale_catalog (admin-managed vehicle catalog)
        MySQL.Async.execute([[
            CREATE TABLE IF NOT EXISTS `wholesale_catalog` (
                `id`              INT UNSIGNED   NOT NULL AUTO_INCREMENT,
                `model`           VARCHAR(100)   NOT NULL,
                `label`           VARCHAR(150)   NOT NULL,
                `wholesale`       BIGINT         NOT NULL DEFAULT 0,
                `tier`            VARCHAR(30)    NOT NULL DEFAULT 'basic',
                `class`           VARCHAR(50)    NOT NULL DEFAULT 'sedan',
                `vehicle_type`    VARCHAR(30)    NOT NULL DEFAULT 'car',
                `created_at`      TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (`id`),
                UNIQUE KEY `idx_model` (`model`),
                KEY `idx_type`    (`vehicle_type`),
                KEY `idx_tier`    (`tier`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ]])

        -- Migration: add job column if missing
        MySQL.Async.execute([[
            ALTER TABLE `dealerships` ADD COLUMN IF NOT EXISTS `job` VARCHAR(50) DEFAULT NULL AFTER `metadata`;
        ]])

        -- Migration: add image column to wholesale_catalog
        MySQL.Async.execute([[
            ALTER TABLE `wholesale_catalog` ADD COLUMN IF NOT EXISTS `image` MEDIUMTEXT DEFAULT NULL AFTER `vehicle_type`;
        ]])

        -- Auctions
        MySQL.Async.execute([[
            CREATE TABLE IF NOT EXISTS `dealership_auctions` (
                `id`                  INT AUTO_INCREMENT PRIMARY KEY,
                `stock_id`            INT NOT NULL,
                `dealership_id`       INT NOT NULL,
                `seller_identifier`   VARCHAR(50) DEFAULT NULL,
                `starting_bid`        BIGINT NOT NULL,
                `min_increment`       INT NOT NULL DEFAULT 100,
                `reserve_price`       BIGINT DEFAULT NULL,
                `buyout_price`        BIGINT DEFAULT NULL,
                `current_bid`         BIGINT DEFAULT NULL,
                `current_bidder`      VARCHAR(50) DEFAULT NULL,
                `started_at`          DATETIME DEFAULT CURRENT_TIMESTAMP,
                `ends_at`             DATETIME NOT NULL,
                `ended_at`            DATETIME DEFAULT NULL,
                `status`              ENUM('active','won','cancelled','no_sale') NOT NULL DEFAULT 'active',
                `winner_identifier`   VARCHAR(50) DEFAULT NULL,
                `winning_bid`         BIGINT DEFAULT NULL,
                `claimed_at`          DATETIME DEFAULT NULL,
                KEY `idx_status`  (`status`),
                KEY `idx_ends_at` (`ends_at`),
                KEY `idx_winner`  (`winner_identifier`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ]])

        MySQL.Async.execute([[
            CREATE TABLE IF NOT EXISTS `dealership_auction_bids` (
                `id`                  INT AUTO_INCREMENT PRIMARY KEY,
                `auction_id`          INT NOT NULL,
                `bidder_identifier`   VARCHAR(50) NOT NULL,
                `amount`              BIGINT NOT NULL,
                `placed_at`           DATETIME DEFAULT CURRENT_TIMESTAMP,
                `refunded`            TINYINT(1) NOT NULL DEFAULT 0,
                KEY `idx_auction` (`auction_id`),
                KEY `idx_bidder`  (`bidder_identifier`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ]])

        MySQL.Async.execute([[
            ALTER TABLE `dealership_stock` ADD COLUMN IF NOT EXISTS `auction_id` INT DEFAULT NULL AFTER `acquired_from`;
        ]])

        -- Deferred-timer model: ends_at becomes nullable (starts on first bid), duration stored upfront
        MySQL.Async.execute([[
            ALTER TABLE `dealership_auctions` ADD COLUMN IF NOT EXISTS `duration_minutes` INT NOT NULL DEFAULT 10 AFTER `buyout_price`;
        ]])
        MySQL.Async.execute([[
            ALTER TABLE `dealership_auctions` MODIFY COLUMN `ends_at` DATETIME DEFAULT NULL;
        ]])

        -- Per-dealership financing settings (JSON blob)
        MySQL.Async.execute([[
            ALTER TABLE `dealerships` ADD COLUMN IF NOT EXISTS `financing_settings` JSON DEFAULT NULL AFTER `metadata`;
        ]])

        -- Seed default wholesale catalog (INSERT IGNORE skips existing entries)
        local seedSQL = LoadResourceFile(GetCurrentResourceName(), "catalog_seed.sql")
        if seedSQL then
            MySQL.Async.execute(seedSQL)
        end

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

function AddLedgerEntry(dealershipId, type, amount, description, identifier)
    if not dealershipId or not type or not amount then return end
    MySQL.insert(
        "INSERT INTO `dealership_ledger` (`dealership_id`, `type`, `amount`, `description`, `identifier`) VALUES (?, ?, ?, ?, ?)",
        { tonumber(dealershipId), type, tonumber(amount), description or "", identifier }
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

    local identifier = GetIdentifier(source)
    if not identifier then return nil end

    -- Owner check via dealership table
    if dealership.owner_identifier == identifier then
        return "owner"
    end

    -- Employee check via dealership_employees table
    local rows = MySQL.query.await(
        "SELECT `role` FROM `dealership_employees` WHERE `dealership_id` = ? AND `identifier` = ? LIMIT 1",
        { dealershipId, identifier }
    )

    if rows and rows[1] then
        return rows[1].role
    end

    return nil
end

function CanPlayerManage(source, dealershipId)
    if IsPlayerAdmin(source) then return true end
    local role = GetPlayerDealershipRole(source, dealershipId)
    return role == "owner" or role == "manager"
end

function CanPlayerSell(source, dealershipId)
    if IsPlayerAdmin(source) then return true end
    local role = GetPlayerDealershipRole(source, dealershipId)
    return role == "owner" or role == "manager" or role == "salesperson"
end
