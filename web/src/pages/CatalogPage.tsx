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
import { X, Search, ShoppingCart, Truck, Lock } from 'lucide-react'
import type { DealershipData, CatalogItem } from '../types'

interface Props {
  data: DealershipData
  onClose: () => void
}

const tierOrder = ['basic', 'expanded', 'full', 'exclusive']
const tierColors: Record<string, string> = {
  basic: 'bg-zinc-500/20 text-zinc-300',
  expanded: 'bg-blue-500/20 text-blue-300',
  full: 'bg-purple-500/20 text-purple-300',
  exclusive: 'bg-amber-500/20 text-amber-300',
}

export default function CatalogPage({ data, onClose }: Props) {
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('all')
  const [tierFilter, setTierFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [ordering, setOrdering] = useState<CatalogItem | null>(null)
  const [retailPrice, setRetailPrice] = useState('')
  const [quantity, setQuantity] = useState('1')

  useEffect(() => {
    fetchNui<{ catalog: CatalogItem[] }>('getCatalog', {
      dealershipId: data.dealershipId,
      location: data.location,
      type: data.type,
    }).then((res) => {
      if (res && Array.isArray(res.catalog)) setCatalog(res.catalog)
      else if (Array.isArray(res)) setCatalog(res)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [data.dealershipId])

  const classes = [...new Set(catalog.map((v) => v.class))].sort()

  const filtered = catalog
    .filter((v) => (v.label || v.model).toLowerCase().includes(search.toLowerCase()))
    .filter((v) => classFilter === 'all' || v.class === classFilter)
    .filter((v) => tierFilter === 'all' || v.tier === tierFilter)
    .sort((a, b) => tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier) || a.wholesale - b.wholesale)

  const handleOrder = () => {
    if (!ordering) return
    const price = parseInt(retailPrice) || Math.round(ordering.wholesale * 1.3)
    const qty = parseInt(quantity) || 1
    fetchNui('orderVehicle', {
      dealershipId: data.dealershipId,
      location: data.location,
      model: ordering.model,
      wholesale: ordering.wholesale,
      retailPrice: price,
      quantity: qty,
    }).then(() => {
      setOrdering(null)
      setRetailPrice('')
      setQuantity('1')
    })
  }

  return (
    <>
      {!data.embedded && (
        <>
          <div className="flex items-center justify-between p-5 pb-0">
            <div>
              <h1 className="text-xl font-bold">Wholesale Catalog</h1>
              <p className="text-sm text-muted-foreground">Order vehicles for your dealership</p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          <div className="px-5 pt-3 flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={classFilter} onValueChange={setClassFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Class" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classes</SelectItem>
                {classes.map((c) => (
                  <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={tierFilter} onValueChange={setTierFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Tier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tiers</SelectItem>
                {tierOrder.map((t) => (
                  <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator className="mt-3" />
        </>
      )}

      <div className="relative flex-1 flex flex-col overflow-hidden">
      <ScrollArea className="flex-1 p-5">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground">Loading catalog...</div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground">No vehicles found</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((item) => {
              const locked = !canAccessTier(item.tier, data.tier)
              return (
                <Card key={item.model} className={`overflow-hidden transition-colors ${locked ? 'opacity-50' : 'hover:border-accent/50'}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-semibold">{item.label}</h3>
                        <p className="text-xs text-muted-foreground font-mono">{item.model}</p>
                      </div>
                      <Badge className={`${tierColors[item.tier] || ''} border-0 text-xs capitalize`}>
                        {item.tier}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground capitalize mb-3">{item.class}</p>
                    <div className="flex items-center justify-between">
                      <p className="font-bold">{formatCurrency(item.wholesale)}</p>
                      {locked ? (
                        <Badge variant="outline" className="gap-1 text-muted-foreground">
                          <Lock className="h-3 w-3" /> Locked
                        </Badge>
                      ) : (
                        <Button size="sm" onClick={() => { setOrdering(item); setRetailPrice(String(Math.round(item.wholesale * 1.3))) }}>
                          <ShoppingCart className="h-3 w-3" /> Order
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </ScrollArea>

      <Dialog open={!!ordering} onOpenChange={(open) => !open && setOrdering(null)}>
        <DialogContent onClose={() => setOrdering(null)}>
          <DialogHeader>
            <DialogTitle>Order {ordering?.label}</DialogTitle>
            <DialogDescription>Set the retail price and quantity for this order.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Wholesale Cost</p>
              <p className="text-lg font-bold">{formatCurrency(ordering?.wholesale || 0)}</p>
            </div>
            <div>
              <label className="text-sm font-medium">Retail Price</label>
              <Input
                type="number"
                value={retailPrice}
                onChange={(e) => setRetailPrice(e.target.value)}
                placeholder="Set retail price..."
                className="mt-1"
              />
              {retailPrice && ordering && (
                <p className="text-xs text-muted-foreground mt-1">
                  Markup: {formatCurrency(parseInt(retailPrice) - ordering.wholesale)} ({Math.round(((parseInt(retailPrice) - ordering.wholesale) / ordering.wholesale) * 100)}%)
                </p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium">Quantity</label>
              <Input
                type="number"
                min="1"
                max="10"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <div>
                <p className="text-xs text-muted-foreground">Total Cost (with tax)</p>
                <p className="font-bold">{formatCurrency(Math.round((ordering?.wholesale || 0) * 1.1 * (parseInt(quantity) || 1)))}</p>
              </div>
              <Button onClick={handleOrder} className="gap-2">
                <Truck className="h-4 w-4" /> Place Order
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      </div>
    </>
  )
}

function canAccessTier(vehicleTier: string, dealershipTier: number): boolean {
  const tierMap: Record<string, number> = { basic: 1, expanded: 2, full: 3, exclusive: 4 }
  return dealershipTier >= (tierMap[vehicleTier] || 1)
}
