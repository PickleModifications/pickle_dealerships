# pickle_dealerships — Architecture Plan

## Context
Build a player-run dealership system for FiveM (QBX/QBCore/ESX via bridge pattern) supporting all vehicle types. The system emphasizes economy, grinding, and player agency — dealerships are businesses players own, manage, stock, and profit from.

Boilerplate from pickle_clubs is already in place providing: framework bridges (QB/ESX/standalone), target system bridges (ox_target/qb-target/qtarget), XP bridge, interaction system, entity management, locale system, and config structure. Implementation goes in `modules/` directories.

### Competitive Positioning (vs Other Dealerships)
**Features we match**: Public + player-owned modes, in-game admin creator, showroom displays, financing, RP tablet selling, vehicle color selection, sales dashboards, coupons/promotions, custom currency support.
**Features where we differentiate**: Tier progression & upgrades (grinding loop), XP integration, reputation system, economy sink design (import tax, lot rent, sales tax), stock delivery as full gameplay missions (trucking with risk/reward, not just a timer), trade-in system.

---

## 1. Dealership Modes: Public & Player-Owned

### Public Dealerships (NPC / Self-Service)
- Config-defined locations that are **always open**, no owner required.
- Customers browse a catalog and buy directly — no employee interaction needed.
- Fixed pricing set in config (or dynamic via admin).
- Infinite stock (no supply chain) — acts as a standard vehicle shop.
- Revenue goes to server economy (nowhere / society account).
- Use case: starter vehicle shops, generic lots that don't need RP.

### Player-Owned Dealerships
- Full business simulation — ownership, employees, stock management, profit.
- Everything described in sections 2-8 below.
- Can be **converted from public to player-owned** via admin or purchase.

### Per-Location Config
Each dealership location can independently be set to `public` or `player-owned` mode, with different rules:
```lua
Config.Dealerships = {
    ['pdm'] = {
        label = 'Premium Deluxe Motorsport',
        mode = 'public',           -- 'public' or 'player-owned'
        type = 'car',
        -- public mode settings
        catalog = 'standard_cars',
        -- player-owned settings (used if mode changes)
        purchasePrice = 750000,
        ...
    },
}
```

---

## 2. Dealership Ownership & Locations

- **Locations are config-defined** — admin sets physical zones, spawn points, display spots, type, and purchase price in `config.lua`.
- **In-game admin creator** — admins can also create/edit dealerships live via an admin panel: place interaction points, define zones, position display spots, adjust settings. Changes persist to DB/KVP.
- **Purchasing a lot**: Player interacts with a "For Sale" sign/NPC at an unclaimed location → pays the asking price → becomes owner.
- **Dealership types**: `car`, `boat`, `air`, `mixed` — controls which wholesale catalog categories are available.
- **Custom naming**: Owner sets a dealership name displayed on blips and in UI.
- **Transferring / selling back**: Owner can sell the dealership back to the city (at a loss) or transfer to another player.

---

## 3. Employee System

| Role | Permissions |
|------|------------|
| **Owner** | Full control — finances, hiring, stock, upgrades, pricing, withdraw funds, coupons |
| **Manager** | Order stock, set prices, manage salespeople, view dashboard. Cannot withdraw full balance or sell lot |
| **Salesperson** | Sell stocked vehicles to customers via tablet. Earns commission per sale |

- **Commission**: Configurable % per sale paid to the closing salesperson from the dealership balance.
- **Employee cap**: Scales with dealership tier.
- **Clock in/out**: Employees clock in at the dealership to "go on duty" — only on-duty employees can sell.
- **Sales dashboard**: Each employee sees their personal stats (sales count, revenue generated, commission earned). Managers/owners see all employees' stats with ranking and performance trends.

---

## 4. Vehicle Stocking & Supply Chain (Core Grinding Loop)

Dealerships don't have infinite stock — this is the economy engine.

- **Wholesale catalog**: Config-defined list of vehicles with wholesale prices and tier requirements. Categorized by type.
- **Ordering**: Owner/Manager browses catalog → selects vehicle(s) → pays wholesale price + import tax from dealership funds.

