import { useEffect, useState, useRef, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog'
import { fetchNui, formatCurrency } from '../lib/utils'
import { SkeletonList } from '../components/ui/skeleton'
import { t } from '../lib/locale'
import { Plus, Trash2, Pencil, Search, Car, Camera, Loader2, Layers } from 'lucide-react'
import VehicleImg from '../components/VehicleImg'

interface CatalogVehicle {
  id: number
  model: string
  label: string
  wholesale: number
  class: string
  vehicle_type: string
  image?: string | null
  groupIds?: number[]
}

interface CatalogGroup {
  id: number
  name: string
  label: string
  description?: string | null
  is_default?: number | boolean
  vehicle_count?: number
  dealership_count?: number
}

interface CatalogResponse {
  success?: boolean
  items: CatalogVehicle[]
  total: number
  page: number
  pageSize: number
}

const PAGE_SIZE = 50
const ROW_HEIGHT = 58
const GAP = 8

const vehicleTypes = ['car', 'boat', 'air']
// Mirrors the classes the admin/client.lua auto-detector can return, so
// whatever GetVehicleClass hands us lines up with an entry in the Select.
const vehicleClasses = [
  'compact', 'sedan', 'suv', 'coupe', 'muscle', 'sports_classic', 'sports', 'super',
  'motorcycle', 'offroad', 'van', 'cycle', 'boat', 'plane', 'helicopter',
]

const classLabel = (cls: string) => t(`class_${cls}`)
const typeLabel = (type: string) => {
  const map: Record<string, string> = { car: 'label_car', boat: 'label_boat', air: 'label_aircraft' }
  return map[type] ? t(map[type]) : type
}

// Resolves a group's display string. Default-seeded groups fall back to a
// `group_<name>` locale key so the "basic/expanded/full/exclusive" defaults
// stay localized even if the admin hasn't set a custom label.
const groupLabel = (g: CatalogGroup) => {
  if (g.is_default) {
    const localized = t(`group_${g.name}`)
    if (localized && localized !== `group_${g.name}`) return localized
  }
  return g.label || g.name
}

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

  // Groups list (all groups in the system). Loaded once on mount and refreshed
  // whenever the Manage Groups dialog mutates them.
  const [groups, setGroups] = useState<CatalogGroup[]>([])

  // Add/Edit vehicle form
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<CatalogVehicle | null>(null)
  const [model, setModel] = useState('')
  const [label, setLabel] = useState('')
  const [wholesale, setWholesale] = useState('')
  const [vClass, setVClass] = useState('sedan')
  const [vType, setVType] = useState('car')
  const [vehicleGroupIds, setVehicleGroupIds] = useState<number[]>([])

  // Manage-groups dialog
  const [groupsOpen, setGroupsOpen] = useState(false)
  const [groupEditing, setGroupEditing] = useState<CatalogGroup | null>(null)
  // formMode is the only driver of whether the inline form is rendered. null
  // keeps the list tidy when the admin isn't doing anything; 'create' swaps
  // the "+ Create Group" row for the form; 'edit' shows the form under the
  // row being edited (same bottom position either way).
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null)
  const [groupLbl, setGroupLbl] = useState('')
  const [groupDesc, setGroupDesc] = useState('')

  const hasMore = items.length < total

  const loadGroups = useCallback(() => {
    fetchNui<CatalogGroup[]>('adminGetGroups', {}).then((rows) => {
      setGroups(Array.isArray(rows) ? rows : [])
    }).catch(() => setGroups([]))
  }, [])

  useEffect(() => { loadGroups() }, [loadGroups])

  const fetchPage = useCallback((p: number, s: string, ty: string, append: boolean) => {
    if (append) setLoadingMore(true)
    else setLoading(true)
    fetchNui<CatalogResponse>('adminGetCatalog', {
      page: p,
      pageSize: PAGE_SIZE,
      search: s,
      typeFilter: ty,
    }).then((res) => {
      if (res && res.items) {
        setItems((prev) => (append ? [...prev, ...res.items] : res.items))
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

  // Tracks whether the admin has manually touched the class dropdown for
  // the model currently in the input. When true, the auto-detector won't
  // override — the moment they pick a class themselves, that selection
  // sticks until they type a different model. Reset whenever the model
  // string actually changes, so a new model re-opens the auto-detect path.
  const classTouchedRef = useRef(false)
  const lastDetectedModelRef = useRef<string>('')

  const openAdd = () => {
    setEditing(null)
    setModel('')
    setLabel('')
    setWholesale('')
    setVClass('sedan')
    setVType('car')
    classTouchedRef.current = false
    lastDetectedModelRef.current = ''
    // Default to all groups so a brand-new vehicle is visible everywhere
    // unless the admin deliberately narrows it before saving.
    setVehicleGroupIds(groups.map((g) => g.id))
    setFormOpen(true)
  }

  const openEdit = (v: CatalogVehicle) => {
    setEditing(v)
    setModel(v.model)
    setLabel(v.label)
    setWholesale(String(v.wholesale))
    setVClass(v.class)
    setVType(v.vehicle_type)
    // Editing an existing row already has an authoritative class; disable
    // auto-detect by marking touched so the effect below won't clobber it
    // even if it somehow fires.
    classTouchedRef.current = true
    lastDetectedModelRef.current = v.model
    setVehicleGroupIds(Array.isArray(v.groupIds) ? [...v.groupIds] : [])
    setFormOpen(true)
  }

  // Debounced model → class auto-detect. Only runs while creating (the edit
  // flow has a fixed model/class). Server spawns the model off-map invisibly,
  // reads GetVehicleClass, and returns one of vehicleClasses. The result is
  // only applied if the admin hasn't manually picked a class for this model.
  useEffect(() => {
    if (!formOpen || editing) return
    const trimmed = model.trim()
    if (!trimmed) return
    if (trimmed === lastDetectedModelRef.current) return
    const id = setTimeout(() => {
      const target = model.trim()
      if (!target || target !== model.trim()) return
      fetchNui<{ class?: string | null }>('adminDetectVehicleClass', { model: target })
        .then((res) => {
          if (!res?.class) return
          // Admin started typing a new model after the detection request
          // went out — drop the stale response.
          if (target !== model.trim()) return
          if (classTouchedRef.current) return
          if (!vehicleClasses.includes(res.class)) return
          lastDetectedModelRef.current = target
          setVClass(res.class)
        })
        .catch(() => {})
    }, 400)
    return () => clearTimeout(id)
  // classTouchedRef / lastDetectedModelRef are refs; model is the real trigger
  }, [model, formOpen, editing])

  // A typed change to `model` means the admin is targeting a different
  // vehicle, so re-enable auto-detect for the new value.
  const handleModelChange = (value: string) => {
    setModel(value)
    classTouchedRef.current = false
  }

  const handleClassChange = (value: string) => {
    classTouchedRef.current = true
    setVClass(value)
  }

  const toggleVehicleGroup = (id: number) => {
    setVehicleGroupIds((prev) => prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id])
  }

  const handleSave = async () => {
    if (!model.trim() || !label.trim()) return

    if (editing) {
      // Metadata + groups as two separate calls. Mirrors the existing split
      // between `adminUpdateCatalogVehicle` (label/price/class/type) and the
      // async photo upload; keeps each callback tightly scoped.
      await fetchNui('adminUpdateCatalogVehicle', {
        id: editing.id,
        label: label.trim(),
        wholesale: parseInt(wholesale) || 0,
        class: vClass,
        vehicleType: vType,
      })
      await fetchNui('adminSetVehicleGroups', {
        catalogId: editing.id,
        groupIds: vehicleGroupIds,
      })
    } else {
      await fetchNui('adminAddCatalogVehicle', {
        model: model.trim().toLowerCase(),
        label: label.trim(),
        wholesale: parseInt(wholesale) || 0,
        class: vClass,
        vehicleType: vType,
        groupIds: vehicleGroupIds,
      })
    }

    setFormOpen(false)
    resetAndReload()
  }

  const handleRemove = (id: number) => {
    fetchNui('adminRemoveCatalogVehicle', { id }).then(() => resetAndReload())
  }

  // ─── Manage Groups dialog handlers ──────────────────────────────────────

  const openGroupsDialog = () => {
    setGroupEditing(null)
    setFormMode(null)
    setGroupLbl('')
    setGroupDesc('')
    setGroupsOpen(true)
  }

  // Ref on the inline form so create/edit can pull it into view. The form
  // is only mounted when formMode !== null, so rAF-wait a frame before
  // scrolling so the element actually exists in the DOM.
  const groupFormRef = useRef<HTMLDivElement>(null)
  const scrollGroupFormIntoView = () => {
    requestAnimationFrame(() => {
      groupFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    })
  }

  // Derive the backend-facing machine name from the user-entered label.
  // Lowercase, spaces → underscores, strips anything that isn't alnum or
  // underscore. The admin never sees or types this — it's purely the stable
  // key the server keeps in pickle_catalog_groups.name so DB joins and any
  // config that references group names (delivery progression, etc.) keep a
  // consistent slug to point at.
  const slugifyGroupName = (label: string) =>
    label.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')

  const startCreateGroup = () => {
    setGroupEditing(null)
    setGroupLbl('')
    setGroupDesc('')
    setFormMode('create')
    scrollGroupFormIntoView()
  }

  const startEditGroup = (g: CatalogGroup) => {
    setGroupEditing(g)
    setGroupLbl(groupLabel(g))
    setGroupDesc(g.description ?? '')
    setFormMode('edit')
    scrollGroupFormIntoView()
  }

  const cancelGroupForm = () => {
    setGroupEditing(null)
    setFormMode(null)
    setGroupLbl('')
    setGroupDesc('')
  }

  const handleSaveGroup = async () => {
    const trimmedLabel = groupLbl.trim()
    if (!trimmedLabel) return
    if (formMode === 'edit' && groupEditing) {
      // Edits keep the existing internal name — renaming silently would
      // break any config that references it. Server's rename support is
      // still available but deliberately not exposed in the UI.
      await fetchNui('adminUpdateGroup', {
        id: groupEditing.id,
        label: trimmedLabel,
        description: groupDesc.trim() || null,
      })
    } else if (formMode === 'create') {
      const name = slugifyGroupName(trimmedLabel)
      if (!name) return
      await fetchNui('adminCreateGroup', {
        name,
        label: trimmedLabel,
        description: groupDesc.trim() || null,
      })
    }
    cancelGroupForm()
    loadGroups()
  }

  const handleDeleteGroup = async (g: CatalogGroup) => {
    const res = await fetchNui<{ success: boolean }>('adminDeleteGroup', { id: g.id })
    if (res && res.success) {
      if (groupEditing?.id === g.id) cancelGroupForm()
      loadGroups()
      resetAndReload() // vehicle chips may have stale data
    }
  }

  // Shows the first 3 groups as chips; remainder rolls into "+N".
  const renderGroupChips = (ids: number[] | undefined) => {
    const gs = (ids || []).map((id) => groups.find((g) => g.id === id)).filter(Boolean) as CatalogGroup[]
    if (gs.length === 0) {
      return <Badge className="bg-rose-500/15 text-rose-300 border-0 text-[10px]">{t('label_no_groups')}</Badge>
    }
    const visible = gs.slice(0, 3)
    const extra = gs.length - visible.length
    return (
      <>
        {visible.map((g) => (
          <Badge key={g.id} className="bg-accent/15 text-accent border-0 text-[10px]">{groupLabel(g)}</Badge>
        ))}
        {extra > 0 && <Badge className="bg-muted text-muted-foreground border-0 text-[10px]">+{extra}</Badge>}
      </>
    )
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
            {vehicleTypes.map((ty) => <SelectItem key={ty} value={ty}>{typeLabel(ty)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={openGroupsDialog} className="gap-1">
          <Layers className="h-4 w-4" /> {t('admin_manage_groups')}
        </Button>
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
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-sm truncate">{v.label}</p>
                            {renderGroupChips(v.groupIds)}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            <span className="font-mono">{v.model}</span>
                            <span className="mx-1">&middot;</span>
                            <span>{classLabel(v.class)}</span>
                            <span className="mx-1">&middot;</span>
                            <span>{typeLabel(v.vehicle_type)}</span>
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

      {/* Add / Edit vehicle */}
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
                <Input value={model} onChange={(e) => handleModelChange(e.target.value)} placeholder="e.g. sultan" className="mt-1 font-mono" disabled={!!editing} />
              </div>
              <div>
                <label className="text-sm font-medium">{t('label_label')}</label>
                <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Sultan" className="mt-1" />
              </div>
            </div>
            {/* Wholesale / class / type share a row to keep the modal short
                now that the groups checklist lives below. */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-sm font-medium">{t('label_wholesale_cost')}</label>
                <Input type="number" value={wholesale} onChange={(e) => setWholesale(e.target.value)} placeholder="15000" className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">{t('label_class')}</label>
                <Select value={vClass} onValueChange={handleClassChange}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {vehicleClasses.map((c) => <SelectItem key={c} value={c}>{classLabel(c)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">{t('label_type')}</label>
                <Select value={vType} onValueChange={setVType}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {vehicleTypes.map((ty) => <SelectItem key={ty} value={ty}>{typeLabel(ty)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">{t('admin_groups')}</label>
              <p className="text-xs text-muted-foreground">{t('admin_vehicle_groups_desc')}</p>
              {groups.length === 0 ? (
                <p className="text-xs text-muted-foreground mt-2">{t('admin_no_groups_yet')}</p>
              ) : (
                <div className="mt-2 max-h-32 overflow-auto rounded-md border border-border bg-muted/30 divide-y divide-border/60">
                  {groups.map((g) => {
                    const checked = vehicleGroupIds.includes(g.id)
                    return (
                      <label key={g.id} className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-muted/60 text-sm">
                        <input type="checkbox" className="h-4 w-4 accent-accent" checked={checked} onChange={() => toggleVehicleGroup(g.id)} />
                        <span className="flex-1">{groupLabel(g)}</span>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setFormOpen(false)}>{t('btn_cancel')}</Button>
              {/* Gate the submit button until model, label, and a positive
                  wholesale price are all present. Class and type always
                  have valid defaults; groups are intentionally optional. */}
              <Button
                className="flex-1"
                onClick={handleSave}
                disabled={
                  !model.trim() ||
                  !label.trim() ||
                  !(parseInt(wholesale) > 0)
                }
              >
                {editing ? t('btn_save_changes') : t('btn_add_vehicle')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Manage Groups */}
      <Dialog open={groupsOpen} onOpenChange={setGroupsOpen}>
        <DialogContent onClose={() => setGroupsOpen(false)} className="max-w-lg max-h-full !grid-rows-[auto_1fr_auto] !gap-0 p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-4 border-b border-border">
            <DialogTitle>{t('admin_manage_groups')}</DialogTitle>
            <DialogDescription>{t('admin_groups_desc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-6 py-4 overflow-y-auto min-h-0">
            <div className="rounded-md border border-border bg-muted/30 divide-y divide-border/60">
              {groups.length === 0 ? (
                <p className="px-3 py-3 text-xs text-muted-foreground">{t('admin_no_groups_yet')}</p>
              ) : groups.map((g) => {
                const isActive = groupEditing?.id === g.id && formMode === 'edit'
                return (
                  <div key={g.id} className={`flex items-center gap-2 px-3 py-2 text-sm ${isActive ? 'bg-accent/10' : ''}`}>
                    <button className="flex-1 text-left hover:text-accent" onClick={() => startEditGroup(g)}>
                      <p className="font-medium">{groupLabel(g)}</p>
                      <p className="text-[10px] text-muted-foreground">{g.vehicle_count ?? 0} vehicles · {g.dealership_count ?? 0} shops</p>
                    </button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteGroup(g)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )
              })}

              {/* Inline form OR "+ Create Group" row. Only one is shown at a
                  time — the form takes the create row's slot when active so
                  the dialog stays compact when the admin isn't editing. */}
              {formMode !== null ? (
                <div ref={groupFormRef} className="px-3 py-3 space-y-3 bg-muted/20">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    {formMode === 'edit' ? t('admin_editing_group') : t('admin_creating_group')}
                  </p>
                  <div>
                    <label className="text-xs font-medium">{t('admin_group_label')}</label>
                    <Input
                      value={groupLbl}
                      onChange={(e) => setGroupLbl(e.target.value)}
                      placeholder="e.g. Premium Fleet"
                      className="mt-1"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium">{t('admin_group_description')}</label>
                    <Input
                      value={groupDesc}
                      onChange={(e) => setGroupDesc(e.target.value)}
                      placeholder={t('admin_optional')}
                      className="mt-1"
                    />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button variant="outline" size="sm" className="flex-1" onClick={cancelGroupForm}>
                      {t('btn_cancel')}
                    </Button>
                    <Button size="sm" className="flex-1" onClick={handleSaveGroup} disabled={!groupLbl.trim()}>
                      {formMode === 'edit' ? t('btn_save_changes') : t('admin_create_group')}
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={startCreateGroup}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-accent hover:bg-muted/60 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>{t('admin_create_group')}</span>
                </button>
              )}
            </div>
          </div>
          <div className="p-6 pt-4 border-t border-border">
            <Button variant="outline" className="w-full" onClick={() => setGroupsOpen(false)}>{t('btn_close')}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
