import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

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
  }).then(resp => resp.json())
}

export function isEnvBrowser(): boolean {
  return !(window as unknown as Record<string, unknown>).invokeNative
}
