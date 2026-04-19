export interface DealershipData {
  dealershipId: number
  dealershipName: string
  role: 'owner' | 'manager' | 'salesperson' | 'customer' | 'admin'
  tier: number
  location?: string
  type?: string
  selfService?: boolean
  setupDealershipId?: number
  positionsDealershipId?: number
  scrollToSpots?: boolean
  metadata?: DealershipMetadata
  embedded?: boolean
  initialTab?: string
  isOwned?: boolean
  purchasePrice?: number
  initialBalance?: number
  mode?: string
  catalogId?: number
  model?: string
  label?: string
  vehicleClass?: string
  stockId?: number
  deliveryQueue?: DeliveryQueueData
  depotId?: number
  uploadConfig?: {
    url: string
    field: string
    headers?: Record<string, string>
    returnPathKey?: string
  }
}

export interface DealershipMetadata {
  coords?: PositionData
  spawnPoint?: PositionData
  displaySpots?: PositionData[]
  interactionPoints?: Record<string, PositionData>
  npcSpawnPoints?: PositionData[]
  zones?: PositionData[]
}

export interface PositionData {
  id?: number
  x: number
  y: number
  z: number
  w?: number
}

export interface StockItem {
  id: number
  dealership_id: number
  vehicle_model: string
  vehicle_label: string
  retail_price: number
  wholesale_cost: number
  display_spot: number | null
  color: VehicleColor | null
  condition: 'new' | 'used'
  ordered_at: string
  delivered_at: string | null
  sold_at: string | null
  sold_to: string | null
  sold_by: string | null
  quantity: number
  image?: string | null
  class?: string
  is_used?: number | boolean
  unlisted?: number | boolean
  is_order?: boolean
  metadata?: Record<string, unknown> | string | null
  plate?: string | null
  acquired_from?: string | null
  auction_id?: number | null
  delivery_mode?: 'expedited' | 'local' | string
  bundle?: {
    order_ids: number[]
    vehicles: Array<{ id: number; model: string; label: string; quantity: number }>
    total_qty: number
    bundle_size: number
    claimed_by?: string | null
    bucket?: string
  }
}

export interface VehicleColor {
  r?: number
  g?: number
  b?: number
  colorId?: number
  type?: 'rgb' | 'id'
}

export interface CatalogItem {
  model: string
  label: string
  wholesale: number
  tier: string
  class: string
  image?: string | null
}

export interface Employee {
  id: number
  serverId?: number
  dealership_id: number
  identifier: string
  name?: string
  role: 'manager' | 'salesperson' | 'owner'
  gradeLabel?: string
  grade?: number
  commission_rate: number
  hired_at: string
  clocked_in?: boolean
  online?: boolean
  metadata?: Record<string, unknown>
}

export interface LedgerEntry {
  id: number
  dealership_id: number
  type: string
  amount: number
  description: string
  identifier: string
  created_at: string
}

export interface Coupon {
  id: number
  dealership_id: number | null
  code: string
  discount_type: 'percent' | 'flat'
  discount_value: number
  max_uses: number
  uses: number
  min_purchase: number
  vehicle_filter: string[] | null
  expires_at: string | null
  created_by: string
  created_at: string
}

export interface FinancingAgreement {
  id: number
  dealership_id: number
  dealership_name?: string
  identifier: string
  vehicle_plate: string
  vehicle_label?: string
  vehicle_model?: string
  total_amount: number
  amount_paid: number
  installment_amount: number
  interest_rate: number
  next_payment: string
  missed_payments: number
  status: 'active' | 'paid' | 'defaulted' | 'repossessed'
  created_at: string
}

export interface FinancingSettings {
  financingEnabled: boolean
  minDownPercent: number
  interestRate: number
  paymentIntervalHours: number
  maxMissedPayments: number
  installmentOptions: number[]
}

export interface DashboardStats {
  totalSales: number
  totalRevenue: number
  totalProfit: number
  totalCommission: number
  salesThisWeek: number
  revenueThisWeek: number
  topSeller?: { name: string; sales: number }
  stockCount: number
  stockCapacity: number
  employeeCount: number
  employeeCapacity: number
}