### Stock Delivery: Two Modes (Config per dealership)

#### A) Trucking Missions (Gameplay Delivery)
- When an order is placed, a **delivery mission** is generated for the owner/manager/designated employee.
- Player drives to a **pickup point** (docks for boats, airport for planes, depot for cars).
- **Car trailer mechanic**: Player hooks up a car trailer, ordered vehicles physically spawn on the trailer.
- Multi-vehicle capacity based on trailer type — multiple orders per run.
- Drive the loaded trailer back to the dealership lot.
- **Risk/reward elements**:
  - Longer routes = cheaper import cost (bulk shipping discount).
  - Trailer damage = vehicle condition penalty.
  - Optional: NPC ambush events on certain routes (configurable).
  - Optional: Other players can attempt hijacking (PvP risk for high-value loads).
- Vehicles enter stock only after successful delivery.

#### B) Timed Delivery (Simple Mode)
- Traditional timer-based delivery (configurable, e.g. 15-45 min).
- Vehicles auto-appear in stock when timer expires.
- For servers that prefer simplicity over gameplay.

- **Stock limits**: Max vehicles in stock based on dealership tier. Forces upgrade investment.
- **Retail pricing**: Owner sets the retail price per stocked vehicle. Profit = retail - (wholesale + tax + commission).

---

## 5. Dealership Tiers & Upgrades (Progression) ⭐ Differentiator

Reinvest profits to grow — this is the long-term grind. *Other Dealerships has no equivalent system.*

| Tier | Name | Stock Capacity | Employee Cap | Display Spots | Unlocks |
|------|------|---------------|--------------|---------------|---------|
| 1 | Starter Lot | 5 | 2 | 2 | Basic catalog |
| 2 | Established | 10 | 4 | 4 | Expanded catalog, faster deliveries |
| 3 | Premium | 20 | 6 | 8 | Full catalog, test drives, showroom, financing |
| 4 | Enterprise | 35 | 10 | 12 | Exclusive/exotic vehicles, bulk discounts, coupons, multi-trailer deliveries |

- Upgrade costs scale exponentially — meaningful money sinks.
- Higher tiers unlock better vehicles in the wholesale catalog.
- Tier unlocks gate features (test drives, financing, coupons) to incentivize investment.

---

## 6. Sales & Customer Experience

### RP Tablet Selling (Employee-Assisted)
- When a customer enters the lot, on-duty salespeople get notified.
- Salesperson approaches customer and opens a **sales tablet** (NUI).
- Tablet shows dealership stock — salesperson walks the customer through options.
- Salesperson selects a vehicle, offers it to the customer → customer gets a confirmation prompt with price.
- Salesperson can apply **coupons/discounts** from the tablet.
- Salesperson can initiate **test drives** from the tablet.
- Salesperson can set up **financing plans** from the tablet.
- Customer confirms → payment processed → vehicle spawns → keys given.
- Commission auto-paid to the salesperson.

### Self-Service Fallback
- If no employees are on duty, customers can browse a **self-service kiosk** (if enabled in config).
- Reduced feature set — no financing, no coupons, no test drives. Just browse & buy.
- Or disable entirely to force employee presence for sales.

### Vehicle Color Selection
- At purchase time, customer chooses vehicle color.
- **Three modes** (config per dealership):
  - `rgb_wheel` — full RGB color picker.
  - `rgb_palette` — curated list of RGB colors defined in config.
  - `color_ids` — GTA native color IDs, including special finishes (metallic, matte, chameleon).
- Color applied to the vehicle on spawn.

### Test Drives (Tier 3+)
- Time-limited, radius-restricted.
- Vehicle despawns/returns after timer or leaving zone.
- Initiated by salesperson via tablet or self-service if enabled.

### Financing (Tier 3+)
- Pay X% down (configurable minimum), rest in installments with optional interest rate.
- Payment schedule: daily/weekly (configurable).
- Missed payments → warning notification → after X missed payments, vehicle flagged for repo.
- Repo: vehicle removed from player_vehicles, returned to dealership stock as "used" (or deleted).

