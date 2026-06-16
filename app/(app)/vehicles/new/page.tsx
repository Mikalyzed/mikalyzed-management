'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import VehicleSearch from '@/components/VehicleSearch'

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

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const form = new FormData(e.currentTarget)

    type ChecklistInput = string | { item: string; type?: string }
    const selectedTemplates = templates.filter(t => selectedTemplateIds.includes(t.id))
    let mechanicChecklist: ChecklistInput[] = []
    if (selectedTemplates.length > 0) {
      // Combine items from all selected templates (in template order, deduping by item name)
      const seen = new Set<string>()
      const combined: ChecklistInput[] = []
      for (const tpl of selectedTemplates) {
        for (const it of tpl.items) {
          const key = it.item.trim().toLowerCase()
          if (seen.has(key)) continue
          seen.add(key)
          combined.push(it)
        }
      }
      mechanicChecklist = [...combined, ...customTasks]
    } else if (customTasks.length > 0) {
      mechanicChecklist = customTasks
    } else {
      mechanicChecklist = ['Inspect & clear']
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
      stockNumber: form.get('stockNumber'),
      vin: form.get('vin'),
      year: form.get('year'),
      make: form.get('make'),
      model: form.get('model'),
      color: form.get('color'),
      trim: form.get('trim'),
      notes: form.get('notes'),
      startingStage,
      mechanicChecklist,
      mechanicScopeName,
      estimatedHours: form.get('estimatedHours') ? parseFloat(form.get('estimatedHours') as string) : null,
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
    <div style={{ maxWidth: '520px', margin: '0 auto' }}>
      <button onClick={() => router.back()} style={{ fontSize: '14px', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', marginBottom: '24px', display: 'block', minHeight: 'auto' }}>
        ← Back
      </button>

      <h1 style={{ fontSize: '24px', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '32px' }}>Add Vehicle</h1>

      {/* Inventory search */}
      <div style={{
        background: '#ffffff', border: '1px solid var(--border)', borderRadius: '16px',
        padding: '20px', marginBottom: '16px', boxShadow: 'var(--shadow-sm)',
      }}>
        <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
          Find Vehicle in Inventory
        </p>
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
      </div>

      <form key={selectedInv?.stockNumber || 'blank'} onSubmit={handleSubmit}>
        {/* Vehicle Info Card */}
        <div style={{
          background: '#ffffff',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          padding: '24px',
          marginBottom: '16px',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '20px' }}>
            Vehicle Information
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Stock Number *</label>
              <input name="stockNumber" required className="input" placeholder="e.g. N018750" defaultValue={selectedInv?.stockNumber || ''} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>VIN</label>
              <input name="vin" className="input" placeholder="Optional" defaultValue={selectedInv?.vin || ''} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Year</label>
                <input name="year" type="number" className="input" placeholder="2024" defaultValue={selectedInv?.year || ''} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Color</label>
                <input name="color" className="input" placeholder="White" defaultValue={selectedInv?.color || ''} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Make *</label>
                <input name="make" required className="input" placeholder="Toyota" defaultValue={selectedInv?.make || ''} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Model *</label>
                <input name="model" required className="input" placeholder="Camry" defaultValue={selectedInv?.model || ''} />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Trim</label>
              <input name="trim" className="input" placeholder="Optional" />
            </div>
          </div>
        </div>

        {/* Starting Stage */}
        <div style={{
          background: '#ffffff',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          padding: '24px',
          marginBottom: '16px',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
            Starting Stage
          </p>
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
        </div>

        {/* Estimated Hours */}
        <div style={{ marginBottom: 16 }}>
          <label className="form-label">Estimated Hours</label>
          <input type="number" name="estimatedHours" className="input" step="0.5" min="0"
            placeholder="How long should this stage take? (e.g. 4)" />
        </div>

        {/* Tasks Card */}
        <div style={{
          background: '#ffffff',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          padding: '24px',
          marginBottom: '16px',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '20px' }}>
            {startingStage === 'mechanic' ? 'Mechanic' : startingStage === 'detailing' ? 'Detailing' : startingStage === 'content' ? 'Content' : 'Publish'} Tasks
          </p>

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
          <div style={{ display: 'flex', gap: '8px', marginBottom: customTasks.length > 0 ? '16px' : '0' }}>
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

          {/* Task list */}
          {customTasks.length > 0 && (
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

          {customTasks.length === 0 && selectedTemplateIds.length === 0 && (
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
              No tasks added — mechanic will just need to inspect and clear
            </p>
          )}
        </div>

        {/* Notes Card */}
        <div style={{
          background: '#ffffff',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          padding: '24px',
          marginBottom: '24px',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
            Notes
          </p>
          <textarea name="notes" rows={3} className="input" style={{ resize: 'vertical', minHeight: '80px' }} placeholder="Any notes about this vehicle..." />
        </div>

        {/* Parts Card */}
        <div style={{
          background: '#ffffff',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          padding: '24px',
          marginBottom: '24px',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '20px' }}>
            Parts Needed
          </p>

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
        </div>

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

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            type="button"
            onClick={() => router.back()}
            style={{
              flex: 1,
              padding: '14px',
              borderRadius: '12px',
              border: '1px solid var(--border)',
              background: '#ffffff',
              fontSize: '15px',
              fontWeight: 600,
              cursor: 'pointer',
              color: 'var(--text-primary)',
              minHeight: '48px',
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            style={{
              flex: 1,
              padding: '14px',
              borderRadius: '12px',
              border: 'none',
              background: '#1a1a1a',
              color: '#dffd6e',
              fontSize: '15px',
              fontWeight: 600,
              cursor: 'pointer',
              minHeight: '48px',
              opacity: loading ? 0.5 : 1,
            }}
          >
            {loading ? 'Creating...' : 'Add to Recon'}
          </button>
        </div>
      </form>
    </div>
  )
}
