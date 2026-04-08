import { useEffect, useState, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Separator } from '../components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog'
import { fetchNui, formatCurrency, getVehicleImage } from '../lib/utils'
import { getCached, setCache, buildKey } from '../lib/cache'
import { SkeletonCardGrid } from '../components/ui/skeleton'
import { X, Search, Package, Truck, Clock, ParkingSquare, Car, Pencil, SlidersHorizontal } from 'lucide-react'
import VehicleImg from '../components/VehicleImg'
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
  if (diff <= 0) return 'Arriving...'
  const mins = Math.ceil(diff / 60000)
  if (mins >= 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`
  return `${mins}m`
}

export default function StockPage({ data, onClose }: Props) {
  const cacheKey = buildKey(data.dealershipId, 'stock')
  const cached = getCached<StockItem[]>(cacheKey)
  const [stock, setStock] = useState<StockItem[]>(cached ?? [])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(!cached)
  const [, setTick] = useState(0)
  const [spotList, setSpotList] = useState<{ id: number; index: number }[]>([])
  const [editingPrice, setEditingPrice] = useState<StockItem | null>(null)
  const [priceInput, setPriceInput] = useState('')
  const [assigningSpot, setAssigningSpot] = useState<StockItem | null>(null)
  const [classFilter, setClassFilter] = useState('all')
  const [sortBy, setSortBy] = useState<'name_asc' | 'name_desc' | 'price_asc' | 'price_desc'>('name_asc')
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 0])
  const [maxRetailPrice, setMaxRetailPrice] = useState(0)
  const [showFilters, setShowFilters] = useState(false)
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
    fetchNui<{ spots: { id: number; index: number }[] }>('getDisplaySpots', {
      location: data.location,
    }).then((res) => {
      if (res && res.spots) setSpotList(res.spots)
    }).catch(() => {})
  }, [data.dealershipId])

  useEffect(() => {
    const hasInTransit = stock.some((s) => getDeliveryStatus(s) !== 'available')
    if (!hasInTransit) return
    const interval = setInterval(() => setTick((t) => t + 1), 30000)
    return () => clearInterval(interval)
  }, [stock])

  const handleSetSpot = (stockId: number, spot: number | null) => {
    fetchNui('setDisplaySpot', {
      dealershipId: data.dealershipId,
      location: data.location,
      stockId,
      spot,
    }).then(() => loadStock())
  }

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

  const available = filtered.filter((s) => getDeliveryStatus(s) === 'available')
  const inTransit = filtered.filter((s) => getDeliveryStatus(s) !== 'available')

  const takenSpots = new Set(stock.filter((s) => s.display_spot).map((s) => Number(s.display_spot)))
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

      {/* In-transit — not virtualized (usually small count) */}
      {!loading && inTransit.length > 0 && (
        <div className="px-5 pt-3">
          <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
            <Truck className="h-3.5 w-3.5" /> In Transit ({inTransit.length})
          </p>
          <div className="space-y-1.5">
            {inTransit.map((item) => (
              <Card key={item.id} className="overflow-hidden border-dashed opacity-80">
                <CardContent className="p-3 flex items-center justify-between">
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
                      <Badge variant="outline" className="gap-1 text-amber-400 border-amber-400/30">
                        <Clock className="h-3 w-3" /> {getTimeRemaining(item.delivered_at)}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">Awaiting Pickup</Badge>
                    )}
                  </div>
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
          ) : available.length > 0 ? (
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
                        {rowItems.map((item) => (
                          <div key={item.id} className="rounded-lg border border-border hover:border-accent/50 transition-colors h-full p-3 flex flex-col overflow-hidden">
                            <div className="flex items-start justify-between">
                              <div className="flex items-start gap-2 flex-1 min-w-0">
                                <VehicleImg image={item.image} model={item.vehicle_model} alt={item.vehicle_label} className="h-10 w-[70px] object-contain rounded-md bg-muted shrink-0" fallbackClassName="h-10 w-[70px] rounded-md bg-muted flex items-center justify-center shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-semibold text-sm truncate">{item.vehicle_label || item.vehicle_model}</span>
                                    {(item.quantity || 1) > 1 && (
                                      <span className="text-[10px] bg-muted px-1 rounded shrink-0">x{item.quantity}</span>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-muted-foreground capitalize">{item.class || 'Vehicle'}</p>
                                </div>
                              </div>
                              {canManage && (
                                <button
                                  className="h-6 w-6 shrink-0 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                                  title="Edit retail price"
                                  onClick={() => { setEditingPrice(item); setPriceInput(String(item.retail_price)) }}
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                            <div className="flex items-center justify-between mt-auto pt-2 border-t border-border">
                              <div className="flex gap-3">
                                <div>
                                  <p className="text-[10px] text-muted-foreground">Retail</p>
                                  <p className="text-sm font-bold text-accent">{formatCurrency(item.retail_price)}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] text-muted-foreground">Profit</p>
                                  <p className="text-sm font-medium text-emerald-400">
                                    {formatCurrency(item.retail_price - item.wholesale_cost)}
                                  </p>
                                </div>
                              </div>
                              {canManage && (
                                item.display_spot ? (
                                  <button
                                    className="text-[11px] h-7 px-2 rounded border border-border hover:bg-muted flex items-center gap-1"
                                    onClick={() => handleSetSpot(item.id, null)}
                                  >
                                    Spot #{item.display_spot} &times;
                                  </button>
                                ) : (
                                  <button
                                    className="text-[11px] h-7 px-2 rounded border border-border hover:bg-muted flex items-center gap-1 text-muted-foreground"
                                    onClick={() => setAssigningSpot(item)}
                                  >
                                    <ParkingSquare className="h-3 w-3" /> Display...
                                  </button>
                                )
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
            </div>
          ) : null}
        </div>
      </div>

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
              {priceInput && editingPrice && (
                <p className="text-xs text-muted-foreground mt-1">
                  Profit: {formatCurrency(parseInt(priceInput) - editingPrice.wholesale_cost)} ({Math.round(((parseInt(priceInput) - editingPrice.wholesale_cost) / editingPrice.wholesale_cost) * 100)}%)
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setEditingPrice(null)}>Cancel</Button>
              <Button className="flex-1" onClick={handleSetPrice}>Save Price</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign display spot dialog */}
      <Dialog open={!!assigningSpot} onOpenChange={(open) => { if (!open) setAssigningSpot(null) }}>
        <DialogContent onClose={() => setAssigningSpot(null)}>
          <DialogHeader>
            <DialogTitle>Assign Display Spot</DialogTitle>
            <DialogDescription>{assigningSpot?.vehicle_label || assigningSpot?.vehicle_model}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 pt-2">
            {spotList.map((spot) => (
              <button
                key={spot.id}
                disabled={takenSpots.has(spot.id)}
                onClick={() => {
                  if (assigningSpot) {
                    handleSetSpot(assigningSpot.id, spot.id)
                    setAssigningSpot(null)
                  }
                }}
                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                  takenSpots.has(spot.id)
                    ? 'opacity-40 cursor-not-allowed bg-muted'
                    : 'hover:bg-accent hover:text-accent-foreground bg-muted'
                }`}
              >
                Spot #{spot.index} {takenSpots.has(spot.id) ? '(taken)' : ''}
              </button>
            ))}
            <Button variant="outline" className="w-full mt-2" onClick={() => setAssigningSpot(null)}>Cancel</Button>
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
