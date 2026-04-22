import { useEffect, useState, useRef } from 'react'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { ScrollArea } from '../components/ui/scroll-area'
import { Separator } from '../components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog'
import { fetchNui, formatCurrency } from '../lib/utils'
import {
  X, Settings, UserRoundCog, DollarSign, RotateCcw,
  ToggleLeft, Plus, MapPin, Check, Car, Crosshair, Store, ParkingSquare,
  Handshake, Building2, BookOpen, Trash2, Briefcase, Users, Shield, ShieldAlert, Truck, Download, Layers,
} from 'lucide-react'
import { SkeletonList } from '../components/ui/skeleton'
import { t } from '../lib/locale'
import type { DealershipData, AdminDealership, DealershipMetadata, PositionData, DeliveryDepot, FactionType } from '../types'
import AdminCatalogPage from './AdminCatalogPage'
import ImportPage from './ImportPage'
import SocietyAllowlistSettings from '../components/SocietyAllowlistSettings'

interface Props {
  data: DealershipData
  onClose: () => void
}

type AdminTab = 'dealerships' | 'catalog' | 'positions' | 'depots' | 'import'
type AdminAction = 'transfer' | 'balance' | 'reset' | 'toggle' | 'seize' | 'create' | 'delete' | 'faction' | 'access' | 'payments' | 'society' | 'stockAll' | 'groups' | null

interface CatalogGroup {
  id: number
  name: string
  label: string
  description?: string | null
  is_default?: number | boolean
  vehicle_count?: number
  dealership_count?: number
}

// Mirrors the helper in AdminCatalogPage.tsx — keeps seeded default groups
// localized even if an admin hasn't overridden the label.
function resolveGroupLabel(g: CatalogGroup) {
  if (g.is_default) {
    const localized = t(`group_${g.name}`)
    if (localized && localized !== `group_${g.name}`) return localized
  }
  return g.label || g.name
}

function parseMeta(d: AdminDealership | null): DealershipMetadata {
  if (!d) return {}
  let meta = d.metadata as unknown
  if (typeof meta === 'string') {
    try { meta = JSON.parse(meta) } catch { return {} }
  }
  return (meta && typeof meta === 'object' ? meta : {}) as DealershipMetadata
}

function getFactionType(d: AdminDealership | null): FactionType {
  const ft = parseMeta(d).factionType
  return ft === 'gang' ? 'gang' : 'job'
}

function getAccessMode(d: AdminDealership | null): 'public' | 'faction' {
  return parseMeta(d).accessMode === 'faction' ? 'faction' : 'public'
}

function getAccessMinGrade(d: AdminDealership | null): number {
  return parseMeta(d).accessMinGrade ?? 0
}

function getAcceptedAlt(d: AdminDealership | null): string[] {
  const list = parseMeta(d).acceptedAltCurrencies
  return Array.isArray(list) ? list : []
}

