export type GradeLetter = 'A' | 'B' | 'C' | 'D' | 'F'

export interface ConditionGrade {
  letter: GradeLetter
  color: string
  label: string
}

export function getConditionGrade(pct: number): ConditionGrade {
  const v = Math.max(0, Math.min(100, Number(pct) || 0))
  if (v >= 90) return { letter: 'A', color: 'text-emerald-600', label: 'Excellent' }
  if (v >= 75) return { letter: 'B', color: 'text-lime-600', label: 'Good' }
  if (v >= 60) return { letter: 'C', color: 'text-amber-600', label: 'Fair' }
  if (v >= 45) return { letter: 'D', color: 'text-orange-600', label: 'Poor' }
  return { letter: 'F', color: 'text-rose-600', label: 'Salvage' }
}

// GTA V vehicle paint index → RGB hex. Based on the stock paint palette (IDs 0–159).
const GTA_PAINT_COLORS: Record<number, string> = {
  0: '#0d1116', 1: '#1c1d21', 2: '#32383d', 3: '#454b4f', 4: '#999da0',
  5: '#c2c4c6', 6: '#979a97', 7: '#637380', 8: '#63625c', 9: '#3c3f47',
  10: '#444e54', 11: '#1d2129', 12: '#13151a', 13: '#9ea1a7', 14: '#bbbfc2',
  15: '#2a2d33', 16: '#0a0c0d', 17: '#4a545a', 18: '#abb0b2', 19: '#262930',
  20: '#696d73', 21: '#18191d', 22: '#2e3338', 23: '#8b8f92', 24: '#979a9c',
  25: '#bec1c3', 26: '#5a6061', 27: '#c00e1a', 28: '#da1918', 29: '#b6111b',
  30: '#a51e23', 31: '#7b1a22', 32: '#8e1b1f', 33: '#6f1818', 34: '#731d1f',
  35: '#ba0e26', 36: '#d44a17', 37: '#803013', 38: '#b25f03', 39: '#d1752c',
  40: '#fb9d03', 41: '#832a02', 42: '#aea04b', 43: '#fcf9f1', 44: '#fffff6',
  45: '#b0ab94', 46: '#0e316d', 47: '#132297', 48: '#122e7b', 49: '#1c2c55',
  50: '#1f2852', 51: '#1b203d', 52: '#395aa6', 53: '#73b9e5', 54: '#80b2d8',
  55: '#2f4894', 56: '#476bae', 57: '#3d5a74', 58: '#0c316e', 59: '#1d5a7c',
  60: '#63a0b3', 61: '#10143a', 62: '#5c7a91', 63: '#708291', 64: '#334154',
  65: '#322938', 66: '#475266', 67: '#36434d', 68: '#082d53', 69: '#153b5f',
  70: '#193247', 71: '#132e4e', 72: '#28516c', 73: '#375782', 74: '#25313d',
  75: '#152a38', 76: '#153a5a', 77: '#1a335f', 78: '#001c2e', 79: '#052460',
  80: '#112243', 81: '#2a4b72', 82: '#040810', 83: '#0a1221', 84: '#2b3c44',
  85: '#002e47', 86: '#000716', 87: '#052e61', 88: '#f7ca0a', 89: '#d19b0f',
  90: '#f99b1d', 91: '#f2b414', 92: '#155502', 93: '#1c8a1e', 94: '#20461a',
  95: '#43523b', 96: '#5a6129', 97: '#364813', 98: '#65867f', 99: '#222e46',
  100: '#253c2b', 101: '#313822', 102: '#37573b', 103: '#2b3d22', 104: '#818f3e',
  105: '#45685b', 106: '#2f5038', 107: '#95a39a', 108: '#455f52', 109: '#223027',
  110: '#3d4f3c', 111: '#74a32b', 112: '#85c42a', 113: '#4c3d1b', 114: '#402a13',
  115: '#57371c', 116: '#6f3b11', 117: '#372116', 118: '#402b1f', 119: '#703a24',
  120: '#7d4b25', 121: '#ad7441', 122: '#6b3a1e', 123: '#513328', 124: '#7a5a32',
  125: '#9d8759', 126: '#644b39', 127: '#84735f', 128: '#46281f', 129: '#4e2a16',
  130: '#6a391c', 131: '#c9a977', 132: '#b58e53', 133: '#a07c58', 134: '#916832',
  135: '#b9336c', 136: '#ee1e84', 137: '#f165a0', 138: '#b73070', 139: '#7a3e61',
  140: '#d9d3c8', 141: '#0b0b0e', 142: '#26292a', 143: '#b5aa8b', 144: '#a6a28e',
  145: '#463e28', 146: '#02050b', 147: '#05080f', 148: '#0c1013', 149: '#2c3438',
  150: '#ddda14', 151: '#0f3d0d', 152: '#00102f', 153: '#b0a47b', 154: '#4b5257',
  155: '#1a1716', 156: '#c6c3b0', 157: '#a89b77', 158: '#9a8c73', 159: '#c7beb1',
}

