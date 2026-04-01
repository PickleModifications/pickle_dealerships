import { useState } from 'react'
import { useNuiEvent } from '../hooks/useNuiEvent'

export default function InteractText() {
  const [text, setText] = useState<string | null>(null)

  useNuiEvent<{ text: string | null }>('setInteractText', (data) => {
    setText(data.text || null)
  })

  if (!text) return null

  const lines = text.split('\n').filter(Boolean)

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] pointer-events-none">
      <div className="bg-black/80 border border-white/10 rounded-lg px-5 py-3 text-center">
        {lines.map((line, i) => {
          const match = line.match(/^\[(.+?)\]\s*-?\s*(.*)$/)
          return (
            <p key={i} className="text-sm text-white/90 whitespace-nowrap leading-relaxed">
              {match ? (
                <>
                  <kbd className="inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 mr-2 text-xs font-bold bg-white/15 border border-white/20 rounded text-white">
                    {match[1].trim()}
                  </kbd>
                  <span className="text-white/70">{match[2].trim()}</span>
                </>
              ) : (
                <span className="text-white/70">{line.trim()}</span>
              )}
            </p>
          )
        })}
      </div>
    </div>
  )
}
