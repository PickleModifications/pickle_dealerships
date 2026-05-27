import { useEffect, useState } from 'react'
import { Input } from './ui/input'
import { Hash } from 'lucide-react'
import { fetchNui, formatCurrency } from '../lib/utils'
import { t } from '../lib/locale'

export interface PurchaseAddonsValue {
  customPlate?: string
}

export interface PurchaseAddonsConfig {
  customPlate: {
    enabled: boolean
    costPercent: number
    minLength: number
    maxLength: number
  }
}

// Module-level cache so the config only fetches once per NUI session, not
// once per dialog mount. Stays valid until the page reloads.
let cachedConfig: PurchaseAddonsConfig | null = null
let inflight: Promise<PurchaseAddonsConfig | null> | null = null

function loadConfig(): Promise<PurchaseAddonsConfig | null> {
  if (cachedConfig) return Promise.resolve(cachedConfig)
  if (inflight) return inflight
  inflight = fetchNui<PurchaseAddonsConfig>('getPurchaseAddons')
    .then((res) => { cachedConfig = res ?? null; return cachedConfig })
    .catch(() => null)
    .finally(() => { inflight = null })
  return inflight
}

/** Hook for callers that need the addon config to render their own preview
 *  (e.g. price breakdowns) without re-fetching. Shares the module cache. */
export function usePurchaseAddonsConfig(): PurchaseAddonsConfig | null {
  const [config, setConfig] = useState<PurchaseAddonsConfig | null>(cachedConfig)
  useEffect(() => {
    if (config) return
    let cancelled = false
    loadConfig().then((cfg) => { if (!cancelled) setConfig(cfg) })
    return () => { cancelled = true }
  }, [config])
  return config
}

/** Total add-on cost in dollars for a given base price + selected addons. */
export function calculateAddonCost(basePrice: number, addons: PurchaseAddonsValue, config: PurchaseAddonsConfig | null): number {
  if (!config) return 0
  let total = 0
  if (addons.customPlate !== undefined && config.customPlate.enabled) {
    total += Math.floor((basePrice || 0) * config.customPlate.costPercent)
  }
  return total
}

interface Props {
  price: number
  value: PurchaseAddonsValue
  onChange: (next: PurchaseAddonsValue) => void
  /** Hide when pre-owned (existing plate carries over). */
  disabled?: boolean
}

export default function PurchaseAddons({ price, value, onChange, disabled }: Props) {
  const [config, setConfig] = useState<PurchaseAddonsConfig | null>(cachedConfig)

  useEffect(() => {
    if (config) return
    let cancelled = false
    loadConfig().then((cfg) => { if (!cancelled) setConfig(cfg) })
    return () => { cancelled = true }
  }, [config])

  const plateCfg = config?.customPlate
  if (disabled || !plateCfg || !plateCfg.enabled) return null

  const enabled = value.customPlate !== undefined
  const cost = Math.floor((price || 0) * plateCfg.costPercent)

  const sanitize = (raw: string) => {
    const cleaned = raw.toUpperCase().replace(/[^A-Z0-9-]/g, '')
    return cleaned.slice(0, plateCfg.maxLength)
  }

  return (
    <div className="rounded-md border border-border bg-muted/30 p-2.5 space-y-2">
      <label className="flex items-center justify-between gap-2 cursor-pointer">
        <span className="flex items-center gap-2 text-sm">
          <Hash className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{t('addon_custom_plate') || 'Custom License Plate'}</span>
        </span>
        <span className="flex items-center gap-2">
          <span className={`text-xs ${enabled ? 'text-accent' : 'text-muted-foreground'}`}>+{formatCurrency(cost)}</span>
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-accent cursor-pointer"
            checked={enabled}
            onChange={(e) => onChange({ ...value, customPlate: e.target.checked ? '' : undefined })}
          />
        </span>
      </label>
      {enabled && (
        <div>
          <Input
            value={value.customPlate ?? ''}
            onChange={(e) => onChange({ ...value, customPlate: sanitize(e.target.value) })}
            placeholder={t('addon_plate_placeholder')}
            maxLength={plateCfg.maxLength}
            className="h-8 text-sm font-mono uppercase tracking-wider"
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            {t('addon_plate_hint', String(plateCfg.minLength), String(plateCfg.maxLength)) ||
              `${plateCfg.minLength}-${plateCfg.maxLength} chars · letters, numbers, dashes`}
          </p>
        </div>
      )}
    </div>
  )
}
