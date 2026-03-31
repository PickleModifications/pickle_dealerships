import { useState, useEffect } from 'react'
import { cn, formatCurrency, fetchNui, isEnvBrowser } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Shield,
  Users,
  DollarSign,
  Trash2,
  Plus,
  ArrowUpCircle,
  Package,
  Car,
  Ship,
  Plane,
  MapPin,
  Wallet,
  ToggleLeft,
  Loader2,
  Sparkles,
} from 'lucide-react'

interface Dealership {
  id: number
  name: string
  location: string
  type: string
  mode: string
  owner: string
  tier: number
  balance: number
}

type DialogAction = 'transfer' | 'balance' | 'tier' | 'reset' | 'mode' | 'create' | null

const TIER_LABELS: Record<number, string> = { 1: 'Basic', 2: 'Standard', 3: 'Premium', 4: 'Elite' }

const TIER_STYLES: Record<number, string> = {
  1: 'bg-slate-500/15 text-slate-300 border-slate-500/20',
  2: 'bg-blue-500/15 text-blue-300 border-blue-500/20',
  3: 'bg-violet-500/15 text-violet-300 border-violet-500/20',
  4: 'bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-300 border-amber-500/25',
}

const TYPE_CONFIG: Record<string, { color: string; icon: typeof Car }> = {
  car:  { color: 'bg-violet-500/15 text-violet-300 border-violet-500/20', icon: Car },
  boat: { color: 'bg-blue-500/15 text-blue-300 border-blue-500/20', icon: Ship },
  air:  { color: 'bg-amber-500/15 text-amber-300 border-amber-500/20', icon: Plane },
}

const MODE_STYLES: Record<string, string> = {
  public: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20',
  'player-owned': 'bg-violet-500/15 text-violet-300 border-violet-500/20',
}

const MOCK_DEALERSHIPS: Dealership[] = [
  { id: 1, name: 'Premium Motors', location: 'Vinewood Blvd', type: 'car', mode: 'player-owned', owner: 'ABC12345', tier: 3, balance: 245000 },
  { id: 2, name: 'Bay Boats', location: 'Vespucci Beach', type: 'boat', mode: 'public', owner: 'DEF67890', tier: 2, balance: 89500 },
  { id: 3, name: 'Sky Aviation', location: 'LSIA', type: 'air', mode: 'player-owned', owner: 'GHI11223', tier: 4, balance: 1250000 },
]

