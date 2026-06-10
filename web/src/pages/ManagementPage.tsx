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
  DollarSign, Store, Percent, CreditCard, Settings as SettingsIcon,
} from 'lucide-react'
import type { DealershipData, DealershipProgression } from '../types'

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
  | 'settings'

interface NavItem {
  id: ManagementTab
  labelKey: string
  icon: React.ReactNode
  minRole?: string[]
  feature?: string
  // When true, the tab is hidden for NPC-operated (mode='managed') dealerships.
  // NPC dealerships run off auto-seeded infinite stock, so the ordering UI is
  // irrelevant for them.
  hideForNpc?: boolean
}

// Role groups for tab visibility. Managers get day-to-day operations (dashboard,
// stock, ordering, coupons) plus read-only finances; owner-only tabs cover money
// withdrawal, hiring, commissions, financing terms and store settings. Every tab
// is also re-checked server-side, so this only controls what's shown.
const OWNER_ADMIN: string[] = ['owner', 'admin']
const OWNER_MANAGER_ADMIN: string[] = ['owner', 'manager', 'admin']

const navItems: NavItem[] = [
  { id: 'dashboard', labelKey: 'tab_dashboard', icon: <LayoutDashboard className="h-4 w-4" />, minRole: OWNER_MANAGER_ADMIN, hideForNpc: true },
  { id: 'stock', labelKey: 'tab_stock', icon: <Package className="h-4 w-4" />, minRole: OWNER_MANAGER_ADMIN },
  { id: 'catalog', labelKey: 'tab_order_vehicles', icon: <Truck className="h-4 w-4" />, minRole: OWNER_MANAGER_ADMIN, hideForNpc: true },
  { id: 'employees', labelKey: 'tab_employees', icon: <Users className="h-4 w-4" />, minRole: OWNER_ADMIN },
  { id: 'finances', labelKey: 'tab_finances', icon: <LineChart className="h-4 w-4" />, minRole: OWNER_MANAGER_ADMIN, hideForNpc: true },
  { id: 'commission', labelKey: 'tab_commission', icon: <Percent className="h-4 w-4" />, minRole: OWNER_ADMIN },
  { id: 'coupons', labelKey: 'tab_coupons', icon: <Ticket className="h-4 w-4" />, minRole: OWNER_MANAGER_ADMIN, feature: 'coupons' },
  { id: 'financing', labelKey: 'tab_financing', icon: <CreditCard className="h-4 w-4" />, minRole: OWNER_ADMIN },
  { id: 'settings', labelKey: 'tab_settings', icon: <SettingsIcon className="h-4 w-4" />, minRole: OWNER_ADMIN },
]

// tierFeatures lookup retired with the tier system. Every feature tab is now
// role-gated only; financing and coupons were the last tier-dependent tabs
// and they're available to every dealership going forward.

