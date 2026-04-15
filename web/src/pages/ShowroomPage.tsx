import { useState, useEffect, useRef, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs'
import { fetchNui, formatCurrency, getVehicleImage } from '../lib/utils'
import { Search, X, CreditCard, Banknote, Car, Loader2, Palette, SlidersHorizontal, ChevronRight, FileText, Gavel } from 'lucide-react'
import VehicleImg from '../components/VehicleImg'
import { PickleFaxDialog } from '../components/PickleFax'
import type { DealershipData, StockItem, VehicleColor } from '../types'

interface Props {
  data: DealershipData
  onClose: () => void
}

const COLUMNS = 2
const GAP = 10

const PRESET_COLORS = [
  { label: 'Midnight Black', r: 10, g: 10, b: 10 },
  { label: 'Arctic White', r: 252, g: 252, b: 252 },
  { label: 'Racing Red', r: 192, g: 14, b: 26 },
  { label: 'Electric Blue', r: 30, g: 80, b: 190 },
  { label: 'Forest Green', r: 20, g: 100, b: 36 },
  { label: 'Sunset Orange', r: 230, g: 100, b: 20 },
  { label: 'Royal Purple', r: 80, g: 20, b: 140 },
  { label: 'Silver Metallic', r: 180, g: 185, b: 190 },
  { label: 'Gold', r: 200, g: 170, b: 50 },
  { label: 'Matte Gray', r: 100, g: 100, b: 100 },
  { label: 'Navy Blue', r: 15, g: 25, b: 80 },
  { label: 'Wine Red', r: 100, g: 10, b: 20 },
]

export default function ShowroomPage({ data }: Props) {
  const [allStock, setAllStock] = useState<StockItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('all')
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 0])
  const [maxRetailPrice, setMaxRetailPrice] = useState(0)
  const [showFilters, setShowFilters] = useState(false)
  const [sortBy, setSortBy] = useState<'name_asc' | 'name_desc' | 'price_asc' | 'price_desc'>('name_asc')
  const [tab, setTab] = useState<'new' | 'preowned'>('new')
  const [expandedModel, setExpandedModel] = useState<string | null>(null)
  const [selected, setSelected] = useState<StockItem | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank'>('bank')
  const [purchasing, setPurchasing] = useState(false)
  const [swapping, setSwapping] = useState(false)
  const [primaryColor, setPrimaryColor] = useState<VehicleColor | null>(null)
  const [secondaryColor, setSecondaryColor] = useState<VehicleColor | null>(null)
  const [colorPicker, setColorPicker] = useState<'primary' | 'secondary' | null>(null)
  const [pickleFaxId, setPickleFaxId] = useState<number | null>(null)
  const pickleFaxOpenRef = useRef(false)
  useEffect(() => {
    pickleFaxOpenRef.current = pickleFaxId !== null
    if (pickleFaxId !== null && draggingRef.current) {
      draggingRef.current = false
      lastMouseRef.current = null
      fetchNui('showroomOrbitInput', { dragging: false })
    }
  }, [pickleFaxId])
  const parentRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const lastMouseRef = useRef<{ x: number; y: number } | null>(null)

  // Single fetch on mount — all filtering/sorting is client-side
  useEffect(() => {
    fetchNui<StockItem[] | { stock: StockItem[] }>('getStock', {
      dealershipId: data.dealershipId,
      location: data.location,
    }).then((res) => {
      const items = Array.isArray(res) ? res : (res && 'stock' in res ? res.stock : [])
      const available = items.filter((s) => !s.sold_at && s.delivered_at && new Date(s.delivered_at) <= new Date())
      setAllStock(available)
      const highest = available.reduce((max, s) => Math.max(max, s.retail_price), 0)
      setMaxRetailPrice(highest)
      setPriceRange([0, highest])
      if (available.length > 0) {
        const first = available[0]
        setSelected(first)
        fetchNui('showroomSwapVehicle', { model: first.vehicle_model, stockId: first.is_used ? first.id : undefined })
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [data.dealershipId])

  // Derive classes from cached stock
  const classes = Array.from(new Set(allStock.map((s) => s.class).filter(Boolean))).sort() as string[]

  const isPriceFiltered = (range: [number, number]) => range[0] > 0 || (maxRetailPrice > 0 && range[1] < maxRetailPrice)
  const activeFilterCount = (classFilter !== 'all' ? 1 : 0) + (isPriceFiltered(priceRange) ? 1 : 0)

  // Client-side filter + sort
  const filtered = allStock.filter((item) => {
    if (search) {
      const q = search.toLowerCase()
      if (!(item.vehicle_label || item.vehicle_model).toLowerCase().includes(q)) return false
    }
    if (classFilter !== 'all' && item.class !== classFilter) return false
    if (isPriceFiltered(priceRange)) {
      if (item.retail_price < priceRange[0] || item.retail_price > priceRange[1]) return false
    }
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

  // Split into new vs pre-owned views
  const newStock = filtered.filter((s) => !s.is_used)
  const preOwnedStock = filtered.filter((s) => !!s.is_used)

  // Group pre-owned by vehicle_model so each model shows a single card with a sub-list
  const preOwnedGroups = (() => {
    const map = new Map<string, { model: string; label: string; image?: string | null; class?: string; minPrice: number; maxPrice: number; units: StockItem[] }>()
    for (const item of preOwnedStock) {
      const g = map.get(item.vehicle_model)
      if (g) {
        g.units.push(item)
        g.minPrice = Math.min(g.minPrice, item.retail_price)
        g.maxPrice = Math.max(g.maxPrice, item.retail_price)
      } else {
        map.set(item.vehicle_model, {
          model: item.vehicle_model,
          label: item.vehicle_label || item.vehicle_model,
          image: item.image,
          class: item.class,
          minPrice: item.retail_price,
          maxPrice: item.retail_price,
          units: [item],
        })
      }
    }
    return Array.from(map.values())
  })()

  // Active list driven by tab — pre-owned uses grouped cards, expanded view shows units
  const visibleItems: StockItem[] = tab === 'new' ? newStock : preOwnedStock
  const rowCount = tab === 'new' ? Math.ceil(newStock.length / COLUMNS) : Math.ceil(preOwnedGroups.length / COLUMNS)

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 130,
    measureElement: (el: Element) => el.getBoundingClientRect().height,
    overscan: 5,
  })

  const handleSelect = useCallback((item: StockItem) => {
    if (swapping || (selected && selected.id === item.id)) return
    setSelected(item)
    setSwapping(true)
    fetchNui('showroomSwapVehicle', { model: item.vehicle_model, stockId: item.is_used ? item.id : undefined }).finally(() => setSwapping(false))
  }, [selected, swapping])

  const handlePurchase = useCallback(() => {
    if (!selected || purchasing) return
    setPurchasing(true)
    fetchNui('showroomPurchase', {
      dealershipId: data.dealershipId,
      stockId: selected.id,
      paymentMethod,
      color: primaryColor,
      secondaryColor: secondaryColor,
      location: data.location,
    }).then(() => {
      setPurchasing(false)
    }).catch(() => setPurchasing(false))
  }, [selected, purchasing, paymentMethod, primaryColor, secondaryColor, data.dealershipId, data.location])

  const handleClose = useCallback(() => {
    fetchNui('showroomClose', {})
  }, [])

  // Mouse drag for orbit camera
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (pickleFaxOpenRef.current) return
      if (e.button !== 0) return
      if (e.clientX < 320) return
      draggingRef.current = true
      lastMouseRef.current = { x: e.clientX, y: e.clientY }
      fetchNui('showroomOrbitInput', { dragging: true })
    }

    const handleMouseUp = () => {
      if (!draggingRef.current) return
      draggingRef.current = false
      lastMouseRef.current = null
      fetchNui('showroomOrbitInput', { dragging: false })
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (pickleFaxOpenRef.current) return
      if (!draggingRef.current || !lastMouseRef.current) return
      const dx = e.clientX - lastMouseRef.current.x
      const dy = e.clientY - lastMouseRef.current.y
      lastMouseRef.current = { x: e.clientX, y: e.clientY }
      if (dx === 0 && dy === 0) return
      fetchNui('showroomOrbitInput', { lookX: dx, lookY: dy })
    }

    const handleWheel = (e: WheelEvent) => {
      if (pickleFaxOpenRef.current) return
      if (e.clientX < 320) return
      const delta = e.deltaY > 0 ? -1 : 1
      fetchNui('showroomOrbitInput', { zoom: delta })
    }

    const handleContextMenu = (e: MouseEvent) => e.preventDefault()

    window.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('wheel', handleWheel)
    window.addEventListener('contextmenu', handleContextMenu)
    return () => {
      window.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('wheel', handleWheel)
      window.removeEventListener('contextmenu', handleContextMenu)
      if (draggingRef.current) {
        fetchNui('showroomOrbitInput', { dragging: false })
      }
    }
  }, [])

  return (
    <div className="fixed inset-0 flex">
      {/* Left sidebar — vehicle grid */}
      <div className="w-80 shrink-0 bg-black/90 flex flex-col border-r border-white/10 pointer-events-auto">
        {/* Header */}
        <div className="p-3 pb-2">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="text-white text-base font-bold">{data.dealershipName}</h1>
              <p className="text-white/40 text-xs">{visibleItems.length} {tab === 'preowned' ? 'pre-owned' : 'new'} available</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => fetchNui('showroomToAuction', { location: data.location })}
                className="h-7 px-2 rounded-md bg-amber-500/15 border border-amber-500/40 text-amber-400 hover:bg-amber-500/25 text-[11px] font-semibold flex items-center gap-1 transition-colors"
                title="Browse live auctions"
              >
                <Gavel className="h-3 w-3" /> Auctions
              </button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-white/40 hover:text-white hover:bg-white/10"
                onClick={handleClose}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* New / Pre-owned tabs */}
          <div className="flex gap-1 mb-2">
            <button
              onClick={() => { setTab('new'); setExpandedModel(null) }}
              className={`flex-1 h-7 rounded-md text-xs font-medium transition-colors ${tab === 'new' ? 'bg-accent text-accent-foreground' : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70'}`}
            >
              New ({newStock.length})
            </button>
            <button
              onClick={() => { setTab('preowned'); setExpandedModel(null) }}
              className={`flex-1 h-7 rounded-md text-xs font-medium transition-colors ${tab === 'preowned' ? 'bg-accent text-accent-foreground' : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70'}`}
            >
              Pre-owned ({preOwnedStock.length})
            </button>
          </div>

          {/* Search + Filter button */}
          <div className="flex gap-1.5">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30" />
              <Input
                placeholder="Search vehicles..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs bg-white/5 border-white/10 text-white placeholder:text-white/30"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`h-8 px-2.5 rounded-md border flex items-center gap-1.5 text-xs shrink-0 transition-colors ${
                showFilters || activeFilterCount > 0
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-white/10 bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70'
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {activeFilterCount > 0 && (
                <span className="bg-accent text-accent-foreground text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Filters panel */}
        {showFilters && (
          <div className="px-3 pb-2 space-y-3">
            {/* Price range — dual slider */}
            {maxRetailPrice > 0 && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] uppercase tracking-wider text-white/40">Price Range</p>
                  {isPriceFiltered(priceRange) && (
                    <button
                      onClick={() => setPriceRange([0, maxRetailPrice])}
                      className="text-[9px] text-accent hover:text-accent/80"
                    >
                      Reset
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[10px] text-white/50 w-16 truncate">{formatCurrency(priceRange[0])}</span>
                  <span className="text-[10px] text-white/30">&mdash;</span>
                  <span className="text-[10px] text-white/50 w-16 truncate text-right">{formatCurrency(priceRange[1])}</span>
                </div>
                <DualRangeSlider
                  min={0}
                  max={maxRetailPrice}
                  value={priceRange}
                  step={Math.max(1, Math.round(maxRetailPrice / 100))}
                  onChange={setPriceRange}
                  onCommit={() => {}}
                />
              </div>
            )}

            {/* Sort */}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/40 mb-1.5">Sort By</p>
              <div className="flex flex-wrap gap-1">
                {([
                  ['name_asc', 'A — Z'],
                  ['name_desc', 'Z — A'],
                  ['price_asc', 'Price Low'],
                  ['price_desc', 'Price High'],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setSortBy(value)}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                      sortBy === value
                        ? 'bg-accent text-accent-foreground'
                        : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Class filter */}
            {classes.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-white/40 mb-1.5">Class</p>
                <div className="flex flex-wrap gap-1">
                  <button
                    onClick={() => setClassFilter('all')}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                      classFilter === 'all'
                        ? 'bg-accent text-accent-foreground'
                        : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60'
                    }`}
                  >
                    All
                  </button>
                  {classes.map((cls) => (
                    <button
                      key={cls}
                      onClick={() => setClassFilter(cls)}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium capitalize transition-colors ${
                        classFilter === cls
                          ? 'bg-accent text-accent-foreground'
                          : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60'
                      }`}
                    >
                      {cls}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Virtualized vehicle grid */}
        <div ref={parentRef} className="flex-1 overflow-auto">
          <div className="p-3">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-white/30" />
              </div>
            ) : visibleItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-white/30">
                <Car className="h-8 w-8 mb-2" />
                <p className="text-xs">{tab === 'preowned' ? 'No pre-owned vehicles' : 'No vehicles found'}</p>
              </div>
            ) : tab === 'new' ? (
              <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
                {virtualizer.getVirtualItems().map((virtualRow) => {
                  const startIdx = virtualRow.index * COLUMNS
                  const rowItems = newStock.slice(startIdx, startIdx + COLUMNS)

                  return (
                    <div
                      key={virtualRow.index}
                      data-index={virtualRow.index}
                      ref={virtualizer.measureElement}
                      className="absolute top-0 left-0 w-full grid grid-cols-2"
                      style={{
                        columnGap: '4px',
                        paddingBottom: `${GAP}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      {rowItems.map((item) => {
                        const isSelected = selected?.id === item.id
                        return (
                          <button
                            key={item.id}
                            onClick={() => handleSelect(item)}
                            className={`text-left rounded-sm transition-all flex flex-col ${
                              isSelected
                                ? 'ring-1 ring-accent bg-accent/10'
                                : 'bg-white/5 hover:bg-white/8'
                            }`}
                          >
                            <VehicleImg image={item.image} model={item.vehicle_model} alt={item.vehicle_label} className="w-full aspect-[16/9] object-contain rounded-t-sm bg-black/50" fallbackClassName="w-full aspect-[16/9] bg-white/5 flex items-center justify-center rounded-t-sm" iconClassName="h-5 w-5 text-white/10" />
                            <div className="p-2">
                              <div className="flex items-start justify-between gap-1">
                                <p className="text-white text-[11px] font-semibold truncate leading-tight">
                                  {item.vehicle_label || item.vehicle_model}
                                </p>
                                {(item.quantity || 1) > 1 && (
                                  <Badge variant="secondary" className="text-[8px] shrink-0 px-1 py-0">x{item.quantity}</Badge>
                                )}
                              </div>
                              <p className="text-accent font-bold text-xs mt-0.5">{formatCurrency(item.retail_price)}</p>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            ) : (
              // Pre-owned tab: grouped by model, expanded model shows individual units
              <div className="space-y-2">
                {preOwnedGroups.filter((g) => !expandedModel || g.model === expandedModel).map((g) => {
                  const isExpanded = expandedModel === g.model
                  const priceLabel = g.minPrice === g.maxPrice
                    ? formatCurrency(g.minPrice)
                    : `${formatCurrency(g.minPrice)} — ${formatCurrency(g.maxPrice)}`
                  return (
                    <div key={g.model} className="rounded-md bg-white/5 overflow-hidden">
                      <button
                        onClick={() => setExpandedModel(isExpanded ? null : g.model)}
                        className="w-full flex items-center gap-2 p-2 hover:bg-white/8 text-left"
                      >
                        <VehicleImg image={g.image} model={g.model} alt={g.label} className="w-20 aspect-[16/9] object-contain rounded bg-black/50" fallbackClassName="w-20 aspect-[16/9] bg-white/5 flex items-center justify-center rounded" iconClassName="h-4 w-4 text-white/10" />
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-[11px] font-semibold truncate leading-tight">{g.label}</p>
                          <p className="text-accent font-bold text-xs mt-0.5">{priceLabel}</p>
                          <p className="text-white/40 text-[10px] mt-0.5">{g.units.length} available · Pre-owned</p>
                        </div>
                        <ChevronRight className={`h-4 w-4 text-white/40 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                      </button>
                      {isExpanded && (
                        <div className="border-t border-white/10 divide-y divide-white/5">
                          {g.units.map((unit) => {
                            const isSelected = selected?.id === unit.id
                            return (
                              <div
                                key={unit.id}
                                className={`w-full px-3 py-2 flex items-center justify-between gap-3 transition-colors ${isSelected ? 'bg-accent/10' : 'hover:bg-white/5'}`}
                              >
                                <button onClick={() => handleSelect(unit)} className="flex-1 min-w-0 text-left">
                                  <p className="text-white text-[11px] font-mono">{unit.plate || '— No Plate —'}</p>
                                  <p className="text-white/40 text-[10px]">Condition: {Math.round(Number(unit.condition) || 0)}%</p>
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setPickleFaxId(unit.id) }}
                                  className="h-7 w-7 shrink-0 flex items-center justify-center rounded bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                                  title="View PickleFAX"
                                >
                                  <FileText className="h-3.5 w-3.5" />
                                </button>
                                <button onClick={() => handleSelect(unit)} className="text-accent font-bold text-xs shrink-0">
                                  {formatCurrency(unit.retail_price)}
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Center — transparent, for 3D vehicle view + orbit drag */}
      <div className="flex-1 relative pointer-events-auto cursor-grab active:cursor-grabbing">
        {swapping && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-black/60 rounded-full p-3">
              <Loader2 className="h-6 w-6 animate-spin text-white" />
            </div>
          </div>
        )}

        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 pointer-events-none">
          <p className="text-white/20 text-[10px] uppercase tracking-widest">Drag to rotate &middot; Scroll to zoom</p>
        </div>
      </div>

      {/* Bottom purchase bar */}
      {selected && (
        <div className="fixed bottom-0 left-80 right-0 pointer-events-auto">
          <div className="bg-black/90 border-t border-white/10 px-6 py-3 flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-2xl truncate leading-tight">
                {selected.vehicle_label || selected.vehicle_model}
              </p>
              <p className="text-white/40 text-lg capitalize">{selected.class || 'Vehicle'}</p>
            </div>

            <p className="text-accent font-bold text-lg shrink-0">{formatCurrency(selected.retail_price)}</p>

            {!selected.is_used && (
            <div className="flex items-center gap-1.5 shrink-0">
              <ColorSwatch
                label="Primary"
                color={primaryColor}
                isOpen={colorPicker === 'primary'}
                onToggle={() => setColorPicker(colorPicker === 'primary' ? null : 'primary')}
                onSelect={(c) => {
                  setPrimaryColor(c)
                  setColorPicker(null)
                  fetchNui('showroomSetColor', {
                    primaryR: c.r, primaryG: c.g, primaryB: c.b,
                    secondaryR: secondaryColor?.r, secondaryG: secondaryColor?.g, secondaryB: secondaryColor?.b,
                  })
                }}
              />
              <ColorSwatch
                label="Secondary"
                color={secondaryColor}
                isOpen={colorPicker === 'secondary'}
                onToggle={() => setColorPicker(colorPicker === 'secondary' ? null : 'secondary')}
                onSelect={(c) => {
                  setSecondaryColor(c)
                  setColorPicker(null)
                  fetchNui('showroomSetColor', {
                    primaryR: primaryColor?.r, primaryG: primaryColor?.g, primaryB: primaryColor?.b,
                    secondaryR: c.r, secondaryG: c.g, secondaryB: c.b,
                  })
                }}
              />
            </div>
            )}

            <Tabs
              defaultValue="bank"
              value={paymentMethod}
              onValueChange={(v) => setPaymentMethod(v as 'cash' | 'bank')}
            >
              <TabsList className="h-9 bg-white/5 border border-white/10">
                <TabsTrigger value="bank" className="gap-1.5 text-xs data-[state=active]:bg-white/10">
                  <CreditCard className="h-3.5 w-3.5" /> Bank
                </TabsTrigger>
                <TabsTrigger value="cash" className="gap-1.5 text-xs data-[state=active]:bg-white/10">
                  <Banknote className="h-3.5 w-3.5" /> Cash
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <Button
              className="h-9 px-5 gap-2"
              onClick={handlePurchase}
              disabled={purchasing}
            >
              {purchasing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Purchase'
              )}
            </Button>
          </div>
        </div>
      )}

      {pickleFaxId !== null && (
        <PickleFaxDialog stockId={pickleFaxId} mode="customer" onClose={() => setPickleFaxId(null)} />
      )}
    </div>
  )
}

function DualRangeSlider({ min, max, value, step, onChange, onCommit }: {
  min: number
  max: number
  value: [number, number]
  step: number
  onChange: (value: [number, number]) => void
  onCommit: (value: [number, number]) => void
}) {
  const pctLow = max > min ? ((value[0] - min) / (max - min)) * 100 : 0
  const pctHigh = max > min ? ((value[1] - min) / (max - min)) * 100 : 100

  return (
    <div className="relative h-5 flex items-center">
      {/* Track background */}
      <div className="absolute left-0 right-0 h-1 bg-white/10 rounded-full" />
      {/* Active range */}
      <div
        className="absolute h-1 bg-accent/60 rounded-full"
        style={{ left: `${pctLow}%`, right: `${100 - pctHigh}%` }}
      />
      {/* Min slider */}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value[0]}
        onChange={(e) => {
          const v = Math.min(parseInt(e.target.value), value[1] - step)
          onChange([v, value[1]])
        }}
        onMouseUp={() => onCommit(value)}
        className="absolute w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:z-10"
      />
      {/* Max slider */}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value[1]}
        onChange={(e) => {
          const v = Math.max(parseInt(e.target.value), value[0] + step)
          onChange([value[0], v])
        }}
        onMouseUp={() => onCommit(value)}
        className="absolute w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:z-20"
      />
    </div>
  )
}

function ColorSwatch({ label, color, isOpen, onToggle, onSelect }: {
  label: string
  color: VehicleColor | null
  isOpen: boolean
  onToggle: () => void
  onSelect: (color: VehicleColor) => void
}) {
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        title={label}
        className={`h-9 w-9 rounded-md border flex items-center justify-center transition-colors ${
          isOpen
            ? 'border-accent bg-accent/10'
            : 'border-white/10 bg-white/5 hover:bg-white/10'
        }`}
      >
        {color ? (
          <div
            className="w-5 h-5 rounded-full border border-white/20"
            style={{ backgroundColor: `rgb(${color.r}, ${color.g}, ${color.b})` }}
          />
        ) : (
          <Palette className="h-3.5 w-3.5 text-white/50" />
        )}
      </button>

      {isOpen && (
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-black/95 border border-white/10 rounded-lg p-2 shadow-xl" style={{ width: 176 }}>
          <div className="flex flex-wrap gap-1 justify-center">
            {PRESET_COLORS.map((c) => {
              const isActive = color?.r === c.r && color?.g === c.g && color?.b === c.b
              return (
                <button
                  key={c.label}
                  title={c.label}
                  onClick={() => onSelect({ r: c.r, g: c.g, b: c.b, type: 'rgb' })}
                  className="p-0.5"
                >
                  <div
                    className={`w-5 h-5 rounded-full border-2 transition-all hover:scale-110 ${
                      isActive ? 'border-accent scale-110' : 'border-white/15 hover:border-white/40'
                    }`}
                    style={{ backgroundColor: `rgb(${c.r}, ${c.g}, ${c.b})` }}
                  />
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
