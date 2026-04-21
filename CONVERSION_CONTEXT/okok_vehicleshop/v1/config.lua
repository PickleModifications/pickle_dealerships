Config = {}

Config.Debug = false -- true = will print some debug messages

Config.QBPermissionsUpdate = false -- set it to true if you have the latest Permissions update

Config.UseRoutingBuckets = true -- true = use routing buckets | false = don't use routing buckets FALSE --- ---

Config.UseNewStaffCheckMethod = true -- only works if Config.QBPermissionsUpdate is set to true

Config.PayForOrder = true -- true = pay for the vehicle when you order it | false = don't pay and only receive the profit when selling

Config.SetVisibility = true -- true = player will be invisible when chosing a vehicle 

Config.SetInvincibility = true -- true = player will not die while test driving

Config.CheckForOfflineOrdersEvery = 10 -- In minutes | it'll check every x minutes for offline players with orders accepted, if someone is offline it'll cancel the order

Config.ShowVehicleShopBlip = true -- Activate/Deactivate Vehicle shop blips

Config.ShowOwnerBlip = true -- Activate/Deactivate owner blips

Config.ShowBuyVehicleShopBlip = true -- Activate/Deactivate buy shop blip

Config.ShowHasOwnerShopBlip = true -- Activate/Deactivate blip of shops with "hasOwner = false"

Config.TestDrive = true -- Activate/Deactivate test drive

-- Informations you need before using 'Config.AddVehiclesFromVehiclesFile':

-- All informations will be collected from the 'qb-core/shared/vehicles.lua' file
-- This is how a vehicle is added on that file:
--
-- ['nero'] = {
--	 ['name'] = 'Nero',
--	 ['brand'] = 'Truffade',
--	 ['model'] = 'nero',
--	 ['price'] = 200000,
--	 ['category'] = 'super',
--	 ['hash'] = `nero`,
--	 ['shop'] = 'luxury',
-- },
--
-- the 'shop' is what is set as 'type' in the database, you can either change the shops 'type' or the vehicle 'shop' to match one another
-- the categories may not be the same in the file and the shops so make sure to add/change or remove the ones you need here: 'Config.VehicleshopsCategories'
-- the 'price' will be set as the 'min_price' and the 'max_price' will be calculated this way: 'min_price + Config.MaxPriceAddition'
-- make sure you deactivate it once all the vehicles have been added otherwise it'll try to add them everytime the script is initialized
--
-- after starting the server/script you can check the progress on your server console

Config.AddVehiclesFromVehiclesFile = false -- if true it'll add all the vehicles form 'qb-core/shared/vehicles.lua' (turn off once used)

Config.UseMultiplierFactorForMinPrice = false -- true = calculate min price based on the multiplier factor (price*Config.MinPriceMultiplier) | false = min price will be the base price

Config.MinPriceMultiplier = 0.5 -- This is the multiplier factor for the min price (Config.UseMultiplierFactorForMinPrice = true)

Config.UseMultiplierFactorForMaxPrice = false -- true = calculate price based on the multiplier factor (price*Config.MaxPriceAddition) | false = calculate price based on the max price addition (price+Config.MaxPriceAddition)

Config.MaxPriceAddition = 25000 -- This is how much will be added to the vehicle price to create the max_price

Config.DevMode = false -- Allows you to restart the script (IMPORTANT: only set this to true if you are configuring the script)

Config.EventPrefix = "okokVehicleshop" -- this will change the prefix of the events name so if Config.EventPrefix = "example" the events will be "example:event"

Config.QBCorePrefix = "QBCore"

Config.qbPrefix = "qb"

Config.TestDrivePlate = "TEST"

Config.SalesDateFormat = "%d/%m - %H:%M"

Config.UseOkokTextUI = false -- true = okokTextUI (I recommend you using this since it is way more optimized than the default ShowHelpNotification) | false = ShowHelpNotification

Config.Key = 38 -- [E] Key to open the interaction, check here the keys ID: https://docs.fivem.net/docs/game-references/controls/#controls

Config.UseokokRequests = false -- true = use okokRequests for hiring people | false = don't use okokRequests - https://okok.tebex.io/package/4724985

Config.UseSameImageForVehicles = false -- true = use the same image for all vehicles (vehicle.png) | false = use different images for each vehicle (vehicle_id.png)

Config.HideMinimap = true -- If true it'll hide the minimap when the vehicle shop menu is opened