---

## 7. Coupons & Promotions

- **Owner/Manager can create coupon codes** with:
  - Discount type: percentage off or flat amount off.
  - Expiration date.
  - Max uses (total and per-player).
  - Vehicle restrictions (specific models, categories, or all).
  - Minimum purchase amount.
- **Salespeople apply coupons** during tablet sales.
- **Self-service kiosk** has a coupon code input field.
- **Seasonal events**: Admin can create server-wide promotions that apply to all dealerships.
- Stored in DB — `dealership_coupons` table.

---

## 8. Economy & Money Flow

```
[Wholesale Catalog] ---wholesale + import tax---> [Dealership Balance] (cost)
[Customer Payment]  ---retail price-----------> [Dealership Balance] (revenue)
[Dealership Balance] ---commission %-----------> [Salesperson Wallet]
[Dealership Balance] ---sales tax %-----------> [Removed / Server Sink]
[Dealership Balance] ---owner withdrawal------> [Owner's Bank Account]
[Dealership Balance] ---tier upgrades---------> [Removed / Progression]
[Dealership Balance] ---lot rent (optional)---> [Removed / Recurring Sink]
```

**Key sinks**: Import tax, sales tax, upgrade costs, lot rent.
**Key faucet**: Markup on vehicle sales.

### Custom Currency Support
- Config option to accept alternative currencies (VIP coins, tokens, etc.).
- Uses an export-based API: server defines `GetPlayerCurrency(src, currency)` and `RemovePlayerCurrency(src, currency, amount)`.
- Dealerships can be configured to accept: cash only, bank only, both, or custom currency.
- Wholesale orders always use dealership balance (cash economy).

---

## 9. Lot Display & Showroom

- **Display spots**: Config-defined or admin-placed physical positions where stocked vehicles spawn.
- **In-game placement**: Staff can move/reposition display vehicles directly in-game (drag-and-place or coordinate nudging).
- **Showroom management**: Owner chooses which stocked vehicles are on display vs. "in storage."
- **Display vehicles are static** — locked, no entry, interaction-only.
- **Featured vehicles**: Mark a vehicle as "featured" — gets a special marker/highlight on the lot.
- **Blip on map**: Shows dealership name, type icon, and whether it's open (employees on duty).

---

## 10. XP & Reputation Integration ⭐ Differentiator

Using the existing `pickle_xp` bridge. *Other Dealerships has no XP/progression system.*

- **Salesperson XP**: Earn XP per sale. Higher level = better commission rates or exclusive perks.
- **Dealership reputation**: Track total sales volume. Higher rep unlocks wholesale discounts or cosmetic lot features.
- **Owner XP**: Earn XP for milestones (first sale, 100 sales, tier upgrades).

---

## 11. Admin Features

### In-Game Dealership Creator
- **Admin panel** (NUI or ox_lib menu) for creating dealerships without touching config files.
- Place interaction points by walking to positions and saving coords.
- Define dealership zones (poly zones or radius).
- Position display spots visually.
- Set type, pricing, mode (public/player-owned).
- All saved to DB — survives restarts.

### Management Commands
- Force-transfer ownership, wipe a dealership, refund, adjust balance.
- Toggle dealership mode (public ↔ player-owned).
- Economy monitoring: view active dealerships, revenue stats, top earners.

---

## 12. Logging & Notifications

- **Discord webhooks**: Sales, stock orders, ownership changes, large withdrawals, employee changes.
- **In-game notifications**: Stock delivered, vehicle sold, daily summary on clock-in.
- **Event bridge**: Use existing `bridge/events/` for targeted notifications to online employees.

---

## 13. NPC Customer System ⭐ Differentiator

NPC customers periodically visit player-owned dealerships, creating a constant grind activity for on-duty employees even when no real players are shopping. Employees must read NPC preferences, pitch the right vehicle, and negotiate a price — turning every sale into a skill-based encounter.

