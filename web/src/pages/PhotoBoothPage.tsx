import { useState, useCallback, useEffect, useRef } from 'react'
import { Button } from '../components/ui/button'
import { fetchNui } from '../lib/utils'
import { useNuiEvent } from '../hooks/useNuiEvent'
import { t } from '../lib/locale'
import { Camera, X, Save, RefreshCw } from 'lucide-react'
import type { DealershipData } from '../types'

interface Props {
  data: DealershipData
  onClose: () => void
}

// Crop area: 50% of viewport, 16:9 aspect ratio, centered
function getCropRect() {
  const vw = window.innerWidth
  const vh = window.innerHeight
  let cropW = vw * 0.5
  let cropH = cropW * (9 / 16)
  // If too tall, fit by height instead
  if (cropH > vh * 0.5) {
    cropH = vh * 0.5
    cropW = cropH * (16 / 9)
  }
  return {
    x: (vw - cropW) / 2,
    y: (vh - cropH) / 2,
    w: cropW,
    h: cropH,
  }
}

async function cropImage(base64: string, crop: { x: number; y: number; w: number; h: number }): Promise<Blob> {
  const img = new Image()
  img.src = base64
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = reject
  })

  // Map crop rect from viewport coords to image coords
  const scaleX = img.width / window.innerWidth
  const scaleY = img.height / window.innerHeight
  const sx = Math.round(crop.x * scaleX)
  const sy = Math.round(crop.y * scaleY)
  const sw = Math.round(crop.w * scaleX)
  const sh = Math.round(crop.h * scaleY)

  const canvas = document.createElement('canvas')
  canvas.width = sw
  canvas.height = sh
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Failed to create blob'))
    }, 'image/png')
  })
}

type UploadResult =
  | { ok: true, url: string }
  | { ok: false, reason: 'http', status: number, body: string }
  | { ok: false, reason: 'no_url_in_response', body: string }
  | { ok: false, reason: 'network', message: string }

async function uploadImage(blob: Blob, config: NonNullable<DealershipData['uploadConfig']>): Promise<UploadResult> {
  const formData = new FormData()
  formData.append(config.field, blob, 'photo.png')

  let res: Response
  try {
    res = await fetch(config.url, {
      method: 'POST',
      headers: config.headers || {},
      body: formData,
    })
  } catch (e) {
    return { ok: false, reason: 'network', message: (e as Error)?.message || 'fetch threw' }
  }

  // Always grab the body once so we can include it in the diagnostic
  // regardless of which branch fails.
  const body = await res.text().catch(() => '')
  if (!res.ok) {
    return { ok: false, reason: 'http', status: res.status, body }
  }

  let json: any = null
  try { json = JSON.parse(body) } catch { /* fall through */ }
  const key = config.returnPathKey || 'url'
  const url = json && typeof json[key] === 'string' ? json[key] : null
  if (!url) {
    return { ok: false, reason: 'no_url_in_response', body }
  }
  return { ok: true, url }
}