export default function ManagementPage({ data, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<ManagementTab>(data.initialTab as ManagementTab || 'dashboard')
  const [balance, setBalance] = useState<number | null>(data.initialBalance ?? null)
  const [purchasing, setPurchasing] = useState(false)
  const [progression, setProgression] = useState<DealershipProgression | null>(null)

  const refreshProgression = () => {
    fetchNui<{ progression: DealershipProgression | null }>('getDealershipProgression', {
      dealershipId: data.dealershipId,
    }).then((res) => setProgression(res?.progression ?? null)).catch(() => {})
  }

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
    refreshProgression()
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
    if (item.hideForNpc && data.mode === 'managed') return false
    return true
  }

  const visibleItems = navItems.filter(canAccess)

  // If the default/initial tab got filtered out (e.g. dashboard hidden for NPC
  // shops), bump to the first visible tab so the content area isn't empty.
  useEffect(() => {
    if (visibleItems.length > 0 && !visibleItems.some((i) => i.id === activeTab)) {
      setActiveTab(visibleItems[0].id)
    }
  }, [visibleItems, activeTab])

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
        return <FinancingSettingsPanel dealershipId={data.dealershipId} dealershipName={data.dealershipName} />
      case 'settings':
        return <DealershipSettings dealershipId={data.dealershipId} />
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
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {progression?.enabled && data.mode !== 'managed' && (
              <Badge className="text-[10px] px-1.5 py-0 bg-accent text-accent-foreground">
                {t('progression_level_short', String(progression.level))}
              </Badge>
            )}
            {progression?.label && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {progression.label}
              </Badge>
            )}
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">
              {data.role}
            </Badge>
          </div>
          {/* Automated (NPC) dealerships have no progression loop and no managed
              balance — they're just auto-listed stock, so these readouts are hidden. */}
          {progression?.enabled && data.mode !== 'managed' && (
            <div className="mt-2">
              {progression.nextLevelXp !== null && !progression.isMaxLevel ? (
                <>
                  <div className="flex justify-between text-[9px] text-muted-foreground font-mono mb-0.5">
                    <span>{progression.xp} XP</span>
                    <span>{progression.nextLevelXp}</span>
                  </div>
                  <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent transition-all"
                      style={{
                        width: `${Math.max(0, Math.min(100, Math.round(((progression.xp - progression.currentLevelXp) / Math.max(1, progression.nextLevelXp - progression.currentLevelXp)) * 100)))}%`,
                      }}
                    />
                  </div>
                </>
              ) : (
                <p className="text-[9px] text-muted-foreground font-mono">{t('progression_max_level', String(progression.xp))}</p>
              )}
            </div>
          )}
          {balance !== null && data.mode !== 'managed' && (
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

interface CommissionPayload {
  job: string | null
  factionType?: 'job' | 'gang'
  grades: { level: number; label: string }[]
  rates: { level: number; rate: number }[]
  defaultRate: number
}

function CommissionSettings({ dealershipId }: { dealershipId: number }) {
  const [payload, setPayload] = useState<CommissionPayload | null>(null)
  const [fetchFailed, setFetchFailed] = useState(false)
  // Keyed by grade level (as string) so the input preserves empty state independently per row.
  const [rates, setRates] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchNui<{ success: boolean; rates: CommissionPayload }>('getCommissionRates', {
      dealershipId,
    }).then((res) => {
      if (res.success && res.rates) {
        setPayload(res.rates)
        const next: Record<string, string> = {}
        const defaultRate = String(res.rates.defaultRate ?? 8)
        // Seed every grade with the server default so the input never looks empty;
        // saved rates (including explicit 0) override the default.
        for (const g of res.rates.grades ?? []) next[String(g.level)] = defaultRate
        for (const r of res.rates.rates ?? []) next[String(r.level)] = String(r.rate)
        setRates(next)
      } else {
        setFetchFailed(true)
      }
      setLoading(false)
    }).catch(() => { setFetchFailed(true); setLoading(false) })
  }, [dealershipId])

  const handleSave = () => {
    if (!payload) return
    setSaving(true)
    const outRates = payload.grades.map((g) => ({
      level: g.level,
      rate: parseInt(rates[String(g.level)] ?? '') || 0,
    }))
    fetchNui('setCommissionRates', {
      dealershipId,
      rates: outRates,
    }).then(() => setSaving(false)).catch(() => setSaving(false))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground">
        {t('loading')}
      </div>
    )
  }

  // Three distinct bad states: callback failed entirely (permission / server issue),
  // no faction assigned at all, OR faction assigned but the framework returned no
  // grades for it. Showing them separately avoids the old "no job linked" catch-all
  // that hid permission bugs under a data-config message.
  if (fetchFailed) {
    return (
      <div className="p-5 space-y-3">
        <div>
          <h2 className="text-lg font-bold">{t('commission_rates')}</h2>
          <p className="text-sm text-muted-foreground">{t('commission_rates_desc')}</p>
        </div>
        <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
          {t('management_commission_fetch_failed')}
        </div>
      </div>
    )
  }

  if (!payload || !payload.job) {
    return (
      <div className="p-5 space-y-3">
        <div>
          <h2 className="text-lg font-bold">{t('commission_rates')}</h2>
          <p className="text-sm text-muted-foreground">{t('commission_rates_desc')}</p>
        </div>
        <div className="rounded-md border border-orange-500/30 bg-orange-500/10 p-3 text-sm text-orange-300">
          {t('commission_no_job')}
        </div>
        <p className="text-xs text-muted-foreground">
          {t('commission_default_fallback', String(payload?.defaultRate ?? 8))}
        </p>
      </div>
    )
  }

  if (payload.grades.length === 0) {
    return (
      <div className="p-5 space-y-3">
        <div>
          <h2 className="text-lg font-bold">{t('commission_rates')}</h2>
          <p className="text-sm text-muted-foreground">{t('commission_rates_desc')}</p>
          <p className="text-xs text-muted-foreground mt-1 font-mono">
            {t(payload.factionType === 'gang' ? 'label_gang' : 'label_job')}: {payload.job}
          </p>
        </div>
        <div className="rounded-md border border-orange-500/30 bg-orange-500/10 p-3 text-sm text-orange-300">
          {t('commission_no_grades', payload.job)}
        </div>
        <p className="text-xs text-muted-foreground">
          {t('commission_default_fallback', String(payload.defaultRate ?? 8))}
        </p>
      </div>
    )
  }

  return (
    <div className="p-5 space-y-4">
      <div>
        <h2 className="text-lg font-bold">{t('commission_rates')}</h2>
        <p className="text-sm text-muted-foreground">{t('commission_rates_desc')}</p>
      </div>

      <div className="space-y-2 max-w-md">
        {payload.grades.map((g) => (
          <div key={g.level} className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{g.label}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Input
                type="number"
                min="0"
                max="100"
                value={rates[String(g.level)] ?? ''}
                onChange={(e) => setRates({ ...rates, [String(g.level)]: e.target.value })}
                className="w-20 h-8"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>
        ))}

        <Button onClick={handleSave} disabled={saving} className="mt-2">
          {saving ? t('saving') : t('btn_save')}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {t('commission_default_fallback', String(payload.defaultRate))}
      </p>
    </div>
  )
}