export default function AdminPage({ data }: { data: any }) {
  const [dealerships, setDealerships] = useState<Dealership[]>([])
  const [loading, setLoading] = useState(true)
  const [activeDialog, setActiveDialog] = useState<DialogAction>(null)
  const [selectedDealership, setSelectedDealership] = useState<Dealership | null>(null)
  const [inputValue, setInputValue] = useState('')
  const [createName, setCreateName] = useState('')
  const [createType, setCreateType] = useState('car')
  const [createMode, setCreateMode] = useState('public')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    setLoading(true)
    if (isEnvBrowser()) {
      setTimeout(() => {
        setDealerships(MOCK_DEALERSHIPS)
        setLoading(false)
      }, 600)
      return
    }
    fetchNui<Dealership[]>('adminGetAllDealerships')
      .then((res) => {
        if (Array.isArray(res)) setDealerships(res)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const openDialog = (action: DialogAction, dealership?: Dealership) => {
    setSelectedDealership(dealership || null)
    setInputValue('')
    setActiveDialog(action)
  }

  const handleAction = async () => {
    if (!selectedDealership && activeDialog !== 'create') return
    setSubmitting(true)
    try {
      switch (activeDialog) {
        case 'transfer':
          await fetchNui('adminTransferOwnership', { dealershipId: selectedDealership!.id, newOwnerId: inputValue })
          break
        case 'balance':
          await fetchNui('adminSetBalance', { dealershipId: selectedDealership!.id, balance: parseFloat(inputValue) })
          break
        case 'tier':
          await fetchNui('adminSetTier', { dealershipId: selectedDealership!.id, tier: parseInt(inputValue) })
          break
        case 'reset':
          await fetchNui('adminResetDealership', { dealershipId: selectedDealership!.id })
          break
        case 'mode':
          await fetchNui('adminToggleMode', { dealershipId: selectedDealership!.id })
          break
        case 'create':
          await fetchNui('adminCreateDealership', { name: createName, type: createType, mode: createMode })
          setCreateName('')
          break
      }
    } catch {
      // handled by game
    } finally {
      setSubmitting(false)
      setActiveDialog(null)
    }
  }

  const getDialogInfo = () => {
    switch (activeDialog) {
      case 'transfer': return { title: 'Transfer Ownership', desc: `Transfer ${selectedDealership?.name} to a new owner` }
      case 'balance':  return { title: 'Set Balance', desc: `Update the balance for ${selectedDealership?.name}` }
      case 'tier':     return { title: 'Set Tier', desc: `Change the tier level for ${selectedDealership?.name}` }
      case 'reset':    return { title: 'Reset Dealership', desc: `This action is destructive and irreversible` }
      case 'mode':     return { title: 'Toggle Mode', desc: `Switch the operating mode for ${selectedDealership?.name}` }
      case 'create':   return { title: 'Create Dealership', desc: 'Confirm the new dealership details' }
      default:         return { title: '', desc: '' }
    }
  }

  const TypeIcon = ({ type }: { type: string }) => {
    const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.car
    const Icon = cfg.icon
    return <Icon className="w-3.5 h-3.5" />
  }

  return (
    <div className="flex flex-col h-full p-5 gap-5">
      {/* Header */}
      <div className="flex items-center justify-between animate-slideUp">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-indigo-500/20 border border-violet-500/20 flex items-center justify-center glow-purple">
            <Shield className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold gradient-text">Dealership Administration</h2>
            <p className="text-xs text-slate-500 mt-0.5">Manage all dealership operations</p>
          </div>
        </div>
        <Badge variant="outline" className="bg-white/[0.03] border-white/[0.08] text-slate-400 px-3 py-1.5">
          <Package className="w-3.5 h-3.5 mr-1.5 text-violet-400" />
          {loading ? '...' : dealerships.length} Dealerships
        </Badge>
      </div>

      {/* Dealership Grid */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {loading ? (
          // Skeleton loading
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="glass-subtle rounded-xl p-4 animate-pulse"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-white/[0.06]" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-40 rounded bg-white/[0.06]" />
                    <div className="h-3 w-64 rounded bg-white/[0.04]" />
                  </div>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((j) => (
                      <div key={j} className="h-8 w-20 rounded-lg bg-white/[0.04]" />
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : dealerships.length === 0 ? (
          // Empty state
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-20 h-20 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4">
              <Package className="w-10 h-10 text-slate-600" />
            </div>
            <p className="text-lg font-medium text-slate-400">No dealerships found</p>
            <p className="text-sm text-slate-600 mt-1">Create your first dealership below</p>
          </div>
        ) : (
          dealerships.map((d, index) => {
            const typeConfig = TYPE_CONFIG[d.type] || TYPE_CONFIG.car
            const TypeIconComponent = typeConfig.icon
            return (
              <div
                key={d.id}
                className="glass-subtle glass-hover rounded-xl p-4 transition-all duration-300 animate-slideUp"
                style={{ animationDelay: `${index * 60}ms` }}
              >
                {/* Top row: Name + Location */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500/15 to-indigo-500/15 border border-white/[0.06] flex items-center justify-center">
                      <TypeIconComponent className="w-5 h-5 text-violet-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white text-[15px] leading-tight">{d.name}</h3>
                      <div className="flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 text-slate-500" />
                        <span className="text-xs text-slate-400">{d.location}</span>
                      </div>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">Owner</p>
                      <p className="text-xs font-mono text-slate-300">{d.owner?.slice(0, 8)}...</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">Balance</p>
                      <p className="text-sm font-semibold text-emerald-400">{formatCurrency(d.balance)}</p>
                    </div>
                  </div>
                </div>

                {/* Info badges row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge className={cn('text-[10px] font-medium capitalize border', typeConfig.color)}>
                      <TypeIcon type={d.type} />
                      <span className="ml-1">{d.type}</span>
                    </Badge>
                    <Badge className={cn('text-[10px] font-medium capitalize border', MODE_STYLES[d.mode] || MODE_STYLES.public)}>
                      {d.mode}
                    </Badge>
                    <Badge className={cn('text-[10px] font-medium border', TIER_STYLES[d.tier] || TIER_STYLES[1])}>
                      <Sparkles className="w-3 h-3 mr-1" />
                      Tier {d.tier} - {TIER_LABELS[d.tier] || 'Basic'}
                    </Badge>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2.5 text-[11px] bg-white/[0.02] border-white/[0.06] text-slate-400 hover:text-white hover:bg-white/[0.06] hover:border-white/[0.1]"
                      onClick={() => openDialog('transfer', d)}
                    >
                      <Users className="w-3 h-3 mr-1" />
                      Transfer
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2.5 text-[11px] bg-white/[0.02] border-white/[0.06] text-slate-400 hover:text-white hover:bg-white/[0.06] hover:border-white/[0.1]"
                      onClick={() => openDialog('balance', d)}
                    >
                      <Wallet className="w-3 h-3 mr-1" />
                      Set Balance
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2.5 text-[11px] bg-white/[0.02] border-white/[0.06] text-slate-400 hover:text-white hover:bg-white/[0.06] hover:border-white/[0.1]"
                      onClick={() => openDialog('tier', d)}
                    >
                      <ArrowUpCircle className="w-3 h-3 mr-1" />
                      Set Tier
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2.5 text-[11px] bg-white/[0.02] border-white/[0.06] text-slate-400 hover:text-white hover:bg-white/[0.06] hover:border-white/[0.1]"
                      onClick={() => openDialog('mode', d)}
                    >
                      <ToggleLeft className="w-3 h-3 mr-1" />
                      Toggle Mode
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2.5 text-[11px] bg-red-500/[0.06] border-red-500/20 text-red-400 hover:bg-red-500/15 hover:border-red-500/30"
                      onClick={() => openDialog('reset', d)}
                    >
                      <Trash2 className="w-3 h-3 mr-1" />
                      Reset
                    </Button>
                  </div>
                </div>
              </div>
            )
          })
        )}

        {/* Create New Dealership Section */}
        {!loading && (
          <div className="glass-subtle rounded-xl p-5 mt-4 animate-slideUp" style={{ animationDelay: '200ms' }}>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500/15 to-teal-500/15 border border-emerald-500/15 flex items-center justify-center">
                <Plus className="w-4 h-4 text-emerald-400" />
              </div>
              <h3 className="text-sm font-semibold gradient-text">Create New Dealership</h3>
            </div>

            <div className="grid grid-cols-[1fr_auto_auto] gap-4 items-end">
              {/* Name */}
              <div>
                <label className="text-xs text-slate-500 uppercase tracking-wider mb-1.5 block">Name</label>
                <Input
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="Enter dealership name..."
                  className="bg-white/[0.03] border-white/[0.06] text-white placeholder:text-slate-600 h-9"
                />
              </div>

              {/* Type toggle */}
              <div>
                <label className="text-xs text-slate-500 uppercase tracking-wider mb-1.5 block">Type</label>
                <div className="flex gap-1.5">
                  {([
                    { key: 'car', label: 'Car', icon: Car },
                    { key: 'boat', label: 'Boat', icon: Ship },
                    { key: 'air', label: 'Air', icon: Plane },
                  ] as const).map(({ key, label, icon: Icon }) => (
                    <button
                      key={key}
                      onClick={() => setCreateType(key)}
                      className={cn(
                        'px-4 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5',
                        createType === key
                          ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                          : 'bg-white/[0.04] text-slate-400 border border-white/[0.06] hover:bg-white/[0.06]'
                      )}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Mode toggle */}
              <div>
                <label className="text-xs text-slate-500 uppercase tracking-wider mb-1.5 block">Mode</label>
                <div className="flex gap-1.5">
                  {([
                    { key: 'public', label: 'Public' },
                    { key: 'player-owned', label: 'Player-Owned' },
                  ] as const).map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setCreateMode(key)}
                      className={cn(
                        'px-4 py-2 rounded-lg text-xs font-medium transition-all',
                        createMode === key
                          ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                          : 'bg-white/[0.04] text-slate-400 border border-white/[0.06] hover:bg-white/[0.06]'
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <Button
              className="w-full mt-4 h-10"
              onClick={() => openDialog('create')}
              disabled={!createName.trim()}
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Dealership
            </Button>
          </div>
        )}
      </div>

      {/* Action Dialog */}
      <Dialog open={activeDialog !== null} onOpenChange={(open) => { if (!open) setActiveDialog(null) }}>
        <DialogContent className="bg-[rgba(12,12,24,0.95)] border-white/[0.06] backdrop-blur-2xl">
          <DialogHeader>
            <DialogTitle className={cn(
              activeDialog === 'reset' ? 'text-red-400' : 'gradient-text'
            )}>
              {getDialogInfo().title}
            </DialogTitle>
            <DialogDescription className="text-slate-500">
              {getDialogInfo().desc}
            </DialogDescription>
          </DialogHeader>

          <div className="py-3">
            {activeDialog === 'transfer' && (
              <div>
                <label className="text-xs text-slate-500 uppercase tracking-wider mb-1.5 block">New Owner Citizen ID</label>
                <Input
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Enter citizen ID..."
                  className="bg-white/[0.03] border-white/[0.06] text-white placeholder:text-slate-600"
                />
              </div>
            )}

            {activeDialog === 'balance' && (
              <div>
                <label className="text-xs text-slate-500 uppercase tracking-wider mb-1.5 block">New Balance</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <Input
                    type="number"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="0"
                    className="pl-9 bg-white/[0.03] border-white/[0.06] text-white placeholder:text-slate-600"
                  />
                </div>
              </div>
            )}

            {activeDialog === 'tier' && (
              <div>
                <label className="text-xs text-slate-500 uppercase tracking-wider mb-1.5 block">New Tier (1-4)</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4].map((t) => (
                    <button
                      key={t}
                      onClick={() => setInputValue(String(t))}
                      className={cn(
                        'flex-1 py-3 rounded-lg text-sm font-medium transition-all border',
                        inputValue === String(t)
                          ? TIER_STYLES[t]
                          : 'bg-white/[0.03] text-slate-500 border-white/[0.06] hover:bg-white/[0.05]'
                      )}
                    >
                      <div className="text-center">
                        <div className="text-lg font-bold">{t}</div>
                        <div className="text-[10px] opacity-70">{TIER_LABELS[t]}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeDialog === 'reset' && (
              <div className="glass-subtle rounded-lg p-4 border border-red-500/10">
                <p className="text-sm text-slate-300">
                  Are you sure you want to reset <span className="text-white font-semibold">{selectedDealership?.name}</span>?
                </p>
                <p className="text-xs text-red-400/70 mt-2">
                  This will erase all data including stock, employees, and finances. This action cannot be undone.
                </p>
              </div>
            )}

            {activeDialog === 'mode' && (
              <div className="glass-subtle rounded-lg p-4">
                <p className="text-sm text-slate-300">
                  Switch <span className="text-white font-semibold">{selectedDealership?.name}</span> from{' '}
                  <span className="text-violet-300 capitalize font-medium">{selectedDealership?.mode}</span> to{' '}
                  <span className="text-emerald-300 capitalize font-medium">
                    {selectedDealership?.mode === 'public' ? 'player-owned' : 'public'}
                  </span>?
                </p>
              </div>
            )}

            {activeDialog === 'create' && (
              <div className="glass-subtle rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Name</span>
                  <span className="text-white font-medium">{createName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Type</span>
                  <span className="text-violet-300 capitalize">{createType}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Mode</span>
                  <span className="text-emerald-300 capitalize">{createMode}</span>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              className="bg-white/[0.03] border-white/[0.06] text-slate-400 hover:text-white"
              onClick={() => setActiveDialog(null)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              className={cn(
                activeDialog === 'reset'
                  ? 'bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/25 shadow-none'
                  : ''
              )}
              onClick={handleAction}
              disabled={submitting || (activeDialog === 'transfer' && !inputValue) || (activeDialog === 'balance' && !inputValue) || (activeDialog === 'tier' && !inputValue)}
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              {activeDialog === 'reset' ? 'Confirm Reset' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
