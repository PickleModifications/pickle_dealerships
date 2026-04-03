import { useEffect, useState } from 'react'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { ScrollArea } from '../components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog'
import { fetchNui, formatCurrency } from '../lib/utils'
import { SkeletonList } from '../components/ui/skeleton'
import { Plus, Trash2, Pencil, Search, Car, Camera } from 'lucide-react'

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
  const [catalog, setCatalog] = useState<CatalogVehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')

  // Add/Edit form
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<CatalogVehicle | null>(null)
  const [model, setModel] = useState('')
  const [label, setLabel] = useState('')
  const [wholesale, setWholesale] = useState('')
  const [tier, setTier] = useState('basic')
  const [vClass, setVClass] = useState('sedan')
  const [vType, setVType] = useState('car')

  const loadCatalog = () => {
    setLoading(true)
    fetchNui<{ success: boolean; catalog: CatalogVehicle[] }>('adminGetCatalog', {}).then((res) => {
      if (res.success && res.catalog) setCatalog(res.catalog)
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  useEffect(() => { loadCatalog() }, [])

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

    if (editing) {
      fetchNui('adminUpdateCatalogVehicle', {
        id: editing.id,
        label: label.trim(),
        wholesale: parseInt(wholesale) || 0,
        tier,
        class: vClass,
        vehicleType: vType,
      }).then(() => { setFormOpen(false); loadCatalog() })
    } else {
      fetchNui('adminAddCatalogVehicle', {
        model: model.trim().toLowerCase(),
        label: label.trim(),
        wholesale: parseInt(wholesale) || 0,
        tier,
        class: vClass,
        vehicleType: vType,
      }).then(() => { setFormOpen(false); loadCatalog() })
    }
  }

  const handleRemove = (id: number) => {
    fetchNui('adminRemoveCatalogVehicle', { id }).then(() => loadCatalog())
  }

  const filtered = catalog
    .filter((v) => typeFilter === 'all' || v.vehicle_type === typeFilter)
    .filter((v) => (v.label + v.model).toLowerCase().includes(search.toLowerCase()))

  return (
    <>
      <div className="p-4 flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search vehicles..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {vehicleTypes.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={openAdd} className="gap-1">
          <Plus className="h-4 w-4" /> Add Vehicle
        </Button>
      </div>

      <ScrollArea className="flex-1 px-4 pb-4">
        {loading ? (
          <SkeletonList count={5} />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            <Car className="h-10 w-10 mb-2 opacity-50" />
            <p>{catalog.length === 0 ? 'No vehicles in catalog. Add some!' : 'No matching vehicles'}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((v) => (
              <Card key={v.id} className="overflow-hidden">
                <CardContent className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {v.image ? (
                      <img src={v.image} alt={v.label} className="h-12 w-12 object-contain rounded bg-muted shrink-0" />
                    ) : (
                      <div className="h-12 w-12 rounded bg-muted flex items-center justify-center shrink-0">
                        <Car className="h-5 w-5 text-muted-foreground/50" />
                      </div>
                    )}
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
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => fetchNui('adminStartPhotoCapture', { catalogId: v.id, model: v.model, label: v.label, class: v.class })} title="Set Photo">
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
            ))}
          </div>
        )}
      </ScrollArea>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent onClose={() => setFormOpen(false)}>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Vehicle' : 'Add Vehicle to Catalog'}</DialogTitle>
            <DialogDescription>{editing ? `Editing ${editing.label}` : 'Add a new vehicle to the wholesale catalog.'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Model</label>
                <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. sultan" className="mt-1 font-mono" disabled={!!editing} />
              </div>
              <div>
                <label className="text-sm font-medium">Label</label>
                <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Sultan" className="mt-1" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Wholesale Price</label>
              <Input type="number" value={wholesale} onChange={(e) => setWholesale(e.target.value)} placeholder="15000" className="mt-1" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-sm font-medium">Tier</label>
                <Select value={tier} onValueChange={setTier}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {tiers.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Class</label>
                <Select value={vClass} onValueChange={setVClass}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {vehicleClasses.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Type</label>
                <Select value={vType} onValueChange={setVType}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {vehicleTypes.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setFormOpen(false)}>Cancel</Button>
              <Button className="flex-1" onClick={handleSave}>{editing ? 'Save Changes' : 'Add Vehicle'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
