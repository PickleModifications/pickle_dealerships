import { useEffect, useState } from 'react'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { ScrollArea } from '../components/ui/scroll-area'
import { Separator } from '../components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog'
import { fetchNui, formatCurrency } from '../lib/utils'
import { getCached, setCache, buildKey } from '../lib/cache'
import { SkeletonCardGrid } from '../components/ui/skeleton'
import { t } from '../lib/locale'
import { X, Plus, Trash2, Ticket, Percent, DollarSign, Printer } from 'lucide-react'
import type { DealershipData, Coupon } from '../types'

interface Props {
  data: DealershipData
  onClose: () => void
}

export default function CouponsPage({ data, onClose }: Props) {
  const cacheKey = buildKey(data.dealershipId, 'coupons')
  const cached = getCached<Coupon[]>(cacheKey)
  const [coupons, setCoupons] = useState<Coupon[]>(cached ?? [])
  const [loading, setLoading] = useState(!cached)
  const [createOpen, setCreateOpen] = useState(false)
  const [code, setCode] = useState('')
  const [discountType, setDiscountType] = useState<'percent' | 'flat'>('percent')
  const [discountValue, setDiscountValue] = useState('')
  const [maxUses, setMaxUses] = useState('0')
  const [minPurchase, setMinPurchase] = useState('0')
  const [printingCoupon, setPrintingCoupon] = useState<Coupon | null>(null)
  const [printCount, setPrintCount] = useState('5')

  const loadCoupons = () => {
    if (!getCached(cacheKey)) setLoading(true)
    fetchNui<{ success: boolean; coupons: Coupon[] }>('getCoupons', {
      dealershipId: data.dealershipId,
    }).then((res) => {
      if (res.success && res.coupons) { setCoupons(res.coupons); setCache(cacheKey, res.coupons) }
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  useEffect(() => { loadCoupons() }, [data.dealershipId])

  const handleCreate = () => {
    if (!code.trim() || !discountValue) return
    fetchNui('createCoupon', {
      dealershipId: data.dealershipId,
      code: code.trim().toUpperCase(),
      discountType,
      discountValue: parseInt(discountValue),
      maxUses: parseInt(maxUses) || 0,
      minPurchase: parseInt(minPurchase) || 0,
    }).then(() => {
      setCreateOpen(false)
      setCode('')
      setDiscountValue('')
      setMaxUses('0')
      setMinPurchase('0')
      loadCoupons()
    })
  }

  const handleDelete = (couponId: number) => {
    fetchNui('deleteCoupon', {
      dealershipId: data.dealershipId,
      couponId,
    }).then(() => loadCoupons())
  }

  const handlePrint = () => {
    if (!printingCoupon) return
    const count = Math.max(1, Math.min(50, parseInt(printCount, 10) || 1))
    fetchNui<{ success: boolean }>('printCoupon', {
      dealershipId: data.dealershipId,
      couponId: printingCoupon.id,
      count,
    }).finally(() => {
      setPrintingCoupon(null)
      setPrintCount('5')
    })
  }

  return (
    <>
      {!data.embedded && (
        <>
          <div className="flex items-center justify-between p-5 pb-0">
            <div>
              <h1 className="text-xl font-bold">{t('coupons_title')}</h1>
              <p className="text-sm text-muted-foreground">{data.dealershipName}</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1">
                <Plus className="h-4 w-4" /> {t('btn_create')}
              </Button>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>

          <Separator className="mt-4" />
        </>
      )}

      <div className="relative flex-1 flex flex-col overflow-hidden">
      <ScrollArea className="flex-1 p-5">
        {loading ? (
          <SkeletonCardGrid count={4} columns={2} />
        ) : coupons.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            <Ticket className="h-10 w-10 mb-2 opacity-50" />
            <p>{t('coupons_none')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {coupons.map((coupon) => (
              <Card key={coupon.id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-bold font-mono text-lg tracking-wider">{coupon.code}</p>
                      <div className="flex items-center gap-1 mt-1">
                        {coupon.discount_type === 'percent' ? (
                          <Badge className="gap-1"><Percent className="h-3 w-3" /> {coupon.discount_value}% {t('coupons_off')}</Badge>
                        ) : (
                          <Badge className="gap-1"><DollarSign className="h-3 w-3" /> {formatCurrency(coupon.discount_value)} {t('coupons_off')}</Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title={t('coupon_print')}
                        onClick={() => setPrintingCoupon(coupon)}
                      >
                        <Printer className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(coupon.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">{t('coupons_uses')}</p>
                      <p>{coupon.uses} / {coupon.max_uses === 0 ? t('coupons_unlimited') : coupon.max_uses}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{t('coupons_min_purchase')}</p>
                      <p>{coupon.min_purchase > 0 ? formatCurrency(coupon.min_purchase) : t('coupons_none_value')}</p>
                    </div>
                  </div>

                  {coupon.expires_at && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {t('coupons_expires')}: {new Date(coupon.expires_at).toLocaleDateString()}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </ScrollArea>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent onClose={() => setCreateOpen(false)}>
          <DialogHeader>
            <DialogTitle>{t('coupons_create_title')}</DialogTitle>
            <DialogDescription>{t('coupons_create_desc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-sm font-medium">{t('label_coupon_code')}</label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. SUMMER25"
                className="mt-1 font-mono"
                maxLength={20}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">{t('coupons_discount_type')}</label>
                <Select value={discountType} onValueChange={(v) => setDiscountType(v as 'percent' | 'flat')}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">{t('coupons_percentage')}</SelectItem>
                    <SelectItem value="flat">{t('coupons_flat_amount')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">{t('coupons_value')}</label>
                <Input
                  type="number"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  placeholder={discountType === 'percent' ? '10' : '5000'}
                  className="mt-1"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">{t('coupons_max_uses')}</label>
                <Input type="number" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">{t('coupons_min_purchase')}</label>
                <Input type="number" value={minPurchase} onChange={(e) => setMinPurchase(e.target.value)} className="mt-1" />
              </div>
            </div>
            <Button className="w-full" onClick={handleCreate}>{t('coupons_create_title')}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!printingCoupon} onOpenChange={(open) => { if (!open) setPrintingCoupon(null) }}>
        <DialogContent onClose={() => setPrintingCoupon(null)}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="h-4 w-4" /> {t('coupon_print_title')}
            </DialogTitle>
            <DialogDescription>{t('coupon_print_desc', printingCoupon?.code ?? '')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <label className="text-sm font-medium">{t('coupon_print_count')}</label>
              <Input
                type="number"
                min={1}
                max={50}
                value={printCount}
                onChange={(e) => setPrintCount(e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setPrintingCoupon(null)}>{t('btn_cancel')}</Button>
              <Button className="flex-1" onClick={handlePrint}>{t('coupon_print')}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      </div>
    </>
  )
}
