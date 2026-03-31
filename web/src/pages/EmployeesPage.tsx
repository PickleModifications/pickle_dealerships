import { useState } from "react";
import { Plus, Users, UserCog, Percent, Trash2, Shield, BadgeCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn, formatCurrency, fetchNui } from "@/lib/utils";

const mockEmployees = [
  { id: 1, name: "Alex Rivera", role: "manager", commission: 8, sales: 24, revenue: 1850000 },
  { id: 2, name: "Jordan Kim", role: "salesperson", commission: 5, sales: 12, revenue: 450000 },
  { id: 3, name: "Sam Taylor", role: "salesperson", commission: 5, sales: 18, revenue: 720000 },
];

const isBrowser = !(window as any).invokeNative;

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatCompact(value: number) {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return formatCurrency(value);
}

export default function EmployeesPage({ data }: { data: any }) {
  const employees = data?.employees ?? (isBrowser ? mockEmployees : []);
  const maxEmployees = data?.maxEmployees ?? 6;

  const [hireOpen, setHireOpen] = useState(false);
  const [fireTarget, setFireTarget] = useState<any>(null);
  const [hireServerId, setHireServerId] = useState("");
  const [hireRole, setHireRole] = useState<"manager" | "salesperson">("salesperson");

  const handleHire = () => {
    fetchNui("employees:hire", { serverId: hireServerId, role: hireRole });
    setHireOpen(false);
    setHireServerId("");
    setHireRole("salesperson");
  };

  const handleFire = () => {
    if (!fireTarget) return;
    fetchNui("employees:fire", { employeeId: fireTarget.id });
    setFireTarget(null);
  };

  const handleEditRole = (employee: any) => {
    fetchNui("employees:editRole", { employeeId: employee.id });
  };

  const handleSetCommission = (employee: any) => {
    fetchNui("employees:setCommission", { employeeId: employee.id });
  };

  return (
    <div className="animate-fadeIn space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-white font-semibold text-lg">Employees</h2>
          <Badge variant="outline" className="text-xs">
            {employees.length}/{maxEmployees}
          </Badge>
        </div>
        <Button onClick={() => setHireOpen(true)} size="sm">
          <Plus className="w-4 h-4 mr-1.5" />
          Hire Employee
        </Button>
      </div>

      {/* Employee List */}
      {employees.length > 0 ? (
        <ScrollArea className="max-h-[500px]">
          <div className="space-y-2">
            {employees.map((emp: any) => (
              <Card
                key={emp.id}
                className="glass-subtle glass-hover p-4 animate-slideUp"
              >
                <div className="flex items-center gap-3">
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-lg shadow-violet-500/20">
                    <span className="text-white text-sm font-bold">
                      {getInitials(emp.name)}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-white font-medium truncate">{emp.name}</p>
                      <Badge
                        variant={emp.role === "manager" ? "default" : "info"}
                        className="text-[10px] shrink-0"
                      >
                        {emp.role === "manager" ? (
                          <Shield className="w-3 h-3 mr-1" />
                        ) : (
                          <BadgeCheck className="w-3 h-3 mr-1" />
                        )}
                        {emp.role === "manager" ? "Manager" : "Salesperson"}
                      </Badge>
                    </div>
                    <p className="text-slate-400 text-xs mt-0.5">
                      Commission: {emp.commission}%
                    </p>
                    <p className="text-slate-500 text-xs">
                      {emp.sales} sales · {formatCompact(emp.revenue)} revenue
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-slate-400 hover:text-violet-300"
                      onClick={() => handleEditRole(emp)}
                    >
                      <UserCog className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-slate-400 hover:text-violet-300"
                      onClick={() => handleSetCommission(emp)}
                    >
                      <Percent className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-400/60 hover:text-red-400 hover:bg-red-500/10"
                      onClick={() => setFireTarget(emp)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </ScrollArea>
      ) : (
        <Card className="glass-subtle p-10 text-center">
          <Users className="w-10 h-10 text-slate-500 mx-auto mb-3" />
          <p className="text-slate-400 text-sm font-medium">No employees yet</p>
          <p className="text-slate-500 text-xs mt-1">Hire your first employee to get started</p>
        </Card>
      )}

      {/* Hire Dialog */}
      <Dialog open={hireOpen} onOpenChange={setHireOpen}>
        <DialogContent className="glass border-white/10">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center">
                <Plus className="w-4 h-4 text-violet-400" />
              </div>
              Hire Employee
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Enter the player's server ID to hire them
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-xs text-slate-400 font-medium uppercase tracking-wider">
                Server ID
              </label>
              <Input
                type="number"
                value={hireServerId}
                onChange={(e) => setHireServerId(e.target.value)}
                placeholder="Enter player server ID..."
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs text-slate-400 font-medium uppercase tracking-wider">
                Role
              </label>
              <div className="flex gap-2">
                {[
                  { key: "manager", label: "Manager", icon: Shield },
                  { key: "salesperson", label: "Salesperson", icon: BadgeCheck },
                ].map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => setHireRole(key as any)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all flex items-center gap-1.5 flex-1 justify-center",
                      hireRole === key
                        ? "bg-violet-500/20 text-violet-300 border-violet-500/30"
                        : "bg-white/5 text-slate-400 border-white/10 hover:bg-white/10"
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setHireOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleHire} disabled={!hireServerId}>
              <Plus className="w-4 h-4 mr-1.5" />
              Hire
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fire Confirmation Dialog */}
      <Dialog open={!!fireTarget} onOpenChange={() => setFireTarget(null)}>
        <DialogContent className="glass border-white/10">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center">
                <Trash2 className="w-4 h-4 text-red-400" />
              </div>
              Fire Employee
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Are you sure you want to fire{" "}
              <span className="text-white font-medium">{fireTarget?.name}</span>?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFireTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleFire}>
              <Trash2 className="w-4 h-4 mr-1.5" />
              Fire Employee
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
