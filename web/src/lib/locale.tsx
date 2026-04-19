import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

type TranslationMap = Record<string, string>

let translations: TranslationMap = {}
let loaded = false
const listeners: Array<() => void> = []

function notifyListeners() {
  for (const fn of listeners) fn()
}

/**
 * Fetch locale strings from the Lua Language table via NUI callback.
 * Called once on app boot; the result is cached in memory.
 */
export async function loadLocale(): Promise<void> {
  if (loaded) return
  try {
    const resp = await fetch('https://pickle_dealerships/getLocale', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    const data = await resp.json()
    if (data && typeof data === 'object') {
      translations = data as TranslationMap
      loaded = true
      notifyListeners()
    }
  } catch {
    // Dev/browser environment — no NUI available. Keys render as-is.
  }
}

/**
 * Translate a key with optional format args: t('sale_price', '$500') → "Price: $500"
 * Uses %s placeholder substitution matching the Lua _L() pattern.
 */
export function t(key: string, ...args: (string | number)[]): string {
  let str = translations[key]
  if (!str) return key // fallback: show the key itself
  for (const arg of args) {
    str = str.replace(/%[sd]/, String(arg))
  }
  str = str.replace(/%%/g, '%')
  return str
}

const LocaleContext = createContext({ t })

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [, setReady] = useState(false)

  useEffect(() => {
    const onReady = () => setReady(true)
    listeners.push(onReady)
    loadLocale()
    return () => {
      const idx = listeners.indexOf(onReady)
      if (idx >= 0) listeners.splice(idx, 1)
    }
  }, [])

  return <LocaleContext.Provider value={{ t }}>{children}</LocaleContext.Provider>
}

export function useLocale() {
  return useContext(LocaleContext)
}
