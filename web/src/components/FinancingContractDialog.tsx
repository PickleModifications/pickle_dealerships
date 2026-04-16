import { useState, useEffect, useRef, useCallback } from 'react'
import { X, FileText, CreditCard, AlertTriangle, PenLine } from 'lucide-react'
import { formatCurrency } from '../lib/utils'
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
  onSign: (installments: number) => void
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
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const signTimerRef = useRef<number | null>(null)
  const signStartRef = useRef<number>(0)
  const animFrameRef = useRef<number | null>(null)

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const handleClose = () => {
    if (closing) return
    setClosing(true)
    setVisible(false)
    setTimeout(onClose, 200)
  }

  const interestRate = Math.round(settings.interestRate)
  const downPayment = Math.floor(price * settings.minDownPercent / 100)
  const financed = price - downPayment
  const totalInterest = Math.floor(financed * interestRate / 100)
  const totalWithInterest = financed + totalInterest
  const installmentAmount = Math.ceil(totalWithInterest / installments)

  const intervalLabel = settings.paymentIntervalHours >= 24
    ? `${Math.round(settings.paymentIntervalHours / 24)} day${Math.round(settings.paymentIntervalHours / 24) !== 1 ? 's' : ''}`
    : `${settings.paymentIntervalHours} hour${settings.paymentIntervalHours !== 1 ? 's' : ''}`

  const reportDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  const sigName = playerName || 'Player'

  // Signature animation — draws the player name character by character in cursive
  const drawSignature = useCallback((progress: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const w = canvas.width
    const h = canvas.height
    const dpr = window.devicePixelRatio || 1

    // Set canvas resolution for crisp text
    if (canvas.width !== Math.floor(w * dpr)) {
      const displayW = canvas.clientWidth
      const displayH = canvas.clientHeight
      canvas.width = displayW * dpr
      canvas.height = displayH * dpr
      ctx.scale(dpr, dpr)
    }

    const drawW = canvas.clientWidth
    const drawH = canvas.clientHeight
    ctx.clearRect(0, 0, drawW, drawH)

    // Determine how many characters to reveal
    const totalChars = sigName.length
    const charsToShow = Math.ceil(totalChars * progress)
    const partialText = sigName.slice(0, charsToShow)

    // Draw with a cursive font, dark ink colour
    const fontSize = Math.min(28, drawW / (totalChars * 0.55))
    ctx.font = `italic ${fontSize}px "Brush Script MT", "Segoe Script", "Apple Chancery", cursive`
    ctx.fillStyle = '#1a1a2e'
    ctx.textBaseline = 'middle'

    // Slight slant per character for a hand-signed feel
    const startX = drawW * 0.06
    let x = startX
    for (let i = 0; i < partialText.length; i++) {
      const ch = partialText[i]
      ctx.save()
      // Small random-ish vertical jitter seeded by char index for consistency
      const jitter = Math.sin(i * 7.3) * 1.5
      const slant = -0.08 + Math.sin(i * 3.1) * 0.03
      ctx.translate(x, drawH * 0.52 + jitter)
      ctx.transform(1, 0, slant, 1, 0, 0) // italic skew
      // Partial last character: fade in
      if (i === partialText.length - 1 && progress < 1) {
        const charProgress = (progress * totalChars) - (charsToShow - 1)
        ctx.globalAlpha = Math.max(0.2, charProgress)
      }
      ctx.fillText(ch, 0, 0)
      x += ctx.measureText(ch).width + 1
      ctx.restore()
    }

    // Underline flourish that grows with progress
    if (progress > 0.3) {
      const flourishProgress = Math.min(1, (progress - 0.3) / 0.7)
      const lineEndX = startX + (x - startX) * flourishProgress
      ctx.beginPath()
      ctx.strokeStyle = '#1a1a2e'
      ctx.lineWidth = 1
      ctx.globalAlpha = 0.4
      ctx.moveTo(startX, drawH * 0.75)
      // Slight wave
      const cp1x = startX + (lineEndX - startX) * 0.3
      const cp2x = startX + (lineEndX - startX) * 0.7
      ctx.bezierCurveTo(cp1x, drawH * 0.72, cp2x, drawH * 0.78, lineEndX, drawH * 0.73)
      ctx.stroke()
      ctx.globalAlpha = 1
    }
  }, [sigName])

  const startSigning = useCallback(() => {
    setIsSigning(true)
    setSignProgress(0)
    signStartRef.current = Date.now()

    const tick = () => {
      const elapsed = Date.now() - signStartRef.current
      const p = Math.min(1, elapsed / SIGN_DURATION)
      setSignProgress(p)
      drawSignature(p)

      if (p >= 1) {
        onSign(installments)
        return
      }
      animFrameRef.current = requestAnimationFrame(tick)
    }
    animFrameRef.current = requestAnimationFrame(tick)
  }, [drawSignature, installments, onSign])

  const cancelSigning = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    if (signTimerRef.current) clearTimeout(signTimerRef.current)
    animFrameRef.current = null
    signTimerRef.current = null
    setIsSigning(false)
    setSignProgress(0)
    const canvas = canvasRef.current
    if (canvas) {
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
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
                  <div className="relative border-2 border-stone-400 rounded bg-white/40 mb-3">
                    <canvas ref={canvasRef} className="w-full" style={{ height: 60 }} />
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
