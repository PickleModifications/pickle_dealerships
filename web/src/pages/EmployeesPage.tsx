import { useEffect, useState } from 'react'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { ScrollArea } from '../components/ui/scroll-area'
import { Separator } from '../components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog'
import { fetchNui } from '../lib/utils'
import { X, UserPlus, UserX, Clock, Shield, Briefcase } from 'lucide-react'
import type { DealershipData, Employee } from '../types'

interface Props {
  data: DealershipData
  onClose: () => void
}

export default function EmployeesPage({ data, onClose }: Props) {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [hireDialogOpen, setHireDialogOpen] = useState(false)
  const [hireId, setHireId] = useState('')
  const [hireRole, setHireRole] = useState<string>('salesperson')

  const loadEmployees = () => {
    setLoading(true)
    fetchNui<{ employees: Employee[] } | Employee[]>('getEmployees', {
      dealershipId: data.dealershipId,
    }).then((res) => {
      if (Array.isArray(res)) setEmployees(res)
      else if (res && 'employees' in res) setEmployees(res.employees)
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  useEffect(() => { loadEmployees() }, [data.dealershipId])

  const handleHire = () => {
    if (!hireId.trim()) return
    fetchNui('hireEmployee', {
      dealershipId: data.dealershipId,
      citizenid: hireId.trim(),
      role: hireRole,
    }).then(() => {
      setHireDialogOpen(false)
      setHireId('')
      loadEmployees()
    })
  }

  const handleFire = (employeeId: number) => {
    fetchNui('fireEmployee', {
      dealershipId: data.dealershipId,
      employeeId,
    }).then(() => loadEmployees())
  }

  const handleSetRole = (employeeId: number, role: string) => {
    fetchNui('setEmployeeRole', {
      dealershipId: data.dealershipId,
      employeeId,
      role,
    }).then(() => loadEmployees())
  }

  const handleSetCommission = (employeeId: number, rate: string) => {
    const parsed = parseFloat(rate)
    if (isNaN(parsed) || parsed < 0 || parsed > 100) return
    fetchNui('setCommissionRate', {
      dealershipId: data.dealershipId,
      employeeId,
      commissionRate: parsed / 100,
    }).then(() => loadEmployees())
  }

  const canManage = data.role === 'owner' || data.role === 'admin'

  return (
    <>
      {!data.embedded && (
        <>
          <div className="flex items-center justify-between p-5 pb-0">
            <div>
              <h1 className="text-xl font-bold">Employees</h1>
              <p className="text-sm text-muted-foreground">{data.dealershipName} &mdash; {employees.length} staff</p>
            </div>
            <div className="flex gap-2">
              {canManage && (
                <Button size="sm" onClick={() => setHireDialogOpen(true)} className="gap-1">
                  <UserPlus className="h-4 w-4" /> Hire
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
      <ScrollArea className="flex-1 p-5">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground">Loading employees...</div>
        ) : employees.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            <Briefcase className="h-10 w-10 mb-2 opacity-50" />
            <p>No employees hired yet</p>
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
                        <p className="font-semibold">{emp.name || emp.citizenid}</p>
                        <div className="flex items-center gap-2">
                          <Badge variant={emp.role === 'manager' ? 'default' : 'secondary'} className="text-xs capitalize">
                            {emp.role}
                          </Badge>
                          {emp.clocked_in && (
                            <Badge variant="outline" className="gap-1 text-xs text-emerald-400 border-emerald-400/50">
                              <Clock className="h-3 w-3" /> On Duty
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Commission</p>
                        <p className="text-sm font-medium">{Math.round(emp.commission_rate * 100)}%</p>
                      </div>

                      {canManage && (
                        <div className="flex gap-1">
                          <Select
                            value={emp.role}
                            onValueChange={(val) => handleSetRole(emp.id, val)}
                          >
                            <SelectTrigger className="w-[120px] h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="salesperson">Salesperson</SelectItem>
                              <SelectItem value="manager">Manager</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleFire(emp.id)}
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
            <DialogTitle>Hire Employee</DialogTitle>
            <DialogDescription>Enter the player's citizen ID to hire them.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-sm font-medium">Citizen ID</label>
              <Input
                value={hireId}
                onChange={(e) => setHireId(e.target.value)}
                placeholder="Enter citizen ID..."
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Role</label>
              <Select value={hireRole} onValueChange={setHireRole}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="salesperson">Salesperson</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={handleHire}>
              <UserPlus className="h-4 w-4" /> Hire Employee
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      </div>
    </>
  )
}
