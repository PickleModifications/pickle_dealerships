const cache = new Map<string, { data: unknown; timestamp: number }>()

export function getCached<T>(key: string): T | null {
  const entry = cache.get(key)
  if (!entry) return null
  return entry.data as T
}

export function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() })
}

export function clearCache(): void {
  cache.clear()
}

export function buildKey(dealershipId: number, tab: string): string {
  return `${dealershipId}:${tab}`
}
