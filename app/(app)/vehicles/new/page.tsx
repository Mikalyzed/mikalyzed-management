'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import VehicleSearch from '@/components/VehicleSearch'
import {
  SectionCard, SectionCardLabel, FieldStack, FieldRow, FieldBackplate,
  PremiumField, PremiumPillButton,
} from '@/components/customer-form-ui'

type InventoryPick = {
  stockNumber: string; vin: string | null
  year: number | null; make: string; model: string; color: string | null
  // InventoryVehicle.status — surfaced from search so we can prompt the admin
  // for a reason when re-routing a sold car back through recon.
  status?: string
}

type Template = {
  id: string
  stage: string
  name: string
  items: { item: string; type?: string }[]
  isDefault: boolean
}

type Mechanic = { id: string; name: string }

// A single resolved task — either an item pulled from the selected checklist
// template(s) (deduped by name, in template order) or a manually added
// custom task. Used both to render the per-task assignment list and to build
// the mechanicChecklist payload at submit time.
type ResolvedTask = {
  key: string
  item: string
  type?: string
  source: 'template' | 'custom'
  customIndex?: number
}

// ─── Assignee chip helpers (mirrors the recon board's per-task picker) ────
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const CHIP_COLORS = ['#2563eb', '#db2777', '#16a34a', '#d97706', '#7c3aed', '#0891b2']
function chipColor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return CHIP_COLORS[h % CHIP_COLORS.length]
}

