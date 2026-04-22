import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { ScrollArea } from '../components/ui/scroll-area'
import { Separator } from '../components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog'
import { SkeletonList } from '../components/ui/skeleton'
import { Download, AlertTriangle, CheckCircle2, Loader2, ChevronDown, ChevronRight } from 'lucide-react'
import { fetchNui } from '../lib/utils'
import { t } from '../lib/locale'

type EntityInfo = {
  key: string
  label: string
  available: boolean
  missingTables: string[]
}
type VersionInfo = { version: string; label: string; entities: EntityInfo[] }
type ResourceInfo = { resource: string; label: string; versions: VersionInfo[] }

type Row = { id: string | number; label: string; meta?: Record<string, unknown> }

type EntityResult = { inserted: number; skipped: number; notFound?: (string | number)[]; error?: string }
type RunResponse = {
  success: boolean
  message?: string
  elapsed?: number
  results?: Record<string, EntityResult>
}

type ConflictPolicy = 'skip' | 'overwrite' | 'duplicate'

interface ImportPageProps {
  onImported?: () => void
}

export default function ImportPage({ onImported }: ImportPageProps) {
  const [resources, setResources] = useState<ResourceInfo[] | null>(null)
  const [resource, setResource] = useState<string>('')
  const [version, setVersion] = useState<string>('')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [rowsByEntity, setRowsByEntity] = useState<Record<string, Row[] | 'loading' | 'error'>>({})
  const [selected, setSelected] = useState<Record<string, Set<string>>>({})
  const [policy, setPolicy] = useState<ConflictPolicy>('skip')
  const [namePrefix, setNamePrefix] = useState('')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<RunResponse | null>(null)

  useEffect(() => {
    fetchNui<ResourceInfo[]>('conversionListResources').then((list) => setResources(list || []))
  }, [])

  const selectedResource = resources?.find((r) => r.resource === resource)
  const selectedVersion = selectedResource?.versions.find((v) => v.version === version)

  // Default the dropdowns to the first registered resource/version for convenience.
  useEffect(() => {
    if (resources && resources.length > 0 && !resource) {
      setResource(resources[0].resource)
    }
  }, [resources, resource])
  useEffect(() => {
    if (selectedResource && !selectedResource.versions.find((v) => v.version === version)) {
      setVersion(selectedResource.versions[0]?.version ?? '')
    }
  }, [selectedResource, version])

  // Reset selection state when resource/version changes.
  useEffect(() => {
    setExpanded({})
    setRowsByEntity({})
    setSelected({})
    setResult(null)
  }, [resource, version])

  // Eagerly load rows for all available entities so "select all" is on by default
  // without requiring the user to expand each category first.
  useEffect(() => {
    if (!resource || !version || !selectedVersion) return
    for (const entity of selectedVersion.entities) {
      if (!entity.available) continue
      const key = entity.key
      setRowsByEntity((prev) => (prev[key] ? prev : { ...prev, [key]: 'loading' }))
      fetchNui<{ success: boolean; rows?: Row[] }>('conversionListEntity', {
        resource, version, entity: key,
      }).then((res) => {
        const loaded = res.success && res.rows ? res.rows : null
        setRowsByEntity((prev) => {
          const cur = prev[key]
          if (cur && cur !== 'loading') return prev
          return { ...prev, [key]: loaded ?? 'error' }
        })
        if (loaded) {
          setSelected((prev) => (prev[key] ? prev : { ...prev, [key]: new Set(loaded.map((r) => String(r.id))) }))
        }
      })
    }
  }, [resource, version, selectedVersion])

  const toggleEntity = async (entityKey: string) => {
    const now = !expanded[entityKey]
    setExpanded({ ...expanded, [entityKey]: now })
    if (now && !rowsByEntity[entityKey]) {
      setRowsByEntity((prev) => ({ ...prev, [entityKey]: 'loading' }))
      const res = await fetchNui<{ success: boolean; rows?: Row[] }>('conversionListEntity', {
        resource, version, entity: entityKey,
      })
      const loaded = res.success && res.rows ? res.rows : null
      setRowsByEntity((prev) => ({ ...prev, [entityKey]: loaded ?? 'error' }))
      if (loaded) {
        setSelected((prev) => (prev[entityKey] ? prev : { ...prev, [entityKey]: new Set(loaded.map((r) => String(r.id))) }))
      }
    }
  }

  const toggleAllForEntity = async (entityKey: string) => {
    const rows = rowsByEntity[entityKey]
    if (rows && rows !== 'loading' && rows !== 'error') {
      const sel = selected[entityKey] ?? new Set()
      const allOn = rows.length > 0 && sel.size === rows.length
      setAllRows(entityKey, rows, !allOn)
      return
    }
    if (rows === 'loading') return
    setRowsByEntity((prev) => ({ ...prev, [entityKey]: 'loading' }))
    const res = await fetchNui<{ success: boolean; rows?: Row[] }>('conversionListEntity', {
      resource, version, entity: entityKey,
    })
    const loaded = res.success && res.rows ? res.rows : null
    setRowsByEntity((prev) => ({ ...prev, [entityKey]: loaded ?? 'error' }))
    if (loaded) {
      setSelected((prev) => ({ ...prev, [entityKey]: new Set(loaded.map((r) => String(r.id))) }))
    }
  }

  const toggleRow = (entityKey: string, id: string | number) => {
    setSelected((prev) => {
      const set = new Set(prev[entityKey] ?? [])
      const k = String(id)
      if (set.has(k)) set.delete(k); else set.add(k)
      return { ...prev, [entityKey]: set }
    })
  }

  const setAllRows = (entityKey: string, rows: Row[], on: boolean) => {
    setSelected((prev) => ({
      ...prev,
      [entityKey]: on ? new Set(rows.map((r) => String(r.id))) : new Set(),
    }))
  }

  const totalSelected = useMemo(
    () => Object.values(selected).reduce((n, s) => n + s.size, 0),
    [selected],
  )

  const run = async () => {
    if (!resource || !version || totalSelected === 0) return
    setRunning(true)
    setResult(null)
    const selections: Record<string, (string | number)[]> = {}
    for (const [k, set] of Object.entries(selected)) {
      if (set.size > 0) {
        // Preserve the raw row ids (okok uses numbers for catalog rowids, jg uses numbers for table ids,
        // okok employees use composite "shopId:idx" strings). Everything serializes fine as string.
        selections[k] = Array.from(set)
      }
    }
    try {
      const res = await fetchNui<RunResponse>('conversionRun', {
        resource, version, selections,
        options: { conflictPolicy: policy, namePrefix },
      })
      setResult(res)
      if (res?.success) onImported?.()
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="relative flex-1 flex flex-col overflow-hidden">
      <div className="p-4 border-b border-border">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Download className="h-4 w-4 text-accent" /> {t('admin_import')}
        </h3>
        <p className="text-xs text-muted-foreground mt-1">{t('admin_import_desc')}</p>
      </div>

      <ScrollArea className="flex-1 p-4">
        {resources === null ? (
          <SkeletonList count={2} />
        ) : resources.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
            {t('import_no_adapters')}
          </div>
        ) : (
          <>
            {/* Resource / Version dropdowns */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <div className="text-xs text-muted-foreground mb-1">{t('import_resource')}</div>
                <Select value={resource} onValueChange={setResource}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {resources.map((r) => (
                      <SelectItem key={r.resource} value={r.resource}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">{t('import_version')}</div>
                <Select value={version} onValueChange={setVersion}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(selectedResource?.versions ?? []).map((v) => (
                      <SelectItem key={v.version} value={v.version}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Entity list with expandable item pickers */}
            {selectedVersion && (
              <div className="space-y-2 mb-4">
                <div className="text-xs text-muted-foreground">{t('import_pick_items')}</div>
                {selectedVersion.entities.map((entity) => {
                  const isOpen = !!expanded[entity.key]
                  const rows = rowsByEntity[entity.key]
                  const sel = selected[entity.key] ?? new Set()
                  const loadedRows = rows && rows !== 'loading' && rows !== 'error' ? rows : null
                  const allChecked = !!loadedRows && loadedRows.length > 0 && sel.size === loadedRows.length
                  return (
                    <Card key={entity.key} className={entity.available ? '' : 'opacity-50'}>
                      <CardContent className="p-0">
                        <div className="w-full flex items-center gap-2 p-3">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-accent"
                            disabled={!entity.available}
                            checked={allChecked}
                            onChange={() => toggleAllForEntity(entity.key)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <button
                            className="flex items-center gap-2 text-left flex-1 min-w-0"
                            disabled={!entity.available}
                            onClick={() => toggleEntity(entity.key)}
                          >
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            <span className="text-sm font-medium flex-1 truncate">
                              {t('import_entity_' + entity.key)}
                            </span>
                            {!entity.available && entity.missingTables.length > 0 && (
                              <Badge variant="destructive" className="text-[10px]">
                                {t('import_missing_table', entity.missingTables.join(', '))}
                              </Badge>
                            )}
                            {sel.size > 0 && (
                              <Badge variant="default" className="text-[10px]">{sel.size}</Badge>
                            )}
                          </button>
                        </div>
                        {isOpen && entity.available && (
                          <div className="border-t border-border p-3 space-y-2">
                            {rows === 'loading' ? (
                              <SkeletonList count={3} />
                            ) : rows === 'error' || !rows ? (
                              <div className="text-xs text-destructive">Failed to load.</div>
                            ) : rows.length === 0 ? (
                              <div className="text-xs text-muted-foreground">No rows found.</div>
                            ) : (
                              <>
                                <div className="flex gap-2">
                                  <Button size="sm" variant="outline" onClick={() => setAllRows(entity.key, rows, true)}>
                                    {t('import_select_all')}
                                  </Button>
                                  <Button size="sm" variant="outline" onClick={() => setAllRows(entity.key, rows, false)}>
                                    {t('import_clear')}
                                  </Button>
                                </div>
                                <div className="max-h-60 overflow-y-auto space-y-1">
                                  {rows.map((row) => (
                                    <label key={String(row.id)} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted rounded px-2 py-1">
                                      <input
                                        type="checkbox"
                                        className="h-4 w-4 accent-accent"
                                        checked={sel.has(String(row.id))}
                                        onChange={() => toggleRow(entity.key, row.id)}
                                      />
                                      <span className="truncate flex-1">{row.label}</span>
                                      <span className="text-[10px] text-muted-foreground font-mono">#{row.id}</span>
                                    </label>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}

            <Separator className="my-3" />

            {/* Options */}
            <div className="space-y-3 mb-4">
              <div>
                <div className="text-xs text-muted-foreground mb-1">{t('import_conflict_policy')}</div>
                <div className="flex gap-2 flex-wrap">
                  {(['skip', 'overwrite', 'duplicate'] as ConflictPolicy[]).map((p) => (
                    <Button key={p} size="sm" variant={policy === p ? 'default' : 'outline'} onClick={() => setPolicy(p)}>
                      {t('import_policy_' + p)}
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">{t('import_name_prefix')}</div>
                <Input value={namePrefix} onChange={(e) => setNamePrefix(e.target.value)} placeholder="[Imported] " />
              </div>
            </div>

          </>
        )}
      </ScrollArea>

      {/* Result modal */}
      <Dialog open={!!result} onOpenChange={(o) => { if (!o) setResult(null) }}>
        <DialogContent onClose={() => setResult(null)}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {result?.success ? (
                <><CheckCircle2 className="h-5 w-5 text-green-500" /> {t('import_success', String(result?.elapsed ?? 0))}</>
              ) : (
                <><AlertTriangle className="h-5 w-5 text-destructive" /> {t('import_failed', result?.message ?? '')}</>
              )}
            </DialogTitle>
            {result?.success && (
              <DialogDescription>
                {t('import_results_summary') || 'Here is a breakdown of what was imported.'}
              </DialogDescription>
            )}
          </DialogHeader>
          {result?.success && result.results && (
            <div className="space-y-1 text-sm">
              {Object.entries(result.results).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between border-b border-border last:border-0 py-1">
                  <span className="text-muted-foreground">{t('import_entity_' + k)}</span>
                  <span>
                    <span className="text-green-500">+{v.inserted}</span>
                    <span className="text-muted-foreground mx-1">/</span>
                    <span className="text-muted-foreground">{v.skipped} {t('import_skipped').toLowerCase()}</span>
                    {v.notFound && v.notFound.length > 0 && (
                      <span className="text-amber-500 ml-2">{v.notFound.length} {t('import_not_found').toLowerCase()}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-end">
            <Button onClick={() => setResult(null)}>{t('import_close') || 'Close'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex gap-2 p-4 border-t border-border">
        <Button
          className="flex-1"
          onClick={run}
          disabled={running || totalSelected === 0 || !resource || !version}
        >
          {running ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> {t('import_running')}</>
          ) : (
            <>{t('import_run')} {totalSelected > 0 && <Badge variant="secondary" className="ml-2 text-[10px]">{totalSelected}</Badge>}</>
          )}
        </Button>
      </div>
    </div>
  )
}
