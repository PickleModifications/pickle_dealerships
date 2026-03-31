import { useState, useEffect, useMemo, useRef } from 'react'
import { Package, Loader2, Search } from 'lucide-react'
import { fetchNui, formatCurrency, cn, isEnvBrowser } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import type { StockItem } from '@/types'

type StockFilter = 'all' | 'available' | 'transit' | 'sold'

function getStatus(item: StockItem): 'transit' | 'available' | 'sold' {
  if (item.sold_at) return 'sold'
  if (!item.delivered_at) return 'transit'
  return 'available'
}

const STATUS_CONFIG: Record<string, { label: string; variant: 'warning' | 'success' | 'secondary'; classes: string }> = {
  transit:   { label: 'In Transit', variant: 'warning', classes: '' },
  available: { label: 'Available', variant: 'success', classes: '' },
  sold:      { label: 'Sold', variant: 'secondary', classes: 'opacity-60' },
}

const FILTER_CONFIG: Record<StockFilter, { label: string; activeClass: string }> = {
  all:       { label: 'All', activeClass: 'bg-violet-500/15 text-violet-300 border-violet-500/25' },
  available: { label: 'Available', activeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25' },
  transit:   { label: 'In Transit', activeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/25' },
  sold:      { label: 'Sold', activeClass: 'bg-slate-500/15 text-slate-300 border-slate-500/25' },
}

/* ---------- Editable Price Cell ---------- */
function EditablePrice({
  value,
  stockId,
  dealershipId,
}: {
  value: number
  stockId: number
  dealershipId: number
}) {
  const [editing, setEditing] = useState(false)
  const [price, setPrice] = useState(String(value))
  const [saving, setSaving] = useState(false)
  const [currentValue, setCurrentValue] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const handleSave = async () => {
    const numPrice = parseInt(price, 10)
    if (isNaN(numPrice) || numPrice < 0) {
      setPrice(String(currentValue))
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      await fetchNui('setRetailPrice', { stockId, dealershipId, price: numPrice })
      setCurrentValue(numPrice)
    } catch {
      setPrice(String(currentValue))
    } finally {
      setSaving(false)
      setEditing(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation()
    if (e.key === 'Enter') handleSave()
    if (e.key === 'Escape') {
      setPrice(String(currentValue))
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-slate-500 text-xs">$</span>
        <input
          ref={inputRef}
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          disabled={saving}
          className="w-24 h-7 bg-white/[0.06] border border-violet-500/30 rounded-md px-2 text-sm text-white outline-none focus:ring-1 focus:ring-violet-500/40 transition-all"
        />
        {saving && <Loader2 className="h-3 w-3 animate-spin text-violet-400" />}
      </div>
    )
  }

  return (
    <button
      className="text-sm font-medium text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer group/price"
      onClick={() => setEditing(true)}
      title="Click to edit"
    >
      <span className="border-b border-dashed border-emerald-500/30 group-hover/price:border-emerald-400/50 transition-colors">
        {formatCurrency(currentValue)}
      </span>
    </button>
  )
}

/* ---------- Stock Page ---------- */
export function StockPage({ data }: { data: any }) {
  const dealershipId = data?.dealershipId as number
  const tier = (data?.tier as number) ?? 1

  const [stock, setStock] = useState<StockItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<StockFilter>('all')

  const maxDisplaySpots = tier <= 1 ? 4 : tier === 2 ? 8 : 12

  const displaySpotOptions = [
    { value: '0', label: 'None' },
    ...Array.from({ length: maxDisplaySpots }, (_, i) => ({
      value: String(i + 1),
      label: `Spot ${i + 1}`,
    })),
  ]

  useEffect(() => {
    setLoading(true)
    if (isEnvBrowser()) {
      setTimeout(() => { setStock([]); setLoading(false) }, 400)
      return
    }
    fetchNui<StockItem[]>('getStock', { dealershipId })
      .then((res) => { if (Array.isArray(res)) setStock(res) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [dealershipId])

  const counts = useMemo(() => {
    const c = { all: stock.length, available: 0, transit: 0, sold: 0 }
    stock.forEach((item) => { c[getStatus(item)]++ })
    return c
  }, [stock])

  const filtered = useMemo(() => {
    return stock.filter((item) => {
      const status = getStatus(item)
      if (filter !== 'all' && status !== filter) return false
      if (search) {
        const q = search.toLowerCase()
        if (!item.vehicle_label.toLowerCase().includes(q) && !item.vehicle_model.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [stock, search, filter])

  const handleDisplaySpotChange = async (stockId: number, value: string) => {
    const spot = parseInt(value, 10)
    try {
      await fetchNui('setDisplaySpot', { stockId, dealershipId, displaySpot: spot === 0 ? null : spot })
      setStock((prev) =>
        prev.map((item) => (item.id === stockId ? { ...item, display_spot: spot === 0 ? null : spot } : item))
      )
    } catch {
      // handled by game
    }
  }

  return (
    <div className="flex flex-col h-full p-5 gap-4">
      {/* Filter Bar */}
      <div className="flex items-center gap-3 animate-slideUp shrink-0">
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <Input
            placeholder="Search stock..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-white/[0.03] border-white/[0.06] text-white placeholder:text-slate-600 h-9"
          />
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1.5 ml-auto">
          {(Object.entries(FILTER_CONFIG) as [StockFilter, typeof FILTER_CONFIG['all']][]).map(([key, cfg]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
                filter === key
                  ? cfg.activeClass
                  : 'bg-white/[0.02] text-slate-500 border-white/[0.06] hover:bg-white/[0.04] hover:text-slate-400'
              )}
            >
              {cfg.label}
              <span className="ml-1.5 opacity-60">({counts[key]})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Stock Table */}
      <div className="flex-1 overflow-y-auto pr-1">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
              <p className="text-xs text-slate-500">Loading inventory...</p>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48">
            <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-3">
              <Package className="h-8 w-8 text-slate-600" />
            </div>
            <p className="text-sm font-medium text-slate-400">
              {stock.length === 0 ? 'No vehicles in stock' : 'No vehicles match your filters'}
            </p>
            <p className="text-xs text-slate-600 mt-1">
              {stock.length === 0 ? 'Order from the catalog to get started.' : 'Try adjusting your search or filter.'}
            </p>
          </div>
        ) : (
          <div className="glass-subtle rounded-xl overflow-hidden animate-slideUp">
            {/* Table Header */}
            <div className="grid grid-cols-[1.5fr_100px_110px_110px_90px_90px] gap-3 px-4 py-2.5 border-b border-white/[0.06]">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Vehicle</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Wholesale</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Retail Price</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Display</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Condition</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Status</span>
            </div>

            {/* Table Rows */}
            {filtered.map((item, index) => {
              const status = getStatus(item)
              const statusCfg = STATUS_CONFIG[status]
              return (
                <div
                  key={item.id}
                  className={cn(
                    'grid grid-cols-[1.5fr_100px_110px_110px_90px_90px] gap-3 px-4 py-3 items-center border-b border-white/[0.04] transition-all duration-200',
                    'hover:bg-white/[0.03]',
                    status === 'sold' && 'opacity-50'
                  )}
                  style={{ animationDelay: `${Math.min(index * 20, 200)}ms` }}
                >
                  {/* Vehicle */}
                  <div>
                    <p className="text-sm font-medium text-white leading-tight">{item.vehicle_label}</p>
                    <p className="text-[11px] text-slate-500 font-mono">{item.vehicle_model}</p>
                  </div>

                  {/* Wholesale */}
                  <span className="text-sm text-slate-400">{formatCurrency(item.wholesale_cost)}</span>

                  {/* Retail Price - Editable */}
                  <div>
                    {status === 'sold' ? (
                      <span className="text-sm text-slate-500 line-through">{formatCurrency(item.retail_price)}</span>
                    ) : (
                      <EditablePrice
                        value={item.retail_price}
                        stockId={item.id}
                        dealershipId={dealershipId}
                      />
                    )}
                  </div>

                  {/* Display Spot */}
                  <div>
                    {status === 'available' ? (
                      <Select
                        options={displaySpotOptions}
                        value={String(item.display_spot ?? 0)}
                        onChange={(val) => handleDisplaySpotChange(item.id, val)}
                        className="w-24"
                      />
                    ) : (
                      <span className="text-xs text-slate-500">
                        {item.display_spot ? `Spot ${item.display_spot}` : '--'}
                      </span>
                    )}
                  </div>

                  {/* Condition */}
                  <div>
                    <Badge
                      variant={item.condition === 'new' ? 'default' : 'secondary'}
                      className={cn(
                        'text-[10px] capitalize',
                        item.condition === 'new'
                          ? 'bg-blue-500/15 text-blue-300 border border-blue-500/20 shadow-none'
                          : 'bg-white/[0.04] text-slate-400 border border-white/[0.06]'
                      )}
                    >
                      {item.condition}
                    </Badge>
                  </div>

                  {/* Status */}
                  <div>
                    <Badge
                      variant={statusCfg.variant}
                      className="text-[10px]"
                    >
                      {statusCfg.label}
                    </Badge>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
