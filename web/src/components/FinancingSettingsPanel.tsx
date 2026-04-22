import { useEffect, useState } from 'react'
import { Card, CardContent } from './ui/card'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Badge } from './ui/badge'
import { Separator } from './ui/separator'
import { Progress } from './ui/progress'
import { fetchNui, formatCurrency } from '../lib/utils'
import { t } from '../lib/locale'
import { Settings, Users, Check, X } from 'lucide-react'
import type { FinancingSettings, FinancingAgreement } from '../types'

interface Props {
  dealershipId: number
  dealershipName?: string
}

const ALL_INSTALLMENT_OPTIONS = [2, 4, 6, 8, 12, 16, 24]

export default function FinancingSettingsPanel({ dealershipId, dealershipName }: Props) {
  const [settings, setSettings] = useState<FinancingSettings | null>(null)
  const [agreements, setAgreements] = useState<FinancingAgreement[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const load = () => {
    setLoading(true)
    Promise.all([
      fetchNui<FinancingSettings | null>('getFinancingSettings', { dealershipId }),
      fetchNui<FinancingAgreement[]>('getDealershipFinancingAgreements', { dealershipId }),
    ]).then(([s, a]) => {
      if (s) setSettings(s)
      setAgreements(Array.isArray(a) ? a : [])
    }).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [dealershipId])

  const update = <K extends keyof FinancingSettings>(key: K, value: FinancingSettings[K]) => {
    if (!settings) return
    setSettings({ ...settings, [key]: value })
    setDirty(true)
  }

  const toggleInstallment = (n: number) => {
    if (!settings) return
    const opts = [...settings.installmentOptions]
    const idx = opts.indexOf(n)
    if (idx >= 0) {
      if (opts.length <= 1) return
      opts.splice(idx, 1)
    } else {
      opts.push(n)
    }
    opts.sort((a, b) => a - b)
    update('installmentOptions', opts)
  }

  const handleSave = () => {
    if (!settings) return
    setSaving(true)
    fetchNui<{ success: boolean }>('updateFinancingSettings', { dealershipId, settings }).then((res) => {
      if (res?.success) setDirty(false)
    }).finally(() => setSaving(false))
  }

  const handleForgive = (financingId: number) => {
    fetchNui<{ success: boolean }>('forgiveLoan', { financingId, dealershipId }).then((res) => {
      if (res?.success) load()
    })
  }

  if (loading) return <div className="p-5 text-center text-muted-foreground text-sm">{t('loading')}</div>
  if (!settings) return <div className="p-5 text-center text-muted-foreground text-sm">{t('financing_not_available_tier')}</div>

  const statusColors: Record<string, string> = {
    active: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    paid: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    repossessed: 'bg-red-500/20 text-red-300 border-red-500/30',
  }

  const activeAgreements = agreements.filter((a) => a.status === 'active')
  const otherAgreements = agreements.filter((a) => a.status !== 'active')

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="p-5 pb-3">
        <h1 className="text-xl font-bold">{t('tab_financing')}</h1>
        <p className="text-sm text-muted-foreground">
          {dealershipName ? `${dealershipName} — ` : ''}{t('label_financing_settings')}
        </p>
      </div>
      <Separator />
    <div className="p-5 space-y-5 overflow-auto flex-1">
      {/* Settings */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <Settings className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">{t('label_financing_settings')}</h3>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium">{t('label_min_down_pct')}</label>
              <Input type="number" value={Math.round(settings.minDownPercent)} onChange={(e) => update('minDownPercent', Math.round(parseInt(e.target.value) || 30))} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium">{t('label_interest_rate_pct')}</label>
              <Input type="number" value={Math.round(settings.interestRate)} onChange={(e) => update('interestRate', Math.round(parseInt(e.target.value) || 5))} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium">{t('label_payment_interval_hours')}</label>
              <Input type="number" value={Math.round(settings.paymentIntervalHours)} onChange={(e) => update('paymentIntervalHours', Math.round(parseInt(e.target.value) || 24))} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium">{t('label_max_missed_repo')}</label>
              <Input type="number" value={Math.round(settings.maxMissedPayments)} onChange={(e) => update('maxMissedPayments', Math.round(parseInt(e.target.value) || 3))} className="mt-1" />
            </div>
          </div>

          {/* Credit score gate — toggle + threshold. Rendered as a block so the
              disabled-provider notice sits with the controls it annotates. */}
          <div className="mt-4 rounded-md border border-border bg-muted/30 p-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 accent-accent"
                checked={settings.requireCreditScore === true}
                onChange={(e) => update('requireCreditScore', e.target.checked)}
              />
              <span className="text-xs font-medium">{t('label_require_credit_score')}</span>
            </label>
            {settings.requireCreditScore && (
              <div className="mt-2">
                <label className="text-[10px] text-muted-foreground">{t('label_min_credit_score')}</label>
                <Input
                  type="number"
                  min={300}
                  max={850}
                  value={Math.round(settings.minCreditScore ?? 600)}
                  onChange={(e) => {
                    const n = parseInt(e.target.value) || 600
                    update('minCreditScore', Math.max(300, Math.min(850, n)))
                  }}
                  className="mt-1"
                />
              </div>
            )}
            {settings.requireCreditScore && !settings.creditScoreProviderActive && (
              <p className="text-[10px] text-orange-400 mt-2">{t('label_credit_score_provider_offline')}</p>
            )}
          </div>

          <div className="mt-4">
            <label className="text-xs font-medium">{t('label_installment_options')}</label>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {ALL_INSTALLMENT_OPTIONS.map((n) => {
                const active = settings.installmentOptions.includes(n)
                return (
                  <button
                    key={n}
                    onClick={() => toggleInstallment(n)}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${active ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                  >
                    {t('label_payments', n)}
                  </button>
                )
              })}
            </div>
          </div>

          {dirty && (
            <Button className="w-full mt-4" onClick={handleSave} disabled={saving}>
              {saving ? t('saving') : t('btn_save_settings')}
            </Button>
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* Active Agreements */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">{t('label_active_loans')} ({activeAgreements.length})</h3>
        </div>

        {activeAgreements.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('label_no_active_loans')}</p>
        ) : (
          <div className="space-y-2">
            {activeAgreements.map((a) => {
              const paidPct = a.total_amount > 0 ? Math.round((a.amount_paid / a.total_amount) * 100) : 0
              const remaining = a.total_amount - a.amount_paid
              return (
                <Card key={a.id}>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="text-sm font-semibold">{a.vehicle_label || a.vehicle_plate}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">{a.vehicle_plate} · {a.identifier?.split(':').pop()?.slice(-6) || '***'}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {a.missed_payments > 0 && (
                          <Badge variant="destructive" className="text-[10px] gap-0.5">
                            {t('label_missed_payments', a.missed_payments)}
                          </Badge>
                        )}
                        <Badge className={`${statusColors[a.status] || ''} capitalize text-[10px]`}>{t(`status_${a.status}`)}</Badge>
                      </div>
                    </div>
                    <div className="flex justify-between text-xs mb-1">
                      <span>{t('label_paid', formatCurrency(a.amount_paid))}</span>
                      <span>{t('label_left', formatCurrency(remaining))}</span>
                    </div>
                    <Progress value={paidPct} className="h-1.5" />
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-[10px] text-muted-foreground">{t('label_per_payment_interest', formatCurrency(a.installment_amount), a.interest_rate)}</p>
                      <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1" onClick={() => handleForgive(a.id)}>
                        <Check className="h-3 w-3" /> {t('btn_forgive')}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Completed / Repossessed */}
      {otherAgreements.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground mb-2">{t('label_completed_repossessed')}</h3>
          <div className="space-y-1.5">
            {otherAgreements.map((a) => (
              <div key={a.id} className="flex items-center justify-between py-1.5 px-2 rounded bg-muted/50 text-xs">
                <span>{a.vehicle_label || a.vehicle_plate}</span>
                <Badge className={`${statusColors[a.status] || ''} capitalize text-[10px]`}>{t(`status_${a.status}`)}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
    </div>
  )
}
