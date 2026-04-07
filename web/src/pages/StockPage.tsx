import { useEffect, useState } from 'react'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { ScrollArea } from '../components/ui/scroll-area'
import { Separator } from '../components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { fetchNui, formatCurrency } from '../lib/utils'
import { getCached, setCache, buildKey } from '../lib/cache'
import { SkeletonCardGrid } from '../components/ui/skeleton'
import { X, Search, Package, Eye, EyeOff, Truck, Clock, ParkingSquare, Car } from 'lucide-react'
import type { DealershipData, StockItem } from '../types'

interface Props {
  data: DealershipData
  onClose: () => void
}

function getDeliveryStatus(item: StockItem): 'available' | 'in_transit' | 'pending' {
  if (!item.delivered_at) return 'pending'
  if (new Date(item.delivered_at) > new Date()) return 'in_transit'
  return 'available'
}

function getTimeRemaining(deliveredAt: string): string {
  const diff = new Date(deliveredAt).getTime() - Date.now()
  if (diff <= 0) return 'Arriving...'
  const mins = Math.ceil(diff / 60000)
  if (mins >= 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`
  return `${mins}m`
}

export default function StockPage({ data, onClose }: Props) {
  const cacheKey = buildKey(data.dealershipId, 'stock')
  const cached = getCached<StockItem[]>(cacheKey)
  const [stock, setStock] = useState<StockItem[]>(cached ?? [])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(!cached)
  const [, setTick] = useState(0)
  const [spotList, setSpotList] = useState<{ id: number; index: number }[]>([])

  const loadStock = () => {
    if (!cached) setLoading(true)
    fetchNui<StockItem[] | { stock: StockItem[] }>('getStock', {
      dealershipId: data.dealershipId,
      location: data.location,
    }).then((res) => {
      const items = Array.isArray(res) ? res : (res && 'stock' in res ? res.stock : [])
      setStock(items)
      setCache(cacheKey, items)
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  useEffect(() => {
    loadStock()
    fetchNui<{ spots: { id: number; index: number }[] }>('getDisplaySpots', {
      location: data.location,
    }).then((res) => {
      if (res && res.spots) setSpotList(res.spots)
    }).catch(() => {})
  }, [data.dealershipId])

  useEffect(() => {
    const hasInTransit = stock.some((s) => getDeliveryStatus(s) !== 'available')
    if (!hasInTransit) return
    const interval = setInterval(() => setTick((t) => t + 1), 30000)
    return () => clearInterval(interval)
  }, [stock])

  const handleSetSpot = (stockId: number, spot: number | null) => {
    fetchNui('setDisplaySpot', {
      dealershipId: data.dealershipId,
      location: data.location,
      stockId,
      spot,
    }).then(() => loadStock())
  }

  const filtered = stock.filter((item) =>
    (item.vehicle_label || item.vehicle_model).toLowerCase().includes(search.toLowerCase())
  )

  const available = filtered.filter((s) => getDeliveryStatus(s) === 'available')
  const inTransit = filtered.filter((s) => getDeliveryStatus(s) !== 'available')

  // Figure out which spots are taken
  const takenSpots = new Set(stock.filter((s) => s.display_spot).map((s) => Number(s.display_spot)))

  const canManage = data.role === 'owner' || data.role === 'manager' || data.role === 'admin'

  return (
    <>
      {!data.embedded && (
        <>
          <div className="flex items-center justify-between p-5 pb-0">
            <div>
              <h1 className="text-xl font-bold">Stock Inventory</h1>
              <p className="text-sm text-muted-foreground">{data.dealershipName} &mdash; {stock.reduce((sum, s) => sum + (s.quantity || 1), 0)} vehicles</p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          <div className="px-5 pt-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search vehicles..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
          </div>

          <Separator className="mt-3" />
        </>
      )}

      <ScrollArea className="flex-1 p-5">
        {loading ? (
          <SkeletonCardGrid count={4} columns={2} />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            <Package className="h-10 w-10 mb-2 opacity-50" />
            <p>{search ? 'No matching vehicles found' : 'No vehicles in stock'}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {inTransit.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Truck className="h-3.5 w-3.5" /> In Transit ({inTransit.length})
                </p>
                <div className="space-y-2">
                  {inTransit.map((item) => (
                    <Card key={item.id} className="overflow-hidden border-dashed opacity-80">
                      <CardContent className="p-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {item.image ? (
                            <img src={item.image} alt={item.vehicle_label} className="h-9 w-16 object-cover rounded-md bg-muted shrink-0" />
                          ) : (
                            <div className="h-9 w-16 rounded-md bg-amber-500/10 flex items-center justify-center shrink-0">
                              <Truck className="h-4 w-4 text-amber-400" />
                            </div>
                          )}
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-sm">{item.vehicle_label || item.vehicle_model}</p>
                              {(item.quantity || 1) > 1 && (
                                <Badge variant="secondary" className="text-xs">x{item.quantity}</Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground font-mono">{item.vehicle_model}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          {item.delivered_at ? (
                            <Badge variant="outline" className="gap-1 text-amber-400 border-amber-400/30">
                              <Clock className="h-3 w-3" /> {getTimeRemaining(item.delivered_at)}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">Awaiting Pickup</Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {available.length > 0 && (
              <div>
                {inTransit.length > 0 && (
                  <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Package className="h-3.5 w-3.5" /> Available ({available.length})
                  </p>
                )}
                <div className="space-y-2">
                  {available.map((item) => (
                    <Card key={item.id} className="overflow-hidden hover:border-accent/50 transition-colors">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            {item.image ? (
                              <img src={item.image} alt={item.vehicle_label} className="h-12 w-[84px] object-cover rounded-md bg-muted shrink-0" />
                            ) : (
                              <div className="h-12 w-[84px] rounded-md bg-muted flex items-center justify-center shrink-0">
                                <Car className="h-5 w-5 text-muted-foreground/30" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <h3 className="font-semibold truncate">{item.vehicle_label || item.vehicle_model}</h3>
                                {(item.quantity || 1) > 1 && (
                                  <Badge variant="secondary" className="text-xs shrink-0">x{item.quantity}</Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground font-mono">{item.vehicle_model}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 ml-3">
                            {item.display_spot ? (
                              <Badge className="gap-1"><Eye className="h-3 w-3" /> Spot #{item.display_spot}</Badge>
                            ) : (
                              <Badge variant="outline" className="gap-1 text-muted-foreground"><EyeOff className="h-3 w-3" /> Storage</Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                          <div className="flex gap-4">
                            <div>
                              <p className="text-xs text-muted-foreground">Wholesale</p>
                              <p className="text-sm font-medium">{formatCurrency(item.wholesale_cost)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Retail</p>
                              <p className="text-sm font-bold text-accent">{formatCurrency(item.retail_price)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Profit</p>
                              <p className="text-sm font-medium text-emerald-400">
                                {formatCurrency(item.retail_price - item.wholesale_cost)}
                              </p>
                            </div>
                          </div>
                          {canManage && (
                            <div className="flex items-center gap-2">
                              {item.display_spot ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="gap-1 text-xs"
                                  onClick={() => handleSetSpot(item.id, null)}
                                >
                                  <EyeOff className="h-3 w-3" /> Remove
                                </Button>
                              ) : (
                                <Select onValueChange={(val) => handleSetSpot(item.id, parseInt(val))}>
                                  <SelectTrigger className="w-[130px] h-8 text-xs">
                                    <ParkingSquare className="h-3 w-3 mr-1" />
                                    <SelectValue placeholder="Display on..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {spotList.map((spot) => (
                                      <SelectItem key={spot.id} value={String(spot.id)} disabled={takenSpots.has(spot.id)}>
                                        Spot #{spot.index} {takenSpots.has(spot.id) ? '(taken)' : ''}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </>
  )
}
