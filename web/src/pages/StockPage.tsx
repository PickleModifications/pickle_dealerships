import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Separator } from '../components/ui/separator'
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog'
import { fetchNui, formatClass, formatCurrency, getVehicleImage } from '../lib/utils'
import { t } from '../lib/locale'
import { SkeletonCardGrid } from '../components/ui/skeleton'
import { X, Search, Package, Truck, Clock, Car, Pencil, SlidersHorizontal, FileText, Gavel, EyeOff, Eye, Settings, Shield, Loader2 } from 'lucide-react'
import VehicleImg from '../components/VehicleImg'
import { PickleFaxDialog } from '../components/PickleFax'
import AuctionListDialog from '../components/AuctionListDialog'
import type { DealershipData, StockItem } from '../types'

interface Props {
  data: DealershipData
  onClose: () => void
}

const COLUMNS = 3
const GAP = 8
const PAGE_SIZE = 60

interface StockSummary {
  totals: { new: number; used: number; all: number; quantity: number }
  classes: string[]
  maxRetailPrice: number
  inTransit: StockItem[]
}

// NPC-seeded stock is intentionally infinite on the server (quantity=999999) —
// for UI purposes we clamp it to 1 so the "xN" badge and summary counter don't
// blast players with nonsense numbers.
function displayQty(item: StockItem): number {
  if (item.acquired_from === 'npc_seed') return 1
  return item.quantity || 1
}

function getStockMinGrade(item: StockItem): number {
  let meta = item.metadata as unknown
  if (typeof meta === 'string') {
    try { meta = JSON.parse(meta) } catch { return 0 }
  }
  if (meta && typeof meta === 'object') {
    const mg = (meta as Record<string, unknown>).minGrade
    return typeof mg === 'number' ? mg : 0
  }
  return 0
}

function getDeliveryStatus(item: StockItem): 'available' | 'in_transit' | 'pending' {
  if (!item.delivered_at) return 'pending'
  if (new Date(item.delivered_at) > new Date()) return 'in_transit'
  return 'available'
}

