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
import { X, Plus, Trash2, Ticket, Percent, DollarSign } from 'lucide-react'
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

  return (
    <>
      {!data.embedded && (
        <>
          <div className="flex items-center justify-between p-5 pb-0">
            <div>
              <h1 className="text-xl font-bold">Coupons & Promotions</h1>
              <p className="text-sm text-muted-foreground">{data.dealershipName}</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1">
                <Plus className="h-4 w-4" /> Create
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
            <p>No coupons created yet</p>
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
                          <Badge className="gap-1"><Percent className="h-3 w-3" /> {coupon.discount_value}% off</Badge>
                        ) : (
                          <Badge className="gap-1"><DollarSign className="h-3 w-3" /> {formatCurrency(coupon.discount_value)} off</Badge>
                        )}
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(coupon.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Uses</p>
                      <p>{coupon.uses} / {coupon.max_uses === 0 ? 'Unlimited' : coupon.max_uses}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Min Purchase</p>
                      <p>{coupon.min_purchase > 0 ? formatCurrency(coupon.min_purchase) : 'None'}</p>
                    </div>
                  </div>

                  {coupon.expires_at && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Expires: {new Date(coupon.expires_at).toLocaleDateString()}
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
            <DialogTitle>Create Coupon</DialogTitle>
            <DialogDescription>Create a promotional coupon code for your dealership.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-sm font-medium">Coupon Code</label>
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
                <label className="text-sm font-medium">Discount Type</label>
                <Select value={discountType} onValueChange={(v) => setDiscountType(v as 'percent' | 'flat')}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Percentage</SelectItem>
                    <SelectItem value="flat">Flat Amount</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Value</label>
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
                <label className="text-sm font-medium">Max Uses (0 = unlimited)</label>
                <Input type="number" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">Min Purchase</label>
                <Input type="number" value={minPurchase} onChange={(e) => setMinPurchase(e.target.value)} className="mt-1" />
              </div>
            </div>
            <Button className="w-full" onClick={handleCreate}>Create Coupon</Button>
          </div>
        </DialogContent>
      </Dialog>
      </div>
    </>
  )
}
