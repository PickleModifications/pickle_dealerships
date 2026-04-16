import { useEffect, useState } from 'react'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { ScrollArea } from '../components/ui/scroll-area'
import { Separator } from '../components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog'
import { fetchNui } from '../lib/utils'
import { getCached, setCache, buildKey } from '../lib/cache'
import { SkeletonList } from '../components/ui/skeleton'
import { t } from '../lib/locale'
import { X, UserPlus, UserX, Clock, Shield, Briefcase, Users, MapPin } from 'lucide-react'
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
  const [hireRole, setHireRole] = useState<string>('salesperson')
  const [nearbyPlayers, setNearbyPlayers] = useState<NearbyPlayer[]>([])
  const [loadingPlayers, setLoadingPlayers] = useState(false)
  const [selectedPlayer, setSelectedPlayer] = useState<string>('')
  const [isClockedIn, setIsClockedIn] = useState(false)
  const [commissionRates, setCommissionRates] = useState<Record<string, number>>({})

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
    fetchNui<{ success: boolean; rates: Record<string, number> }>('getCommissionRates', {
      dealershipId: data.dealershipId,
    }).then((res) => {
      if (res.success && res.rates) setCommissionRates(res.rates)
    }).catch(() => {})
  }, [data.dealershipId])

  const openHireDialog = () => {
    setHireDialogOpen(true)
    setSelectedPlayer('')
    setHireRole('salesperson')
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
      role: hireRole,
    }).then(() => {
      setHireDialogOpen(false)
      setSelectedPlayer('')
      loadEmployees()
    })
  }

  const handleFire = (serverId: number) => {
    fetchNui('fireEmployee', {
      dealershipId: data.dealershipId,
      targetServerId: serverId,
    }).then(() => loadEmployees())
  }

  const handleSetRole = (serverId: number, role: string) => {
    fetchNui('setEmployeeRole', {
      dealershipId: data.dealershipId,
      targetServerId: serverId,
      role,
    }).then(() => loadEmployees())
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
                        {emp.role === 'manager' ? (
                          <Shield className="h-5 w-5 text-accent" />
                        ) : (
                          <Briefcase className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                      <div>
                        <p className="font-semibold">{emp.name || emp.identifier}</p>
                        <div className="flex items-center gap-2">
                          <Badge variant={emp.role === 'manager' ? 'default' : 'secondary'} className="text-xs capitalize">
                            {emp.role}
                          </Badge>
                          {emp.clocked_in && (
                            <Badge variant="outline" className="gap-1 text-xs text-emerald-400 border-emerald-400/50">
                              <Clock className="h-3 w-3" /> {t('employees_on_duty')}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">{t('tab_commission')}</p>
                        <p className="text-sm font-medium">{commissionRates[emp.role] ?? Math.round(emp.commission_rate * 100)}%</p>
                      </div>

                      {canManage && (
                        <div className="flex gap-1">
                          <Select
                            value={emp.role}
                            onValueChange={(val) => handleSetRole(emp.serverId ?? emp.id, val)}
                          >
                            <SelectTrigger className="w-[120px] h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="salesperson">{t('role_salesperson')}</SelectItem>
                              <SelectItem value="manager">{t('role_manager')}</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleFire(emp.serverId ?? emp.id)}
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
              <label className="text-sm font-medium">{t('employees_role')}</label>
              <Select value={hireRole} onValueChange={setHireRole}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="salesperson">{t('role_salesperson')}</SelectItem>
                  <SelectItem value="manager">{t('role_manager')}</SelectItem>
                </SelectContent>
              </Select>
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
