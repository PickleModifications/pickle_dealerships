import { useEffect, useState } from 'react'
import { X, FileText, ShieldCheck, Gauge, Wrench, Palette, ScrollText } from 'lucide-react'
import { fetchNui, formatCurrency } from '../lib/utils'
import { t } from '../lib/locale'
import {
  getConditionGrade,
  parseProperties,
  extractPerformanceMods,
  extractCosmetics,
  formatPct,
  maskIdentifier,
  getPaintHex,
} from '../lib/pickleFax'
import type { PickleFaxDetails } from '../types'

export type PickleFaxMode = 'customer' | 'employee'

interface Props {
  stockId: number
  mode?: PickleFaxMode
  onClose: () => void
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

export function PickleFaxSheet({ details, mode = 'customer', onClose }: { details: PickleFaxDetails; mode?: PickleFaxMode; onClose?: () => void }) {
  const condPct = Number(details.condition) || 0
  const grade = getConditionGrade(condPct)
  const props = parseProperties(details.properties)
  const mods = extractPerformanceMods(props)
  const cosmetics = extractCosmetics(props)
  const bodyHealth = props?.bodyHealth != null ? Number(props.bodyHealth) / 10 : condPct
  const engineHealth = props?.engineHealth != null ? Number(props.engineHealth) / 10 : condPct
  const fuelLevel = props?.fuelLevel != null ? Number(props.fuelLevel) : null
  const dirtLevel = props?.dirtLevel != null ? Number(props.dirtLevel) : null
  const primary = getPaintHex(cosmetics.colorPrimary)
  const secondary = getPaintHex(cosmetics.colorSecondary)
  const primaryLabel = typeof cosmetics.colorPrimary === 'number' ? `Paint #${cosmetics.colorPrimary}` : (primary ?? '—')
  const secondaryLabel = typeof cosmetics.colorSecondary === 'number' ? `Paint #${cosmetics.colorSecondary}` : (secondary ?? '—')
  const reportDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div className="relative bg-gradient-to-b from-[#f8f0dc] to-[#ece0c0] text-stone-900 font-serif shadow-2xl border border-stone-400/60 w-full max-w-2xl mx-auto overflow-hidden">
      <div className="absolute top-8 right-20 rotate-[-12deg] border-[3px] border-rose-700/40 text-rose-700/50 px-3 py-1 text-xs font-bold tracking-widest pointer-events-none select-none">
        {t('picklefax_pre_owned_stamp')}
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-5 right-5 flex items-center justify-center text-stone-500 hover:text-stone-900 transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      )}

      <div className="px-8 pt-6 pb-4 border-b-2 border-double border-stone-700/60">
        <div className="flex items-center gap-2 text-stone-700">
          <FileText className="h-5 w-5" />
          <p className="text-[10px] uppercase tracking-[0.3em]">{t('picklefax_certified_report')}</p>
        </div>
        <h1 className="text-3xl font-bold tracking-tight mt-1">
          {t('picklefax_title').split('FAX')[0]}<span className="text-rose-700">FAX</span>
        </h1>
        <p className="text-xs text-stone-600 mt-0.5">{t('picklefax_subtitle')}</p>
        <div className="flex items-end justify-between mt-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-stone-500">{t('picklefax_subject_vehicle')}</p>
            <p className="text-xl font-semibold leading-tight">{details.label || details.model}</p>
            <p className="text-[11px] text-stone-600 font-mono uppercase">{details.model}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-stone-500">{t('picklefax_report_issued')}</p>
            <p className="text-sm font-semibold">{reportDate}</p>
          </div>
        </div>
      </div>

      <Section icon={<ShieldCheck className="h-4 w-4" />} title={t('picklefax_condition_assessment')}>
        <div className="flex items-center gap-5">
          <div className={`text-7xl font-black ${grade.color} leading-none`}>{grade.letter}</div>
          <div className="flex-1">
            <p className="text-xs uppercase tracking-wider text-stone-500">{t('picklefax_overall_grade')}</p>
            <p className="text-lg font-semibold">{grade.label}</p>
            <div className="mt-2 h-2 bg-stone-300 rounded-sm overflow-hidden">
              <div className={`h-full rounded-sm ${grade.color.replace('text-', 'bg-')}`} style={{ width: `${Math.round(condPct)}%` }} />
            </div>
            <p className="text-[11px] text-stone-600 mt-1 font-mono">{t('picklefax_condition_index', Math.round(condPct))}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 mt-4">
          <HealthBar label={t('picklefax_body_integrity')} pct={bodyHealth} />
          <HealthBar label={t('picklefax_engine_health')} pct={engineHealth} />
          {fuelLevel !== null && <HealthBar label={t('picklefax_fuel_level')} pct={fuelLevel} />}
          {dirtLevel !== null && <HealthBar label={t('picklefax_cleanliness')} pct={Math.max(0, 100 - (dirtLevel * 6.67))} />}
        </div>
      </Section>

      <Section icon={<Wrench className="h-4 w-4" />} title={t('picklefax_performance_mods')}>
        {mods.length === 0 ? (
          <p className="text-sm text-stone-600 italic">{t('picklefax_no_mods')}</p>
        ) : (
          <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
            {mods.map((m) => (
              <li key={m.key} className="flex justify-between border-b border-dotted border-stone-400/60 pb-1">
                <span className="text-stone-700">{m.label}</span>
                <span className="font-semibold">{m.value}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section icon={<Palette className="h-4 w-4" />} title={t('picklefax_cosmetic_profile')}>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <FactRow label={t('picklefax_primary_paint')}>
            <span className="inline-flex items-center gap-2">
              <span className="inline-block w-4 h-4 rounded-sm border border-stone-500" style={{ background: primary ?? 'transparent' }} />
              <span className="font-mono text-[11px]">{primaryLabel}</span>
            </span>
          </FactRow>
          <FactRow label={t('picklefax_secondary_paint')}>
            <span className="inline-flex items-center gap-2">
              <span className="inline-block w-4 h-4 rounded-sm border border-stone-500" style={{ background: secondary ?? 'transparent' }} />
              <span className="font-mono text-[11px]">{secondaryLabel}</span>
            </span>
          </FactRow>
          <FactRow label={t('picklefax_wheels')}><span>{cosmetics.wheels}</span></FactRow>
          <FactRow label={t('picklefax_plate_style')}><span>{cosmetics.plateIndex != null ? `Style #${cosmetics.plateIndex}` : '—'}</span></FactRow>
        </div>
        {cosmetics.extras.length > 0 && (
          <div className="mt-3">
            <p className="text-[10px] uppercase tracking-wider text-stone-500">{t('picklefax_optional_features')}</p>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {cosmetics.extras.map((e) => (
                <span key={e} className="text-[11px] border border-stone-500/60 px-1.5 py-0.5">{e}</span>
              ))}
            </div>
          </div>
        )}
      </Section>

      <Section icon={<ScrollText className="h-4 w-4" />} title={t('picklefax_title_history')}>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <FactRow label={t('picklefax_license_plate')}><span className="font-mono">{details.plate || '—'}</span></FactRow>
          <FactRow label={t('picklefax_acquired_on')}><span>{formatDate(details.orderedAt)}</span></FactRow>
          <FactRow label={t('picklefax_previous_owner')}>
            <span className="font-mono text-xs">
              {mode === 'employee' ? (details.acquiredFrom || t('label_unknown')) : maskIdentifier(details.acquiredFrom)}
            </span>
          </FactRow>
          <FactRow label={t('picklefax_listed_price')}><span className="font-semibold">{formatCurrency(details.retailPrice)}</span></FactRow>
        </div>
      </Section>

      <div className="px-8 py-3 border-t-2 border-double border-stone-700/60 flex items-center justify-between text-[10px] uppercase tracking-wider text-stone-600">
        <span className="flex items-center gap-1"><Gauge className="h-3 w-3" /> PickleFAX #{details.id}</span>
        <span>{t('picklefax_authenticated')}</span>
      </div>
    </div>
  )
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="px-8 py-4 border-b border-dashed border-stone-400/80">
      <div className="flex items-center gap-1.5 text-stone-700 mb-3">
        {icon}
        <h2 className="text-[11px] uppercase tracking-[0.25em] font-bold">{title}</h2>
      </div>
      {children}
    </div>
  )
}

function FactRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-baseline border-b border-dotted border-stone-400/60 pb-1">
      <span className="text-[11px] uppercase tracking-wider text-stone-500">{label}</span>
      {children}
    </div>
  )
}