function getTimeRemaining(deliveredAt: string): string {
  const diff = new Date(deliveredAt).getTime() - Date.now()
  if (diff <= 0) return '0:00'
  const totalSecs = Math.ceil(diff / 1000)
  const mins = Math.floor(totalSecs / 60)
  const secs = totalSecs % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function getDeliveryProgress(item: StockItem): number {
  if (!item.delivered_at || !item.ordered_at) return 0
  const start = new Date(item.ordered_at).getTime()
  const end = new Date(item.delivered_at).getTime()
  const now = Date.now()
  if (now >= end) return 100
  if (now <= start) return 0
  return Math.min(100, ((now - start) / (end - start)) * 100)
}

export default function StockPage({ data, onClose }: Props) {
  const [items, setItems] = useState<StockItem[]>([])
  const [summary, setSummary] = useState<StockSummary | null>(null)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  const [search, setSearch] = useState('')
  const [stockTab, setStockTab] = useState<'new' | 'used'>('new')
  const [classFilter, setClassFilter] = useState('all')
  const [sortBy, setSortBy] = useState<'name_asc' | 'name_desc' | 'price_asc' | 'price_desc'>('name_asc')
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 0])
  const [committedPriceRange, setCommittedPriceRange] = useState<[number, number]>([0, 0])
  const [showFilters, setShowFilters] = useState(false)
  const [, setTick] = useState(0)

  const [editingPrice, setEditingPrice] = useState<StockItem | null>(null)
  const [priceInput, setPriceInput] = useState('')
  const [pickleFaxId, setPickleFaxId] = useState<number | null>(null)
  const [auctionListingItem, setAuctionListingItem] = useState<StockItem | null>(null)
  const [selectedItem, setSelectedItem] = useState<StockItem | null>(null)
  const [editingGrade, setEditingGrade] = useState<StockItem | null>(null)
  const [gradeInput, setGradeInput] = useState<number>(0)
  const [factionGrades, setFactionGrades] = useState<{ level: number; label: string }[] | null>(null)
  const [factionJob, setFactionJob] = useState<string | null>(null)
  const [factionType, setFactionType] = useState<'job' | 'gang'>('job')
  const parentRef = useRef<HTMLDivElement>(null)

  // The committed price range is what we send to the server. The pending
  // range tracks slider drag so we don't refetch on every mouse move.
  const isPriceFiltered = useCallback((r: [number, number], cap: number): boolean => {
    return r[0] > 0 || (cap > 0 && r[1] < cap)
  }, [])

  const buildParams = useCallback((overrides?: Partial<{ page: number; includeSummary: boolean }>) => {
    const max = committedPriceRange[1]
    const cap = summary?.maxRetailPrice ?? 0
    return {
      dealershipId: data.dealershipId,
      location: data.location,
      tab: stockTab,
      scope: 'manager',
      availableOnly: true,
      page: overrides?.page ?? 1,
      pageSize: PAGE_SIZE,
      search: search || '',
      classFilter,
      minPrice: committedPriceRange[0] > 0 ? committedPriceRange[0] : undefined,
      // Only send maxPrice if the slider is actually pulled below the cap —
      // otherwise we filter out the most expensive vehicle.
      maxPrice: max > 0 && cap > 0 && max < cap ? max : undefined,
      sortBy,
      includeSummary: overrides?.includeSummary ?? false,
    }
  }, [data.dealershipId, data.location, stockTab, search, classFilter, committedPriceRange, sortBy, summary?.maxRetailPrice])

  // Initial load + refetch whenever tab/search/filter/sort changes.
  // Search is debounced so we don't fire a request on every keystroke.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const handle = setTimeout(() => {
      fetchNui<{ items: StockItem[]; total: number; summary?: StockSummary }>('getStock', buildParams({ page: 1, includeSummary: true })).then((res) => {
        if (cancelled) return
        setItems(res?.items ?? [])
        setTotal(res?.total ?? 0)
        setPage(1)
        if (res?.summary) {
          setSummary(res.summary)
          // Seed the slider's upper bound on first load so the range covers
          // the dealership's full price spread. Subsequent loads keep the
          // user's chosen range.
          if (priceRange[1] === 0 && res.summary.maxRetailPrice > 0) {
            setPriceRange([0, res.summary.maxRetailPrice])
            setCommittedPriceRange([0, res.summary.maxRetailPrice])
          }
        }
        // Keep the currently selected item in sync if it's still in the page.
        setSelectedItem((prev) => {
          if (!prev) return null
          return (res?.items ?? []).find((s) => s.id === prev.id) || null
        })
        setLoading(false)
      }).catch(() => { if (!cancelled) setLoading(false) })
    }, search ? 220 : 0)
    return () => { cancelled = true; clearTimeout(handle) }
    // priceRange itself is excluded — only committed changes trigger a refetch.
  }, [buildParams])

  const loadMore = useCallback(() => {
    if (loadingMore || loading || items.length >= total) return
    setLoadingMore(true)
    const next = page + 1
    fetchNui<{ items: StockItem[]; total: number }>('getStock', buildParams({ page: next })).then((res) => {
      setItems((prev) => [...prev, ...(res?.items ?? [])])
      setTotal(res?.total ?? total)
      setPage(next)
    }).finally(() => setLoadingMore(false))
  }, [buildParams, items.length, loading, loadingMore, page, total])

  // Trigger an explicit refresh when something mutates (price edit, list/unlist,
  // grade change). Re-runs the current page with summary so totals stay correct.
  const reloadStock = useCallback(() => {
    fetchNui<{ items: StockItem[]; total: number; summary?: StockSummary }>('getStock', buildParams({ page: 1, includeSummary: true })).then((res) => {
      setItems(res?.items ?? [])
      setTotal(res?.total ?? 0)
      setPage(1)
      if (res?.summary) setSummary(res.summary)
      setSelectedItem((prev) => {
        if (!prev) return null
        return (res?.items ?? []).find((s) => s.id === prev.id) || null
      })
    })
  }, [buildParams])

  // Tick every second while there are in-transit timers visible so the
  // countdown updates without a full reload.
  useEffect(() => {
    const inTransit = summary?.inTransit ?? []
    if (inTransit.length === 0) return
    const interval = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(interval)
  }, [summary?.inTransit])

  const handleSetPrice = () => {
    if (!editingPrice) return
    const price = parseInt(priceInput)
    if (!price || price < 0) return
    fetchNui('setRetailPrice', {
      dealershipId: data.dealershipId,
      location: data.location,
      stockId: editingPrice.id,
      retailPrice: price,
    }).then(() => {
      setEditingPrice(null)
      setPriceInput('')
      reloadStock()
    })
  }

  const openMinGradeEditor = (item: StockItem) => {
    setEditingGrade(item)
    setGradeInput(getStockMinGrade(item))
    if (factionGrades === null) {
      fetchNui<{ success: boolean; rates: { job: string | null; factionType?: 'job' | 'gang'; grades: { level: number; label: string }[] } }>('getCommissionRates', {
        dealershipId: data.dealershipId,
      }).then((res) => {
        if (res.success && res.rates) {
          setFactionGrades(res.rates.grades || [])
          setFactionJob(res.rates.job)
          setFactionType(res.rates.factionType === 'gang' ? 'gang' : 'job')
        } else {
          setFactionGrades([])
        }
      }).catch(() => setFactionGrades([]))
    }
  }

  const handleSaveMinGrade = () => {
    if (!editingGrade) return
    fetchNui('setStockMinGrade', {
      dealershipId: data.dealershipId,
      location: data.location,
      stockId: editingGrade.id,
      minGrade: gradeInput,
    }).then(() => {
      setEditingGrade(null)
      setSelectedItem(null)
      reloadStock()
    })
  }

  const handleToggleUnlisted = (item: StockItem) => {
    fetchNui('toggleUnlisted', {
      dealershipId: data.dealershipId,
      location: data.location,
      stockId: item.id,
    }).then(() => reloadStock())
  }

  const classes = summary?.classes ?? []
  const maxRetailPrice = summary?.maxRetailPrice ?? 0
  const inTransit = summary?.inTransit ?? []
  const totalQuantity = summary?.totals.quantity ?? 0
  const newCount = summary?.totals.new ?? 0
  const usedCount = summary?.totals.used ?? 0
  const activeFilterCount = (classFilter !== 'all' ? 1 : 0) + (isPriceFiltered(committedPriceRange, maxRetailPrice) ? 1 : 0)

  // Build a quick lookup from in-transit data so available cards can show a
  // "+N incoming" badge for the same model. Quantities are summed across all
  // in-flight rows (raw stock + pending orders).
  const inTransitByModel = useMemo(() => {
    const map = new Map<string, { quantity: number; delivered_at?: string; ordered_at?: string }>()
    for (const item of inTransit) {
      const existing = map.get(item.vehicle_model)
      const qty = item.quantity || 1
      if (existing) {
        existing.quantity += qty
        if (item.delivered_at && existing.delivered_at && new Date(item.delivered_at) < new Date(existing.delivered_at)) {
          existing.delivered_at = item.delivered_at
          existing.ordered_at = item.ordered_at
        }
      } else {
        map.set(item.vehicle_model, {
          quantity: qty,
          delivered_at: item.delivered_at ?? undefined,
          ordered_at: item.ordered_at ?? undefined,
        })
      }
    }
    return map
  }, [inTransit])

  // For the in-transit strip we collapse by model so a dealership with 5
  // separate Comet orders shows one row with "x5".
  const inTransitDisplay = useMemo(() => {
    const map = new Map<string, StockItem>()
    for (const item of inTransit) {
      const existing = map.get(item.vehicle_model)
      if (existing) {
        existing.quantity = (existing.quantity || 1) + (item.quantity || 1)
        if (item.delivered_at && existing.delivered_at && new Date(item.delivered_at) < new Date(existing.delivered_at)) {
          existing.delivered_at = item.delivered_at
          existing.ordered_at = item.ordered_at
        }
      } else {
        map.set(item.vehicle_model, { ...item, quantity: item.quantity || 1 })
      }
    }
    return Array.from(map.values())
  }, [inTransit])

  const canManage = data.role === 'owner' || data.role === 'manager' || data.role === 'admin'

  const rowCount = Math.ceil(items.length / COLUMNS)
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100,
    overscan: 5,
  })

  // Infinite scroll: fire loadMore when the user has scrolled past most of
  // the rendered rows. Triggered as a side effect of virtualization rather
  // than a scroll listener so it stays in sync with the virtualizer.
  useEffect(() => {
    const virtualRows = virtualizer.getVirtualItems()
    if (virtualRows.length === 0) return
    const lastVisible = virtualRows[virtualRows.length - 1].index
    if (lastVisible >= rowCount - 2 && items.length < total) {
      loadMore()
    }
  }, [virtualizer.getVirtualItems(), rowCount, items.length, total, loadMore])

  const commitPriceRange = () => {
    if (priceRange[0] !== committedPriceRange[0] || priceRange[1] !== committedPriceRange[1]) {
      setCommittedPriceRange(priceRange)
    }
  }

  return (
    <>
      {!data.embedded && (
        <div className="flex items-center justify-between p-5 pb-0">
          <div>
            <h1 className="text-xl font-bold">{t('title_stock_inventory')}</h1>
            <p className="text-sm text-muted-foreground">{data.dealershipName} &mdash; {totalQuantity} vehicles</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
      )}

      <div className="px-5 pt-3 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t('label_search_vehicles')} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button
          variant={showFilters || activeFilterCount > 0 ? 'default' : 'outline'}
          size="icon"
          className="h-9 w-9 shrink-0 relative"
          onClick={() => setShowFilters(!showFilters)}
        >
          <SlidersHorizontal className="h-4 w-4" />
          {activeFilterCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-accent text-accent-foreground text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </div>

      {showFilters && (
        <div className="px-5 pt-3 space-y-3">
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[140px]">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">{t('label_sort_by')}</p>
              <div className="flex flex-wrap gap-1">
                {([['name_asc', t('label_sort_az')], ['name_desc', t('label_sort_za')], ['price_asc', t('label_sort_price_low')], ['price_desc', t('label_sort_price_high')]] as const).map(([value, label]) => (
                  <button key={value} onClick={() => setSortBy(value)} className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${sortBy === value ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>{label}</button>
                ))}
              </div>
            </div>
            {classes.length > 0 && (
              <div className="flex-1 min-w-[140px]">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">{t('label_class')}</p>
                <div className="flex flex-wrap gap-1">
                  <button onClick={() => setClassFilter('all')} className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${classFilter === 'all' ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>{t('label_all')}</button>
                  {classes.map((cls) => (
                    <button key={cls} onClick={() => setClassFilter(cls)} className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${classFilter === cls ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>{formatClass(cls)}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {maxRetailPrice > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{t('label_price_range')}</p>
                {isPriceFiltered(committedPriceRange, maxRetailPrice) && (
                  <button onClick={() => { setPriceRange([0, maxRetailPrice]); setCommittedPriceRange([0, maxRetailPrice]) }} className="text-[9px] text-accent hover:text-accent/80">{t('label_reset')}</button>
                )}
              </div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[10px] text-muted-foreground">{formatCurrency(priceRange[0])}</span>
                <span className="text-[10px] text-muted-foreground/50">&mdash;</span>
                <span className="text-[10px] text-muted-foreground">{formatCurrency(priceRange[1])}</span>
              </div>
              <DualRangeSlider min={0} max={maxRetailPrice} value={priceRange} step={Math.max(1, Math.round(maxRetailPrice / 100))} onChange={setPriceRange} onCommit={commitPriceRange} />
            </div>
          )}
        </div>
      )}

      <Separator className="mt-3" />

      <div className="px-5 pt-3">
        <Tabs value={stockTab} onValueChange={(v) => setStockTab(v as 'new' | 'used')}>
          <TabsList className="h-8 w-full grid grid-cols-2">
            <TabsTrigger value="new" className="text-xs gap-1.5">
              {t('tab_new')} <span className="text-[10px] text-muted-foreground">({newCount})</span>
            </TabsTrigger>
            <TabsTrigger value="used" className="text-xs gap-1.5">
              {t('tab_preowned')} <span className="text-[10px] text-muted-foreground">({usedCount})</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* In-transit — not virtualized (always a small set) */}
      {!loading && stockTab === 'new' && inTransitDisplay.length > 0 && (
        <div className="px-5 pt-3">
          <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
            <Truck className="h-3.5 w-3.5" /> {t('label_in_transit')} ({inTransitDisplay.length})
          </p>
          <div className="space-y-1.5">
            {inTransitDisplay.map((item) => (
              <Card key={item.id} className="overflow-hidden border-dashed">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <VehicleImg image={item.image} model={item.vehicle_model} alt={item.vehicle_label} className="h-9 w-16 object-contain rounded-md bg-muted shrink-0" fallbackClassName="h-9 w-16 rounded-md bg-amber-500/10 flex items-center justify-center shrink-0" iconClassName="h-4 w-4 text-amber-400" />
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-sm">{item.vehicle_label || item.vehicle_model}</p>
                          {(item.quantity || 1) > 1 && (
                            <Badge variant="secondary" className="text-xs">x{item.quantity}</Badge>
                          )}
                          {item.bundle && item.bundle.bundle_size > 1 && (
                            <Badge variant="outline" className="text-[10px] gap-1">
                              <Truck className="h-3 w-3" /> +{item.bundle.bundle_size - 1}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{formatClass(item.class) || t('label_vehicle')}</p>
                        {item.bundle && item.bundle.bundle_size > 1 && (
                          <p className="text-[10px] text-muted-foreground/80 truncate max-w-[260px]">
                            + {item.bundle.vehicles.slice(1).map((v) => v.label || v.model).join(', ')}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      {item.delivered_at ? (
                        <p className="text-sm font-mono font-semibold text-amber-400">{getTimeRemaining(item.delivered_at)}</p>
                      ) : item.bundle && item.bundle.claimed_by ? (
                        <Badge variant="outline" className="text-amber-400">{t('label_in_transit')}</Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">{t('label_pending')}</Badge>
                      )}
                    </div>
                  </div>
                  {item.delivered_at && (
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-400 rounded-full transition-all duration-1000 ease-linear"
                        style={{ width: `${getDeliveryProgress(item)}%` }}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Available — virtualized 3-column grid */}
      <div className="relative flex-1 flex flex-col overflow-hidden">
        <div ref={parentRef} className="flex-1 overflow-auto p-5">
          {loading ? (
            <SkeletonCardGrid count={6} columns={3} />
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <Package className="h-10 w-10 mb-2 opacity-50" />
              <p>{search ? t('empty_no_matching') : stockTab === 'used' ? t('empty_no_preowned') : t('empty_no_new')}</p>
            </div>
          ) : (
            <div>
              {inTransitDisplay.length > 0 && stockTab === 'new' && (
                <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5" /> {t('label_available', String(total))}
                </p>
              )}
              <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
                  {virtualizer.getVirtualItems().map((virtualRow) => {
                    const startIdx = virtualRow.index * COLUMNS
                    const rowItems = items.slice(startIdx, startIdx + COLUMNS)

                    return (
                      <div
                        key={virtualRow.index}
                        className="absolute top-0 left-0 w-full grid grid-cols-3"
                        style={{
                          height: '94px',
                          gap: `${GAP}px`,
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                      >
                        {rowItems.map((item) => {
                          const incoming = inTransitByModel.get(item.vehicle_model)
                          const profit = item.retail_price - item.wholesale_cost
                          return (
                          <div key={item.id} className="rounded-lg border border-border hover:border-accent/50 transition-colors h-full p-2.5 flex flex-col justify-between overflow-hidden cursor-pointer" onClick={() => setSelectedItem(item)}>
                            <div className="flex items-center gap-2 min-w-0">
                              <VehicleImg image={item.image} model={item.vehicle_model} alt={item.vehicle_label} className="h-10 w-[70px] object-contain rounded-md bg-muted shrink-0" fallbackClassName="h-10 w-[70px] rounded-md bg-muted flex items-center justify-center shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-semibold text-xs truncate">{item.vehicle_label || item.vehicle_model}</span>
                                  {item.is_used && item.plate && (
                                    <span className="text-[9px] bg-violet-500/20 text-violet-300 px-1 rounded shrink-0 font-mono">{item.plate}</span>
                                  )}
                                  {incoming && (
                                    <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1 rounded shrink-0 flex items-center gap-0.5">
                                      <Truck className="h-2.5 w-2.5" /> +{incoming.quantity}
                                    </span>
                                  )}
                                </div>
                                <p className="text-[10px] text-muted-foreground">{formatClass(item.class) || t('label_vehicle')}</p>
                              </div>
                            </div>
                            <div className="flex items-center justify-between pt-1.5 mt-1.5 border-t border-border">
                              <div className="flex items-center gap-2.5">
                                <div>
                                  <p className="text-[9px] text-muted-foreground leading-none">{t('label_retail')}</p>
                                  <p className="text-xs font-bold text-accent leading-tight">{formatCurrency(item.retail_price)}</p>
                                </div>
                                <div>
                                  <p className="text-[9px] text-muted-foreground leading-none">{t('label_profit')}</p>
                                  <p className={`text-xs font-medium leading-tight ${profit < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>{formatCurrency(profit)}</p>
                                </div>
                                {item.is_used && (() => {
                                  const cond = Math.round(Number(item.condition) || 0)
                                  const color = cond >= 80 ? 'text-emerald-400' : cond >= 50 ? 'text-amber-400' : 'text-rose-400'
                                  return (
                                    <div>
                                      <p className="text-[9px] text-muted-foreground leading-none">{t('label_condition')}</p>
                                      <p className={`text-xs font-medium leading-tight ${color}`}>{cond}%</p>
                                    </div>
                                  )
                                })()}
                              </div>
                              <div className="flex items-center gap-1">
                                {!item.is_used && (item.quantity || 1) > 1 && (
                                  <span className="text-[9px] bg-muted text-muted-foreground px-1 rounded">x{item.quantity}</span>
                                )}
                                {!!item.unlisted && <span className="text-[9px] bg-rose-500/20 text-rose-300 px-1 rounded flex items-center gap-0.5"><EyeOff className="h-2 w-2" /></span>}
                                {!!item.auction_id && <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1 rounded flex items-center gap-0.5"><Gavel className="h-2 w-2" /></span>}
                              </div>
                            </div>
                          </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              {loadingMore && (
                <div className="flex items-center justify-center py-4 text-xs text-muted-foreground gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('loading')}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {pickleFaxId !== null && (
        <PickleFaxDialog stockId={pickleFaxId} mode="employee" onClose={() => setPickleFaxId(null)} />
      )}

      {auctionListingItem && (
        <AuctionListDialog
          item={auctionListingItem}
          onClose={() => setAuctionListingItem(null)}
          onListed={() => reloadStock()}
        />
      )}

      {/* Stock item management modal */}
      {selectedItem && (() => {
        const hasSubDialog = !!(pickleFaxId || auctionListingItem || editingPrice || editingGrade)
        return (
        <div style={{ display: hasSubDialog ? 'none' : undefined }}>
          <div className="absolute inset-0 z-40 bg-black/50 rounded-[inherit]" onClick={() => setSelectedItem(null)} />
          <div className="absolute inset-0 z-50 flex items-center justify-center p-6 pointer-events-none" style={{ overflow: 'hidden' }}>
            <div className="pointer-events-auto relative flex flex-col w-full border border-border bg-card shadow-lg rounded-lg" style={{ maxWidth: '24rem', maxHeight: 'calc(100% - 2rem)', overflow: 'hidden' }}>
              {/* Header */}
              <div className="p-5 pb-3 shrink-0">
                <button className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none" onClick={() => setSelectedItem(null)}>
                  <X className="h-4 w-4" />
                </button>
                <div className="flex items-start gap-3">
                  <VehicleImg image={selectedItem.image} model={selectedItem.vehicle_model} alt={selectedItem.vehicle_label} className="h-14 w-24 object-contain rounded-md bg-muted shrink-0" fallbackClassName="h-14 w-24 rounded-md bg-muted flex items-center justify-center shrink-0" />
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold leading-tight truncate">{selectedItem.vehicle_label || selectedItem.vehicle_model}</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">{formatClass(selectedItem.class) || t('label_vehicle')}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {selectedItem.is_used && selectedItem.plate && (
                        <span className="text-[10px] bg-violet-500/20 text-violet-300 px-1 rounded font-mono">{selectedItem.plate}</span>
                      )}
                      {!selectedItem.is_used && (selectedItem.quantity || 1) > 1 && (
                        <span className="text-[10px] bg-muted px-1 rounded">x{selectedItem.quantity}</span>
                      )}
                      {!!selectedItem.unlisted && (
                        <span className="text-[10px] bg-rose-500/20 text-rose-300 px-1 rounded flex items-center gap-0.5"><EyeOff className="h-2.5 w-2.5" /> {t('label_unlisted')}</span>
                      )}
                      {!!selectedItem.auction_id && (
                        <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1 rounded flex items-center gap-0.5"><Gavel className="h-2.5 w-2.5" /> {t('label_at_auction')}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              {/* Body */}
              <div className="flex-1 overflow-y-auto px-5 pb-5" style={{ minHeight: 0 }}>
                {/* Stats */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="bg-muted/50 rounded-md px-3 py-2">
                    <p className="text-[10px] text-muted-foreground">{t('label_retail')}</p>
                    <p className="text-sm font-bold text-accent">{formatCurrency(selectedItem.retail_price)}</p>
                  </div>
                  <div className="bg-muted/50 rounded-md px-3 py-2">
                    <p className="text-[10px] text-muted-foreground">{t('label_wholesale_cost')}</p>
                    <p className="text-sm font-medium">{formatCurrency(selectedItem.wholesale_cost)}</p>
                  </div>
                  <div className="bg-muted/50 rounded-md px-3 py-2">
                    <p className="text-[10px] text-muted-foreground">{t('label_profit')}</p>
                    <p className={`text-sm font-medium ${selectedItem.retail_price - selectedItem.wholesale_cost < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {formatCurrency(selectedItem.retail_price - selectedItem.wholesale_cost)}
                    </p>
                  </div>
                </div>
                {selectedItem.is_used && (() => {
                  const cond = Math.round(Number(selectedItem.condition) || 0)
                  const color = cond >= 80 ? 'text-emerald-400' : cond >= 50 ? 'text-amber-400' : 'text-rose-400'
                  return (
                    <div className="bg-muted/50 rounded-md px-3 py-2 mb-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] text-muted-foreground">{t('label_condition')}</p>
                        <p className={`text-sm font-medium ${color}`}>{cond}%</p>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-1.5">
                        <div className={`h-full rounded-full ${cond >= 80 ? 'bg-emerald-400' : cond >= 50 ? 'bg-amber-400' : 'bg-rose-400'}`} style={{ width: `${cond}%` }} />
                      </div>
                    </div>
                  )
                })()}
                {/* Actions */}
                <Separator className="my-2" />
                <div className="space-y-0.5">
                  {canManage && !selectedItem.auction_id && (
                    <StockActionRow icon={<Pencil className="h-4 w-4" />} label={t('title_edit_retail_price')} value={formatCurrency(selectedItem.retail_price)} onClick={() => { setEditingPrice(selectedItem); setPriceInput(String(selectedItem.retail_price)) }} />
                  )}
                  {canManage && (
                    <StockActionRow
                      icon={<Shield className="h-4 w-4" />}
                      label={t('title_edit_min_rank')}
                      value={getStockMinGrade(selectedItem) > 0 ? t('label_min_grade_value', String(getStockMinGrade(selectedItem))) : t('label_no_restriction')}
                      onClick={() => openMinGradeEditor(selectedItem)}
                    />
                  )}
                  {selectedItem.is_used && (
                    <StockActionRow icon={<FileText className="h-4 w-4" />} label={t('picklefax_title')} onClick={() => setPickleFaxId(selectedItem.id)} />
                  )}
                  {canManage && selectedItem.is_used && !selectedItem.auction_id && (
                    <StockActionRow icon={<Gavel className="h-4 w-4" />} label={t('title_list_for_auction')} onClick={() => setAuctionListingItem(selectedItem)} />
                  )}
                  {canManage && selectedItem.is_used && !selectedItem.auction_id && (
                    <StockActionRow
                      icon={selectedItem.unlisted ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                      label={selectedItem.unlisted ? t('title_mark_listed') : t('title_mark_unlisted')}
                      accent={!!selectedItem.unlisted}
                      onClick={() => handleToggleUnlisted(selectedItem)}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
        )
      })()}

      {/* Edit minimum rank dialog */}
      <Dialog open={!!editingGrade} onOpenChange={(open) => { if (!open) setEditingGrade(null) }}>
        <DialogContent onClose={() => setEditingGrade(null)}>
          <DialogHeader>
            <DialogTitle>{t('title_edit_min_rank')}</DialogTitle>
            <DialogDescription>{editingGrade?.vehicle_label || editingGrade?.vehicle_model}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            {factionGrades === null ? (
              <p className="text-sm text-muted-foreground">{t('loading')}</p>
            ) : !factionJob ? (
              <div className="rounded-md border border-orange-500/30 bg-orange-500/10 p-3 text-sm text-orange-300">
                {t('min_rank_no_faction')}
              </div>
            ) : factionGrades.length === 0 ? (
              <div className="rounded-md border border-orange-500/30 bg-orange-500/10 p-3 text-sm text-orange-300">
                {t('commission_no_grades', factionJob)}
              </div>
            ) : (
              <>
                <p className="text-xs text-muted-foreground font-mono">{t(factionType === 'gang' ? 'label_gang' : 'label_job')}: {factionJob}</p>
                <div className="space-y-1">
                  <button
                    onClick={() => setGradeInput(0)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors ${gradeInput === 0 ? 'bg-accent text-accent-foreground' : 'bg-muted/40 hover:bg-muted'}`}
                  >
                    <span>{t('label_no_restriction')}</span>
                  </button>
                  {factionGrades.map((g) => (
                    <button
                      key={g.level}
                      onClick={() => setGradeInput(g.level)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors ${gradeInput === g.level ? 'bg-accent text-accent-foreground' : 'bg-muted/40 hover:bg-muted'}`}
                    >
                      <span>{g.label}</span>
                      <span className="text-xs opacity-70 font-mono">{t('commission_grade_level', String(g.level))}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setEditingGrade(null)}>{t('btn_cancel')}</Button>
              <Button className="flex-1" onClick={handleSaveMinGrade}>{t('btn_save')}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit retail price dialog */}
      <Dialog open={!!editingPrice} onOpenChange={(open) => { if (!open) setEditingPrice(null) }}>
        <DialogContent onClose={() => setEditingPrice(null)}>
          <DialogHeader>
            <DialogTitle>{t('title_edit_retail_price')}</DialogTitle>
            <DialogDescription>{editingPrice?.vehicle_label || editingPrice?.vehicle_model}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <p className="text-xs text-muted-foreground mb-1">{t('label_wholesale_cost')}</p>
              <p className="text-sm font-medium">{formatCurrency(editingPrice?.wholesale_cost || 0)}</p>
            </div>
            <div>
              <label className="text-sm font-medium">{t('label_retail_price')}</label>
              <Input
                type="number"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                placeholder="Set retail price..."
                className="mt-1"
              />
              {priceInput && editingPrice && (() => {
                const profit = parseInt(priceInput) - editingPrice.wholesale_cost
                return (
                  <p className={`text-xs mt-1 ${profit < 0 ? 'text-rose-400' : 'text-muted-foreground'}`}>
                    {t('label_profit')}: {formatCurrency(profit)} ({Math.round((profit / editingPrice.wholesale_cost) * 100)}%)
                  </p>
                )
              })()}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setEditingPrice(null)}>{t('btn_cancel')}</Button>
              <Button className="flex-1" onClick={() => { handleSetPrice(); setSelectedItem(null) }}>{t('btn_save_price')}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </>
  )
}

function DualRangeSlider({ min, max, value, step, onChange, onCommit }: {
  min: number; max: number; value: [number, number]; step: number
  onChange: (value: [number, number]) => void; onCommit: (value: [number, number]) => void
}) {
  const pctLow = max > min ? ((value[0] - min) / (max - min)) * 100 : 0
  const pctHigh = max > min ? ((value[1] - min) / (max - min)) * 100 : 100
  return (
    <div className="relative h-5 flex items-center">
      <div className="absolute left-0 right-0 h-1 bg-muted rounded-full" />
      <div className="absolute h-1 bg-accent/60 rounded-full" style={{ left: `${pctLow}%`, right: `${100 - pctHigh}%` }} />
      <input type="range" min={min} max={max} step={step} value={value[0]}
        onChange={(e) => { const v = Math.min(parseInt(e.target.value), value[1] - step); onChange([v, value[1]]) }}
        onMouseUp={() => onCommit(value)}
        className="absolute w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:z-10" />
      <input type="range" min={min} max={max} step={step} value={value[1]}
        onChange={(e) => { const v = Math.max(parseInt(e.target.value), value[0] + step); onChange([value[0], v]) }}
        onMouseUp={() => onCommit(value)}
        className="absolute w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:z-20" />
    </div>
  )
}

function StockActionRow({ icon, label, value, accent, onClick }: {
  icon: React.ReactNode; label: string; value?: string; accent?: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors hover:bg-muted group"
    >
      <div className={`h-8 w-8 rounded-md flex items-center justify-center shrink-0 ${accent ? 'bg-accent/15 text-accent' : 'bg-muted text-muted-foreground group-hover:text-foreground'}`}>
        {icon}
      </div>
      <span className="flex-1 text-left">{label}</span>
      {value && <span className="text-xs text-muted-foreground">{value}</span>}
    </button>
  )
}