### NPC Spawning & Arrival

- **Spawn frequency**: Configurable interval with randomness (e.g., every 5-15 min per dealership). Scales with:
  - Dealership tier (higher tier = more foot traffic).
  - Number of on-duty employees (no employees = no NPCs).
  - Dealership reputation (higher rep = more NPCs + wealthier NPCs).
  - Time of day (optional — more traffic during "business hours").
- **Arrival behavior**: NPC spawns nearby, walks onto the lot, and browses display vehicles for a short time (looks at 1-3 cars). Then approaches the nearest on-duty employee or stands at a "waiting area" marker.
- **Patience timer**: NPC waits a configurable duration (e.g., 60-120s) for an employee to engage them. If ignored, they leave — lost sale, minor reputation penalty.
- **Max concurrent NPCs**: Config limit per dealership (e.g., 2-3) to prevent lot crowding.
- **Ped variety**: Random ped models from a config list, categorized by wealth tier (budget shopper uses different models than luxury buyer).

### NPC Profiles & Preferences

Each NPC is generated with a randomized profile that the employee must discover through conversation:

#### Budget Tier
Determines spending power — weighted by dealership reputation:
| Tier | Label | Budget Range | Spawn Weight (Low Rep) | Spawn Weight (High Rep) |
|------|-------|-------------|----------------------|------------------------|
| 1 | Budget | $5k - $25k | 50% | 20% |
| 2 | Mid-Range | $25k - $100k | 35% | 35% |
| 3 | Premium | $100k - $500k | 12% | 30% |
| 4 | Luxury | $500k+ | 3% | 15% |

#### Vehicle Preferences
Each NPC has randomized preferences that influence what they'll accept:
- **Type preference**: Sports, sedan, SUV, truck, muscle, off-road, boat, helicopter, etc. (weighted random from config).
- **Color preference**: Has a preferred color or "no preference." Matching the color = negotiation bonus.
- **Priority stat**: What they care about most — speed, style, practicality, or price. Affects which vehicles they'll consider acceptable.
- **Flexibility**: How open they are to alternatives (rigid = only accepts close matches, flexible = will consider anything in budget).

#### Personality Traits (Affect Negotiation)
- **Haggler**: Aggressively negotiates down. Starting offer is well below asking.
- **Impulse buyer**: Barely negotiates. Will accept near asking price quickly.
- **Researcher**: Asks lots of questions, takes longer, but pays fair price if satisfied.
- **Skeptic**: Needs convincing. Harder negotiation but tips well (bonus commission) if they feel they got a good experience.
- **Walk-away risk**: How likely they are to leave mid-negotiation if pushed too hard.

### Interaction Flow

1. **Employee approaches NPC** → interacts via target/keypress → opens NPC Customer UI.

2. **Greeting phase**: NPC introduces themselves with dialogue hinting at their preferences:
   - *"I'm looking for something fast — my buddy just got a Zentorno and I need to one-up him."* (Sports preference, competitive personality)
   - *"I just need something reliable to get to work. Nothing too flashy."* (Sedan/SUV preference, practical priority, budget tier)
   - *"Money's no object — show me the best you've got."* (Luxury tier, style priority)
   - Dialogue pulled from config-defined pools per profile combination.

3. **Vehicle presentation**: Employee selects a vehicle from stock to pitch to the NPC.
   - UI shows the NPC's **revealed preferences** (what you've learned so far) alongside your stock list.
   - Presenting a vehicle reveals the NPC's reaction:
     - **Great match**: *"Now THAT's what I'm talking about!"* — negotiation starts with a high opening offer.
     - **Decent match**: *"Hmm, not exactly what I had in mind, but I could see it..."* — neutral starting position.
     - **Poor match**: *"That's... not really my style."* — steep discount needed or NPC may decline entirely.
     - **Way off**: *"Are you serious? That's not even close to what I asked for."* — NPC patience drops, risk of walk-away.
   - Employee can present up to **3 vehicles** before the NPC gets impatient (configurable).
   - Each presentation reveals more about the NPC's preferences (narrowing down what they want).