function HealthBar({ label, pct }: { label: string; pct: number }) {
  const v = Math.max(0, Math.min(100, pct))
  const color = v >= 75 ? 'bg-emerald-600' : v >= 50 ? 'bg-amber-600' : 'bg-rose-600'
  return (
    <div>
      <div className="flex justify-between text-[11px]">
        <span className="text-stone-600">{label}</span>
        <span className="font-mono font-semibold">{formatPct(v)}</span>
      </div>
      <div className="h-1.5 bg-stone-300 rounded-sm overflow-hidden mt-0.5">
        <div className={`h-full ${color}`} style={{ width: `${v}%` }} />
      </div>
    </div>
  )
}

const EXIT_MS = 200

export function PickleFaxDialog({ stockId, mode = 'customer', onClose }: Props) {
  const [details, setDetails] = useState<PickleFaxDetails | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchNui<PickleFaxDetails | null>('getPickleFax', { stockId })
      .then((res) => {
        if (cancelled) return
        if (!res || !res.isUsed) setError(t('picklefax_not_available'))
        else setDetails(res)
      })
      .catch(() => { if (!cancelled) setError(t('picklefax_failed')) })
    return () => { cancelled = true }
  }, [stockId])

  useEffect(() => {
    if (details || error) {
      const id = requestAnimationFrame(() => setVisible(true))
      return () => cancelAnimationFrame(id)
    }
  }, [details, error])

  const handleClose = () => {
    if (closing) return
    setClosing(true)
    setVisible(false)
    setTimeout(onClose, EXIT_MS)
  }

  if (!details && !error) return null

  return (
    <>
      <div
        className={`fixed inset-0 z-[90] bg-black transition-opacity duration-200 ease-out ${visible ? 'opacity-70' : 'opacity-0'}`}
        onClick={handleClose}
      />
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 pointer-events-none">
        <div
          className={`relative w-full max-w-2xl max-h-[92vh] overflow-auto pointer-events-auto transition-all duration-200 ease-out ${visible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-2 scale-[0.98]'}`}
        >
          {error ? (
            <div className="relative bg-[#f5ecd7] text-stone-800 font-serif px-8 py-12 text-center border border-stone-400/60">
              <button
                onClick={handleClose}
                className="absolute top-5 right-5 flex items-center justify-center text-stone-500 hover:text-stone-900 transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
              <p className="text-lg font-semibold">{error}</p>
            </div>
          ) : details ? (
            <PickleFaxSheet details={details} mode={mode} onClose={handleClose} />
          ) : null}
        </div>
      </div>
    </>
  )
}

export default PickleFaxDialog
