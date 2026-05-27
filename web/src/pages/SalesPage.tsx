import { useEffect, useState } from 'react'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { ScrollArea } from '../components/ui/scroll-area'
import { Separator } from '../components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { fetchNui, formatClass, formatCurrency, getVehicleImage } from '../lib/utils'
import { t } from '../lib/locale'
import { SkeletonCardGrid } from '../components/ui/skeleton'
import { X, Search, CreditCard, Car, Tag, Banknote, FileText, Shield, Coins } from 'lucide-react'
import VehicleImg from '../components/VehicleImg'
import { PickleFaxDialog } from '../components/PickleFax'
import PurchaseAddons, { type PurchaseAddonsValue } from '../components/PurchaseAddons'
import CouponPickerDialog, { type InventoryCoupon } from '../components/CouponPickerDialog'
import type { DealershipData, StockItem, SocietyMatch, AltPaymentOption } from '../types'

function getStockMinGrade(item: StockItem): number {
  let meta = item.metadata as unknown
  if (typeof meta === 'string') {
    try { meta = JSON.parse(meta) } catch { return 0 }
  }
  if (meta && typeof meta === 'object') {
    const mg = (meta as Record<string, unknown>).minGrade
    return typeof mg === 'number' ? mg : 0
  }
  return 0
}

interface Props {
  data: DealershipData
  onClose: () => void
}

const TABLET_PAGE_SIZE = 20
const DESK_PAGE_SIZE = 50

