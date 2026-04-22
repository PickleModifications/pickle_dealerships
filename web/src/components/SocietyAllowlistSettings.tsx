import { useEffect, useState } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { fetchNui } from '../lib/utils'
import { t } from '../lib/locale'
import { Plus, Trash2 } from 'lucide-react'
import type { SocietyAllowlistEntry } from '../types'

interface Props {
  dealershipId: number
  dealershipName?: string
}

export default function SocietyAllowlistSettings({ dealershipId, dealershipName }: Props) {
  const [entries, setEntries] = useState<SocietyAllowlistEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchNui<{ success: boolean; allowlist: SocietyAllowlistEntry[] }>('getSocietyAllowlist', {
      dealershipId,
    }).then((res) => {
      if (res.success) setEntries(res.allowlist || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [dealershipId])

  const updateEntry = (idx: number, patch: Partial<SocietyAllowlistEntry>) => {
    setEntries((prev) => prev.map((e, i) => i === idx ? { ...e, ...patch } : e))
  }

  const addEntry = () => {
    setEntries((prev) => [...prev, { type: 'job', name: '', minGrade: 0 }])
  }

  const removeEntry = (idx: number) => {
    setEntries((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleSave = () => {
    setSaving(true)
    const cleaned = entries
      .filter((e) => e.name.trim() !== '')
      .map((e) => ({ type: e.type, name: e.name.trim(), minGrade: Math.max(0, Math.floor(Number(e.minGrade) || 0)) }))
    fetchNui('setSocietyAllowlist', {
      dealershipId,
      allowlist: cleaned,
    }).then(() => {
      setEntries(cleaned)
      setSaving(false)
    }).catch(() => setSaving(false))
  }

  if (loading) {
    return <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">{t('loading')}</div>
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm text-muted-foreground">
          {dealershipName ? `${dealershipName} — ` : ''}{t('society_payments_desc')}
        </p>
      </div>

      <div className="space-y-2 max-h-[50vh] overflow-y-auto">
        {entries.length === 0 && (
          <p className="text-xs text-muted-foreground">{t('society_allowlist_empty')}</p>
        )}
        {entries.map((entry, idx) => (
          <div key={idx} className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2">
            <select
              value={entry.type}
              onChange={(e) => updateEntry(idx, { type: e.target.value as 'job' | 'gang' })}
              className="h-8 rounded-md border border-border bg-background px-2 text-sm"
            >
              <option value="job">{t('label_job')}</option>
              <option value="gang">{t('label_gang')}</option>
            </select>
            <Input
              value={entry.name}
              onChange={(e) => updateEntry(idx, { name: e.target.value })}
              placeholder={t('label_faction_name')}
              className="h-8 flex-1"
            />
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground">{t('label_min_grade_short')}</span>
              <Input
                type="number"
                min="0"
                value={String(entry.minGrade)}
                onChange={(e) => updateEntry(idx, { minGrade: parseInt(e.target.value) || 0 })}
                className="h-8 w-16"
              />
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeEntry(idx)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Button variant="outline" onClick={addEntry} className="gap-1">
          <Plus className="h-4 w-4" /> {t('btn_add_allowlist_entry')}
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? t('saving') : t('btn_save')}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">{t('society_payments_help')}</p>
    </div>
  )
}