Config.TimeBetweenTransition = 7000 -- how much time it stays in a camera before changing, in miliseconds

Config.TransitionTime = 4000 -- how much time it takes to go from one camera to another (camera movement), in miliseconds

Config.ShakeAmplitude = 0.2 -- camera shake

Config.UseKMh = true -- true = use KM/h | false = use miles/h

Config.MaxVehiclesSpeed = 450 -- Max speed a vehicle can go at (it is only used for UI purposes, it does NOT change the speed of a vehicle)

Config.TestDriveTime = 40 -- In seconds

Config.StopTestDriveCmd = "cancel" -- command to stop the test drive

Config.PlateLetters  = 4 -- How many letters the plate has

Config.PlateNumbers  = 4 -- How many numbers the plate has

Config.PlateUseSpace = false	-- If the plate uses spaces between letters and numbers

Config.OrderReceivePercentage = false -- If true = players will receive a percentage of the vehicle price (Config.OrderCompletedPercentage) | if false = players receive a flat rate (Config.OrderCompletedFlatRate)

Config.OrderCompletedPercentage = 10 -- When a employee completes the misson he will get this percentage as a reward, 10 = 10% (Config.OrderReceivePercentage = true)

Config.OrderCompletedFlatRate = 5000 -- When a employee completes the misson he will get paid this value (Config.OrderReceivePercentage = false)

Config.HireRange = 3 -- How close a player needs to be to be in the hiring range

Config.AdminCommand = "vsadmin" -- command to open the admin menu

Config.OwnerBuyVehiclePercentage = 10 -- How much of a discount the owner has to order a vehicle (bases on the min. price)

Config.SellBusinessReceivePercentage = 50 -- How much a player will receive for selling his business (in percentage, 50 = 50%)

Config.ClearMoneyWhenBusinessIsSold = false -- true = remove the money from the society when sold | false = do not remove the money

Config.MaxDealershipsPerPlayer = 1 -- How many vehicle shops a player can own

Config.MaxEmployeesPerDealership = 4 -- How many employees a vehicle shop can hire

Config.EnableSellVehicle = true -- Allows players to sell their vehicles for a percentage of the vehicle's min price

Config.VehicleShopBuyVehicle = false -- true = when selling a bought vehicle the money will be discounted from the vehicle shop and the vehicle added to the stock | false = vehicle shop will not be charged or receive the vehicle

Config.VehicleSellPercentage = 50 -- 40 = seller will receive 40% of the vehicle min. price

Config.EnableOkokBankingTransactions = true -- true = when you buy a vehicle a transaction is added (okokBanking)

Config.AdminGroups = { -- Admin groups that can access the admin menu
	"god",
	"admin"
}

Config.NoDataTag = "No data"

Config.BossTag = "Boss"

Config.JobRanks = { -- These are the ranks available on the vehicle shops, you can add or remove as many as you want but leave at least 1
	"Newbie",		-- ID: 1
	"Experienced",	-- ID: 2
	"Expert",		-- ID: 3
	"Sub-Owner"		-- ID: 4 
}

Config.SubOwnerRank = 4 -- ID of the rank that will work as a secondary owner

Config.MissionForStock = true -- false = when you order a vehicle, the vehicle shop will instantly receive it without doing any order/mission ---

Config.VehicleShopBoat = { -- What shops after buying a vehicle add it to the player_boats table in the db
	"longfin",
	"seashark",
	"suntrap",
	"dinghy2",
}

Config.TruckBlip = {blipId = 67, blipColor = 2, blipScale = 0.9, blipText = "Truck"} -- Blip of the truck when someone accepts an order

Config.TrailerBlip = {blipId = 515, blipColor = 2, blipScale = 0.9, blipText = "Trailer"} -- Blip of the trailer when someone accepts an order (for vehicle shops with big vehicles)

Config.OrderBlip = {blipId = 478, blipColor = 5, blipText = "Order"}  -- Blip of the ordered vehicle when someone accepts an order

Config.TowMarker = {id = 21, size = {x = 0.5, y = 0.5, z = 0.5}, color = {r = 31, g = 94, b = 255, a = 90}, bobUpAndDown = 0, faceCamera = 0, rotate = 1, drawOnEnts = 0, textureDict = 0, textureName = 0} -- The marker to tow a vehicle when someone accepts an order

Config.SmallTowTruckID = "flatbed"

Config.BigTowTruckID = "Hauler"

Config.TrailerID = "TRFlat"

