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
  is_order?: boolean
  metadata?: Record<string, unknown> | string | null
  plate?: string | null
  acquired_from?: string | null
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
  identifier: string
  vehicle_plate: string
  vehicle_label?: string
  total_amount: number
  amount_paid: number
  installment_amount: number
  interest_rate: number
  next_payment: string
  missed_payments: number
  status: 'active' | 'paid' | 'defaulted' | 'repossessed'
  created_at: string
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