4. **Negotiation minigame** (once a vehicle is selected):

### Negotiation Minigame

The core skill-based mechanic. Not just clicking buttons — requires reading the NPC and making strategic choices.

#### Setup
- **Asking price**: The retail price set by the dealership owner for that vehicle.
- **NPC opening offer**: Based on profile — budget tier, personality, and vehicle match quality.
  - Great match + impulse buyer = 90-100% of asking.
  - Poor match + haggler = 50-65% of asking.
- **Target range**: Server calculates a hidden "fair price" range. Both sides are trying to land in this zone.

#### Negotiation Rounds (Max 4-5 rounds)
Each round, the employee picks a **negotiation tactic**:

| Tactic | Effect | Risk |
|--------|--------|------|
| **Stand firm** | Hold current price. Works on impulse buyers, backfires on hagglers. | Haggler may lower offer or walk away |
| **Small concession** | Drop price 3-5%. Shows willingness, builds trust. | Safe but slow — eats margin |
| **Highlight features** | Emphasize vehicle strengths (speed, luxury, rarity). Raises NPC's perceived value. | Fails if feature doesn't match NPC's priority stat |
| **Create urgency** | "Someone else was looking at this one..." Pushes impulse buyers to close fast. | Skeptics see through it — trust penalty |
| **Sweeten the deal** | Offer a freebie (free first service, tank of gas, floor mats). Costs the dealership a small flat fee. | Always positive but costs money |
| **Match their need** | Reference something the NPC said earlier. Most effective tactic if you read their preferences correctly. | Only works if you actually identified the right preference |
| **Final offer** | Lock in a take-it-or-leave-it price. Ends negotiation immediately. | NPC accepts or walks — no more rounds |

#### NPC Response Per Round
After each tactic, the NPC responds:
- Adjusts their offer up or down.
- Shows an **emotion indicator** (satisfied, neutral, annoyed, interested, ready to buy).
- May reveal additional preference info through dialogue.
- May counter with their own demand ("I'll take it if you knock off another $2k").

#### Resolution
- **Sale closed**: NPC accepts the final price. Vehicle sold, money enters dealership balance, commission paid to employee.
- **Walk-away**: NPC's patience runs out or price gap is too large. NPC leaves — no sale, minor rep penalty.
- **Bonus outcome**: If the NPC is very satisfied (high match + good negotiation), they may:
  - Tip the salesperson (bonus cash on top of commission).
  - Promise to "tell their friends" (+reputation boost).
  - Return later as a **repeat customer** with higher budget (tracked per-dealership).

### NPC Sale Economics

- NPC sales pay **less than player sales** — NPC budgets are generally below full retail. This keeps player sales more valuable.
- Commission still applies — salespeople earn their cut.
- XP earned per NPC sale (less than player sales but consistent).
- **NPC sales don't consume real stock** (configurable option):
  - **Option A (Realistic)**: NPC buys from actual stock — vehicle removed from inventory. More impactful, forces restocking.
  - **Option B (Grind-friendly)**: NPC sales are "virtual" — money enters dealership but stock isn't consumed. Better for grinding without running out of display vehicles.
  - Configurable per-server.

### Skill Progression & NPC Difficulty

- **Employee XP/level affects NPC interactions**:
  - Higher level = more preference hints revealed in the greeting.
  - Higher level = unlock additional negotiation tactics.
  - Higher level = wider "fair price" range (easier to close deals).
- **NPC difficulty scales with vehicle value**: Cheap car NPCs are easy. Luxury NPCs are tough negotiators.
- **Streak bonus**: Consecutive successful sales without a walk-away = bonus XP multiplier.

### Config

