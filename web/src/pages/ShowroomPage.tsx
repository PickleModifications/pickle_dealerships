import { useState, useEffect, useRef, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs'
import { fetchNui, formatCurrency } from '../lib/utils'
import { Search, X, CreditCard, Banknote, Car, Loader2, Palette } from 'lucide-react'
import type { DealershipData, StockItem, VehicleColor } from '../types'

interface Props {
  data: DealershipData
  onClose: () => void
}

interface ShowroomStockResponse {
  items: StockItem[]
  total: number
  page: number
  pageSize: number
  classes?: string[]
}

const PAGE_SIZE = 20
const COLUMNS = 2
const ROW_HEIGHT = 120
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
  const [items, setItems] = useState<StockItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('all')
  const [classes, setClasses] = useState<string[]>([])
  const [selected, setSelected] = useState<StockItem | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank'>('bank')
  const [purchasing, setPurchasing] = useState(false)
  const [swapping, setSwapping] = useState(false)
  const [primaryColor, setPrimaryColor] = useState<VehicleColor | null>(null)
  const [secondaryColor, setSecondaryColor] = useState<VehicleColor | null>(null)
  const [colorPicker, setColorPicker] = useState<'primary' | 'secondary' | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const parentRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const lastMouseRef = useRef<{ x: number; y: number } | null>(null)

  const hasMore = items.length < total

  const fetchPage = useCallback((p: number, s: string, cf: string, append: boolean) => {
    if (append) {
      setLoadingMore(true)
    } else {
      setLoading(true)
    }
    fetchNui<ShowroomStockResponse>('getShowroomStock', {
      location: data.location,
      page: p,
      pageSize: PAGE_SIZE,
      search: s,
      classFilter: cf,
    }).then((res) => {
      if (res && res.items) {
        const newItems = append ? [...items, ...res.items] : res.items
        setItems(prev => append ? [...prev, ...res.items] : res.items)
        setTotal(res.total)
        setPage(res.page)
        if (res.classes && res.classes.length > 0) {
          setClasses(res.classes)
        }
        // Auto-select first vehicle on initial load
        if (!append && res.items.length > 0 && !selected) {
          setSelected(res.items[0])
          fetchNui('showroomSwapVehicle', { model: res.items[0].vehicle_model })
        }
      }
      setLoading(false)
      setLoadingMore(false)
    }).catch(() => { setLoading(false); setLoadingMore(false) })
  }, [data.location, selected])

  useEffect(() => { fetchPage(1, '', 'all', false) }, [])

  const handleSearchChange = (value: string) => {
    setSearch(value)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      fetchPage(1, value, classFilter, false)
    }, 300)
  }

  const handleClassChange = (value: string) => {
    setClassFilter(value)
    fetchPage(1, search, value, false)
  }

  const rowCount = Math.ceil(items.length / COLUMNS)

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT + GAP,
    overscan: 5,
    onChange: (instance) => {
      const vItems = instance.getVirtualItems()
      const lastRow = vItems[vItems.length - 1]
      if (!lastRow) return
      const lastItemIndex = (lastRow.index + 1) * COLUMNS
      if (lastItemIndex >= items.length - 6 && hasMore && !loadingMore) {
        fetchPage(page + 1, search, classFilter, true)
      }
    },
  })

  const handleSelect = useCallback((item: StockItem) => {
    if (swapping || (selected && selected.id === item.id)) return
    setSelected(item)
    setSwapping(true)
    fetchNui('showroomSwapVehicle', { model: item.vehicle_model }).finally(() => setSwapping(false))
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
      if (!draggingRef.current || !lastMouseRef.current) return
      const dx = e.clientX - lastMouseRef.current.x
      const dy = e.clientY - lastMouseRef.current.y
      lastMouseRef.current = { x: e.clientX, y: e.clientY }
      if (dx === 0 && dy === 0) return
      fetchNui('showroomOrbitInput', { lookX: dx, lookY: dy })
    }

    const handleWheel = (e: WheelEvent) => {
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

  const categories = ['all', ...classes]

  return (
    <div className="fixed inset-0 flex">
      {/* Left sidebar — vehicle grid */}
      <div className="w-80 shrink-0 bg-black/90 flex flex-col border-r border-white/10 pointer-events-auto">
        {/* Header */}
        <div className="p-3 pb-2">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="text-white text-base font-bold">{data.dealershipName}</h1>
              <p className="text-white/40 text-xs">{total} vehicles available</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white/40 hover:text-white hover:bg-white/10"
              onClick={handleClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30" />
            <Input
              placeholder="Search vehicles..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-8 h-8 text-xs bg-white/5 border-white/10 text-white placeholder:text-white/30"
            />
          </div>
        </div>

        {/* Category tabs */}
        {categories.length > 1 && (
          <div className="px-3 pb-2">
            <div className="flex flex-wrap gap-1">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => handleClassChange(cat)}
                  className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors capitalize ${
                    classFilter === cat
                      ? 'bg-accent text-accent-foreground'
                      : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70'
                  }`}
                >
                  {cat === 'all' ? 'All' : cat}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Virtualized vehicle grid */}
        <div ref={parentRef} className="flex-1 overflow-auto">
          <div className="p-3">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-white/30" />
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-white/30">
                <Car className="h-8 w-8 mb-2" />
                <p className="text-xs">No vehicles found</p>
              </div>
            ) : (
              <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
                {virtualizer.getVirtualItems().map((virtualRow) => {
                  const startIdx = virtualRow.index * COLUMNS
                  const rowItems = items.slice(startIdx, startIdx + COLUMNS)

                  return (
                    <div
                      key={virtualRow.index}
                      className="absolute top-0 left-0 w-full grid grid-cols-2"
                      style={{
                        height: `${ROW_HEIGHT}px`,
                        rowGap: `${GAP}px`,
                        columnGap: '2px',
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
                            {item.image ? (
                              <img src={item.image} alt={item.vehicle_label} className="w-full aspect-[16/9] object-cover rounded-t-sm" />
                            ) : (
                              <div className="w-full aspect-[16/9] bg-white/5 flex items-center justify-center rounded-t-sm">
                                <Car className="h-5 w-5 text-white/10" />
                              </div>
                            )}
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
            )}
            {loadingMore && (
              <div className="flex justify-center py-3">
                <Loader2 className="h-4 w-4 animate-spin text-white/30" />
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
