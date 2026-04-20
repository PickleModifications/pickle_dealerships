import { useEffect, useState } from 'react'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { ScrollArea } from '../components/ui/scroll-area'
import { Separator } from '../components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog'
import { Input } from '../components/ui/input'
import { fetchNui } from '../lib/utils'
import { getCached, setCache, buildKey } from '../lib/cache'
import { SkeletonList } from '../components/ui/skeleton'
import { t } from '../lib/locale'
import { X, UserPlus, UserX, Clock, Briefcase, Users, MapPin } from 'lucide-react'
import type { DealershipData, Employee } from '../types'

interface Props {
  data: DealershipData
  onClose: () => void
}

interface NearbyPlayer {
  serverId: number
  name: string
  distance: number
}

export default function EmployeesPage({ data, onClose }: Props) {
  const cacheKey = buildKey(data.dealershipId, 'employees')
  const cached = getCached<Employee[]>(cacheKey)
  const [employees, setEmployees] = useState<Employee[]>(cached ?? [])
  const [loading, setLoading] = useState(!cached)
  const [hireDialogOpen, setHireDialogOpen] = useState(false)
  const [hireGrade, setHireGrade] = useState<string>('')
  const [nearbyPlayers, setNearbyPlayers] = useState<NearbyPlayer[]>([])
  const [loadingPlayers, setLoadingPlayers] = useState(false)
  const [selectedPlayer, setSelectedPlayer] = useState<string>('')
  const [isClockedIn, setIsClockedIn] = useState(false)
  // Grade level (numeric key) → configured rate (%). Populated from dealership metadata.
  const [gradeRates, setGradeRates] = useState<Record<number, number>>({})
  const [defaultRate, setDefaultRate] = useState<number>(8)
  // Framework grades for this dealership's faction — drives the hire/role dropdown.
  const [factionGrades, setFactionGrades] = useState<{ level: number; label: string }[]>([])
  // Inline-edit state for per-employee commission overrides, keyed by identifier.
  const [overrideDraft, setOverrideDraft] = useState<Record<string, string>>({})

  const loadEmployees = () => {
    if (!getCached(cacheKey)) setLoading(true)
    fetchNui<{ employees: Employee[] } | Employee[]>('getEmployees', {
      dealershipId: data.dealershipId,
    }).then((res) => {
      const items = Array.isArray(res) ? res : (res && 'employees' in res ? res.employees : [])
      setEmployees(items)
      setCache(cacheKey, items)
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  useEffect(() => {
    loadEmployees()
    fetchNui<{ success: boolean; rates: { grades: { level: number; label: string }[]; rates: { level: number; rate: number }[]; defaultRate: number } }>('getCommissionRates', {
      dealershipId: data.dealershipId,
    }).then((res) => {
      if (res.success && res.rates) {
        const map: Record<number, number> = {}
        for (const r of res.rates.rates ?? []) map[r.level] = r.rate
        setGradeRates(map)
        setDefaultRate(res.rates.defaultRate ?? 8)
        setFactionGrades(res.rates.grades ?? [])
      }
    }).catch(() => {})
  }, [data.dealershipId])

  const openHireDialog = () => {
    setHireDialogOpen(true)
    setSelectedPlayer('')
    setHireGrade(factionGrades[0] ? String(factionGrades[0].level) : '0')
    setLoadingPlayers(true)
    fetchNui<{ players: NearbyPlayer[] }>('getNearbyPlayers', {}).then((res) => {
      setNearbyPlayers(res.players || [])
      setLoadingPlayers(false)
    }).catch(() => setLoadingPlayers(false))
  }

  const handleHire = () => {
    if (!selectedPlayer) return
    fetchNui('hireEmployee', {
      dealershipId: data.dealershipId,
      targetId: parseInt(selectedPlayer),
      grade: parseInt(hireGrade) || 0,
    }).then(() => {
      setHireDialogOpen(false)
      setSelectedPlayer('')
      loadEmployees()
    })
  }

  const handleFire = (emp: Employee) => {
    fetchNui('fireEmployee', {
      dealershipId: data.dealershipId,
      targetServerId: emp.online ? (emp.serverId ?? emp.id) : undefined,
      targetIdentifier: emp.identifier,
    }).then(() => loadEmployees())
  }

  // Resolves the commission % shown for an employee: per-employee override → grade rate → default.
  const resolvedCommission = (emp: Employee): number => {
    if (emp.commission_override && emp.commission_override > 0) return emp.commission_override
    if (emp.grade !== undefined && gradeRates[emp.grade] !== undefined) return gradeRates[emp.grade]
    return defaultRate
  }

  const handleSaveOverride = (emp: Employee) => {
    const raw = overrideDraft[emp.identifier]
    if (raw === undefined) return
    const rate = Math.max(0, Math.min(100, parseInt(raw) || 0))
    fetchNui('setEmployeeCommissionOverride', {
      dealershipId: data.dealershipId,
      identifier: emp.identifier,
      rate,
    }).then(() => {
      setOverrideDraft((prev) => {
        const next = { ...prev }
        delete next[emp.identifier]
        return next
      })
      loadEmployees()
    })
  }

  const canManage = data.role === 'owner' || data.role === 'admin'

  return (
    <>
      {!data.embedded && (
        <>
          <div className="flex items-center justify-between p-5 pb-0">
            <div>
              <h1 className="text-xl font-bold">{t('tab_employees')}</h1>
              <p className="text-sm text-muted-foreground">{data.dealershipName} &mdash; {employees.length} {t('employees_staff')}</p>
            </div>
            <div className="flex gap-2">
              {canManage && (
                <Button size="sm" onClick={openHireDialog} className="gap-1">
                  <UserPlus className="h-4 w-4" /> {t('employees_hire')}
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>

          <Separator className="mt-4" />
        </>
      )}

      <div className="relative flex-1 flex flex-col overflow-hidden">
      {/* Action bar for embedded mode */}
      {data.embedded && (
        <div className="p-4 pb-0 flex justify-between">
          <Button
            size="sm"
            variant={isClockedIn ? 'outline' : 'default'}
            onClick={() => {
              fetchNui(isClockedIn ? 'clockOut' : 'clockIn', { dealershipId: data.dealershipId }).then((res: any) => {
                if (res?.success) setIsClockedIn(!isClockedIn)
              })
            }}
            className="gap-1"
          >
            <Clock className="h-4 w-4" /> {isClockedIn ? t('clock_out') : t('clock_in')}
          </Button>
          {canManage && (
            <Button size="sm" onClick={openHireDialog} className="gap-1">
              <UserPlus className="h-4 w-4" /> {t('employees_hire')}
            </Button>
          )}
        </div>
      )}

      <ScrollArea className="flex-1 p-5">
        {loading ? (
          <SkeletonList count={3} />
        ) : employees.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            <Briefcase className="h-10 w-10 mb-2 opacity-50" />
            <p>{t('employees_none_hired')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {employees.map((emp) => (
              <Card key={emp.id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                        <Briefcase className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-semibold">{emp.name || emp.identifier}</p>
                        <div className="flex items-center gap-2">
                          {emp.gradeLabel && (
                            <Badge variant="secondary" className="text-xs">{emp.gradeLabel}</Badge>
                          )}
                          {emp.online === false && (
                            <Badge variant="outline" className="text-xs text-muted-foreground">{t('employees_offline')}</Badge>
                          )}
                          {emp.clocked_in && (
                            <Badge variant="outline" className="gap-1 text-xs text-emerald-400 border-emerald-400/50">
                              <Clock className="h-3 w-3" /> {t('employees_on_duty')}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right min-w-[64px]">
                        <p className="text-xs text-muted-foreground">{t('tab_commission')}</p>
                        <p className="text-sm font-medium">
                          {resolvedCommission(emp)}%
                          {(emp.commission_override ?? 0) > 0 && (
                            <span className="ml-1 text-[10px] text-accent">*</span>
                          )}
                        </p>
                      </div>

                      {canManage && (
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            placeholder={String(emp.commission_override ?? 0)}
                            value={overrideDraft[emp.identifier] ?? ''}
                            onChange={(e) => setOverrideDraft({ ...overrideDraft, [emp.identifier]: e.target.value })}
                            className="w-16 h-8 text-xs"
                            title={t('employees_commission_override_hint')}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-2 text-xs"
                            onClick={() => handleSaveOverride(emp)}
                            disabled={overrideDraft[emp.identifier] === undefined}
                          >
                            {t('btn_save')}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleFire(emp)}
                          >
                            <UserX className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </ScrollArea>

      <Dialog open={hireDialogOpen} onOpenChange={setHireDialogOpen}>
        <DialogContent onClose={() => setHireDialogOpen(false)}>
          <DialogHeader>
            <DialogTitle>{t('employees_hire_title')}</DialogTitle>
            <DialogDescription>{t('employees_hire_desc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-sm font-medium">{t('employees_player')}</label>
              {loadingPlayers ? (
                <div className="mt-1 h-9 rounded-md border border-input bg-transparent flex items-center px-3 text-sm text-muted-foreground animate-pulse">
                  {t('employees_scanning')}
                </div>
              ) : nearbyPlayers.length === 0 ? (
                <div className="mt-1 p-3 rounded-md border border-border bg-muted/50 text-center">
                  <Users className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">{t('employees_no_nearby')}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t('employees_nearby_range')}</p>
                </div>
              ) : (
                <Select value={selectedPlayer} onValueChange={setSelectedPlayer}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder={t('employees_select_player')} />
                  </SelectTrigger>
                  <SelectContent>
                    {nearbyPlayers.map((p) => (
                      <SelectItem key={p.serverId} value={String(p.serverId)}>
                        <span className="flex items-center gap-2">
                          {p.name}
                          <span className="text-muted-foreground text-xs flex items-center gap-0.5">
                            <MapPin className="h-3 w-3" />{p.distance}m
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div>
              <label className="text-sm font-medium">{t('employees_grade')}</label>
              {factionGrades.length === 0 ? (
                <p className="mt-1 text-xs text-orange-400">{t('employees_no_grades_available')}</p>
              ) : (
                <Select value={hireGrade} onValueChange={setHireGrade}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {factionGrades.map((g) => (
                      <SelectItem key={g.level} value={String(g.level)}>{g.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <Button className="w-full" onClick={handleHire} disabled={!selectedPlayer || loadingPlayers}>
              <UserPlus className="h-4 w-4" /> {t('employees_hire_title')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      </div>
    </>
  )
}