Config.Stands = { -- Vehicle shops informations

	{
		name = "Concessionaria Auto", -- name of the vehicle shop
		licenseType = "", -- if you want to use a license system you'll need to set it up on sv_utils.lua
		currency = "bank", -- used to buy/sell the business and buy vehicle
		hasOwner = false, -- true = this vehicle shop can have a owner and will need maintenance to have stock | false = no owner and with vehicles all the time, price = max_price set on the database
		-- coords = {x = -32.86, y = -1097.22, z = 27.27}, -- Marker/Shop position -- MLO GABZ
		coords = {x = -57.50, y = -1096.73, z = 26.42}, -- Marker/Shop position
		sellVehicleCoords = {x = -11.964, y = -1081.701, z = 25.623}, 
		sellVehicleMarker = {id = 1, color = {r = 255, g = 0, b = 0, a = 90}, size = {x = 4.0, y = 4.0, z = 1.5}, radius = 2.5, bobUpAndDown = 0, faceCamera = 0, rotate = 1, drawOnEnts = 0, textureDict = 0, textureName = 0}, -- Marker informations for the sell vehicle marker
		ownerCoords = {x = -31.66, y = -1114.00, z = 26.42}, -- Marker/Shop position for owner/employees
		spawnFlatbedPos = {x = -16.95, y = -1105.34, z = 26.67, h = 160.0}, -- Where the flatbed/truck is spawned for the orders
		towCoords = {bone = 'bodyshell', xPos = 0.0, yPos = -2.35, zPos = 1.0},
		missionsVehicleSpawn = { -- Locations where someone who accepted an order will have to go (it is random)
			--{x = -465.99, y = -618.22, z = 31.17, h = 100.0},
			{x = -548.71, y = -1075.94, z = 22.37, h = 100.0},
			{x = 510.52, y = -1131.9, z = 29.32, h = 100.0},
			{x = -166.16, y = -1433.21, z = 31.2, h = 100.0},
			--{x = 218.46, y = -850.71, z = 30.16, h = 100.0},
		},
		-- vehiclesDisplay = { -- Display Vehicles on the ground ( Add this to new shops you want vehicles to be displayed in )
		-- 	{vehicle = 't20', x = -36.85, y = -1093.12, z = 27.30, h = 70.06},
		-- 	{vehicle = 'zentorno', x = -42.23, y = -1101.35, z = 27.30, h = 291.81},
		-- 	{vehicle = 'italigtb', x = -47.58, y = -1091.71, z = 27.30, h = 189.29},
		-- 	{vehicle = 'carbonrs', x = -49.63, y = -1083.58, z = 27.30, h = 152.38},
		-- 	{vehicle = 'bati', x = -55.11, y = -1096.80, z = 27.30, h = 286.84},
		-- },
		radius = 1, -- Interaction radius for the markers
		price = 10000, -- Price of the vehicle shop
		blip = {blipId = 225, blipColor = 68, blipScale = 0.6, blipText = "Concessionária Auto"}, -- Blip informations for vehicleshop blip
		ownerBlip = {blipId = 225, blipColor = 2, blipScale = 0.9, blipText = "Vehicleshop Panel"}, -- Blip informations for shops you own/work for
		buyBlip = {blipId = 225, blipColor = 1, blipScale = 0.9, blipText = "Vehicleshop to buy"}, -- Blip informations for shop on sale
		marker = {id = 20, color = {r = 31, g = 94, b = 255, a = 90}, size = {x = 0.5, y = 0.5, z = 0.5}, bobUpAndDown = 0, faceCamera = 0, rotate = 1, drawOnEnts = 0, textureDict = 0, textureName = 0}, -- Marker informations for the vehicle shop
		ownerMarker = {id = 21, color = {r = 31, g = 94, b = 255, a = 90}, size = {x = 0.5, y = 0.5, z = 0.5}, bobUpAndDown = 0, faceCamera = 0, rotate = 1, drawOnEnts = 0, textureDict = 0, textureName = 0}, -- Marker informations for the owning menu
		bigVehicles = false, -- Set to true if it's airplanes/helicopters/etc... it'll use a truck instead of a flatbed to get the ordered vehicles
		type = "vehicles", -- Type of shop (will change displayed vehicles) | CAN be repeated on other shops
		id = "auto", -- ID of the shop, it's used to get what shop is opened | needs to be DIFFERENT for each shop
	},
	-- {
	-- 	name = "Concessionaria Air",
	-- 	licenseType = "",
	-- 	currency = "bank",
	-- 	hasOwner = false,
	-- 	coords = {x = -949.5, y = -2946.55, z = 13.95},
	-- 	sellVehicleCoords = {x = -959.5, y = -2946.55, z = 12.76},
	-- 	sellVehicleMarker = {id = 1, color = {r = 255, g = 0, b = 0, a = 90}, size = {x = 4.0, y = 4.0, z = 1.5}, radius = 2.5, bobUpAndDown = 0, faceCamera = 0, rotate = 1, drawOnEnts = 0},
	-- 	ownerCoords = {x = -941.51, y = -2955.03, z = 13.95},
	-- 	spawnFlatbedPos = {x = -947.62, y = -2976.86, z = 13.95, h = 270.0},
	-- 	towCoords = {bone = 'bodyshell', xPos = 0.0, yPos = -2.35, zPos = 1.0},
	-- 	missionsVehicleSpawn = {
	-- 		{x = -1835.77, y = 2979.52, z = 32.81, h = 100.0},
	-- 	},
	-- 	radius = 1,
	-- 	price = 12000,
	-- 	blip = {blipId = 64, blipColor = 69, blipScale = 0.6, blipText = "Concessionária Air"},
	-- 	ownerBlip = {blipId = 64, blipColor = 2, blipScale = 0.9, blipText = "Air shop Panel"},
	-- 	buyBlip = {blipId = 64, blipColor = 1, blipScale = 0.9, blipText = "Air shop to buy"},
	-- 	marker = {id = 20, color = {r = 34, g = 94, b = 255, a = 90 }, size = {x = 0.5, y = 0.5, z = 0.5}, bobUpAndDown = 0, faceCamera = 0, rotate = 1, drawOnEnts = 0},
	-- 	ownerMarker = {id = 21, color = {r = 94, g = 255, b = 155}, size = {x = 0.5, y = 0.5, z = 0.5}, bobUpAndDown = 0, faceCamera = 0, rotate = 1, drawOnEnts = 0},
	-- 	bigVehicles = true,
	-- 	type = "air",
	-- 	id = "plane",
	-- },
	{
		name = "Concessionaria Boat",
		licenseType = "boat",
		currency = "bank",
		hasOwner = false,
		-- coords = {x = -720.77, y = -1324.92, z = 1.6},
		coords = {x = -712.431, y = -1298.652, z = 5.102},
		sellVehicleCoords = {x = -922.588, y = -1458.566, z = -0.085}, ---ATUALIZADO CONFIRMAR
		sellVehicleMarker = {id = 1, color = {r = 255, g = 0, b = 0, a = 90}, size = {x = 4.0, y = 4.0, z = 1.5}, radius = 2.5, bobUpAndDown = 0, faceCamera = 0, rotate = 1, drawOnEnts = 0},
		ownerCoords = {x = -712.16, y = -1298.88, z = 5.1},
		spawnFlatbedPos = {x = -719.77, y = -1286.15, z = 5.0, h = 120.0},
		towCoords = {bone = 'bodyshell', xPos = 0.0, yPos = -2.35, zPos = 1.0},
		missionsVehicleSpawn = {
			{x = -758.15, y = -1488.26, z = 5.0, h = 280.0},
		},
		radius = 1,
		price = 14000,
		blip = {blipId = 427, blipColor = 5, blipScale = 0.6, blipText = "Concessionária Boat"},
		ownerBlip = {blipId = 427, blipColor = 2, blipScale = 0.9, blipText = "Water shop Panel"},
		buyBlip = {blipId = 427, blipColor = 1, blipScale = 0.9, blipText = "Water shop to buy"},
		marker = {id = 20, color = {r = 34, g = 94, b = 255, a = 90}, size = {x = 0.5, y = 0.5, z = 0.5}, bobUpAndDown = 0, faceCamera = 0, rotate = 1, drawOnEnts = 0},
		ownerMarker = {id = 21, color = {r = 94, g = 255, b = 155}, size = {x = 0.5, y = 0.5, z = 0.5}, bobUpAndDown = 0, faceCamera = 0, rotate = 1, drawOnEnts = 0},
		bigVehicles = true,
		type = "water",
		id = "boat",
	},	
}

