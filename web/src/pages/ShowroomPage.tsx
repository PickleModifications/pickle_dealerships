import { useState, useEffect, useRef, useCallback } from 'react'
import { t } from '../lib/locale'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs'
import { fetchNui, formatCurrency, getVehicleImage } from '../lib/utils'
import { Search, X, CreditCard, Banknote, Car, Loader2, Palette, SlidersHorizontal, ChevronRight, FileText, Gavel, Zap, Package, Warehouse, PenLine, Wind } from 'lucide-react'
import VehicleImg from '../components/VehicleImg'
import { PickleFaxDialog } from '../components/PickleFax'
import FinancingContractDialog from '../components/FinancingContractDialog'
import { useNuiEvent } from '../hooks/useNuiEvent'
import { formatTimeRemaining, isEndingSoon, nextBidFloor, maskBidder } from '../lib/auction'
import type { DealershipData, StockItem, VehicleColor, Auction, FinancingSettings } from '../types'

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
  const [tab, setTab] = useState<'new' | 'preowned' | 'auctions'>('new')
  const [expandedModel, setExpandedModel] = useState<string | null>(null)
  const [selected, setSelected] = useState<StockItem | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank' | 'financing'>('bank')
  const [purchasing, setPurchasing] = useState(false)
  const [swapping, setSwapping] = useState(false)
  const [primaryColor, setPrimaryColor] = useState<VehicleColor | null>(null)
  const [secondaryColor, setSecondaryColor] = useState<VehicleColor | null>(null)
  const [colorPicker, setColorPicker] = useState<'primary' | 'secondary' | null>(null)
  const [pickleFaxId, setPickleFaxId] = useState<number | null>(null)

  // ── Auction state ──
  const [auctions, setAuctions] = useState<Auction[]>([])
  const [selectedAuction, setSelectedAuction] = useState<(Auction & { bids?: Array<{ id: number; bidder_identifier: string; amount: number; placed_at: string; refunded: number }> }) | null>(null)
  const [bidInput, setBidInput] = useState('')
  const [bidding, setBidding] = useState(false)
  const [bidError, setBidError] = useState<string | null>(null)
  const [myIdentifier, setMyIdentifier] = useState<string | null>(null)
  const [, setAuctionTick] = useState(0)

  // ── Financing state ──
  const [financingSettings, setFinancingSettings] = useState<FinancingSettings | null>(null)
  const [selectedInstallments, setSelectedInstallments] = useState<number | null>(null)
  const [showContract, setShowContract] = useState(false)
  const [financingSigning, setFinancingSigning] = useState(false)
  const [myLoans, setMyLoans] = useState<Array<{ id: number; vehiclePlate: string; totalAmount: number; amountPaid: number; installmentAmount: number; remaining: number; missedPayments: number; dealershipName?: string }>>([])
  const [showLoans, setShowLoans] = useState(false)
  const [playerName, setPlayerName] = useState<string | null>(null)
  const [pendingPickups, setPendingPickups] = useState<Array<{ id: number; vehicle_model: string; vehicle_label: string; winning_bid: number; dealership_name: string; plate?: string | null }>>([])
  const [showPickups, setShowPickups] = useState(false)
  const [claimingId, setClaimingId] = useState<number | null>(null)
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
      const available = items.filter((s) => !s.sold_at && !s.unlisted && s.delivered_at && new Date(s.delivered_at) <= new Date())
      setAllStock(available)
      const highest = available.reduce((max, s) => Math.max(max, s.retail_price), 0)
      setMaxRetailPrice(highest)
      setPriceRange([0, highest])
      if (available.length > 0) {
        // Spot-view mode: seed the selection with the specific stock the player
        // walked up to instead of defaulting to the first item in the list.
        // Skip the preview-vehicle swap — the physical display car at the spot
        // is what the player is already looking at.
        const target = data.spotViewStockId
          ? available.find((s) => s.id === data.spotViewStockId) ?? available[0]
          : available[0]
        setSelected(target)
        if (!data.spotViewStockId) {
          fetchNui('showroomSwapVehicle', { model: target.vehicle_model, stockId: target.is_used ? target.id : undefined })
        }
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [data.dealershipId])

  // ── Auction fetching ──
  const loadAuctions = useCallback(() => {
    fetchNui<Auction[]>('getActiveAuctions', { dealershipId: data.dealershipId }).then((rows) => {
      setAuctions(Array.isArray(rows) ? rows : [])
    }).catch(() => {})
  }, [data.dealershipId])

  const loadAuctionState = useCallback((id: number) => {
    fetchNui<Auction & { bids?: [] }>('getAuctionState', { auctionId: id }).then((row) => {
      if (row) setSelectedAuction(row)
    }).catch(() => {})
  }, [])

  const loadPickups = useCallback(() => {
    fetchNui<typeof pendingPickups>('getPendingPickups').then((rows) => {
      setPendingPickups(Array.isArray(rows) ? rows : [])
    }).catch(() => {})
  }, [])

  const loadMyLoans = useCallback(() => {
    fetchNui<typeof myLoans>('getMyFinancing').then((rows) => {
      setMyLoans(Array.isArray(rows) ? rows : [])
    }).catch(() => {})
  }, [])

  useEffect(() => {
    loadAuctions()
    loadPickups()
    loadMyLoans()
    fetchNui<string | null>('getMyIdentifier').then((id) => setMyIdentifier(id ?? null)).catch(() => {})
    fetchNui<string | null>('getMyCharacterName').then((n) => setPlayerName(n ?? null)).catch(() => {})
    fetchNui<FinancingSettings | null>('getFinancingSettings', { dealershipId: data.dealershipId }).then((s) => {
      if (s) setFinancingSettings(s)
    }).catch(() => {})
  }, [loadAuctions, loadPickups, loadMyLoans, data.dealershipId])

  // Poll auctions + countdown tick when on auctions tab
  useEffect(() => {
    if (tab !== 'auctions') return
    const poll = setInterval(() => {
      loadAuctions()
      if (selectedAuction) loadAuctionState(selectedAuction.id)
    }, 2000)
    const tick = setInterval(() => setAuctionTick((v) => v + 1), 1000)
    return () => { clearInterval(poll); clearInterval(tick) }
  }, [tab, selectedAuction?.id, loadAuctions, loadAuctionState])

  useNuiEvent<{ auctionId: number }>('auctionUpdate', () => {
    loadAuctions()
    if (selectedAuction) loadAuctionState(selectedAuction.id)
  })

  const handleSelectAuction = useCallback((a: Auction) => {
    if (swapping || (selectedAuction && selectedAuction.id === a.id)) return
    setSelected(null)
    setSelectedAuction(null)
    setSwapping(true)
    setBidInput('')
    setBidError(null)
    fetchNui<Auction & { stock_metadata?: string | null }>('getAuctionState', { auctionId: a.id }).then((row) => {
      if (!row) return
      setSelectedAuction(row)
      return fetchNui('showroomSwapVehicle', {
        model: row.vehicle_model,
        properties: (row as unknown as { stock_metadata?: string }).stock_metadata ?? null,
      })
    }).finally(() => setSwapping(false))
  }, [swapping, selectedAuction])

  const handleBid = useCallback((overrideAmount?: number) => {
    if (!selectedAuction) return
    const amount = overrideAmount ?? parseInt(bidInput)
    if (!amount || amount <= 0) return
    setBidding(true)
    setBidError(null)
    fetchNui<{ success: boolean; message?: string }>('placeBid', { auctionId: selectedAuction.id, amount }).then((res) => {
      if (!res?.success) {
        setBidError(res?.message || t('error_bid_rejected'))
      } else {
        setBidInput('')
        loadAuctions()
        loadAuctionState(selectedAuction.id)
      }
    }).finally(() => setBidding(false))
  }, [selectedAuction, bidInput, loadAuctions, loadAuctionState])

  const handleSendToGarage = useCallback((auctionId: number) => {
    setClaimingId(auctionId)
    fetchNui<{ success: boolean; toGarage?: boolean }>('showroomClaimAuction', { auctionId, toGarage: true }).then((res) => {
      if (res?.success) loadPickups()
    }).finally(() => setClaimingId(null))
  }, [loadPickups])

  const handleClaimVehicle = useCallback((auctionId: number) => {
    setClaimingId(auctionId)
    setShowPickups(false)
    fetchNui<{ success: boolean }>('showroomClaimAuction', { auctionId }).then((res) => {
      if (res?.success) loadPickups()
    }).finally(() => setClaimingId(null))
  }, [loadPickups])

  const handleFinanceSign = useCallback((installments: number, paymentMethod: 'cash' | 'bank') => {
    if (!selected || !financingSettings) return
    setFinancingSigning(true)
    fetchNui('showroomFinance', {
      dealershipId: data.dealershipId,
      stockId: selected.id,
      downPayment: Math.floor(selected.retail_price * Math.round(financingSettings.minDownPercent) / 100),
      installments,
      paymentMethod,
      location: data.location,
    }).finally(() => {
      setFinancingSigning(false)
      setShowContract(false)
    })
  }, [selected, financingSettings, data.dealershipId, data.location])

  const handleLoanPayment = useCallback((financingId: number) => {
    fetchNui('makePayment', { financingId }).then(() => loadMyLoans())
  }, [loadMyLoans])

  const bidderLabel = useCallback((id: string | null | undefined) => {
    if (id && myIdentifier && id === myIdentifier) return t('label_you')
    return maskBidder(id)
  }, [myIdentifier])

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

  // Deselect when the current selection is no longer in the rendered list
  useEffect(() => {
    if (tab === 'auctions') {
      if (selectedAuction && !auctions.some((a) => a.id === selectedAuction.id)) {
        setSelectedAuction(null)
        fetchNui('showroomClearVehicle')
      }
    } else {
      if (selected) {
        const pool = tab === 'new' ? newStock : preOwnedStock
        if (!pool.some((s) => s.id === selected.id)) {
          setSelected(null)
          fetchNui('showroomClearVehicle')
        }
      }
    }
  })

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
      {/* Left sidebar — vehicle grid. Hidden in spot-view mode (customer walked
          up to a specific display vehicle — no cross-browsing here). */}
      {!data.spotViewStockId && (
      <div className="w-[340px] shrink-0 bg-black/90 flex flex-col border-r border-white/10 pointer-events-auto">
        {/* Header */}
        <div className="p-3 pb-2">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="text-white text-base font-bold">{data.dealershipName}</h1>
              <p className="text-white/40 text-xs">
                {tab === 'auctions' ? t('label_active_auctions', String(auctions.length)) : tab === 'preowned' ? t('label_preowned_available', String(visibleItems.length)) : t('label_new_available', String(visibleItems.length))}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {myLoans.length > 0 && (
                <button
                  onClick={() => setShowLoans(!showLoans)}
                  className={`h-7 px-2 rounded-md text-[11px] font-semibold flex items-center gap-1 transition-colors ${showLoans ? 'bg-blue-500/30 text-blue-300' : 'bg-blue-500/15 border border-blue-500/40 text-blue-400 hover:bg-blue-500/25'}`}
                >
                  <CreditCard className="h-3 w-3" /> {myLoans.length} {t('label_my_loans')}
                </button>
              )}
              {pendingPickups.length > 0 && (
                <button
                  onClick={() => setShowPickups(!showPickups)}
                  className={`h-7 px-2 rounded-md text-[11px] font-semibold flex items-center gap-1 transition-colors ${showPickups ? 'bg-emerald-500/30 text-emerald-300' : 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/25'}`}
                >
                  <Package className="h-3 w-3" /> {pendingPickups.length} {t('status_won')}
                </button>
              )}
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

          {/* New / Pre-owned / Auctions tabs */}
          <div className="flex gap-1 mb-2">
            <button
              onClick={() => { setTab('new'); setExpandedModel(null); setSelected(null); setSelectedAuction(null); fetchNui('showroomClearVehicle') }}
              className={`flex-1 h-7 rounded-md text-xs font-medium transition-colors ${tab === 'new' ? 'bg-accent text-accent-foreground' : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70'}`}
            >
              {t('tab_new')} ({newStock.length})
            </button>
            <button
              onClick={() => { setTab('preowned'); setExpandedModel(null); setSelected(null); setSelectedAuction(null); fetchNui('showroomClearVehicle') }}
              className={`flex-1 h-7 rounded-md text-xs font-medium transition-colors ${tab === 'preowned' ? 'bg-accent text-accent-foreground' : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70'}`}
            >
              {t('tab_preowned')} ({preOwnedStock.length})
            </button>
            <button
              onClick={() => { setTab('auctions'); setExpandedModel(null); setSelected(null); setSelectedAuction(null); fetchNui('showroomClearVehicle'); loadAuctions() }}
              className={`flex-1 h-7 rounded-md text-xs font-medium transition-colors flex items-center justify-center gap-1 ${tab === 'auctions' ? 'bg-amber-500/80 text-white' : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70'}`}
            >
              <Gavel className="h-3 w-3" /> {t('tab_auction')}{auctions.length > 0 ? ` (${auctions.length})` : ''}
            </button>
          </div>

          {/* Search + Filter button */}
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
                  <p className="text-[10px] uppercase tracking-wider text-white/40">{t('label_price_range')}</p>
                  {isPriceFiltered(priceRange) && (
                    <button
                      onClick={() => setPriceRange([0, maxRetailPrice])}
                      className="text-[9px] text-accent hover:text-accent/80"
                    >
                      {t('label_reset')}
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
              <p className="text-[10px] uppercase tracking-wider text-white/40 mb-1.5">{t('label_sort_by')}</p>
              <div className="flex flex-wrap gap-1">
                {([
                  ['name_asc', t('label_sort_az')],
                  ['name_desc', t('label_sort_za')],
                  ['price_asc', t('label_sort_price_low')],
                  ['price_desc', t('label_sort_price_high')],
                ] as [typeof sortBy, string][]).map(([value, label]) => (
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
                <p className="text-[10px] uppercase tracking-wider text-white/40 mb-1.5">{t('label_class')}</p>
                <div className="flex flex-wrap gap-1">
                  <button
                    onClick={() => setClassFilter('all')}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                      classFilter === 'all'
                        ? 'bg-accent text-accent-foreground'
                        : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60'
                    }`}
                  >
                    {t('label_all')}
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
            ) : tab === 'auctions' ? (() => {
              const filteredAuctions = auctions.filter((a) => {
                if (search) {
                  const q = search.toLowerCase()
                  if (!(a.vehicle_label || a.vehicle_model).toLowerCase().includes(q)) return false
                }
                if (classFilter !== 'all' && a.class !== classFilter) return false
                const price = a.current_bid ?? a.starting_bid
                if (isPriceFiltered(priceRange) && (price < priceRange[0] || price > priceRange[1])) return false
                return true
              })
              return filteredAuctions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-white/30">
                  <Gavel className="h-8 w-8 mb-2" />
                  <p className="text-xs">{t('empty_no_auctions')}</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {filteredAuctions.map((a) => {
                    const isAuctionSelected = selectedAuction?.id === a.id
                    const soon = isEndingSoon(a.ends_at, 30)
                    return (
                      <div
                        key={a.id}
                        className={`w-full flex items-center gap-2 p-2 rounded-md transition-colors ${isAuctionSelected ? 'bg-amber-500/15 ring-1 ring-amber-500/40' : 'bg-white/5 hover:bg-white/10'}`}
                      >
                        <button onClick={() => handleSelectAuction(a)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                          <VehicleImg
                            image={a.image}
                            model={a.vehicle_model}
                            alt={a.vehicle_label}
                            className="w-16 aspect-[16/9] object-contain rounded bg-black/50"
                            fallbackClassName="w-16 aspect-[16/9] bg-white/5 flex items-center justify-center rounded"
                            iconClassName="h-3 w-3 text-white/20"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-[11px] font-semibold truncate leading-tight">{a.vehicle_label || a.vehicle_model}</p>
                            <p className="text-amber-400 text-[11px] font-bold mt-0.5">{formatCurrency(a.current_bid ?? a.starting_bid)}</p>
                            <p className={`text-[10px] mt-0.5 ${soon ? 'text-rose-400 animate-pulse font-mono' : !a.ends_at ? 'text-amber-400/70' : 'text-white/50 font-mono'}`}>
                              {a.ends_at ? formatTimeRemaining(a.ends_at) : `${a.duration_minutes}m · ${t('label_starts_first_offer')}`}
                            </p>
                          </div>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setPickleFaxId(a.stock_id) }}
                          className="h-7 w-7 shrink-0 flex items-center justify-center rounded bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                          title={t('picklefax_title')}
                        >
                          <FileText className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )
            })() : visibleItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-white/30">
                <Car className="h-8 w-8 mb-2" />
                <p className="text-xs">{tab === 'preowned' ? t('empty_no_preowned') : t('empty_no_matching')}</p>
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
                          <p className="text-white/40 text-[10px] mt-0.5">{t('label_available', String(g.units.length))} · {t('label_pre_owned')}</p>
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
                                  <p className="text-white text-[11px] font-mono">{unit.plate || `— ${t('label_plate')} —`}</p>
                                  <p className="text-white/40 text-[10px]">{t('label_condition')}: {Math.round(Number(unit.condition) || 0)}%</p>
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setPickleFaxId(unit.id) }}
                                  className="h-7 w-7 shrink-0 flex items-center justify-center rounded bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                                  title={t('picklefax_title')}
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
      )}

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
          <p className="text-white/20 text-[10px] uppercase tracking-widest">{t('orbit_hint')}</p>
        </div>
      </div>

      {/* Bottom bar — purchase (stock) or bid (auction) */}
      {selectedAuction ? (() => {
        const bidFloor = nextBidFloor(selectedAuction)
        const endingSoon = isEndingSoon(selectedAuction.ends_at, 30)
        return (
          <div className={`fixed bottom-0 ${data.spotViewStockId ? 'left-0' : 'left-[340px]'} right-0 pointer-events-auto`}>
            <div className="bg-black/90 border-t border-amber-500/30 px-6 py-3 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-lg truncate leading-tight">{selectedAuction.vehicle_label || selectedAuction.vehicle_model}</p>
                <p className="text-white/40 text-xs">
                  {selectedAuction.current_bid ? `${t('label_current_bid')}: ${formatCurrency(selectedAuction.current_bid)} ${t('label_by_bidder', bidderLabel(selectedAuction.current_bidder))}` : t('label_no_bids_yet')}
                  {selectedAuction.bid_count != null && ` · ${t('label_bid_count', String(selectedAuction.bid_count))}`}
                </p>
              </div>

              <div className="text-right shrink-0">
                {selectedAuction.ends_at ? (
                  <p className={`text-lg font-mono font-bold ${endingSoon ? 'text-rose-400 animate-pulse' : 'text-white'}`}>{formatTimeRemaining(selectedAuction.ends_at)}</p>
                ) : (
                  <p className="text-sm text-amber-400">{selectedAuction.duration_minutes}m · {t('label_starts_first_offer')}</p>
                )}
              </div>

              <Input
                type="number"
                inputMode="numeric"
                placeholder={t('label_min_bid', formatCurrency(bidFloor))}
                value={bidInput}
                onChange={(e) => setBidInput(e.target.value)}
                className="w-32 h-9 bg-white/5 border-white/10 text-white text-sm shrink-0"
              />

              <div className="flex gap-1 shrink-0">
                {[0, 1, 2].map((mult) => {
                  const amt = bidFloor + selectedAuction.min_increment * mult
                  return (
                    <button key={mult} onClick={() => setBidInput(String(amt))} className="px-2 h-9 rounded-md bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-[11px] transition-colors">
                      {formatCurrency(amt)}
                    </button>
                  )
                })}
              </div>

              {bidError && <p className="text-rose-400 text-[10px] shrink-0">{bidError}</p>}

              <Button className="h-9 px-4 gap-1.5 bg-amber-600 hover:bg-amber-700 shrink-0" disabled={bidding || !bidInput} onClick={() => handleBid()}>
                <Gavel className="h-3.5 w-3.5" /> {t('btn_place_bid')}
              </Button>

              {selectedAuction.buyout_price != null && (
                <Button variant="outline" className="h-9 px-3 gap-1 border-amber-500/50 text-amber-400 hover:bg-amber-500/10 shrink-0" disabled={bidding} onClick={() => handleBid(selectedAuction.buyout_price!)}>
                  <Zap className="h-3 w-3" /> {formatCurrency(selectedAuction.buyout_price)}
                </Button>
              )}

              <button onClick={() => setPickleFaxId(selectedAuction.stock_id)} className="h-9 w-9 shrink-0 flex items-center justify-center rounded-md bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-colors" title={t('picklefax_title')}>
                <FileText className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )
      })() : selected ? (
        <div className={`fixed bottom-0 ${data.spotViewStockId ? 'left-0' : 'left-[340px]'} right-0 pointer-events-auto`}>
          <div className="bg-black/90 border-t border-white/10 px-6 py-3 flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-2xl truncate leading-tight">
                {selected.vehicle_label || selected.vehicle_model}
              </p>
              <p className="text-white/40 text-lg capitalize">{selected.class || t('label_vehicle')}</p>
            </div>

            <p className="text-accent font-bold text-lg shrink-0">{formatCurrency(selected.retail_price)}</p>

            {!selected.is_used && (
            <div className="flex items-center gap-1.5 shrink-0">
              <ColorSwatch
                label={t('label_primary_color')}
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
                label={t('label_secondary_color')}
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

            {data.pickerSpotId ? (
              <Button
                className="h-9 px-5 gap-2"
                onClick={() => {
                  fetchNui('setDisplaySpot', {
                    dealershipId: data.dealershipId,
                    location: data.location,
                    stockId: selected.id,
                    spot: data.pickerSpotId,
                  }).finally(() => fetchNui('showroomClose', {}))
                }}
              >
                {t('btn_place_here')}
              </Button>
            ) : (
              <>
                <Tabs
                  defaultValue="bank"
                  value={paymentMethod}
                  onValueChange={(v) => setPaymentMethod(v as typeof paymentMethod)}
                >
                  <TabsList className="h-9 bg-white/5 border border-white/10">
                    <TabsTrigger value="bank" className="gap-1.5 text-xs data-[state=active]:bg-white/10">
                      <CreditCard className="h-3.5 w-3.5" /> {t('label_bank')}
                    </TabsTrigger>
                    <TabsTrigger value="cash" className="gap-1.5 text-xs data-[state=active]:bg-white/10">
                      <Banknote className="h-3.5 w-3.5" /> {t('label_cash')}
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
                    t('btn_purchase')
                  )}
                </Button>

                {financingSettings?.financingEnabled && !selected.auction_id && (
                  <Button
                    variant="outline"
                    className="h-9 px-4 gap-1.5 border-white/20 text-white/80 hover:bg-white/10 hover:text-white"
                    onClick={() => { if (!selectedInstallments && financingSettings) setSelectedInstallments(financingSettings.installmentOptions[0] ?? 8); setShowContract(true) }}
                  >
                    <PenLine className="h-3.5 w-3.5" /> {t('btn_finance')}
                  </Button>
                )}

                {/* Test drives — new and pre-owned only. Auctions opt out. */}
                {!selected.auction_id && (
                  <Button
                    variant="outline"
                    className="h-9 px-4 gap-1.5 border-white/20 text-white/80 hover:bg-white/10 hover:text-white"
                    onClick={() => {
                      fetchNui('startTestDrive', {
                        dealershipId: data.dealershipId,
                        location: data.location,
                        model: selected.vehicle_model,
                        stockId: selected.id,
                      }).finally(() => fetchNui('showroomClose', {}))
                    }}
                  >
                    <Wind className="h-3.5 w-3.5" /> {t('btn_test_drive')}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      ) : null}

      {/* Financing contract dialog */}
      {showContract && selected && financingSettings && (
        <FinancingContractDialog
          vehicleLabel={selected.vehicle_label || selected.vehicle_model}
          vehicleModel={selected.vehicle_model}
          vehicleClass={selected.class}
          isUsed={!!selected.is_used}
          price={selected.retail_price}
          dealershipName={data.dealershipName}
          settings={financingSettings}
          initialInstallments={selectedInstallments ?? undefined}
          playerName={playerName ?? undefined}
          onSign={handleFinanceSign}
          onClose={() => setShowContract(false)}
          signing={financingSigning}
        />
      )}

      {/* My Loans panel */}
      {showLoans && myLoans.length > 0 && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setShowLoans(false)} />
          <div className="fixed top-12 left-[340px] z-[70] w-80 bg-black/95 border border-white/10 rounded-lg shadow-2xl overflow-hidden pointer-events-auto">
            <div className="p-3 border-b border-white/10 flex items-center justify-between">
              <p className="text-white text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                <CreditCard className="h-3.5 w-3.5 text-blue-400" /> {t('label_my_loans')}
              </p>
              <button onClick={() => setShowLoans(false)} className="text-white/40 hover:text-white"><X className="h-3.5 w-3.5" /></button>
            </div>
            <div className="max-h-64 overflow-auto divide-y divide-white/5">
              {myLoans.map((loan) => {
                const pct = loan.totalAmount > 0 ? Math.round((loan.amountPaid / loan.totalAmount) * 100) : 0
                return (
                  <div key={loan.id} className="p-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-white text-xs font-mono">{loan.vehiclePlate}</p>
                      <p className="text-white/40 text-[10px]">{t('label_paid', `${pct}%`)}</p>
                    </div>
                    <div className="h-1 bg-white/10 rounded-full overflow-hidden mb-1.5">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-white/50 text-[10px]">{t('label_left', formatCurrency(loan.remaining))}</p>
                      <Button size="sm" className="h-6 text-[10px] gap-1" onClick={() => handleLoanPayment(loan.id)}>
                        {t('btn_make_payment')} {formatCurrency(loan.installmentAmount)}
                      </Button>
                    </div>
                    {loan.missedPayments > 0 && (
                      <p className="text-rose-400 text-[10px] mt-1">{t('label_missed_payments', String(loan.missedPayments))}</p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      {/* Pending pickups panel */}
      {showPickups && pendingPickups.length > 0 && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setShowPickups(false)} />
          <div className="fixed top-12 left-[340px] z-[70] w-80 bg-black/95 border border-white/10 rounded-lg shadow-2xl overflow-hidden pointer-events-auto">
            <div className="p-3 border-b border-white/10 flex items-center justify-between">
              <p className="text-white text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5 text-emerald-400" /> {t('label_won_auctions')}
              </p>
              <button onClick={() => setShowPickups(false)} className="text-white/40 hover:text-white"><X className="h-3.5 w-3.5" /></button>
            </div>
            <div className="max-h-64 overflow-auto divide-y divide-white/5">
              {pendingPickups.map((p) => {
                const isClaiming = claimingId === p.id
                return (
                  <div key={p.id} className="p-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-white text-xs font-semibold">{p.vehicle_label || p.vehicle_model}</p>
                      <p className="text-emerald-400 text-xs font-bold">{formatCurrency(p.winning_bid)}</p>
                    </div>
                    <p className="text-white/40 text-[10px] mb-2">{p.dealership_name}{p.plate ? ` · ${p.plate}` : ''}</p>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => handleSendToGarage(p.id)}
                        disabled={isClaiming}
                        className="flex-1 h-7 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white text-[11px] font-medium flex items-center justify-center gap-1 transition-colors disabled:opacity-50"
                      >
                        <Warehouse className="h-3 w-3" /> {t('btn_send_to_garage')}
                      </button>
                      <button
                        onClick={() => handleClaimVehicle(p.id)}
                        disabled={isClaiming}
                        className="flex-1 h-7 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-medium flex items-center justify-center gap-1 transition-colors disabled:opacity-50"
                      >
                        <Car className="h-3 w-3" /> {t('btn_claim_vehicle')}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
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
