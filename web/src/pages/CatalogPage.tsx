import { useState, useEffect, useMemo } from 'react'
import { Search, ShoppingCart, Package, Loader2, Sparkles } from 'lucide-react'
import { fetchNui, formatCurrency, cn, isEnvBrowser } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import type { CatalogItem } from '@/types'

const TIER_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  basic:     { bg: 'bg-slate-500/10', text: 'text-slate-300', border: 'border-slate-500/20', label: 'Basic' },
  expanded:  { bg: 'bg-blue-500/10', text: 'text-blue-300', border: 'border-blue-500/20', label: 'Expanded' },
  full:      { bg: 'bg-violet-500/10', text: 'text-violet-300', border: 'border-violet-500/20', label: 'Full' },
  exclusive: { bg: 'bg-gradient-to-r from-amber-500/15 to-orange-500/15', text: 'text-amber-300', border: 'border-amber-500/20', label: 'Exclusive' },
}

const CLASS_COLORS: Record<string, string> = {
  sports: 'bg-violet-500',
  sedan: 'bg-blue-500',
  suv: 'bg-emerald-500',
  muscle: 'bg-red-500',
  super: 'bg-amber-500',
  coupe: 'bg-cyan-500',
  compact: 'bg-teal-500',
  offroad: 'bg-orange-500',
  motorcycle: 'bg-pink-500',
  van: 'bg-slate-400',
  truck: 'bg-stone-400',
  boat: 'bg-blue-400',
  helicopter: 'bg-sky-400',
  plane: 'bg-indigo-400',
}

const TIER_CAPACITY: Record<number, number> = { 1: 10, 2: 25, 3: 50, 4: 100 }
const IMPORT_TAX_RATE = 0.10