Config.ShowVehicle = { -- Display vehicle
	["auto"] = { -- ID of the vehicle shop
		position = {x = -44.21, y = -1097.06, z = 26.42, h = 160.0}, -- Where to spawn the display vehicles
		noVehicleCam = {x = -44.21-1.49, y = -1097.06-7.65, z = 26.42+1.15}, -- Camera position when there is no vehicle to be displayed
		testDrive = {x = -1733.25, y = -2901.43, z = 13.94, h = 330.0}, -- Where to start the test drive
		vehicleSpawn = { -- Where the vehicle spawns when bought
			{x = -27.65, y = -1082.03, z = 26.64, h = 70.0},
			{x = -13.61, y = -1092.4, z = 26.67, h = 340.0},
			{x = -12.16, y = -1082.49, z = 26.68, h = 84.0},
		},
		-- position = {x = -47.68, y = -1091.43, z = 26.98, h = 190.42}, -- Where to spawn the display vehicles -- MLO GABZ
		-- noVehicleCam = {x = -33.04-1.49, y = -1095.29-7.65, z = 27.27+1.15}, -- Camera position when there is no vehicle to be displayed
		-- testDrive = {x = -1733.25, y = -2901.43, z = 13.94, h = 330.0}, -- Where to start the test drive
		-- vehicleSpawn = { -- Where the vehicle spawns when bought
		-- 	{x = -27.65, y = -1082.03, z = 26.64, h = 70.0},
		-- 	{x = -13.61, y = -1092.4, z = 26.67, h = 340.0},
		-- 	{x = -12.16, y = -1082.49, z = 26.68, h = 84.0},
		-- },
	},
	["plane"] = {
		position = {x = -1652.0, y = -3142.69, z = 13.99, h = 70.0},
		noVehicleCam = {x = -1652.0-12.49, y = -3142.69-0.65, z = 13.99+2.15},
		testDrive = {x = -1733.25, y = -2901.43, z = 13.94, h = 330.0},
		vehicleSpawn = {
			{x = -1023.91, y = -3060.6, z = 13.94, h = 70.0},
		},
	},
	["boat"] = {
		position = {x = -828.54, y = -1448.08, z = -0.5, h = 70.0},
		noVehicleCam = {x = -828.54-12.49, y = -1448.08-0.65, z = -0.5+3.15},
		testDrive = {x = -863.314, y = -1388.8, z = 0.12, h = 202.068},  
		vehicleSpawn = {
			{x = -706.78, y = -1333.57, z = 2.0, h = 70.0},
		},
	},
}

