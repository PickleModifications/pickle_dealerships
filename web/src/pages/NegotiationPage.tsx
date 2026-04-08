import { useState, useEffect } from 'react'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { ScrollArea } from '../components/ui/scroll-area'
import { Separator } from '../components/ui/separator'
import { Progress } from '../components/ui/progress'
import { fetchNui, formatCurrency, getVehicleImage } from '../lib/utils'
import {
  X, MessageCircle, HandCoins, Shield, Sparkles, Clock, Target,
  ThumbsUp, Candy, UserX, Car
} from 'lucide-react'
import type { NPCProfile, StockItem } from '../types'

interface Props {
  profile: NPCProfile | null
  greeting: string
  onClose: () => void
}

interface NegotiationState {
  phase: 'greeting' | 'presenting' | 'negotiating' | 'completed' | 'failed'
  dialogue: string[]
  currentOffer: number
  askingPrice: number
  round: number
  maxRounds: number
  emotionState: string
  selectedVehicle: StockItem | null
  matchQuality: string
  presentationsLeft: number
}

const tactics = [
  { id: 'stand_firm', label: 'Stand Firm', icon: <Shield className="h-4 w-4" />, desc: 'Hold your price' },
  { id: 'concession', label: 'Small Concession', icon: <HandCoins className="h-4 w-4" />, desc: 'Drop price 3-5%' },
  { id: 'highlight_features', label: 'Highlight Features', icon: <Sparkles className="h-4 w-4" />, desc: 'Emphasize vehicle strengths' },
  { id: 'urgency', label: 'Create Urgency', icon: <Clock className="h-4 w-4" />, desc: 'Someone else is interested...' },
  { id: 'sweeten', label: 'Sweeten the Deal', icon: <Candy className="h-4 w-4" />, desc: 'Offer a freebie' },
  { id: 'match_need', label: 'Match Their Need', icon: <Target className="h-4 w-4" />, desc: 'Reference their preferences' },
  { id: 'final_offer', label: 'Final Offer', icon: <ThumbsUp className="h-4 w-4" />, desc: 'Take it or leave it' },
]

const emotionColors: Record<string, string> = {
  satisfied: 'text-emerald-400',
  interested: 'text-blue-400',
  neutral: 'text-zinc-400',
  annoyed: 'text-orange-400',
  ready_to_buy: 'text-accent',
}

