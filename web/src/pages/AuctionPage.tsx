import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs'
import { fetchNui, formatCurrency } from '../lib/utils'
import { t } from '../lib/locale'
import { useNuiEvent } from '../hooks/useNuiEvent'
import { X, Gavel, Flame, Package, FileText, Clock, Zap } from 'lucide-react'
import VehicleImg from '../components/VehicleImg'
import { PickleFaxDialog } from '../components/PickleFax'
import { formatTimeRemaining, isEndingSoon, nextBidFloor, maskBidder } from '../lib/auction'
import type { DealershipData, Auction } from '../types'

interface Props {
  data: DealershipData
  onClose: () => void
}

type Tab = 'live' | 'ending' | 'pickups'

interface PendingPickup {
  id: number
  vehicle_model: string
  vehicle_label: string
  winning_bid: number
  dealership_name: string
  plate?: string | null
}

export default function AuctionPage({ onClose }: Props) {
  const [auctions, setAuctions] = useState<Auction[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [selected, setSelected] = useState<(Auction & { bids?: Array<{ id: number; bidder_identifier: string; amount: number; placed_at: string; refunded: number }> }) | null>(null)
  const [tab, setTab] = useState<Tab>('live')
  const [pickups, setPickups] = useState<PendingPickup[]>([])
  const [bidInput, setBidInput] = useState('')
  const [bidding, setBidding] = useState(false)
  const [bidError, setBidError] = useState<string | null>(null)
  const [, setTick] = useState(0)
  const [pickleFaxStockId, setPickleFaxStockId] = useState<number | null>(null)
  const [myIdentifier, setMyIdentifier] = useState<string | null>(null)

  useEffect(() => {
    fetchNui<string | null>('getMyIdentifier').then((id) => setMyIdentifier(id ?? null)).catch(() => {})
  }, [])

  const bidderLabel = useCallback((id: string | null | undefined) => {
    if (id && myIdentifier && id === myIdentifier) return 'you'
    return maskBidder(id)
  }, [myIdentifier])

  const draggingRef = useRef(false)
  const lastMouseRef = useRef<{ x: number; y: number } | null>(null)
  const modalOpenRef = useRef(false)
  useEffect(() => { modalOpenRef.current = pickleFaxStockId !== null }, [pickleFaxStockId])

  const loadAuctions = useCallback(() => {
    fetchNui<Auction[]>('getActiveAuctions').then((rows) => {
      setAuctions(Array.isArray(rows) ? rows : [])
    }).catch(() => {})
  }, [])

  const loadPickups = useCallback(() => {
    fetchNui<PendingPickup[]>('getPendingPickups').then((rows) => {
      setPickups(Array.isArray(rows) ? rows : [])
    }).catch(() => {})
  }, [])

  const loadSelected = useCallback((id: number) => {
    fetchNui<Auction & { bids?: [] }>('getAuctionState', { auctionId: id }).then((row) => {
      if (row) setSelected(row)
    }).catch(() => {})
  }, [])

  // Initial load
  useEffect(() => {
    loadAuctions()
    loadPickups()
  }, [loadAuctions, loadPickups])

  // Auto-select the first lot when list changes and nothing selected
  useEffect(() => {
    if (selectedId === null && auctions.length > 0) {
      setSelectedId(auctions[0].id)
    }
  }, [auctions, selectedId])

  // When selection changes, fetch full state once + swap showcase vehicle with proper props.
  // Dependency is ONLY selectedId — polling-driven list updates must not retrigger a respawn.
  useEffect(() => {
    if (selectedId === null) return
    fetchNui<Auction & { stock_metadata?: string | null }>('getAuctionState', { auctionId: selectedId }).then((row) => {
      if (!row) return
      setSelected(row)
      fetchNui('auctionSwapVehicle', {
        model: row.vehicle_model,
        properties: row.stock_metadata ?? null,
        class: row.class || 'sedan',
      })
    })
  }, [selectedId])

  // Poll selected + refresh list every 2s
  useEffect(() => {
    const poll = setInterval(() => {
      loadAuctions()
      if (selectedId !== null) loadSelected(selectedId)
      if (tab === 'pickups') loadPickups()
    }, 2000)
    return () => clearInterval(poll)
  }, [selectedId, tab, loadAuctions, loadSelected, loadPickups])

  // Countdown tick every second
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 1000)
    return () => clearInterval(t)
  }, [])

  // Live update from server broadcast
  useNuiEvent<{ auctionId: number }>('auctionUpdate', (payload) => {
    loadAuctions()
    if (selectedId !== null && payload?.auctionId === selectedId) loadSelected(selectedId)
  })

  // Orbit-camera drag
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (modalOpenRef.current) return
      if (e.button !== 0) return
      if (e.clientX < 320 || e.clientX > window.innerWidth - 360) return
      draggingRef.current = true
      lastMouseRef.current = { x: e.clientX, y: e.clientY }
      fetchNui('auctionOrbitInput', { dragging: true })
    }
    const handleMouseUp = () => {
      if (!draggingRef.current) return
      draggingRef.current = false
      lastMouseRef.current = null
      fetchNui('auctionOrbitInput', { dragging: false })
    }
    const handleMouseMove = (e: MouseEvent) => {
      if (modalOpenRef.current) return
      if (!draggingRef.current || !lastMouseRef.current) return
      const dx = e.clientX - lastMouseRef.current.x
      const dy = e.clientY - lastMouseRef.current.y
      lastMouseRef.current = { x: e.clientX, y: e.clientY }
      if (dx === 0 && dy === 0) return
      fetchNui('auctionOrbitInput', { lookX: dx, lookY: dy })
    }
    const handleWheel = (e: WheelEvent) => {
      if (modalOpenRef.current) return
      if (e.clientX < 320 || e.clientX > window.innerWidth - 360) return
      const delta = e.deltaY > 0 ? -1 : 1
      fetchNui('auctionOrbitInput', { zoom: delta })
    }
    window.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('wheel', handleWheel)
    return () => {
      window.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('wheel', handleWheel)
    }
  }, [])

  const handleClose = useCallback(() => {
    fetchNui('auctionClose', {})
    onClose()
  }, [onClose])

  const handleBid = (overrideAmount?: number) => {
    if (!selected) return
    const amount = overrideAmount ?? parseInt(bidInput)
    if (!amount || amount <= 0) return
    setBidding(true)
    setBidError(null)
    fetchNui<{ success: boolean; result?: { extended: boolean; buyout: boolean }; message?: string }>('placeBid', {
      auctionId: selected.id,
      amount,
    }).then((res) => {
      if (!res?.success) {
        setBidError(res?.message || 'Bid rejected.')
      } else {
        setBidInput('')
        loadSelected(selected.id)
        loadAuctions()
      }
    }).finally(() => setBidding(false))
  }

  const handleClaim = (auctionId: number) => {
    fetchNui('claimAuctionVehicle', { auctionId }).then(() => {
      loadPickups()
    })
  }

  const filteredList: Auction[] = (() => {
    if (tab === 'ending') return auctions.filter((a) => isEndingSoon(a.ends_at, 60))
    return auctions
  })()

  const bidFloor = selected ? nextBidFloor(selected) : 0
  const endingSoon = selected ? isEndingSoon(selected.ends_at, 30) : false

  return (
    <div className="fixed inset-0 flex">
      {/* Left sidebar */}
      <div className="w-80 shrink-0 bg-black/90 flex flex-col border-r border-white/10 pointer-events-auto">
        <div className="p-3 pb-2">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Gavel className="h-4 w-4 text-accent" />
              <h1 className="text-white text-sm font-bold uppercase tracking-wider">{t('title_auction_house')}</h1>
            </div>
            <Button variant="ghost" size="icon" onClick={handleClose} className="h-7 w-7 text-white/60 hover:text-white hover:bg-white/10">
              <X className="h-4 w-4" />
            </Button>
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
            <TabsList className="h-8 w-full grid grid-cols-3 bg-white/5">
              <TabsTrigger value="live" className="text-[10px] gap-1 data-[state=active]:bg-white/10"><Flame className="h-3 w-3" /> {t('tab_live')}</TabsTrigger>
              <TabsTrigger value="ending" className="text-[10px] gap-1 data-[state=active]:bg-white/10"><Clock className="h-3 w-3" /> {t('tab_ending')}</TabsTrigger>
              <TabsTrigger value="pickups" className="text-[10px] gap-1 data-[state=active]:bg-white/10"><Package className="h-3 w-3" /> {t('tab_pickups')} {pickups.length > 0 && <span className="text-accent">({pickups.length})</span>}</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex-1 overflow-auto px-2 pb-3">
          {tab === 'pickups' ? (
            pickups.length === 0 ? (
              <p className="text-white/40 text-xs text-center mt-6">{t('empty_no_pickups')}</p>
            ) : (
              <div className="space-y-1.5">
                {pickups.map((p) => (
                  <div key={p.id} className="rounded-md bg-white/5 p-2">
                    <p className="text-white text-xs font-semibold">{p.vehicle_label || p.vehicle_model}</p>
                    <p className="text-white/40 text-[10px]">{p.dealership_name}</p>
                    <div className="flex items-center justify-between mt-1.5">
                      <p className="text-accent text-xs font-bold">{formatCurrency(p.winning_bid)}</p>
                      <Button size="sm" className="h-6 text-[10px]" onClick={() => handleClaim(p.id)}>{t('btn_claim_vehicle')}</Button>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : filteredList.length === 0 ? (
            <p className="text-white/40 text-xs text-center mt-6">{tab === 'ending' ? t('empty_no_lots_ending') : t('empty_no_auctions')}</p>
          ) : (
            <div className="space-y-1.5">
              {filteredList.map((a) => {
                const isSelected = a.id === selectedId
                const soon = isEndingSoon(a.ends_at, 30)
                return (
                  <button
                    key={a.id}
                    onClick={() => setSelectedId(a.id)}
                    className={`w-full flex items-center gap-2 p-2 rounded-md text-left transition-colors ${isSelected ? 'bg-accent/15 ring-1 ring-accent/40' : 'bg-white/5 hover:bg-white/10'}`}
                  >
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
                      <p className="text-accent text-[11px] font-bold mt-0.5">{formatCurrency(a.current_bid ?? a.starting_bid)}</p>
                      <p className={`text-[10px] mt-0.5 ${soon ? 'text-rose-400 animate-pulse font-mono' : !a.ends_at ? 'text-amber-400' : 'text-white/50 font-mono'}`}>
                        {a.ends_at ? formatTimeRemaining(a.ends_at) : `${a.duration_minutes}m · ${t('label_starts_first_offer')}`}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Center — transparent game viewport */}
      <div className="flex-1 relative pointer-events-auto cursor-grab active:cursor-grabbing" />

      {/* Right sidebar */}
      <div className="w-[360px] shrink-0 bg-black/90 flex flex-col border-l border-white/10 pointer-events-auto">
        {selected ? (
          <>
            <div className="p-4 border-b border-white/10">
              <p className="text-white/50 text-[10px] uppercase tracking-wider">{t('label_now_auctioning')}</p>
              <h2 className="text-white text-lg font-bold leading-tight mt-0.5">{selected.vehicle_label || selected.vehicle_model}</h2>
              <p className="text-white/40 text-xs mt-0.5">{selected.dealership_name}</p>
              <button
                onClick={() => setPickleFaxStockId(selected.stock_id)}
                className="mt-2 w-full h-7 rounded-md bg-accent/10 border border-accent/40 text-accent hover:bg-accent/20 text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors"
              >
                <FileText className="h-3 w-3" /> {t('picklefax_title')}
              </button>
            </div>

            <div className="p-4 border-b border-white/10">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-white/50 text-[10px] uppercase tracking-wider">{t('label_current_bid')}</p>
                  <p className="text-accent text-3xl font-black tracking-tight">{formatCurrency(selected.current_bid ?? selected.starting_bid)}</p>
                  <p className="text-white/40 text-[10px] mt-0.5">
                    {selected.current_bid ? t('label_by_bidder', bidderLabel(selected.current_bidder)) : t('label_no_bids_yet')}
                    {selected.bid_count != null && ` • ${t('label_bid_count', String(selected.bid_count))}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-white/50 text-[10px] uppercase tracking-wider">
                    {selected.ends_at ? t('label_ends_in') : t('label_duration')}
                  </p>
                  {selected.ends_at ? (
                    <p className={`text-2xl font-mono font-bold ${endingSoon ? 'text-rose-400 animate-pulse' : 'text-white'}`}>{formatTimeRemaining(selected.ends_at)}</p>
                  ) : (
                    <>
                      <p className="text-2xl font-mono font-bold text-white/70">{selected.duration_minutes}m</p>
                      <p className="text-[10px] text-amber-400 mt-0.5">{t('label_starts_first_offer')}</p>
                    </>
                  )}
                </div>
              </div>
              {selected.reserve_price != null && (
                <p className={`text-[10px] mt-1.5 ${selected.reserve_met ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {selected.reserve_met ? `✓ ${t('label_reserve_met')}` : `• ${t('label_reserve_not_met')}`}
                </p>
              )}
            </div>

            <div className="p-4 border-b border-white/10">
              <label className="text-white/50 text-[10px] uppercase tracking-wider">{t('label_your_bid')}</label>
              <Input
                type="number"
                inputMode="numeric"
                placeholder={t('label_min_bid', formatCurrency(bidFloor))}
                value={bidInput}
                onChange={(e) => setBidInput(e.target.value)}
                className="mt-1 bg-white/5 border-white/10 text-white"
              />
              <div className="flex gap-1 mt-2">
                {[1, 2, 5].map((mult) => {
                  const amt = bidFloor + selected.min_increment * (mult - 1)
                  return (
                    <button
                      key={mult}
                      onClick={() => setBidInput(String(amt))}
                      className="flex-1 text-[10px] py-1 rounded bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors"
                    >
                      {formatCurrency(amt)}
                    </button>
                  )
                })}
              </div>

              {bidError && <p className="text-rose-400 text-[11px] mt-2">{bidError}</p>}

              <Button className="w-full mt-3" disabled={bidding || !bidInput} onClick={() => handleBid()}>
                <Gavel className="h-3 w-3 mr-1" /> {t('btn_place_bid')}
              </Button>

              {selected.buyout_price != null && (
                <Button variant="outline" className="w-full mt-2 border-amber-500/50 text-amber-400 hover:bg-amber-500/10" disabled={bidding} onClick={() => handleBid(selected.buyout_price!)}>
                  <Zap className="h-3 w-3 mr-1" /> {t('btn_buyout')} {formatCurrency(selected.buyout_price)}
                </Button>
              )}
            </div>

            <div className="flex-1 overflow-auto p-4">
              <p className="text-white/50 text-[10px] uppercase tracking-wider mb-2">{t('label_bid_history')}</p>
              {!selected.bids || selected.bids.length === 0 ? (
                <p className="text-white/30 text-xs">{t('label_no_bids_first')}</p>
              ) : (
                <div className="space-y-1">
                  {selected.bids.map((b) => (
                    <div key={b.id} className="flex justify-between text-xs border-b border-white/5 pb-1">
                      <span className="text-white/50 font-mono">{bidderLabel(b.bidder_identifier)}</span>
                      <span className={b.refunded ? 'text-white/30 line-through' : 'text-white font-semibold'}>{formatCurrency(b.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-white/40 text-sm px-6 text-center">
            {auctions.length === 0 ? t('empty_no_active_auctions_now') : t('empty_select_auction')}
          </div>
        )}
      </div>

      {pickleFaxStockId !== null && (
        <PickleFaxDialog stockId={pickleFaxStockId} mode="customer" onClose={() => setPickleFaxStockId(null)} />
      )}
    </div>
  )
}
