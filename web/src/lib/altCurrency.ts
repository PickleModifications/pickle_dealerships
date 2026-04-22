// Shared helpers for rendering alt-currency amounts in the NUI.

export interface AltCurrencyDef {
  key: string
  label: string
  type: string
  valuePerUnit: number
  iconUrl?: string
  singular?: string
  plural?: string
}

// Convert a dollar price to the native unit count, rounded up so the customer
// never underpays on a fractional conversion.
export function altNativeAmount(def: AltCurrencyDef, dollars: number): number {
  const per = def.valuePerUnit || 1
  return Math.ceil((dollars || 0) / per)
}

// Format just the "X coins" text (no icon). Falls back to the currency label
// if singular/plural templates aren't configured.
export function formatAltText(def: AltCurrencyDef, dollars: number): string {
  const n = altNativeAmount(def, dollars)
  const tmpl = n === 1 ? def.singular : (def.plural || def.singular)
  if (tmpl && tmpl.includes('%s')) return tmpl.replace('%s', n.toLocaleString())
  return `${n.toLocaleString()} ${def.label}`
}

// Resolve the active alt currency from a paymentMethod string like "alt:pickle_store".
export function resolveAltCurrency(
  paymentMethod: string,
  altCurrencies: AltCurrencyDef[],
): AltCurrencyDef | null {
  if (!paymentMethod || !paymentMethod.startsWith('alt:')) return null
  const key = paymentMethod.slice(4)
  return altCurrencies.find((c) => c.key === key) ?? null
}
