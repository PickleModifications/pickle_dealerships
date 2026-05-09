import { Palette } from 'lucide-react'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { useState } from 'react'
import { t } from '../lib/locale'
import type { VehicleColor } from '../types'

// Same set ShowroomPage offers customers — kept in sync so a vehicle the owner
// sets via StockPage looks identical to one a customer would have configured.
export const PRESET_COLORS: { label: string; r: number; g: number; b: number }[] = [
  { label: 'Midnight Black', r: 10, g: 10, b: 10 },
  { label: 'Arctic White', r: 252, g: 252, b: 252 },
  { label: 'Racing Red', r: 192, g: 14, b: 26 },
  { label: 'Electric Blue', r: 30, g: 80, b: 190 },
  { label: 'Forest Green', r: 20, g: 100, b: 36 },
  { label: 'Sunset Orange', r: 230, g: 100, b: 20 },
  { label: 'Royal Purple', r: 80, g: 20, b: 140 },
  { label: 'Silver Metallic', r: 180, g: 185, b: 190 },
  { label: 'Gold', r: 200, g: 170, b: 50 },
  { label: 'Matte Gray', r: 100, g: 100, b: 100 },
  { label: 'Navy Blue', r: 15, g: 25, b: 80 },
  { label: 'Wine Red', r: 100, g: 10, b: 20 },
]

function eqColor(a: VehicleColor | null, r: number, g: number, b: number) {
  return !!a && a.r === r && a.g === g && a.b === b
}

export function ColorSwatchGrid({ value, onChange }: {
  value: VehicleColor | null
  onChange: (c: VehicleColor) => void
}) {
  return (
    <div className="grid grid-cols-6 gap-1.5">
      {PRESET_COLORS.map((c) => {
        const active = eqColor(value, c.r, c.g, c.b)
        return (
          <button
            key={c.label}
            type="button"
            title={c.label}
            onClick={() => onChange({ r: c.r, g: c.g, b: c.b, type: 'rgb' })}
            className="p-0.5 flex items-center justify-center"
          >
            <div
              className={
                'w-7 h-7 rounded-full border-2 transition-all hover:scale-110 ' +
                (active ? 'border-accent scale-110' : 'border-border hover:border-foreground/40')
              }
              style={{ backgroundColor: `rgb(${c.r}, ${c.g}, ${c.b})` }}
            />
          </button>
        )
      })}
    </div>
  )
}

/**
 * Modal color picker — primary + secondary swatches with a save button.
 * Used by StockPage to recolor a stock row whose vehicle is already on a
 * display spot. Calls `onSave` with the chosen colors when confirmed.
 */
export function ColorPickerDialog(props: {
  open: boolean
  initialPrimary?: VehicleColor | null
  initialSecondary?: VehicleColor | null
  title?: string
  onClose: () => void
  onSave: (primary: VehicleColor, secondary: VehicleColor) => void
  saving?: boolean
}) {
  const { open, initialPrimary, initialSecondary, title, onClose, onSave, saving } = props
  const [primary, setPrimary] = useState<VehicleColor | null>(initialPrimary ?? null)
  const [secondary, setSecondary] = useState<VehicleColor | null>(initialSecondary ?? null)

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent onClose={onClose}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="h-4 w-4" /> {title ?? t('recolor_title')}
          </DialogTitle>
          <DialogDescription>{t('recolor_desc')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <div className="text-xs text-muted-foreground mb-1.5">{t('label_primary_color')}</div>
            <ColorSwatchGrid value={primary} onChange={setPrimary} />
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1.5">{t('label_secondary_color')}</div>
            <ColorSwatchGrid value={secondary} onChange={setSecondary} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>{t('btn_cancel')}</Button>
            <Button
              disabled={!primary || saving}
              onClick={() => primary && onSave(primary, secondary ?? primary)}
            >
              {saving ? t('saving') : t('btn_save')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
