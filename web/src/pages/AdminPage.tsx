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
import {
  X, Settings, UserRoundCog, DollarSign, ArrowUpCircle, RotateCcw,
  ToggleLeft, Plus, MapPin, Check, Car, Crosshair, Store, ParkingSquare,
  Handshake, ChevronLeft, Building2, BookOpen,
} from 'lucide-react'
import type { DealershipData, AdminDealership, DealershipMetadata } from '../types'
import AdminCatalogPage from './AdminCatalogPage'

interface Props {
  data: DealershipData
  onClose: () => void
}

type AdminTab = 'dealerships' | 'catalog'
type AdminAction = 'transfer' | 'balance' | 'tier' | 'reset' | 'toggle' | 'create' | null

export default function AdminPage({ data, onClose }: Props) {
  const [tab, setTab] = useState<AdminTab>('dealerships')
  const [dealerships, setDealerships] = useState<AdminDealership[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<AdminDealership | null>(null)
  const [action, setAction] = useState<AdminAction>(null)
  const [inputValue, setInputValue] = useState('')

  const [createLabel, setCreateLabel] = useState('')
  const [createMode, setCreateMode] = useState('player-owned')
  const [createType, setCreateType] = useState('car')

  const [setupId, setSetupId] = useState<number | null>(data.setupDealershipId ?? null)
  const [setupMeta, setSetupMeta] = useState<DealershipMetadata>(data.metadata ?? {})

  const parseMeta = (meta: DealershipMetadata | string | null | undefined): DealershipMetadata => {
    if (!meta) return {}
    if (typeof meta === 'string') {
      try { return JSON.parse(meta) } catch { return {} }
    }
    return meta
  }

  const enterSetup = (dealership: AdminDealership) => {
    setSetupId(dealership.id)
    setSetupMeta(parseMeta(dealership.metadata))
  }

  const loadDealerships = () => {
    setLoading(true)
    fetchNui<{ success: boolean; dealerships: AdminDealership[] }>('adminGetAllDealerships', {}).then((res) => {
      if (res.success && res.dealerships) setDealerships(res.dealerships)
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  useEffect(() => { loadDealerships() }, [])

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
        if (res.success && res.dealershipId) {
          setSetupId(res.dealershipId)
          setSetupMeta({})
        }
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

  const startGizmo = (field: string, pointType?: string) => {
    if (!setupId) return
    fetchNui<{ success: boolean; metadata?: DealershipMetadata }>('adminStartGizmo', {
      dealershipId: setupId, field, pointType,
    }).then((res) => {
      if (res.success && res.metadata) setSetupMeta(res.metadata)
    })
  }

  const tierLabels: Record<number, string> = { 1: 'Starter', 2: 'Established', 3: 'Premium', 4: 'Enterprise' }

  // ── Render content based on state ──
  const renderContent = () => {
    // Setup wizard takes priority
    if (setupId) {
      const spots = setupMeta.displaySpots ?? []
      const interactions = setupMeta.interactionPoints ?? {}
      const allDone = !!setupMeta.coords && !!setupMeta.spawnPoint && !!interactions.management && !!interactions.sales && spots.length > 0

      return (
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-3 p-4 pb-0">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setSetupId(null); setSetupMeta({}) }}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div>
              <h2 className="font-bold text-sm flex items-center gap-2"><MapPin className="h-4 w-4 text-accent" /> Dealership Setup</h2>
              <p className="text-xs text-muted-foreground">Place positions using the gizmo tool</p>
            </div>
          </div>
          <Separator className="mt-3" />
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-3">
              <SetupRow icon={<Crosshair className="h-4 w-4" />} label="Dealership Center" description="Main location for blips and zone" placed={!!setupMeta.coords} coords={setupMeta.coords} onPlace={() => startGizmo('coords')} />
              <SetupRow icon={<Car className="h-4 w-4" />} label="Vehicle Spawn Point" description="Where purchased vehicles spawn" placed={!!setupMeta.spawnPoint} coords={setupMeta.spawnPoint} onPlace={() => startGizmo('spawnPoint')} />
              <SetupRow icon={<Store className="h-4 w-4" />} label="Management Point" description="Owner/manager menu access" placed={!!interactions.management} coords={interactions.management} onPlace={() => startGizmo('interactionPoint', 'management')} />
              <SetupRow icon={<Handshake className="h-4 w-4" />} label="Sales Point" description="Sales tablet access" placed={!!interactions.sales} coords={interactions.sales} onPlace={() => startGizmo('interactionPoint', 'sales')} />
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center"><ParkingSquare className="h-4 w-4 text-muted-foreground" /></div>
                      <div>
                        <p className="font-medium text-sm">Display Spots</p>
                        <p className="text-xs text-muted-foreground">{spots.length} spot{spots.length !== 1 ? 's' : ''} placed</p>
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => startGizmo('displaySpot')} className="gap-1"><Plus className="h-3 w-3" /> Add Spot</Button>
                  </div>
                  {spots.length > 0 && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {spots.map((spot, i) => (
                        <div key={i} className="text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1.5 font-mono">
                          #{i + 1}: {spot.x.toFixed(1)}, {spot.y.toFixed(1)}, {spot.z.toFixed(1)}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </ScrollArea>
          <Separator />
          <div className="p-4">
            <Button className="w-full" disabled={!allDone} onClick={() => { setSetupId(null); setSetupMeta({}) }}>
              <Check className="h-4 w-4" /> Finish Setup
            </Button>
          </div>
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
            <div className="flex items-center justify-center h-48 text-muted-foreground">Loading dealerships...</div>
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
                        </p>
                        {d.owner_name && <p className="text-xs text-muted-foreground">Owner: {d.owner_name}</p>}
                        {!d.owner_citizenid && d.mode === 'player-owned' && <p className="text-xs text-orange-400">Unowned</p>}
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Setup Positions" onClick={() => enterSetup(d)}><MapPin className="h-3.5 w-3.5" /></Button>
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
              <DialogDescription>Create a new dealership, then set up its positions.</DialogDescription>
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
                <Button className="flex-1" onClick={handleAction}><Plus className="h-4 w-4" /> Create &amp; Setup</Button>
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
          <button
            onClick={() => { setTab('dealerships'); setSetupId(null) }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
              tab === 'dealerships' ? 'bg-accent text-accent-foreground font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <Building2 className="h-4 w-4" /> Dealerships
          </button>
          <button
            onClick={() => { setTab('catalog'); setSetupId(null) }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
              tab === 'catalog' ? 'bg-accent text-accent-foreground font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <BookOpen className="h-4 w-4" /> Vehicle Catalog
          </button>
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

// ── Setup Row Component ──
interface SetupRowProps {
  icon: React.ReactNode; label: string; description: string; placed: boolean; coords?: { x: number; y: number; z: number }; onPlace: () => void
}
function SetupRow({ icon, label, description, placed, coords, onPlace }: SetupRowProps) {
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
                {placed && coords ? <span className="font-mono">{coords.x.toFixed(1)}, {coords.y.toFixed(1)}, {coords.z.toFixed(1)}</span> : description}
              </p>
            </div>
          </div>
          <Button size="sm" variant={placed ? 'outline' : 'default'} onClick={onPlace} className="gap-1"><MapPin className="h-3 w-3" /> {placed ? 'Replace' : 'Place'}</Button>
        </div>
      </CardContent>
    </Card>
  )
}
