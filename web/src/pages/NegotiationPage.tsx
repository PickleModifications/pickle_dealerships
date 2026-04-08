import { useState, useEffect, useCallback } from 'react'
import { Button } from '../components/ui/button'
import { fetchNui, formatCurrency } from '../lib/utils'
import { X, HandCoins, Sparkles, ThumbsUp, UserX, Loader2 } from 'lucide-react'
import type { NPCProfile, StockItem } from '../types'
import VehicleImg from '../components/VehicleImg'

interface Props {
  profile: NPCProfile | null
  greeting: string
  onClose: () => void
}

interface NegotiationState {
  phase: 'greeting' | 'presenting' | 'negotiating' | 'completed' | 'failed'
  subtitle: string
  currentOffer: number
  askingPrice: number
  round: number
  maxRounds: number
  selectedVehicle: StockItem | null
  presentationsLeft: number
}

const tactics = [
  { id: 'concession', label: 'Negotiate', icon: <HandCoins className="h-4 w-4" />, desc: 'Make a small concession' },
  { id: 'highlight_features', label: 'Persuade', icon: <Sparkles className="h-4 w-4" />, desc: 'Highlight the vehicle' },
  { id: 'final_offer', label: 'Final Offer', icon: <ThumbsUp className="h-4 w-4" />, desc: 'Take it or leave it' },
]

