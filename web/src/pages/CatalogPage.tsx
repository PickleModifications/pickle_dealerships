import { useEffect, useState, useRef, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Separator } from '../components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog'
import { fetchNui, formatClass, formatCurrency, getVehicleImage } from '../lib/utils'
import { SkeletonCardGrid } from '../components/ui/skeleton'
import { t } from '../lib/locale'
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

// Tier badges + tier-based locking removed when catalog access switched to
// many-to-many groups. The server now only returns vehicles a dealership
// actually has access to, so every row in the customer catalog is orderable.

export default function CatalogPage({ data, onClose }: Props) {
  const [items, setItems] = useState<CatalogItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('all')
  // tierFilter retired with the tier system; group filtering lives admin-side.
  // Keeping the plumbing as a no-op constant means the existing fetchPage
  // signature and cache-key rules don't need to change.
  const tierFilter = 'all'
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [ordering, setOrdering] = useState<CatalogItem | null>(null)
  const [quantity, setQuantity] = useState('1')
  const [classes, setClasses] = useState<string[]>([])
  const [showFilters, setShowFilters] = useState(false)
  const [deliveryMode, setDeliveryMode] = useState<'expedited' | 'local'>('expedited')
  const [costPreview, setCostPreview] = useState<{
    expedited?: { totalCost: number; deliveryFee: number }
    local?: { totalCost: number; deliveryFee: number }
  }>({})
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

  const activeFilterCount = classFilter !== 'all' ? 1 : 0

  const handleClassChange = (value: string) => {
    setClassFilter(value)
    fetchPage(1, search, value, tierFilter, false)
  }

  // handleTierChange removed with the tier selector in the filter bar.

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
    const qty = parseInt(quantity) || 1
    fetchNui('orderVehicle', {
      dealershipId: data.dealershipId,
      location: data.location,
      model: ordering.model,
      wholesale: ordering.wholesale,
      quantity: qty,
      deliveryMode,
    }).then(() => {
      setOrdering(null)
      setQuantity('1')
      setDeliveryMode('expedited')
    })
  }

  useEffect(() => {
    if (!ordering) return
    const qty = parseInt(quantity) || 1
    fetchNui<typeof costPreview>('previewOrderCost', {
      model: ordering.model,
      quantity: qty,
    }).then((r) => setCostPreview(r || {})).catch(() => {})
  }, [ordering, quantity])

  return (
    <>
      {!data.embedded && (
        <div className="flex items-center justify-between p-5 pb-0">
          <div>
            <h1 className="text-xl font-bold">{t('title_wholesale_catalog')}</h1>
            <p className="text-sm text-muted-foreground">{t('title_catalog_desc')}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
      )}

      <div className="px-5 pt-3 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t('label_search_vehicles')} value={search} onChange={(e) => handleSearchChange(e.target.value)} className="pl-9" />
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
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">{t('label_class')}</p>
              <div className="flex flex-wrap gap-1">
                <button onClick={() => handleClassChange('all')} className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${classFilter === 'all' ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>{t('label_all')}</button>
                {classes.map((c) => (
                  <button key={c} onClick={() => handleClassChange(c)} className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${classFilter === c ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>{formatClass(c)}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <Separator className="mt-3" />

      <div className="relative flex-1 flex flex-col overflow-hidden">
        <div ref={parentRef} className="flex-1 overflow-auto p-5">
          {loading ? (
            <SkeletonCardGrid count={6} columns={3} />
          ) : items.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground">{t('empty_no_matching')}</div>
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
                    {rowItems.map((item) => (
                      <Card key={item.model} className="relative overflow-hidden transition-colors hover:border-accent/50">
                        <VehicleImg image={item.image} model={item.model} alt={item.label} className="w-full aspect-video object-contain bg-muted" fallbackClassName="w-full aspect-video bg-muted flex items-center justify-center" iconClassName="h-8 w-8 text-muted-foreground/30" />
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between mb-1">
                            <div>
                              <h3 className="font-semibold text-sm">{item.label}</h3>
                              <p className="text-xs text-muted-foreground">{formatClass(item.class)}</p>
                            </div>
                          </div>
                          <div className="flex items-center justify-between mt-2">
                            <p className="font-bold text-sm">{formatCurrency(item.wholesale)}</p>
                            <Button size="sm" onClick={() => setOrdering(item)}>
                              <ShoppingCart className="h-3 w-3" /> {t('btn_order')}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
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
          <DialogContent onClose={() => setOrdering(null)} className="max-h-full !grid-rows-[auto_1fr_auto] !gap-0 p-0 overflow-hidden">
            <DialogHeader className="p-6 pb-4 border-b border-border">
              <DialogTitle>{t('title_order_vehicle', ordering?.label || '')}</DialogTitle>
              <DialogDescription>{t('title_order_desc')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 px-6 py-4 overflow-y-auto min-h-0">
              <div>
                <label className="text-sm font-medium">{t('label_quantity')}</label>
                <Input
                  type="number"
                  min="1"
                  max="10"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">{t('delivery_mode_expedited').replace(' Delivery', '')} / {t('delivery_mode_local').replace(' Delivery', '')}</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDeliveryMode('expedited')}
                    className={`text-left rounded-md border p-3 transition ${deliveryMode === 'expedited' ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/50'}`}
                  >
                    <div className="font-semibold text-sm">{t('delivery_mode_expedited')}</div>
                    <div className="text-xs text-muted-foreground">{t('delivery_mode_expedited_desc')}</div>
                    {costPreview.expedited && (
                      <div className="text-xs font-mono mt-1">{formatCurrency(costPreview.expedited.totalCost)}</div>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeliveryMode('local')}
                    className={`text-left rounded-md border p-3 transition ${deliveryMode === 'local' ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/50'}`}
                  >
                    <div className="font-semibold text-sm">{t('delivery_mode_local')}</div>
                    <div className="text-xs text-muted-foreground">{t('delivery_mode_local_desc')}</div>
                    {costPreview.local && (
                      <div className="text-xs font-mono mt-1">{formatCurrency(costPreview.local.totalCost)}</div>
                    )}
                  </button>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between p-6 pt-4 border-t border-border bg-card">
              <div>
                <p className="text-xs text-muted-foreground">{t('catalog_total_cost_tax')}</p>
                <p className="font-bold">
                  {formatCurrency(
                    deliveryMode === 'local'
                      ? costPreview.local?.totalCost || 0
                      : costPreview.expedited?.totalCost || Math.round((ordering?.wholesale || 0) * 1.1 * (parseInt(quantity) || 1))
                  )}
                </p>
              </div>
              <Button onClick={handleOrder} className="gap-2">
                <Truck className="h-4 w-4" /> {t('catalog_place_order')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </>
  )
}

// canAccessTier / tierUnlockLevel removed — server-side group filtering means
// every row returned to the client is already orderable.