export default function PhotoBoothPage({ data }: Props) {
  const [mode, setMode] = useState<'camera' | 'processing' | 'preview'>('camera')
  const [croppedUrl, setCroppedUrl] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const cropRef = useRef(getCropRect())
  const draggingRef = useRef(false)
  const lastMouseRef = useRef<{ x: number; y: number } | null>(null)

  // Recalculate crop on resize
  useEffect(() => {
    const onResize = () => { cropRef.current = getCropRect() }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Bubble an error back to the player as a game notification so they
  // actually know the capture failed instead of just snapping back to the
  // camera with no feedback. Kept tiny — message text is computed inline.
  const reportError = (reason: 'screenshot' | 'upload' | 'crop' | 'no_upload_config') => {
    const message = (() => {
      switch (reason) {
        case 'no_upload_config': return t('admin_upload_not_configured')
        case 'upload':           return t('admin_image_failed')
        case 'crop':             return t('admin_image_failed')
        default:                 return t('admin_capture_failed')
      }
    })()
    fetchNui('photoBoothError', { message, reason }).catch(() => {})
  }

  useNuiEvent('photoBoothCaptured', async (payload: { imageData: string, error?: boolean }) => {
    if (payload.error) {
      // Lua side already showed the screenshot-resource notification.
      setMode('camera')
      return
    }
    if (!payload.imageData) {
      reportError('screenshot')
      setMode('camera')
      return
    }
    if (!data.uploadConfig) {
      reportError('no_upload_config')
      setMode('camera')
      return
    }

    setMode('processing')

    try {
      const crop = cropRef.current
      const blob = await cropImage(payload.imageData, crop)
      const result = await uploadImage(blob, data.uploadConfig)

      if (result.ok) {
        setCroppedUrl(result.url)
        setMode('preview')
      } else {
        // Build a concise diagnostic so the player isn't left guessing.
        // The full body lands in the F8 console for deeper debugging.
        // eslint-disable-next-line no-console
        console.error('[pickle_dealerships] photo upload failed:', result)
        let detail = ''
        if (result.reason === 'http') {
          detail = `HTTP ${result.status}`
          if (result.status === 401 || result.status === 403) {
            detail += ' — check your image-host token in config_sv.lua'
          }
        } else if (result.reason === 'no_url_in_response') {
          detail = `upload returned no '${data.uploadConfig.returnPathKey || 'url'}' field`
        } else if (result.reason === 'network') {
          detail = 'network error — endpoint unreachable'
        }
        fetchNui('photoBoothError', {
          message: detail ? `${t('admin_image_failed')} (${detail})` : t('admin_image_failed'),
          reason: 'upload',
          detail,
        }).catch(() => {})
        setMode('camera')
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[pickle_dealerships] photo crop threw:', e)
      reportError('crop')
      setMode('camera')
    }
  })

  // Mouse drag to orbit, Shift+drag to pan, scroll to zoom
  useEffect(() => {
    if (mode !== 'camera') return

    const shiftRef = { current: false }

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      draggingRef.current = true
      lastMouseRef.current = { x: e.clientX, y: e.clientY }
      shiftRef.current = e.shiftKey
      fetchNui('photoBoothInput', { dragging: true, panning: e.shiftKey })
    }

    const handleMouseUp = () => {
      draggingRef.current = false
      lastMouseRef.current = null
      shiftRef.current = false
      fetchNui('photoBoothInput', { dragging: false, panning: false })
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current || !lastMouseRef.current) return
      const dx = e.clientX - lastMouseRef.current.x
      const dy = e.clientY - lastMouseRef.current.y
      lastMouseRef.current = { x: e.clientX, y: e.clientY }
      // Update panning if Shift was toggled mid-drag
      if (e.shiftKey !== shiftRef.current) {
        shiftRef.current = e.shiftKey
        fetchNui('photoBoothInput', { panning: e.shiftKey })
      }
      if (dx === 0 && dy === 0) return
      fetchNui('photoBoothInput', { lookX: dx, lookY: dy })
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift' && draggingRef.current && !shiftRef.current) {
        shiftRef.current = true
        fetchNui('photoBoothInput', { panning: true })
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift' && shiftRef.current) {
        shiftRef.current = false
        fetchNui('photoBoothInput', { panning: false })
      }
    }

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const zoom = e.deltaY > 0 ? -1 : 1
      fetchNui('photoBoothInput', { zoom })
    }

    const handleContextMenu = (e: MouseEvent) => e.preventDefault()

    window.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('wheel', handleWheel, { passive: false })
    window.addEventListener('contextmenu', handleContextMenu)
    return () => {
      window.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('wheel', handleWheel)
      window.removeEventListener('contextmenu', handleContextMenu)
      if (draggingRef.current) {
        draggingRef.current = false
        lastMouseRef.current = null
        fetchNui('photoBoothInput', { dragging: false, panning: false })
      }
    }
  }, [mode])


  const handleCapture = useCallback(() => {
    fetchNui('photoBoothCapture', {})
  }, [])

  const handleRetake = useCallback(() => {
    setCroppedUrl(null)
    setMode('camera')
  }, [])

  const handleSave = useCallback(() => {
    if (!croppedUrl || saving) return
    setSaving(true)
    fetchNui('photoBoothSave', { imageData: croppedUrl })
  }, [croppedUrl, saving])

  const handleCancel = useCallback(() => {
    fetchNui('photoBoothCancel', {})
  }, [])

  if (mode === 'processing') {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black/80">
        <div className="text-center">
          <div className="h-8 w-8 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-3" />
          <p className="text-white/70 text-sm">{t('photo_processing')}</p>
        </div>
      </div>
    )
  }

  if (mode === 'preview' && croppedUrl) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-black/80">
        <div className="mb-4">
          <p className="text-white text-lg font-semibold text-center">{data.label || data.model}</p>
          <p className="text-white/60 text-sm text-center">{t('photo_preview')}</p>
        </div>

        <div className="relative max-w-[70vw] max-h-[60vh] rounded-lg overflow-hidden border border-white/20">
          <img src={croppedUrl} alt="Vehicle preview" className="max-w-full max-h-[60vh] object-contain" />
        </div>

        <div className="flex gap-3 mt-6">
          <Button
            variant="outline"
            className="gap-2 bg-zinc-900 border-zinc-700 text-white hover:bg-zinc-800"
            onClick={handleRetake}
            disabled={saving}
          >
            <RefreshCw className="h-4 w-4" /> {t('photo_retake')}
          </Button>
          <Button
            className="gap-2"
            onClick={handleSave}
            disabled={saving}
          >
            <Save className="h-4 w-4" /> {saving ? t('saving') : t('photo_save')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 pointer-events-none">
      <CropOverlay />

      {/* Mouse event surface */}
      <div className="fixed inset-0 pointer-events-auto cursor-default" style={{ zIndex: 4 }} />

      {/* Unified HUD bar — anchored below crop area */}
      <PhotoHud
        label={data.label || data.model}
        subtitle={data.vehicleClass}
        onCapture={handleCapture}
        onCancel={handleCancel}
      />
    </div>
  )
}