Config.TransitionCamerasOffset = { -- Cameras positions, you can add as many as you wish
	["auto"] = { -- ID of the vehicle shop
		{x = 1.49, y = 7.65, z = 1.15}, 
		{x = 14.0, y = 5.0, z = 0.6},
		{x = 7.0, y = -5.0, z = 1.5},
		{x = -15.0, y = -3.0, z = 1.6},
	},
	["plane"] = {
		{x = 12.49, y = 0.65, z = 2.15}, 
		{x = 9.0, y = 20.0, z = 1.6},
		{x = -13.5, y = 8.0, z = 2.5},
		{x = -4.0, y = -13.0, z = 2.6},
	},
	["boat"] = {
		{x = 12.49, y = 0.65, z = 3.15}, 
		{x = 9.0, y = 20.0, z = 2.6},
		{x = -13.5, y = 8.0, z = 3.5},
		{x = -4.0, y = -13.0, z = 3.6},
	},----------------------------------------
}

Config.VehicleshopsCategories = { -- Categories shown on the vehicle shops, this is used to set the vehicles category
	["vehicles"] = { -- TYPE of the vehicle shop
	    --{display = "COMMERCIALS", id = "commercials"},
		--{display = "COUPES", id = "coupes"},
		{display = "CARRINHAS", id = "vans"},
		{display = "COMPACTOS", id = "compacts"},
		{display = "BERLINAS", id = "sedans"},
		{display = "DESPORTIVOS", id = "sports"},
		{display = "SUPER DESPORTIVOS", id = "supercars"},
		{display = "SUVS", id = "suvs"},
		{display = "TODO TERRENO", id = "offroad"},
		{display = "MUSCULADOS", id = "muscle"},
		{display = "DRIFT", id = "drift"},
		{display = "MOTAS", id = "motorcycles"}
	},
	["air"] = {
		{display = "HELICÓPTEROS", id = "helicopters"},
		{display = "AVIÕES", id = "planes"},
		--{display = "SMALL", id = "small"},
	},
	["water"] = {
		{display = "BARCOS", id = "boats"},
		{display = "SUBMARINOS", id = "submarine"},
	},
}

