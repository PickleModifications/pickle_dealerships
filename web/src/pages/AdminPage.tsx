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
  X, Settings, UserRoundCog, DollarSign, ArrowUpCircle, RotateCcw,
  ToggleLeft, Plus, MapPin, Check, Car, Crosshair, Store, ParkingSquare,
  Handshake, Building2, BookOpen, Trash2, Briefcase, Users, ShieldAlert,
} from 'lucide-react'
import { SkeletonList } from '../components/ui/skeleton'
import { t } from '../lib/locale'
import type { DealershipData, AdminDealership, DealershipMetadata, PositionData, DeliveryDepot } from '../types'
import AdminCatalogPage from './AdminCatalogPage'

interface Props {
  data: DealershipData
  onClose: () => void
}

type AdminTab = 'dealerships' | 'catalog' | 'positions' | 'depots'
type AdminAction = 'transfer' | 'balance' | 'tier' | 'reset' | 'toggle' | 'seize' | 'create' | null

export default function AdminPage({ data, onClose }: Props) {
  const [tab, setTab] = useState<AdminTab>((data.initialTab as AdminTab) || 'dealerships')
  const [dealerships, setDealerships] = useState<AdminDealership[]>([])
  const [loading, setLoading] = useState(true)

  // Sync tab when reopened with a different initialTab (e.g. returning from photo booth)
  useEffect(() => {
    if (data.initialTab) setTab(data.initialTab as AdminTab)
  }, [data.initialTab])
  const [selected, setSelected] = useState<AdminDealership | null>(null)
  const [action, setAction] = useState<AdminAction>(null)
  const [inputValue, setInputValue] = useState('')

  const [createLabel, setCreateLabel] = useState('')
  const [createMode, setCreateMode] = useState('player-owned')
  const [createType, setCreateType] = useState('car')

  // Transfer ownership
  const [onlinePlayers, setOnlinePlayers] = useState<{ source: number; name: string; identifier: string }[]>([])
  const [playerSearch, setPlayerSearch] = useState('')
  const [selectedPlayer, setSelectedPlayer] = useState<{ source: number; name: string; identifier: string } | null>(null)

  // Depot management
  const [depots, setDepots] = useState<DeliveryDepot[]>([])
  const [depotLoading, setDepotLoading] = useState(false)
  const [depotName, setDepotName] = useState('')

  const loadDepots = () => {
    setDepotLoading(true)
    fetchNui<DeliveryDepot[]>('adminGetDepots', {}).then((r) => {
      setDepots(r || [])
      setDepotLoading(false)
    }).catch(() => setDepotLoading(false))
  }

  useEffect(() => { if (tab === 'depots') loadDepots() }, [tab])

  const handleCreateDepot = async () => {
    if (!depotName.trim()) return
    const res = await fetchNui<{ ok: boolean; id?: number }>('adminCreateDepot', { name: depotName.trim() })
    if (res?.ok) {
      setDepotName('')
      loadDepots()
    }
  }

  const handleDeleteDepot = async (id: number) => {
    const res = await fetchNui<{ ok: boolean }>('adminDeleteDepot', { id })
    if (res?.ok) loadDepots()
  }

  const handleWaypointDepot = (id: number) => {
    fetchNui('adminWaypointDepot', { id })
  }

  const handleRenameDepot = async (id: number, name: string) => {
    const res = await fetchNui<{ ok: boolean }>('adminUpdateDepot', { id, fields: { name } })
    if (res?.ok) loadDepots()
  }

  // Opens the gizmo editor so the admin can visually place + rotate the truck-spawn point.
  // The NUI closes, the gizmo runs (arrow keys to move, G to freeze/unfreeze, E to save, ESC to cancel),
  // then the panel re-opens automatically on the Depots tab.
  const handleSetSpawn = (id: number) => {
    fetchNui('adminStartDepotSpawnGizmo', { id })
  }

  const handleClearSpawn = async (id: number) => {
    const res = await fetchNui<{ ok: boolean }>('adminClearDepotSpawn', { id })
    if (res?.ok) loadDepots()
  }

  // Positions management
  const [positionsDealership, setPositionsDealership] = useState<AdminDealership | null>(null)
  const [positionsMeta, setPositionsMeta] = useState<DealershipMetadata>(data.metadata ?? {})
  const [shouldScrollToSpots, setShouldScrollToSpots] = useState(data.scrollToSpots ?? false)
  const [jobInput, setJobInput] = useState('')
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
    setJobInput(d.job || '')
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
        setJobInput(d.job || '')
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
      if (!createLabel.trim()) return
      fetchNui<{ success: boolean; dealershipId: number }>('adminCreateDealership', {
        label: createLabel.trim(),
        mode: createMode,
        type: createType,
      }).then((res) => {
        setAction(null)
        setCreateLabel('')
        setCreateMode('player-owned')
        setCreateType('car')
        loadDealerships()
      })
      return
    }

    if (!selected || !action) return
    const dealershipId = selected.id
    const callbacks: Record<string, () => Promise<void>> = {
      transfer: () => fetchNui('adminTransferOwnership', { dealershipId, newOwnerId: selectedPlayer?.identifier || inputValue }).then(() => loadDealerships()),
      balance: () => fetchNui('adminSetBalance', { dealershipId, amount: parseInt(inputValue) }).then(() => loadDealerships()),
      tier: () => fetchNui('adminSetTier', { dealershipId, tier: parseInt(inputValue) }).then(() => loadDealerships()),
      reset: () => fetchNui('adminResetDealership', { dealershipId }).then(() => loadDealerships()),
      toggle: () => fetchNui('adminToggleMode', { dealershipId }).then(() => loadDealerships()),
      seize: () => fetchNui('adminToggleSeize', { dealershipId }).then(() => loadDealerships()),
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

  const handleSetJob = () => {
    if (!positionsDealership) return
    fetchNui('adminSetJob', {
      dealershipId: positionsDealership.id,
      job: jobInput.trim(),
    }).then(() => {
      if (positionsDealership) {
        setPositionsDealership({ ...positionsDealership, job: jobInput.trim() || null })
      }
      loadDealerships()
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

  const tierLabelKeys: Record<number, string> = { 1: 'tier_1', 2: 'tier_2', 3: 'tier_3', 4: 'tier_4' }

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
              {/* Job Setting */}
              <Card className={positionsDealership?.job ? 'border-accent/30' : ''}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`h-9 w-9 rounded-md flex items-center justify-center ${positionsDealership?.job ? 'bg-accent/15 text-accent' : 'bg-muted text-muted-foreground'}`}>
                      <Briefcase className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{t('admin_framework_job')}</p>
                      <p className="text-xs text-muted-foreground">
                        {positionsDealership?.job ? <span className="font-mono">{positionsDealership.job}</span> : t('admin_job_required')}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={jobInput}
                      onChange={(e) => setJobInput(e.target.value)}
                      placeholder="e.g. pdm, dealership"
                      className="flex-1 font-mono text-sm"
                    />
                    <Button size="sm" onClick={handleSetJob} disabled={jobInput.trim() === (positionsDealership?.job || '')}>
                      {t('btn_save')}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Separator />

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
                            {t('admin_spot')} #{i + 1}: {spot.x.toFixed(1)}, {spot.y.toFixed(1)}, {spot.z.toFixed(1)}
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
                            #{i + 1}: {point.x.toFixed(1)}, {point.y.toFixed(1)}, {point.z.toFixed(1)}
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

    // Depots tab
    if (tab === 'depots') {
      return (
        <div className="relative flex-1 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-border space-y-3">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <MapPin className="h-4 w-4 text-accent" /> {t('admin_delivery_depots')}
            </h3>
            <p className="text-xs text-muted-foreground">{t('admin_delivery_depots_desc')}</p>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground">{t('label_name')}</label>
                <Input value={depotName} onChange={(e) => setDepotName(e.target.value)} placeholder={t('admin_depot_name_placeholder')} className="mt-1 h-9" />
              </div>
              <Button onClick={handleCreateDepot} className="h-9 gap-1" disabled={!depotName.trim()}>
                <Crosshair className="h-4 w-4" /> {t('admin_depot_add_here')}
              </Button>
            </div>
          </div>
          <ScrollArea className="flex-1 p-4">
            {depotLoading ? (
              <SkeletonList count={3} />
            ) : depots.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">{t('admin_no_depots')}</div>
            ) : (
              <div className="space-y-2">
                {depots.map((d) => (
                  <Card key={d.id} className="hover:border-accent/40 transition-colors">
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <Input
                          defaultValue={d.name}
                          onBlur={(e) => { if (e.target.value && e.target.value !== d.name) handleRenameDepot(d.id, e.target.value) }}
                          className="h-7 text-sm font-semibold max-w-xs"
                        />
                        <div className="text-[10px] text-muted-foreground mt-1 font-mono">
                          {t('admin_depot_ped_label') || 'Ped'}: {d.pickupCoords
                            ? `${d.pickupCoords.x?.toFixed(1)}, ${d.pickupCoords.y?.toFixed(1)}, ${d.pickupCoords.z?.toFixed(1)}`
                            : '—'}
                        </div>
                        <div className="text-[10px] text-muted-foreground/80 mt-0.5 font-mono">
                          {t('admin_depot_spawn_label') || 'Truck spawn'}: {d.spawnCoords
                            ? `${d.spawnCoords.x?.toFixed(1)}, ${d.spawnCoords.y?.toFixed(1)}, ${d.spawnCoords.z?.toFixed(1)}`
                            : (t('admin_depot_spawn_fallback') || 'same as ped')}
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => handleSetSpawn(d.id)} title={t('admin_depot_set_spawn') || 'Set truck spawn at my position'}>
                        <Crosshair className="h-4 w-4" />
                      </Button>
                      {d.spawnCoords && (
                        <Button variant="ghost" size="sm" onClick={() => handleClearSpawn(d.id)} title={t('admin_depot_clear_spawn') || 'Clear truck spawn'} className="text-muted-foreground">
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => handleWaypointDepot(d.id)} title={t('admin_depot_waypoint')}>
                        <MapPin className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDeleteDepot(d.id)} className="text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>
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
                          ID: {d.id} &mdash; {tierLabelKeys[d.tier] ? t(tierLabelKeys[d.tier]) : `${t('label_tier')} ${d.tier}`} &mdash; {formatCurrency(d.balance)}
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
                    ID: {selected.id} &mdash; {tierLabelKeys[selected.tier] ? t(tierLabelKeys[selected.tier]) : `${t('label_tier')} ${selected.tier}`} &mdash; {formatCurrency(selected.balance)}
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
                    {!selected.job && (
                      <div className="px-3 py-2 rounded-md bg-orange-500/10">
                        <span className="text-xs text-orange-400">{t('label_no_job')}</span>
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
                    <SettingsRow icon={<DollarSign className="h-4 w-4" />} label={t('admin_set_balance')} value={formatCurrency(selected.balance)} onClick={() => { setAction('balance'); setInputValue(String(selected.balance)) }} />
                    <SettingsRow icon={<ArrowUpCircle className="h-4 w-4" />} label={t('admin_set_tier')} value={tierLabelKeys[selected.tier] ? t(tierLabelKeys[selected.tier]) : `${selected.tier}`} onClick={() => { setAction('tier'); setInputValue(String(selected.tier)) }} />
                    <SettingsRow icon={<ToggleLeft className="h-4 w-4" />} label={t('admin_toggle_mode')} value={selected.mode} onClick={() => setAction('toggle')} />
                    <SettingsRow icon={<ShieldAlert className="h-4 w-4" />} label={t('admin_toggle_seize')} value={selected.seize_enabled ? t('label_enabled') : t('label_disabled')} accent={!!selected.seize_enabled} onClick={() => setAction('seize')} />
                    <Separator className="my-1" />
                    <SettingsRow icon={<RotateCcw className="h-4 w-4" />} label={t('admin_reset_dealership')} destructive onClick={() => setAction('reset')} />
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
                {action === 'tier' && t('admin_set_tier')}
                {action === 'reset' && t('admin_reset_dealership')}
                {action === 'toggle' && t('admin_toggle_mode')}
                {action === 'seize' && t('admin_toggle_seize')}
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
                        <div className="absolute z-10 top-full mt-1 left-0 right-0 bg-popover border border-border rounded-md shadow-md max-h-40 overflow-auto">
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
              {action === 'tier' && (
                <div><label className="text-sm font-medium">{t('label_tier')}</label>
                  <Select value={inputValue} onValueChange={setInputValue}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>
                    <SelectItem value="1">1 - {t('tier_1')}</SelectItem><SelectItem value="2">2 - {t('tier_2')}</SelectItem><SelectItem value="3">3 - {t('tier_3')}</SelectItem><SelectItem value="4">4 - {t('tier_4')}</SelectItem>
                  </SelectContent></Select></div>
              )}
              {action === 'reset' && <p className="text-sm text-destructive">{t('confirm_reset_warning')}</p>}
              {action === 'toggle' && <p className="text-sm">{t('confirm_toggle_mode')} {t('admin_currently')}: <strong>{selected?.mode}</strong></p>}
              {action === 'seize' && <p className="text-sm">{t('confirm_toggle_seize')} {t('admin_currently')}: <strong>{selected?.seize_enabled ? t('label_enabled') : t('label_disabled')}</strong></p>}
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setAction(null)}>{t('btn_cancel')}</Button>
                <Button className="flex-1" variant={action === 'reset' ? 'destructive' : 'default'} onClick={handleAction} disabled={action === 'transfer' && !selectedPlayer}>{t('btn_confirm')}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={action === 'create'} onOpenChange={(open) => { if (!open) setAction(null) }}>
          <DialogContent onClose={() => setAction(null)}>
            <DialogHeader>
              <DialogTitle>{t('title_create_dealership')}</DialogTitle>
              <DialogDescription>{t('admin_create_desc')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div><label className="text-sm font-medium">{t('label_dealership_name')}</label><Input value={createLabel} onChange={(e) => setCreateLabel(e.target.value)} placeholder="e.g. Downtown Motors" className="mt-1" maxLength={50} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-sm font-medium">{t('label_mode')}</label>
                  <Select value={createMode} onValueChange={setCreateMode}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>
                    <SelectItem value="player-owned">{t('label_player_owned')}</SelectItem><SelectItem value="public">{t('label_public')}</SelectItem>
                  </SelectContent></Select></div>
                <div><label className="text-sm font-medium">{t('label_type')}</label>
                  <Select value={createType} onValueChange={setCreateType}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>
                    <SelectItem value="car">{t('label_car')}</SelectItem><SelectItem value="boat">{t('label_boat')}</SelectItem><SelectItem value="air">{t('label_aircraft')}</SelectItem><SelectItem value="mixed">{t('label_mixed')}</SelectItem>
                  </SelectContent></Select></div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setAction(null)}>{t('btn_cancel')}</Button>
                <Button className="flex-1" onClick={handleAction}><Plus className="h-4 w-4" /> {t('btn_create')}</Button>
              </div>
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
}

function PositionRow({ icon, label, description, placed, coords, onPlace, onRemove }: PositionRowProps) {
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
                  ? <span className="font-mono">{coords.x.toFixed(1)}, {coords.y.toFixed(1)}, {coords.z.toFixed(1)}</span>
                  : description}
              </p>
            </div>
          </div>
          <div className="flex gap-1">
            <Button size="sm" variant={placed ? 'outline' : 'default'} onClick={onPlace} className="gap-1">
              <MapPin className="h-3 w-3" /> {placed ? t('admin_replace') : t('admin_place')}
            </Button>
            {placed && (
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
