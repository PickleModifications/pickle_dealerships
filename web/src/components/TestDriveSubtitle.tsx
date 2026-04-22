import { useState } from 'react'
import { useNuiEvent } from '../hooks/useNuiEvent'

// Lightweight always-mounted overlay that listens for `testDriveSubtitle`
// NUI events. The Lua side fires `{ visible: true, text: '...' }` when the
// test drive starts and `{ visible: false }` when it ends. Rendered outside
// the main page stack so it sits on top of the world, not modal content.
export default function TestDriveSubtitle() {
  const [text, setText] = useState<string | null>(null)

  useNuiEvent('testDriveSubtitle', (payload: { visible?: boolean; text?: string }) => {
    if (payload?.visible && payload.text) setText(payload.text)
    else setText(null)
  })

  if (!text) return null

  return (
    <div
      className="fixed left-1/2 bottom-6 z-[60] -translate-x-1/2 pointer-events-none"
      style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}
    >
      <div className="px-4 py-2 rounded-md bg-black/55 backdrop-blur-sm border border-white/10">
        <p className="text-sm font-medium text-white whitespace-nowrap">{text}</p>
      </div>
    </div>
  )
}
