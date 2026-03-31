import { ShoppingCart, DollarSign, Package, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn, formatCurrency } from "@/lib/utils";

const mockDashboard = {
  todaySales: 5,
  todayRevenue: 1630000,
  totalSales: 142,
  totalRevenue: 28500000,
  revenueChart: [
    { day: "Mon", value: 420000 },
    { day: "Tue", value: 680000 },
    { day: "Wed", value: 310000 },
    { day: "Thu", value: 890000 },
    { day: "Fri", value: 1200000 },
    { day: "Sat", value: 750000 },
    { day: "Sun", value: 1630000 },
  ],
  topVehicles: [
    { name: "Pegassi Zentorno", count: 18 },
    { name: "Enus Paragon R", count: 14 },
    { name: "Grotti Turismo R", count: 11 },
    { name: "Benefactor Schafter V12", count: 9 },
    { name: "Obey 9F Cabrio", count: 7 },
  ],
  employeePerformance: [
    { name: "Alex Rivera", sales: 24 },
    { name: "Sam Taylor", sales: 18 },
    { name: "Jordan Kim", sales: 12 },
    { name: "Casey Morgan", sales: 8 },
  ],
};

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

export default function DashboardPage({ data }: { data: any }) {
  const dashboard = data?.dashboard ?? (isBrowser ? mockDashboard : {
    todaySales: 0, todayRevenue: 0, totalSales: 0, totalRevenue: 0,
    revenueChart: [], topVehicles: [], employeePerformance: [],
  });

  const stats = [
    {
      label: "Today's Sales",
      value: dashboard.todaySales,
      format: false,
      icon: ShoppingCart,
      color: "text-violet-400",
      bg: "bg-violet-500/20",
    },
    {
      label: "Today's Revenue",
      value: dashboard.todayRevenue,
      format: true,
      icon: DollarSign,
      color: "text-green-400",
      bg: "bg-green-500/20",
    },
    {
      label: "Total Sales",
      value: dashboard.totalSales,
      format: false,
      icon: Package,
      color: "text-blue-400",
      bg: "bg-blue-500/20",
    },
    {
      label: "Total Revenue",
      value: dashboard.totalRevenue,
      format: true,
      icon: TrendingUp,
      color: "text-amber-400",
      bg: "bg-amber-500/20",
    },
  ];

  const chartData = dashboard.revenueChart ?? [];
  const maxChartValue = Math.max(...chartData.map((d: any) => d.value), 1);

  const topVehicles = dashboard.topVehicles ?? [];
  const employeePerf = dashboard.employeePerformance ?? [];
  const maxSales = Math.max(...employeePerf.map((e: any) => e.sales), 1);

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
              <p className="text-2xl font-bold text-white">
                {stat.format ? formatCompact(stat.value) : stat.value}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">{stat.label}</p>
            </Card>
          );
        })}
      </div>

      {/* Revenue Chart */}
      <Card className="glass-subtle p-4 animate-slideUp">
        <h3 className="text-white font-medium mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-violet-400" />
          Revenue (Last 7 Days)
        </h3>

        <div className="flex items-end gap-2 h-32 px-4 pb-2">
          {chartData.map((day: any, i: number) => {
            const heightPct = (day.value / maxChartValue) * 100;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-[2rem]">
                <div
                  className="w-full bg-gradient-to-t from-violet-600 to-violet-400 rounded-t-md hover:from-violet-500 hover:to-violet-300 transition-all cursor-pointer relative group"
                  style={{ height: `${Math.max(heightPct, 4)}%` }}
                >
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black/80 text-white text-[10px] px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                    {formatCompact(day.value)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-2 px-4 mt-1">
          {chartData.map((day: any, i: number) => (
            <div key={i} className="flex-1 text-center text-xs text-slate-500 min-w-[2rem]">
              {day.day}
            </div>
          ))}
        </div>
      </Card>

      {/* Two Column: Top Vehicles + Employee Performance */}
      <div className="grid grid-cols-2 gap-3">
        {/* Top Vehicles */}
        <Card className="glass-subtle p-4 animate-slideUp">
          <h3 className="text-white font-medium mb-3 flex items-center gap-2">
            <Package className="w-4 h-4 text-blue-400" />
            Top Vehicles
          </h3>
          <div className="space-y-2.5">
            {topVehicles.map((vehicle: any, i: number) => (
              <div key={i} className="flex items-center gap-2.5">
                <span className="gradient-text font-bold text-sm w-5 text-center shrink-0">
                  {i + 1}
                </span>
                <p className="text-slate-300 text-sm flex-1 min-w-0 truncate">
                  {vehicle.name}
                </p>
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {vehicle.count}
                </Badge>
              </div>
            ))}
            {topVehicles.length === 0 && (
              <p className="text-slate-500 text-xs text-center py-4">No data yet</p>
            )}
          </div>
        </Card>

        {/* Employee Performance */}
        <Card className="glass-subtle p-4 animate-slideUp">
          <h3 className="text-white font-medium mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-violet-400" />
            Employee Performance
          </h3>
          <div className="space-y-3">
            {employeePerf.map((emp: any, i: number) => {
              const progress = (emp.sales / maxSales) * 100;
              return (
                <div key={i} className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0">
                    <span className="text-white text-[10px] font-bold">
                      {getInitials(emp.name)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-slate-300 text-xs truncate">{emp.name}</p>
                      <p className="text-slate-500 text-[10px] shrink-0 ml-2">{emp.sales} sales</p>
                    </div>
                    <Progress value={progress} className="h-1.5" />
                  </div>
                </div>
              );
            })}
            {employeePerf.length === 0 && (
              <p className="text-slate-500 text-xs text-center py-4">No data yet</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
