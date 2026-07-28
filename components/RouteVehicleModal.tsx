'use client'

/**
 * The ONE routing modal — used natively by the recon board and the
 * dashboard's Attention card. Renders instantly; when given only a
 * vehicleId it fetches that single vehicle (light) plus mechanics.
 * All prefill logic (fix tasks, pending installs, carryover) lives here so
 * behavior is identical everywhere by construction.
 */

import { useCallback, useEffect, useState } from 'react'
import { STAGE_LABELS } from '@/lib/constants'
import { summarizeReview, extractIssueFixTasks } from '@/lib/inspection-issues'

type ChecklistItem = {
  item: string
  done?: boolean
  note?: string
  addedByMechanic?: boolean
  approved?: string
  estimatedHours?: number | null
  fromPart?: boolean
}
export type RoutingVehicle = {
  id: string
  stockNumber: string
  year: number | null
  make: string
  model: string
  lastCompletedStage?: string | null
  lastCompleted?: { id: string; checklist: ChecklistItem[] } | null
  routeHistory?: Array<{ stage: string; status: string; scopeName?: string | null }>
  pendingInstalls?: Array<{ id: string; name: string }>
}
type RoutingTemplate = { id: string; name: string; isDefault: boolean; items: { item: string; type?: string; fields?: unknown }[] }

