import { useState } from "react";
import {
  DollarSign,
  TrendingUp,
  ArrowDownCircle,
  BarChart3,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowUpCircle,
  ShoppingCart,
  Package,
  Receipt,
  Coins,
  Wallet,
  Download,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn, formatCurrency, fetchNui } from "@/lib/utils";

const mockFinances = {
  balance: 2450000,
  revenue: 890000,
  expenses: 320000,
  profit: 570000,
  transactions: [
    { id: 1, type: "sale", description: "Sold Pegassi Zentorno", amount: 725000, date: "2026-03-31" },
    { id: 2, type: "commission", description: "Commission - Alex Rivera", amount: -36250, date: "2026-03-31" },
    { id: 3, type: "tax", description: "Sales tax", amount: -72500, date: "2026-03-31" },
    { id: 4, type: "order", description: "Ordered 2x Benefactor Schafter", amount: -290000, date: "2026-03-30" },
    { id: 5, type: "sale", description: "Sold Enus Paragon R", amount: 905000, date: "2026-03-30" },
    { id: 6, type: "withdrawal", description: "Owner withdrawal", amount: -200000, date: "2026-03-29" },
    { id: 7, type: "deposit", description: "Owner deposit", amount: 500000, date: "2026-03-28" },
    { id: 8, type: "upgrade", description: "Showroom upgrade", amount: -150000, date: "2026-03-27" },
  ],
};

const isBrowser = !(window as any).invokeNative;

const typeConfig: Record<string, { icon: any; color: string; bg: string }> = {
  sale: { icon: ShoppingCart, color: "text-green-400", bg: "bg-green-500/20" },
  order: { icon: Package, color: "text-blue-400", bg: "bg-blue-500/20" },
  withdrawal: { icon: ArrowUpRight, color: "text-red-400", bg: "bg-red-500/20" },
  deposit: { icon: ArrowDownLeft, color: "text-green-400", bg: "bg-green-500/20" },
  upgrade: { icon: ArrowUpCircle, color: "text-violet-400", bg: "bg-violet-500/20" },
  tax: { icon: Receipt, color: "text-amber-400", bg: "bg-amber-500/20" },
  commission: { icon: Coins, color: "text-yellow-400", bg: "bg-yellow-500/20" },
};

export default function FinancesPage({ data }: { data: any }) {
  const finances = data?.finances ?? (isBrowser ? mockFinances : { balance: 0, revenue: 0, expenses: 0, profit: 0, transactions: [] });

  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [amount, setAmount] = useState("");

  const handleWithdraw = () => {
    fetchNui("finances:withdraw", { amount: Number(amount) });
    setWithdrawOpen(false);
    setAmount("");
  };

  const handleDeposit = () => {
    fetchNui("finances:deposit", { amount: Number(amount) });
    setDepositOpen(false);
    setAmount("");
  };

  const stats = [
    {
      label: "Balance",
      value: finances.balance,
      icon: DollarSign,
      color: "text-violet-400",
      bg: "bg-violet-500/20",
      gradient: true,
    },
    {
      label: "Revenue",
      value: finances.revenue,
      icon: TrendingUp,
      color: "text-green-400",
      bg: "bg-green-500/20",
      gradient: false,
    },
    {
      label: "Expenses",
      value: finances.expenses,
      icon: ArrowDownCircle,
      color: "text-red-400",
      bg: "bg-red-500/20",
      gradient: false,
    },
    {
      label: "Profit",
      value: finances.profit,
      icon: BarChart3,
      color: finances.profit >= 0 ? "text-green-400" : "text-red-400",
      bg: finances.profit >= 0 ? "bg-green-500/20" : "bg-red-500/20",
      gradient: false,
    },
  ];

  return (
    <div className="animate-fadeIn space-y-4">
      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-3">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="glass-subtle p-4 animate-slideUp">
              <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center mb-3", stat.bg)}>
                <Icon className={cn("w-4 h-4", stat.color)} />
              </div>
              <p className="text-xs text-slate-500 uppercase tracking-wider">{stat.label}</p>
              <p className={cn("text-xl font-bold mt-0.5", stat.gradient ? "gradient-text" : "text-white")}>
                {formatCurrency(stat.value)}
              </p>
            </Card>
          );
        })}
      </div>

      {/* Action Row */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => { setAmount(""); setWithdrawOpen(true); }}
        >
          <Upload className="w-4 h-4 mr-2" />
          Withdraw
        </Button>
        <Button
          className="flex-1"
          onClick={() => { setAmount(""); setDepositOpen(true); }}
        >
          <Download className="w-4 h-4 mr-2" />
          Deposit
        </Button>
      </div>

      {/* Transactions */}
      <Card className="glass-subtle p-4">
        <h3 className="text-white font-medium mb-3 flex items-center gap-2">
          <Wallet className="w-4 h-4 text-violet-400" />
          Recent Transactions
        </h3>

        <ScrollArea className="max-h-[300px]">
          <div className="space-y-0">
            {finances.transactions.map((tx: any, i: number) => {
              const config = typeConfig[tx.type] || typeConfig.sale;
              const TxIcon = config.icon;
              const isPositive = tx.amount > 0;

              return (
                <div key={tx.id}>
                  <div className="flex items-center gap-3 py-2.5 px-1 rounded-lg hover:bg-white/[0.02] transition-colors">
                    <div className={cn("w-6 h-6 rounded-full flex items-center justify-center shrink-0", config.bg)}>
                      <TxIcon className={cn("w-3 h-3", config.color)} />
                    </div>
                    <p className="text-slate-300 text-sm flex-1 min-w-0 truncate">
                      {tx.description}
                    </p>
                    <div className="text-right shrink-0">
                      <p className={cn("text-sm font-medium", isPositive ? "text-green-400" : "text-red-400")}>
                        {isPositive ? "+" : ""}{formatCurrency(tx.amount)}
                      </p>
                      <p className="text-xs text-slate-500">{tx.date}</p>
                    </div>
                  </div>
                  {i < finances.transactions.length - 1 && <Separator />}
                </div>
              );
            })}

            {finances.transactions.length === 0 && (
              <div className="py-8 text-center">
                <Wallet className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                <p className="text-slate-400 text-sm">No transactions yet</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </Card>

      {/* Withdraw Dialog */}
      <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
        <DialogContent className="glass border-white/10">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center">
                <Upload className="w-4 h-4 text-red-400" />
              </div>
              Withdraw Funds
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Transfer funds from the dealership to your account
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <label className="text-xs text-slate-400 font-medium uppercase tracking-wider">Amount</label>
            <div className="relative mt-2">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="pl-10"
                placeholder="Enter amount..."
              />
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Available: <span className="text-violet-400">{formatCurrency(finances.balance)}</span>
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWithdrawOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleWithdraw} disabled={!amount || Number(amount) <= 0}>
              Withdraw
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deposit Dialog */}
      <Dialog open={depositOpen} onOpenChange={setDepositOpen}>
        <DialogContent className="glass border-white/10">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                <Download className="w-4 h-4 text-green-400" />
              </div>
              Deposit Funds
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Add funds to the dealership account
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <label className="text-xs text-slate-400 font-medium uppercase tracking-wider">Amount</label>
            <div className="relative mt-2">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="pl-10"
                placeholder="Enter amount..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDepositOpen(false)}>Cancel</Button>
            <Button onClick={handleDeposit} disabled={!amount || Number(amount) <= 0}>
              Deposit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