export default function AddVehiclePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [startingStage, setStartingStage] = useState('mechanic')
  const [customTasks, setCustomTasks] = useState<string[]>([])
  const [newTask, setNewTask] = useState('')
  const [parts, setParts] = useState<{ name: string; url: string }[]>([])
  const [newPart, setNewPart] = useState('')
  const [newPartUrl, setNewPartUrl] = useState('')
  const [selectedInv, setSelectedInv] = useState<InventoryPick | null>(null)
  const [soldDelivery, setSoldDelivery] = useState(false)
  const [templates, setTemplates] = useState<Template[]>([])
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([])
  const [mechanics, setMechanics] = useState<Mechanic[]>([])
  const [mechanicAssigneeId, setMechanicAssigneeId] = useState('')

  // Per-task mechanic assignment (mechanic stage only), keyed by task item
  // name so toggling templates / adding tasks doesn't lose existing picks.
  const [taskAssignments, setTaskAssignments] = useState<Record<string, Mechanic>>({})

  // Vehicle Information — controlled so PremiumField (value/onChange) can
  // drive them, and so selecting a different inventory match re-seeds them.
  const [stockNumber, setStockNumber] = useState('')
  const [vin, setVin] = useState('')
  const [year, setYear] = useState('')
  const [color, setColor] = useState('')
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [trim, setTrim] = useState('')
  const [estimatedHours, setEstimatedHours] = useState('')
  // Vehicle Information is collapsed by default (most cars come from inventory
  // search); toggling it on reveals the manual-entry fields.
  const [showVehicleInfo, setShowVehicleInfo] = useState(false)

  useEffect(() => {
    fetch('/api/users?role=mechanic')
      .then(r => r.json())
      .then(d => setMechanics((d.users || []).map((u: { id: string; name: string }) => ({ id: u.id, name: u.name }))))
      .catch(() => {})
  }, [])

  // Load templates for the starting stage and pre-check default (if any)
  useEffect(() => {
    fetch(`/api/checklist-templates?stage=${startingStage}`)
      .then(async r => {
        if (!r.ok) return { templates: [] }
        const text = await r.text()
        if (!text) return { templates: [] }
        try { return JSON.parse(text) } catch { return { templates: [] } }
      })
      .then(d => {
        const list: Template[] = d.templates || []
        setTemplates(list)
        const def = list.find(t => t.isDefault)
        setSelectedTemplateIds(def ? [def.id] : [])
      })
      .catch(() => setTemplates([]))
  }, [startingStage])

  // Seed Vehicle Information from the selected inventory match — mirrors the
  // old defaultValue-on-remount behavior (form was keyed by selectedInv
  // before), but via controlled state so PremiumField works.
  useEffect(() => {
    setStockNumber(selectedInv?.stockNumber || '')
    setVin(selectedInv?.vin || '')
    setYear(selectedInv?.year != null ? String(selectedInv.year) : '')
    setColor(selectedInv?.color || '')
    setMake(selectedInv?.make || '')
    setModel(selectedInv?.model || '')
    setTrim('')
    // Reveal the fields when a match is picked so the auto-filled data is visible.
    if (selectedInv) setShowVehicleInfo(true)
  }, [selectedInv])

  function toggleTemplate(id: string) {
    setSelectedTemplateIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function addTask() {
    const task = newTask.trim()
    if (!task) return
    setCustomTasks([...customTasks, task])
    setNewTask('')
  }

  function removeTask(index: number) {
    setCustomTasks(customTasks.filter((_, i) => i !== index))
  }

  function setTaskAssignment(key: string, mech: Mechanic | null) {
    setTaskAssignments(prev => {
      const next = { ...prev }
      if (mech) next[key] = mech
      else delete next[key]
      return next
    })
  }

  // Combine items from all selected templates (in template order, deduping
  // by item name), followed by custom tasks — same ordering/dedup rules the
  // old inline handleSubmit logic used, just reusable for both render + submit.
  function getResolvedTasks(): ResolvedTask[] {
    const selectedTemplates = templates.filter(t => selectedTemplateIds.includes(t.id))
    const out: ResolvedTask[] = []
    if (selectedTemplates.length > 0) {
      const seen = new Set<string>()
      for (const tpl of selectedTemplates) {
        for (const it of tpl.items) {
          const key = it.item.trim().toLowerCase()
          if (seen.has(key)) continue
          seen.add(key)
          out.push({ key: it.item, item: it.item, type: it.type, source: 'template' })
        }
      }
    }
    customTasks.forEach((task, i) => {
      out.push({ key: task, item: task, source: 'custom', customIndex: i })
    })
    return out
  }

  const resolvedTasks = getResolvedTasks()

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    // Vehicle Information can be collapsed — if a required field is missing,
    // reveal the section and stop so the user isn't staring at a hidden error.
    if (!stockNumber.trim() || !make.trim() || !model.trim()) {
      setShowVehicleInfo(true)
      setError('Stock number, make, and model are required')
      setLoading(false)
      return
    }

    const form = new FormData(e.currentTarget)

    type ChecklistOutItem = { item: string; type?: string; assigneeId?: string; assigneeName?: string }
    const selectedTemplates = templates.filter(t => selectedTemplateIds.includes(t.id))
    const resolved = getResolvedTasks()
    let mechanicChecklist: ChecklistOutItem[]
    if (resolved.length > 0) {
      mechanicChecklist = resolved.map(t => {
        const assignment = startingStage === 'mechanic' ? taskAssignments[t.key] : undefined
        return {
          item: t.item,
          ...(t.type ? { type: t.type } : {}),
          ...(assignment ? { assigneeId: assignment.id, assigneeName: assignment.name } : {}),
        }
      })
    } else {
      mechanicChecklist = [{ item: 'Inspect & clear' }]
    }
    // Pass the selected template's name through to the API so the stage is
    // scoped (e.g. "New Vehicle Inspection") and identifiable across the UI —
    // not just a generic mechanic stage that happens to have the right items.
    const mechanicScopeName = selectedTemplates.length > 0
      ? selectedTemplates.map(t => t.name).join(' + ')
      : null

    // Sold-car gate: if the admin is sending a car that's already marked Sold
    // back into recon, ask why first so the answer is captured on the new
    // stage and visible later in the vehicle jacket / activity log.
    let soldReason: string | null = null
    if (selectedInv?.status === 'sold') {
      const desc = `${selectedInv.year ?? ''} ${selectedInv.make} ${selectedInv.model}`.trim()
      const answer = window.prompt(
        `${desc} (#${selectedInv.stockNumber}) is marked Sold.\n\nWhy is it going back to recon?`
      )
      if (!answer || !answer.trim()) {
        setLoading(false)
        return
      }
      soldReason = answer.trim()
    }

    const data: Record<string, unknown> = {
      stockNumber,
      vin,
      year,
      make,
      model,
      color,
      trim,
      notes: form.get('notes'),
      startingStage,
      mechanicChecklist,
      mechanicScopeName,
      assigneeId: startingStage === 'mechanic' ? (mechanicAssigneeId || null) : null,
      estimatedHours: estimatedHours ? parseFloat(estimatedHours) : null,
      soldDelivery: startingStage === 'detailing' ? soldDelivery : false,
      ...(soldReason ? { reason: soldReason } : {}),
    }

    try {
      const res = await fetch('/api/vehicles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const result = await res.json()
      if (!res.ok) {
        if (result.error === 'completed' && result.vehicleId) {
          const reason = prompt(
            `${result.vehicle} (Stock #${data.stockNumber}) has already completed recon.\n\nTo send it back through, enter the reason:`
          )
          if (reason) {
            const restartRes = await fetch(`/api/vehicles/${result.vehicleId}/restart`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                reason,
                mechanicChecklist,
                mechanicScopeName,
              }),
            })
            if (restartRes.ok) {
              router.push(`/vehicles/${result.vehicleId}`)
              return
            }
            setError('Failed to restart recon')
          }
          return
        }
        setError(result.error || 'Failed to create vehicle')
        return
      }
      // Create parts if any were added
      if (parts.length > 0) {
        await Promise.all(parts.map(p =>
          fetch('/api/parts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vehicleId: result.vehicle.id, name: p.name, url: p.url || null }),
          })
        ))
      }
      router.push(`/vehicles/${result.vehicle.id}`)
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: '560px', margin: '0 auto', position: 'relative' }}>
      {/* Mesh-gradient backdrop — the SectionCards are translucent glass panels;
          without a colored surface behind them they read as flat grey. This gives
          them the same premium feel as the vehicle detail page. */}
      <div aria-hidden style={{
        position: 'absolute', inset: '-40px -80px', zIndex: 0, pointerEvents: 'none',
        background: [
          'radial-gradient(at 12% 5%, hsla(220, 90%, 72%, 0.20) 0px, transparent 42%)',
          'radial-gradient(at 88% 3%, hsla(280, 80%, 70%, 0.16) 0px, transparent 42%)',
          'radial-gradient(at 78% 32%, hsla(190, 70%, 76%, 0.14) 0px, transparent 38%)',
          'radial-gradient(at 6% 55%, hsla(340, 75%, 74%, 0.14) 0px, transparent 42%)',
          'radial-gradient(at 62% 82%, hsla(40, 85%, 78%, 0.13) 0px, transparent 42%)',
        ].join(', '),
        filter: 'blur(70px) saturate(115%)',
      }} />
      <div style={{ position: 'relative', zIndex: 1 }}>
      <button onClick={() => router.back()} style={{ fontSize: '14px', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', marginBottom: '24px', display: 'block', minHeight: 'auto' }}>
        ← Back
      </button>

      <h1 style={{ fontSize: '24px', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '32px' }}>Add Vehicle</h1>

      {/* Inventory search */}
      <SectionCard>
        <SectionCardLabel>Find Vehicle in Inventory</SectionCardLabel>
        <VehicleSearch
          placeholder="Search by stock #, VIN, or name..."
          onSelect={(v) => setSelectedInv({
            stockNumber: v.stockNumber, vin: v.vin,
            year: v.year, make: v.make, model: v.model, color: v.color,
          })}
        />
        {selectedInv && (
          <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Selected: #{selectedInv.stockNumber} — {selectedInv.year} {selectedInv.make} {selectedInv.model}</span>
            <button type="button" onClick={() => setSelectedInv(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#16a34a', fontSize: 13, fontWeight: 600 }}>Clear</button>
          </div>
        )}
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>
          Pick from inventory to auto-fill, or skip and enter manually below.
        </p>
      </SectionCard>

      <form key={selectedInv?.stockNumber || 'blank'} onSubmit={handleSubmit}>
        {/* Vehicle Info Card — collapsed by default; toggle reveals the fields */}
        <SectionCard>
          <div
            onClick={() => setShowVehicleInfo(v => !v)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, cursor: 'pointer' }}
          >
            <SectionCardLabel>Vehicle Information</SectionCardLabel>
            {/* little on/off switch */}
            <span aria-hidden style={{
              width: 40, height: 22, borderRadius: 999, flexShrink: 0, position: 'relative',
              background: showVehicleInfo ? '#1a1a1a' : '#cbd5e1', transition: 'background 0.2s',
            }}>
              <span style={{
                position: 'absolute', top: 2, left: showVehicleInfo ? 20 : 2,
                width: 18, height: 18, borderRadius: '50%', background: '#fff',
                boxShadow: '0 1px 2px rgba(0,0,0,0.25)', transition: 'left 0.2s',
              }} />
            </span>
          </div>
          {!showVehicleInfo && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
              {stockNumber ? `#${stockNumber} · ${[year, make, model].filter(Boolean).join(' ')}` : 'Turn on to enter vehicle details manually.'}
            </p>
          )}
          {showVehicleInfo && (
            <div style={{ marginTop: 12 }}>
              <FieldStack>
                <FieldBackplate>
                  <PremiumField label="Stock Number" value={stockNumber} onChange={setStockNumber} placeholder="e.g. N018750" required />
                </FieldBackplate>
                <FieldBackplate>
                  <PremiumField label="VIN" value={vin} onChange={setVin} placeholder="Optional" />
                </FieldBackplate>
                <FieldRow cols={[1, 1]}>
                  <FieldBackplate>
                    <PremiumField label="Year" value={year} onChange={setYear} placeholder="2024" />
                  </FieldBackplate>
                  <FieldBackplate>
                    <PremiumField label="Color" value={color} onChange={setColor} placeholder="White" />
                  </FieldBackplate>
                </FieldRow>
                <FieldRow cols={[1, 1]}>
                  <FieldBackplate>
                    <PremiumField label="Make" value={make} onChange={setMake} placeholder="Toyota" required />
                  </FieldBackplate>
                  <FieldBackplate>
                    <PremiumField label="Model" value={model} onChange={setModel} placeholder="Camry" required />
                  </FieldBackplate>
                </FieldRow>
                <FieldBackplate>
                  <PremiumField label="Trim" value={trim} onChange={setTrim} placeholder="Optional" />
                </FieldBackplate>
              </FieldStack>
            </div>
          )}
        </SectionCard>

        {/* Starting Stage */}
        <SectionCard>
          <SectionCardLabel>Starting Stage</SectionCardLabel>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {(['mechanic', 'detailing', 'content', 'publish'] as const).map((stage) => {
              const labels: Record<string, string> = { mechanic: 'Mechanic', detailing: 'Detailing', content: 'Content', publish: 'Publish' }
              const active = startingStage === stage
              return (
                <button
                  key={stage}
                  type="button"
                  onClick={() => setStartingStage(stage)}
                  style={{
                    padding: '10px 18px',
                    borderRadius: '10px',
                    border: active ? '2px solid #1a1a1a' : '1px solid var(--border)',
                    background: active ? '#fafaf8' : '#ffffff',
                    fontSize: '14px',
                    fontWeight: active ? 600 : 500,
                    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    minHeight: 'auto',
                    transition: 'all 0.15s',
                  }}
                >
                  {labels[stage]}
                </button>
              )
            })}
          </div>
        </SectionCard>

        {/* Estimated Hours */}
        <SectionCard>
          <SectionCardLabel>Estimated Hours</SectionCardLabel>
          <FieldStack>
            <FieldBackplate>
              <PremiumField label="Estimated Hours" value={estimatedHours} onChange={setEstimatedHours} placeholder="e.g. 4" />
            </FieldBackplate>
          </FieldStack>
        </SectionCard>

        {/* Assign mechanic (whole car) — individual tasks can still be handed off below */}
        {startingStage === 'mechanic' && mechanics.length > 0 && (
          <SectionCard>
            <SectionCardLabel>Assign Mechanic (optional)</SectionCardLabel>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {mechanics.map(m => {
                const active = mechanicAssigneeId === m.id
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMechanicAssigneeId(active ? '' : m.id)}
                    style={{
                      padding: '10px 16px', borderRadius: 10,
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
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
              Assigns the whole car by default. Hand individual tasks to a specific mechanic below.
            </p>
          </SectionCard>
        )}

        {/* Tasks Card */}
        <SectionCard>
          <SectionCardLabel>
            {startingStage === 'mechanic' ? 'Mechanic' : startingStage === 'detailing' ? 'Detailing' : startingStage === 'content' ? 'Content' : 'Publish'} Tasks
          </SectionCardLabel>

          {/* Checklist Template Picker — multi-select */}
          {templates.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <label className="form-label">Checklists</label>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                Check the inspection(s) needed for this vehicle. Manage templates in <a href="/settings" style={{ color: 'var(--text-secondary)', textDecoration: 'underline' }}>Settings → Recon</a>.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {templates.map(t => {
                  const checked = selectedTemplateIds.includes(t.id)
                  return (
                    <label
                      key={t.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '10px 14px', borderRadius: 10,
                        border: checked ? '2px solid #1a1a1a' : '1px solid var(--border)',
                        background: checked ? '#fafaf8' : '#fff',
                        cursor: 'pointer', transition: 'all 0.15s ease',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleTemplate(t.id)}
                        style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#1a1a1a' }}
                      />
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{t.name}</p>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                          {t.items.length} item{t.items.length === 1 ? '' : 's'}
                          {t.items.some(i => i.type) && ` · includes structured inputs`}
                        </p>
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          {/* Sold Delivery Toggle (detailing only) */}
          {startingStage === 'detailing' && (
            <label style={{
              display: 'flex', alignItems: 'center', gap: '14px',
              padding: '14px 16px', borderRadius: '12px',
              border: soldDelivery ? '2px solid #1a1a1a' : '1px solid var(--border)',
              background: soldDelivery ? '#fafaf8' : '#ffffff',
              cursor: 'pointer', marginBottom: '20px', transition: 'all 0.15s ease',
            }}>
              <span style={{
                width: '22px', height: '22px', borderRadius: '6px',
                border: soldDelivery ? 'none' : '2px solid #d4d4d4',
                background: soldDelivery ? '#1a1a1a' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {soldDelivery && <span style={{ color: '#dffd6e', fontSize: '13px', fontWeight: 700 }}>✓</span>}
              </span>
              <input
                type="checkbox" checked={soldDelivery}
                onChange={(e) => setSoldDelivery(e.target.checked)}
                style={{ display: 'none' }}
              />
              <div>
                <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Sold — delivery prep</p>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Adds delivery checklist: floor mats, gift box, air freshener, full clean
                </p>
              </div>
            </label>
          )}

          {/* Add task input */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: (startingStage === 'mechanic' ? resolvedTasks.length > 0 : customTasks.length > 0) ? '16px' : '0' }}>
            <input
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTask() } }}
              className="input"
              placeholder="Add a specific task..."
              style={{ flex: 1 }}
            />
            <button
              type="button"
              onClick={addTask}
              style={{
                padding: '12px 20px',
                borderRadius: '12px',
                border: '1px solid var(--border)',
                background: '#ffffff',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                color: 'var(--text-primary)',
                minHeight: '44px',
                boxShadow: 'var(--shadow-sm)',
                transition: 'all 0.15s',
              }}
            >
              Add
            </button>
          </div>

          {/* Mechanic stage: resolved task list (template items + custom tasks)
              with per-task mechanic assignment. Unassigned tasks fall to the
              whole-car assignee picked above. */}
          {startingStage === 'mechanic' && resolvedTasks.length > 0 && (
            <div style={{ borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden' }}>
              {resolvedTasks.map((t, idx) => {
                const assigned = taskAssignments[t.key]
                return (
                  <div key={`${t.source}-${t.key}-${idx}`} style={{
                    padding: '12px 16px',
                    borderBottom: idx < resolvedTasks.length - 1 ? '1px solid var(--border-light)' : 'none',
                    background: '#ffffff',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        {assigned && (
                          <span title={assigned.name} style={{
                            width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                            background: chipColor(assigned.id), color: '#fff',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 9, fontWeight: 800,
                          }}>{initialsOf(assigned.name)}</span>
                        )}
                        <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>{t.item}</span>
                        {t.source === 'template' && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Template
                          </span>
                        )}
                      </div>
                      {t.source === 'custom' && t.customIndex !== undefined && (
                        <button
                          type="button"
                          onClick={() => removeTask(t.customIndex!)}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)',
                            fontSize: '18px', lineHeight: 1, minHeight: 'auto', padding: '4px 8px', borderRadius: '6px',
                            transition: 'all 0.15s',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.background = 'var(--danger-bg)' }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'none' }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                    {mechanics.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                        {mechanics.map(m => {
                          const active = assigned?.id === m.id
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => setTaskAssignment(t.key, active ? null : { id: m.id, name: m.name })}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '4px 10px 4px 4px', borderRadius: 999,
                                border: active ? '2px solid #1a1a1a' : '1px solid var(--border)',
                                background: active ? '#fafaf8' : '#fff',
                                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                              }}
                            >
                              <span style={{
                                width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                                background: chipColor(m.id), color: '#fff',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 7, fontWeight: 800,
                              }}>{initialsOf(m.name)}</span>
                              {m.name.split(' ')[0]}
                            </button>
                          )
                        })}
                        {assigned && (
                          <button
                            type="button"
                            onClick={() => setTaskAssignment(t.key, null)}
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              color: 'var(--text-muted)', fontSize: 12, fontWeight: 600,
                              minHeight: 'auto', padding: '4px 6px',
                            }}
                          >
                            Unassign
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Other stages: plain custom task list (no per-task assignment) */}
          {startingStage !== 'mechanic' && customTasks.length > 0 && (
            <div style={{
              borderRadius: '12px',
              border: '1px solid var(--border)',
              overflow: 'hidden',
            }}>
              {customTasks.map((task, i) => (
                <div key={i} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 16px',
                  borderBottom: i < customTasks.length - 1 ? '1px solid var(--border-light)' : 'none',
                  background: '#ffffff',
                }}>
                  <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>{task}</span>
                  <button
                    type="button"
                    onClick={() => removeTask(i)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--text-muted)',
                      fontSize: '18px',
                      lineHeight: 1,
                      minHeight: 'auto',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.background = 'var(--danger-bg)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'none' }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {(startingStage === 'mechanic' ? resolvedTasks.length === 0 : customTasks.length === 0) && selectedTemplateIds.length === 0 && (
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
              No tasks added — mechanic will just need to inspect and clear
            </p>
          )}
        </SectionCard>

        {/* Notes Card */}
        <SectionCard>
          <SectionCardLabel>Notes</SectionCardLabel>
          <textarea name="notes" rows={3} className="input" style={{ resize: 'vertical', minHeight: '80px' }} placeholder="Any notes about this vehicle..." />
        </SectionCard>

        {/* Parts Card */}
        <SectionCard>
          <SectionCardLabel>Parts Needed</SectionCardLabel>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: parts.length > 0 ? '16px' : '0' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                value={newPart}
                onChange={(e) => setNewPart(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const p = newPart.trim(); if (p) { setParts([...parts, { name: p, url: newPartUrl.trim() }]); setNewPart(''); setNewPartUrl('') } } }}
                className="input"
                placeholder="Part name..."
                style={{ flex: 1 }}
              />
              <button
                type="button"
                onClick={() => { const p = newPart.trim(); if (p) { setParts([...parts, { name: p, url: newPartUrl.trim() }]); setNewPart(''); setNewPartUrl('') } }}
                style={{
                  padding: '12px 20px', borderRadius: '12px', border: '1px solid var(--border)',
                  background: '#ffffff', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                  color: 'var(--text-primary)', minHeight: '44px', boxShadow: 'var(--shadow-sm)',
                }}
              >
                Add
              </button>
            </div>
            <input
              value={newPartUrl}
              onChange={(e) => setNewPartUrl(e.target.value)}
              className="input"
              placeholder="Part link (optional)"
              style={{ fontSize: '13px' }}
            />
          </div>

          {parts.length > 0 && (
            <div style={{ borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden' }}>
              {parts.map((part, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '14px 16px',
                  borderBottom: i < parts.length - 1 ? '1px solid var(--border-light)' : 'none',
                  background: '#ffffff',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 6px', borderRadius: '4px', background: part.url ? '#fef9c3' : '#fef2f2', color: part.url ? '#a16207' : '#ef4444', border: `1px solid ${part.url ? '#fde047' : '#fecaca'}` }}>{part.url ? 'Pending Approval' : 'Requested'}</span>
                      <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>{part.name}</span>
                    </div>
                    {part.url && (
                      <a href={part.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px', color: '#2563eb', textDecoration: 'none', marginTop: '2px', display: 'block', wordBreak: 'break-all' }}>
                        {part.url.length > 50 ? part.url.slice(0, 50) + '...' : part.url}
                      </a>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setParts(parts.filter((_, j) => j !== i))}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)',
                      fontSize: '18px', lineHeight: 1, minHeight: 'auto', padding: '4px 8px', borderRadius: '6px',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.background = 'var(--danger-bg)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'none' }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {parts.length === 0 && (
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
              No parts added — you can always add parts later
            </p>
          )}
        </SectionCard>

        {error && (
          <div style={{
            padding: '14px 18px',
            borderRadius: '12px',
            fontSize: '14px',
            background: 'var(--danger-bg)',
            color: 'var(--danger)',
            border: '1px solid var(--danger-border)',
            marginBottom: '16px',
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <button
            type="button"
            onClick={() => router.back()}
            style={{
              fontSize: '14px',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              minHeight: 'auto',
              padding: '10px 4px',
            }}
          >
            Cancel
          </button>
          <PremiumPillButton
            label={loading ? 'Creating...' : 'Add to Recon'}
            onClick={() => {}}
            disabled={loading}
          />
        </div>
      </form>
      </div>
    </div>
  )
}