export default function RouteVehicleModal({ vehicle: vehicleProp, vehicleId, onClose, onRouted }: {
  vehicle?: RoutingVehicle | null
  vehicleId?: string
  onClose: () => void
  onRouted: () => void | Promise<void>
}) {
  const [vehicle, setVehicle] = useState<RoutingVehicle | null>(vehicleProp ?? null)
  const [mechanics, setMechanics] = useState<{ id: string; name: string }[]>([])
  const [routingNext, setRoutingNext] = useState<string>('detailing')
  const [routingReason, setRoutingReason] = useState('')
  const [routingTasks, setRoutingTasks] = useState<string[]>([])
  const [routingCarry, setRoutingCarry] = useState<Set<number>>(new Set())
  const [routingNewTask, setRoutingNewTask] = useState('')
  const [routingEstHours, setRoutingEstHours] = useState('')
  const [routingAssigneeId, setRoutingAssigneeId] = useState('')
  const [routingScopeName, setRoutingScopeName] = useState('')
  const [routingSoldDelivery, setRoutingSoldDelivery] = useState(false)
  const [routingSaving, setRoutingSaving] = useState(false)
  const [routingInstallMap, setRoutingInstallMap] = useState<Record<string, string>>({})
  const [routingTemplates, setRoutingTemplates] = useState<RoutingTemplate[]>([])
  const [routingSelectedTemplateIds, setRoutingSelectedTemplateIds] = useState<string[]>([])

  // Prefill from the vehicle's just-completed stage: fix tasks, installs, carryover.
  const prefill = useCallback((v: RoutingVehicle) => {
    const checklist = (v.lastCompleted?.checklist || []) as ChecklistItem[]
    const fixes = extractIssueFixTasks(checklist as never)
    const installs = v.pendingInstalls || []
    const shouldGoToMechanic = fixes.length > 0 || installs.length > 0
    setRoutingNext(shouldGoToMechanic ? 'mechanic' : 'detailing')
    setRoutingReason('')
    setRoutingTasks([
      ...fixes.map(f => f.note ? `${f.item} — ${f.note}` : f.item),
      ...installs.map(p => `Install: ${p.name}`),
    ])
    const installMap: Record<string, string> = {}
    for (const p of installs) installMap[`Install: ${p.name}`] = p.id
    setRoutingInstallMap(installMap)
    const addedTasks = checklist
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => t.addedByMechanic && t.approved !== 'declined')
    setRoutingCarry(new Set(addedTasks.map(({ i }) => i)))
    setRoutingNewTask('')
    setRoutingEstHours('')
    setRoutingAssigneeId('')
    setRoutingScopeName('')
    setRoutingSoldDelivery(false)
    setRoutingSelectedTemplateIds([])
  }, [])

  // Resolve the vehicle: use the prop, or fetch the single car by id.
  useEffect(() => {
    if (vehicleProp) {
      setVehicle(vehicleProp)
      prefill(vehicleProp)
      return
    }
    if (!vehicleId) return
    let cancelled = false
    fetch(`/api/vehicles?id=${vehicleId}`)
      .then(r => r.json())
      .then(d => {
        const v = (d.vehicles || [])[0] as RoutingVehicle | undefined
        if (!cancelled && v) { setVehicle(v); prefill(v) }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [vehicleProp, vehicleId, prefill])

  useEffect(() => {
    fetch('/api/users?role=mechanic')
      .then(r => r.json())
      .then(d => setMechanics((d.users || []).map((u: { id: string; name: string }) => ({ id: u.id, name: u.name }))))
      .catch(() => {})
  }, [])

  // Checklist templates for the destination stage.
  useEffect(() => {
    if (!vehicle || routingNext === 'completed') {
      setRoutingTemplates([])
      setRoutingSelectedTemplateIds([])
      return
    }
    let cancelled = false
    fetch(`/api/checklist-templates?stage=${routingNext}`)
      .then(async r => {
        if (!r.ok) return { templates: [] }
        const text = await r.text()
        if (!text) return { templates: [] }
        try { return JSON.parse(text) } catch { return { templates: [] } }
      })
      .then(d => { if (!cancelled) setRoutingTemplates((d.templates || []) as RoutingTemplate[]) })
      .catch(() => { if (!cancelled) setRoutingTemplates([]) })
    return () => { cancelled = true }
  }, [vehicle, routingNext])

  function toggleRoutingTemplate(tpl: RoutingTemplate) {
    const items = tpl.items.map(it => it.item)
    const isOn = routingSelectedTemplateIds.includes(tpl.id)
    const nextIds = isOn
      ? routingSelectedTemplateIds.filter(id => id !== tpl.id)
      : [...routingSelectedTemplateIds, tpl.id]
    setRoutingSelectedTemplateIds(nextIds)
    setRoutingTasks(prev => isOn
      ? prev.filter(x => !items.includes(x))
      : [...prev, ...items.filter(x => !prev.includes(x))])
    const names = routingTemplates.filter(t => nextIds.includes(t.id)).map(t => t.name)
    setRoutingScopeName(names.join(' + '))
  }

  if (!vehicle) {
    return (
      <div className="routing-overlay" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'transparent' }} />
          <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>Opening routing…</span>
        </div>
      </div>
    )
  }

  const routingVehicle = vehicle

  return (
    <div
      className="routing-overlay"
      onClick={() => !routingSaving && onClose()}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Route Vehicle
        </p>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginTop: 4, marginBottom: 4 }}>
          #{routingVehicle.stockNumber} — {routingVehicle.year} {routingVehicle.make} {routingVehicle.model}
        </h2>
        {routingVehicle.lastCompletedStage && (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
            Just completed: <strong>{STAGE_LABELS[routingVehicle.lastCompletedStage as keyof typeof STAGE_LABELS] || routingVehicle.lastCompletedStage}</strong>
          </p>
        )}

        {/* Route history — chronological trail of stages already completed */}
        {routingVehicle.routeHistory && routingVehicle.routeHistory.length > 0 && (
          <div style={{
            background: '#f9fafb', border: '1px solid var(--border)', borderRadius: 10,
            padding: '10px 12px', marginBottom: 16,
          }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
              Route so far
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, fontSize: 12 }}>
              {routingVehicle.routeHistory.map((h, i) => (
                <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    padding: '3px 9px', borderRadius: 100, fontWeight: 600,
                    background: h.status === 'skipped' ? '#f3f4f6' : '#dbeafe',
                    color: h.status === 'skipped' ? '#6b7280' : '#1d4ed8',
                    textDecoration: h.status === 'skipped' ? 'line-through' : 'none',
                  }}>
                    {STAGE_LABELS[h.stage as keyof typeof STAGE_LABELS] || h.stage}
                    {h.scopeName ? ` · ${h.scopeName}` : ''}
                  </span>
                  {i < routingVehicle.routeHistory!.length - 1 && (
                    <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>›</span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Smart review banner: shows what was flagged + suggests mechanic when needed */}
        {(() => {
          const fixes = extractIssueFixTasks((routingVehicle.lastCompleted?.checklist || []) as never)
          const installs = routingVehicle.pendingInstalls || []
          const reviewSummary = summarizeReview((routingVehicle.lastCompleted?.checklist || []) as never)
          if (fixes.length === 0 && installs.length === 0 && reviewSummary.addedTaskCount === 0) return null
          return (
            <div style={{
              background: '#fffbeb', border: '1px solid #fcd34d', borderLeft: '4px solid #f59e0b',
              borderRadius: 10, padding: '12px 14px', marginBottom: 16,
            }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                Needs review
              </p>
              <ul style={{ fontSize: 13, color: '#78350f', margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
                {fixes.length > 0 && (
                  <li><strong>{fixes.length} issue{fixes.length === 1 ? '' : 's'}</strong> flagged by mechanic — pre-filled as Fix tasks below</li>
                )}
                {installs.length > 0 && (
                  <li><strong>{installs.length} part{installs.length === 1 ? '' : 's'}</strong> received and ready to install — pre-filled as Install tasks below</li>
                )}
                {reviewSummary.addedTaskCount > 0 && (
                  <li><strong>{reviewSummary.addedTaskCount} task{reviewSummary.addedTaskCount === 1 ? '' : 's'}</strong> added by mechanic — review the carry-forward checkboxes below</li>
                )}
              </ul>
              {(fixes.length > 0 || installs.length > 0) && (
                <p style={{ fontSize: 12, color: '#92400e', marginTop: 8, marginBottom: 0 }}>
                  <strong>Suggested:</strong> route to Mechanic (you can override below).
                </p>
              )}
            </div>
          )
        })()}

        {(() => {
          const addedTasks = (routingVehicle.lastCompleted?.checklist || [])
            .filter(t => t.addedByMechanic && t.approved !== 'declined')
          if (addedTasks.length === 0) return null
          const allChecked = addedTasks.every((_, i) => routingCarry.has(i))
          const toggleAll = () => {
            if (allChecked) setRoutingCarry(new Set())
            else setRoutingCarry(new Set(addedTasks.map((_, i) => i)))
          }
          const toggleOne = (i: number) => {
            const next = new Set(routingCarry)
            if (next.has(i)) next.delete(i); else next.add(i)
            setRoutingCarry(next)
          }
          return (
            <div style={{
              background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10,
              padding: '10px 12px', marginBottom: 16,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Tasks added during inspection ({addedTasks.length})
                </p>
                <button
                  type="button"
                  onClick={toggleAll}
                  style={{ background: 'none', border: 'none', fontSize: 11, fontWeight: 700, color: '#1d4ed8', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.04em' }}
                >
                  {allChecked ? 'Uncheck all' : 'Check all'}
                </button>
              </div>
              <p style={{ fontSize: 11, color: '#1e3a8a', marginBottom: 8 }}>
                Checked tasks will be added to the next stage&apos;s checklist.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {addedTasks.map((t, i) => {
                  const checked = routingCarry.has(i)
                  return (
                    <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleOne(i)}
                        style={{ width: 14, height: 14, flexShrink: 0, cursor: 'pointer', accentColor: '#1d4ed8' }}
                      />
                      <span style={{ flex: 1, color: 'var(--text-primary)' }}>{t.item}</span>
                      {t.estimatedHours != null && (
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '1px 8px', borderRadius: 100,
                          background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d',
                        }}>{t.estimatedHours}h</span>
                      )}
                    </label>
                  )
                })}
              </div>
            </div>
          )
        })()}

        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Send to:</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          {[
            { v: 'mechanic', label: 'Mechanic' },
            { v: 'detailing', label: 'Detailing' },
            { v: 'content', label: 'Content' },
            { v: 'publish', label: 'Publish' },
            { v: 'completed', label: 'Complete' },
          ].map(opt => {
            const active = routingNext === opt.v
            return (
              <button
                key={opt.v}
                onClick={() => {
                  // Fix/Install tasks are mechanic-only work — strip them when
                  // routing anywhere else. Template items belong to their stage.
                  const fixes = extractIssueFixTasks((routingVehicle.lastCompleted?.checklist || []) as never)
                    .map(f => f.note ? `${f.item} — ${f.note}` : f.item)
                  const installs = Object.keys(routingInstallMap)
                  const tplItems = routingTemplates
                    .filter(t => routingSelectedTemplateIds.includes(t.id))
                    .flatMap(t => t.items.map(i => i.item))
                  const autoSet = new Set<string>([...fixes, ...installs, ...tplItems])
                  const userTasks = routingTasks.filter(t => !autoSet.has(t))
                  const next = opt.v === 'mechanic'
                    ? [...fixes, ...installs, ...userTasks]
                    : userTasks
                  setRoutingTasks(next)
                  setRoutingSelectedTemplateIds([])
                  setRoutingScopeName('')
                  setRoutingNext(opt.v)
                }}
                style={{
                  padding: '10px 14px', borderRadius: 10,
                  border: active ? '2px solid #1a1a1a' : '1px solid var(--border)',
                  background: active ? '#fafaf8' : '#fff',
                  fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}
              >
                {opt.label}
              </button>
            )
          })}
        </div>

        {routingNext === 'detailing' && (
          <label style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
            borderRadius: 10, marginBottom: 14, cursor: 'pointer',
            border: routingSoldDelivery ? '2px solid #1a1a1a' : '1px solid var(--border)',
            background: routingSoldDelivery ? '#fafaf8' : '#fff',
          }}>
            <input
              type="checkbox"
              checked={routingSoldDelivery}
              onChange={e => setRoutingSoldDelivery(e.target.checked)}
              style={{ width: 18, height: 18 }}
            />
            <div>
              <p style={{ fontSize: 14, fontWeight: 600 }}>Sold — delivery prep</p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                Adds delivery checklist (floor mats, gift box, air freshener, full clean)
              </p>
            </div>
          </label>
        )}

        {routingNext !== 'completed' && (
          <>
            {routingTemplates.length > 0 && (
              <>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Checklists
                  <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6 }}>
                    (adds the template&apos;s items to the task list)
                  </span>
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                  {routingTemplates.map(tpl => {
                    const active = routingSelectedTemplateIds.includes(tpl.id)
                    return (
                      <label
                        key={tpl.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                          borderRadius: 10, cursor: 'pointer',
                          border: active ? '2px solid #1a1a1a' : '1px solid var(--border)',
                          background: active ? '#fafaf8' : '#fff',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={active}
                          onChange={() => toggleRoutingTemplate(tpl)}
                          style={{ width: 18, height: 18 }}
                        />
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: 14, fontWeight: 600 }}>
                            {tpl.name}
                            {tpl.isDefault && (
                              <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6, fontSize: 12 }}>
                                (default)
                              </span>
                            )}
                          </p>
                          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                            {tpl.items.length} item{tpl.items.length === 1 ? '' : 's'}
                          </p>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </>
            )}
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Tasks for {routingNext}
              <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6 }}>
                (leave empty to use default checklist)
              </span>
            </p>
            <div style={{ display: 'flex', gap: 8, marginBottom: routingTasks.length > 0 ? 8 : 12 }}>
              <input
                value={routingNewTask}
                onChange={e => setRoutingNewTask(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    const t = routingNewTask.trim()
                    if (t) { setRoutingTasks([...routingTasks, t]); setRoutingNewTask('') }
                  }
                }}
                placeholder="Add a task..."
                style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}
              />
              <button
                type="button"
                onClick={() => {
                  const t = routingNewTask.trim()
                  if (t) { setRoutingTasks([...routingTasks, t]); setRoutingNewTask('') }
                }}
                style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                Add
              </button>
            </div>
            {routingTasks.length > 0 && (
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, marginBottom: 12, overflow: 'hidden' }}>
                {routingTasks.map((t, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 12px', fontSize: 13,
                    borderBottom: i < routingTasks.length - 1 ? '1px solid var(--border)' : 'none',
                  }}>
                    <span>{t}</span>
                    <button
                      type="button"
                      onClick={() => setRoutingTasks(routingTasks.filter((_, j) => j !== i))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16 }}
                    >×</button>
                  </div>
                ))}
              </div>
            )}

            {routingNext === 'mechanic' && (
              <>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Estimated hours (optional)</p>
                <input
                  type="number" step="0.5" min="0"
                  value={routingEstHours}
                  onChange={e => setRoutingEstHours(e.target.value)}
                  placeholder="e.g. 4"
                  style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, marginBottom: 12 }}
                />

                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Assign mechanic (optional)</p>
                <div style={{ display: 'grid', gridTemplateColumns: mechanics.length > 1 ? '1fr 1fr' : '1fr', gap: 8, marginBottom: 12 }}>
                  {mechanics.map(m => {
                    const active = routingAssigneeId === m.id
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setRoutingAssigneeId(active ? '' : m.id)}
                        style={{
                          padding: '10px 14px', borderRadius: 10,
                          border: active ? '2px solid #1a1a1a' : '1px solid var(--border)',
                          background: active ? '#fafaf8' : '#fff',
                          fontSize: 14, fontWeight: 600, cursor: 'pointer',
                          color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                        }}
                      >
                        {m.name}
                      </button>
                    )
                  })}
                  {mechanics.length === 0 && (
                    <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No users with the mechanic role yet.</p>
                  )}
                </div>

                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Scope label (optional)
                  <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6 }}>
                    e.g. Engine, Brakes — helps when two mechanics split one car
                  </span>
                </p>
                <input
                  value={routingScopeName}
                  onChange={e => setRoutingScopeName(e.target.value)}
                  placeholder="e.g. Engine work"
                  style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, marginBottom: 12 }}
                />
              </>
            )}
          </>
        )}

        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Reason (optional)</p>
        <textarea
          value={routingReason}
          onChange={e => setRoutingReason(e.target.value)}
          rows={2}
          placeholder="e.g. Quick fix, no detailing needed"
          style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, marginBottom: 16, resize: 'vertical' }}
        />

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onClose}
            disabled={routingSaving}
            style={{ flex: 1, padding: 12, borderRadius: 10, border: '1px solid var(--border)', background: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            disabled={routingSaving}
            onClick={async () => {
              setRoutingSaving(true)
              const fullChecklist = (routingVehicle.lastCompleted?.checklist || [])
              const carriedNames: string[] = []
              fullChecklist.forEach((t, i) => {
                if (t.addedByMechanic && t.approved !== 'declined' && routingCarry.has(i)) {
                  carriedNames.push(t.item)
                }
              })
              const mergedTasks = [...carriedNames, ...routingTasks]
              // Enrich template task names with their type/fields so structured
              // items stay rich in the new stage.
              const richByName = new Map<string, { type?: string; fields?: unknown }>()
              for (const tpl of routingTemplates) {
                if (!routingSelectedTemplateIds.includes(tpl.id)) continue
                for (const it of tpl.items) {
                  if (it.type || it.fields != null) {
                    richByName.set(it.item, {
                      ...(it.type ? { type: it.type } : {}),
                      ...(it.fields != null ? { fields: it.fields } : {}),
                    })
                  }
                }
              }
              const tasksPayload = mergedTasks.map(name => {
                const rich = richByName.get(name)
                return rich ? { item: name, ...rich } : name
              })
              const installPartIds = routingTasks
                .map(t => routingInstallMap[t])
                .filter((id): id is string => !!id)
              const approvedAddedIndices: number[] = []
              fullChecklist.forEach((t, i) => {
                if (t.addedByMechanic && t.approved !== 'declined' && routingCarry.has(i)) {
                  approvedAddedIndices.push(i)
                }
              })
              await fetch(`/api/vehicles/${routingVehicle.id}/route-stage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  nextStage: routingNext,
                  reason: routingReason || null,
                  tasks: tasksPayload,
                  estimatedHours: routingEstHours || null,
                  assigneeId: routingNext === 'mechanic' ? (routingAssigneeId || null) : null,
                  scopeName: routingNext === 'mechanic' ? (routingScopeName.trim() || null) : null,
                  soldDelivery: routingNext === 'detailing' ? routingSoldDelivery : false,
                  installPartIds,
                  previousStageId: routingVehicle.lastCompleted?.id || null,
                  approvedAddedIndices,
                }),
              })
              setRoutingSaving(false)
              await onRouted()
            }}
            style={{
              flex: 1, padding: 12, borderRadius: 10, border: 'none',
              background: '#1a1a1a', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              opacity: routingSaving ? 0.5 : 1,
            }}
          >
            {routingSaving ? 'Routing...' : 'Confirm Route'}
          </button>
        </div>
      </div>
    </div>
  )
}