Config.UseColorID = true -- Will set the vehicle color based on the color ID: https://wiki.rage.mp/index.php?title=Vehicle_Colors

Config.colors = { -- The vehicle colors, this will update the UI as well (it needs to be 10 colors, do NOT remove, add or change the color names)
	color1 = {255, 255, 255, id = 134}, -- The 4th number is the color id for the car if Config.UseColorID = true
	color2 = {0, 0, 0, id = 0},
	color3 = {150, 150, 150, id = 4},
	color4 = {255, 0, 0, id = 27},
	color5 = {255, 150, 0, id = 41},
	color6 = {255, 230, 0, id = 89},
	color7 = {0, 255, 0, id = 55},
	color8 = {0, 0, 255, id = 79},
	color9 = {76, 0, 255, id = 145},
	color10 = {255, 0, 255, id = 137},
}

Config.Requests = { -- Requests texts
	['be_hired'] = { 			text = 'Queres ser contratado por ${name}?'},
}

Config.TextUI = { -- Text UI texts
	['open_shop'] = { 			text = '[E] Para abrir ${shop_name}', 								color = 'darkblue', side = 'right'},
	['buy_business'] = { 		text = '[E] para comprar ${name} por ${price}€', 					color = 'darkblue', side = 'right'},
	['access_business'] = { 	text = '[E] para aceder ${name}', 									color = 'darkblue', side = 'right'},
	['tow'] = { 				text = '[E] Para rebocar', 											color = 'darkblue', side = 'right'},
	['sell_vehicle'] = { 		text = '[E] PARA VENDER', 											color = 'darkblue', side = 'right'},
}

Config.HelpNotification = { -- Used when Config.UseTextUI = false
	['open_shop'] = { 			text = '[E] Para abrir ${shop_name}',								type = 'success', time = 5000},
	['buy_business'] = { 		text = '[E] para comprar ${name} por ${price}€',					type = 'success', time = 5000},
	['access_business'] = { 	text = '[E] para aceder ${name}',									type = 'success', time = 5000},
	['tow'] = { 				text = '[E] Para rebocar',											type = 'success', time = 5000},
	['sell_vehicle'] = { 		text = '[E] PARA VENDER',											type = 'success', time = 5000},
}

