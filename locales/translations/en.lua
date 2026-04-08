Language["en"] = {
    -- General
    interact_far = "You are too far away to do this.",
    no_permission = "You do not have permission to do this.",
    no_access = "No access.",
    not_enough_money = "You don't have enough money.",
    something_went_wrong = "Something went wrong. Try again.",

    -- Dealership General
    dealership_purchased = "You now own %s! Welcome to the business.",
    dealership_sold = "You sold %s and received %s.",
    dealership_renamed = "Dealership renamed to %s.",
    dealership_not_found = "Dealership not found.",
    dealership_already_owned = "This dealership is already owned.",
    dealership_not_owned = "This dealership is not owned by anyone.",
    dealership_not_for_sale = "This dealership is not for sale.",

    -- Interactions
    interact_management = "Management",
    interact_sales = "Sales Tablet",
    interact_kiosk = "Self-Service Kiosk",
    showroom_purchase_success = "Congratulations! You purchased a %s.",
    interact_assist_customer = "Assist Customer",
    interact_view_vehicle = "View Vehicle",
    interact_clock_in = "Clock In",
    interact_clock_out = "Clock Out",
    interact_for_sale = "Dealership For Sale",

    -- Management Menu
    menu_management_title = "Dealership Management",
    menu_stock_catalog = "Stock & Catalog",
    menu_stock_catalog_desc = "Order vehicles and manage inventory",
    menu_employees = "Employees",
    menu_employees_desc = "Hire, fire, and manage staff",
    menu_finances = "Finances",
    menu_finances_desc = "View balance, withdraw funds, and ledger",
    menu_upgrades = "Upgrades",
    menu_upgrades_desc = "Upgrade your dealership tier",
    menu_coupons = "Coupons & Promotions",
    menu_coupons_desc = "Create and manage discount codes",
    menu_dashboard = "Sales Dashboard",
    menu_dashboard_desc = "View sales stats and performance",
    menu_settings = "Settings",
    menu_settings_desc = "Rename dealership, adjust settings",
    menu_sell_dealership = "Sell Dealership",
    menu_sell_dealership_desc = "Sell back to the city for %s",
    menu_purchase_dealership = "Purchase This Lot",
    menu_purchase_dealership_desc = "Buy this dealership for %s",

    -- Stock & Ordering
    stock_ordered = "Ordered %s for %s. %s",
    stock_delivery_timed = "Delivery in %d minutes.",
    stock_delivery_trucking = "Start a delivery mission to pick it up.",
    stock_delivered = "%s has been delivered and is ready for sale!",
    stock_full = "Your dealership is at full stock capacity (%d/%d).",
    stock_price_set = "Retail price for %s set to %s.",
    stock_display_set = "Vehicle placed on display spot %d.",
    stock_display_removed = "Vehicle removed from display.",
    stock_not_found = "Stock item not found.",
    stock_not_delivered = "This vehicle hasn't been delivered yet.",
    catalog_tier_locked = "You need a higher dealership tier to order this vehicle.",

    -- Sales
    sale_complete = "Vehicle sold! %s has purchased %s for %s.",
    sale_complete_customer = "You purchased %s for %s! Find your new vehicle outside.",
    sale_employee_commission = "You earned %s in commission!",
    sale_tax_deducted = "Sales tax: %s deducted.",
    sale_vehicle_not_available = "This vehicle is no longer available.",
    sale_confirm_title = "Confirm Purchase",
    sale_confirm_desc = "%s is offering you a %s for %s. Accept?",

    -- Test Drives
    test_drive_started = "Test drive started! You have %d seconds. Stay within %dm of the dealership.",
    test_drive_ended = "Test drive over. Thank you for trying the %s!",
    test_drive_too_far = "You went too far from the dealership! Test drive ended.",
    test_drive_not_available = "Test drives require a Premium tier dealership.",

    -- Financing
    financing_created = "Financing approved! %s down, %s per installment.",
    financing_payment_made = "Payment of %s received. Remaining: %s.",
    financing_paid_off = "Congratulations! Your vehicle is fully paid off!",
    financing_overdue = "Your vehicle payment is overdue! Make a payment to avoid repossession.",
    financing_repossessed = "Your vehicle (%s) has been repossessed due to missed payments.",
    financing_not_available = "Financing requires a Premium tier dealership.",
    financing_min_down = "Minimum down payment is %d%% (%s).",

    -- Employees
    employee_hired = "%s has been hired as %s.",
    employee_fired = "%s has been fired from the dealership.",
    employee_role_changed = "%s is now a %s.",
    employee_commission_set = "Commission rate set to %d%% for %s.",
    employee_cap_reached = "Employee cap reached (%d/%d). Upgrade your dealership for more slots.",
    employee_already_hired = "This player is already employed at this dealership.",
    employee_clocked_in = "You are now on duty at %s.",
    employee_clocked_out = "You are now off duty.",
    employee_not_found = "Employee not found.",

    -- NPC Customers
    npc_customer_arrived = "A customer has arrived at the dealership!",
    npc_customer_left = "The customer got tired of waiting and left.",
    npc_customer_walk_away = "The customer walked away. No deal.",
    npc_sale_complete = "NPC sale complete! %s added to the dealership balance.",
    npc_tip_received = "The customer left a %s tip!",
    npc_reputation_gained = "Reputation +%d",
    npc_streak_bonus = "Sale streak! Bonus XP earned.",

    -- Negotiation Tactics
    tactic_stand_firm = "Stand Firm",
    tactic_stand_firm_desc = "Hold your price. Works on impulse buyers.",
    tactic_concession = "Small Concession",
    tactic_concession_desc = "Drop the price slightly to build trust.",
    tactic_highlight = "Highlight Features",
    tactic_highlight_desc = "Emphasize the vehicle's strengths.",
    tactic_urgency = "Create Urgency",
    tactic_urgency_desc = "Pressure the customer to act fast.",
    tactic_sweeten = "Sweeten the Deal",
    tactic_sweeten_desc = "Throw in a freebie. Costs a small fee.",
    tactic_match_need = "Match Their Need",
    tactic_match_need_desc = "Reference what they told you they want.",
    tactic_final_offer = "Final Offer",
    tactic_final_offer_desc = "Take it or leave it. No more rounds.",

    -- Delivery
    delivery_started = "Delivery mission started! Head to %s to pick up your vehicles.",
    delivery_pickup = "Arrive at the pickup point and load the vehicles.",
    delivery_transport = "Transport the vehicles back to your dealership.",
    delivery_complete = "Delivery complete! %d vehicles added to stock.",
    delivery_failed = "Delivery failed. Partial refund of %s applied.",
    delivery_already_active = "You already have an active delivery mission.",

    -- Upgrades
    upgrade_success = "Dealership upgraded to %s! New capacity: %d vehicles, %d employees.",
    upgrade_max_tier = "Your dealership is already at the maximum tier.",
    upgrade_insufficient_funds = "Insufficient dealership funds. Need %s, have %s.",

    -- Coupons
    coupon_created = "Coupon '%s' created successfully.",
    coupon_deleted = "Coupon deleted.",
    coupon_invalid = "Invalid or expired coupon code.",
    coupon_applied = "Coupon applied! Discount: %s",
    coupon_max_uses = "This coupon has reached its maximum uses.",
    coupon_min_purchase = "Minimum purchase of %s required for this coupon.",
    coupon_not_available = "Coupons require an Enterprise tier dealership.",

    -- Finances
    funds_withdrawn = "Withdrew %s from dealership balance.",
    funds_deposited = "Deposited %s into dealership balance.",
    funds_insufficient = "Insufficient dealership funds.",
    funds_minimum = "Cannot withdraw below minimum balance.",

    -- Admin
    admin_only = "This action requires admin privileges.",
    admin_ownership_transferred = "Dealership ownership transferred.",
    admin_balance_set = "Dealership balance set to %s.",
    admin_tier_set = "Dealership tier set to %d.",
    admin_dealership_reset = "Dealership has been reset.",
    admin_mode_toggled = "Dealership mode changed to %s.",
    admin_dealership_created = "New dealership created at %s.",

    -- Gizmo / Object Placement
    objects_freeze = "Freeze",
    objects_unfreeze = "Unfreeze",
    objects_save = "Save Position",
    objects_cancel = "Cancel",
    objects_position = "[Mouse]     - Move Position  \n[Scroll / Arrow Keys]     - Rotate  \n",

    -- Webhooks
    webhook_sale = "Vehicle Sold",
    webhook_order = "Vehicle Ordered",
    webhook_ownership = "Ownership Changed",
    webhook_withdrawal = "Large Withdrawal",
    webhook_employee = "Employee Change",
}
