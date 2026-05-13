import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { X, FileText, CreditCard, AlertTriangle, PenLine, Banknote, Wallet } from 'lucide-react'
import Vara from 'vara'
import satisfyFont from '../../public/fonts/satisfy.json'
import { formatCurrency, fetchNui } from '../lib/utils'
import { t } from '../lib/locale'
import type { FinancingSettings } from '../types'

interface Props {
  vehicleLabel: string
  vehicleModel: string
  vehicleClass?: string
  isUsed?: boolean
  price: number
  dealershipName: string
  settings: FinancingSettings
  initialInstallments?: number
  playerName?: string
  onSign: (installments: number, paymentMethod: 'cash' | 'bank') => void
  onClose: () => void
  signing?: boolean
}

const SIGN_DURATION = 5000

export default function FinancingContractDialog({ vehicleLabel, vehicleModel, vehicleClass, isUsed, price, dealershipName, settings, initialInstallments, playerName, onSign, onClose, signing }: Props) {
  const [visible, setVisible] = useState(false)
  const [closing, setClosing] = useState(false)
  const [installments, setInstallments] = useState(initialInstallments ?? settings.installmentOptions[0] ?? 8)
  const [isSigning, setIsSigning] = useState(false)
  const [signProgress, setSignProgress] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank'>('bank')
  const [balances, setBalances] = useState<{ cash: number; bank: number } | null>(null)
  const [fundsError, setFundsError] = useState<string | null>(null)
  const varaContainerRef = useRef<HTMLDivElement>(null)
  const varaInstanceRef = useRef<Vara | null>(null)
  const signTimerRef = useRef<number | null>(null)
  const signStartRef = useRef<number>(0)
  const progressFrameRef = useRef<number | null>(null)
  const onSignCalledRef = useRef(false)

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [])

  // Fetch cash + bank balances so we can pre-flight the down payment
  useEffect(() => {
    fetchNui<{ cash: number; bank: number }>('getPlayerBalances', {}).then((res) => {
      if (res) setBalances({ cash: res.cash ?? 0, bank: res.bank ?? 0 })
    }).catch(() => {})
  }, [])

  const handleClose = () => {
    if (closing) return
    setClosing(true)
    setVisible(false)
    setTimeout(onClose, 200)
  }

  const interestRate = Math.round(settings.interestRate)
  // Normalize minDownPercent: default to 30 if nullish; if it's a legacy decimal (< 1, e.g. 0.3), convert to percent form.
  const rawMinDown = settings.minDownPercent
  const normalizedMinDown = rawMinDown == null ? 30 : (rawMinDown < 1 ? rawMinDown * 100 : rawMinDown)
  const downPayment = Math.floor(price * normalizedMinDown / 100)
  const financed = price - downPayment
  const totalInterest = Math.floor(financed * interestRate / 100)
  const totalWithInterest = financed + totalInterest
  const installmentAmount = Math.ceil(totalWithInterest / installments)

  const intervalLabel = settings.paymentIntervalHours >= 24
    ? `${Math.round(settings.paymentIntervalHours / 24)} day${Math.round(settings.paymentIntervalHours / 24) !== 1 ? 's' : ''}`
    : `${settings.paymentIntervalHours} hour${settings.paymentIntervalHours !== 1 ? 's' : ''}`

  const reportDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  const sigName = playerName || 'Player'

  // Bundle the font JSON into a blob URL so Vara can fetch it without needing a real HTTP path
  const fontBlobUrl = useMemo(() => {
    const blob = new Blob([JSON.stringify(satisfyFont)], { type: 'application/json' })
    return URL.createObjectURL(blob)
  }, [])

  useEffect(() => () => URL.revokeObjectURL(fontBlobUrl), [fontBlobUrl])

  const startSigning = useCallback(() => {
    // Pre-flight: check if the player has enough in the chosen account
    const available = paymentMethod === 'cash' ? (balances?.cash ?? 0) : (balances?.bank ?? 0)
    if (available < downPayment) {
      setFundsError(t('contract_insufficient_funds', formatCurrency(downPayment), formatCurrency(available)))
      return
    }
    setFundsError(null)
    setIsSigning(true)
    setSignProgress(0)
    signStartRef.current = Date.now()
    onSignCalledRef.current = false
  }, [balances, downPayment, paymentMethod])

  // Initialize Vara when the signing UI mounts
  useEffect(() => {
    if (!isSigning) return
    const container = varaContainerRef.current
    if (!container) return

    // Tag container so Vara can query it
    const containerId = `vara-sig-${Math.random().toString(36).slice(2, 9)}`
    container.id = containerId
    container.innerHTML = ''

    const instance = new Vara(
      `#${containerId}`,
      fontBlobUrl,
      [{ text: sigName, fontSize: 48, duration: SIGN_DURATION, color: '#1a1a2e', id: 'sig', textAlign: 'center' }],
      { strokeWidth: 1.4, textAlign: 'center' }
    )
    varaInstanceRef.current = instance

    instance.animationEnd(() => {
      if (!onSignCalledRef.current) {
        onSignCalledRef.current = true
        onSign(installments, paymentMethod)
      }
    })

    return () => {
      varaInstanceRef.current = null
      if (container) container.innerHTML = ''
    }
  }, [isSigning, sigName, installments, onSign, fontBlobUrl, paymentMethod])

  // Progress bar tick — independent of Vara internals
  useEffect(() => {
    if (!isSigning) return
    const tick = () => {
      const elapsed = Date.now() - signStartRef.current
      const p = Math.min(1, elapsed / SIGN_DURATION)
      setSignProgress(p)
      if (p < 1) progressFrameRef.current = requestAnimationFrame(tick)
    }
    progressFrameRef.current = requestAnimationFrame(tick)
    return () => {
      if (progressFrameRef.current) cancelAnimationFrame(progressFrameRef.current)
      progressFrameRef.current = null
    }
  }, [isSigning])

  const cancelSigning = useCallback(() => {
    if (progressFrameRef.current) cancelAnimationFrame(progressFrameRef.current)
    if (signTimerRef.current) clearTimeout(signTimerRef.current)
    progressFrameRef.current = null
    signTimerRef.current = null
    setIsSigning(false)
    setSignProgress(0)
    onSignCalledRef.current = true // prevent onSign firing if Vara animationEnd still fires
  }, [])

  useEffect(() => {
    return () => {
      if (progressFrameRef.current) cancelAnimationFrame(progressFrameRef.current)
      if (signTimerRef.current) clearTimeout(signTimerRef.current)
    }
  }, [])

  return (
    <>
      <div
        className={`fixed inset-0 z-[90] bg-black transition-opacity duration-200 ease-out ${visible ? 'opacity-70' : 'opacity-0'}`}
        onClick={isSigning ? undefined : handleClose}
      />
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 pointer-events-none">
        <div
          className={`relative w-full max-w-2xl max-h-[92vh] overflow-auto pointer-events-auto transition-all duration-200 ease-out ${visible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-2 scale-[0.98]'}`}
        >
          <div className="relative bg-gradient-to-b from-[#f8f0dc] to-[#ece0c0] text-stone-900 font-serif shadow-2xl border border-stone-400/60 w-full max-w-2xl mx-auto overflow-hidden">
            {/* Stamp */}
            <div className="absolute top-8 right-20 rotate-[-12deg] border-[3px] border-blue-700/40 text-blue-700/50 px-3 py-1 text-xs font-bold tracking-widest pointer-events-none select-none">
              {t('contract_stamp_financing')}
            </div>
            {!isSigning && (
              <button
                onClick={handleClose}
                className="absolute top-5 right-5 flex items-center justify-center text-stone-500 hover:text-stone-900 transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            )}

            {/* Header */}
            <div className="px-8 pt-6 pb-4 border-b-2 border-double border-stone-700/60">
              <div className="flex items-center gap-2 text-stone-700">
                <CreditCard className="h-5 w-5" />
                <p className="text-[10px] uppercase tracking-[0.3em]">{t('contract_official_doc')}</p>
              </div>
              <h1 className="text-2xl font-bold tracking-tight mt-1">{t('title_financing_agreement')}</h1>
              <p className="text-xs text-stone-600 mt-0.5">{dealershipName}</p>
              <div className="flex items-end justify-between mt-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-stone-500">{t('contract_subject_vehicle')}</p>
                  <p className="text-lg font-semibold leading-tight">{vehicleLabel}</p>
                  <p className="text-[11px] text-stone-600 font-mono uppercase">{vehicleModel}</p>
                  {vehicleClass && <p className="text-[10px] text-stone-500 capitalize">{vehicleClass}{isUsed ? ` · ${t('label_pre_owned')}` : ''}</p>}
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wider text-stone-500">{t('contract_date_issued')}</p>
                  <p className="text-sm font-semibold">{reportDate}</p>
                </div>
              </div>
            </div>

            {/* Plan Selection */}
            <Section title={t('contract_select_plan')}>
              <p className="text-[11px] text-stone-600 mb-3">{t('contract_select_plan_desc')}</p>
              <div className="flex flex-wrap gap-2">
                {settings.installmentOptions.map((n) => (
                  <button
                    key={n}
                    onClick={() => !isSigning && setInstallments(n)}
                    disabled={isSigning}
                    className={`px-4 py-2 rounded border text-sm font-semibold transition-colors ${
                      installments === n
                        ? 'bg-blue-800 text-white border-blue-800'
                        : 'bg-white/50 text-stone-700 border-stone-400/60 hover:bg-white/80 disabled:opacity-50'
                    }`}
                  >
                    {t('label_payments', n)}
                  </button>
                ))}
              </div>
            </Section>

            {/* Purchase Summary */}
            <Section title={t('contract_purchase_summary')}>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <FactRow label={t('label_vehicle_price')}><span className="font-semibold">{formatCurrency(price)}</span></FactRow>
                <FactRow label={t('label_down_payment', Math.round(settings.minDownPercent))}><span className="font-semibold text-emerald-700">{formatCurrency(downPayment)}</span></FactRow>
                <FactRow label={t('label_financed_amount')}><span className="font-semibold">{formatCurrency(financed)}</span></FactRow>
                <FactRow label={t('label_interest_rate')}><span className="font-semibold">{interestRate}%</span></FactRow>
              </div>
            </Section>

            {/* Payment Terms */}
            <Section title={t('contract_payment_schedule')}>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <FactRow label={t('label_total_with_interest')}><span className="font-bold text-lg">{formatCurrency(totalWithInterest)}</span></FactRow>
                <FactRow label={t('label_num_payments')}><span className="font-semibold">{installments}</span></FactRow>
                <FactRow label={t('label_per_payment')}><span className="font-bold text-blue-800">{formatCurrency(installmentAmount)}</span></FactRow>
                <FactRow label={t('label_payment_interval')}><span className="font-semibold">{t('label_every', intervalLabel)}</span></FactRow>
              </div>
            </Section>

            {/* Terms & Conditions */}
            <Section title={t('contract_terms_title')}>
              <div className="text-[11px] text-stone-700 space-y-2 italic leading-relaxed">
                <p>{t('contract_terms_body', formatCurrency(installmentAmount), intervalLabel)}</p>
                <div className="flex items-start gap-2 not-italic bg-rose-50/50 border border-rose-300/50 rounded p-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-rose-600 shrink-0 mt-0.5" />
                  <p className="text-rose-800 text-[10px]">{t('contract_terms_warning', settings.maxMissedPayments)}</p>
                </div>
                <p>{t('contract_terms_ownership')}</p>
              </div>
            </Section>

            {/* Signature Area */}
            <div className="px-8 py-5 border-t-2 border-double border-stone-700/60">
              {isSigning ? (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-stone-500 mb-2">{t('contract_signing')}</p>
                  <div className="relative border-2 border-stone-400 rounded bg-white/40 mb-3 overflow-hidden px-3 flex items-center justify-center" style={{ minHeight: 80 }}>
                    <div ref={varaContainerRef} className="w-full" />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-1.5 bg-stone-300 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-800 rounded-full transition-all duration-100" style={{ width: `${signProgress * 100}%` }} />
                    </div>
                    <button
                      onClick={cancelSigning}
                      className="h-8 px-4 rounded border border-stone-500 text-stone-700 hover:bg-stone-200 text-xs font-semibold transition-colors"
                    >
                      {t('btn_cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Payment method selector */}
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-stone-500 mb-1.5">{t('contract_payment_method')}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => { setPaymentMethod('bank'); setFundsError(null) }}
                        className={`flex items-center justify-between gap-2 px-3 py-2 rounded border-2 text-sm transition-colors ${paymentMethod === 'bank' ? 'border-blue-800 bg-blue-50 text-stone-900' : 'border-stone-300 bg-white/30 text-stone-600 hover:border-stone-500'}`}
                      >
                        <span className="flex items-center gap-2"><CreditCard className="h-4 w-4" /> {t('sales_payment_bank')}</span>
                        {balances && <span className="text-[10px] font-mono text-stone-500">{formatCurrency(balances.bank)}</span>}
                      </button>
                      <button
                        onClick={() => { setPaymentMethod('cash'); setFundsError(null) }}
                        className={`flex items-center justify-between gap-2 px-3 py-2 rounded border-2 text-sm transition-colors ${paymentMethod === 'cash' ? 'border-blue-800 bg-blue-50 text-stone-900' : 'border-stone-300 bg-white/30 text-stone-600 hover:border-stone-500'}`}
                      >
                        <span className="flex items-center gap-2"><Banknote className="h-4 w-4" /> {t('sales_payment_cash')}</span>
                        {balances && <span className="text-[10px] font-mono text-stone-500">{formatCurrency(balances.cash)}</span>}
                      </button>
                    </div>
                  </div>
                  {fundsError && (
                    <div className="flex items-start gap-2 px-3 py-2 rounded bg-red-100 border border-red-300">
                      <Wallet className="h-3.5 w-3.5 text-red-700 shrink-0 mt-0.5" />
                      <p className="text-red-800 text-[11px]">{fundsError}</p>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 border-b-2 border-stone-400 pb-1">
                      <p className="text-[10px] uppercase tracking-wider text-stone-500">{t('contract_buyer_signature')}</p>
                    </div>
                    <button
                      onClick={startSigning}
                      disabled={signing}
                      className="h-10 px-6 rounded bg-blue-800 hover:bg-blue-900 text-white font-semibold text-sm flex items-center gap-2 transition-colors disabled:opacity-50"
                    >
                      <PenLine className="h-4 w-4" />
                      {signing ? t('contract_processing') : t('btn_sign_finance')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-8 py-4 border-b border-dashed border-stone-400/80">
      <div className="flex items-center gap-1.5 text-stone-700 mb-3">
        <FileText className="h-4 w-4" />
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