Config.NotificationsText = { -- Notifications texts
	['success_cancel'] = {		title = "Loja de Veículos", 		text = "Encomenda cancelada com sucesso",											time = 5000, type = "success"},
	['fail_cancel'] = {			title = "Loja de Veículos", 		text = "Falha ao cancelar a encomenda",												time = 5000, type = "error"},
	['cant_access'] = {			title = "Loja de Veículos", 		text = "Não tens permissão para aceder a esta loja",								time = 5000, type = "error"},
	['no_license'] = {			title = "Loja de Veículos", 		text = "Não tens licença para comprar este veículo",								time = 5000, type = "error"},
	['all_occupied'] = {		title = "Loja de Veículos", 		text = "Todas as entradas de veículos estão ocupadas",								time = 5000, type = "error"},
	['failed_to_load'] = {		title = "Loja de Veículos", 		text = "Falha ao carregar o veículo", 												time = 5000, type = "error"},
	['bus_no_money'] = {		title = "Loja de Veículos", 		text = "Este negócio não tem dinheiro suficiente", 									time = 5000, type = "error"},
	['success_sell'] = {		title = "Loja de Veículos", 		text = "Vendeste ${vehicle_name} por ${price}€ com sucesso", 						time = 5000, type = "success"},
	['not_in_correct_v'] = {	title = "Loja de Veículos", 		text = "Não estás no veículo correto", 												time = 5000, type = "error"},
	['dont_sell'] = {			title = "Loja de Veículos", 		text = "Esta loja de veículos não compra este veículo", 							time = 5000, type = "error"},
	['not_your_vehicle'] = {	title = "Loja de Veículos", 		text = "Não és o proprietário deste veículo", 										time = 5000, type = "error"},
	['not_in_vehicle'] = {		title = "Loja de Veículos", 		text = "Precisas de estar num veículo", 											time = 5000, type = "error"},
	['not_admin'] = {			title = "Loja de Veículos", 		text = "Não tens permissão para aceder ao menu de administrador", 					time = 5000, type = "error"},
	['inside_vehicle'] = {		title = "Loja de Veículos", 		text = "Não podes aceder à loja de veículos dentro de um veículo", 					time = 5000, type = "error"},
	['load_vehicle'] = {		title = "Loja de Veículos", 		text = "A carregar o veículo, por favor espera", 									time = 3000, type = "info"},
	['stop_testdrive'] = {		title = "Loja de Veículos", 		text = "Test drive terminado", 														time = 5000, type = "success"},
	['not_testdriving'] = {		title = "Loja de Veículos", 		text = "Não estás num test drive", 													time = 5000, type = "error"},
	['fill_fields'] = {			title = "Loja de Veículos", 		text = "Por favor preenche o campo", 												time = 5000, type = "error"},
	['already_accepted'] = {	title = "Loja de Veículos", 		text = "Já aceitaste uma encomenda, completa-a antes de aceitar outra",				time = 5000, type = "error"},
	['not_selected_hire'] = {	title = "Loja de Veículos", 		text = "Ninguém foi selecionado", 													time = 5000, type = "error"},
	['ordered_success'] = {		title = "Loja de Veículos", 		text = "Encomendaste x${amount} ${vehicle_name} com sucesso!", 						time = 5000, type = "success"},
	['some_wrong'] = {			title = "Loja de Veículos", 		text = "Algo correu mal!", 															time = 5000, type = "error"},
	['not_enough_money'] = {	title = "Loja de Veículos", 		text = "Não tens dinheiro suficiente", 												time = 5000, type = "error"},
	['not_enough_money_s'] = {	title = "Loja de Veículos", 		text = "A tua sociedade não tem dinheiro suficiente", 								time = 5000, type = "error"},
	['accepted_order'] = {		title = "Loja de Veículos", 		text = "Aceitaste uma encomenda com sucesso", 										time = 5000, type = "success"},
	['someone_accepted'] = {	title = "Loja de Veículos", 		text = "Alguém já aceitou esta encomenda", 											time = 5000, type = "error"},
	['finished_order'] = {		title = "Loja de Veículos", 		text = "Terminaste a encomenda com sucesso e recebeste ${reward}€", 				time = 5000, type = "success"},
	['no_ads_cancel'] = {		title = "Loja de Veículos", 		text = "Não tens nenhum anúncio para cancelar", 									time = 5000, type = "error"},
	['veh_not_available'] = {	title = "Loja de Veículos", 		text = "Este veículo não está disponível", 											time = 5000, type = "error"},
	['price_not_valid'] = {		title = "Loja de Veículos", 		text = "Este não é um preço válido", 												time = 5000, type = "error"},
	['employee_not_exist'] = {	title = "Loja de Veículos", 		text = "Este funcionário não existe", 												time = 5000, type = "error"},
	['not_enough_to_sell'] = {	title = "Loja de Veículos", 		text = "Não tens veículos suficientes para vender", 								time = 5000, type = "error"},
	['got_hired'] = {			title = "Loja de Veículos", 		text = "Foste contratado por ${shop_name}", 										time = 5000, type = "info"},
	['got_fired'] = {			title = "Loja de Veículos", 		text = "Foste despedido por ${shop_name}", 											time = 5000, type = "info"},
	['success_hired'] = {		title = "Loja de Veículos", 		text = "Contrataste ${hired_name} com sucesso", 									time = 5000, type = "success"},
	['success_fired'] = {		title = "Loja de Veículos", 		text = "Despediste ${fired_name} com sucesso", 										time = 5000, type = "success"},
	['success_added_ad'] = {	title = "Loja de Veículos", 		text = "Adicionaste x${amount} anúncios de ${vehicle_name}", 						time = 5000, type = "success"},
	['deposited'] = {			title = "Loja de Veículos", 		text = "Depositaste ${amount}€ com sucesso", 										time = 5000, type = "success"},
	['withdrawn'] = {			title = "Loja de Veículos", 		text = "Retiraste ${amount}€ com sucesso", 											time = 5000, type = "success"},
	['bought_veh'] = {			title = "Loja de Veículos", 		text = "Compraste ${vehicle_name} por ${vehiclePrice}€", 							time = 5000, type = "success"},
	['change_money'] = {		title = "Loja de Veículos", 		text = "Alteraste o dinheiro da ${shop_name} para ${money} com sucesso", 			time = 5000, type = "success"},
	['change_info'] = {			title = "Loja de Veículos", 		text = "Alteraste as informações do ${vehicle_name} com sucesso", 					time = 5000, type = "success"},
	['remove_veh'] = {			title = "Loja de Veículos", 		text = "Removeste o ${vehicle_name} com sucesso", 									time = 5000, type = "success"},
	['created_veh'] = {			title = "Loja de Veículos", 		text = "Criaste um ${vehicle_name} com sucesso", 									time = 5000, type = "success"},
	['cancel_ads'] = {			title = "Loja de Veículos", 		text = "Cancelaste x${amount} anúncios de ${vehicle_name}", 						time = 5000, type = "success"},
	['updated_price'] = {		title = "Loja de Veículos", 		text = "Atualizaste o preço do ${vehicle_name} para ${amount}€", 					time = 5000, type = "success"},
	['change_rank'] = {			title = "Loja de Veículos", 		text = "${name} agora é ${job}", 													time = 5000, type = "success"},
	['already_rank'] = {		title = "Loja de Veículos", 		text = "${name} já é ${job}", 														time = 5000, type = "error"},
	['already_employee'] = {	title = "Loja de Veículos", 		text = "${name} já é teu funcionário", 												time = 5000, type = "error"},
	['max_shops'] = {			title = "Loja de Veículos", 		text = "Não podes comprar mais concessionárias",									time = 5000, type = "error"},
	['got_to_truck'] = {		title = "Loja de Veículos", 		text = "Vai buscar a encomenda marcada no teu minimapa", 							time = 5000, type = "info"},
	['not_towing'] = {			title = "Loja de Veículos", 		text = "Precisas de estar mais próximo do veículo encomendado", 					time = 5000, type = "error"},
	['towed'] = {				title = "Loja de Veículos",			text = "Rebocaste o veículo encomendado com sucesso", 								time = 5000, type = "success"},
	['sold_business'] = {		title = "Loja de Veículos", 		text = "Vendeste ${shop} por ${amount}€ com sucesso", 								time = 5000, type = "success"},
	['leave_business'] = {		title = "Loja de Veículos", 		text = "Saíste da ${shop} com sucesso", 											time = 5000, type = "success"},
	['min_max_price'] = {		title = "Loja de Veículos", 		text = "O preço mínimo precisa de ser inferior ao preço máximo", 					time = 5000, type = "error"},
	['owner_changed'] = {		title = "Loja de Veículos", 		text = "${owner} agora é o proprietário da ${shop}", 								time = 5000, type = "success"},
	['max_employees'] = {		title = "Loja de Veículos", 		text = "Só podes contratar ${employees} funcionários", 								time = 5000, type = "error"},

}