```lua
Config.NPCCustomers = {
    enabled = true,
    spawnInterval = { min = 300, max = 900 },   -- Seconds between spawns (5-15 min)
    maxConcurrent = 3,                           -- Max NPCs per dealership at once
    patienceTime = { min = 60, max = 120 },      -- Seconds before NPC leaves if ignored
    maxPresentations = 3,                        -- Vehicles you can show before they get impatient
    maxNegotiationRounds = 5,
    consumeStock = true,                         -- true = NPC buys real stock, false = virtual sale
    businessHours = { start = 8, stop = 22 },    -- Optional: NPC hours (24h format), nil = always
    xpPerSale = 15,                              -- Base XP (vs 25 for player sales)
    reputationPerSale = 1,                       -- Base rep gain
    walkAwayPenalty = -1,                         -- Rep penalty for ignored/failed NPC

    -- NPC budget scaling per dealership tier
    tierBudgetMultiplier = {
        [1] = 1.0,
        [2] = 1.2,
        [3] = 1.5,
        [4] = 2.0,
    },

    -- Personality weights (must sum to 100)
    personalityWeights = {
        haggler = 25,
        impulse_buyer = 20,
        researcher = 25,
        skeptic = 20,
        walkaway = 10,
    },

    -- Vehicle type preference weights
    typePreferences = {
        sports = 20, sedan = 25, suv = 20, truck = 10,
        muscle = 10, offroad = 5, coupe = 10,
    },

    -- Ped models by budget tier
    pedModels = {
        budget = { 'a_m_y_skater_01', 'a_f_y_hipster_01', ... },
        midrange = { 'a_m_y_business_01', 'a_f_y_business_01', ... },
        premium = { 'a_m_y_bevhills_01', 'a_f_y_bevhills_01', ... },
        luxury = { 'a_m_m_bevhills_02', 'a_f_y_bevhills_02', ... },
    },

    -- Dialogue pools (keyed by preference + personality combos)
    greetings = { ... },
    reactions = { ... },
    negotiationDialogue = { ... },
}
```

---

## 14. Additional Features

- **Trade-ins**: Customer trades current vehicle for discount. Trade-in enters stock as "used" at reduced value.
- **Dynamic pricing hints**: Show server-wide vehicle scarcity to help owners price competitively.
- **Multi-location**: Tier 4 owners could purchase a second lot.
- **Lot rent**: Optional recurring cost — idle dealerships slowly drain.
- **Society integration**: Use existing bridge society system for dealership funds.

---

## Technical Architecture

### Database Tables

```sql
-- Dealership locations & ownership
dealerships (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50),
    location VARCHAR(50),               -- Config location key
    type ENUM('car','boat','air','mixed'),
    mode ENUM('public','player-owned'),
    owner_citizenid VARCHAR(50),        -- Null for public dealerships
    tier INT DEFAULT 1,
    balance INT DEFAULT 0,
    reputation INT DEFAULT 0,
    metadata JSON,                      -- Settings, branding, admin-placed coords
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
)

-- Employee roster
dealership_employees (
    id INT AUTO_INCREMENT PRIMARY KEY,
    dealership_id INT,
    citizenid VARCHAR(50),
    role ENUM('manager','salesperson'),
    commission_rate FLOAT,
    hired_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSON
)

-- Vehicles in stock
dealership_stock (
    id INT AUTO_INCREMENT PRIMARY KEY,
    dealership_id INT,
    vehicle_model VARCHAR(50),
    vehicle_label VARCHAR(100),
    retail_price INT,
    wholesale_cost INT,
    display_spot INT,                   -- Null = in storage
    color JSON,                         -- {primary: {r,g,b}, secondary: {r,g,b}, type: 'rgb'|'id'}
    condition ENUM('new','used') DEFAULT 'new',
    ordered_at TIMESTAMP,
    delivered_at TIMESTAMP,             -- Null = in transit
    sold_at TIMESTAMP,                  -- Null = available
    sold_to VARCHAR(50),
    sold_by VARCHAR(50),
    metadata JSON
)

-- Financial transaction log
dealership_ledger (
    id INT AUTO_INCREMENT PRIMARY KEY,
    dealership_id INT,
    type VARCHAR(20),
    amount INT,
    description VARCHAR(255),
    citizenid VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)

-- Vehicle financing
dealership_financing (
    id INT AUTO_INCREMENT PRIMARY KEY,
    dealership_id INT,
    citizenid VARCHAR(50),
    vehicle_plate VARCHAR(10),
    total_amount INT,
    amount_paid INT DEFAULT 0,
    installment_amount INT,
    interest_rate FLOAT DEFAULT 0,
    next_payment TIMESTAMP,
    missed_payments INT DEFAULT 0,
    status ENUM('active','paid','defaulted','repossessed') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)

-- Coupon codes
dealership_coupons (
    id INT AUTO_INCREMENT PRIMARY KEY,
    dealership_id INT,                  -- Null = server-wide
    code VARCHAR(20) UNIQUE,
    discount_type ENUM('percent','flat'),
    discount_value INT,
    max_uses INT DEFAULT 0,             -- 0 = unlimited
    uses INT DEFAULT 0,
    min_purchase INT DEFAULT 0,
    vehicle_filter JSON,                -- Null = all vehicles
    expires_at TIMESTAMP,
    created_by VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)

-- Delivery missions (for trucking mode)
dealership_deliveries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    dealership_id INT,
    stock_ids JSON,                     -- Array of dealership_stock IDs in this delivery
    pickup_location VARCHAR(50),
    route VARCHAR(50),                  -- Route identifier for distance/discount calc
    status ENUM('pending','in_progress','completed','failed') DEFAULT 'pending',
    assigned_to VARCHAR(50),            -- citizenid of driver
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    metadata JSON
)
```