function CropOverlay() {
  const [rect, setRect] = useState(getCropRect)

  useEffect(() => {
    const onResize = () => setRect(getCropRect())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return (
    <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 5 }}>
      <div className="absolute left-0 right-0 top-0 bg-black/50" style={{ height: rect.y }} />
      <div className="absolute left-0 right-0 bottom-0 bg-black/50" style={{ height: rect.y }} />
      <div className="absolute left-0 bg-black/50" style={{ top: rect.y, width: rect.x, height: rect.h }} />
      <div className="absolute right-0 bg-black/50" style={{ top: rect.y, width: rect.x, height: rect.h }} />
      <div
        className="absolute border border-white/30"
        style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
      >
        <div className="absolute -top-px -left-px w-4 h-4 border-t-2 border-l-2 border-white/70" />
        <div className="absolute -top-px -right-px w-4 h-4 border-t-2 border-r-2 border-white/70" />
        <div className="absolute -bottom-px -left-px w-4 h-4 border-b-2 border-l-2 border-white/70" />
        <div className="absolute -bottom-px -right-px w-4 h-4 border-b-2 border-r-2 border-white/70" />
      </div>
    </div>
  )
}

function PhotoHud({ label, subtitle, onCapture, onCancel }: {
  label?: string
  subtitle?: string
  onCapture: () => void
  onCancel: () => void
}) {
  const [rect, setRect] = useState(getCropRect)

  useEffect(() => {
    const onResize = () => setRect(getCropRect())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return (
    <div
      className="fixed pointer-events-auto flex items-center h-8 gap-4"
      style={{
        left: rect.x,
        top: rect.y + rect.h + 12,
        width: rect.w,
        zIndex: 10,
      }}
    >
      {/* Vehicle name */}
      <div className="shrink-0 min-w-0 flex flex-col justify-center">
        <p className="text-white text-sm font-semibold truncate leading-none">{label}</p>
        {subtitle && <p className="text-white/40 text-[10px] capitalize leading-none mt-0.5">{subtitle}</p>}
      </div>

      {/* Controls — pushed to center via flex */}
      <div className="flex-1 flex items-center justify-center gap-4 text-xs uppercase tracking-wide text-white/50">
        <span className="flex items-center text-white/40">{t('photo_drag_to_orbit')}</span>
        <span className="flex items-center text-white/40">{t('photo_shift_drag_to_pan')}</span>
        <span className="flex items-center text-white/40">{t('photo_scroll_to_zoom')}</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        <Button className="h-8 gap-1.5 px-3 text-xs" onClick={onCapture}>
          <Camera className="h-3.5 w-3.5" /> {t('photo_capture')}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-zinc-500 hover:bg-zinc-800 hover:text-white"
          onClick={onCancel}
          title={t('btn_cancel')}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

