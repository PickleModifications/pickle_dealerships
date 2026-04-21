/* IF YOU HAVE VEHICLE SHOP V1, RUN THE SQL BELLOW */

ALTER TABLE `okokvehicleshop_shops` ADD `weekly_profit_goal` INT NOT NULL DEFAULT 250000;
ALTER TABLE `okokvehicleshop_shops` ADD `weekly_profits` INT NOT NULL DEFAULT 0;

ALTER TABLE `okokvehicleshop_vehicles` DROP COLUMN `listed`;

ALTER TABLE `okokvehicleshop_orders` ADD `customer_name` varchar(255) NOT NULL;
ALTER TABLE `okokvehicleshop_orders` ADD `customer_phone` varchar(255) NOT NULL;
ALTER TABLE `okokvehicleshop_orders` ADD `customer_id` varchar(255) NOT NULL;
ALTER TABLE `okokvehicleshop_orders` ADD `status` varchar(255) NOT NULL;
ALTER TABLE `okokvehicleshop_orders` ADD `buy_price` varchar(255) NOT NULL DEFAULT 0;
ALTER TABLE `okokvehicleshop_orders` ADD `price` varchar(255) NOT NULL DEFAULT 0;
ALTER TABLE `okokvehicleshop_orders` ADD `custom_order` TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE `okokvehicleshop_orders` ADD `vehicle_color` LONGTEXT NOT NULL;
ALTER TABLE `okokvehicleshop_orders` ADD `personal_purchase` TINYINT(1) NOT NULL DEFAULT 0;

ALTER TABLE `okokvehicleshop_orders` DROP COLUMN `in_progress`;

CREATE TABLE IF NOT EXISTS `okokvehicleshop_financed_vehicles`(
    `id` int(11) NOT NULL AUTO_INCREMENT,
    `vehicle_name` varchar(255) NOT NULL,
    `vehicle_id` varchar(255) NOT NULL,
    `vehicle_plate` varchar(255) NOT NULL,
    `finance_amount` BIGINT DEFAULT 0,
    `monthly_payment` BIGINT DEFAULT 0,
    `paid_amount` BIGINT DEFAULT 0,
    `owner_id` varchar(255) NOT NULL,
    `failed_payments` int(11) NOT NULL DEFAULT 0,
    `success_payments` int(11) NOT NULL DEFAULT 0,
    `total_payments` int(11) NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`)
);


/* IF YOU ONLY HAVE VEHICLE SHOP V2, RUN THE SQL BELLOW */

CREATE TABLE IF NOT EXISTS `okokvehicleshop_shops`(
	`shop_name` varchar(255) NOT NULL,
	`shop_id` varchar(255) NOT NULL PRIMARY KEY,
	`owner` varchar(255) NULL DEFAULT NULL,
	`owner_name` varchar(255) NULL DEFAULT NULL,
	`money` varchar(255) NOT NULL,
	`employees` longtext NULL,
	`weekly_profit_goal` INT NOT NULL DEFAULT 250000,
	`weekly_profits` INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS `okokvehicleshop_vehicles`(
    `vehicle_name` varchar(255) NOT NULL,
    `vehicle_id` varchar(255) NOT NULL,
    `category` varchar(255) NOT NULL,
    `type` varchar(255) NOT NULL,
    `stock` LONGTEXT NULL,
    `min_price` BIGINT NOT NULL,
    `max_price` BIGINT NOT NULL,
    `owner_buy_price` BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS `okokvehicleshop_saleshistory`(
    `shop_id` varchar(255) NOT NULL,
    `vehicle_name` varchar(255) NOT NULL,
    `vehicle_id` varchar(255) NOT NULL,
    `buyer_name` varchar(255) NOT NULL,
    `buyer_id` varchar(255) NOT NULL,
    `price` varchar(255) NOT NULL,
    `date` varchar(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS `okokvehicleshop_orders`(
    `id` int(11) NOT NULL AUTO_INCREMENT,
    `shop_id` varchar(255) NOT NULL,
    `shop_type` varchar(255) NOT NULL,
    `vehicle_name` varchar(255) NOT NULL,
    `vehicle_id` varchar(255) NOT NULL,
    `reward` varchar(255) NOT NULL,
    `buy_price` varchar(255) NOT NULL DEFAULT 0,
    `price` varchar(255) NOT NULL DEFAULT 0,
    `status` varchar(255) NOT NULL,
    `employee_name` varchar(255) NOT NULL,
    `employee_id` varchar(255) NOT NULL,
    `customer_name` varchar(255) NOT NULL,
    `customer_id` varchar(255) NOT NULL,
    `customer_phone` varchar(255) NOT NULL,
    `custom_order` TINYINT(1) NOT NULL DEFAULT 0,
    `vehicle_color` LONGTEXT NOT NULL,
    `personal_purchase` TINYINT(1) NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`)
);

CREATE TABLE IF NOT EXISTS `okokvehicleshop_logs`(
    `id` int(11) NOT NULL AUTO_INCREMENT,
    `shop_id` varchar(255) NOT NULL,
    `action` varchar(255) NOT NULL,
    `employee_name` varchar(255) NOT NULL,
    `employee_id` varchar(255) NOT NULL,
    `date` varchar(255) NOT NULL,
    PRIMARY KEY (`id`)
);

CREATE TABLE IF NOT EXISTS `okokvehicleshop_financed_vehicles`(
    `id` int(11) NOT NULL AUTO_INCREMENT,
    `vehicle_name` varchar(255) NOT NULL,
    `vehicle_id` varchar(255) NOT NULL,
    `vehicle_plate` varchar(255) NOT NULL,
    `finance_amount` BIGINT DEFAULT 0,
    `paid_amount` BIGINT DEFAULT 0,
    `monthly_payment` BIGINT DEFAULT 0,
    `owner_id` varchar(255) NOT NULL,
    `failed_payments` int(11) NOT NULL DEFAULT 0,
    `success_payments` int(11) NOT NULL DEFAULT 0,
    `total_payments` int(11) NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`)
);