export default function NegotiationPage({ profile, greeting, onClose }: Props) {
  const [state, setState] = useState<NegotiationState>({
    phase: 'greeting',
    subtitle: greeting || '',
    currentOffer: 0,
    askingPrice: 0,
    round: 0,
    maxRounds: profile?.maxRounds ?? 5,
    selectedVehicle: null,
    presentationsLeft: profile?.maxPresentations ?? 3,
  })
  const [stock, setStock] = useState<StockItem[]>([])
  const [processing, setProcessing] = useState(false)
  const [showStock, setShowStock] = useState(false)
  const [subtitleFade, setSubtitleFade] = useState(true)

  // Fade in subtitle when it changes
  useEffect(() => {
    setSubtitleFade(false)
    const t = setTimeout(() => setSubtitleFade(true), 50)
    return () => clearTimeout(t)
  }, [state.subtitle])

  useEffect(() => {
    fetchNui<StockItem[] | { stock: StockItem[] }>('getStock', {}).then((res) => {
      if (Array.isArray(res)) setStock(res.filter((s) => !s.sold_at && s.delivered_at))
      else if (res && 'stock' in res) setStock(res.stock.filter((s: StockItem) => !s.sold_at && s.delivered_at))
    })
  }, [])

  const showSubtitle = useCallback((text: string) => {
    setState((prev) => ({ ...prev, subtitle: text }))
  }, [])

  const handlePresent = useCallback((item: StockItem) => {
    if (processing || state.presentationsLeft <= 0) return
    setProcessing(true)
    setShowStock(false)

    fetchNui<{ success: boolean; quality: string; score: number; dialogue: string; openingOffer?: number }>('presentVehicle', {
      stockItem: item,
    }).then((res) => {
      if (res.success) {
        setState((prev) => ({
          ...prev,
          phase: 'negotiating',
          selectedVehicle: item,
          askingPrice: item.retail_price,
          currentOffer: res.openingOffer ?? Math.round(item.retail_price * (res.score / 100)),
          presentationsLeft: prev.presentationsLeft - 1,
          subtitle: res.dialogue,
        }))
      }
      setProcessing(false)
    }).catch(() => setProcessing(false))
  }, [processing, state.presentationsLeft])

  const handleTactic = useCallback((tacticId: string) => {
    if (processing || !state.selectedVehicle) return
    setProcessing(true)

    fetchNui<{
      success: boolean
      newOffer: number
      reaction: string
      emotionState: string
      dialogue: string
      roundOver: boolean
      saleComplete: boolean
      maxRounds?: number
    }>('negotiate', {
      stockId: state.selectedVehicle.id,
      tactic: tacticId,
      currentOffer: state.currentOffer,
      round: state.round + 1,
    }).then((res) => {
      if (res.success) {
        if (res.saleComplete) {
          setState((prev) => ({
            ...prev,
            phase: 'completed',
            currentOffer: res.newOffer,
            subtitle: res.dialogue,
          }))
          fetchNui('completeNPCSale', {
            stockId: state.selectedVehicle!.id,
            saleAmount: res.newOffer,
          })
        } else if (res.reaction === 'walkaway') {
          setState((prev) => ({
            ...prev,
            phase: 'failed',
            subtitle: res.dialogue || 'The customer walks away.',
          }))
        } else {
          setState((prev) => ({
            ...prev,
            currentOffer: res.newOffer,
            round: prev.round + 1,
            maxRounds: res.maxRounds ?? prev.maxRounds,
            subtitle: res.dialogue,
          }))
        }
      }
      setProcessing(false)
    }).catch(() => setProcessing(false))
  }, [processing, state.selectedVehicle, state.currentOffer, state.round])

  const handleDismiss = useCallback(() => {
    fetchNui('dismissNPC', {})
    onClose()
  }, [onClose])

  if (!profile) return null

  const isEnded = state.phase === 'completed' || state.phase === 'failed'

  return (
    <div className="fixed inset-0 pointer-events-none flex flex-col">
      {/* Top right — close/dismiss button */}
      <div className="flex justify-end p-6 pointer-events-auto">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 bg-black/40 hover:bg-black/60 text-white/70 hover:text-white rounded-full"
          onClick={handleDismiss}
          title="Dismiss customer"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom section — subtitle + controls */}
      <div className="pointer-events-auto">
        {/* Subtitle */}
        <div className="flex justify-center mb-4 px-8">
          <div className={`max-w-2xl transition-opacity duration-300 ${subtitleFade ? 'opacity-100' : 'opacity-0'}`}>
            <p className="text-white text-center text-lg font-medium drop-shadow-lg leading-relaxed px-6 py-3 bg-black/50 rounded-lg">
              {state.subtitle}
            </p>
          </div>
        </div>

        {/* Controls bar */}
        <div className="bg-black/70 border-t border-white/10 px-8 py-4">
          {/* Greeting / presenting phase */}
          {(state.phase === 'greeting' || state.phase === 'presenting') && (
            <div className="flex items-center justify-center gap-3">
              <Button
                className="gap-2"
                onClick={() => setShowStock(!showStock)}
                disabled={state.presentationsLeft <= 0}
              >
                Present Vehicle ({state.presentationsLeft} left)
              </Button>
              <Button
                variant="ghost"
                className="gap-2 text-white/50 hover:text-white"
                onClick={handleDismiss}
              >
                <UserX className="h-4 w-4" /> Dismiss
              </Button>
            </div>
          )}

          {/* Negotiating phase */}
          {state.phase === 'negotiating' && (
            <div className="flex items-center justify-between max-w-3xl mx-auto">
              {/* Offer info */}
              <div className="flex items-center gap-6">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-white/40">Their Offer</p>
                  <p className="text-xl font-bold text-white">{formatCurrency(state.currentOffer)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-white/40">Asking</p>
                  <p className="text-xl font-bold text-accent">{formatCurrency(state.askingPrice)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-white/40">Round</p>
                  <p className="text-sm text-white/60">{state.round + 1} / {state.maxRounds}</p>
                </div>
              </div>

              {/* Tactics */}
              <div className="flex items-center gap-2">
                {tactics.map((tactic) => (
                  <Button
                    key={tactic.id}
                    variant="outline"
                    size="sm"
                    disabled={processing}
                    onClick={() => handleTactic(tactic.id)}
                    className="gap-2 bg-white/5 border-white/10 text-white hover:bg-white/10 h-9"
                  >
                    {tactic.icon}
                    {tactic.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Completed / Failed */}
          {isEnded && (
            <div className="flex items-center justify-center gap-4">
              <p className={`text-sm font-medium ${state.phase === 'completed' ? 'text-emerald-400' : 'text-red-400'}`}>
                {state.phase === 'completed'
                  ? `Sale completed for ${formatCurrency(state.currentOffer)}!`
                  : 'Customer walked away. No sale.'}
              </p>
              <Button variant="outline" size="sm" onClick={handleDismiss} className="bg-white/5 border-white/10 text-white hover:bg-white/10">
                Close
              </Button>
            </div>
          )}
        </div>

        {/* Vehicle selection overlay */}
        {showStock && (
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-black/90 border border-white/10 rounded-lg p-3 max-w-xl w-full max-h-64 overflow-auto">
            <div className="grid grid-cols-2 gap-2">
              {stock.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handlePresent(item)}
                  disabled={processing}
                  className="flex items-center gap-2.5 p-2 rounded-md bg-white/5 hover:bg-white/10 text-left transition-colors"
                >
                  <VehicleImg
                    image={item.image}
                    model={item.vehicle_model}
                    alt={item.vehicle_label}
                    className="h-10 w-16 object-contain rounded bg-black/30 shrink-0"
                    fallbackClassName="h-10 w-16 rounded bg-black/30 flex items-center justify-center shrink-0"
                    iconClassName="h-4 w-4 text-white/20"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-white text-xs font-semibold truncate">{item.vehicle_label || item.vehicle_model}</p>
                    <p className="text-accent text-xs font-bold">{formatCurrency(item.retail_price)}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
