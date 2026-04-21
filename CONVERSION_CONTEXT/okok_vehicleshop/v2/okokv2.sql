
-- A despejar estrutura para tabela generationx_base.okokvehicleshop_vehicles
CREATE TABLE IF NOT EXISTS `okokvehicleshop_vehicles` (
  `vehicle_name` varchar(255) NOT NULL,
  `vehicle_id` varchar(255) NOT NULL,
  `category` varchar(255) NOT NULL,
  `type` varchar(255) NOT NULL,
  `stock` longtext DEFAULT NULL,
  `min_price` bigint(20) NOT NULL,
  `max_price` bigint(20) NOT NULL,
  `owner_buy_price` bigint(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- A despejar dados para tabela generationx_base.okokvehicleshop_vehicles: ~33 rows (aproximadamente)
INSERT INTO `okokvehicleshop_vehicles` (`vehicle_name`, `vehicle_id`, `category`, `type`, `stock`, `min_price`, `max_price`, `owner_buy_price`) VALUES
	('Zentorno', 'zentorno', 'super', 'vehicles', NULL, 45000, 50000, 40500),
	('Havok', 'havok', 'helicopters', 'air', NULL, 14995000, 15000000, 13495500),
	('Maverick', 'maverick', 'helicopters', 'air', NULL, 29995000, 30000000, 26995500),
	('Frogger', 'frogger', 'helicopters', 'air', NULL, 29995000, 30000000, 26995500),
	('Supervolito', 'supervolito', 'helicopters', 'air', NULL, 49995000, 50000000, 44995500),
	('Seashark', 'seashark', 'boat', 'boat', NULL, 245000, 250000, 220500),
	('Suntrap', 'suntrap', 'boat', 'boat', NULL, 295000, 300000, 265500),
	('Dinghy 2', 'dinghy2', 'boat', 'boat', NULL, 345000, 350000, 310500),
	('Seashark 3', 'seashark3', 'boat', 'boat', NULL, 270000, 275000, 243000),
	('Conada', 'conada', 'helicopters', 'air', NULL, 34995000, 35000000, 31495500),
	('Bati 801', 'bati', 'motorcycles', 'vehicles', NULL, 1995000, 2000000, 1795500),
	('double', 'Double', 'motorcycles', 'vehicles', NULL, 995000, 1000000, 895500),
	('Bf 400', 'bf400', 'motorcycles', 'vehicles', NULL, 195000, 200000, 175500),
	('Avarus', 'avarus', 'motorcycles', 'vehicles', NULL, 195000, 200000, 175500),
	('Hakuchou', 'hakuchou', 'motorcycles', 'vehicles', NULL, 1995000, 2000000, 1795500),
	('Hakuchou 2', 'hakuchou2', 'motorcycles', 'vehicles', NULL, 2495000, 2500000, 2245500),
	('Faggio', 'faggio', 'motorcycles', 'vehicles', NULL, 45000, 50000, 40500),
	('Zombie B', 'zombieb', 'motorcycles', 'vehicles', NULL, 195000, 200000, 175500),
	('Zombie A', 'zombiea', 'motorcycles', 'vehicles', NULL, 195000, 200000, 175500),
	('Enduro', 'enduro', 'motorcycles', 'vehicles', NULL, 145000, 150000, 130500),
	('Akuma', 'akuma', 'motorcycles', 'vehicles', NULL, 195000, 200000, 175500),
	('Blazer 4', 'blazer4', 'motorcycles', 'vehicles', NULL, 395000, 400000, 355500),
	('Manchez 2', 'manchez2', 'motorcycles', 'vehicles', NULL, 145000, 150000, 130500),
	('Lectro', 'lectro', 'motorcycles', 'vehicles', NULL, 495000, 500000, 445500),
	('Hexer', 'hexer', 'motorcycles', 'vehicles', NULL, 195000, 200000, 175500),
	('Esskey', 'esskey', 'motorcycles', 'vehicles', NULL, 115000, 120000, 103500),
	('Diablous 2', 'diablous2', 'motorcycles', 'vehicles', NULL, 395000, 400000, 355500),
	('Akuma C', 'akuma', 'motorcycles', 'vehicles', NULL, 295000, 300000, 265500),
	('Sanchez', 'sanchez', 'motorcycles', 'vehicles', NULL, 195000, 200000, 175500),
	('Sanctus', 'sanctus', 'motorcycles', 'vehicles', NULL, 495000, 500000, 445500),
	('Hiroshima', 'hiroshima', 'motorcycles', 'vehicles', NULL, 695000, 700000, 625500),
	('Krust', 'krust', 'motorcycles', 'vehicles', NULL, 345000, 350000, 310500),
	('Vtf 1000', 'vtf1000', 'motorcycles', 'vehicles', NULL, 445000, 450000, 400500);
