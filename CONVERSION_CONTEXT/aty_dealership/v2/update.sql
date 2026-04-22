CREATE TABLE IF NOT EXISTS `vehicle_installments` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `citizenid` varchar(50) NOT NULL,
  `vehicle_model` varchar(50) NOT NULL,
  `vehicle_label` varchar(50) DEFAULT NULL,
  `plate` varchar(50) NOT NULL,
  `dealership_id` int(11) DEFAULT NULL,
  `total_amount` int(11) NOT NULL,
  `remaining_amount` int(11) NOT NULL,
  `monthly_payment` int(11) NOT NULL,
  `remaining_months` int(11) NOT NULL,
  `next_payment_date` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `citizenid` (`citizenid`),
  KEY `dealership_id` (`dealership_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE `aty_dealership` ADD COLUMN `coupons` longtext DEFAULT '{}';
ALTER TABLE `aty_dealership` ADD COLUMN `employees` longtext DEFAULT '[]';
ALTER TABLE `aty_dealership` ADD COLUMN `ranks` longtext DEFAULT '[]';