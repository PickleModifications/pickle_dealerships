import { useEffect, useState, useRef, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog'
import { fetchNui, formatCurrency, getVehicleImage } from '../lib/utils'
import { SkeletonList } from '../components/ui/skeleton'
import { t } from '../lib/locale'
import { Plus, Trash2, Pencil, Search, Car, Camera, Loader2 } from 'lucide-react'
import VehicleImg from '../components/VehicleImg'

interface CatalogVehicle {
  id: number
  model: string
  label: string
  wholesale: number
  tier: string
  class: string
  vehicle_type: string
  image?: string | null
}

interface CatalogResponse {
  success: boolean
  items: CatalogVehicle[]
  total: number
  page: number
  pageSize: number
}

const PAGE_SIZE = 50
const ROW_HEIGHT = 58
const GAP = 8

const tierColors: Record<string, string> = {
  basic: 'bg-zinc-500/20 text-zinc-300',
  expanded: 'bg-blue-500/20 text-blue-300',
  full: 'bg-purple-500/20 text-purple-300',
  exclusive: 'bg-amber-500/20 text-amber-300',
}

const tiers = ['basic', 'expanded', 'full', 'exclusive']
const vehicleTypes = ['car', 'boat', 'air']
const vehicleClasses = ['compact', 'sedan', 'sports', 'super', 'muscle', 'coupe', 'suv', 'offroad', 'van', 'boat', 'plane', 'helicopter']

export default function AdminCatalogPage() {
  const [items, setItems] = useState<CatalogVehicle[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const parentRef = useRef<HTMLDivElement>(null)

  // Add/Edit form
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<CatalogVehicle | null>(null)
  const [model, setModel] = useState('')
  const [label, setLabel] = useState('')
  const [wholesale, setWholesale] = useState('')
  const [tier, setTier] = useState('basic')
  const [vClass, setVClass] = useState('sedan')
  const [vType, setVType] = useState('car')

  const hasMore = items.length < total

  const fetchPage = useCallback((p: number, s: string, t: string, append: boolean) => {
    if (append) {
      setLoadingMore(true)
    } else {
      setLoading(true)
    }
    fetchNui<CatalogResponse>('adminGetCatalog', {
      page: p,
      pageSize: PAGE_SIZE,
      search: s,
      typeFilter: t,
    }).then((res) => {
      if (res.success && res.items) {
        setItems(prev => append ? [...prev, ...res.items] : res.items)
        setTotal(res.total)
        setPage(res.page)
      }
      setLoading(false)
      setLoadingMore(false)
    }).catch(() => { setLoading(false); setLoadingMore(false) })
  }, [])

  useEffect(() => { fetchPage(1, search, typeFilter, false) }, [])

  const handleSearchChange = (value: string) => {
    setSearch(value)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      fetchPage(1, value, typeFilter, false)
    }, 300)
  }

  const handleTypeChange = (value: string) => {
    setTypeFilter(value)
    fetchPage(1, search, value, false)
  }

  const resetAndReload = () => {
    fetchPage(1, search, typeFilter, false)
  }

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT + GAP,
    overscan: 10,
    onChange: (instance) => {
      const vItems = instance.getVirtualItems()
      const lastItem = vItems[vItems.length - 1]
      if (!lastItem) return
      if (lastItem.index >= items.length - 10 && hasMore && !loadingMore) {
        fetchPage(page + 1, search, typeFilter, true)
      }
    },
  })

  const openAdd = () => {
    setEditing(null)
    setModel('')
    setLabel('')
    setWholesale('')
    setTier('basic')
    setVClass('sedan')
    setVType('car')
    setFormOpen(true)
  }

  const openEdit = (v: CatalogVehicle) => {
    setEditing(v)
    setModel(v.model)
    setLabel(v.label)
    setWholesale(String(v.wholesale))
    setTier(v.tier)
    setVClass(v.class)
    setVType(v.vehicle_type)
    setFormOpen(true)
  }

  const handleSave = () => {
    if (!model.trim() || !label.trim()) return

    const action = editing
      ? fetchNui('adminUpdateCatalogVehicle', {
          id: editing.id,
          label: label.trim(),
          wholesale: parseInt(wholesale) || 0,
          tier,
          class: vClass,
          vehicleType: vType,
        })
      : fetchNui('adminAddCatalogVehicle', {
          model: model.trim().toLowerCase(),
          label: label.trim(),
          wholesale: parseInt(wholesale) || 0,
          tier,
          class: vClass,
          vehicleType: vType,
        })

    action.then(() => { setFormOpen(false); resetAndReload() })
  }

  const handleRemove = (id: number) => {
    fetchNui('adminRemoveCatalogVehicle', { id }).then(() => resetAndReload())
  }

  return (
    <>
      <div className="p-4 flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t('label_search_vehicles')} value={search} onChange={(e) => handleSearchChange(e.target.value)} className="pl-9" />
        </div>
        <Select value={typeFilter} onValueChange={handleTypeChange}>
          <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('label_all_types')}</SelectItem>
            {vehicleTypes.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={openAdd} className="gap-1">
          <Plus className="h-4 w-4" /> {t('btn_add_vehicle')}
        </Button>
      </div>

      <div ref={parentRef} className="flex-1 overflow-auto px-4 pb-2">
        {loading ? (
          <SkeletonList count={5} />
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            <Car className="h-10 w-10 mb-2 opacity-50" />
            <p>{total === 0 && !search ? t('empty_no_catalog') : t('empty_no_catalog_match')}</p>
          </div>
        ) : (
          <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const v = items[virtualItem.index]
              return (
                <div
                  key={v.id}
                  className="absolute top-0 left-0 w-full"
                  style={{
                    height: `${ROW_HEIGHT}px`,
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <Card className="overflow-hidden h-full">
                    <CardContent className="p-3 flex items-center justify-between h-full">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <VehicleImg image={v.image} model={v.model} alt={v.label} className="h-10 w-[72px] object-contain rounded bg-muted shrink-0" fallbackClassName="h-10 w-[72px] rounded bg-muted flex items-center justify-center shrink-0" iconClassName="h-5 w-5 text-muted-foreground/50" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-sm truncate">{v.label}</p>
                            <Badge className={`${tierColors[v.tier] || ''} border-0 text-[10px] capitalize`}>{v.tier}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            <span className="font-mono">{v.model}</span>
                            <span className="mx-1">&middot;</span>
                            <span className="capitalize">{v.class}</span>
                            <span className="mx-1">&middot;</span>
                            <span className="capitalize">{v.vehicle_type}</span>
                          </p>
                        </div>
                        <p className="font-bold text-sm whitespace-nowrap">{formatCurrency(v.wholesale)}</p>
                      </div>
                      <div className="flex gap-1 ml-3">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => fetchNui('adminStartPhotoCapture', { catalogId: v.id, model: v.model, label: v.label, class: v.class })} title={t('admin_set_photo')}>
                          <Camera className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(v)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleRemove(v.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )
            })}
          </div>
        )}
        {loadingMore && (
          <div className="flex justify-center py-3">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent onClose={() => setFormOpen(false)}>
          <DialogHeader>
            <DialogTitle>{editing ? t('title_edit_vehicle') : t('title_add_vehicle')}</DialogTitle>
            <DialogDescription>{editing ? `${t('admin_editing')} ${editing.label}` : t('admin_add_catalog_desc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">{t('label_model')}</label>
                <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. sultan" className="mt-1 font-mono" disabled={!!editing} />
              </div>
              <div>
                <label className="text-sm font-medium">{t('label_label')}</label>
                <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Sultan" className="mt-1" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">{t('label_wholesale_cost')}</label>
              <Input type="number" value={wholesale} onChange={(e) => setWholesale(e.target.value)} placeholder="15000" className="mt-1" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-sm font-medium">{t('label_tier')}</label>
                <Select value={tier} onValueChange={setTier}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {tiers.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">{t('label_class')}</label>
                <Select value={vClass} onValueChange={setVClass}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {vehicleClasses.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">{t('label_type')}</label>
                <Select value={vType} onValueChange={setVType}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {vehicleTypes.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setFormOpen(false)}>{t('btn_cancel')}</Button>
              <Button className="flex-1" onClick={handleSave}>{editing ? t('btn_save_changes') : t('btn_add_vehicle')}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