export default function AdminPage({ data, onClose }: Props) {
  const [tab, setTab] = useState<AdminTab>((data.initialTab as AdminTab) || 'dealerships')
  const [dealerships, setDealerships] = useState<AdminDealership[]>([])
  const [loading, setLoading] = useState(true)

  // Sync tab when reopened with a different initialTab (e.g. returning from photo booth)
  useEffect(() => {
    if (data.initialTab) setTab(data.initialTab as AdminTab)
  }, [data.initialTab])

  // When the panel re-opens after placing a dealership position, scroll the row
  // the admin was just interacting with back into view so they can continue
  // without re-scrolling each time.
  useEffect(() => {
    const f = data.pendingDealership?.lastField
    if (!f) return
    const t = setTimeout(() => {
      const el = document.getElementById('pos-' + f)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 150)
    return () => clearTimeout(t)
  }, [data.pendingDealership])
  const [selected, setSelected] = useState<AdminDealership | null>(null)
  const [action, setAction] = useState<AdminAction>(data.pendingDealership ? 'create' : null)
  const [inputValue, setInputValue] = useState('')
  const [factionTypeInput, setFactionTypeInput] = useState<FactionType>('job')
  const [accessModeInput, setAccessModeInput] = useState<'public' | 'faction'>('public')
  const [accessGradeInput, setAccessGradeInput] = useState('0')
  const [altCurrencyOptions, setAltCurrencyOptions] = useState<{ key: string; label: string; type: string; valuePerUnit: number }[]>([])
  const [altAcceptedInput, setAltAcceptedInput] = useState<string[]>([])
  const [basePaymentsInput, setBasePaymentsInput] = useState<{ cash: boolean; bank: boolean }>({ cash: true, bank: true })

  const [dealershipDraft, setDealershipDraft] = useState<{
    name: string
    mode: string
    type: string
    factionType: FactionType
    factionName: string
    ownerIdentifier: string
    groupIds?: number[]
    coords?: PositionData
    spawnPoint?: PositionData
    deliveryPoint?: PositionData
    managementPoint?: PositionData
    salesPoint?: PositionData
    showroomPoint?: PositionData
    displaySpots?: PositionData[]
    npcSpawnPoints?: PositionData[]
  }>({
    name: data.pendingDealership?.name ?? '',
    mode: data.pendingDealership?.mode ?? 'player-owned',
    type: data.pendingDealership?.type ?? 'car',
    factionType: data.pendingDealership?.factionType ?? 'job',
    factionName: data.pendingDealership?.factionName ?? '',
    ownerIdentifier: data.pendingDealership?.ownerIdentifier ?? '',
    groupIds: data.pendingDealership?.groupIds,
    coords: data.pendingDealership?.coords,
    spawnPoint: data.pendingDealership?.spawnPoint,
    deliveryPoint: data.pendingDealership?.deliveryPoint,
    managementPoint: data.pendingDealership?.managementPoint,
    salesPoint: data.pendingDealership?.salesPoint,
    showroomPoint: data.pendingDealership?.showroomPoint,
    displaySpots: data.pendingDealership?.displaySpots,
    npcSpawnPoints: data.pendingDealership?.npcSpawnPoints,
  })

  // List of every catalog group — loaded once on mount and refreshed after
  // catalog-side edits via AdminCatalogPage. Used by both the Groups settings
  // dialog and the create-dealership group multi-select.
  const [catalogGroups, setCatalogGroups] = useState<CatalogGroup[]>([])
  useEffect(() => {
    fetchNui<CatalogGroup[]>('adminGetGroups', {}).then((rows) => setCatalogGroups(Array.isArray(rows) ? rows : []))
      .catch(() => setCatalogGroups([]))
  }, [])
  // Currently-assigned groups for the selected dealership (seeded from the
  // server when the Groups dialog opens).
  const [dealershipGroupIds, setDealershipGroupIds] = useState<number[]>([])

  // Player picker state for "Owner" field when mode == 'player-owned'
  const [createOwnerSearch, setCreateOwnerSearch] = useState('')
  const [createOwnerPicker, setCreateOwnerPicker] = useState(false)

  // Confirmation before discarding the create draft when the player closes the
  // dialog via Cancel / X / backdrop / Escape. Keeps admins from losing a stack
  // of placed spots to an accidental keypress.
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false)

  const hasCreateDraftContent = () => {
    const d = dealershipDraft
    return !!(
      d.name.trim() ||
      d.factionName.trim() ||
      d.ownerIdentifier ||
      d.coords || d.spawnPoint || d.deliveryPoint ||
      d.managementPoint || d.salesPoint || d.showroomPoint ||
      (d.displaySpots && d.displaySpots.length > 0) ||
      (d.npcSpawnPoints && d.npcSpawnPoints.length > 0)
    )
  }

  const closeCreateDialog = () => {
    setAction(null)
    setDiscardConfirmOpen(false)
    setDealershipDraft({
      name: '', mode: 'player-owned', type: 'car',
      factionType: 'job', factionName: '', ownerIdentifier: '',
    })
    setCreateOwnerSearch('')
    setCreateOwnerPicker(false)
    fetchNui('adminEndCreateFlow', {})
  }

  const attemptCloseCreate = () => {
    if (hasCreateDraftContent()) {
      setDiscardConfirmOpen(true)
    } else {
      closeCreateDialog()
    }
  }

  // Sync placed display spots / NPC spawn points to the Lua preview thread so
  // the admin can see everything they've already placed while the dialog is
  // open — not only during the moment of gizmo placement.
  useEffect(() => {
    if (action !== 'create') {
      fetchNui('adminEndCreateFlow', {})
      return
    }
    fetchNui('adminUpdateCreateFlow', {
      draft: {
        displaySpots: dealershipDraft.displaySpots ?? [],
        npcSpawnPoints: dealershipDraft.npcSpawnPoints ?? [],
      },
    })
  }, [action, dealershipDraft.displaySpots, dealershipDraft.npcSpawnPoints])

  // Intercept Escape while the create dialog is open: without this, App.tsx's
  // window-level Escape handler would close the entire NUI and discard the
  // draft with no confirmation. Capture-phase so we run before App.tsx.
  useEffect(() => {
    if (action !== 'create') return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      e.preventDefault()
      if (discardConfirmOpen) {
        setDiscardConfirmOpen(false)
      } else {
        attemptCloseCreate()
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [action, discardConfirmOpen, dealershipDraft])

  // Transfer ownership
  const [onlinePlayers, setOnlinePlayers] = useState<{ source: number; name: string; identifier: string }[]>([])
  const [playerSearch, setPlayerSearch] = useState('')
  const [selectedPlayer, setSelectedPlayer] = useState<{ source: number; name: string; identifier: string } | null>(null)

  // Depot management — create dialog (draft state + both points placed via gizmo before create)
  const [depots, setDepots] = useState<DeliveryDepot[]>([])
  const [depotLoading, setDepotLoading] = useState(false)
  const [depotCreateOpen, setDepotCreateOpen] = useState<boolean>(!!data.pendingDepot)
  const [depotDraft, setDepotDraft] = useState<{
    name: string
    pickupCoords?: PositionData
    spawnCoords?: PositionData
  }>({
    name: data.pendingDepot?.name ?? '',
    pickupCoords: data.pendingDepot?.pickupCoords,
    spawnCoords: data.pendingDepot?.spawnCoords,
  })

  // Depot edit modal — opens when a depot card is clicked
  const [editDepot, setEditDepot] = useState<DeliveryDepot | null>(null)
  const [editDepotName, setEditDepotName] = useState('')

  const loadDepots = () => {
    setDepotLoading(true)
    fetchNui<DeliveryDepot[]>('adminGetDepots', {}).then((r) => {
      setDepots(r || [])
      setDepotLoading(false)
    }).catch(() => setDepotLoading(false))
  }

  useEffect(() => { if (tab === 'depots') loadDepots() }, [tab])

  // When the NUI reopens with editDepotId (after editing a point via gizmo), auto-open that depot's modal
  useEffect(() => {
    if (data.editDepotId && depots.length > 0) {
      const d = depots.find((x) => x.id === data.editDepotId)
      if (d) {
        setEditDepot(d)
        setEditDepotName(d.name)
      }
    }
  }, [data.editDepotId, depots])

  const openDepotCreate = () => {
    setDepotDraft({ name: '', pickupCoords: undefined, spawnCoords: undefined })
    setDepotCreateOpen(true)
  }

  const handleDraftPlace = (field: 'pickup' | 'spawn') => {
    // Hand the current draft to the client so it can repopulate us on re-open
    fetchNui('adminPlaceDepotPoint', { field, draft: depotDraft })
  }

  const handleCreateDepot = async () => {
    if (!depotDraft.name.trim() || !depotDraft.pickupCoords || !depotDraft.spawnCoords) return
    const res = await fetchNui<{ ok: boolean }>('adminCreateDepot', {
      name: depotDraft.name.trim(),
      pickupCoords: depotDraft.pickupCoords,
      spawnCoords: depotDraft.spawnCoords,
    })
    if (res?.ok) {
      setDepotCreateOpen(false)
      setDepotDraft({ name: '', pickupCoords: undefined, spawnCoords: undefined })
      loadDepots()
    }
  }

  const handleDeleteDepot = async (id: number) => {
    const res = await fetchNui<{ ok: boolean }>('adminDeleteDepot', { id })
    if (res?.ok) {
      setEditDepot(null)
      loadDepots()
    }
  }

  const handleWaypointDepot = (id: number) => {
    fetchNui('adminWaypointDepot', { id })
  }

  const handleRenameDepot = async (id: number, name: string) => {
    const res = await fetchNui<{ ok: boolean }>('adminUpdateDepot', { id, fields: { name } })
    if (res?.ok) loadDepots()
  }

  // Edit an existing depot's pickup or spawn point via the same gizmo flow (seeded at current coord)
  const handleEditPoint = (id: number, field: 'pickup' | 'spawn') => {
    fetchNui('adminEditDepotPoint', { id, field })
  }

  // Positions management
  const [positionsDealership, setPositionsDealership] = useState<AdminDealership | null>(null)
  const [positionsMeta, setPositionsMeta] = useState<DealershipMetadata>(data.metadata ?? {})
  const [shouldScrollToSpots, setShouldScrollToSpots] = useState(data.scrollToSpots ?? false)
  const spotsEndRef = useRef<HTMLDivElement>(null)

  const parseMeta = (meta: DealershipMetadata | string | null | undefined): DealershipMetadata => {
    if (!meta) return {}
    if (typeof meta === 'string') {
      try { return JSON.parse(meta) } catch { return {} }
    }
    return meta
  }

  const openPositions = (d: AdminDealership) => {
    setPositionsDealership(d)
    setPositionsMeta(parseMeta(d.metadata))
    setTab('positions')
  }

  const loadDealerships = () => {
    setLoading(true)
    fetchNui<{ success: boolean; dealerships: AdminDealership[] }>('adminGetAllDealerships', {}).then((res) => {
      if (res.success && res.dealerships) setDealerships(res.dealerships)
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  useEffect(() => { loadDealerships() }, [])

  // If re-opened with positionsDealershipId, go straight to positions tab
  useEffect(() => {
    if (data.positionsDealershipId && dealerships.length > 0) {
      const d = dealerships.find((dl) => dl.id === data.positionsDealershipId)
      if (d) {
        setPositionsDealership(d)
        setPositionsMeta(data.metadata ? parseMeta(data.metadata) : parseMeta(d.metadata))
        setTab('positions')
      }
    }
  }, [dealerships])

  // Scroll to bottom of spots list after adding a new one
  useEffect(() => {
    if (shouldScrollToSpots && tab === 'positions' && spotsEndRef.current) {
      spotsEndRef.current.scrollIntoView({ behavior: 'smooth' })
      setShouldScrollToSpots(false)
    }
  }, [shouldScrollToSpots, tab, positionsMeta])

  const handleAction = () => {
    if (action === 'create') {
      if (!dealershipDraft.name.trim()) return
      fetchNui<{ success: boolean; dealershipId: number }>('adminCreateDealership', {
        label: dealershipDraft.name.trim(),
        mode: dealershipDraft.mode,
        type: dealershipDraft.type,
        factionType: dealershipDraft.factionType,
        factionName: dealershipDraft.factionName.trim(),
        ownerIdentifier: dealershipDraft.mode === 'player-owned' ? dealershipDraft.ownerIdentifier.trim() : '',
        groupIds: dealershipDraft.groupIds,
        coords: dealershipDraft.coords,
        spawnPoint: dealershipDraft.spawnPoint,
        deliveryPoint: dealershipDraft.deliveryPoint,
        managementPoint: dealershipDraft.managementPoint,
        salesPoint: dealershipDraft.salesPoint,
        showroomPoint: dealershipDraft.showroomPoint,
        displaySpots: dealershipDraft.displaySpots,
        npcSpawnPoints: dealershipDraft.npcSpawnPoints,
      }).then(() => {
        closeCreateDialog()
        loadDealerships()
      })
      return
    }

    if (!selected || !action) return
    const dealershipId = selected.id
    const callbacks: Record<string, () => Promise<void>> = {
      transfer: () => fetchNui('adminTransferOwnership', { dealershipId, newOwnerId: selectedPlayer?.identifier || inputValue }).then(() => loadDealerships()),
      balance: () => fetchNui('adminSetBalance', { dealershipId, amount: parseInt(inputValue) }).then(() => loadDealerships()),
      groups: () => fetchNui('adminSetDealershipGroups', { dealershipId, groupIds: dealershipGroupIds }).then(() => loadDealerships()),
      reset: () => fetchNui('adminResetDealership', { dealershipId }).then(() => loadDealerships()),
      delete: () => fetchNui('adminDeleteDealership', { dealershipId }).then(() => {
        setSelected(null)
        loadDealerships()
      }),
      faction: () => fetchNui('adminSetFaction', {
        dealershipId,
        name: inputValue.trim(),
        factionType: factionTypeInput,
      }).then(() => loadDealerships()),
      access: () => fetchNui('adminSetAccess', {
        dealershipId,
        mode: accessModeInput,
        minGrade: parseInt(accessGradeInput) || 0,
      }).then(() => loadDealerships()),
      payments: () => fetchNui('adminSetAltCurrencies', {
        dealershipId,
        accepted: altAcceptedInput,
        base: basePaymentsInput,
      }).then(() => loadDealerships()),
      toggle: () => fetchNui('adminToggleMode', { dealershipId }).then(() => loadDealerships()),
      seize: () => fetchNui('adminToggleSeize', { dealershipId }).then(() => loadDealerships()),
      stockAll: () => fetchNui('adminStockAllFromCatalog', { dealershipId, quantity: Math.max(1, parseInt(inputValue) || 1) }).then(() => loadDealerships()),
    }
    callbacks[action]?.().then(() => {
      setAction(null)
      setInputValue('')
      // Refresh dealership list and update the selected dealership in-place
      fetchNui<{ success: boolean; dealerships: AdminDealership[] }>('adminGetAllDealerships', {}).then((res) => {
        if (res.success && res.dealerships) {
          setDealerships(res.dealerships)
          if (selected) {
            const updated = res.dealerships.find((d) => d.id === selected.id)
            setSelected(updated || null)
          }
        }
      })
    })
  }

  const startGizmo = (field: string, pointType?: string) => {
    if (!positionsDealership) return
    fetchNui<{ success: boolean; metadata?: DealershipMetadata }>('adminStartGizmo', {
      dealershipId: positionsDealership.id, field, pointType,
    }).then((res) => {
      if (res.success && res.metadata) setPositionsMeta(res.metadata)
    })
  }

  const removePosition = (field: string, opts?: { pointType?: string; spotId?: number; index?: number }) => {
    if (!positionsDealership) return
    fetchNui<{ success: boolean; metadata?: DealershipMetadata }>('adminRemovePosition', {
      dealershipId: positionsDealership.id, field, pointType: opts?.pointType, spotId: opts?.spotId, index: opts?.index,
    }).then((res) => {
      if (res.success && res.metadata) setPositionsMeta(res.metadata)
    })
  }

  // Tier labels were retired when catalog access moved to groups; the DB column
  // is still present for rollback safety but the UI no longer exposes it.

  const renderContent = () => {
    // Positions tab
    if (tab === 'positions' && positionsDealership) {
      const spots = positionsMeta.displaySpots ?? []
      const interactions = positionsMeta.interactionPoints ?? {}
      const npcSpawns = positionsMeta.npcSpawnPoints ?? []

      return (
        <div className="flex flex-col h-full">
          <div className="p-4 pb-0">
            <h2 className="font-bold text-sm">{positionsDealership.name}</h2>
            <p className="text-xs text-muted-foreground">{t('title_manage_positions')}</p>
          </div>
          <Separator className="mt-3" />
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-3">
              <PositionRow
                icon={<Crosshair className="h-4 w-4" />}
                label={t('label_dealership_center')}
                description={t('label_blips_zone')}
                placed={!!positionsMeta.coords}
                coords={positionsMeta.coords}
                onPlace={() => startGizmo('coords')}
                onRemove={() => removePosition('coords')}
              />
              <PositionRow
                icon={<Car className="h-4 w-4" />}
                label={t('label_vehicle_spawn_point')}
                description={t('label_purchased_spawn')}
                placed={!!positionsMeta.spawnPoint}
                coords={positionsMeta.spawnPoint}
                onPlace={() => startGizmo('spawnPoint')}
                onRemove={() => removePosition('spawnPoint')}
              />
              <PositionRow
                icon={<Truck className="h-4 w-4" />}
                label={t('label_delivery_point')}
                description={t('label_delivery_point_desc')}
                placed={!!positionsMeta.deliveryPoint}
                coords={positionsMeta.deliveryPoint}
                onPlace={() => startGizmo('deliveryPoint')}
                onRemove={() => removePosition('deliveryPoint')}
              />
              <PositionRow
                icon={<Store className="h-4 w-4" />}
                label={t('label_management_point')}
                description={t('label_owner_manager_access')}
                placed={!!interactions.management}
                coords={interactions.management}
                onPlace={() => startGizmo('interactionPoint', 'management')}
                onRemove={() => removePosition('interactionPoint', { pointType: 'management' })}
              />
              <PositionRow
                icon={<Handshake className="h-4 w-4" />}
                label={t('label_sales_point')}
                description={t('label_view_vehicles_access')}
                placed={!!interactions.sales}
                coords={interactions.sales}
                onPlace={() => startGizmo('interactionPoint', 'sales')}
                onRemove={() => removePosition('interactionPoint', { pointType: 'sales' })}
              />
              <PositionRow
                icon={<Car className="h-4 w-4" />}
                label={t('label_showroom_position')}
                description={t('label_showroom_preview')}
                placed={!!interactions.showroom}
                coords={interactions.showroom}
                onPlace={() => startGizmo('interactionPoint', 'showroom')}
                onRemove={() => removePosition('interactionPoint', { pointType: 'showroom' })}
              />

              {/* Display Spots */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center">
                        <ParkingSquare className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{t('label_display_spots')}</p>
                        <p className="text-xs text-muted-foreground">{t('admin_spots_placed', String(spots.length))}</p>
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => startGizmo('displaySpot')} className="gap-1">
                      <Plus className="h-3 w-3" /> {t('admin_add')}
                    </Button>
                  </div>
                  {spots.length > 0 && (
                    <div className="space-y-1.5 mt-3">
                      {spots.map((spot, i) => (
                        <div key={i} className="flex items-center justify-between bg-muted/50 rounded px-3 py-2">
                          <span className="text-xs text-muted-foreground font-mono">
                            {t('admin_spot')} #{i + 1}: {spot.x.toFixed(1)}, {spot.y.toFixed(1)}, {spot.z.toFixed(1)} · {(spot.w ?? 0).toFixed(1)}°
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive"
                            onClick={() => removePosition('displaySpot', { spotId: spot.id })}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div ref={spotsEndRef} />
                </CardContent>
              </Card>

              {/* NPC Spawn Points */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center">
                        <Users className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{t('label_npc_spawn_points')}</p>
                        <p className="text-xs text-muted-foreground">
                          {t('admin_npc_points_desc', String(npcSpawns.length))}
                        </p>
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => startGizmo('npcSpawnPoint')} className="gap-1">
                      <Plus className="h-3 w-3" /> {t('admin_add')}
                    </Button>
                  </div>
                  {npcSpawns.length > 0 && (
                    <div className="space-y-1.5 mt-3">
                      {npcSpawns.map((point, i) => (
                        <div key={i} className="flex items-center justify-between bg-muted/50 rounded px-3 py-2">
                          <span className="text-xs text-muted-foreground font-mono">
                            #{i + 1}: {point.x.toFixed(1)}, {point.y.toFixed(1)}, {point.z.toFixed(1)} · {(point.w ?? 0).toFixed(1)}°
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive"
                            onClick={() => removePosition('npcSpawnPoint', { index: i + 1 })}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </ScrollArea>
        </div>
      )
    }

    // Catalog tab
    if (tab === 'catalog') {
      return <AdminCatalogPage />
    }

    // Import tab
    if (tab === 'import') {
      return <ImportPage onImported={() => { loadDealerships(); loadDepots() }} />
    }

    // Depots tab
    if (tab === 'depots') {
      return (
        <div className="relative flex-1 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-border flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <MapPin className="h-4 w-4 text-accent" /> {t('admin_delivery_depots')}
              </h3>
              <p className="text-xs text-muted-foreground mt-1">{t('admin_delivery_depots_desc')}</p>
            </div>
            <Button size="sm" onClick={openDepotCreate} className="gap-1 shrink-0">
              <Plus className="h-4 w-4" /> {t('admin_depot_create')}
            </Button>
          </div>
          <ScrollArea className="flex-1 p-4">
            {depotLoading ? (
              <SkeletonList count={3} />
            ) : depots.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">{t('admin_no_depots')}</div>
            ) : (
              <div className="space-y-2">
                {depots.map((d) => (
                  <Card
                    key={d.id}
                    className="overflow-hidden hover:border-accent/40 transition-colors cursor-pointer"
                    onClick={() => { setEditDepot(d); setEditDepotName(d.name) }}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <h3 className="font-semibold text-sm truncate">{d.name}</h3>
                          <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                            {t('admin_depot_ped_label')}: {d.pickupCoords.x.toFixed(1)}, {d.pickupCoords.y.toFixed(1)}, {d.pickupCoords.z.toFixed(1)}
                          </p>
                          <p className="text-[10px] text-muted-foreground/80 font-mono">
                            {t('admin_depot_spawn_label')}: {d.spawnCoords
                              ? `${d.spawnCoords.x.toFixed(1)}, ${d.spawnCoords.y.toFixed(1)}, ${d.spawnCoords.z.toFixed(1)}`
                              : t('admin_depot_spawn_fallback')}
                          </p>
                        </div>
                        <Settings className="h-4 w-4 text-muted-foreground shrink-0 ml-3" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Create depot dialog — name + both points must be placed before Create enables */}
          <Dialog open={depotCreateOpen} onOpenChange={(open) => { if (!open) setDepotCreateOpen(false) }}>
            <DialogContent onClose={() => setDepotCreateOpen(false)}>
              <DialogHeader>
                <DialogTitle>{t('admin_depot_create')}</DialogTitle>
                <DialogDescription>{t('admin_depot_create_desc')}</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 pt-2">
                <div>
                  <label className="text-sm font-medium">{t('label_name')}</label>
                  <Input
                    value={depotDraft.name}
                    onChange={(e) => setDepotDraft({ ...depotDraft, name: e.target.value })}
                    placeholder={t('admin_depot_name_placeholder')}
                    className="mt-1"
                    maxLength={50}
                  />
                </div>
                <PositionRow
                  icon={<Users className="h-4 w-4" />}
                  label={t('admin_depot_interact_location')}
                  description={t('admin_depot_interact_desc')}
                  placed={!!depotDraft.pickupCoords}
                  coords={depotDraft.pickupCoords}
                  onPlace={() => handleDraftPlace('pickup')}
                  onRemove={() => setDepotDraft({ ...depotDraft, pickupCoords: undefined })}
                />
                <PositionRow
                  icon={<Truck className="h-4 w-4" />}
                  label={t('admin_depot_spawn_location')}
                  description={t('admin_depot_spawn_desc')}
                  placed={!!depotDraft.spawnCoords}
                  coords={depotDraft.spawnCoords}
                  onPlace={() => handleDraftPlace('spawn')}
                  onRemove={() => setDepotDraft({ ...depotDraft, spawnCoords: undefined })}
                />
                <div className="flex gap-2 pt-1">
                  <Button variant="outline" className="flex-1" onClick={() => setDepotCreateOpen(false)}>{t('btn_cancel')}</Button>
                  <Button
                    className="flex-1"
                    onClick={handleCreateDepot}
                    disabled={!depotDraft.name.trim() || !depotDraft.pickupCoords || !depotDraft.spawnCoords}
                  >
                    <Plus className="h-4 w-4" /> {t('btn_create')}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Edit depot modal — matches dealership settings-modal pattern */}
          {editDepot && (
            <>
              <div className="absolute inset-0 z-40 bg-black/50 rounded-[inherit]" onClick={() => setEditDepot(null)} />
              <div className="absolute inset-0 z-50 flex items-center justify-center p-6 pointer-events-none" style={{ overflow: 'hidden' }}>
                <div className="pointer-events-auto relative flex flex-col w-full border border-border bg-card shadow-lg rounded-lg" style={{ maxWidth: '24rem', maxHeight: 'calc(100% - 2rem)', overflow: 'hidden' }}>
                  <div className="p-6 pb-3 shrink-0">
                    <button className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none" onClick={() => setEditDepot(null)}>
                      <X className="h-4 w-4" />
                    </button>
                    <h2 className="text-lg font-semibold leading-none tracking-tight">{editDepot.name}</h2>
                    <p className="text-sm text-muted-foreground mt-1.5">ID: {editDepot.id}</p>
                  </div>
                  <div className="flex-1 overflow-y-auto px-6 pb-6" style={{ minHeight: 0 }}>
                    <div className="space-y-2">
                      <div>
                        <label className="text-xs text-muted-foreground">{t('label_name')}</label>
                        <div className="flex gap-2 mt-1">
                          <Input
                            value={editDepotName}
                            onChange={(e) => setEditDepotName(e.target.value)}
                            className="flex-1"
                            maxLength={50}
                          />
                          <Button
                            size="sm"
                            onClick={() => {
                              if (editDepotName.trim() && editDepotName !== editDepot.name) {
                                handleRenameDepot(editDepot.id, editDepotName.trim())
                                setEditDepot({ ...editDepot, name: editDepotName.trim() })
                              }
                            }}
                            disabled={!editDepotName.trim() || editDepotName === editDepot.name}
                          >
                            {t('btn_save')}
                          </Button>
                        </div>
                      </div>
                    </div>
                    <Separator className="my-3" />
                    <div className="space-y-2">
                      <PositionRow
                        icon={<Users className="h-4 w-4" />}
                        label={t('admin_depot_interact_location')}
                        description={t('admin_depot_interact_desc')}
                        placed={!!editDepot.pickupCoords}
                        coords={editDepot.pickupCoords}
                        onPlace={() => handleEditPoint(editDepot.id, 'pickup')}
                        onRemove={() => {}}
                        hideRemove
                      />
                      <PositionRow
                        icon={<Truck className="h-4 w-4" />}
                        label={t('admin_depot_spawn_location')}
                        description={t('admin_depot_spawn_desc')}
                        placed={!!editDepot.spawnCoords}
                        coords={editDepot.spawnCoords ?? undefined}
                        onPlace={() => handleEditPoint(editDepot.id, 'spawn')}
                        onRemove={() => {}}
                        hideRemove
                      />
                    </div>
                    <Separator className="my-3" />
                    <div className="space-y-0.5">
                      <SettingsRow
                        icon={<MapPin className="h-4 w-4" />}
                        label={t('admin_depot_waypoint')}
                        onClick={() => handleWaypointDepot(editDepot.id)}
                      />
                      <SettingsRow
                        icon={<Trash2 className="h-4 w-4" />}
                        label={t('admin_depot_delete')}
                        destructive
                        onClick={() => handleDeleteDepot(editDepot.id)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )
    }

    // Dealerships tab
    return (
      <div className="relative flex-1 flex flex-col overflow-hidden">
        <div className="p-4 flex justify-end">
          <Button size="sm" onClick={() => setAction('create')} className="gap-1"><Plus className="h-4 w-4" /> {t('admin_create_dealership')}</Button>
        </div>
        <ScrollArea className="flex-1 px-4 pb-4">
          {loading ? (
            <SkeletonList count={3} />
          ) : dealerships.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground">{t('admin_no_dealerships')}</div>
          ) : (
            <div className="space-y-2">
              {dealerships.map((d) => (
                <Card key={d.id} className="overflow-hidden hover:border-accent/40 transition-colors cursor-pointer" onClick={() => { setSelected(d); setAction(null) }}>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-sm truncate">{d.name}</h3>
                          <Badge variant="outline" className="text-[10px] capitalize shrink-0">{d.mode}</Badge>
                          <Badge variant="secondary" className="text-[10px] capitalize shrink-0">{d.type}</Badge>
                          {!!d.seize_enabled && <Badge variant="destructive" className="text-[10px] shrink-0">{t('label_seize')}</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          ID: {d.id} &mdash; {formatCurrency(d.balance)}
                          {d.job && <> &mdash; <span className="font-mono">{d.job}</span></>}
                        </p>
                      </div>
                      <Settings className="h-4 w-4 text-muted-foreground shrink-0 ml-3" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Dealership settings modal — rendered manually to guarantee height constraint in CEF */}
        {selected && !action && (
          <>
            <div className="absolute inset-0 z-40 bg-black/50 rounded-[inherit]" onClick={() => setSelected(null)} />
            <div className="absolute inset-0 z-50 flex items-center justify-center p-6 pointer-events-none" style={{ overflow: 'hidden' }}>
              <div className="pointer-events-auto relative flex flex-col w-full border border-border bg-card shadow-lg rounded-lg" style={{ maxWidth: '24rem', maxHeight: 'calc(100% - 2rem)', overflow: 'hidden' }}>
                {/* Header — fixed */}
                <div className="p-6 pb-3 shrink-0">
                  <button className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none" onClick={() => setSelected(null)}>
                    <X className="h-4 w-4" />
                  </button>
                  <h2 className="text-lg font-semibold leading-none tracking-tight">{selected.name}</h2>
                  <p className="text-sm text-muted-foreground mt-1.5">
                    ID: {selected.id} &mdash; {formatCurrency(selected.balance)}
                  </p>
                </div>
                {/* Body — scrollable */}
                <div className="flex-1 overflow-y-auto px-6 pb-6" style={{ minHeight: 0 }}>
                  <div className="space-y-1">
                    {selected.owner_name && (
                      <div className="flex items-center justify-between px-3 py-2 rounded-md bg-muted/50">
                        <span className="text-xs text-muted-foreground">{t('admin_owner')}</span>
                        <span className="text-xs font-medium">{selected.owner_name}</span>
                      </div>
                    )}
                    {!selected.owner_identifier && selected.mode === 'player-owned' && (
                      <div className="px-3 py-2 rounded-md bg-orange-500/10">
                        <span className="text-xs text-orange-400">{t('label_unowned')}</span>
                      </div>
                    )}
                    {!selected.job && selected.mode !== 'managed' && selected.mode !== 'public' && (
                      <div className="px-3 py-2 rounded-md bg-orange-500/10">
                        <span className="text-xs text-orange-400">{t('label_no_faction')}</span>
                      </div>
                    )}
                  </div>
                  <Separator className="my-3" />
                  <div className="space-y-0.5">
                    <SettingsRow icon={<MapPin className="h-4 w-4" />} label={t('label_manage_positions')} onClick={() => { openPositions(selected); setSelected(null) }} />
                    <SettingsRow icon={<UserRoundCog className="h-4 w-4" />} label={t('admin_transfer_ownership')} onClick={() => {
                      setAction('transfer')
                      setInputValue('')
                      setSelectedPlayer(null)
                      setPlayerSearch('')
                      fetchNui<{ source: number; name: string; identifier: string }[]>('adminGetOnlinePlayers', {}).then((res) => {
                        setOnlinePlayers(Array.isArray(res) ? res : [])
                      })
                    }} />
                    {selected.mode !== 'managed' && selected.mode !== 'public' && (
                      <SettingsRow
                        icon={<Briefcase className="h-4 w-4" />}
                        label={t('admin_framework_faction')}
                        value={selected.job ? `${t(getFactionType(selected) === 'gang' ? 'label_gang' : 'label_job')}: ${selected.job}` : t('label_none')}
                        accent={!!selected.job}
                        onClick={() => {
                          setAction('faction')
                          setInputValue(selected.job || '')
                          setFactionTypeInput(getFactionType(selected))
                        }}
                      />
                    )}
                    <SettingsRow
                      icon={<ShieldAlert className="h-4 w-4" />}
                      label={t('admin_customer_access')}
                      value={getAccessMode(selected) === 'faction' ? t('admin_access_faction_only', String(getAccessMinGrade(selected))) : t('admin_access_public')}
                      accent={getAccessMode(selected) === 'faction'}
                      onClick={() => {
                        setAction('access')
                        setAccessModeInput(getAccessMode(selected))
                        setAccessGradeInput(String(getAccessMinGrade(selected)))
                      }}
                    />
                    <SettingsRow
                      icon={<DollarSign className="h-4 w-4" />}
                      label={t('admin_payment_methods')}
                      value={String(getAcceptedAlt(selected).length)}
                      accent={getAcceptedAlt(selected).length > 0}
                      onClick={() => {
                        setAction('payments')
                        setAltAcceptedInput(getAcceptedAlt(selected))
                        fetchNui<{ success: boolean; available: { key: string; label: string; type: string; valuePerUnit: number }[]; base?: { cash: boolean; bank: boolean } }>('getAcceptedAltCurrencies', {
                          dealershipId: selected.id,
                        }).then((res) => {
                          setAltCurrencyOptions(res.available || [])
                          setBasePaymentsInput({
                            cash: res.base?.cash !== false,
                            bank: res.base?.bank !== false,
                          })
                        }).catch(() => { setAltCurrencyOptions([]); setBasePaymentsInput({ cash: true, bank: true }) })
                      }}
                    />
                    <SettingsRow
                      icon={<Shield className="h-4 w-4" />}
                      label={t('tab_society_payments')}
                      onClick={() => setAction('society')}
                    />
                    <SettingsRow icon={<DollarSign className="h-4 w-4" />} label={t('admin_set_balance')} value={formatCurrency(selected.balance)} onClick={() => { setAction('balance'); setInputValue(String(selected.balance)) }} />
                    <SettingsRow
                      icon={<Layers className="h-4 w-4" />}
                      label={t('admin_set_groups')}
                      value={`${(selected.groupIds?.length ?? 0)}`}
                      onClick={() => {
                        // Seed the dialog optimistically from the list payload
                        // so the checkboxes render with the right state before
                        // the network round-trip resolves.
                        setDealershipGroupIds(selected.groupIds ?? [])
                        setAction('groups')
                        fetchNui<number[]>('adminGetDealershipGroups', { dealershipId: selected.id }).then((ids) => {
                          if (Array.isArray(ids)) setDealershipGroupIds(ids)
                        }).catch(() => {})
                      }}
                    />
                    <SettingsRow icon={<ToggleLeft className="h-4 w-4" />} label={t('admin_toggle_mode')} value={selected.mode} onClick={() => setAction('toggle')} />
                    <SettingsRow icon={<ShieldAlert className="h-4 w-4" />} label={t('admin_toggle_seize')} value={selected.seize_enabled ? t('label_enabled') : t('label_disabled')} accent={!!selected.seize_enabled} onClick={() => setAction('seize')} />
                    <SettingsRow icon={<BookOpen className="h-4 w-4" />} label={t('admin_stock_from_catalog')} onClick={() => { setAction('stockAll'); setInputValue('1') }} />
                    <Separator className="my-1" />
                    <SettingsRow icon={<RotateCcw className="h-4 w-4" />} label={t('admin_reset_dealership')} destructive onClick={() => setAction('reset')} />
                    <SettingsRow icon={<Trash2 className="h-4 w-4" />} label={t('admin_delete_dealership')} destructive onClick={() => setAction('delete')} />
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Action sub-dialogs */}
        <Dialog open={!!action && action !== 'create' && !!selected} onOpenChange={(open) => { if (!open) setAction(null) }}>
          <DialogContent onClose={() => setAction(null)}>
            <DialogHeader>
              <DialogTitle>
                {action === 'transfer' && t('admin_transfer_ownership')}
                {action === 'balance' && t('admin_set_balance')}
                {action === 'groups' && t('admin_set_groups')}
                {action === 'reset' && t('admin_reset_dealership')}
                {action === 'delete' && t('admin_delete_dealership')}
                {action === 'toggle' && t('admin_toggle_mode')}
                {action === 'seize' && t('admin_toggle_seize')}
                {action === 'stockAll' && t('admin_stock_from_catalog')}
                {action === 'faction' && t('admin_framework_faction')}
                {action === 'access' && t('admin_customer_access')}
                {action === 'payments' && t('admin_payment_methods')}
                {action === 'society' && t('tab_society_payments')}
              </DialogTitle>
              <DialogDescription>{selected?.name} (ID: {selected?.id})</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              {action === 'transfer' && (
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{t('label_current_owner')}</p>
                    {selected?.owner_identifier ? (
                      <div className="bg-muted rounded-md px-3 py-2">
                        <p className="text-sm font-medium">{selected.owner_name || t('label_unknown')}</p>
                        <p className="text-xs text-muted-foreground font-mono">{selected.owner_identifier}</p>
                      </div>
                    ) : (
                      <p className="text-sm text-orange-400">{t('admin_no_owner')}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-sm font-medium">{t('label_transfer_to')}</label>
                    <div className="relative mt-1">
                      <Input
                        value={playerSearch}
                        onChange={(e) => { setPlayerSearch(e.target.value); setSelectedPlayer(null) }}
                        placeholder={t('admin_search_players')}
                      />
                      {playerSearch && !selectedPlayer && (
                        <div className="absolute z-10 top-full mt-1 left-0 right-0 bg-card border border-border rounded-md shadow-md max-h-40 overflow-auto">
                          {onlinePlayers
                            .filter((p) => p.name.toLowerCase().includes(playerSearch.toLowerCase()) || p.identifier.toLowerCase().includes(playerSearch.toLowerCase()))
                            .map((p) => (
                              <button
                                key={p.source}
                                onClick={() => { setSelectedPlayer(p); setPlayerSearch(p.name) }}
                                className="w-full text-left px-3 py-2 hover:bg-muted text-sm flex justify-between"
                              >
                                <span>{p.name}</span>
                                <span className="text-xs text-muted-foreground font-mono">{p.identifier.substring(0, 12)}...</span>
                              </button>
                            ))
                          }
                          {onlinePlayers.filter((p) => p.name.toLowerCase().includes(playerSearch.toLowerCase()) || p.identifier.toLowerCase().includes(playerSearch.toLowerCase())).length === 0 && (
                            <p className="px-3 py-2 text-xs text-muted-foreground">{t('empty_no_players')}</p>
                          )}
                        </div>
                      )}
                    </div>
                    {selectedPlayer && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {t('admin_transferring_to')}: <span className="font-medium text-foreground">{selectedPlayer.name}</span> <span className="font-mono">({selectedPlayer.identifier})</span>
                      </p>
                    )}
                  </div>
                </div>
              )}
              {action === 'balance' && (
                <div><label className="text-sm font-medium">{t('label_new_balance')}</label><Input type="number" value={inputValue} onChange={(e) => setInputValue(e.target.value)} className="mt-1" /></div>
              )}
              {action === 'faction' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('admin_framework_faction')}</label>
                  <p className="text-xs text-muted-foreground">{t('admin_faction_required')}</p>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setFactionTypeInput('job')}
                      className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${factionTypeInput === 'job' ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                    >
                      {t('label_job')}
                    </button>
                    <button
                      onClick={() => setFactionTypeInput('gang')}
                      className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${factionTypeInput === 'gang' ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                    >
                      {t('label_gang')}
                    </button>
                  </div>
                  <Input
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder={factionTypeInput === 'gang' ? 'e.g. ballas, vagos' : 'e.g. pdm, police'}
                    className="mt-1 font-mono"
                  />
                </div>
              )}
              {action === 'access' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('admin_customer_access')}</label>
                  <p className="text-xs text-muted-foreground">{t('admin_access_desc')}</p>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setAccessModeInput('public')}
                      className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${accessModeInput === 'public' ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                    >
                      {t('admin_access_public')}
                    </button>
                    <button
                      onClick={() => setAccessModeInput('faction')}
                      className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${accessModeInput === 'faction' ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                    >
                      {t('admin_access_faction')}
                    </button>
                  </div>
                  {accessModeInput === 'faction' && (
                    <div>
                      <label className="text-xs text-muted-foreground">{t('admin_access_min_grade')}</label>
                      <Input
                        type="number"
                        min="0"
                        value={accessGradeInput}
                        onChange={(e) => setAccessGradeInput(e.target.value)}
                        className="mt-1"
                      />
                      {!selected?.job && (
                        <p className="text-[10px] text-orange-400 mt-1">{t('admin_access_faction_requires_faction')}</p>
                      )}
                    </div>
                  )}
                </div>
              )}
              {action === 'payments' && (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">{t('admin_payment_methods_desc')}</p>

                  {/* Base tenders — disable to make the shop donator-only etc. */}
                  <div className="space-y-1">
                    {([
                      { key: 'bank' as const, label: t('label_bank') },
                      { key: 'cash' as const, label: t('label_cash') },
                    ]).map((opt) => {
                      const checked = basePaymentsInput[opt.key]
                      return (
                        <label
                          key={opt.key}
                          className={`flex items-center gap-3 rounded-md border px-3 py-2 cursor-pointer transition-colors ${checked ? 'bg-accent/10 border-accent/40' : 'bg-muted/40 border-border hover:bg-muted'}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => setBasePaymentsInput((prev) => ({ ...prev, [opt.key]: !prev[opt.key] }))}
                            className="h-4 w-4 accent-accent"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{opt.label}</p>
                          </div>
                        </label>
                      )
                    })}
                  </div>

                  {altCurrencyOptions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t('alt_payments_none_configured')}</p>
                  ) : (
                    <div className="space-y-1">
                      {altCurrencyOptions.map((cur) => {
                        const checked = altAcceptedInput.includes(cur.key)
                        return (
                          <label
                            key={cur.key}
                            className={`flex items-center gap-3 rounded-md border px-3 py-2 cursor-pointer transition-colors ${checked ? 'bg-accent/10 border-accent/40' : 'bg-muted/40 border-border hover:bg-muted'}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => setAltAcceptedInput((prev) => prev.includes(cur.key) ? prev.filter((k) => k !== cur.key) : [...prev, cur.key])}
                              className="h-4 w-4 accent-accent"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{cur.label}</p>
                              <p className="text-[10px] text-muted-foreground font-mono truncate">{cur.type} &middot; {cur.key}</p>
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
              {action === 'groups' && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">{t('admin_dealership_groups_desc')}</p>
                  {catalogGroups.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t('admin_no_groups_yet')}</p>
                  ) : (
                    <div className="max-h-56 overflow-auto rounded-md border border-border bg-muted/30 divide-y divide-border/60">
                      {catalogGroups.map((g) => {
                        const checked = dealershipGroupIds.includes(g.id)
                        return (
                          <label key={g.id} className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-muted/60 text-sm">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-accent"
                              checked={checked}
                              onChange={() => setDealershipGroupIds((prev) => prev.includes(g.id) ? prev.filter((x) => x !== g.id) : [...prev, g.id])}
                            />
                            <span className="flex-1">{resolveGroupLabel(g)}</span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
              {action === 'society' && selected && (
                <SocietyAllowlistSettings dealershipId={selected.id} dealershipName={selected.name} />
              )}
              {action === 'reset' && <p className="text-sm text-destructive">{t('confirm_reset_warning')}</p>}
              {action === 'delete' && <p className="text-sm text-destructive">{t('confirm_delete_warning')}</p>}
              {action === 'toggle' && <p className="text-sm">{t('confirm_toggle_mode')} {t('admin_currently')}: <strong>{selected?.mode}</strong></p>}
              {action === 'seize' && <p className="text-sm">{t('confirm_toggle_seize')} {t('admin_currently')}: <strong>{selected?.seize_enabled ? t('label_enabled') : t('label_disabled')}</strong></p>}
              {action === 'stockAll' && (
                <div className="space-y-3">
                  <p className="text-sm">{t('confirm_stock_from_catalog')}</p>
                  <div>
                    <label className="text-sm font-medium">{t('label_quantity_per_vehicle')}</label>
                    <Input type="number" min={1} value={inputValue} onChange={(e) => setInputValue(e.target.value)} placeholder="1" className="mt-1" />
                  </div>
                </div>
              )}
              {action !== 'society' && (
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setAction(null)}>{t('btn_cancel')}</Button>
                  <Button className="flex-1" variant={(action === 'reset' || action === 'delete') ? 'destructive' : 'default'} onClick={handleAction} disabled={action === 'transfer' && !selectedPlayer}>{t('btn_confirm')}</Button>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={action === 'create'} onOpenChange={(open) => { if (!open) attemptCloseCreate() }}>
          <DialogContent onClose={attemptCloseCreate} className="max-h-full !grid-rows-[auto_1fr_auto] !gap-0 p-0 overflow-hidden">
            <DialogHeader className="p-6 pb-4 border-b border-border">
              <DialogTitle>{t('title_create_dealership')}</DialogTitle>
              <DialogDescription>{t('admin_create_desc')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 px-6 py-4 overflow-y-auto min-h-0">
              <div><label className="text-sm font-medium">{t('label_dealership_name')}</label>
                <Input
                  value={dealershipDraft.name}
                  onChange={(e) => setDealershipDraft({ ...dealershipDraft, name: e.target.value })}
                  placeholder="e.g. Downtown Motors"
                  className="mt-1"
                  maxLength={50}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-sm font-medium">{t('label_mode')}</label>
                  <Select value={dealershipDraft.mode} onValueChange={(v) => setDealershipDraft({ ...dealershipDraft, mode: v })}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>
                    <SelectItem value="player-owned">{t('label_player_owned')}</SelectItem><SelectItem value="managed">{t('label_automated')}</SelectItem>
                  </SelectContent></Select></div>
                <div><label className="text-sm font-medium">{t('label_type')}</label>
                  <Select value={dealershipDraft.type} onValueChange={(v) => setDealershipDraft({ ...dealershipDraft, type: v })}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>
                    <SelectItem value="car">{t('label_car')}</SelectItem><SelectItem value="boat">{t('label_boat')}</SelectItem><SelectItem value="air">{t('label_aircraft')}</SelectItem><SelectItem value="mixed">{t('label_mixed')}</SelectItem>
                  </SelectContent></Select></div>
              </div>

              <div>
                <label className="text-sm font-medium">{t('admin_groups')}</label>
                <p className="text-xs text-muted-foreground">{t('admin_dealership_groups_desc')}</p>
                {catalogGroups.length === 0 ? (
                  <p className="text-xs text-muted-foreground mt-2">{t('admin_no_groups_yet')}</p>
                ) : (
                  <div className="mt-2 max-h-36 overflow-auto rounded-md border border-border bg-muted/30 divide-y divide-border/60">
                    {catalogGroups.map((g) => {
                      const selectedIds = dealershipDraft.groupIds ?? []
                      const checked = selectedIds.includes(g.id)
                      return (
                        <label key={g.id} className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-muted/60 text-sm">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-accent"
                            checked={checked}
                            onChange={() => {
                              setDealershipDraft((prev) => {
                                const cur = prev.groupIds ?? []
                                const next = cur.includes(g.id) ? cur.filter((x) => x !== g.id) : [...cur, g.id]
                                return { ...prev, groupIds: next }
                              })
                            }}
                          />
                          <span className="flex-1">{resolveGroupLabel(g)}</span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Framework faction — same shape as the admin edit dialog. Optional.
                  Hidden for automated (NPC) dealerships since they aren't tied to a job/gang. */}
              {dealershipDraft.mode !== 'managed' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('admin_framework_faction')}</label>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setDealershipDraft({ ...dealershipDraft, factionType: 'job' })}
                      className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${dealershipDraft.factionType === 'job' ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                    >
                      {t('label_job')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDealershipDraft({ ...dealershipDraft, factionType: 'gang' })}
                      className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${dealershipDraft.factionType === 'gang' ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                    >
                      {t('label_gang')}
                    </button>
                  </div>
                  <Input
                    value={dealershipDraft.factionName}
                    onChange={(e) => setDealershipDraft({ ...dealershipDraft, factionName: e.target.value })}
                    placeholder={dealershipDraft.factionType === 'gang' ? 'e.g. ballas' : 'e.g. police'}
                    className="mt-1 font-mono"
                  />
                </div>
              )}

              {/* Initial owner — only meaningful for player-owned mode. */}
              {dealershipDraft.mode === 'player-owned' && (
                <div className="space-y-1">
                  <label className="text-sm font-medium">{t('admin_initial_owner')}</label>
                  <p className="text-xs text-muted-foreground">{t('admin_initial_owner_desc')}</p>
                  <div className="relative">
                    <Input
                      value={dealershipDraft.ownerIdentifier || createOwnerSearch}
                      onChange={(e) => {
                        setDealershipDraft({ ...dealershipDraft, ownerIdentifier: '' })
                        setCreateOwnerSearch(e.target.value)
                        if (!createOwnerPicker && e.target.value) {
                          setCreateOwnerPicker(true)
                          fetchNui<{ source: number; name: string; identifier: string }[]>('adminGetOnlinePlayers', {}).then((res) => {
                            setOnlinePlayers(Array.isArray(res) ? res : [])
                          })
                        }
                      }}
                      onFocus={() => {
                        if (!createOwnerPicker) {
                          setCreateOwnerPicker(true)
                          fetchNui<{ source: number; name: string; identifier: string }[]>('adminGetOnlinePlayers', {}).then((res) => {
                            setOnlinePlayers(Array.isArray(res) ? res : [])
                          })
                        }
                      }}
                      placeholder={t('admin_search_players')}
                      className="font-mono"
                    />
                    {createOwnerPicker && !dealershipDraft.ownerIdentifier && createOwnerSearch && (
                      <div className="absolute z-10 top-full mt-1 left-0 right-0 bg-card border border-border rounded-md shadow-md max-h-40 overflow-auto">
                        {onlinePlayers
                          .filter((p) => p.name.toLowerCase().includes(createOwnerSearch.toLowerCase()) || p.identifier.toLowerCase().includes(createOwnerSearch.toLowerCase()))
                          .map((p) => (
                            <button
                              key={p.source}
                              onClick={() => {
                                setDealershipDraft({ ...dealershipDraft, ownerIdentifier: p.identifier })
                                setCreateOwnerSearch(p.name)
                                setCreateOwnerPicker(false)
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-muted text-sm flex justify-between"
                            >
                              <span>{p.name}</span>
                              <span className="text-xs text-muted-foreground font-mono">{p.identifier.substring(0, 12)}...</span>
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                  {dealershipDraft.ownerIdentifier && (
                    <p className="text-[10px] text-muted-foreground font-mono">{dealershipDraft.ownerIdentifier}</p>
                  )}
                </div>
              )}

              <Separator />

              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">{t('admin_create_positions_hint')}</p>
                <div id="pos-coords">
                  <PositionRow
                    icon={<MapPin className="h-4 w-4" />}
                    label={t('label_dealership_center') + ' *'}
                    description={t('label_dealership_center_desc')}
                    placed={!!dealershipDraft.coords}
                    coords={dealershipDraft.coords}
                    onPlace={() => fetchNui('adminPlaceDealershipPoint', { field: 'coords', draft: { ...dealershipDraft, lastField: 'coords' } })}
                    onRemove={() => setDealershipDraft({ ...dealershipDraft, coords: undefined })}
                  />
                </div>
                <div id="pos-spawnPoint">
                  <PositionRow
                    icon={<Car className="h-4 w-4" />}
                    label={t('label_spawn_point')}
                    description={t('label_spawn_point_desc')}
                    placed={!!dealershipDraft.spawnPoint}
                    coords={dealershipDraft.spawnPoint}
                    onPlace={() => fetchNui('adminPlaceDealershipPoint', { field: 'spawnPoint', draft: { ...dealershipDraft, lastField: 'spawnPoint' } })}
                    onRemove={() => setDealershipDraft({ ...dealershipDraft, spawnPoint: undefined })}
                  />
                </div>
                <div id="pos-deliveryPoint">
                  <PositionRow
                    icon={<Truck className="h-4 w-4" />}
                    label={t('label_delivery_point')}
                    description={t('label_delivery_point_desc')}
                    placed={!!dealershipDraft.deliveryPoint}
                    coords={dealershipDraft.deliveryPoint}
                    onPlace={() => fetchNui('adminPlaceDealershipPoint', { field: 'deliveryPoint', draft: { ...dealershipDraft, lastField: 'deliveryPoint' } })}
                    onRemove={() => setDealershipDraft({ ...dealershipDraft, deliveryPoint: undefined })}
                  />
                </div>
                <div id="pos-managementPoint">
                  <PositionRow
                    icon={<Briefcase className="h-4 w-4" />}
                    label={t('label_management_point') + ' *'}
                    description={t('label_owner_manager_access')}
                    placed={!!dealershipDraft.managementPoint}
                    coords={dealershipDraft.managementPoint}
                    onPlace={() => fetchNui('adminPlaceDealershipPoint', { field: 'managementPoint', draft: { ...dealershipDraft, lastField: 'managementPoint' } })}
                    onRemove={() => setDealershipDraft({ ...dealershipDraft, managementPoint: undefined })}
                  />
                </div>
                <div id="pos-salesPoint">
                  <PositionRow
                    icon={<Handshake className="h-4 w-4" />}
                    label={t('label_sales_point') + ' *'}
                    description={t('label_view_vehicles_access')}
                    placed={!!dealershipDraft.salesPoint}
                    coords={dealershipDraft.salesPoint}
                    onPlace={() => fetchNui('adminPlaceDealershipPoint', { field: 'salesPoint', draft: { ...dealershipDraft, lastField: 'salesPoint' } })}
                    onRemove={() => setDealershipDraft({ ...dealershipDraft, salesPoint: undefined })}
                  />
                </div>
                <div id="pos-showroomPoint">
                  <PositionRow
                    icon={<Store className="h-4 w-4" />}
                    label={t('label_showroom_position') + ' *'}
                    description={t('label_showroom_preview')}
                    placed={!!dealershipDraft.showroomPoint}
                    coords={dealershipDraft.showroomPoint}
                    onPlace={() => fetchNui('adminPlaceDealershipPoint', { field: 'showroomPoint', draft: { ...dealershipDraft, lastField: 'showroomPoint' } })}
                    onRemove={() => setDealershipDraft({ ...dealershipDraft, showroomPoint: undefined })}
                  />
                </div>
                <div id="pos-displaySpot">
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center">
                            <ParkingSquare className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="font-medium text-sm">{t('label_display_spots')}</p>
                            <p className="text-xs text-muted-foreground">{t('admin_spots_placed', String(dealershipDraft.displaySpots?.length ?? 0))}</p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          onClick={() => fetchNui('adminPlaceDealershipPoint', { field: 'displaySpot', draft: { ...dealershipDraft, lastField: 'displaySpot' } })}
                        >
                          <Plus className="h-3 w-3" /> {t('admin_add')}
                        </Button>
                      </div>
                      {dealershipDraft.displaySpots && dealershipDraft.displaySpots.length > 0 && (
                        <div className="space-y-1.5 mt-3">
                          {dealershipDraft.displaySpots.map((spot, i) => (
                            <div key={i} className="flex items-center justify-between bg-muted/50 rounded px-3 py-2">
                              <span className="text-xs text-muted-foreground font-mono">
                                {t('admin_spot')} #{i + 1}: {spot.x.toFixed(1)}, {spot.y.toFixed(1)}, {spot.z.toFixed(1)} · {(spot.w ?? 0).toFixed(1)}°
                              </span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-destructive"
                                onClick={() => setDealershipDraft({
                                  ...dealershipDraft,
                                  displaySpots: dealershipDraft.displaySpots?.filter((_, idx) => idx !== i),
                                })}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <div id="pos-npcSpawnPoint">
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center">
                            <Users className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="font-medium text-sm">{t('label_npc_spawn_points')}</p>
                            <p className="text-xs text-muted-foreground">
                              {t('admin_npc_points_desc', String(dealershipDraft.npcSpawnPoints?.length ?? 0))}
                            </p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          onClick={() => fetchNui('adminPlaceDealershipPoint', { field: 'npcSpawnPoint', draft: { ...dealershipDraft, lastField: 'npcSpawnPoint' } })}
                        >
                          <Plus className="h-3 w-3" /> {t('admin_add')}
                        </Button>
                      </div>
                      {dealershipDraft.npcSpawnPoints && dealershipDraft.npcSpawnPoints.length > 0 && (
                        <div className="space-y-1.5 mt-3">
                          {dealershipDraft.npcSpawnPoints.map((point, i) => (
                            <div key={i} className="flex items-center justify-between bg-muted/50 rounded px-3 py-2">
                              <span className="text-xs text-muted-foreground font-mono">
                                #{i + 1}: {point.x.toFixed(1)}, {point.y.toFixed(1)}, {point.z.toFixed(1)} · {(point.w ?? 0).toFixed(1)}°
                              </span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-destructive"
                                onClick={() => setDealershipDraft({
                                  ...dealershipDraft,
                                  npcSpawnPoints: dealershipDraft.npcSpawnPoints?.filter((_, idx) => idx !== i),
                                })}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
            <div className="flex gap-2 p-6 pt-4 border-t border-border bg-card">
              <Button variant="outline" className="flex-1" onClick={attemptCloseCreate}>{t('btn_cancel')}</Button>
              <Button className="flex-1" onClick={handleAction} disabled={!dealershipDraft.name.trim() || !dealershipDraft.coords || !dealershipDraft.managementPoint || !dealershipDraft.salesPoint || !dealershipDraft.showroomPoint}>
                <Plus className="h-4 w-4" /> {t('btn_create')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Discard-draft confirmation. Nested so it sits above the create dialog. */}
        <Dialog open={discardConfirmOpen} onOpenChange={(open) => { if (!open) setDiscardConfirmOpen(false) }}>
          <DialogContent onClose={() => setDiscardConfirmOpen(false)} className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{t('admin_discard_draft_title')}</DialogTitle>
              <DialogDescription>{t('admin_discard_draft_desc')}</DialogDescription>
            </DialogHeader>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setDiscardConfirmOpen(false)}>
                {t('admin_keep_editing')}
              </Button>
              <Button variant="destructive" className="flex-1" onClick={closeCreateDialog}>
                {t('admin_discard')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-48 border-r border-border flex flex-col shrink-0">
        <div className="p-4">
          <h2 className="font-bold text-sm flex items-center gap-2">
            <Settings className="h-4 w-4 text-accent" /> {t('admin_panel')}
          </h2>
        </div>
        <Separator />
        <nav className="p-2 space-y-0.5 flex-1">
          <SidebarButton active={tab === 'dealerships'} icon={<Building2 className="h-4 w-4" />} label={t('admin_dealerships')} onClick={() => setTab('dealerships')} />
          <SidebarButton active={tab === 'catalog'} icon={<BookOpen className="h-4 w-4" />} label={t('admin_vehicle_catalog')} onClick={() => setTab('catalog')} />
          <SidebarButton active={tab === 'depots'} icon={<MapPin className="h-4 w-4" />} label={t('admin_delivery_depots')} onClick={() => setTab('depots')} />
          <SidebarButton active={tab === 'import'} icon={<Download className="h-4 w-4" />} label={t('admin_import')} onClick={() => setTab('import')} />
          {positionsDealership && (
            <>
              <Separator className="my-2" />
              <p className="px-3 text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{t('admin_selected')}</p>
              <SidebarButton
                active={tab === 'positions'}
                icon={<MapPin className="h-4 w-4" />}
                label={t('admin_positions')}
                onClick={() => setTab('positions')}
              />
            </>
          )}
        </nav>
        <Separator />
        <div className="p-2">
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground" onClick={onClose}>
            <X className="h-4 w-4" /> {t('btn_close')}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {renderContent()}
      </div>
    </div>
  )
}

function SettingsRow({ icon, label, value, accent, destructive, onClick }: {
  icon: React.ReactNode; label: string; value?: string; accent?: boolean; destructive?: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors hover:bg-muted group ${destructive ? 'text-destructive hover:bg-destructive/10' : ''}`}
    >
      <div className={`h-8 w-8 rounded-md flex items-center justify-center shrink-0 ${
        destructive ? 'bg-destructive/10 text-destructive' : accent ? 'bg-accent/15 text-accent' : 'bg-muted text-muted-foreground group-hover:text-foreground'
      }`}>
        {icon}
      </div>
      <span className="flex-1 text-left">{label}</span>
      {value && <span className={`text-xs capitalize ${accent ? 'text-accent font-medium' : 'text-muted-foreground'}`}>{value}</span>}
    </button>
  )
}

function SidebarButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
        active ? 'bg-accent text-accent-foreground font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

interface PositionRowProps {
  icon: React.ReactNode
  label: string
  description: string
  placed: boolean
  coords?: PositionData
  onPlace: () => void
  onRemove: () => void
  hideRemove?: boolean
}

function PositionRow({ icon, label, description, placed, coords, onPlace, onRemove, hideRemove }: PositionRowProps) {
  return (
    <Card className={placed ? 'border-accent/30' : ''}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`h-9 w-9 rounded-md flex items-center justify-center ${placed ? 'bg-accent/15 text-accent' : 'bg-muted text-muted-foreground'}`}>
              {placed ? <Check className="h-4 w-4" /> : icon}
            </div>
            <div>
              <p className="font-medium text-sm">{label}</p>
              <p className="text-xs text-muted-foreground">
                {placed && coords
                  ? <span className="font-mono">{coords.x.toFixed(1)}, {coords.y.toFixed(1)}, {coords.z.toFixed(1)} · {(coords.w ?? 0).toFixed(1)}°</span>
                  : description}
              </p>
            </div>
          </div>
          <div className="flex gap-1">
            <Button size="sm" variant={placed ? 'outline' : 'default'} onClick={onPlace} className="gap-1">
              <MapPin className="h-3 w-3" /> {placed ? t('admin_replace') : t('admin_place')}
            </Button>
            {placed && !hideRemove && (
              <Button size="sm" variant="ghost" className="text-destructive" onClick={onRemove}>
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