export default function SalesPage({ data, onClose }: Props) {
  const tabletMode = !!data.tabletMode
  // Both paths now use the same paginated server endpoint. Tablet uses a
  // tighter page size (it's the rapid-fire operator view, smaller cards);
  // the in-world / front-desk view uses larger cards so it can load fewer
  // per page without making the user scroll constantly.
  const PAGE_SIZE = tabletMode ? TABLET_PAGE_SIZE : DESK_PAGE_SIZE
  const [stock, setStock] = useState<StockItem[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<StockItem | null>(null)
  const [couponCode, setCouponCode] = useState('')
  // paymentMethod: 'cash' | 'bank' | 'society' | `alt:${key}`
  const [paymentMethod, setPaymentMethod] = useState<string>('bank')
  const [pickleFaxId, setPickleFaxId] = useState<number | null>(null)
  const [societyMatch, setSocietyMatch] = useState<SocietyMatch | null>(null)
  const [altOptions, setAltOptions] = useState<AltPaymentOption[]>([])
  const [sellToOpen, setSellToOpen] = useState(false)
  const [couponItemSlot, setCouponItemSlot] = useState<number | null>(null)
  const [couponPickerOpen, setCouponPickerOpen] = useState(false)
  const [addons, setAddons] = useState<PurchaseAddonsValue>({})
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    if (tabletMode) return
    fetchNui<{ match: SocietyMatch | null }>('canUseSocietyFunds', {
      dealershipId: data.dealershipId,
    }).then((res) => {
      setSocietyMatch(res?.match ?? null)
    }).catch(() => setSocietyMatch(null))
  }, [data.dealershipId, tabletMode])

  // Server-side paginated fetch, debounced on search input. Scope=public +
  // tab=all returns only available, listed, non-auctioned, delivered rows —
  // no client-side filtering needed.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const handle = setTimeout(() => {
      fetchNui<{ items: StockItem[]; total: number; page: number }>('getStock', {
        dealershipId: data.dealershipId,
        location: data.location,
        tab: 'all',
        scope: 'public',
        page: 1,
        pageSize: PAGE_SIZE,
        search: search || '',
        sortBy: 'name_asc',
      }).then((res) => {
        if (cancelled) return
        setStock(res?.items ?? [])
        setTotal(res?.total ?? 0)
        setPage(1)
        setLoading(false)
      }).catch(() => { if (!cancelled) setLoading(false) })
    }, search ? 220 : 0)
    return () => { cancelled = true; clearTimeout(handle) }
  }, [data.dealershipId, data.location, search, PAGE_SIZE])

  const loadMore = () => {
    if (loadingMore || stock.length >= total) return
    setLoadingMore(true)
    const next = page + 1
    fetchNui<{ items: StockItem[]; total: number; page: number }>('getStock', {
      dealershipId: data.dealershipId,
      location: data.location,
      tab: 'all',
      scope: 'public',
      page: next,
      pageSize: PAGE_SIZE,
      search: search || '',
      sortBy: 'name_asc',
    }).then((res) => {
      setStock((prev) => [...prev, ...(res?.items ?? [])])
      setTotal(res?.total ?? total)
      setPage(next)
    }).finally(() => setLoadingMore(false))
  }

  // Server already filters: only available, listed, non-auctioned, delivered.
  const available = stock
  const filtered = stock

  // Fetch alt-payment balances whenever the selected vehicle (or its price) changes
  useEffect(() => {
    if (!selected) {
      setAltOptions([])
      return
    }
    fetchNui<{ options: AltPaymentOption[] }>('getAltPaymentOptions', {
      dealershipId: data.dealershipId,
      price: selected.retail_price,
    }).then((res) => {
      setAltOptions(res?.options ?? [])
    }).catch(() => setAltOptions([]))
  }, [selected?.id, selected?.retail_price, data.dealershipId])

  // Clear the addons state any time the customer switches vehicles so the
  // previous selection's plate input doesn't carry over.
  useEffect(() => { setAddons({}) }, [selected?.id])

  const handlePurchase = () => {
    if (!selected) return
    fetchNui('purchaseVehicle', {
      dealershipId: data.dealershipId,
      // Pass the location key so the client-side spawn lookup targets
      // this dealership specifically. Without it the fallback used to
      // iterate DealershipConfigs and pick the first one it found —
      // which is how players were ending up at an unrelated dealership's
      // spawn point after purchasing.
      location: data.location,
      stockId: selected.id,
      paymentMethod,
      couponCode: couponCode || undefined,
      couponItemSlot: couponItemSlot ?? undefined,
      addons,
    }).then(() => {
      setSelected(null)
      setCouponCode('')
      setCouponItemSlot(null)
      setAddons({})
      setStock((prev) => prev.filter((s) => s.id !== selected.id))
    })
  }

  const handleTestDrive = () => {
    if (!selected) return
    fetchNui('startTestDrive', {
      dealershipId: data.dealershipId,
      location: data.location,
      model: selected.vehicle_model,
    })
    setSelected(null)
    onClose()
  }

  const isEmployee = data.role === 'owner' || data.role === 'manager' || data.role === 'salesperson' || data.role === 'admin'

  return (
    <>
      {!data.embedded && (
        tabletMode ? (
          <>
            {/* Compact tablet header — operator only needs name + search +
                close, no big banner / status copy. */}
            <div className="flex items-center gap-3 px-3 py-2 border-b border-border">
              <h1 className="text-sm font-semibold truncate flex-1">
                {data.dealershipName}
                {!loading && (
                  <span className="text-muted-foreground font-normal"> · {total}</span>
                )}
              </h1>
              <div className="relative w-56">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder={t('label_search_available')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-8 text-xs"
                />
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </>
        ) : (
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
        )
      )}

      <div className="relative flex-1 flex flex-col overflow-hidden">
      <ScrollArea className={tabletMode ? 'flex-1 p-3' : 'flex-1 p-5'}>
        {loading ? (
          <SkeletonCardGrid count={tabletMode ? 8 : 4} columns={tabletMode ? 4 : 2} />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            <Car className="h-10 w-10 mb-2 opacity-50" />
            <p>{search ? t('empty_no_matching') : t('empty_no_vehicles')}</p>
          </div>
        ) : (
          <div className={tabletMode ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5' : 'grid grid-cols-1 md:grid-cols-2 gap-3'}>
            {filtered.map((item) => (
              <Card
                key={item.id}
                className="overflow-hidden hover:border-accent/50 transition-colors cursor-pointer"
                onClick={() => {
                  setSelected(item)
                  // Tablet jumps straight to the target picker — operator
                  // doesn't choose payment/coupon, the customer handles that
                  // in the confirm prompt on their end.
                  if (tabletMode) setSellToOpen(true)
                }}
              >
                <VehicleImg image={item.image} model={item.vehicle_model} alt={item.vehicle_label} className="w-full aspect-video object-contain bg-muted" fallbackClassName="w-full aspect-video bg-muted flex items-center justify-center" iconClassName="h-8 w-8 text-muted-foreground/30" />
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-semibold">{item.vehicle_label || item.vehicle_model}</h3>
                      <p className="text-xs text-muted-foreground">{formatClass(item.class) || t('label_vehicle')}</p>
                    </div>
                    <div className="flex gap-1 items-center">
                      {(item.quantity || 1) > 1 && <Badge variant="secondary">x{item.quantity}</Badge>}
                      {item.is_used && <Badge variant="secondary">{t('label_pre_owned')}</Badge>}
                      {item.display_spot && <Badge variant="outline">{t('label_on_display')}</Badge>}
                      {getStockMinGrade(item) > 0 && (
                        <Badge variant="outline" className="gap-0.5"><Shield className="h-2.5 w-2.5" /> {getStockMinGrade(item)}</Badge>
                      )}
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
        {stock.length < total && !loading && (
          <div className="flex justify-center pt-3 pb-1">
            <Button
              size="sm"
              variant="outline"
              disabled={loadingMore}
              onClick={loadMore}
            >
              {loadingMore ? t('loading') : t('btn_load_more')}
            </Button>
          </div>
        )}
      </ScrollArea>

      <Dialog open={!!selected && !tabletMode} onOpenChange={(open) => !open && setSelected(null)}>
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
                  <p className="text-sm">{formatClass(selected.class) || t('label_vehicle')}</p>
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

              <Tabs value={paymentMethod} onValueChange={(v) => setPaymentMethod(v)}>
                <TabsList className="w-full flex-wrap">
                  <TabsTrigger value="bank" className="flex-1 gap-1"><CreditCard className="h-3 w-3" /> {t('label_bank')}</TabsTrigger>
                  <TabsTrigger value="cash" className="flex-1 gap-1"><Banknote className="h-3 w-3" /> {t('label_cash')}</TabsTrigger>
                  {societyMatch && (
                    <TabsTrigger value="society" className="flex-1 gap-1"><Shield className="h-3 w-3" /> {t('label_society_funds')}</TabsTrigger>
                  )}
                  {altOptions.map((opt) => (
                    <TabsTrigger key={opt.key} value={`alt:${opt.key}`} className="flex-1 gap-1">
                      <Coins className="h-3 w-3" /> {opt.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              {paymentMethod === 'society' && societyMatch && (
                <p className="text-[10px] text-muted-foreground">
                  {t('society_funds_source', societyMatch.name)}
                </p>
              )}
              {paymentMethod.startsWith('alt:') && (() => {
                const opt = altOptions.find((o) => `alt:${o.key}` === paymentMethod)
                if (!opt) return null
                return (
                  <div className="text-[10px] text-muted-foreground space-y-0.5">
                    <p>{t('alt_payment_balance', String(opt.balance))} &middot; {t('alt_payment_required', String(opt.required))}</p>
                    {!opt.canAfford && (
                      <p className="text-rose-400">{t('alt_payment_insufficient')}</p>
                    )}
                  </div>
                )
              })()}

              {selected && getStockMinGrade(selected) > 0 && (
                <p className="text-[10px] text-amber-400 flex items-center gap-1">
                  <Shield className="h-3 w-3" /> {t('label_min_grade_required', String(getStockMinGrade(selected)))}
                </p>
              )}

              <div>
                <label className="text-sm font-medium flex items-center gap-1"><Tag className="h-3 w-3" /> {t('label_coupon_code')}</label>
                <div className="mt-1 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 justify-start"
                    onClick={() => setCouponPickerOpen(true)}
                  >
                    {couponCode ? (
                      <span className="flex items-center gap-1.5 truncate">
                        <Tag className="h-3 w-3 text-accent" />
                        <span className="font-mono">{couponCode}</span>
                        {couponItemSlot != null && (
                          <span className="text-[10px] text-muted-foreground">{t('coupon_from_inventory')}</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">{t('coupon_select_existing')}</span>
                    )}
                  </Button>
                  {couponCode && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setCouponCode(''); setCouponItemSlot(null) }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                {isEmployee && (
                  <Input
                    value={couponItemSlot != null ? '' : couponCode}
                    onChange={(e) => { setCouponCode(e.target.value); setCouponItemSlot(null) }}
                    placeholder={t('label_enter_coupon')}
                    className="mt-1.5"
                  />
                )}
              </div>

              <PurchaseAddons
                price={selected.retail_price}
                value={addons}
                onChange={setAddons}
                disabled={!!selected.is_used}
              />

              {data.disableSelfPurchase && !isEmployee ? (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200 flex items-start gap-2">
                  <Shield className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{t('sales_speak_to_employee')}</span>
                </div>
              ) : null}
              <div className="flex gap-2 pt-2 flex-wrap">
                {!(data.disableSelfPurchase && !isEmployee) && (
                  <Button className="flex-1" onClick={handlePurchase}>
                    {t('btn_purchase')}
                  </Button>
                )}
                {isEmployee && (
                  <>
                    <Button variant="default" onClick={() => setSellToOpen(true)}>
                      {t('btn_sell_to_customer')}
                    </Button>
                    <Button variant="outline" onClick={handleTestDrive}>
                      {t('btn_test_drive')}
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {pickleFaxId !== null && (
        <PickleFaxDialog stockId={pickleFaxId} mode={isEmployee ? 'employee' : 'customer'} onClose={() => setPickleFaxId(null)} />
      )}

      {sellToOpen && selected && (
        <SellToCustomerDialog
          dealershipId={data.dealershipId}
          stock={selected}
          couponCode={couponCode || undefined}
          onClose={() => setSellToOpen(false)}
          onSent={() => {
            setSellToOpen(false)
            setSelected(null)
          }}
        />
      )}

      {couponPickerOpen && selected && (
        <CouponPickerDialog
          dealershipId={data.dealershipId}
          price={selected.retail_price}
          onClose={() => setCouponPickerOpen(false)}
          onPick={(c) => {
            setCouponCode(c.code)
            setCouponItemSlot(c.slot ?? null)
            setCouponPickerOpen(false)
          }}
        />
      )}
      </div>
    </>
  )
}

function SellToCustomerDialog(props: {
  dealershipId: number
  stock: StockItem
  couponCode?: string
  onClose: () => void
  onSent: () => void
}) {
  const { dealershipId, stock, couponCode, onClose, onSent } = props
  const [players, setPlayers] = useState<{ source: number; name: string; identifier: string }[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelectedPlayer] = useState<{ source: number; name: string; identifier: string } | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchNui<{ players: { source: number; name: string; identifier: string }[] }>('listOnlinePlayersForSale', {
      dealershipId,
    }).then((res) => setPlayers(res?.players ?? [])).catch(() => setPlayers([]))
  }, [dealershipId])

  const filtered = search
    ? players.filter((p) =>
        p.name.toLowerCase().includes(search.toLowerCase())
        || String(p.source) === search
        || (p.identifier && p.identifier.toLowerCase().includes(search.toLowerCase())))
    : players

  const send = () => {
    if (!selected) { setError(t('tablet_invalid_target')); return }
    setError(null); setSending(true)
    // No `price` — server defaults to retail_price. The customer chooses
    // payment method + sees the cost in their accept dialog.
    fetchNui<{ success: boolean; message?: string }>('employeeSale', {
      dealershipId,
      stockId: stock.id,
      targetPlayerId: selected.source,
      couponCode,
    }).then((res) => {
      setSending(false)
      if (res?.success) onSent()
      else setError(res?.message || t('tablet_send_failed'))
    }).catch(() => { setSending(false); setError(t('tablet_send_failed')) })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent onClose={onClose}>
        <DialogHeader>
          <DialogTitle>{t('tablet_sell_to_customer')}</DialogTitle>
          <DialogDescription>{t('tablet_sell_to_customer_desc', stock.vehicle_label || stock.vehicle_model)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <div>
            <label className="text-xs text-muted-foreground">{t('tablet_target_player')}</label>
            <div className="relative mt-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={selected ? selected.name : search}
                onChange={(e) => { setSearch(e.target.value); setSelectedPlayer(null) }}
                placeholder={t('tablet_player_search_placeholder')}
                className="pl-8"
              />
              {!selected && search && (
                <div className="absolute z-10 top-full mt-1 left-0 right-0 bg-card border border-border rounded-md shadow-md max-h-48 overflow-auto">
                  {filtered.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-muted-foreground">{t('empty_no_players')}</p>
                  ) : (
                    filtered.map((p) => (
                      <button
                        key={p.source}
                        type="button"
                        onClick={() => { setSelectedPlayer(p); setSearch('') }}
                        className="w-full text-left px-3 py-2 hover:bg-muted text-sm flex items-center justify-between gap-2"
                      >
                        <span className="truncate">{p.name}</span>
                        <span className="text-[10px] text-muted-foreground font-mono shrink-0">#{p.source}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            {selected && (
              <button
                type="button"
                onClick={() => { setSelectedPlayer(null); setSearch('') }}
                className="text-[11px] text-muted-foreground hover:text-foreground mt-1"
              >
                {t('tablet_clear_selection')}
              </button>
            )}
          </div>
          {error && <div className="text-xs text-rose-400">{error}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>{t('btn_cancel')}</Button>
            <Button onClick={send} disabled={sending}>{t('tablet_send_invoice')}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
