import { useState, useEffect, useRef } from 'react'
import { X, Loader2, Tag, Check } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { fetchNui, formatClass, formatCurrency } from '../lib/utils'
import { formatAltText, resolveAltCurrency, type AltCurrencyDef } from '../lib/altCurrency'
import { t } from '../lib/locale'
import PurchaseAddons, { type PurchaseAddonsValue, usePurchaseAddonsConfig, calculateAddonCost } from './PurchaseAddons'
import CouponPickerDialog, { type InventoryCoupon } from './CouponPickerDialog'
import type { StockItem } from '../types'

export interface ConfirmCoupon {
  code: string
  /** When the coupon came from an inventory item, the slot to burn on success. */
  slot?: number | null
  /** Server-side discount, displayed in the breakdown. Computed by parent. */
  discount?: number
}

interface Props {
  stock: StockItem
  dealershipId: number
  paymentMethod: string
  altCurrencies: AltCurrencyDef[]
  addons: PurchaseAddonsValue
  onAddonsChange: (next: PurchaseAddonsValue) => void
  coupon: ConfirmCoupon | null
  onCouponChange: (next: ConfirmCoupon | null) => void
  onConfirm: () => void
  onClose: () => void
  submitting: boolean
}

export default function ConfirmPurchaseDialog({ stock, dealershipId, paymentMethod, altCurrencies, addons, onAddonsChange, coupon, onCouponChange, onConfirm, onClose, submitting }: Props) {
  const [couponInput, setCouponInput] = useState(coupon?.code ?? '')
  const [pickerOpen, setPickerOpen] = useState(false)
  // Live-validation state for the typed coupon path. Inventory-sourced
  // coupons (slot != null) are pre-validated by the picker so they skip this.
  const [validating, setValidating] = useState(false)
  const [couponError, setCouponError] = useState<string | null>(null)
  // Sequence counter so a slow validation response can't clobber the result
  // of a later keystroke.
  const validateSeq = useRef(0)
  // Match the fade-in/out pattern used by FinancingContractDialog so the
  // modal doesn't pop in/out — one frame to apply the entry state, then
  // toggle the visible class.
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const handleClose = () => {
    if (submitting) return
    setVisible(false)
    setTimeout(onClose, 180)
  }

  const addonsConfig = usePurchaseAddonsConfig()
  const alt = resolveAltCurrency(paymentMethod, altCurrencies)
  const basePrice = stock.retail_price
  const addonCost = calculateAddonCost(basePrice, addons, addonsConfig)
  const plateCost = addons.customPlate !== undefined ? addonCost : 0
  // Server applies the coupon to the vehicle price BEFORE addons, so the
  // preview shows it the same way.
  const couponDiscount = coupon?.discount ?? 0
  const discountedBase = Math.max(0, basePrice - couponDiscount)
  const totalForDisplay = discountedBase + addonCost

  // Debounced live validation: hit the server preview endpoint as the user
  // types so the discount applies without needing them to blur/confirm. The
  // picker path owns its own slot+discount, so we skip live-validation while
  // a picked-from-inventory coupon is active.
  useEffect(() => {
    if (coupon?.slot != null) return
    const code = couponInput.trim().toUpperCase()
    if (!code) {
      setValidating(false)
      setCouponError(null)
      if (coupon) onCouponChange(null)
      return
    }
    const seq = ++validateSeq.current
    setValidating(true)
    setCouponError(null)
    const timer = setTimeout(() => {
      fetchNui<{ valid: boolean; discount?: number; message?: string }>('validateCouponPreview', {
        dealershipId,
        code,
        purchaseAmount: basePrice,
        vehicleModel: stock.vehicle_model,
      }).then((res) => {
        if (seq !== validateSeq.current) return
        setValidating(false)
        if (res && res.valid) {
          setCouponError(null)
          onCouponChange({ code, slot: null, discount: res.discount ?? 0 })
        } else {
          setCouponError(res?.message ?? t('coupon_invalid'))
          onCouponChange(null)
        }
      }).catch(() => {
        if (seq !== validateSeq.current) return
        setValidating(false)
        setCouponError(t('coupon_invalid'))
        onCouponChange(null)
      })
    }, 350)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [couponInput, dealershipId, basePrice, stock.vehicle_model])

  const clearCoupon = () => {
    setCouponInput('')
    setCouponError(null)
    setValidating(false)
    validateSeq.current++
    onCouponChange(null)
  }

  return (
    <>
      <div
        className={`fixed inset-0 z-[80] bg-black transition-opacity duration-200 ease-out ${visible ? 'opacity-70' : 'opacity-0'}`}
        onClick={handleClose}
      />
      <div className="fixed inset-0 z-[90] flex items-center justify-center p-6 pointer-events-none">
        <div
          className={`relative w-full max-w-md bg-black/95 border border-white/10 rounded-lg shadow-2xl pointer-events-auto overflow-hidden transition-all duration-200 ease-out ${visible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-2 scale-[0.98]'}`}
        >
          <div className="p-4 border-b border-white/10 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-white/40 mb-0.5">{t('btn_purchase')}</p>
              <h2 className="text-white text-base font-bold truncate">{stock.vehicle_label || stock.vehicle_model}</h2>
              <p className="text-white/40 text-xs">{formatClass(stock.class) || t('label_vehicle')}</p>
            </div>
            <button
              onClick={handleClose}
              className="text-white/40 hover:text-white shrink-0"
              disabled={submitting}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-4 space-y-3">
            <PurchaseAddons
              price={basePrice}
              value={addons}
              onChange={onAddonsChange}
              disabled={!!stock.is_used}
            />

            {/* Coupon. Picker pulls inventory items; the text field accepts a
                manually typed code (validated server-side at submit). */}
            <div className="rounded-md border border-border bg-muted/30 p-2.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm">
                  <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                  {t('label_coupon_code')}
                </span>
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="text-[11px] text-accent hover:text-accent/80"
                >
                  {t('coupon_select_existing')}
                </button>
              </div>
              <div className="flex gap-2 items-center">
                <div className="relative flex-1">
                  <Input
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                    placeholder={t('label_enter_coupon')}
                    className="h-8 text-sm font-mono uppercase tracking-wider pr-7"
                  />
                  {validating && (
                    <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  )}
                  {!validating && coupon && coupon.slot == null && !couponError && (
                    <Check className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-emerald-400" />
                  )}
                </div>
                {(coupon || couponInput) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2"
                    onClick={clearCoupon}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              {couponError ? (
                <p className="text-[10px] text-rose-400">{couponError}</p>
              ) : coupon ? (
                <p className="text-[10px] text-muted-foreground">
                  {coupon.slot != null ? t('coupon_from_inventory') : null}
                </p>
              ) : null}
            </div>

            {/* Breakdown */}
            <div className="rounded-md border border-white/10 bg-white/[0.03] p-3 space-y-1.5 text-sm">
              <div className="flex items-center justify-between text-white/70">
                <span>{t('label_vehicle_price')}</span>
                <span className="font-mono">{formatCurrency(basePrice)}</span>
              </div>
              {couponDiscount > 0 && (
                <div className="flex items-center justify-between text-emerald-400">
                  <span>{t('label_coupon_code')} {coupon?.code ? `(${coupon.code})` : ''}</span>
                  <span className="font-mono">-{formatCurrency(couponDiscount)}</span>
                </div>
              )}
              {plateCost > 0 && (
                <div className="flex items-center justify-between text-white/70">
                  <span>{t('addon_custom_plate')}</span>
                  <span className="font-mono text-accent">+{formatCurrency(plateCost)}</span>
                </div>
              )}
              <div className="border-t border-white/10 pt-1.5 mt-1.5 flex items-center justify-between">
                <span className="text-white font-semibold">{t('label_total')}</span>
                {alt ? (
                  <span className="text-white font-bold flex items-center gap-1.5">
                    {alt.iconUrl ? <img src={alt.iconUrl} alt="" className="h-3.5 w-3.5 object-contain" /> : null}
                    {formatAltText(alt, totalForDisplay)}
                  </span>
                ) : (
                  <span className="text-accent font-bold">{formatCurrency(totalForDisplay)}</span>
                )}
              </div>
              <div className="flex items-center justify-between text-[10px] text-white/40 pt-1">
                <span>{t('contract_payment_method')}</span>
                <span className="uppercase tracking-wider">
                  {alt ? alt.label : paymentMethod === 'cash' ? t('label_cash') : t('label_bank')}
                </span>
              </div>
            </div>
          </div>

          {pickerOpen && (
            <CouponPickerDialog
              dealershipId={dealershipId}
              price={basePrice}
              onClose={() => setPickerOpen(false)}
              onPick={(c: InventoryCoupon) => {
                setCouponInput(c.code)
                const discount = c.discountType === 'percent' && c.discountValue
                  ? Math.floor(basePrice * (c.discountValue / 100))
                  : (c.discountValue ?? 0)
                onCouponChange({ code: c.code, slot: c.slot ?? null, discount })
                setPickerOpen(false)
              }}
            />
          )}

          <div className="p-4 pt-0 flex items-center gap-2">
            <Button
              variant="outline"
              className="flex-1 h-9 border-white/20 text-white/80 hover:bg-white/10 hover:text-white"
              onClick={handleClose}
              disabled={submitting}
            >
              {t('btn_cancel')}
            </Button>
            <Button
              className="flex-1 h-9 gap-2"
              onClick={onConfirm}
              disabled={submitting}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : t('btn_confirm')}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
