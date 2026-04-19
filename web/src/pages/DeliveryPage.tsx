import { useEffect, useState } from 'react'
import { Card, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { fetchNui, formatCurrency } from '../lib/utils'
import { t } from '../lib/locale'
import { Truck, X, Zap, Target } from 'lucide-react'
import VehicleImg from '../components/VehicleImg'
import type { DeliveryQueueData, DeliveryOffer } from '../types'

interface Props {
  queue: DeliveryQueueData
  depotId?: number
  onClose: () => void
}

function DeliveryCard({ offer, onAccept, locked, lockedTooltip }: {
  offer: DeliveryOffer
  onAccept: (offer: DeliveryOffer) => void
  locked?: boolean
  lockedTooltip?: string
}) {
  const bundleCount = offer.bundleSize ?? 1
  const totalQty = offer.quantity ?? 1
  return (
    <Card className={locked ? 'opacity-60' : ''}>
      <CardContent className="p-4 flex gap-4">
        <div className="w-24 h-16 shrink-0 rounded-md overflow-hidden bg-black/30">
          <VehicleImg model={offer.vehicleModel} className="w-full h-full object-contain" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-semibold truncate">
                {offer.vehicleLabel || offer.vehicleModel}
                {totalQty > 1 && <span className="text-xs font-normal text-muted-foreground ml-1">×{totalQty}</span>}
              </div>
              <div className="text-xs text-muted-foreground truncate">{offer.dealershipName}</div>
              {bundleCount > 1 && offer.vehicles && (
                <div className="text-[10px] text-muted-foreground/80 mt-0.5 truncate">
                  + {offer.vehicles.slice(1).map((v) => v.label || v.model).join(', ')}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between mt-2">
            <div className="text-xs text-muted-foreground">
              {t('delivery_payout_preview', formatCurrency(offer.projectedPayout))}
            </div>
            <Button
              size="sm"
              onClick={() => onAccept(offer)}
              disabled={locked}
              title={locked ? lockedTooltip : undefined}
            >
              {t('delivery_accept')}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function DeliveryPage({ queue, depotId, onClose }: Props) {
  const [offers, setOffers] = useState<DeliveryQueueData>(queue)
  const [busy, setBusy] = useState(false)

  useEffect(() => { setOffers(queue) }, [queue])

  // Live refresh when another driver claims/completes an offer
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.action === 'deliveryQueueChanged') {
        fetchNui<DeliveryQueueData>('getDeliveryQueue', {}).then((r) => { if (r) setOffers(r) }).catch(() => {})
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  const handleAccept = async (offer: DeliveryOffer) => {
    if (busy) return
    setBusy(true)
    // Send the full pre-grouped bundle so the server claims exactly what the UI showed.
    const orderIds = offer.orderIds && offer.orderIds.length > 0 ? offer.orderIds : [offer.orderId]
    const res = await fetchNui<{ ok: boolean; err?: string }>('acceptDelivery', { orderIds, depotId })
    setBusy(false)
    if (res?.ok) {
      onClose()
    }
  }

  const { driver } = offers
  const xpPct = driver.xpToNext ? Math.min(100, (driver.xp / driver.xpToNext) * 100) : 100

  return (
    <>
      <div className="flex items-center justify-between p-5 pb-0">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Truck className="h-5 w-5" /> {t('delivery_queue_title')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('delivery_level_label', driver.level, '')}
            {driver.streak > 0 && (
              <span className="ml-2 text-accent">
                <Zap className="inline h-3 w-3" /> {t('delivery_streak_bonus', Math.round((driver.streakMultiplier - 1) * 100))}
              </span>
            )}
          </p>
          <div className="mt-2 h-1.5 w-64 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-accent" style={{ width: `${xpPct}%` }} />
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {driver.xp} XP{driver.xpToNext ? ` / ${driver.xpToNext}` : ''}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
            <Target className="h-4 w-4" /> {t('delivery_queue_section_local')}
          </h2>
          {offers.local.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">{t('delivery_queue_empty')}</p>
          ) : (
            <div className="space-y-2">
              {offers.local.map((o) => (
                <DeliveryCard key={o.orderId} offer={o} onAccept={handleAccept} />
              ))}
            </div>
          )}
        </section>

        {offers.premium.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground mb-2">{t('delivery_queue_section_premium')}</h2>
            <div className="space-y-2">
              {offers.premium.map((o) => (
                <DeliveryCard key={o.orderId} offer={o} onAccept={handleAccept} />
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  )
}
