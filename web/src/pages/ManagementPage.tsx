import { useEffect, useState } from 'react'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Card, CardContent } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Separator } from '../components/ui/separator'
import { ScrollArea } from '../components/ui/scroll-area'
import { fetchNui, formatCurrency } from '../lib/utils'
import {
  X, LayoutDashboard, Package, Truck, Users, LineChart, Ticket,
  DollarSign, Store, Clock, Percent,
} from 'lucide-react'
import type { DealershipData } from '../types'

import DashboardPage from './DashboardPage'
import StockPage from './StockPage'
import CatalogPage from './CatalogPage'
import EmployeesPage from './EmployeesPage'
import FinancesPage from './FinancesPage'
import CouponsPage from './CouponsPage'

interface Props {
  data: DealershipData
  onClose: () => void
}

type ManagementTab =
  | 'dashboard'
  | 'stock'
  | 'catalog'
  | 'employees'
  | 'finances'
  | 'coupons'
  | 'commission'

interface NavItem {
  id: ManagementTab
  label: string
  icon: React.ReactNode
  minRole?: string[]
  feature?: string
}

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
  { id: 'stock', label: 'Stock', icon: <Package className="h-4 w-4" /> },
  { id: 'catalog', label: 'Order Vehicles', icon: <Truck className="h-4 w-4" /> },
  { id: 'employees', label: 'Employees', icon: <Users className="h-4 w-4" />, minRole: ['owner', 'manager', 'admin'] },
  { id: 'finances', label: 'Finances', icon: <LineChart className="h-4 w-4" />, minRole: ['owner', 'manager', 'admin'] },
  { id: 'commission', label: 'Commission', icon: <Percent className="h-4 w-4" />, minRole: ['owner', 'admin'] },
  { id: 'coupons', label: 'Coupons', icon: <Ticket className="h-4 w-4" />, minRole: ['owner', 'admin'], feature: 'coupons' },
]

const tierLabels: Record<number, string> = {
  1: 'Starter Lot',
  2: 'Established',
  3: 'Premium',
  4: 'Enterprise',
}

const tierFeatures: Record<string, number> = {
  coupons: 4,
}

