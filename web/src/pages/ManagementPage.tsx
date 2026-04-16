import { useEffect, useState } from 'react'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Card, CardContent } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Separator } from '../components/ui/separator'
import { ScrollArea } from '../components/ui/scroll-area'
import { fetchNui, formatCurrency } from '../lib/utils'
import { t } from '../lib/locale'
import {
  X, LayoutDashboard, Package, Truck, Users, LineChart, Ticket,
  DollarSign, Store, Clock, Percent, CreditCard,
} from 'lucide-react'
import type { DealershipData } from '../types'

import DashboardPage from './DashboardPage'
import StockPage from './StockPage'
import CatalogPage from './CatalogPage'
import EmployeesPage from './EmployeesPage'
import FinancesPage from './FinancesPage'
import CouponsPage from './CouponsPage'
import FinancingSettingsPanel from '../components/FinancingSettingsPanel'

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
  | 'financing'

interface NavItem {
  id: ManagementTab
  labelKey: string
  icon: React.ReactNode
  minRole?: string[]
  feature?: string
}

const navItems: NavItem[] = [
  { id: 'dashboard', labelKey: 'tab_dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
  { id: 'stock', labelKey: 'tab_stock', icon: <Package className="h-4 w-4" /> },
  { id: 'catalog', labelKey: 'tab_order_vehicles', icon: <Truck className="h-4 w-4" /> },
  { id: 'employees', labelKey: 'tab_employees', icon: <Users className="h-4 w-4" />, minRole: ['owner', 'manager', 'admin'] },
  { id: 'finances', labelKey: 'tab_finances', icon: <LineChart className="h-4 w-4" />, minRole: ['owner', 'manager', 'admin'] },
  { id: 'commission', labelKey: 'tab_commission', icon: <Percent className="h-4 w-4" />, minRole: ['owner', 'admin'] },
  { id: 'coupons', labelKey: 'tab_coupons', icon: <Ticket className="h-4 w-4" />, minRole: ['owner', 'admin'], feature: 'coupons' },
  { id: 'financing', labelKey: 'tab_financing', icon: <CreditCard className="h-4 w-4" />, minRole: ['owner', 'admin'] },
]

const tierFeatures: Record<string, number> = {
  coupons: 4,
  financing: 3,
}

export default function ManagementPage({ data, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<ManagementTab>(data.initialTab as ManagementTab || 'dashboard')
  const [balance, setBalance] = useState<number | null>(data.initialBalance ?? null)
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
            <p className="text-muted-foreground mb-6">{t('dealership_available_for_purchase')}</p>

            <div className="bg-muted rounded-lg p-4 mb-6">
              <p className="text-xs text-muted-foreground mb-1">{t('label_price')}</p>
              <p className="text-3xl font-bold text-accent">{formatCurrency(data.purchasePrice || 0)}</p>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={onClose}>
                {t('btn_cancel')}
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
                <DollarSign className="h-4 w-4" /> {t('btn_purchase')}
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
      case 'financing':
        return <FinancingSettingsPanel dealershipId={data.dealershipId} />
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
              {t(`tier_${data.tier}`)}
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
                {t(item.labelKey)}
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
              {isClockedIn ? t('clock_out') : t('clock_in')}
            </button>
          )}
          <button
            onClick={onClose}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" /> {t('btn_close')}
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
        {t('loading')}
      </div>
    )
  }

  return (
    <div className="p-5 space-y-4">
      <div>
        <h2 className="text-lg font-bold">{t('commission_rates')}</h2>
        <p className="text-sm text-muted-foreground">{t('commission_rates_desc')}</p>
      </div>

      <div className="space-y-3 max-w-sm">
        <div>
          <label className="text-sm font-medium">{t('role_salesperson')}</label>
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
          <label className="text-sm font-medium">{t('role_manager')}</label>
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
          {saving ? t('saving') : t('btn_save')}
        </Button>
      </div>
    </div>
  )
}