### Module Structure

```
modules/
├── main/
│   ├── server.lua          -- Core callbacks, dealership CRUD, permission checks
│   └── client.lua          -- Zone entry/exit, blips, main interaction menus
├── stock/
│   ├── server.lua          -- Wholesale ordering, delivery timers, stock management
│   └── client.lua          -- Catalog browsing UI, display vehicle spawning/placement
├── delivery/
│   ├── server.lua          -- Trucking mission generation, route management, completion
│   └── client.lua          -- Trailer mechanic, pickup/dropoff, mission HUD
├── sales/
│   ├── server.lua          -- Purchase processing, vehicle registration, color application
│   └── client.lua          -- Sales tablet NUI, customer browsing, test drives, self-service kiosk
├── financing/
│   ├── server.lua          -- Payment processing, installment tracking, repo logic
│   └── client.lua          -- Financing UI, payment prompts
├── employees/
│   ├── server.lua          -- Hiring/firing, role management, commission payouts
│   └── client.lua          -- Clock in/out, employee menus, dashboard
├── npc_customers/
│   ├── server.lua          -- NPC profile generation, spawn scheduling, negotiation validation, sale processing
│   └── client.lua          -- NPC spawning/pathing, interaction UI, negotiation minigame, dialogue display
├── management/
│   ├── server.lua          -- Finances, upgrades, ledger, withdrawals, coupons
│   └── client.lua          -- Owner/manager dashboard, pricing, promotions
└── admin/
    ├── server.lua          -- Admin commands, force actions, economy tools
    └── client.lua          -- In-game dealership creator, admin panel
```

### Config Structure

