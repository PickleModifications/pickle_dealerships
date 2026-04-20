import { useState } from 'react'
import { useNuiEvent } from '../hooks/useNuiEvent'
import { t } from '../lib/locale'
import { formatCurrency } from '../lib/utils'
import { Truck, MapPin, Wrench, DollarSign } from 'lucide-react'
import type { MissionOverlayState } from '../types'

const EMPTY: MissionOverlayState = { visible: false }

function formatDistance(m?: number): string {
  if (m == null) return '—'
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`
  return `${m} m`
}

function conditionColor(cond: number): string {
  if (cond >= 85) return 'bg-emerald-500'
  if (cond >= 60) return 'bg-amber-400'
  if (cond >= 30) return 'bg-orange-500'
  return 'bg-red-500'
}

export default function MissionOverlay() {
  const [state, setState] = useState<MissionOverlayState>(EMPTY)

  useNuiEvent<{ state: MissionOverlayState }>('missionOverlay', (payload) => {
    setState(payload.state || EMPTY)
  })

  if (!state.visible) return null

  const cond = state.condition ?? 100
  const payout = state.payoutPreview ?? 0
  const base = state.baseFee ?? 0
  const streakPct = Math.round(((state.streakMultiplier ?? 1) - 1) * 100)
  const damagePct = Math.round((1 - (state.damageMultiplier ?? 1)) * 100)

  return (
    <div className="fixed top-6 right-6 z-[90] pointer-events-none w-80">
      <div className="bg-black/85 backdrop-blur-none border border-white/10 rounded-lg shadow-2xl overflow-hidden">
        {/* Objective */}
        <div className="px-4 py-3 border-b border-white/10 flex items-start gap-3">
          <Truck className="h-5 w-5 text-accent shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wider text-white/50">
              {t('delivery_queue_title')}
            </p>
            <p className="text-sm font-semibold text-white truncate">
              {state.phaseKey ? t(state.phaseKey) : ''}
            </p>
            {state.vehicleLabel && (
              <p className="text-[11px] text-white/60 truncate">
                {state.vehicleLabel}
                {state.quantity && state.quantity > 1 ? ` ×${state.quantity}` : ''}
                {state.bundledLines && state.bundledLines > 1 ? ` · +${state.bundledLines - 1} more` : ''}
              </p>
            )}
            {state.phaseHintKey && (
              <p className="mt-1 text-[10px] text-white/45 leading-snug">
                {t(state.phaseHintKey)}
              </p>
            )}
          </div>
        </div>

        {/* Distance */}
        <div className="px-4 py-2 flex items-center justify-between border-b border-white/5">
          <div className="flex items-center gap-2 text-white/70 text-xs">
            <MapPin className="h-3.5 w-3.5" />
            <span>{state.phase === 'pickup' ? t('blip_delivery_pickup') : t('blip_dealership_dropoff')}</span>
          </div>
          <span className="text-sm font-mono font-semibold text-white">{formatDistance(state.distanceMeters)}</span>
        </div>

        {/* Condition */}
        <div className="px-4 py-2 border-b border-white/5">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <div className="flex items-center gap-2 text-white/70">
              <Wrench className="h-3.5 w-3.5" />
              <span>{t('label_condition') || 'Condition'}</span>
            </div>
            <span className="font-mono text-white">{Math.round(cond)}%</span>
          </div>
          <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full ${conditionColor(cond)} transition-all duration-500`}
              style={{ width: `${cond}%` }}
            />
          </div>
        </div>

        {/* Payout preview */}
        <div className="px-4 py-2.5 bg-white/[0.02]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-white/70 text-xs">
              <DollarSign className="h-3.5 w-3.5" />
              <span>{t('delivery_payout_preview', '').replace(':', '').trim() || 'Payout'}</span>
            </div>
            <span className="text-base font-bold font-mono text-emerald-400">{formatCurrency(payout)}</span>
          </div>
          {(streakPct > 0 || damagePct > 0) && (
            <div className="mt-1 flex items-center gap-2 text-[10px] font-mono">
              <span className="text-white/40">{formatCurrency(base)}</span>
              {streakPct > 0 && <span className="text-emerald-400">+{streakPct}% streak</span>}
              {damagePct > 0 && <span className="text-red-400">−{damagePct}% damage</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
