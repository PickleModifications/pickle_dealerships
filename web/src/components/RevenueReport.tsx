import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent } from './ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { fetchNui, formatCurrency } from '../lib/utils'
import { t } from '../lib/locale'
import { ArrowUp, ArrowDown } from 'lucide-react'

interface DailyPoint {
  date: string
  revenue: number
  sales: number
}

interface ReportPayload {
  days: number
  daily: DailyPoint[]
  totalRevenue: number
  totalSales: number
  transactions: number
  avgPrice: number
  previous: { revenue: number; sales: number }
  topSeller?: { name: string; sales: number; revenue: number } | null
  popularVehicle?: { model: string; label: string; sales: number; revenue: number } | null
}

interface Props {
  dealershipId: number
}

// Compact revenue chart for the dashboard. Rendered with inline SVG so we don't
// pull a chart library for a single component — the area uses `hsl(var(--accent))`
// so it always matches whatever theme color the server has configured.
export default function RevenueReport({ dealershipId }: Props) {
  const [days, setDays] = useState<number>(30)
  const [report, setReport] = useState<ReportPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null)

  useEffect(() => {
    setLoading(true)
    fetchNui<ReportPayload | null>('getRevenueReport', { dealershipId, days })
      .then((res) => setReport(res ?? null))
      .finally(() => setLoading(false))
  }, [dealershipId, days])

  // Pre-compute delta percents vs the previous equivalent window so the
  // green/red badges next to each stat match the reference screenshot pattern.
  const deltas = useMemo(() => {
    if (!report) return { revenue: 0, sales: 0 }
    const rev = report.previous.revenue > 0
      ? ((report.totalRevenue - report.previous.revenue) / report.previous.revenue) * 100
      : (report.totalRevenue > 0 ? 100 : 0)
    const sales = report.previous.sales > 0
      ? ((report.totalSales - report.previous.sales) / report.previous.sales) * 100
      : (report.totalSales > 0 ? 100 : 0)
    return { revenue: rev, sales }
  }, [report])

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">{t('dashboard_revenue_report')}</h3>
          <Select value={String(days)} onValueChange={(v) => setDays(parseInt(v))}>
            <SelectTrigger className="h-7 w-[130px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">{t('dashboard_range_7d')}</SelectItem>
              <SelectItem value="14">{t('dashboard_range_14d')}</SelectItem>
              <SelectItem value="30">{t('dashboard_range_30d')}</SelectItem>
              <SelectItem value="60">{t('dashboard_range_60d')}</SelectItem>
              <SelectItem value="90">{t('dashboard_range_90d')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading || !report ? (
          <div className="h-[180px] flex items-center justify-center text-xs text-muted-foreground">
            {loading ? t('loading') : t('failed_to_load_statistics')}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-[1fr_200px] gap-4">
            <AreaChart
              data={report.daily}
              hover={hover}
              onHover={setHover}
            />
            <div className="grid grid-cols-2 md:grid-cols-1 gap-3 content-start">
              <StatBlock
                value={formatCurrency(report.totalRevenue)}
                label={t('label_total_revenue')}
                deltaPct={deltas.revenue}
              />
              <StatBlock
                value={String(report.transactions)}
                label={t('dashboard_transactions')}
                deltaPct={deltas.sales}
              />
              <StatBlock
                value={formatCurrency(report.avgPrice)}
                label={t('dashboard_avg_payment')}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function StatBlock({ value, label, deltaPct, subtle }: {
  value: string
  label: string
  deltaPct?: number
  subtle?: string
}) {
  const hasDelta = typeof deltaPct === 'number' && Number.isFinite(deltaPct)
  const positive = (deltaPct ?? 0) >= 0
  return (
    <div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <p className="text-lg font-bold truncate" title={value}>{value}</p>
        {hasDelta && (
          <span
            className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded ${
              positive ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
            }`}
          >
            {positive ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />}
            {Math.abs(deltaPct!).toFixed(1)}%
          </span>
        )}
      </div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mt-0.5">{label}</p>
      {subtle && <p className="text-[10px] text-muted-foreground">{subtle}</p>}
    </div>
  )
}

// Lightweight area+line chart. Width auto-scales via viewBox; height is fixed so
// the card sits inside the compact management window without overflowing.
function AreaChart({ data, hover, onHover }: {
  data: DailyPoint[]
  hover: { i: number; x: number; y: number } | null
  onHover: (h: { i: number; x: number; y: number } | null) => void
}) {
  const W = 600
  const H = 180
  const padL = 40
  const padR = 8
  const padT = 12
  const padB = 24

  const plotW = W - padL - padR
  const plotH = H - padT - padB

  const max = Math.max(1, ...data.map((d) => d.revenue))
  const xStep = data.length > 1 ? plotW / (data.length - 1) : plotW

  const points = data.map((d, i) => {
    const x = padL + i * xStep
    const y = padT + plotH - (d.revenue / max) * plotH
    return { x, y, d, i }
  })

  // Smooth area path: line along the top, then close back along the baseline.
  const lineD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const areaD = points.length
    ? `${lineD} L ${points[points.length - 1].x} ${padT + plotH} L ${points[0].x} ${padT + plotH} Z`
    : ''

  // 4 horizontal guide lines + evenly spaced value labels on the Y axis.
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    y: padT + plotH - t * plotH,
    value: max * t,
  }))

  // X labels thinned out so they never overlap regardless of window width.
  const xLabelEvery = Math.max(1, Math.ceil(data.length / 8))

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-[180px]"
        preserveAspectRatio="none"
        onMouseLeave={() => onHover(null)}
      >
        <defs>
          <linearGradient id="revenueAreaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity="0.35" />
            <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Grid */}
        {yTicks.map((tk, i) => (
          <g key={i}>
            <line
              x1={padL} x2={W - padR}
              y1={tk.y} y2={tk.y}
              stroke="hsl(var(--border))"
              strokeOpacity="0.4"
              strokeDasharray={i === 0 ? '' : '3 3'}
            />
            <text
              x={padL - 6}
              y={tk.y + 3}
              textAnchor="end"
              fontSize="9"
              fill="hsl(var(--muted-foreground))"
            >
              {formatCurrency(tk.value)}
            </text>
          </g>
        ))}

        {/* Area + line */}
        <path d={areaD} fill="url(#revenueAreaFill)" />
        <path d={lineD} fill="none" stroke="hsl(var(--accent))" strokeWidth="1.75" strokeLinejoin="round" />

        {/* Hover hit zones (one invisible rect per point) */}
        {points.map((p, i) => (
          <rect
            key={i}
            x={p.x - xStep / 2}
            y={padT}
            width={xStep}
            height={plotH}
            fill="transparent"
            onMouseEnter={() => onHover({ i, x: p.x, y: p.y })}
          />
        ))}

        {/* Data dots */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={hover?.i === i ? 3.5 : 1.5}
            fill="hsl(var(--accent))"
            stroke="hsl(var(--background))"
            strokeWidth={hover?.i === i ? 1.5 : 0}
          />
        ))}

        {/* X axis labels (thinned) */}
        {data.map((d, i) => {
          if (i % xLabelEvery !== 0 && i !== data.length - 1) return null
          const x = padL + i * xStep
          const day = d.date.slice(8) // DD
          return (
            <text
              key={i}
              x={x}
              y={H - 6}
              textAnchor="middle"
              fontSize="9"
              fill="hsl(var(--muted-foreground))"
            >
              {day}
            </text>
          )
        })}
      </svg>

      {/* Hover tooltip — absolute-positioned so it doesn't affect SVG layout */}
      {hover && data[hover.i] && (
        <div
          className="absolute pointer-events-none bg-card border border-border rounded px-2 py-1 text-[10px] shadow-md"
          style={{
            left: `${(hover.x / W) * 100}%`,
            top: `${(hover.y / H) * 100}%`,
            transform: 'translate(-50%, -120%)',
            whiteSpace: 'nowrap',
          }}
        >
          <div className="font-mono text-muted-foreground">{data[hover.i].date}</div>
          <div className="font-semibold" style={{ color: 'hsl(var(--accent))' }}>
            {formatCurrency(data[hover.i].revenue)}
          </div>
          <div className="text-muted-foreground">{data[hover.i].sales} {t('label_sales')}</div>
        </div>
      )}
    </div>
  )
}
