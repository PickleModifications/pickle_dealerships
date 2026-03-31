import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn, formatCurrency, fetchNui } from "@/lib/utils";
import {
  CreditCard,
  AlertTriangle,
  Calendar,
  DollarSign,
  CheckCircle2,
  Banknote,
} from "lucide-react";

const STATUS_STYLE: Record<string, { badge: string; label: string }> = {
  active:      { badge: "bg-violet-500/20 text-violet-300 border-violet-500/30",    label: "Active" },
  paid:        { badge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",  label: "Paid" },
  defaulted:   { badge: "bg-red-500/20 text-red-300 border-red-500/30",              label: "Defaulted" },
  repossessed: { badge: "bg-red-500/20 text-red-300 border-red-500/30",              label: "Repossessed" },
};

export default function FinancingPage({ data }: { data: any }) {
  const [paymentDialog, setPaymentDialog] = useState<any>(null);

  const plans = data?.plans ?? [];

  const handleConfirmPayment = () => {
    if (!paymentDialog) return;
    fetchNui("makeFinancingPayment", { planId: paymentDialog.id });
    setPaymentDialog(null);
  };

  const isOverdue = (plan: any) => {
    const next = plan.nextPaymentDate ?? plan.nextPayment;
    if (!next || plan.status !== "active") return false;
    return new Date(next) < new Date();
  };

  return (
    <div className="flex flex-col h-full animate-fadeIn">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold gradient-text">Vehicle Financing</h1>
        <p className="text-sm text-white/40 mt-1">Manage your active financing plans and payments</p>
      </div>

      {/* Plans List */}
      <ScrollArea className="flex-1">
        {plans.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 animate-fadeIn">
            <div className="w-16 h-16 rounded-full glass-subtle flex items-center justify-center mb-4">
              <CreditCard className="w-8 h-8 text-white/20" />
            </div>
            <p className="text-white/40 text-lg font-medium">No active financing plans</p>
            <p className="text-white/25 text-sm mt-1">Purchase a vehicle with financing to see plans here</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4 pr-4">
            {plans.map((plan: any, idx: number) => {
              const overdue = isOverdue(plan);
              const status = plan.status ?? "active";
              const statusStyle = STATUS_STYLE[status] ?? STATUS_STYLE.active;

              const total = plan.totalAmount ?? plan.total ?? 1;
              const paid = plan.amountPaid ?? plan.paid ?? 0;
              const remaining = plan.remaining ?? total - paid;
              const installment = plan.installmentAmount ?? plan.installment ?? 0;
              const progressPercent = Math.min(100, (paid / total) * 100);
              const missedPayments = plan.missedPayments ?? plan.missed_payments ?? 0;
              const plate = plan.vehiclePlate ?? plan.plate ?? "------";
              const vehicleName = plan.vehicleName ?? null;
              const nextPayment = plan.nextPaymentDate ?? plan.nextPayment ?? null;

              return (
                <Card
                  key={plan.id ?? idx}
                  className={cn(
                    "glass-subtle border-white/[0.06] p-5 animate-slideUp transition-all",
                    overdue && "border-red-500/20 glow-red"
                  )}
                  style={{ animationDelay: `${idx * 60}ms` }}
                >
                  {/* Top Row: Plate + Status */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-lg text-white bg-white/[0.04] px-3 py-1 rounded-md border border-white/[0.08]">
                        {plate}
                      </span>
                      {vehicleName && (
                        <span className="text-sm text-white/50">{vehicleName}</span>
                      )}
                    </div>
                    <Badge variant="secondary" className={cn("text-xs", statusStyle.badge)}>
                      {statusStyle.label}
                    </Badge>
                  </div>

                  {/* Financial Breakdown Grid */}
                  <div className="grid grid-cols-4 gap-3 mb-4">
                    <div className="glass-subtle border border-white/[0.04] rounded-lg p-3 text-center">
                      <p className="text-base font-bold text-white">{formatCurrency(total)}</p>
                      <p className="text-[10px] text-white/35 uppercase tracking-wider mt-1">Total</p>
                    </div>
                    <div className="glass-subtle border border-white/[0.04] rounded-lg p-3 text-center">
                      <p className="text-base font-bold text-emerald-400">{formatCurrency(paid)}</p>
                      <p className="text-[10px] text-white/35 uppercase tracking-wider mt-1">Paid</p>
                    </div>
                    <div className="glass-subtle border border-white/[0.04] rounded-lg p-3 text-center">
                      <p className="text-base font-bold text-white">{formatCurrency(remaining)}</p>
                      <p className="text-[10px] text-white/35 uppercase tracking-wider mt-1">Remaining</p>
                    </div>
                    <div className="glass-subtle border border-white/[0.04] rounded-lg p-3 text-center">
                      <p className="text-base font-bold text-violet-300">{formatCurrency(installment)}</p>
                      <p className="text-[10px] text-white/35 uppercase tracking-wider mt-1">Installment</p>
                    </div>
                  </div>

                  {/* Payment Progress */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-white/40">Payment Progress</span>
                      <span className="text-xs font-semibold text-white">{Math.round(progressPercent)}%</span>
                    </div>
                    <Progress value={progressPercent} className="h-2 bg-white/[0.06]" />
                  </div>

                  {/* Next Payment + Action */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-white/30" />
                      {nextPayment ? (
                        <span className={cn(
                          "text-sm",
                          overdue ? "text-red-400 font-semibold" : "text-white/50"
                        )}>
                          {overdue ? "Overdue: " : "Next: "}
                          {new Date(nextPayment).toLocaleDateString()}
                        </span>
                      ) : (
                        <span className="text-sm text-white/30">--</span>
                      )}
                    </div>
                    <Button
                      variant="default"
                      size="sm"
                      className="gap-1.5"
                      disabled={status !== "active"}
                      onClick={() => setPaymentDialog(plan)}
                    >
                      <Banknote className="w-3.5 h-3.5" />
                      Make Payment
                    </Button>
                  </div>

                  {/* Missed Payments Warning */}
                  {missedPayments > 0 && (
                    <div className="mt-4 -mx-5 -mb-5 px-5 py-3 bg-red-500/[0.08] border-t border-red-500/20 rounded-b-xl flex items-center gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                      <span className="text-sm text-red-300">
                        {missedPayments} missed payment{missedPayments > 1 ? "s" : ""} — pay now to avoid repossession
                      </span>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* Payment Confirmation Dialog */}
      <Dialog open={!!paymentDialog} onOpenChange={(open) => !open && setPaymentDialog(null)}>
        <DialogContent className="glass border-white/[0.08] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="gradient-text text-xl">Confirm Payment</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <div className="glass-subtle border border-white/[0.06] rounded-xl p-6 flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-violet-500/20 flex items-center justify-center">
                <DollarSign className="w-7 h-7 text-violet-400" />
              </div>
              <span className="text-2xl font-bold text-white">
                {formatCurrency(paymentDialog?.installmentAmount ?? paymentDialog?.installment ?? 0)}
              </span>
              <span className="text-xs text-white/40 uppercase tracking-wider">Installment Amount</span>
              {(paymentDialog?.vehiclePlate || paymentDialog?.plate) && (
                <span className="font-mono text-sm text-white/50 bg-white/[0.04] px-2 py-0.5 rounded border border-white/[0.08]">
                  {paymentDialog.vehiclePlate ?? paymentDialog.plate}
                </span>
              )}
            </div>
          </div>
          <DialogFooter className="flex gap-2 sm:gap-2">
            <DialogClose asChild>
              <Button variant="ghost" className="flex-1 glass-subtle border border-white/[0.08]">
                Cancel
              </Button>
            </DialogClose>
            <Button variant="default" className="flex-1 gap-2" onClick={handleConfirmPayment}>
              <CheckCircle2 className="w-4 h-4" />
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