export function CatalogPage({ data }: { data: any }) {
  const dealershipId = data?.dealershipId as number
  const tier = (data?.tier as number) ?? 1
  const dealershipName = (data?.dealershipName as string) ?? ''
  const stockCount = (data?.stockCount as number) ?? 0

  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [classFilter, setClassFilter] = useState('all')
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null)
  const [ordering, setOrdering] = useState(false)
  const [currentStock, setCurrentStock] = useState(stockCount)

  const maxCapacity = TIER_CAPACITY[tier] ?? 10
  const capacityPercent = Math.min((currentStock / maxCapacity) * 100, 100)

  useEffect(() => {
    setLoading(true)
    if (isEnvBrowser()) {
      setTimeout(() => { setCatalog([]); setLoading(false) }, 400)
      return
    }
    fetchNui<CatalogItem[]>('getCatalog', { dealershipId })
      .then((res) => { if (Array.isArray(res)) setCatalog(res) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [dealershipId])

  const vehicleTypes = useMemo(() => {
    const types = new Set(catalog.map((c) => c.vehicleType))
    return [{ value: 'all', label: 'All Types' }, ...Array.from(types).sort().map((t) => ({ value: t, label: t }))]
  }, [catalog])

  const vehicleClasses = useMemo(() => {
    const classes = new Set(catalog.map((c) => c.class))
    return [{ value: 'all', label: 'All Classes' }, ...Array.from(classes).sort().map((c) => ({ value: c, label: c }))]
  }, [catalog])

  const filtered = useMemo(() => {
    return catalog.filter((item) => {
      if (search && !item.label.toLowerCase().includes(search.toLowerCase()) && !item.model.toLowerCase().includes(search.toLowerCase())) return false
      if (typeFilter !== 'all' && item.vehicleType !== typeFilter) return false
      if (classFilter !== 'all' && item.class !== classFilter) return false
      return true
    })
  }, [catalog, search, typeFilter, classFilter])

  const handleOrder = async () => {
    if (!selectedItem) return
    setOrdering(true)
    try {
      await fetchNui('orderVehicle', { model: selectedItem.model, dealershipId })
      setCurrentStock((prev) => prev + 1)
      setSelectedItem(null)
    } catch {
      // handled by game
    } finally {
      setOrdering(false)
    }
  }

  return (
    <div className="flex flex-col h-full p-5 gap-4">
      {/* Top Bar */}
      <div className="flex items-center gap-3 animate-slideUp shrink-0">
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <Input
            placeholder="Search vehicles..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-white/[0.03] border-white/[0.06] text-white placeholder:text-slate-600 h-9"
          />
        </div>

        {/* Filters */}
        <Select
          options={vehicleTypes}
          value={typeFilter}
          onChange={setTypeFilter}
          placeholder="Vehicle Type"
          className="w-36"
        />
        <Select
          options={vehicleClasses}
          value={classFilter}
          onChange={setClassFilter}
          placeholder="Class"
          className="w-36"
        />

        {/* Stock Capacity */}
        <div className="ml-auto flex items-center gap-3 glass-subtle rounded-lg px-3 py-2">
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Stock</p>
            <p className="text-sm font-semibold text-white">
              {currentStock}
              <span className="text-slate-500 font-normal">/{maxCapacity}</span>
            </p>
          </div>
          <div className="w-20">
            <Progress
              value={capacityPercent}
              className={cn(
                'h-1.5',
                capacityPercent >= 90 ? '[&>div]:bg-gradient-to-r [&>div]:from-red-500 [&>div]:to-red-400' :
                capacityPercent >= 70 ? '[&>div]:bg-gradient-to-r [&>div]:from-amber-500 [&>div]:to-amber-400' :
                ''
              )}
            />
          </div>
        </div>
      </div>

      {/* Results count */}
      {!loading && (
        <div className="text-xs text-slate-500 shrink-0">
          {filtered.length} vehicle{filtered.length !== 1 ? 's' : ''} available
        </div>
      )}

      {/* Vehicle Grid */}
      <div className="flex-1 overflow-y-auto pr-1">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
              <p className="text-xs text-slate-500">Loading catalog...</p>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48">
            <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-3">
              <Package className="h-8 w-8 text-slate-600" />
            </div>
            <p className="text-sm font-medium text-slate-400">No vehicles found</p>
            <p className="text-xs text-slate-600 mt-1">
              {catalog.length === 0 ? 'The catalog is empty' : 'Try adjusting your search or filters'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {filtered.map((item, index) => {
              const tierStyle = TIER_STYLES[item.tier] ?? TIER_STYLES.basic
              const classColor = CLASS_COLORS[item.class?.toLowerCase()] ?? 'bg-slate-500'
              return (
                <div
                  key={item.model}
                  className="glass-subtle glass-hover rounded-xl p-4 flex flex-col gap-3 cursor-pointer transition-all duration-300 animate-slideUp group"
                  style={{ animationDelay: `${Math.min(index * 30, 300)}ms` }}
                  onClick={() => setSelectedItem(item)}
                >
                  {/* Icon + Class indicator */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className={cn('w-3 h-3 rounded-full shadow-lg', classColor)} />
                      <div>
                        <h4 className="text-sm font-medium text-white leading-tight line-clamp-1 group-hover:text-violet-200 transition-colors">
                          {item.label}
                        </h4>
                        <p className="text-[10px] text-slate-500 capitalize mt-0.5">{item.class}</p>
                      </div>
                    </div>
                    <Badge className={cn('text-[10px] px-1.5 py-0 border', tierStyle.bg, tierStyle.text, tierStyle.border)}>
                      {tierStyle.label}
                    </Badge>
                  </div>

                  {/* Price */}
                  <div className="mt-auto">
                    <p className="text-lg font-bold gradient-text">{formatCurrency(item.wholesale)}</p>
                    <p className="text-[10px] text-slate-500">wholesale price</p>
                  </div>

                  {/* Order button */}
                  <Button
                    size="sm"
                    className="w-full h-8 text-xs"
                    disabled={currentStock >= maxCapacity}
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedItem(item)
                    }}
                  >
                    <ShoppingCart className="h-3 w-3 mr-1.5" />
                    Order
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Order Confirmation Dialog */}
      <Dialog open={!!selectedItem} onOpenChange={(open) => { if (!open) setSelectedItem(null) }}>
        <DialogContent className="bg-[rgba(12,12,24,0.95)] border-white/[0.06] backdrop-blur-2xl">
          {selectedItem && (
            <>
              <DialogHeader>
                <DialogTitle className="gradient-text">Confirm Order</DialogTitle>
                <DialogDescription className="text-slate-500">
                  Review the order details before confirming
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-0 my-2">
                {/* Vehicle name */}
                <div className="flex items-center justify-between py-3 border-b border-white/[0.04]">
                  <span className="text-sm text-slate-500">Vehicle</span>
                  <span className="text-sm font-medium text-white">{selectedItem.label}</span>
                </div>

                {/* Wholesale */}
                <div className="flex items-center justify-between py-3 border-b border-white/[0.04]">
                  <span className="text-sm text-slate-500">Wholesale Price</span>
                  <span className="text-sm text-white">{formatCurrency(selectedItem.wholesale)}</span>
                </div>

                {/* Tax */}
                <div className="flex items-center justify-between py-3 border-b border-white/[0.04]">
                  <span className="text-sm text-slate-500">Import Tax (10%)</span>
                  <span className="text-sm text-amber-400">+{formatCurrency(selectedItem.wholesale * IMPORT_TAX_RATE)}</span>
                </div>

                {/* Total */}
                <div className="flex items-center justify-between py-3">
                  <span className="text-sm font-semibold text-white">Total Cost</span>
                  <span className="text-lg font-bold gradient-text">
                    {formatCurrency(selectedItem.wholesale * (1 + IMPORT_TAX_RATE))}
                  </span>
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  className="bg-white/[0.03] border-white/[0.06] text-slate-400 hover:text-white"
                  onClick={() => setSelectedItem(null)}
                  disabled={ordering}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleOrder}
                  disabled={ordering || currentStock >= maxCapacity}
                >
                  {ordering ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <ShoppingCart className="h-4 w-4 mr-2" />
                      Confirm Order
                    </>
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