type FactionGrade = { level: number; label?: string }

function DealershipSettings({ dealershipId }: { dealershipId: number }) {
  const [loading, setLoading] = useState(true)
  const [disableSelfPurchase, setDisableSelfPurchase] = useState(false)
  const [grades, setGrades] = useState<FactionGrade[]>([])
  const [managerMinGrade, setManagerMinGrade] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [savingGrade, setSavingGrade] = useState(false)

  useEffect(() => {
    fetchNui<{ disableSelfPurchase?: boolean; grades?: FactionGrade[]; managerMinGrade?: number } | null>('getDealershipSettings', { dealershipId })
      .then((res) => {
        setDisableSelfPurchase(res?.disableSelfPurchase === true)
        setGrades(Array.isArray(res?.grades) ? res!.grades! : [])
        setManagerMinGrade(typeof res?.managerMinGrade === 'number' ? res!.managerMinGrade! : null)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [dealershipId])

  const toggleSelfPurchase = (next: boolean) => {
    setDisableSelfPurchase(next)
    setSaving(true)
    fetchNui<{ success: boolean }>('setDisableSelfPurchase', { dealershipId, value: next })
      .catch(() => setDisableSelfPurchase(!next))
      .finally(() => setSaving(false))
  }

  const changeManagerGrade = (next: number) => {
    const prev = managerMinGrade
    setManagerMinGrade(next)
    setSavingGrade(true)
    fetchNui<{ success: boolean }>('setManagerMinGrade', { dealershipId, grade: next })
      .then((res) => { if (!res?.success) setManagerMinGrade(prev ?? null) })
      .catch(() => setManagerMinGrade(prev ?? null))
      .finally(() => setSavingGrade(false))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground">
        {t('loading')}
      </div>
    )
  }

  // Grades sorted high→low so the boss (owner) sits at the top of the list.
  const sortedGrades = [...grades].sort((a, b) => b.level - a.level)

  return (
    <ScrollArea className="h-full">
      <div className="p-5 space-y-5 max-w-2xl">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <SettingsIcon className="h-4 w-4" /> {t('settings_title')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('settings_desc')}</p>
        </div>

        <Separator />

        <label className="flex items-start gap-3 cursor-pointer select-none rounded-md border border-border p-3 hover:bg-muted/50">
          <input
            type="checkbox"
            className="h-4 w-4 mt-0.5 accent-accent"
            checked={disableSelfPurchase}
            disabled={saving}
            onChange={(e) => toggleSelfPurchase(e.target.checked)}
          />
          <div className="flex-1">
            <div className="text-sm font-medium">{t('settings_disable_self_purchase')}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {t('settings_disable_self_purchase_desc')}
            </div>
          </div>
        </label>

        {sortedGrades.length > 0 && (
          <div className="rounded-md border border-border p-3">
            <div className="text-sm font-medium">{t('settings_manager_rank')}</div>
            <div className="text-xs text-muted-foreground mt-0.5 mb-2">
              {t('settings_manager_rank_desc')}
            </div>
            <select
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm disabled:opacity-50"
              value={managerMinGrade ?? ''}
              disabled={savingGrade}
              onChange={(e) => changeManagerGrade(Number(e.target.value))}
            >
              {sortedGrades.map((g) => (
                <option key={g.level} value={g.level}>
                  {g.label ? `${g.label} (${g.level})` : `Grade ${g.level}`}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </ScrollArea>
  )
}
