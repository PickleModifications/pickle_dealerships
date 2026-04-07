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
  Handshake, Building2, BookOpen, Trash2, Briefcase, Users,
} from 'lucide-react'
import { SkeletonList } from '../components/ui/skeleton'
import type { DealershipData, AdminDealership, DealershipMetadata, PositionData } from '../types'
import AdminCatalogPage from './AdminCatalogPage'

interface Props {
  data: DealershipData
  onClose: () => void
}

type AdminTab = 'dealerships' | 'catalog' | 'positions'
type AdminAction = 'transfer' | 'balance' | 'tier' | 'reset' | 'toggle' | 'create' | null

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
      transfer: () => fetchNui('adminTransferOwnership', { dealershipId, newOwnerId: inputValue }).then(() => loadDealerships()),
      balance: () => fetchNui('adminSetBalance', { dealershipId, amount: parseInt(inputValue) }).then(() => loadDealerships()),
      tier: () => fetchNui('adminSetTier', { dealershipId, tier: parseInt(inputValue) }).then(() => loadDealerships()),
      reset: () => fetchNui('adminResetDealership', { dealershipId }).then(() => loadDealerships()),
      toggle: () => fetchNui('adminToggleMode', { dealershipId }).then(() => loadDealerships()),
    }
    callbacks[action]?.().then(() => { setAction(null); setSelected(null); setInputValue('') })
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

  const tierLabels: Record<number, string> = { 1: 'Starter', 2: 'Established', 3: 'Premium', 4: 'Enterprise' }

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
            <p className="text-xs text-muted-foreground">Manage dealership positions</p>
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
                      <p className="font-medium text-sm">Framework Job</p>
                      <p className="text-xs text-muted-foreground">
                        {positionsDealership?.job ? <span className="font-mono">{positionsDealership.job}</span> : 'Required for hiring employees'}
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
                      Save
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Separator />

              <PositionRow
                icon={<Crosshair className="h-4 w-4" />}
                label="Dealership Center"
                description="Main location for blips and zone"
                placed={!!positionsMeta.coords}
                coords={positionsMeta.coords}
                onPlace={() => startGizmo('coords')}
                onRemove={() => removePosition('coords')}
              />
              <PositionRow
                icon={<Car className="h-4 w-4" />}
                label="Vehicle Spawn Point"
                description="Where purchased vehicles spawn"
                placed={!!positionsMeta.spawnPoint}
                coords={positionsMeta.spawnPoint}
                onPlace={() => startGizmo('spawnPoint')}
                onRemove={() => removePosition('spawnPoint')}
              />
              <PositionRow
                icon={<Store className="h-4 w-4" />}
                label="Management Point"
                description="Owner/manager menu access"
                placed={!!interactions.management}
                coords={interactions.management}
                onPlace={() => startGizmo('interactionPoint', 'management')}
                onRemove={() => removePosition('interactionPoint', { pointType: 'management' })}
              />
              <PositionRow
                icon={<Handshake className="h-4 w-4" />}
                label="Sales Point"
                description="Sales tablet access"
                placed={!!interactions.sales}
                coords={interactions.sales}
                onPlace={() => startGizmo('interactionPoint', 'sales')}
                onRemove={() => removePosition('interactionPoint', { pointType: 'sales' })}
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
                        <p className="font-medium text-sm">Display Spots</p>
                        <p className="text-xs text-muted-foreground">{spots.length} spot{spots.length !== 1 ? 's' : ''} placed</p>
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => startGizmo('displaySpot')} className="gap-1">
                      <Plus className="h-3 w-3" /> Add
                    </Button>
                  </div>
                  {spots.length > 0 && (
                    <div className="space-y-1.5 mt-3">
                      {spots.map((spot, i) => (
                        <div key={i} className="flex items-center justify-between bg-muted/50 rounded px-3 py-2">
                          <span className="text-xs text-muted-foreground font-mono">
                            Spot #{i + 1}: {spot.x.toFixed(1)}, {spot.y.toFixed(1)}, {spot.z.toFixed(1)}
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
                        <p className="font-medium text-sm">NPC Spawn Points</p>
                        <p className="text-xs text-muted-foreground">
                          {npcSpawns.length} point{npcSpawns.length !== 1 ? 's' : ''} &mdash; where NPC customers appear
                        </p>
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => startGizmo('npcSpawnPoint')} className="gap-1">
                      <Plus className="h-3 w-3" /> Add
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

    // Dealerships tab
    return (
      <div className="relative flex-1 flex flex-col overflow-hidden">
        <div className="p-4 flex justify-end">
          <Button size="sm" onClick={() => setAction('create')} className="gap-1"><Plus className="h-4 w-4" /> Create Dealership</Button>
        </div>
        <ScrollArea className="flex-1 px-4 pb-4">
          {loading ? (
            <SkeletonList count={3} />
          ) : dealerships.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground">No dealerships found</div>
          ) : (
            <div className="space-y-2">
              {dealerships.map((d) => (
                <Card key={d.id} className="overflow-hidden">
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-sm">{d.name}</h3>
                          <Badge variant="outline" className="text-[10px] capitalize">{d.mode}</Badge>
                          <Badge variant="secondary" className="text-[10px] capitalize">{d.type}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          ID: {d.id} &mdash; {tierLabels[d.tier] || `Tier ${d.tier}`} &mdash; {formatCurrency(d.balance)}
                          {d.job && <> &mdash; <span className="font-mono">{d.job}</span></>}
                        </p>
                        {d.owner_name && <p className="text-xs text-muted-foreground">Owner: {d.owner_name}</p>}
                        {!d.owner_citizenid && d.mode === 'player-owned' && <p className="text-xs text-orange-400">Unowned</p>}
                        {!d.job && <p className="text-xs text-orange-400">No job assigned</p>}
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Manage Positions" onClick={() => openPositions(d)}><MapPin className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Transfer" onClick={() => { setSelected(d); setAction('transfer'); setInputValue('') }}><UserRoundCog className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Balance" onClick={() => { setSelected(d); setAction('balance'); setInputValue(String(d.balance)) }}><DollarSign className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Tier" onClick={() => { setSelected(d); setAction('tier'); setInputValue(String(d.tier)) }}><ArrowUpCircle className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Toggle Mode" onClick={() => { setSelected(d); setAction('toggle') }}><ToggleLeft className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Reset" onClick={() => { setSelected(d); setAction('reset') }}><RotateCcw className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Action dialogs */}
        <Dialog open={!!action && action !== 'create'} onOpenChange={(open) => { if (!open) { setAction(null); setSelected(null) } }}>
          <DialogContent onClose={() => { setAction(null); setSelected(null) }}>
            <DialogHeader>
              <DialogTitle>
                {action === 'transfer' && 'Transfer Ownership'}
                {action === 'balance' && 'Set Balance'}
                {action === 'tier' && 'Set Tier'}
                {action === 'reset' && 'Reset Dealership'}
                {action === 'toggle' && 'Toggle Mode'}
              </DialogTitle>
              <DialogDescription>{selected?.name} (ID: {selected?.id})</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              {action === 'transfer' && (
                <div><label className="text-sm font-medium">New Owner Citizen ID</label><Input value={inputValue} onChange={(e) => setInputValue(e.target.value)} placeholder="Enter citizen ID..." className="mt-1" /></div>
              )}
              {action === 'balance' && (
                <div><label className="text-sm font-medium">New Balance</label><Input type="number" value={inputValue} onChange={(e) => setInputValue(e.target.value)} className="mt-1" /></div>
              )}
              {action === 'tier' && (
                <div><label className="text-sm font-medium">Tier</label>
                  <Select value={inputValue} onValueChange={setInputValue}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>
                    <SelectItem value="1">1 - Starter Lot</SelectItem><SelectItem value="2">2 - Established</SelectItem><SelectItem value="3">3 - Premium</SelectItem><SelectItem value="4">4 - Enterprise</SelectItem>
                  </SelectContent></Select></div>
              )}
              {action === 'reset' && <p className="text-sm text-destructive">This will clear all stock, employees, and reset the dealership. Cannot be undone.</p>}
              {action === 'toggle' && <p className="text-sm">Toggle between <strong>public</strong> and <strong>player-owned</strong>. Currently: <strong>{selected?.mode}</strong></p>}
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => { setAction(null); setSelected(null) }}>Cancel</Button>
                <Button className="flex-1" variant={action === 'reset' ? 'destructive' : 'default'} onClick={handleAction}>Confirm</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={action === 'create'} onOpenChange={(open) => { if (!open) setAction(null) }}>
          <DialogContent onClose={() => setAction(null)}>
            <DialogHeader>
              <DialogTitle>Create Dealership</DialogTitle>
              <DialogDescription>Create a new dealership location.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div><label className="text-sm font-medium">Dealership Name</label><Input value={createLabel} onChange={(e) => setCreateLabel(e.target.value)} placeholder="e.g. Downtown Motors" className="mt-1" maxLength={50} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-sm font-medium">Mode</label>
                  <Select value={createMode} onValueChange={setCreateMode}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>
                    <SelectItem value="player-owned">Player Owned</SelectItem><SelectItem value="public">Public</SelectItem>
                  </SelectContent></Select></div>
                <div><label className="text-sm font-medium">Type</label>
                  <Select value={createType} onValueChange={setCreateType}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>
                    <SelectItem value="car">Car</SelectItem><SelectItem value="boat">Boat</SelectItem><SelectItem value="air">Aircraft</SelectItem><SelectItem value="mixed">Mixed</SelectItem>
                  </SelectContent></Select></div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setAction(null)}>Cancel</Button>
                <Button className="flex-1" onClick={handleAction}><Plus className="h-4 w-4" /> Create</Button>
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
            <Settings className="h-4 w-4 text-accent" /> Admin Panel
          </h2>
        </div>
        <Separator />
        <nav className="p-2 space-y-0.5 flex-1">
          <SidebarButton active={tab === 'dealerships'} icon={<Building2 className="h-4 w-4" />} label="Dealerships" onClick={() => setTab('dealerships')} />
          <SidebarButton active={tab === 'catalog'} icon={<BookOpen className="h-4 w-4" />} label="Vehicle Catalog" onClick={() => setTab('catalog')} />
          {positionsDealership && (
            <>
              <Separator className="my-2" />
              <p className="px-3 text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Selected</p>
              <SidebarButton
                active={tab === 'positions'}
                icon={<MapPin className="h-4 w-4" />}
                label="Positions"
                onClick={() => setTab('positions')}
              />
            </>
          )}
        </nav>
        <Separator />
        <div className="p-2">
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground" onClick={onClose}>
            <X className="h-4 w-4" /> Close
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
              <MapPin className="h-3 w-3" /> {placed ? 'Replace' : 'Place'}
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
