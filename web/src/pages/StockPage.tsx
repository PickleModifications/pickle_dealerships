import { useEffect, useState, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Separator } from '../components/ui/separator'
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog'
import { fetchNui, formatCurrency, getVehicleImage } from '../lib/utils'
import { getCached, setCache, buildKey } from '../lib/cache'
import { SkeletonCardGrid } from '../components/ui/skeleton'
import { X, Search, Package, Truck, Clock, Car, Pencil, SlidersHorizontal, FileText, Gavel } from 'lucide-react'
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
  const cacheKey = buildKey(data.dealershipId, 'stock')
  const cached = getCached<StockItem[]>(cacheKey)
  const [stock, setStock] = useState<StockItem[]>(cached ?? [])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(!cached)
  const [, setTick] = useState(0)
  const [editingPrice, setEditingPrice] = useState<StockItem | null>(null)
  const [priceInput, setPriceInput] = useState('')
  const [classFilter, setClassFilter] = useState('all')
  const [sortBy, setSortBy] = useState<'name_asc' | 'name_desc' | 'price_asc' | 'price_desc'>('name_asc')
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 0])
  const [maxRetailPrice, setMaxRetailPrice] = useState(0)
  const [showFilters, setShowFilters] = useState(false)
  const [stockTab, setStockTab] = useState<'new' | 'used'>('new')
  const [pickleFaxId, setPickleFaxId] = useState<number | null>(null)
  const [auctionListingItem, setAuctionListingItem] = useState<StockItem | null>(null)
  const parentRef = useRef<HTMLDivElement>(null)

  const loadStock = () => {
    if (!cached) setLoading(true)
    fetchNui<StockItem[] | { stock: StockItem[] }>('getStock', {
      dealershipId: data.dealershipId,
      location: data.location,
    }).then((res) => {
      const items = Array.isArray(res) ? res : (res && 'stock' in res ? res.stock : [])
      setStock(items)
      setCache(cacheKey, items)
      const highest = items.reduce((max, s) => Math.max(max, s.retail_price), 0)
      if (highest > 0 && maxRetailPrice === 0) {
        setMaxRetailPrice(highest)
        setPriceRange([0, highest])
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  useEffect(() => {
    loadStock()
  }, [data.dealershipId])

  useEffect(() => {
    const hasInTransit = stock.some((s) => getDeliveryStatus(s) !== 'available')
    if (!hasInTransit) return
    const interval = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(interval)
  }, [stock])


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
      loadStock()
    })
  }

  const classes = Array.from(new Set(stock.map((s) => s.class).filter(Boolean))).sort() as string[]
  const isPriceFiltered = (r: [number, number]) => r[0] > 0 || (maxRetailPrice > 0 && r[1] < maxRetailPrice)
  const activeFilterCount = (classFilter !== 'all' ? 1 : 0) + (isPriceFiltered(priceRange) ? 1 : 0)

  const filtered = stock.filter((item) => {
    if (search && !(item.vehicle_label || item.vehicle_model).toLowerCase().includes(search.toLowerCase())) return false
    if (classFilter !== 'all' && item.class !== classFilter) return false
    if (isPriceFiltered(priceRange) && (item.retail_price < priceRange[0] || item.retail_price > priceRange[1])) return false
    return true
  }).sort((a, b) => {
    switch (sortBy) {
      case 'name_asc': return (a.vehicle_label || a.vehicle_model).localeCompare(b.vehicle_label || b.vehicle_model)
      case 'name_desc': return (b.vehicle_label || b.vehicle_model).localeCompare(a.vehicle_label || a.vehicle_model)
      case 'price_asc': return a.retail_price - b.retail_price
      case 'price_desc': return b.retail_price - a.retail_price
      default: return 0
    }
  })

  const availableRaw = filtered.filter((s) => getDeliveryStatus(s) === 'available')
  const allInTransit = filtered.filter((s) => getDeliveryStatus(s) !== 'available' && !s.is_used)

  // UI-level consolidation for NEW stock: merge rows with same model+retail into one card.
  // Pre-owned units are kept as individual cards (each carries unique properties).
  const availableGroups = new Map<string, StockItem>()
  const preOwned: StockItem[] = []
  for (const item of availableRaw) {
    if (item.is_used) {
      preOwned.push(item)
      continue
    }
    const key = `${item.vehicle_model}|${item.retail_price}`
    const existing = availableGroups.get(key)
    if (existing) {
      existing.quantity = (existing.quantity || 1) + (item.quantity || 1)
    } else {
      availableGroups.set(key, { ...item, quantity: item.quantity || 1 })
    }
  }
  const availableNew = Array.from(availableGroups.values())
  const available = stockTab === 'used' ? preOwned : availableNew

  // Sum in-transit quantities per model so the +X badge reflects all pending orders.
  const inTransitByModel = new Map<string, StockItem>()
  for (const item of allInTransit) {
    const existing = inTransitByModel.get(item.vehicle_model)
    if (existing) {
      existing.quantity = (existing.quantity || 1) + (item.quantity || 1)
      // Keep the soonest delivery time for the badge
      if (item.delivered_at && existing.delivered_at && new Date(item.delivered_at) < new Date(existing.delivered_at)) {
        existing.delivered_at = item.delivered_at
        existing.ordered_at = item.ordered_at
      }
    } else {
      inTransitByModel.set(item.vehicle_model, { ...item, quantity: item.quantity || 1 })
    }
  }
  const inTransit = Array.from(inTransitByModel.values())

  const canManage = data.role === 'owner' || data.role === 'manager' || data.role === 'admin'

  const rowCount = Math.ceil(available.length / COLUMNS)
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 128,
    overscan: 5,
  })

  return (
    <>
      {!data.embedded && (
        <div className="flex items-center justify-between p-5 pb-0">
          <div>
            <h1 className="text-xl font-bold">Stock Inventory</h1>
            <p className="text-sm text-muted-foreground">{data.dealershipName} &mdash; {stock.reduce((sum, s) => sum + (s.quantity || 1), 0)} vehicles</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
      )}

      <div className="px-5 pt-3 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search vehicles..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
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
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Sort By</p>
              <div className="flex flex-wrap gap-1">
                {([['name_asc', 'A — Z'], ['name_desc', 'Z — A'], ['price_asc', 'Price Low'], ['price_desc', 'Price High']] as const).map(([value, label]) => (
                  <button key={value} onClick={() => setSortBy(value)} className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${sortBy === value ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>{label}</button>
                ))}
              </div>
            </div>
            {classes.length > 0 && (
              <div className="flex-1 min-w-[140px]">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Class</p>
                <div className="flex flex-wrap gap-1">
                  <button onClick={() => setClassFilter('all')} className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${classFilter === 'all' ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>All</button>
                  {classes.map((cls) => (
                    <button key={cls} onClick={() => setClassFilter(cls)} className={`px-2 py-0.5 rounded text-[10px] font-medium capitalize transition-colors ${classFilter === cls ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>{cls}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {maxRetailPrice > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Price Range</p>
                {isPriceFiltered(priceRange) && (
                  <button onClick={() => setPriceRange([0, maxRetailPrice])} className="text-[9px] text-accent hover:text-accent/80">Reset</button>
                )}
              </div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[10px] text-muted-foreground">{formatCurrency(priceRange[0])}</span>
                <span className="text-[10px] text-muted-foreground/50">&mdash;</span>
                <span className="text-[10px] text-muted-foreground">{formatCurrency(priceRange[1])}</span>
              </div>
              <DualRangeSlider min={0} max={maxRetailPrice} value={priceRange} step={Math.max(1, Math.round(maxRetailPrice / 100))} onChange={setPriceRange} onCommit={() => {}} />
            </div>
          )}
        </div>
      )}

      <Separator className="mt-3" />

      <div className="px-5 pt-3">
        <Tabs value={stockTab} onValueChange={(v) => setStockTab(v as 'new' | 'used')}>
          <TabsList className="h-8 w-full grid grid-cols-2">
            <TabsTrigger value="new" className="text-xs gap-1.5">
              New <span className="text-[10px] text-muted-foreground">({availableNew.length})</span>
            </TabsTrigger>
            <TabsTrigger value="used" className="text-xs gap-1.5">
              Pre-owned <span className="text-[10px] text-muted-foreground">({preOwned.length})</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* In-transit — not virtualized (usually small count) */}
      {!loading && stockTab === 'new' && inTransit.length > 0 && (
        <div className="px-5 pt-3">
          <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
            <Truck className="h-3.5 w-3.5" /> In Transit ({inTransit.length})
          </p>
          <div className="space-y-1.5">
            {inTransit.map((item) => (
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
                        </div>
                        <p className="text-xs text-muted-foreground capitalize">{item.class || 'Vehicle'}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      {item.delivered_at ? (
                        <p className="text-sm font-mono font-semibold text-amber-400">{getTimeRemaining(item.delivered_at)}</p>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">Awaiting Pickup</Badge>
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
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <Package className="h-10 w-10 mb-2 opacity-50" />
              <p>{search ? 'No matching vehicles found' : 'No vehicles in stock'}</p>
            </div>
          ) : available.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <Package className="h-10 w-10 mb-2 opacity-50" />
              <p>{stockTab === 'used' ? 'No pre-owned vehicles in stock' : 'No new vehicles in stock'}</p>
            </div>
          ) : (
            <div>
              {inTransit.length > 0 && (
                <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5" /> Available ({available.length})
                </p>
              )}
              <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
                  {virtualizer.getVirtualItems().map((virtualRow) => {
                    const startIdx = virtualRow.index * COLUMNS
                    const rowItems = available.slice(startIdx, startIdx + COLUMNS)

                    return (
                      <div
                        key={virtualRow.index}
                        className="absolute top-0 left-0 w-full grid grid-cols-3"
                        style={{
                          height: '120px',
                          gap: `${GAP}px`,
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                      >
                        {rowItems.map((item) => {
                          const incoming = inTransitByModel.get(item.vehicle_model)
                          return (
                          <div key={item.id} className="rounded-lg border border-border hover:border-accent/50 transition-colors h-full p-3 flex flex-col overflow-hidden">
                            <div className="flex items-start justify-between">
                              <div className="flex items-start gap-2 flex-1 min-w-0">
                                <VehicleImg image={item.image} model={item.vehicle_model} alt={item.vehicle_label} className="h-10 w-[70px] object-contain rounded-md bg-muted shrink-0" fallbackClassName="h-10 w-[70px] rounded-md bg-muted flex items-center justify-center shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-semibold text-sm truncate">{item.vehicle_label || item.vehicle_model}</span>
                                    {item.is_used ? (
                                      <>
                                        {item.plate && (
                                          <span className="text-[10px] bg-violet-500/20 text-violet-300 px-1 rounded shrink-0 font-mono" title={`Plate: ${item.plate}`}>
                                            {item.plate}
                                          </span>
                                        )}
                                        {item.auction_id && (
                                          <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1 rounded shrink-0 flex items-center gap-0.5" title="Currently at auction">
                                            <Gavel className="h-2.5 w-2.5" /> At Auction
                                          </span>
                                        )}
                                      </>
                                    ) : (
                                      (item.quantity || 1) > 1 && (
                                        <span className="text-[10px] bg-muted px-1 rounded shrink-0">x{item.quantity}</span>
                                      )
                                    )}
                                    {incoming && (
                                      <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1 rounded shrink-0 flex items-center gap-0.5" title={`${incoming.quantity} arriving in ${getTimeRemaining(incoming.delivered_at!)}`}>
                                        <Truck className="h-2.5 w-2.5" /> +{incoming.quantity}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-muted-foreground capitalize">{item.class || 'Vehicle'}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-0.5 shrink-0">
                                {item.is_used && (
                                  <button
                                    className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                                    title="View PickleFAX report"
                                    onClick={() => setPickleFaxId(item.id)}
                                  >
                                    <FileText className="h-3 w-3" />
                                  </button>
                                )}
                                {canManage && item.is_used && !item.auction_id && (
                                  <button
                                    className="h-6 w-6 flex items-center justify-center rounded hover:bg-amber-500/20 text-muted-foreground hover:text-amber-400"
                                    title="List for auction"
                                    onClick={() => setAuctionListingItem(item)}
                                  >
                                    <Gavel className="h-3 w-3" />
                                  </button>
                                )}
                                {canManage && !item.auction_id && (
                                  <button
                                    className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                                    title="Edit retail price"
                                    onClick={() => { setEditingPrice(item); setPriceInput(String(item.retail_price)) }}
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center justify-between mt-auto pt-2 border-t border-border">
                              <div className="flex gap-3">
                                <div>
                                  <p className="text-[10px] text-muted-foreground">Retail</p>
                                  <p className="text-sm font-bold text-accent">{formatCurrency(item.retail_price)}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] text-muted-foreground">Profit</p>
                                  <p className={`text-sm font-medium ${item.retail_price - item.wholesale_cost < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                    {formatCurrency(item.retail_price - item.wholesale_cost)}
                                  </p>
                                </div>
                                {item.is_used && (() => {
                                  const cond = Math.round(Number(item.condition) || 0)
                                  const color = cond >= 80 ? 'text-emerald-400' : cond >= 50 ? 'text-amber-400' : 'text-rose-400'
                                  return (
                                    <div>
                                      <p className="text-[10px] text-muted-foreground">Condition</p>
                                      <p className={`text-sm font-medium ${color}`}>{cond}%</p>
                                    </div>
                                  )
                                })()}
                              </div>
                            </div>
                          </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
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
          onListed={() => loadStock()}
        />
      )}

      {/* Edit retail price dialog */}
      <Dialog open={!!editingPrice} onOpenChange={(open) => { if (!open) setEditingPrice(null) }}>
        <DialogContent onClose={() => setEditingPrice(null)}>
          <DialogHeader>
            <DialogTitle>Edit Retail Price</DialogTitle>
            <DialogDescription>{editingPrice?.vehicle_label || editingPrice?.vehicle_model}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Wholesale Cost</p>
              <p className="text-sm font-medium">{formatCurrency(editingPrice?.wholesale_cost || 0)}</p>
            </div>
            <div>
              <label className="text-sm font-medium">Retail Price</label>
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
                    Profit: {formatCurrency(profit)} ({Math.round((profit / editingPrice.wholesale_cost) * 100)}%)
                  </p>
                )
              })()}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setEditingPrice(null)}>Cancel</Button>
              <Button className="flex-1" onClick={handleSetPrice}>Save Price</Button>
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