export default function ManagementPage({ data, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<ManagementTab>(data.initialTab as ManagementTab || 'dashboard')
  const [balance, setBalance] = useState<number | null>(null)
  const [purchasing, setPurchasing] = useState(false)
  const [isClockedIn, setIsClockedIn] = useState(false)

  const refreshBalance = () => {
    if (data.isOwned !== false) {
      fetchNui<{ success: boolean; data: { balance: number } }>('getDealershipFinances', {
        dealershipId: data.dealershipId,
      }).then((res) => {
        if (res.success && res.data) setBalance(res.data.balance)
      }).catch(() => {})
    }
  }

  useEffect(() => {
    refreshBalance()
    fetchNui<{ clockedIn: boolean }>('getClockStatus', {
      dealershipId: data.dealershipId,
    }).then((res) => {
      if (res) setIsClockedIn(res.clockedIn)
    }).catch(() => {})
  }, [data.dealershipId, data.isOwned])

  // Refresh balance whenever the active tab changes
  useEffect(() => {
    refreshBalance()
  }, [activeTab])

  // Unowned dealership — show purchase screen
  if (data.isOwned === false && data.role === 'customer') {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Card className="w-full max-w-md border-accent/30">
          <CardContent className="p-8 text-center">
            <Store className="h-12 w-12 mx-auto mb-4 text-accent" />
            <h2 className="text-2xl font-bold mb-1">{data.dealershipName}</h2>
            <p className="text-muted-foreground mb-6">This dealership is available for purchase</p>

            <div className="bg-muted rounded-lg p-4 mb-6">
              <p className="text-xs text-muted-foreground mb-1">Purchase Price</p>
              <p className="text-3xl font-bold text-accent">{formatCurrency(data.purchasePrice || 0)}</p>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={onClose}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                disabled={purchasing}
                onClick={() => {
                  setPurchasing(true)
                  fetchNui('purchaseVehicle', {}).catch(() => {})
                  // The actual purchase goes through the Lua callback
                  fetchNui('close', {})
                  onClose()
                }}
              >
                <DollarSign className="h-4 w-4" /> Purchase
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const canAccess = (item: NavItem): boolean => {
    if (item.minRole && !item.minRole.includes(data.role)) return false
    if (item.feature && data.tier < (tierFeatures[item.feature] || 99)) return false
    return true
  }

  const visibleItems = navItems.filter(canAccess)

  const subData = { ...data, embedded: true }
  const subProps = { data: subData, onClose: () => {} }

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardPage {...subProps} />
      case 'stock':
        return <StockPage {...subProps} />
      case 'catalog':
        return <CatalogPage {...subProps} />
      case 'employees':
        return <EmployeesPage {...subProps} />
      case 'finances':
        return <FinancesPage {...subProps} />
      case 'coupons':
        return <CouponsPage {...subProps} />
      case 'commission':
        return <CommissionSettings dealershipId={data.dealershipId} />
      default:
        return null
    }
  }

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-56 border-r border-border flex flex-col shrink-0">
        <div className="p-4">
          <h2 className="font-bold text-sm truncate">{data.dealershipName}</h2>
          <div className="flex items-center gap-1.5 mt-1.5">
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {tierLabels[data.tier] || `Tier ${data.tier}`}
            </Badge>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">
              {data.role}
            </Badge>
          </div>
          {balance !== null && (
            <p className="text-xs font-semibold text-emerald-400 mt-2">
              {formatCurrency(balance)}
            </p>
          )}
        </div>

        <Separator />

        <ScrollArea className="flex-1">
          <nav className="p-2 space-y-0.5">
            {visibleItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                  activeTab === item.id
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </nav>
        </ScrollArea>

        <Separator />

        <div className="p-2 space-y-0.5">
          {data.role !== 'customer' && (
            <button
              onClick={() => {
                fetchNui(isClockedIn ? 'clockOut' : 'clockIn', { dealershipId: data.dealershipId }).then((res: any) => {
                  if (res?.success) setIsClockedIn(!isClockedIn)
                })
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                isClockedIn
                  ? 'text-emerald-400 hover:bg-muted'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <Clock className="h-4 w-4" />
              {isClockedIn ? 'Clock Out' : 'Clock In'}
            </button>
          )}
          <button
            onClick={onClose}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" /> Close
          </button>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {renderContent()}
      </div>
    </div>
  )
}

function CommissionSettings({ dealershipId }: { dealershipId: number }) {
  const [salesperson, setSalesperson] = useState('')
  const [manager, setManager] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchNui<{ success: boolean; rates: { salesperson: number; manager: number } }>('getCommissionRates', {
      dealershipId,
    }).then((res) => {
      if (res.success && res.rates) {
        setSalesperson(String(res.rates.salesperson))
        setManager(String(res.rates.manager))
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [dealershipId])

  const handleSave = () => {
    setSaving(true)
    fetchNui('setCommissionRates', {
      dealershipId,
      salesperson: parseInt(salesperson) || 0,
      manager: parseInt(manager) || 0,
    }).then(() => setSaving(false)).catch(() => setSaving(false))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground">
        Loading...
      </div>
    )
  }

  return (
    <div className="p-5 space-y-4">
      <div>
        <h2 className="text-lg font-bold">Commission Rates</h2>
        <p className="text-sm text-muted-foreground">Set commission percentage per role. Applied when employees make a sale.</p>
      </div>

      <div className="space-y-3 max-w-sm">
        <div>
          <label className="text-sm font-medium">Salesperson</label>
          <div className="flex items-center gap-2 mt-1">
            <Input
              type="number"
              min="0"
              max="100"
              value={salesperson}
              onChange={(e) => setSalesperson(e.target.value)}
              className="w-24"
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">Manager</label>
          <div className="flex items-center gap-2 mt-1">
            <Input
              type="number"
              min="0"
              max="100"
              value={manager}
              onChange={(e) => setManager(e.target.value)}
              className="w-24"
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving} className="mt-2">
          {saving ? 'Saving...' : 'Save Rates'}
        </Button>
      </div>
    </div>
  )
}
