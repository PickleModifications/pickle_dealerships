import { useState, useCallback } from 'react'
import { Button } from '../components/ui/button'
import { fetchNui } from '../lib/utils'
import { useNuiEvent } from '../hooks/useNuiEvent'
import { Camera, RotateCcw, RotateCw, ZoomIn, ZoomOut, ChevronUp, ChevronDown, X, Save, RefreshCw } from 'lucide-react'
import type { DealershipData } from '../types'

interface Props {
  data: DealershipData
  onClose: () => void
}

export default function PhotoBoothPage({ data }: Props) {
  const [mode, setMode] = useState<'camera' | 'preview'>('camera')
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useNuiEvent('photoBoothCaptured', (payload: { imageData: string }) => {
    setCapturedImage(payload.imageData)
    setMode('preview')
  })

  const handleRotate = useCallback((delta: number) => {
    fetchNui('photoBoothRotate', { deltaAngle: delta })
  }, [])

  const handleZoom = useCallback((delta: number) => {
    fetchNui('photoBoothRotate', { deltaZoom: delta })
  }, [])

  const handleHeight = useCallback((delta: number) => {
    fetchNui('photoBoothRotate', { deltaHeight: delta })
  }, [])

  const handleCapture = useCallback(() => {
    fetchNui('photoBoothCapture', {})
  }, [])

  const handleRetake = useCallback(() => {
    setCapturedImage(null)
    setMode('camera')
  }, [])

  const handleSave = useCallback(() => {
    if (!capturedImage || saving) return
    setSaving(true)
    fetchNui('photoBoothSave', { imageData: capturedImage })
  }, [capturedImage, saving])

  const handleCancel = useCallback(() => {
    fetchNui('photoBoothCancel', {})
  }, [])

  if (mode === 'preview' && capturedImage) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-black/80">
        <div className="mb-4">
          <p className="text-white text-lg font-semibold text-center">{data.label || data.model}</p>
          <p className="text-white/60 text-sm text-center">Preview</p>
        </div>

        <div className="relative max-w-[70vw] max-h-[60vh] rounded-lg overflow-hidden border border-white/20">
          <img src={capturedImage} alt="Vehicle preview" className="max-w-full max-h-[60vh] object-contain" />
        </div>

        <div className="flex gap-3 mt-6">
          <Button
            variant="outline"
            className="gap-2 bg-zinc-900 border-zinc-700 text-white hover:bg-zinc-800"
            onClick={handleRetake}
            disabled={saving}
          >
            <RefreshCw className="h-4 w-4" /> Retake
          </Button>
          <Button
            className="gap-2"
            onClick={handleSave}
            disabled={saving}
          >
            <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save Photo'}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 flex flex-col pointer-events-none">
      {/* Top bar */}
      <div className="flex justify-center pt-6 pointer-events-none">
        <div className="bg-zinc-900/90 border border-zinc-700 rounded-lg px-4 py-2 text-center">
          <p className="text-white text-sm font-semibold">{data.label || data.model}</p>
          <p className="text-white/50 text-xs font-mono">{data.model}</p>
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom toolbar */}
      <div className="flex justify-center pb-8 pointer-events-auto">
        <div className="bg-zinc-900/90 border border-zinc-700 rounded-xl px-3 py-2 flex items-center gap-2">
          {/* Rotation */}
          <Button variant="ghost" size="icon" className="h-9 w-9 text-white hover:bg-zinc-800" onClick={() => handleRotate(-15)} title="Rotate Left">
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9 text-white hover:bg-zinc-800" onClick={() => handleRotate(15)} title="Rotate Right">
            <RotateCw className="h-4 w-4" />
          </Button>

          <div className="w-px h-6 bg-zinc-700" />

          {/* Height */}
          <Button variant="ghost" size="icon" className="h-9 w-9 text-white hover:bg-zinc-800" onClick={() => handleHeight(0.5)} title="Camera Up">
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9 text-white hover:bg-zinc-800" onClick={() => handleHeight(-0.5)} title="Camera Down">
            <ChevronDown className="h-4 w-4" />
          </Button>

          <div className="w-px h-6 bg-zinc-700" />

          {/* Zoom */}
          <Button variant="ghost" size="icon" className="h-9 w-9 text-white hover:bg-zinc-800" onClick={() => handleZoom(-1)} title="Zoom In">
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9 text-white hover:bg-zinc-800" onClick={() => handleZoom(1)} title="Zoom Out">
            <ZoomOut className="h-4 w-4" />
          </Button>

          <div className="w-px h-6 bg-zinc-700" />

          {/* Capture */}
          <Button className="h-9 gap-2 px-4" onClick={handleCapture}>
            <Camera className="h-4 w-4" /> Capture
          </Button>

          {/* Cancel */}
          <Button variant="ghost" size="icon" className="h-9 w-9 text-zinc-400 hover:bg-zinc-800 hover:text-white" onClick={handleCancel} title="Cancel">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
