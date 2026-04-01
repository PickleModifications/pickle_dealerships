import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Progress } from '../components/ui/progress'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { ScrollArea } from '../components/ui/scroll-area'
import { Separator } from '../components/ui/separator'
import { fetchNui, formatCurrency } from '../lib/utils'
import { getCached, setCache, buildKey } from '../lib/cache'
import { SkeletonStatGrid, SkeletonCardGrid } from '../components/ui/skeleton'
import { X, TrendingUp, DollarSign, ShoppingCart, Users, Package, Award } from 'lucide-react'
import type { DealershipData, DashboardStats } from '../types'

interface Props {
  data: DealershipData
  onClose: () => void
}

const tierLabels: Record<number, string> = {
  1: 'Starter Lot',
  2: 'Established',
  3: 'Premium',
  4: 'Enterprise',
}

export default function DashboardPage({ data, onClose }: Props) {
  const cacheKey = buildKey(data.dealershipId, 'dashboard')
  const cached = getCached<DashboardStats>(cacheKey)
  const [stats, setStats] = useState<DashboardStats | null>(cached)
  const [loading, setLoading] = useState(!cached)

  useEffect(() => {
    fetchNui<{ success: boolean; data: DashboardStats }>('getDashboardStats', {
      dealershipId: data.dealershipId,
    }).then((res) => {
      if (res.success) { setStats(res.data); setCache(cacheKey, res.data) }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [data.dealershipId])

  return (
    <>
      {!data.embedded && (
        <>
          <div className="flex items-center justify-between p-5 pb-0">
            <div>
              <h1 className="text-xl font-bold">{data.dealershipName}</h1>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary">{tierLabels[data.tier] || `Tier ${data.tier}`}</Badge>
                <Badge variant="outline" className="capitalize">{data.role}</Badge>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>
          <Separator className="mt-4" />
        </>
      )}

      <ScrollArea className="flex-1 p-5">
        {loading ? (
          <div className="space-y-5"><SkeletonStatGrid count={4} /><SkeletonCardGrid count={2} columns={2} /><SkeletonCardGrid count={2} columns={2} /></div>
        ) : !stats ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground">Failed to load statistics</div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard icon={<ShoppingCart className="h-4 w-4" />} label="Total Sales" value={stats.totalSales.toString()} />
              <StatCard icon={<DollarSign className="h-4 w-4" />} label="Revenue" value={formatCurrency(stats.totalRevenue)} />
              <StatCard icon={<TrendingUp className="h-4 w-4" />} label="Profit" value={formatCurrency(stats.totalProfit)} />
              <StatCard icon={<Award className="h-4 w-4" />} label="Commission" value={formatCurrency(stats.totalCommission)} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">This Week</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-2xl font-bold">{stats.salesThisWeek}</p>
                      <p className="text-xs text-muted-foreground">sales</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold">{formatCurrency(stats.revenueThisWeek)}</p>
                      <p className="text-xs text-muted-foreground">revenue</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {stats.topSeller && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Top Seller</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-lg font-bold">{stats.topSeller.name}</p>
                    <p className="text-sm text-muted-foreground">{stats.topSeller.sales} sales</p>
                  </CardContent>
                </Card>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Package className="h-4 w-4" /> Stock
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex justify-between text-sm mb-2">
                    <span>{stats.stockCount} / {stats.stockCapacity}</span>
                    <span className="text-muted-foreground">{Math.round((stats.stockCount / stats.stockCapacity) * 100)}%</span>
                  </div>
                  <Progress value={(stats.stockCount / stats.stockCapacity) * 100} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Users className="h-4 w-4" /> Employees
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex justify-between text-sm mb-2">
                    <span>{stats.employeeCount} / {stats.employeeCapacity}</span>
                    <span className="text-muted-foreground">{Math.round((stats.employeeCount / stats.employeeCapacity) * 100)}%</span>
                  </div>
                  <Progress value={(stats.employeeCount / stats.employeeCapacity) * 100} />
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </ScrollArea>
    </>
  )
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          {icon}
          <span className="text-xs font-medium">{label}</span>
        </div>
        <p className="text-xl font-bold">{value}</p>
      </CardContent>
    </Card>
  )
}