-------------------------- DISCORD LOGS

-- To set your Discord Webhook URL go to webhook.lua, line 1

Config.BotName = 'Generation X' -- Write the desired bot name

Config.ServerName = 'Generation X' -- Write your server's name

Config.IconURL = '' -- Insert your desired image link

Config.DateFormat = '%d/%m/%Y [%X]' -- To change the date format check this website - https://www.lua.org/pil/22.1.html

-- To change a webhook color you need to set the decimal value of a color, you can use this website to do that - https://www.mathsisfun.com/hexadecimal-decimal-colors.html

Config.BuyBusinessWebhook = true
Config.BuyBusinessWebhookColor = '65280'

Config.SellBusinessWebhook = true
Config.SellBusinessWebhookColor = '16711680'

Config.DepositWebhook = true
Config.DepositWebhookColor = '16776960'

Config.WithdrawWebhook = true
Config.WithdrawWebhookColor = '16776960'

Config.StartOrderWebhook = true
Config.StartOrderWebhookColor = '16742656'

Config.EndOrderWebhook = true
Config.EndOrderWebhookColor = '16742656'

Config.HireWebhook = true
Config.HireWebhookColor = '4223487'

Config.FireWebhook = true
Config.FireWebhookColor = '4223487'

Config.BuyVehicleWebhook = true
Config.BuyVehicleWebhookColor = '65535'

-----teste vender viatura log
Config.SellVehicleWebhook = true
Config.SellVehicleWebhookColor = '65535'

Config.ADStockWebhook = true
Config.ADStockWebhookColor = '7209071'

Config.CancelStockWebhook = true
Config.CancelStockWebhookColor = '7209071'

Config.BuyStockWebhook = true
Config.BuyStockWebhookColor = '7209071'

Config.EditEmployeeRankWebhook = true
Config.EditEmployeeRankWebhookColor = '4223487'

Config.QuitJobWebhook = true
Config.QuitJobWebhookColor = '16711680'