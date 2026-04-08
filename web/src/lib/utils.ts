import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function fetchNui<T = unknown>(eventName: string, data?: Record<string, unknown>): Promise<T> {
  return fetch(`https://pickle_dealerships/${eventName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data ?? {}),
  }).then((resp) => resp.json())
}

export function closeNui() {
  fetchNui('close')
}

/**
 * Returns the vehicle image URL: DB image if available, otherwise falls back to local vehicle_images folder.
 */
export function getVehicleImage(dbImage: string | null | undefined, model: string): string | null {
  if (dbImage) return dbImage
  if (model) return `nui://pickle_dealerships/vehicle_images/${model.toLowerCase()}.webp`
  return null
}

export function hexToHSL(hex: string): { h: number; s: number; l: number } {
  hex = hex.replace('#', '')
  if (hex.length === 8) hex = hex.substring(2) // strip alpha prefix (AARRGGBB → RRGGBB)
  const r = parseInt(hex.substring(0, 2), 16) / 255
  const g = parseInt(hex.substring(2, 4), 16) / 255
  const b = parseInt(hex.substring(4, 6), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6
        break
      case g:
        h = ((b - r) / d + 2) / 6
        break
      case b:
        h = ((r - g) / d + 4) / 6
        break
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  }
}