export function getPaintHex(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'number' && Number.isFinite(value)) {
    return GTA_PAINT_COLORS[Math.round(value)] ?? null
  }
  if (typeof value === 'string') {
    const n = parseInt(value, 10)
    if (!Number.isNaN(n)) return GTA_PAINT_COLORS[n] ?? null
    return value.startsWith('#') ? value : null
  }
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>
    const r = Number(v.r), g = Number(v.g), b = Number(v.b)
    if ([r, g, b].every((n) => !Number.isNaN(n))) {
      return `#${[r, g, b].map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')).join('')}`
    }
  }
  return null
}

export function parseProperties(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) } catch { return null }
  }
  if (typeof raw === 'object') return raw as Record<string, unknown>
  return null
}

const MOD_LABELS: Record<string, string> = {
  modEngine: 'Engine',
  modBrakes: 'Brakes',
  modTransmission: 'Transmission',
  modSuspension: 'Suspension',
  modArmor: 'Armor',
  modTurbo: 'Turbo',
}

export interface PerformanceMod {
  key: string
  label: string
  value: string
}

export function extractPerformanceMods(props: Record<string, unknown> | null): PerformanceMod[] {
  if (!props) return []
  const out: PerformanceMod[] = []
  for (const [key, label] of Object.entries(MOD_LABELS)) {
    const v = props[key]
    if (v === undefined || v === null) continue
    if (key === 'modTurbo') {
      out.push({ key, label, value: v ? 'Installed' : 'Stock' })
      continue
    }
    const tier = Number(v)
    if (Number.isNaN(tier) || tier < 0) continue
    out.push({ key, label, value: tier === -1 ? 'Stock' : `Tier ${tier + 1}` })
  }
  return out
}

const EXTRA_LABELS: Record<string, string> = {
  xenon: 'Xenon Headlights',
  smokeEnabled: 'Tire Smoke',
  neonEnabled: 'Neon',
}

export function extractCosmetics(props: Record<string, unknown> | null) {
  if (!props) return { wheels: null, extras: [] as string[], colorPrimary: null, colorSecondary: null, plateIndex: null }
  const extras: string[] = []
  for (const [key, label] of Object.entries(EXTRA_LABELS)) {
    if (props[key]) extras.push(label)
  }
  const extrasField = props.extras
  if (extrasField && typeof extrasField === 'object') {
    for (const [idx, on] of Object.entries(extrasField)) {
      if (on) extras.push(`Extra ${idx}`)
    }
  }
  const wheels = props.modFrontWheels !== undefined && Number(props.modFrontWheels) >= 0
    ? `Custom Wheels (#${props.modFrontWheels}${props.wheels !== undefined ? `, type ${props.wheels}` : ''})`
    : 'Stock Wheels'
  return {
    wheels,
    extras,
    colorPrimary: props.color1 ?? null,
    colorSecondary: props.color2 ?? null,
    plateIndex: (props.plateIndex as number | undefined) ?? null,
  }
}

export function formatPct(v: unknown, scale: 1 | 10 = 1): string {
  const n = Number(v)
  if (Number.isNaN(n)) return '—'
  const pct = scale === 10 ? n / 10 : n
  return `${Math.round(Math.max(0, Math.min(100, pct)))}%`
}

export function maskIdentifier(id: string | null | undefined): string {
  if (!id) return 'Unknown'
  const parts = id.split(':')
  const tail = parts[parts.length - 1] || id
  if (tail.length <= 4) return `***${tail}`
  return `***${tail.slice(-4)}`
}
