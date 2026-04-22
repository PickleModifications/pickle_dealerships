import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { fetchNui, formatCurrency } from '../lib/utils'
import { t } from '../lib/locale'
import type { StockItem } from '../types'

interface Props {
  item: StockItem
  onClose: () => void
  onListed: () => void
}

export default function AuctionListDialog({ item, onClose, onListed }: Props) {
  const [durationPresets, setDurationPresets] = useState<number[]>([])
  const [duration, setDuration] = useState<number | null>(null)
  const [startingBid, setStartingBid] = useState('')
  const [minIncrement, setMinIncrement] = useState('250')
  const [reservePrice, setReservePrice] = useState('')
  const [buyoutPrice, setBuyoutPrice] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Pull the presets from Config.Auction so the dialog always matches what the
  // server accepts. Without this, the NUI and Lua drift (the server rejected
  // the hardcoded 30-minute option that NUI was offering).
  useEffect(() => {
    fetchNui<{ durations?: number[]; defaultDuration?: number }>('getAuctionConfig', {}).then((cfg) => {
      const list = (cfg?.durations && cfg.durations.length > 0) ? cfg.durations : [10]
      setDurationPresets(list)
      const def = cfg?.defaultDuration
      setDuration(def && list.includes(def) ? def : list[0])
    })
  }, [])

  const startingNum = parseInt(startingBid) || 0
  const reserveNum = parseInt(reservePrice) || 0
  const buyoutNum = parseInt(buyoutPrice) || 0
  const incrementNum = parseInt(minIncrement) || 0

  const canSubmit = startingNum > 0 && incrementNum >= 50 && !submitting
    && duration !== null
    && (!reserveNum || reserveNum >= startingNum)
    && (!buyoutNum || buyoutNum >= startingNum)

  const handleSubmit = () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    fetchNui<{ success: boolean; auctionId?: number; message?: string }>('createAuction', {
      stockId: item.id,
      startingBid: startingNum,
      minIncrement: incrementNum,
      reservePrice: reserveNum || null,
      buyoutPrice: buyoutNum || null,
      durationMinutes: duration,
    }).then((res) => {
      if (!res?.success) {
        setError(res?.message || 'Failed to list auction.')
        setSubmitting(false)
        return
      }
      onListed()
      onClose()
    }).catch(() => {
      setError('Network error.')
      setSubmitting(false)
    })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent onClose={onClose}>
        <DialogHeader>
          <DialogTitle>{t('title_list_for_auction')}</DialogTitle>
          <DialogDescription>{item.vehicle_label || item.vehicle_model}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-2">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">{t('label_wholesale_cost')}</span>
            <span>{formatCurrency(item.wholesale_cost)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">{t('label_retail_price')}</span>
            <span>{formatCurrency(item.retail_price)}</span>
          </div>

          <div>
            <label className="text-xs font-medium">{t('label_starting_bid')}</label>
            <Input type="number" inputMode="numeric" value={startingBid} onChange={(e) => setStartingBid(e.target.value)} placeholder="e.g. 5000" className="mt-1" />
          </div>

          <div>
            <label className="text-xs font-medium">{t('label_min_increment')}</label>
            <Input type="number" inputMode="numeric" value={minIncrement} onChange={(e) => setMinIncrement(e.target.value)} placeholder="250" className="mt-1" />
            <p className="text-[10px] text-muted-foreground mt-0.5">{t('floor_label')}</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium">{t('label_reserve_price')}</label>
              <Input type="number" inputMode="numeric" value={reservePrice} onChange={(e) => setReservePrice(e.target.value)} placeholder={t('optional')} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium">{t('label_buyout_price')}</label>
              <Input type="number" inputMode="numeric" value={buyoutPrice} onChange={(e) => setBuyoutPrice(e.target.value)} placeholder={t('optional')} className="mt-1" />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium">{t('label_duration')}</label>
            <div className="flex flex-wrap gap-1 mt-1">
              {durationPresets.map((mins) => (
                <button
                  key={mins}
                  onClick={() => setDuration(mins)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${duration === mins ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                >
                  {mins}m
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-rose-400">{error}</p>}

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={onClose}>{t('btn_cancel')}</Button>
            <Button className="flex-1" disabled={!canSubmit} onClick={handleSubmit}>
              {submitting ? t('listing') : t('btn_list_auction')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
