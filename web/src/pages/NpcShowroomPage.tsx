import { useState, useEffect, useRef, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { fetchNui, formatCurrency } from '../lib/utils'
import { t } from '../lib/locale'
import { Search, X, Car, Loader2, UserX, SlidersHorizontal, Send } from 'lucide-react'
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

export default function NpcShowroomPage({ data, profile, greeting, onClose }: Props) {
  const [allStock, setAllStock] = useState<StockItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('all')
  const [sortBy, setSortBy] = useState<'name_asc' | 'name_desc' | 'price_asc' | 'price_desc'>('name_asc')
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 0])
  const [maxRetailPrice, setMaxRetailPrice] = useState(0)
  const [showFilters, setShowFilters] = useState(false)
  const [selected, setSelected] = useState<StockItem | null>(null)
  const [swapping, setSwapping] = useState(false)
  const [processing, setProcessing] = useState(false)

  // Negotiation state
  const [phase, setPhase] = useState<'selecting' | 'negotiating' | 'completed' | 'failed'>('selecting')
  const [subtitle, setSubtitle] = useState(greeting || '')
  const [subtitleFade, setSubtitleFade] = useState(true)
  const [stress, setStress] = useState(0)
  const [offerInput, setOfferInput] = useState('')

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
      const available = items.filter((s) => !s.sold_at && !s.unlisted && s.delivered_at && new Date(s.delivered_at) <= new Date())
      setAllStock(available)
      const highest = available.reduce((max, s) => Math.max(max, s.retail_price), 0)
      if (highest > 0) {
        setMaxRetailPrice(highest)
        setPriceRange([0, highest])
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [data.dealershipId])

  // Client-side filter + sort
  const classes = Array.from(new Set(allStock.map((s) => s.class).filter(Boolean))).sort() as string[]
  const isPriceFiltered = (r: [number, number]) => r[0] > 0 || (maxRetailPrice > 0 && r[1] < maxRetailPrice)

  const filtered = allStock.filter((item) => {
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

  const activeFilterCount = (classFilter !== 'all' ? 1 : 0) + (isPriceFiltered(priceRange) ? 1 : 0)
  const rowCount = Math.ceil(filtered.length / COLUMNS)
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 140,
    measureElement: (el: Element) => el.getBoundingClientRect().height,
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
        setOfferInput(String(item.retail_price))
        setSubtitle(res.dialogue)
      }
      setProcessing(false)
    }).catch(() => setProcessing(false))
  }, [swapping, processing])

  // Submit price offer
  const handleSubmitOffer = useCallback(() => {
    if (processing || !selected) return
    const price = parseInt(offerInput)
    if (!price || price <= 0) return
    setProcessing(true)

    fetchNui<{
      success: boolean; accepted: boolean; walkaway: boolean
      stress: number; stressIncrease: number; dialogue: string
    }>('npcEvaluateOffer', {
      offerPrice: price,
      currentStress: stress,
    }).then((res) => {
      if (res.success) {
        setStress(res.stress)
        setSubtitle(res.dialogue)

        if (res.accepted) {
          setPhase('completed')
          fetchNui('completeNPCSale', {
            stockId: selected.id,
            saleAmount: price,
            vehicleModel: selected.vehicle_model,
          })
        } else if (res.walkaway) {
          setPhase('failed')
        }
      }
      setProcessing(false)
    }).catch(() => setProcessing(false))
  }, [processing, selected, offerInput, stress])

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
              <p className="text-white/40 text-xs">{t('npc_select_vehicle')}</p>
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
                placeholder={t('label_search_vehicles')}
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
                  : 'border-white/10 bg-white/5 text-white/50 hover:bg-white/10'
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

        {showFilters && (
          <div className="px-3 pb-2 space-y-2">
            {/* Sort */}
            <div>
              <p className="text-[9px] uppercase tracking-wider text-white/30 mb-1">{t('label_sort_by')}</p>
              <div className="flex flex-wrap gap-1">
                {([['name_asc', t('label_sort_az')], ['name_desc', t('label_sort_za')], ['price_asc', t('label_sort_price_low')], ['price_desc', t('label_sort_price_high')]] as [typeof sortBy, string][]).map(([value, label]) => (
                  <button key={value} onClick={() => setSortBy(value)} className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${sortBy === value ? 'bg-accent text-accent-foreground' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}>{label}</button>
                ))}
              </div>
            </div>

            {/* Class */}
            {classes.length > 0 && (
              <div>
                <p className="text-[9px] uppercase tracking-wider text-white/30 mb-1">{t('label_class')}</p>
                <div className="flex flex-wrap gap-1">
                  <button onClick={() => setClassFilter('all')} className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${classFilter === 'all' ? 'bg-accent text-accent-foreground' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}>{t('label_all')}</button>
                  {classes.map((cls) => (
                    <button key={cls} onClick={() => setClassFilter(cls)} className={`px-2 py-0.5 rounded text-[10px] font-medium capitalize transition-colors ${classFilter === cls ? 'bg-accent text-accent-foreground' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}>{cls}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Price range */}
            {maxRetailPrice > 0 && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[9px] uppercase tracking-wider text-white/30">{t('label_price')}</p>
                  {isPriceFiltered(priceRange) && (
                    <button onClick={() => setPriceRange([0, maxRetailPrice])} className="text-[9px] text-accent hover:text-accent/80">{t('label_reset')}</button>
                  )}
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] text-white/40">{formatCurrency(priceRange[0])}</span>
                  <span className="text-[10px] text-white/20">&mdash;</span>
                  <span className="text-[10px] text-white/40">{formatCurrency(priceRange[1])}</span>
                </div>
                <DualRangeSlider min={0} max={maxRetailPrice} value={priceRange} step={Math.max(1, Math.round(maxRetailPrice / 100))} onChange={setPriceRange} />
              </div>
            )}
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
                <p className="text-xs">{t('empty_no_matching')}</p>
              </div>
            ) : (
              <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
                {virtualizer.getVirtualItems().map((virtualRow) => {
                  const startIdx = virtualRow.index * COLUMNS
                  const rowItems = filtered.slice(startIdx, startIdx + COLUMNS)
                  return (
                    <div
                      key={virtualRow.index}
                      data-index={virtualRow.index}
                      ref={virtualizer.measureElement}
                      className="absolute top-0 left-0 w-full grid grid-cols-2"
                      style={{ columnGap: '4px', paddingBottom: `${GAP}px`, transform: `translateY(${virtualRow.start}px)` }}
                    >
                      {rowItems.map((item) => {
                        const isSelected = selected?.id === item.id
                        return (
                          <button
                            key={item.id}
                            onClick={() => handleSelect(item)}
                            className={`text-left rounded-lg transition-all flex flex-col ${
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
        {/* Customer request — persistent top subtitle with budget hint */}
        {(greeting || profile) && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 pointer-events-none z-10 flex flex-col items-center gap-2">
            {greeting && (
              <p className="text-white/60 text-sm text-center px-4 py-2 bg-black/40 rounded-lg italic">
                &ldquo;{greeting}&rdquo;
              </p>
            )}
            {profile && (
              <div className="flex items-center gap-3 px-4 py-1.5 bg-black/40 rounded-lg text-[11px]">
                <span className="text-white/40">{t('npc_budget')}:</span>
                <span className="text-emerald-400 font-semibold">{formatCurrency(profile.budget)}</span>
                {profile.typePreference && (
                  <>
                    <span className="text-white/20">|</span>
                    <span className="text-white/40">{t('npc_wants')}:</span>
                    <span className="text-white/70 capitalize font-medium">{profile.typePreference}</span>
                  </>
                )}
              </div>
            )}
          </div>
        )}

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
        <div className="bg-black/90 border-t border-white/10 px-6 py-3">
          {phase === 'selecting' && !selected && (
            <p className="text-white/40 text-sm text-center">{t('npc_select_from_list')}</p>
          )}

          {(phase === 'negotiating' || (phase === 'selecting' && selected)) && selected && (
            <div className="flex items-center gap-4">
              {/* Vehicle info */}
              <div className="min-w-0">
                <p className="text-white font-bold text-xl truncate leading-tight">{selected.vehicle_label || selected.vehicle_model}</p>
                <div className="flex items-center gap-2">
                  <p className="text-white/40 text-sm capitalize">{selected.class || t('label_vehicle')}</p>
                  <span className="text-white/20">|</span>
                  <p className="text-white/40 text-sm">{t('npc_msrp')} <span className="text-white/60 font-semibold">{formatCurrency(selected.wholesale_cost)}</span></p>
                </div>
              </div>

              {phase === 'negotiating' && (
                <>
                  {/* Stress bar */}
                  <div className="w-32 shrink-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[10px] uppercase tracking-wider text-white/40">{t('npc_stress')}</p>
                      <p className={`text-[10px] font-bold ${stress >= 70 ? 'text-red-400' : stress >= 40 ? 'text-orange-400' : 'text-white/50'}`}>{stress}%</p>
                    </div>
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${stress >= 70 ? 'bg-red-500' : stress >= 40 ? 'bg-orange-400' : 'bg-emerald-400'}`}
                        style={{ width: `${stress}%` }}
                      />
                    </div>
                  </div>

                  {/* Price input + submit */}
                  <div className="flex items-center gap-2 ml-auto shrink-0">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm">$</span>
                      <input
                        type="number"
                        value={offerInput}
                        onChange={(e) => setOfferInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSubmitOffer() }}
                        className="h-9 w-36 pl-7 pr-3 rounded-md bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-accent"
                        placeholder={t('npc_your_price')}
                      />
                    </div>
                    <Button
                      size="sm"
                      disabled={processing || !offerInput}
                      onClick={handleSubmitOffer}
                      className="gap-1.5 h-9"
                    >
                      <Send className="h-3.5 w-3.5" /> {t('npc_offer')}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Completed / Failed */}
          {isEnded && (
            <div className="flex items-center justify-center gap-4">
              <p className={`text-sm font-medium ${phase === 'completed' ? 'text-emerald-400' : 'text-red-400'}`}>
                {phase === 'completed' ? t('npc_sale_completed', formatCurrency(parseInt(offerInput) || 0)) : t('npc_customer_walked_away')}
              </p>
              <Button variant="outline" size="sm" onClick={handleDismiss} className="bg-white/5 border-white/10 text-white hover:bg-white/10">
                {t('btn_close')}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function DualRangeSlider({ min, max, value, step, onChange }: {
  min: number; max: number; value: [number, number]; step: number
  onChange: (value: [number, number]) => void
}) {
  const pctLow = max > min ? ((value[0] - min) / (max - min)) * 100 : 0
  const pctHigh = max > min ? ((value[1] - min) / (max - min)) * 100 : 100
  return (
    <div className="relative h-5 flex items-center">
      <div className="absolute left-0 right-0 h-1 bg-white/10 rounded-full" />
      <div className="absolute h-1 bg-accent/60 rounded-full" style={{ left: `${pctLow}%`, right: `${100 - pctHigh}%` }} />
      <input type="range" min={min} max={max} step={step} value={value[0]}
        onChange={(e) => { const v = Math.min(parseInt(e.target.value), value[1] - step); onChange([v, value[1]]) }}
        className="absolute w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:z-10" />
      <input type="range" min={min} max={max} step={step} value={value[1]}
        onChange={(e) => { const v = Math.max(parseInt(e.target.value), value[0] + step); onChange([value[0], v]) }}
        className="absolute w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:z-20" />
    </div>
  )
}
