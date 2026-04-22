import { useEffect, useState } from 'react'
import { Car } from 'lucide-react'
import { fetchNui, getVehicleImage } from '../lib/utils'

interface Props {
  image?: string | null
  model: string
  alt?: string
  className?: string
  fallbackClassName?: string
  iconClassName?: string
}

// Module-level caches so a catalog grid with dozens of <VehicleImg> mounts
// only hits the Lua bridge once per model:
//   `resolved` — final URL (or null if the active provider doesn't have one)
//   `inflight` — promise dedup so concurrent mounts share a single fetch
const resolved = new Map<string, string | null>()
const inflight = new Map<string, Promise<string | null>>()

function resolveModelURL(model: string): Promise<string | null> {
  const key = model.toLowerCase()
  if (resolved.has(key)) return Promise.resolve(resolved.get(key) ?? null)
  const existing = inflight.get(key)
  if (existing) return existing
  const p = fetchNui<{ url?: string | null }>('getVehicleImageUrl', { model: key })
    .then((res) => {
      const url = res?.url ?? null
      resolved.set(key, url)
      inflight.delete(key)
      return url
    })
    .catch(() => {
      resolved.set(key, null)
      inflight.delete(key)
      return null
    })
  inflight.set(key, p)
  return p
}

export default function VehicleImg({ image, model, alt, className, fallbackClassName, iconClassName }: Props) {
  // Admin-uploaded image on the catalog row wins over anything the bridge
  // might return — if an admin explicitly set a URL they almost certainly
  // want that one, not an auto-shot.
  const adminURL = image ?? null
  // Seed from the synchronous default so the first paint isn't empty. If
  // the bridge returns a URL we swap to it once the NUI callback resolves.
  const [src, setSrc] = useState<string | null>(() => adminURL || getVehicleImage(null, model))
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
    if (adminURL) {
      setSrc(adminURL)
      return
    }
    // Start with the local default — provider bridges may return nil, in
    // which case this stays as the rendered src.
    setSrc(getVehicleImage(null, model))
    let cancelled = false
    resolveModelURL(model).then((url) => {
      if (cancelled || !url) return
      setSrc(url)
    })
    return () => { cancelled = true }
  }, [adminURL, model])

  if (!src || failed) {
    return (
      <div className={fallbackClassName || className}>
        <Car className={iconClassName || 'h-5 w-5 text-muted-foreground/30'} />
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={alt || model}
      loading="lazy"
      className={className}
      onError={() => setFailed(true)}
    />
  )
}
