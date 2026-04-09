import { useState, useEffect, useRef, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { fetchNui, formatCurrency } from '../lib/utils'
import { Search, X, Car, Loader2, HandCoins, Sparkles, ThumbsUp, UserX, SlidersHorizontal } from 'lucide-react'
import VehicleImg from '../components/VehicleImg'
import type { DealershipData, StockItem, NPCProfile } from '../types'

interface Props {
  data: DealershipData
  profile: NPCProfile | null
  greeting: string
  onClose: () => void
}

const COLUMNS = 2
const GAP = 10

const tactics = [
  { id: 'concession', label: 'Negotiate', icon: <HandCoins className="h-4 w-4" /> },
  { id: 'highlight_features', label: 'Persuade', icon: <Sparkles className="h-4 w-4" /> },
  { id: 'final_offer', label: 'Final Offer', icon: <ThumbsUp className="h-4 w-4" /> },
]

export default function NpcShowroomPage({ data, profile, greeting, onClose }: Props) {
  const [allStock, setAllStock] = useState<StockItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('all')
  const [sortBy, setSortBy] = useState<'name_asc' | 'price_asc' | 'price_desc'>('name_asc')
  const [showFilters, setShowFilters] = useState(false)
  const [selected, setSelected] = useState<StockItem | null>(null)
  const [swapping, setSwapping] = useState(false)
  const [processing, setProcessing] = useState(false)

  // Negotiation state
  const [phase, setPhase] = useState<'selecting' | 'negotiating' | 'completed' | 'failed'>('selecting')
  const [subtitle, setSubtitle] = useState(greeting || '')
  const [subtitleFade, setSubtitleFade] = useState(true)
  const [currentOffer, setCurrentOffer] = useState(0)
  const [askingPrice, setAskingPrice] = useState(0)
  const [round, setRound] = useState(0)
  const [maxRounds] = useState(profile?.maxRounds ?? 5)

  const parentRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const lastMouseRef = useRef<{ x: number; y: number } | null>(null)

  // Subtitle fade effect
  useEffect(() => {
    setSubtitleFade(false)
    const t = setTimeout(() => setSubtitleFade(true), 50)
    return () => clearTimeout(t)
  }, [subtitle])

  // Load stock once
  useEffect(() => {
    fetchNui<StockItem[] | { stock: StockItem[] }>('getStock', {
      dealershipId: data.dealershipId,
      location: data.location,
    }).then((res) => {
      const items = Array.isArray(res) ? res : (res && 'stock' in res ? res.stock : [])
      const available = items.filter((s) => !s.sold_at && s.delivered_at && new Date(s.delivered_at) <= new Date())
      setAllStock(available)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [data.dealershipId])

  // Client-side filter + sort
  const classes = Array.from(new Set(allStock.map((s) => s.class).filter(Boolean))).sort() as string[]
  const filtered = allStock.filter((item) => {
    if (search && !(item.vehicle_label || item.vehicle_model).toLowerCase().includes(search.toLowerCase())) return false
    if (classFilter !== 'all' && item.class !== classFilter) return false
    return true
  }).sort((a, b) => {
    switch (sortBy) {
      case 'name_asc': return (a.vehicle_label || a.vehicle_model).localeCompare(b.vehicle_label || b.vehicle_model)
      case 'price_asc': return a.retail_price - b.retail_price
      case 'price_desc': return b.retail_price - a.retail_price
      default: return 0
    }
  })

  const activeFilterCount = (classFilter !== 'all' ? 1 : 0)
  const rowCount = Math.ceil(filtered.length / COLUMNS)
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 128,
    overscan: 5,
  })

  // Select vehicle: swap 3D model + present to NPC
  const handleSelect = useCallback((item: StockItem) => {
    if (swapping || processing) return
    setSelected(item)
    setSwapping(true)

    // Swap vehicle model
    fetchNui('npcShowroomSwapVehicle', { model: item.vehicle_model }).finally(() => setSwapping(false))

    // Present to NPC for evaluation
    setProcessing(true)
    fetchNui<{ success: boolean; quality: string; score: number; dialogue: string; openingOffer?: number }>('presentVehicle', {
      stockItem: item,
    }).then((res) => {
      if (res.success) {
        setPhase('negotiating')
        setAskingPrice(item.retail_price)
        setCurrentOffer(res.openingOffer ?? Math.round(item.retail_price * (res.score / 100)))
        setRound(0)
        setSubtitle(res.dialogue)
      }
      setProcessing(false)
    }).catch(() => setProcessing(false))
  }, [swapping, processing])

  // Negotiation tactic
  const handleTactic = useCallback((tacticId: string) => {
    if (processing || !selected) return
    setProcessing(true)

    fetchNui<{
      success: boolean; newOffer: number; reaction: string; emotionState: string
      dialogue: string; roundOver: boolean; saleComplete: boolean; maxRounds?: number
    }>('negotiate', {
      stockId: selected.id,
      tactic: tacticId,
      currentOffer,
      round: round + 1,
    }).then((res) => {
      if (res.success) {
        if (res.saleComplete) {
          setPhase('completed')
          setCurrentOffer(res.newOffer)
          setSubtitle(res.dialogue)
          fetchNui('completeNPCSale', {
            stockId: selected.id,
            saleAmount: res.newOffer,
            vehicleModel: selected.vehicle_model,
          })
        } else if (res.reaction === 'walkaway') {
          setPhase('failed')
          setSubtitle(res.dialogue || 'The customer walks away.')
        } else {
          setCurrentOffer(res.newOffer)
          setRound((r) => r + 1)
          setSubtitle(res.dialogue)
        }
      }
      setProcessing(false)
    }).catch(() => setProcessing(false))
  }, [processing, selected, currentOffer, round])

  const handleDismiss = useCallback(() => {
    fetchNui('dismissNPC', {})
    onClose()
  }, [onClose])

  // Orbit camera drag
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 0 || e.clientX < 320) return
      draggingRef.current = true
      lastMouseRef.current = { x: e.clientX, y: e.clientY }
      fetchNui('npcShowroomOrbitInput', { dragging: true })
    }
    const handleMouseUp = () => {
      if (!draggingRef.current) return
      draggingRef.current = false
      lastMouseRef.current = null
      fetchNui('npcShowroomOrbitInput', { dragging: false })
    }
    const handleMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current || !lastMouseRef.current) return
      const dx = e.clientX - lastMouseRef.current.x
      const dy = e.clientY - lastMouseRef.current.y
      lastMouseRef.current = { x: e.clientX, y: e.clientY }
      if (dx === 0 && dy === 0) return
      fetchNui('npcShowroomOrbitInput', { lookX: dx, lookY: dy })
    }
    const handleWheel = (e: WheelEvent) => {
      if (e.clientX < 320) return
      fetchNui('npcShowroomOrbitInput', { zoom: e.deltaY > 0 ? -1 : 1 })
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
      if (draggingRef.current) fetchNui('npcShowroomOrbitInput', { dragging: false })
    }
  }, [])

  const isEnded = phase === 'completed' || phase === 'failed'

  return (
    <div className="fixed inset-0 flex">
      {/* Left sidebar — vehicle list */}
      <div className="w-80 shrink-0 bg-black/90 flex flex-col border-r border-white/10 pointer-events-auto">
        <div className="p-3 pb-2">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="text-white text-base font-bold">{data.dealershipName}</h1>
              <p className="text-white/40 text-xs">Select a vehicle to present</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white/40 hover:text-white hover:bg-white/10"
              onClick={handleDismiss}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
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
            {classes.length > 0 && (
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`h-8 px-2.5 rounded-md border flex items-center gap-1.5 text-xs shrink-0 transition-colors ${
                  showFilters || activeFilterCount > 0
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-white/10 bg-white/5 text-white/50 hover:bg-white/10'
                }`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {showFilters && classes.length > 0 && (
          <div className="px-3 pb-2">
            <div className="flex flex-wrap gap-1">
              <button onClick={() => setClassFilter('all')} className={`px-2 py-0.5 rounded text-[10px] font-medium capitalize transition-colors ${classFilter === 'all' ? 'bg-accent text-accent-foreground' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}>All</button>
              {classes.map((cls) => (
                <button key={cls} onClick={() => setClassFilter(cls)} className={`px-2 py-0.5 rounded text-[10px] font-medium capitalize transition-colors ${classFilter === cls ? 'bg-accent text-accent-foreground' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}>{cls}</button>
              ))}
            </div>
          </div>
        )}

        {/* Vehicle grid */}
        <div ref={parentRef} className="flex-1 overflow-auto">
          <div className="p-3">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-white/30" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-white/30">
                <Car className="h-8 w-8 mb-2" />
                <p className="text-xs">No vehicles found</p>
              </div>
            ) : (
              <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
                {virtualizer.getVirtualItems().map((virtualRow) => {
                  const startIdx = virtualRow.index * COLUMNS
                  const rowItems = filtered.slice(startIdx, startIdx + COLUMNS)
                  return (
                    <div
                      key={virtualRow.index}
                      className="absolute top-0 left-0 w-full grid grid-cols-2"
                      style={{ height: '120px', columnGap: '4px', paddingBottom: `${GAP}px`, transform: `translateY(${virtualRow.start}px)` }}
                    >
                      {rowItems.map((item) => {
                        const isSelected = selected?.id === item.id
                        return (
                          <button
                            key={item.id}
                            onClick={() => handleSelect(item)}
                            className={`text-left rounded-lg overflow-hidden transition-all ${
                              isSelected ? 'ring-1 ring-accent bg-accent/10' : 'bg-white/5 hover:bg-white/8'
                            }`}
                          >
                            <VehicleImg image={item.image} model={item.vehicle_model} alt={item.vehicle_label} className="w-full aspect-[16/9] object-contain rounded-t-sm bg-black/50" fallbackClassName="w-full aspect-[16/9] bg-white/5 flex items-center justify-center rounded-t-sm" iconClassName="h-5 w-5 text-white/10" />
                            <div className="p-2">
                              <p className="text-white text-[11px] font-semibold truncate leading-tight">{item.vehicle_label || item.vehicle_model}</p>
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
          </div>
        </div>
      </div>

      {/* Center — 3D scene + orbit drag */}
      <div className="flex-1 relative pointer-events-auto cursor-grab active:cursor-grabbing">
        {swapping && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-black/60 rounded-full p-3">
              <Loader2 className="h-6 w-6 animate-spin text-white" />
            </div>
          </div>
        )}
      </div>

      {/* Bottom — subtitle + negotiation controls */}
      <div className="fixed bottom-0 left-80 right-0 pointer-events-auto">
        {/* Subtitle */}
        {subtitle && (
          <div className="flex justify-center mb-3 px-8">
            <div className={`max-w-xl transition-opacity duration-300 ${subtitleFade ? 'opacity-100' : 'opacity-0'}`}>
              <p className="text-white text-center text-base font-medium drop-shadow-lg leading-relaxed px-5 py-2.5 bg-black/50 rounded-lg">
                {subtitle}
              </p>
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="bg-black/90 border-t border-white/10 px-6 py-3 flex items-center gap-4">
          {phase === 'selecting' && !selected && (
            <p className="text-white/40 text-sm flex-1 text-center">Select a vehicle from the list to present to the customer</p>
          )}

          {(phase === 'negotiating' || (phase === 'selecting' && selected)) && selected && (
            <>
              {/* Vehicle info */}
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-xl truncate leading-tight">{selected.vehicle_label || selected.vehicle_model}</p>
                <p className="text-white/40 text-sm capitalize">{selected.class || 'Vehicle'}</p>
              </div>

              {/* Offers */}
              {phase === 'negotiating' && (
                <div className="flex items-center gap-4 shrink-0">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-white/40">Their Offer</p>
                    <p className="text-lg font-bold text-white">{formatCurrency(currentOffer)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-white/40">Asking</p>
                    <p className="text-lg font-bold text-accent">{formatCurrency(askingPrice)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-white/40">Round</p>
                    <p className="text-sm text-white/60">{round + 1}/{maxRounds}</p>
                  </div>
                </div>
              )}

              {/* Tactics */}
              {phase === 'negotiating' && (
                <div className="flex items-center gap-2 shrink-0">
                  {tactics.map((t) => (
                    <Button key={t.id} variant="outline" size="sm" disabled={processing} onClick={() => handleTactic(t.id)}
                      className="gap-1.5 bg-white/5 border-white/10 text-white hover:bg-white/10 h-9">
                      {t.icon} {t.label}
                    </Button>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Completed / Failed */}
          {isEnded && (
            <div className="flex items-center justify-center gap-4 flex-1">
              <p className={`text-sm font-medium ${phase === 'completed' ? 'text-emerald-400' : 'text-red-400'}`}>
                {phase === 'completed' ? `Sale completed for ${formatCurrency(currentOffer)}!` : 'Customer walked away. No sale.'}
              </p>
              <Button variant="outline" size="sm" onClick={handleDismiss} className="bg-white/5 border-white/10 text-white hover:bg-white/10">
                Close
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