```lua
Config.Dealerships = {
    ['pdm'] = {
        label = 'Premium Deluxe Motorsport',
        mode = 'public',                -- 'public' | 'player-owned'
        type = 'car',                   -- 'car' | 'boat' | 'air' | 'mixed'
        purchasePrice = 750000,         -- Cost to buy (player-owned mode)
        selfService = true,             -- Allow buying without employee
        deliveryMode = 'timed',         -- 'trucking' | 'timed'
        colorMode = 'rgb_wheel',        -- 'rgb_wheel' | 'rgb_palette' | 'color_ids'
        colorPalette = {},              -- Used if colorMode = 'rgb_palette'
        acceptedCurrency = 'both',      -- 'cash' | 'bank' | 'both' | 'custom'
        customCurrency = nil,           -- Currency key if acceptedCurrency = 'custom'
        blip = { sprite = 326, color = 3 },
        zones = { ... },
        displaySpots = { ... },
        spawnPoint = vec4(...),
        pickupPoints = { ... },         -- For trucking delivery mode
    },
}

Config.Tiers = {
    [1] = { label = 'Starter Lot', stockCap = 5, employeeCap = 2, displaySpots = 2, upgradeCost = 0, catalogAccess = 'basic', features = {} },
    [2] = { label = 'Established', stockCap = 10, employeeCap = 4, displaySpots = 4, upgradeCost = 200000, catalogAccess = 'expanded', features = {} },
    [3] = { label = 'Premium', stockCap = 20, employeeCap = 6, displaySpots = 8, upgradeCost = 500000, catalogAccess = 'full', features = {'test_drives', 'financing', 'showroom'} },
    [4] = { label = 'Enterprise', stockCap = 35, employeeCap = 10, displaySpots = 12, upgradeCost = 1500000, catalogAccess = 'exclusive', features = {'test_drives', 'financing', 'showroom', 'coupons', 'bulk_discount', 'multi_trailer'} },
}

Config.ImportTax = 0.10
Config.SalesTax = 0.05
Config.DefaultCommission = 0.08
Config.DeliveryTime = 20              -- Minutes (timed mode)
Config.TestDriveTime = 120            -- Seconds
Config.TestDriveRadius = 500.0
Config.LotRent = 0                    -- 0 = disabled
Config.FinancingMinDown = 0.30        -- 30%
Config.FinancingInterest = 0.05       -- 5%
Config.FinancingMaxMissed = 3         -- Missed payments before repo
Config.SellbackRate = 0.60            -- Owner gets 60% back when selling dealership

Config.WholesaleCatalog = {
    ['car'] = {
        { model = 'sultan', label = 'Sultan', wholesale = 15000, tier = 'basic' },
        { model = 'zentorno', label = 'Zentorno', wholesale = 250000, tier = 'full' },
        { model = 'entity2', label = 'Entity XXR', wholesale = 1500000, tier = 'exclusive' },
    },
    ['boat'] = { ... },
    ['air'] = { ... },
}

Config.DeliveryRoutes = {
    ['short'] = { label = 'Local Depot', distance = 'short', discount = 0, riskLevel = 0 },
    ['medium'] = { label = 'Port of LS', distance = 'medium', discount = 0.05, riskLevel = 1 },
    ['long'] = { label = 'Paleto Import Dock', distance = 'long', discount = 0.10, riskLevel = 2 },
}

Config.CustomCurrency = {
    -- Export-based API for alternative currencies
    -- getCurrency = export function name
    -- removeCurrency = export function name
}
```

---

## Grinding / Economy Loop Summary

1. **Earn → Buy lot** — Grind other jobs to afford a starter dealership
2. **Stock → Deliver → Sell → Profit** — Order wholesale, run delivery missions, mark up retail
3. **Serve NPC customers → Steady income** — Read preferences, pitch vehicles, negotiate deals for consistent revenue between player sales
4. **Reinvest → Upgrade** — Spend profits on tier upgrades for better stock, capacity & features
5. **Hire → Scale** — Employees sell via tablet while you manage or deliver
6. **Promote → Drive traffic** — Create coupons and promotions to attract buyers
7. **Reputation → Exclusivity** — Long-term volume unlocks better wholesale deals + more/wealthier NPC foot traffic
8. **Recurring costs → Sustainability** — Tax + rent prevent idle passive income

## Competitive Advantages vs Other Dealerships
- **NPC customer system** — AI customers with preferences, dialogue, and a negotiation minigame (no competitor has this)
- **Tier progression system** — grinding loop with tangible upgrades (they have none)
- **XP integration** — pickle_xp for employee/owner progression (they have none)
- **Trucking delivery missions with risk/reward** — route selection, trailer mechanics, potential hijacking
- **Economy sink design** — import tax, lot rent, sales tax for healthy server economy
- **Reputation system** — long-term progression unlocking wholesale benefits
- **Trade-in system** — used vehicle economy layer