export default function NegotiationPage({ profile, greeting, onClose }: Props) {
  const [state, setState] = useState<NegotiationState>({
    phase: 'greeting',
    dialogue: greeting ? [greeting] : [],
    currentOffer: 0,
    askingPrice: 0,
    round: 0,
    maxRounds: profile?.maxRounds ?? 5,
    emotionState: 'neutral',
    selectedVehicle: null,
    matchQuality: '',
    presentationsLeft: profile?.maxPresentations ?? 3,
  })
  const [stock, setStock] = useState<StockItem[]>([])
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    fetchNui<StockItem[] | { stock: StockItem[] }>('getStock', {}).then((res) => {
      if (Array.isArray(res)) setStock(res.filter((s) => !s.sold_at && s.delivered_at))
      else if (res && 'stock' in res) setStock(res.stock.filter((s: StockItem) => !s.sold_at && s.delivered_at))
    })
  }, [])

  const handlePresent = (item: StockItem) => {
    if (processing || state.presentationsLeft <= 0) return
    setProcessing(true)

    fetchNui<{ success: boolean; quality: string; score: number; dialogue: string; openingOffer?: number }>('presentVehicle', {
      stockItem: item,
    }).then((res) => {
      if (res.success) {
        setState((prev) => ({
          ...prev,
          phase: 'negotiating',
          selectedVehicle: item,
          matchQuality: res.quality,
          askingPrice: item.retail_price,
          currentOffer: res.openingOffer ?? Math.round(item.retail_price * (res.score / 100)),
          presentationsLeft: prev.presentationsLeft - 1,
          dialogue: [...prev.dialogue, `You present the ${item.vehicle_label || item.vehicle_model}`, res.dialogue],
        }))
      }
      setProcessing(false)
    }).catch(() => setProcessing(false))
  }

  const handleTactic = (tacticId: string) => {
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
        const newDialogue = [...state.dialogue, `You use: ${tacticId.replace('_', ' ')}`, res.dialogue]

        if (res.saleComplete) {
          setState((prev) => ({
            ...prev,
            phase: 'completed',
            currentOffer: res.newOffer,
            dialogue: newDialogue,
            emotionState: res.emotionState,
          }))
          fetchNui('completeNPCSale', {
            stockId: state.selectedVehicle!.id,
            saleAmount: res.newOffer,
          })
        } else if (res.reaction === 'walkaway') {
          setState((prev) => ({
            ...prev,
            phase: 'failed',
            dialogue: [...newDialogue, 'The customer walks away.'],
            emotionState: res.emotionState,
          }))
        } else {
          setState((prev) => ({
            ...prev,
            currentOffer: res.newOffer,
            round: prev.round + 1,
            maxRounds: res.maxRounds ?? prev.maxRounds,
            dialogue: newDialogue,
            emotionState: res.emotionState,
          }))
        }
      }
      setProcessing(false)
    }).catch(() => setProcessing(false))
  }

  const handleDismiss = () => {
    fetchNui('dismissNPC', {})
    onClose()
  }

  if (!profile) return null

  return (
    <>
      <div className="flex items-center justify-between p-5 pb-0">
        <div>
          <h1 className="text-xl font-bold">Customer Interaction</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="secondary" className="capitalize">{profile.personality}</Badge>
            <Badge variant="outline" className="capitalize">{profile.budgetTier}</Badge>
            {profile.typePreference && (
              <Badge variant="outline" className="capitalize">Wants: {profile.typePreference}</Badge>
            )}
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={handleDismiss}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      <Separator className="mt-4" />

      <div className="flex-1 flex overflow-hidden">
        {/* Dialogue panel */}
        <div className="flex-1 flex flex-col border-r border-border">
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-3">
              {state.dialogue.map((msg, i) => (
                <div
                  key={i}
                  className={`p-3 rounded-lg text-sm ${
                    i % 2 === 0
                      ? 'bg-muted/50 ml-0 mr-8'
                      : 'bg-accent/10 border border-accent/20 ml-8 mr-0'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <MessageCircle className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                    <p>{msg}</p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          {state.phase === 'negotiating' && (
            <div className="p-4 border-t border-border">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs text-muted-foreground">Their Offer</p>
                  <p className="text-lg font-bold">{formatCurrency(state.currentOffer)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Mood</p>
                  <p className={`text-sm font-medium capitalize ${emotionColors[state.emotionState] || ''}`}>
                    {state.emotionState.replace('_', ' ')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Asking Price</p>
                  <p className="text-lg font-bold text-accent">{formatCurrency(state.askingPrice)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                <span>Round {state.round + 1} / {state.maxRounds}</span>
                <Progress value={((state.round + 1) / state.maxRounds) * 100} className="flex-1 h-1" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {tactics.map((tactic) => (
                  <Button
                    key={tactic.id}
                    variant="outline"
                    size="sm"
                    disabled={processing}
                    onClick={() => handleTactic(tactic.id)}
                    className="justify-start gap-2 h-auto py-2"
                  >
                    {tactic.icon}
                    <div className="text-left">
                      <p className="text-xs font-medium">{tactic.label}</p>
                      <p className="text-[10px] text-muted-foreground">{tactic.desc}</p>
                    </div>
                  </Button>
                ))}
              </div>
            </div>
          )}

          {(state.phase === 'completed' || state.phase === 'failed') && (
            <div className={`p-4 border-t ${state.phase === 'completed' ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
              <p className={`text-sm font-medium ${state.phase === 'completed' ? 'text-emerald-400' : 'text-red-400'}`}>
                {state.phase === 'completed'
                  ? `Sale completed for ${formatCurrency(state.currentOffer)}!`
                  : 'Customer walked away. No sale.'}
              </p>
              <Button variant="outline" size="sm" className="mt-2" onClick={handleDismiss}>
                Close
              </Button>
            </div>
          )}
        </div>

        {/* Vehicle selection panel */}
        {(state.phase === 'greeting' || state.phase === 'presenting') && (
          <div className="w-72 flex flex-col">
            <div className="p-3 border-b border-border">
              <p className="text-sm font-medium">Select Vehicle to Present</p>
              <p className="text-xs text-muted-foreground">{state.presentationsLeft} presentations left</p>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-3 space-y-2">
                {stock.map((item) => (
                  <Card
                    key={item.id}
                    className="cursor-pointer hover:border-accent/50 transition-colors overflow-hidden"
                    onClick={() => handlePresent(item)}
                  >
                    {getVehicleImage(item.image, item.vehicle_model) ? (
                      <div className="w-full aspect-video bg-muted">
                        <img src={getVehicleImage(item.image, item.vehicle_model)!} alt={item.vehicle_label} loading="lazy" className="w-full h-full object-contain" />
                      </div>
                    ) : (
                      <div className="w-full aspect-video bg-muted flex items-center justify-center">
                        <Car className="h-6 w-6 text-muted-foreground/30" />
                      </div>
                    )}
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold">{item.vehicle_label || item.vehicle_model}</p>
                        {(item.quantity || 1) > 1 && (
                          <span className="text-xs text-muted-foreground">x{item.quantity}</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground capitalize">{item.class || 'Vehicle'}</p>
                      <p className="text-sm font-bold text-accent mt-1">{formatCurrency(item.retail_price)}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>

      {state.phase === 'greeting' && (
        <div className="p-4 border-t border-border flex justify-end">
          <Button variant="outline" className="gap-1" onClick={handleDismiss}>
            <UserX className="h-4 w-4" /> Dismiss Customer
          </Button>
        </div>
      )}
    </>
  )
}