export interface NPCProfile {
  budgetTier: string
  budget: number
  budgetMin?: number
  budgetMax?: number
  typePreference: string
  colorPreference: string | null
  priorityStat: string
  flexibility: number
  personality: string
  patienceTime: number
  pedModel: string
  maxPresentations?: number
  maxRounds?: number
}

export interface AdminDealership {
  id: number
  location: string
  name: string
  mode: string
  type: string
  owner_identifier: string | null
  owner_name?: string
  tier: number
  balance: number
  job?: string | null
  seize_enabled?: number | boolean
  metadata?: DealershipMetadata | string | null
}

export type PageType =
  | 'dashboard'
  | 'stock'
  | 'catalog'
  | 'sales'
  | 'employees'
  | 'finances'
  | 'financing'
  | 'coupons'
  | 'negotiation'
  | 'admin'
  | 'management'
  | 'vehicleDetails'
  | 'photoBooth'
  | 'showroom'
  | 'npcShowroom'
  | 'pickleFax'
  | 'auction'
  | 'deliveries'

export interface DeliveryOffer {
  orderId: number
  orderIds?: number[]
  dealershipId: number
  dealershipName: string
  vehicleModel: string
  vehicleLabel: string
  retailPrice: number
  quantity: number
  bundleSize?: number
  vehicles?: Array<{ id: number; model: string; label: string; quantity: number }>
  baseFee: number
  projectedPayout: number
  orderedAt: string
}

export interface MissionOverlayState {
  visible: boolean
  phase?: 'pickup' | 'transport'
  phaseKey?: string
  vehicleLabel?: string
  quantity?: number
  bundledLines?: number
  trailerSize?: 'small' | 'medium' | 'enclosed'
  distanceMeters?: number
  condition?: number
  baseFee?: number
  streakMultiplier?: number
  damageMultiplier?: number
  payoutPreview?: number
}

export interface DeliveryDepot {
  id: number
  name: string
  label?: string
  active: boolean
  pickupCoords: { x: number; y: number; z: number; w?: number }
  spawnCoords?: { x: number; y: number; z: number; w?: number } | null
}

export interface DeliveryQueueData {
  local: DeliveryOffer[]
  premium: DeliveryOffer[]
  driver: {
    level: number
    xp: number
    xpToNext: number | null
    streak: number
    streakMultiplier: number
    completed: number
    failed: number
  }
}

export type AuctionStatus = 'active' | 'won' | 'cancelled' | 'no_sale'

export interface Auction {
  id: number
  stock_id: number
  dealership_id: number
  dealership_name?: string
  seller_identifier: string | null
  starting_bid: number
  min_increment: number
  reserve_price: number | null
  buyout_price: number | null
  current_bid: number | null
  current_bidder: string | null
  reserve_met: boolean
  started_at: string
  ends_at: string | null
  ended_at: string | null
  duration_minutes: number
  status: AuctionStatus
  winner_identifier: string | null
  winning_bid: number | null
  claimed_at: string | null
  vehicle_model: string
  vehicle_label: string
  class?: string | null
  image?: string | null
  plate?: string | null
  condition?: number | null
  bid_count?: number
}

export interface AuctionBid {
  id: number
  auction_id: number
  bidder_identifier: string
  amount: number
  placed_at: string
  refunded: boolean
}

export interface AuctionCreateParams {
  stockId: number
  startingBid: number
  minIncrement: number
  reservePrice?: number | null
  buyoutPrice?: number | null
  durationMinutes: number
}

export interface PickleFaxDetails {
  id: number
  model: string
  label: string
  isUsed: boolean
  condition: number
  plate: string | null
  acquiredFrom: string | null
  orderedAt: string | null
  deliveredAt: string | null
  retailPrice: number
  wholesaleCost: number
  image?: string | null
  class?: string | null
  properties: Record<string, unknown> | null
}

export interface NuiMessage {
  type: string
  page?: PageType
  data?: DealershipData
  accentColor?: string
  profile?: NPCProfile
  greeting?: string
  newTier?: number
  newBalance?: number
}
