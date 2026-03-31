export interface DealershipData {
  id: number; name: string; location: string; type: string; mode: string;
  owner_citizenid: string | null; tier: number; balance: number; reputation: number;
  metadata: Record<string, unknown> | null;
  stockCount?: number; employeeCount?: number;
}

export interface StockItem {
  id: number; dealership_id: number; vehicle_model: string; vehicle_label: string;
  retail_price: number; wholesale_cost: number; display_spot: number | null;
  color: VehicleColor | null; condition: 'new' | 'used';
  ordered_at: string; delivered_at: string | null; sold_at: string | null;
  sold_to: string | null; sold_by: string | null;
}

export interface VehicleColor {
  primary: { r: number; g: number; b: number };
  secondary: { r: number; g: number; b: number };
  type: 'rgb' | 'id';
}

export interface CatalogItem {
  model: string; label: string; wholesale: number; tier: string;
  class: string; vehicleType: string;
}

export interface Employee {
  id: number; dealership_id: number; citizenid: string; role: string;
  commission_rate: number | null; hired_at: string;
  name?: string; totalSales?: number; totalRevenue?: number; totalCommission?: number;
}

export interface LedgerEntry {
  id: number; dealership_id: number; type: string; amount: number;
  description: string; citizenid: string; created_at: string;
}

export interface FinancingPlan {
  id: number; dealership_id: number; citizenid: string; vehicle_plate: string;
  total_amount: number; amount_paid: number; installment_amount: number;
  interest_rate: number; next_payment: string; missed_payments: number;
  status: string;
}

export interface Coupon {
  id: number; dealership_id: number | null; code: string;
  discount_type: 'percent' | 'flat'; discount_value: number;
  max_uses: number; uses: number; min_purchase: number;
  vehicle_filter: unknown; expires_at: string | null;
  created_by: string; created_at: string;
}

export interface NPCProfile {
  budgetTier: string; budgetMin: number; budgetMax: number;
  personality: string; typePreference: string; colorPreference: unknown;
  priorityStat: string; flexibility: number; pedModel: string;
  greeting: string;
}

export interface NegotiationState {
  round: number; maxRounds: number; askingPrice: number; currentOffer: number;
  emotionState: string; npcProfile: NPCProfile; stockItem: StockItem;
  dealershipId: number; dialogue: string;
}

export interface DashboardStats {
  totalSales: number; totalRevenue: number; todaySales: number; todayRevenue: number;
  revenueByDay: { date: string; revenue: number }[];
  topVehicles: { model: string; label: string; count: number }[];
  employeeRankings: { name: string; sales: number; revenue: number }[];
}

export type PageType = 'catalog' | 'stock' | 'sales' | 'employees' | 'finances' | 'dashboard' | 'coupons' | 'negotiation' | 'admin' | 'financing' | null;
