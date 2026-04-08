import { useEffect, useState, useRef, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Separator } from '../components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog'
import { fetchNui, formatCurrency, getVehicleImage } from '../lib/utils'
import { SkeletonCardGrid } from '../components/ui/skeleton'
import { X, Search, ShoppingCart, Truck, Lock, Loader2, Car, SlidersHorizontal } from 'lucide-react'
import VehicleImg from '../components/VehicleImg'
import type { DealershipData, CatalogItem } from '../types'

interface Props {
  data: DealershipData
  onClose: () => void
}

interface CatalogResponse {
  items: CatalogItem[]
  total: number
  page: number
  pageSize: number
}

const PAGE_SIZE = 50
const COLUMNS = 3
const GAP = 12

const tierOrder = ['basic', 'expanded', 'full', 'exclusive']
const tierColors: Record<string, string> = {
  basic: 'bg-zinc-500/20 text-zinc-300',
  expanded: 'bg-blue-500/20 text-blue-300',
  full: 'bg-purple-500/20 text-purple-300',
  exclusive: 'bg-amber-500/20 text-amber-300',
}

export default function CatalogPage({ data, onClose }: Props) {
  const [items, setItems] = useState<CatalogItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('all')
  const [tierFilter, setTierFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [ordering, setOrdering] = useState<CatalogItem | null>(null)
  const [retailPrice, setRetailPrice] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [classes, setClasses] = useState<string[]>([])
  const [showFilters, setShowFilters] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const parentRef = useRef<HTMLDivElement>(null)

  const hasMore = items.length < total

  const fetchPage = useCallback((p: number, s: string, cf: string, tf: string, append: boolean) => {
    if (append) {
      setLoadingMore(true)
    } else {
      setLoading(true)
    }
    fetchNui<CatalogResponse>('getCatalog', {
      dealershipId: data.dealershipId,
      location: data.location,
      type: data.type,
      page: p,
      pageSize: PAGE_SIZE,
      search: s,
      classFilter: cf,
      tierFilter: tf,
    }).then((res) => {
      const loadedItems = res && Array.isArray(res.items) ? res.items : []
      setItems(prev => append ? [...prev, ...loadedItems] : loadedItems)
      setTotal(res?.total ?? 0)
      setPage(res?.page ?? 1)
      if (p === 1 && s === '' && cf === 'all' && tf === 'all') {
        setClasses([...new Set(loadedItems.map((v) => v.class))].sort())
      }
      setLoading(false)
      setLoadingMore(false)
    }).catch(() => { setLoading(false); setLoadingMore(false) })
  }, [data.dealershipId, data.location, data.type])

  useEffect(() => { fetchPage(1, '', 'all', 'all', false) }, [data.dealershipId])

  const handleSearchChange = (value: string) => {
    setSearch(value)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      fetchPage(1, value, classFilter, tierFilter, false)
    }, 300)
  }

  const activeFilterCount = (classFilter !== 'all' ? 1 : 0) + (tierFilter !== 'all' ? 1 : 0)

  const handleClassChange = (value: string) => {
    setClassFilter(value)
    fetchPage(1, search, value, tierFilter, false)
  }

  const handleTierChange = (value: string) => {
    setTierFilter(value)
    fetchPage(1, search, classFilter, value, false)
  }

  const rowCount = Math.ceil(items.length / COLUMNS)

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 250,
    measureElement: (el) => el.getBoundingClientRect().height,
    overscan: 5,
    onChange: (instance) => {
      const vItems = instance.getVirtualItems()
      const lastRow = vItems[vItems.length - 1]
      if (!lastRow) return
      const lastItemIndex = (lastRow.index + 1) * COLUMNS
      if (lastItemIndex >= items.length - 10 && hasMore && !loadingMore) {
        fetchPage(page + 1, search, classFilter, tierFilter, true)
      }
    },
  })

  const handleOrder = () => {
    if (!ordering) return
    const price = parseInt(retailPrice) || Math.round(ordering.wholesale * 1.3)
    const qty = parseInt(quantity) || 1
    fetchNui('orderVehicle', {
      dealershipId: data.dealershipId,
      location: data.location,
      model: ordering.model,
      wholesale: ordering.wholesale,
      retailPrice: price,
      quantity: qty,
    }).then(() => {
      setOrdering(null)
      setRetailPrice('')
      setQuantity('1')
    })
  }

  return (
    <>
      {!data.embedded && (
        <div className="flex items-center justify-between p-5 pb-0">
          <div>
            <h1 className="text-xl font-bold">Wholesale Catalog</h1>
            <p className="text-sm text-muted-foreground">Order vehicles for your dealership</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
      )}

      <div className="px-5 pt-3 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search vehicles..." value={search} onChange={(e) => handleSearchChange(e.target.value)} className="pl-9" />
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
        <div className="px-5 pt-3 flex flex-wrap gap-3">
          {classes.length > 0 && (
            <div className="flex-1 min-w-[140px]">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Class</p>
              <div className="flex flex-wrap gap-1">
                <button onClick={() => handleClassChange('all')} className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${classFilter === 'all' ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>All</button>
                {classes.map((c) => (
                  <button key={c} onClick={() => handleClassChange(c)} className={`px-2 py-0.5 rounded text-[10px] font-medium capitalize transition-colors ${classFilter === c ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>{c}</button>
                ))}
              </div>
            </div>
          )}
          <div className="flex-1 min-w-[140px]">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Tier</p>
            <div className="flex flex-wrap gap-1">
              <button onClick={() => handleTierChange('all')} className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${tierFilter === 'all' ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>All</button>
              {tierOrder.map((t) => (
                <button key={t} onClick={() => handleTierChange(t)} className={`px-2 py-0.5 rounded text-[10px] font-medium capitalize transition-colors ${tierFilter === t ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>{t}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      <Separator className="mt-3" />

      <div className="relative flex-1 flex flex-col overflow-hidden">
        <div ref={parentRef} className="flex-1 overflow-auto p-5">
          {loading ? (
            <SkeletonCardGrid count={6} columns={3} />
          ) : items.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground">No vehicles found</div>
          ) : (
            <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const startIdx = virtualRow.index * COLUMNS
                const rowItems = items.slice(startIdx, startIdx + COLUMNS)

                return (
                  <div
                    key={virtualRow.index}
                    data-index={virtualRow.index}
                    ref={virtualizer.measureElement}
                    className="absolute top-0 left-0 w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                    style={{
                      gap: `${GAP}px`,
                      paddingBottom: `${GAP}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    {rowItems.map((item) => {
                      const locked = !canAccessTier(item.tier, data.tier)
                      return (
                        <Card key={item.model} className={`overflow-hidden transition-colors ${locked ? 'opacity-50' : 'hover:border-accent/50'}`}>
                          <VehicleImg image={item.image} model={item.model} alt={item.label} className="w-full aspect-video object-contain bg-muted" fallbackClassName="w-full aspect-video bg-muted flex items-center justify-center" iconClassName="h-8 w-8 text-muted-foreground/30" />
                          <CardContent className="p-3">
                            <div className="flex items-start justify-between mb-1">
                              <div>
                                <h3 className="font-semibold text-sm">{item.label}</h3>
                                <p className="text-xs text-muted-foreground capitalize">{item.class}</p>
                              </div>
                              <Badge className={`${tierColors[item.tier] || ''} border-0 text-xs capitalize`}>
                                {item.tier}
                              </Badge>
                            </div>
                            <div className="flex items-center justify-between mt-2">
                              <p className="font-bold text-sm">{formatCurrency(item.wholesale)}</p>
                              {locked ? (
                                <Badge variant="outline" className="gap-1 text-muted-foreground">
                                  <Lock className="h-3 w-3" /> Locked
                                </Badge>
                              ) : (
                                <Button size="sm" onClick={() => { setOrdering(item); setRetailPrice(String(Math.round(item.wholesale * 1.3))) }}>
                                  <ShoppingCart className="h-3 w-3" /> Order
                                </Button>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}
          {loadingMore && (
            <div className="flex justify-center py-3">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>

        <Dialog open={!!ordering} onOpenChange={(open) => !open && setOrdering(null)}>
          <DialogContent onClose={() => setOrdering(null)}>
            <DialogHeader>
              <DialogTitle>Order {ordering?.label}</DialogTitle>
              <DialogDescription>Set the retail price and quantity for this order.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Wholesale Cost</p>
                <p className="text-lg font-bold">{formatCurrency(ordering?.wholesale || 0)}</p>
              </div>
              <div>
                <label className="text-sm font-medium">Retail Price</label>
                <Input
                  type="number"
                  value={retailPrice}
                  onChange={(e) => setRetailPrice(e.target.value)}
                  placeholder="Set retail price..."
                  className="mt-1"
                />
                {retailPrice && ordering && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Markup: {formatCurrency(parseInt(retailPrice) - ordering.wholesale)} ({Math.round(((parseInt(retailPrice) - ordering.wholesale) / ordering.wholesale) * 100)}%)
                  </p>
                )}
              </div>
              <div>
                <label className="text-sm font-medium">Quantity</label>
                <Input
                  type="number"
                  min="1"
                  max="10"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <div>
                  <p className="text-xs text-muted-foreground">Total Cost (with tax)</p>
                  <p className="font-bold">{formatCurrency(Math.round((ordering?.wholesale || 0) * 1.1 * (parseInt(quantity) || 1)))}</p>
                </div>
                <Button onClick={handleOrder} className="gap-2">
                  <Truck className="h-4 w-4" /> Place Order
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </>
  )
}

function canAccessTier(vehicleTier: string, dealershipTier: number): boolean {
  const tierMap: Record<string, number> = { basic: 1, expanded: 2, full: 3, exclusive: 4 }
  return dealershipTier >= (tierMap[vehicleTier] || 1)
}
