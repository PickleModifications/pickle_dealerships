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

        -- Gameplay delivery system: extend dealership_orders for queue/claim flow
        MySQL.Async.execute([[ ALTER TABLE `dealership_orders` ADD COLUMN IF NOT EXISTS `delivery_mode` VARCHAR(16) NOT NULL DEFAULT 'expedited' AFTER `quantity` ]])
        MySQL.Async.execute([[ ALTER TABLE `dealership_orders` ADD COLUMN IF NOT EXISTS `route_id` VARCHAR(32) DEFAULT NULL AFTER `delivery_mode` ]])
        MySQL.Async.execute([[ ALTER TABLE `dealership_orders` ADD COLUMN IF NOT EXISTS `delivery_fee` BIGINT NOT NULL DEFAULT 0 AFTER `route_id` ]])
        MySQL.Async.execute([[ ALTER TABLE `dealership_orders` ADD COLUMN IF NOT EXISTS `claimed_by` VARCHAR(64) DEFAULT NULL AFTER `delivery_fee` ]])
        MySQL.Async.execute([[ ALTER TABLE `dealership_orders` ADD COLUMN IF NOT EXISTS `claimed_at` DATETIME DEFAULT NULL AFTER `claimed_by` ]])
        MySQL.Async.execute([[ ALTER TABLE `dealership_orders` ADD INDEX IF NOT EXISTS `idx_orders_queue` (`delivery_mode`, `claimed_by`, `delivered_at`) ]])

        -- Gameplay delivery system: in-game configurable pickup depots (replaces static Config.DeliveryRoutes)
        MySQL.Async.execute([[
            CREATE TABLE IF NOT EXISTS `delivery_depots` (
                `id`             INT UNSIGNED   NOT NULL AUTO_INCREMENT,
                `name`           VARCHAR(100)   NOT NULL,
                `x`              DOUBLE         NOT NULL,
                `y`              DOUBLE         NOT NULL,
                `z`              DOUBLE         NOT NULL,
                `heading`        DOUBLE         NOT NULL DEFAULT 0,
                `distance_band`  VARCHAR(16)    NOT NULL DEFAULT 'short',
                `dropoff_radius` DOUBLE         NOT NULL DEFAULT 25.0,
                `active`         TINYINT(1)     NOT NULL DEFAULT 1,
                `created_at`     TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (`id`),
                KEY `idx_active_band` (`active`, `distance_band`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ]])

        -- Optional truck-spawn point — if the yard where the truck parks is distinct from where the
        -- dispatch ped stands, admins can capture a separate location. Null = use the ped coords.
        MySQL.Async.execute([[ ALTER TABLE `delivery_depots` ADD COLUMN IF NOT EXISTS `spawn_x` DOUBLE NULL ]])
        MySQL.Async.execute([[ ALTER TABLE `delivery_depots` ADD COLUMN IF NOT EXISTS `spawn_y` DOUBLE NULL ]])
        MySQL.Async.execute([[ ALTER TABLE `delivery_depots` ADD COLUMN IF NOT EXISTS `spawn_z` DOUBLE NULL ]])
        MySQL.Async.execute([[ ALTER TABLE `delivery_depots` ADD COLUMN IF NOT EXISTS `spawn_heading` DOUBLE NULL ]])

        -- Gameplay delivery system: per-player driver progression
        MySQL.Async.execute([[
            CREATE TABLE IF NOT EXISTS `dealership_driver_progression` (
                `identifier`         VARCHAR(64)   NOT NULL,
                `xp`                 INT           NOT NULL DEFAULT 0,
                `level`              INT           NOT NULL DEFAULT 1,
                `completed_count`    INT           NOT NULL DEFAULT 0,
                `failed_count`       INT           NOT NULL DEFAULT 0,
                `streak`             INT           NOT NULL DEFAULT 0,
                `lifetime_earnings`  BIGINT        NOT NULL DEFAULT 0,
                `updated_at`         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (`identifier`)
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
        LoadDeliveryDepots()
    end)
end)

-- ─── Delivery Depot Cache ────────────────────────────────────────────────────

DeliveryDepotCache = {}

local function rowToDepot(row)
    -- NOTE: coord tables are plain Lua (not vector4) so they JSON-serialise cleanly to the NUI.
    -- Mission code reads .x/.y/.z/.w so the shape is interchangeable with vector4 at call sites.
    -- `pickupCoords` is where the dispatch ped stands and where drivers interact to start a mission.
    -- `spawnCoords` is where the truck + trailer rig actually spawns; falls back to pickup if unset
    -- so existing depots keep working without reconfiguration.
    local hasSpawn = row.spawn_x and row.spawn_y and row.spawn_z
    return {
        id = row.id,
        name = row.name,
        label = row.name,
        pickupCoords = { x = row.x, y = row.y, z = row.z, w = row.heading or 0.0 },
        spawnCoords = hasSpawn
            and { x = row.spawn_x, y = row.spawn_y, z = row.spawn_z, w = row.spawn_heading or 0.0 }
            or nil,
        active = row.active == 1 or row.active == true,
    }
end

function LoadDeliveryDepots()
    local rows = MySQL.query.await("SELECT * FROM `delivery_depots` WHERE `active` = 1 ORDER BY `id` ASC") or {}

    -- If table is empty, seed from the legacy Config.DeliveryRoutes so existing servers keep working
    if #rows == 0 and Config.DeliveryRoutes then
        for _, r in pairs(Config.DeliveryRoutes) do
            local px, py, pz, pw = r.pickupCoords.x, r.pickupCoords.y, r.pickupCoords.z, r.pickupCoords.w or 0.0
            MySQL.insert.await(
                "INSERT INTO `delivery_depots` (`name`, `x`, `y`, `z`, `heading`, `active`) VALUES (?, ?, ?, ?, ?, 1)",
                { r.label or 'Depot', px, py, pz, pw }
            )
        end
        rows = MySQL.query.await("SELECT * FROM `delivery_depots` WHERE `active` = 1 ORDER BY `id` ASC") or {}
    end

    DeliveryDepotCache = {}
    for _, row in ipairs(rows) do
        DeliveryDepotCache[row.id] = rowToDepot(row)
    end
    print(("[pickle_dealerships] Loaded %d delivery depot(s) into cache."):format(#rows))
end

function GetDeliveryDepots()
    local out = {}
    for _, d in pairs(DeliveryDepotCache) do out[#out + 1] = d end
    return out
end

function CreateDeliveryDepot(name, x, y, z, heading)
    if not name or not x or not y or not z then return nil, 'Invalid arguments.' end
    local id = MySQL.insert.await(
        "INSERT INTO `delivery_depots` (`name`, `x`, `y`, `z`, `heading`) VALUES (?, ?, ?, ?, ?)",
        { name, x, y, z, heading or 0.0 }
    )
    if id then
        DeliveryDepotCache[id] = {
            id = id, name = name, label = name,
            pickupCoords = { x = x, y = y, z = z, w = heading or 0.0 },
            spawnCoords = nil, -- set later via SetDeliveryDepotSpawn; falls back to pickup until then
            active = true,
        }
    end
    return id
end

--- Sets (or clears, if all coords are nil) the separate truck-spawn point for a depot.
function SetDeliveryDepotSpawn(id, x, y, z, heading)
    id = tonumber(id)
    if not id or not DeliveryDepotCache[id] then return false end
    if x == nil or y == nil or z == nil then
        MySQL.update.await(
            "UPDATE `delivery_depots` SET `spawn_x` = NULL, `spawn_y` = NULL, `spawn_z` = NULL, `spawn_heading` = NULL WHERE `id` = ?",
            { id }
        )
        DeliveryDepotCache[id].spawnCoords = nil
    else
        MySQL.update.await(
            "UPDATE `delivery_depots` SET `spawn_x` = ?, `spawn_y` = ?, `spawn_z` = ?, `spawn_heading` = ? WHERE `id` = ?",
            { x, y, z, heading or 0.0, id }
        )
        DeliveryDepotCache[id].spawnCoords = { x = x, y = y, z = z, w = heading or 0.0 }
    end
    return true
end

function UpdateDeliveryDepot(id, fields)
    id = tonumber(id)
    if not id or not DeliveryDepotCache[id] then return false end
    local allowed = { name = true, active = true }
    local sets, params = {}, {}
    for k, v in pairs(fields or {}) do
        if allowed[k] then
            sets[#sets + 1] = ("`%s` = ?"):format(k)
            params[#params + 1] = v
        end
    end
    if #sets == 0 then return false end
    params[#params + 1] = id
    MySQL.update.await(("UPDATE `delivery_depots` SET %s WHERE `id` = ?"):format(table.concat(sets, ", ")), params)
    LoadDeliveryDepots()
    return true
end

function DeleteDeliveryDepot(id)
    id = tonumber(id)
    if not id then return false end
    MySQL.update.await("UPDATE `delivery_depots` SET `active` = 0 WHERE `id` = ?", { id })
    DeliveryDepotCache[id] = nil
    return true
end

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

-- ─── Driver Progression ──────────────────────────────────────────────────────

local function ResolveDriverLevel(xp)
    local levels = Config.DeliveryProgression and Config.DeliveryProgression.levels
    if not levels then return 1 end
    local resolved = 1
    for lvl, def in pairs(levels) do
        if xp >= (def.xpRequired or 0) and lvl > resolved then
            resolved = lvl
        end
    end
    return resolved
end

local function ResolveNextThreshold(level)
    local levels = Config.DeliveryProgression and Config.DeliveryProgression.levels
    if not levels then return nil end
    local next = levels[level + 1]
    return next and next.xpRequired or nil
end

function GetDriverProgression(identifier)
    if not identifier then return nil end
    local row = MySQL.single.await(
        "SELECT * FROM `dealership_driver_progression` WHERE `identifier` = ?",
        { identifier }
    )
    if not row then
        MySQL.insert.await(
            "INSERT INTO `dealership_driver_progression` (`identifier`) VALUES (?)",
            { identifier }
        )
        row = { identifier = identifier, xp = 0, level = 1, completed_count = 0, failed_count = 0, streak = 0, lifetime_earnings = 0 }
    end
    row.level = ResolveDriverLevel(row.xp or 0)
    row.xp_to_next = ResolveNextThreshold(row.level)
    return row
end

function AddDriverXP(identifier, xp)
    if not identifier or not xp or xp == 0 then return nil end
    local current = GetDriverProgression(identifier)
    if not current then return nil end
    local oldLevel = current.level or 1
    local newXP = math.max(0, (current.xp or 0) + xp)
    local newLevel = ResolveDriverLevel(newXP)
    MySQL.update.await(
        "UPDATE `dealership_driver_progression` SET `xp` = ?, `level` = ? WHERE `identifier` = ?",
        { newXP, newLevel, identifier }
    )
    return { xp = newXP, level = newLevel, leveledUp = newLevel > oldLevel, oldLevel = oldLevel }
end

function RecordDriverDelivery(identifier, earnings, success)
    if not identifier then return end
    if success then
        MySQL.update.await(
            "UPDATE `dealership_driver_progression` SET `completed_count` = `completed_count` + 1, `streak` = `streak` + 1, `lifetime_earnings` = `lifetime_earnings` + ? WHERE `identifier` = ?",
            { math.max(0, tonumber(earnings) or 0), identifier }
        )
    else
        MySQL.update.await(
            "UPDATE `dealership_driver_progression` SET `failed_count` = `failed_count` + 1, `streak` = 0 WHERE `identifier` = ?",
            { identifier }
        )
    end
end

function CanDriverAccessTier(identifier, catalogTier)
    if not catalogTier then return true end
    local levels = Config.DeliveryProgression and Config.DeliveryProgression.levels
    if not levels then return true end
    local prog = GetDriverProgression(identifier)
    if not prog then return false end
    local def = levels[prog.level or 1]
    if not def or not def.catalogAccess then return false end
    return def.catalogAccess[catalogTier] == true
end

function GetDriverStreakMultiplier(identifier)
    local cfg = Config.Delivery and Config.Delivery.streak
    if not cfg or not cfg.enabled then return 1.0 end
    local prog = GetDriverProgression(identifier)
    if not prog then return 1.0 end
    local streak = prog.streak or 0
    local bonus = (cfg.perStreakBonusPct or 0) * streak
    local cap = (cfg.maxMultiplier or 1.0) - 1.0
    return 1.0 + math.min(bonus, cap)
end
