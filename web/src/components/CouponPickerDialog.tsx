import { useEffect, useState } from 'react'
import { Tag } from 'lucide-react'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { fetchNui, formatCurrency } from '../lib/utils'
import { t } from '../lib/locale'

export type InventoryCoupon = {
  slot: number | null
  count: number
  code: string
  discountType?: 'percent' | 'flat' | string
  discountValue?: number
  minPurchase?: number
  expiresAt?: number | null
  dealershipName?: string
}

interface Props {
  dealershipId: number
  price: number
  onClose: () => void
  onPick: (c: InventoryCoupon) => void
}

export default function CouponPickerDialog({ dealershipId, price, onClose, onPick }: Props) {
  const [rows, setRows] = useState<InventoryCoupon[] | null>(null)

  useEffect(() => {
    fetchNui<{ coupons: InventoryCoupon[] }>('listInventoryCoupons', {
      dealershipId, price,
    }).then((res) => setRows(res?.coupons ?? [])).catch(() => setRows([]))
  }, [dealershipId, price])

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent onClose={onClose}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Tag className="h-4 w-4" /> {t('coupon_picker_title')}</DialogTitle>
          <DialogDescription>{t('coupon_picker_desc')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 pt-2">
          {rows === null ? (
            <div className="text-sm text-muted-foreground py-4 text-center">{t('loading')}</div>
          ) : rows.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4 text-center">{t('coupon_no_eligible')}</div>
          ) : (
            <div className="max-h-72 overflow-y-auto space-y-1.5">
              {rows.map((c, i) => {
                const discountText = c.discountType === 'percent'
                  ? `${c.discountValue}% off`
                  : c.discountValue
                    ? formatCurrency(c.discountValue) + ' off'
                    : ''
                return (
                  <button
                    key={`${c.code}-${c.slot ?? 'none'}-${i}`}
                    type="button"
                    onClick={() => onPick(c)}
                    className="w-full text-left rounded-md border border-border p-2.5 hover:border-accent/50 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-sm">{c.code}</span>
                      <Badge variant="secondary" className="text-[10px]">x{c.count}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                      {discountText && <span className="text-accent">{discountText}</span>}
                      {c.dealershipName && <span>· {c.dealershipName}</span>}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={onClose}>{t('btn_cancel')}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
