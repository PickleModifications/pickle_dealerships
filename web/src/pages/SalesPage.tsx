import { useEffect, useState } from 'react'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { ScrollArea } from '../components/ui/scroll-area'
import { Separator } from '../components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { fetchNui, formatCurrency, getVehicleImage } from '../lib/utils'
import { t } from '../lib/locale'
import { getCached, setCache, buildKey } from '../lib/cache'
import { SkeletonCardGrid } from '../components/ui/skeleton'
import { X, Search, CreditCard, Car, Tag, Banknote, FileText } from 'lucide-react'
import VehicleImg from '../components/VehicleImg'
import { PickleFaxDialog } from '../components/PickleFax'
import type { DealershipData, StockItem } from '../types'

interface Props {
  data: DealershipData
  onClose: () => void
}

export default function SalesPage({ data, onClose }: Props) {
  const cacheKey = buildKey(data.dealershipId, 'sales')
  const cached = getCached<StockItem[]>(cacheKey)
  const [stock, setStock] = useState<StockItem[]>(cached ?? [])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(!cached)
  const [selected, setSelected] = useState<StockItem | null>(null)
  const [couponCode, setCouponCode] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank'>('bank')
  const [pickleFaxId, setPickleFaxId] = useState<number | null>(null)

  useEffect(() => {
    fetchNui<StockItem[] | { stock: StockItem[] }>('getStock', {
      dealershipId: data.dealershipId,
      location: data.location,
    }).then((res) => {
      const items = Array.isArray(res) ? res : (res && 'stock' in res ? res.stock : [])
      setStock(items)
      setCache(cacheKey, items)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [data.dealershipId])

  const available = stock.filter((s) => !s.sold_at && !s.unlisted && s.delivered_at && new Date(s.delivered_at) <= new Date())
  const filtered = available.filter((item) =>
    (item.vehicle_label || item.vehicle_model).toLowerCase().includes(search.toLowerCase())
  )

  const handlePurchase = () => {
    if (!selected) return
    fetchNui('purchaseVehicle', {
      dealershipId: data.dealershipId,
      stockId: selected.id,
      paymentMethod,
      couponCode: couponCode || undefined,
    }).then(() => {
      setSelected(null)
      setCouponCode('')
      setStock((prev) => prev.filter((s) => s.id !== selected.id))
    })
  }

  const handleTestDrive = () => {
    if (!selected) return
    fetchNui('startTestDrive', {
      dealershipId: data.dealershipId,
      model: selected.vehicle_model,
    })
    setSelected(null)
    onClose()
  }

  const isEmployee = data.role === 'owner' || data.role === 'manager' || data.role === 'salesperson' || data.role === 'admin'

  return (
    <>
      {!data.embedded && (
        <>
          <div className="flex items-center justify-between p-5 pb-0">
            <div>
              <h1 className="text-xl font-bold">{data.selfService ? t('title_vehicle_showroom') : t('title_view_vehicles')}</h1>
              <p className="text-sm text-muted-foreground">{data.dealershipName} &mdash; {t('label_available', String(available.length))}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          <div className="px-5 pt-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder={t('label_search_available')} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
          </div>

          <Separator className="mt-3" />
        </>
      )}

      <div className="relative flex-1 flex flex-col overflow-hidden">
      <ScrollArea className="flex-1 p-5">
        {loading ? (
          <SkeletonCardGrid count={4} columns={2} />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            <Car className="h-10 w-10 mb-2 opacity-50" />
            <p>{search ? t('empty_no_matching') : t('empty_no_vehicles')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filtered.map((item) => (
              <Card
                key={item.id}
                className="overflow-hidden hover:border-accent/50 transition-colors cursor-pointer"
                onClick={() => setSelected(item)}
              >
                <VehicleImg image={item.image} model={item.vehicle_model} alt={item.vehicle_label} className="w-full aspect-video object-contain bg-muted" fallbackClassName="w-full aspect-video bg-muted flex items-center justify-center" iconClassName="h-8 w-8 text-muted-foreground/30" />
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-semibold">{item.vehicle_label || item.vehicle_model}</h3>
                      <p className="text-xs text-muted-foreground capitalize">{item.class || t('label_vehicle')}</p>
                    </div>
                    <div className="flex gap-1 items-center">
                      {(item.quantity || 1) > 1 && <Badge variant="secondary">x{item.quantity}</Badge>}
                      {item.is_used && <Badge variant="secondary">{t('label_pre_owned')}</Badge>}
                      {item.display_spot && <Badge variant="outline">{t('label_on_display')}</Badge>}
                      {item.is_used && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setPickleFaxId(item.id) }}
                          className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                          title={t('picklefax_title')}
                        >
                          <FileText className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                    <p className="text-lg font-bold text-accent">{formatCurrency(item.retail_price)}</p>
                    <Button size="sm" variant="outline">{t('btn_view_details')}</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </ScrollArea>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent onClose={() => setSelected(null)}>
          <DialogHeader>
            <DialogTitle>{selected?.vehicle_label || selected?.vehicle_model}</DialogTitle>
            <DialogDescription>{t('title_purchase_details')}</DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 pt-2">
              <div className="flex justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{t('label_class')}</p>
                  <p className="text-sm capitalize">{selected.class || t('label_vehicle')}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">{t('label_condition')}</p>
                  <p className="text-sm capitalize">{selected.condition}</p>
                </div>
              </div>

              <Separator />

              <div>
                <p className="text-xs text-muted-foreground mb-1">{t('label_price')}</p>
                <p className="text-2xl font-bold text-accent">{formatCurrency(selected.retail_price)}</p>
              </div>

              <Tabs defaultValue="bank" onValueChange={(v) => setPaymentMethod(v as 'cash' | 'bank')}>
                <TabsList className="w-full">
                  <TabsTrigger value="bank" className="flex-1 gap-1"><CreditCard className="h-3 w-3" /> {t('label_bank')}</TabsTrigger>
                  <TabsTrigger value="cash" className="flex-1 gap-1"><Banknote className="h-3 w-3" /> {t('label_cash')}</TabsTrigger>
                </TabsList>
              </Tabs>

              {isEmployee && (
                <div>
                  <label className="text-sm font-medium flex items-center gap-1"><Tag className="h-3 w-3" /> {t('label_coupon_code')}</label>
                  <Input
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value)}
                    placeholder={t('label_enter_coupon')}
                    className="mt-1"
                  />
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button className="flex-1" onClick={handlePurchase}>
                  {t('btn_purchase')}
                </Button>
                {isEmployee && data.tier >= 3 && (
                  <Button variant="outline" onClick={handleTestDrive}>
                    {t('btn_test_drive')}
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {pickleFaxId !== null && (
        <PickleFaxDialog stockId={pickleFaxId} mode={isEmployee ? 'employee' : 'customer'} onClose={() => setPickleFaxId(null)} />
      )}
      </div>
    </>
  )
}
