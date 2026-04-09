import { useState, useEffect, useCallback } from 'react'
import { Button } from '../components/ui/button'
import { fetchNui } from '../lib/utils'
import { X, UserX, Car } from 'lucide-react'
import type { NPCProfile } from '../types'

interface Props {
  profile: NPCProfile | null
  greeting: string
  onClose: () => void
}

export default function NegotiationPage({ profile, greeting, onClose }: Props) {
  const [subtitle, setSubtitle] = useState(greeting || '')
  const [subtitleFade, setSubtitleFade] = useState(true)
  const [transitioning, setTransitioning] = useState(false)

  useEffect(() => {
    setSubtitleFade(false)
    const t = setTimeout(() => setSubtitleFade(true), 50)
    return () => clearTimeout(t)
  }, [subtitle])

  const handlePresent = useCallback(() => {
    if (transitioning) return
    setTransitioning(true)
    fetchNui('npcStartShowroom', {}).catch(() => setTransitioning(false))
  }, [transitioning])

  const handleDismiss = useCallback(() => {
    fetchNui('dismissNPC', {})
    onClose()
  }, [onClose])

  if (!profile) return null

  return (
    <div className="fixed inset-0 pointer-events-none flex flex-col">
      {/* Top right dismiss */}
      <div className="flex justify-end p-6 pointer-events-auto">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 bg-black/40 hover:bg-black/60 text-white/70 hover:text-white rounded-full"
          onClick={handleDismiss}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1" />

      {/* Bottom — subtitle + actions */}
      <div className="pointer-events-auto">
        {/* Subtitle */}
        <div className="flex justify-center mb-4 px-8">
          <div className={`max-w-2xl transition-opacity duration-300 ${subtitleFade ? 'opacity-100' : 'opacity-0'}`}>
            <p className="text-white text-center text-lg font-medium drop-shadow-lg leading-relaxed px-6 py-3 bg-black/50 rounded-lg">
              {subtitle}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="bg-black/70 border-t border-white/10 px-8 py-4 flex items-center justify-center gap-3">
          <Button
            className="gap-2"
            onClick={handlePresent}
            disabled={transitioning}
          >
            <Car className="h-4 w-4" /> {transitioning ? 'Loading...' : 'Present Vehicle'}
          </Button>
          <Button
            variant="ghost"
            className="gap-2 text-white/50 hover:text-white"
            onClick={handleDismiss}
          >
            <UserX className="h-4 w-4" /> Dismiss
          </Button>
        </div>
      </div>
    </div>
  )
}
