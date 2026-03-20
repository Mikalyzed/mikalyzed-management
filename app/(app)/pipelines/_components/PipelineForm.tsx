'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

type StageInput = { id?: string; name: string; type: string }

const COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#1a1a1a', '#6366f1']
const STAGE_TYPES = [
  { value: 'open', label: 'Open' },
  { value: 'won', label: 'Won (Closed)' },
  { value: 'lost', label: 'Lost (Closed)' },
]

export default function PipelineForm({
  initialName = '',
  initialColor = '#3b82f6',
  initialStages = [{ name: 'New Lead', type: 'open' }],
  onSave,
  saving = false,
}: {
  initialName?: string
  initialColor?: string
  initialStages?: StageInput[]
  onSave: (name: string, color: string, stages: StageInput[]) => void
  saving?: boolean
}) {
  const router = useRouter()
  const [name, setName] = useState(initialName)
  const [color, setColor] = useState(initialColor)
  const [stages, setStages] = useState<StageInput[]>(initialStages)
  const dragIdx = useRef<number | null>(null)

  function addStage() {
    // Insert before any won/lost stages
    const lastOpenIdx = stages.reduce((acc, s, i) => (s.type === 'open' ? i : acc), -1)
    const newStages = [...stages]
    newStages.splice(lastOpenIdx + 1, 0, { name: '', type: 'open' })
    setStages(newStages)
  }

  function removeStage(idx: number) {
    if (stages.length <= 1) return
    setStages(stages.filter((_, i) => i !== idx))
  }

  function updateStage(idx: number, field: string, value: string) {
    setStages(stages.map((s, i) => i === idx ? { ...s, [field]: value } : s))
  }

  function handleDragStart(idx: number) {
    dragIdx.current = idx
  }

  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault()
    if (dragIdx.current === null || dragIdx.current === idx) return
    const newStages = [...stages]
    const [dragged] = newStages.splice(dragIdx.current, 1)
    newStages.splice(idx, 0, dragged)
    setStages(newStages)
    dragIdx.current = idx
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    const validStages = stages.filter(s => s.name.trim())
    if (validStages.length === 0) return
    // Ensure at least one won and one lost
    const hasWon = validStages.some(s => s.type === 'won')
    const hasLost = validStages.some(s => s.type === 'lost')
    const finalStages = [...validStages]
    if (!hasWon) finalStages.push({ name: 'Won', type: 'won' })
    if (!hasLost) finalStages.push({ name: 'Lost', type: 'lost' })
    onSave(name, color, finalStages)
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* Pipeline name + color */}
      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <div className="section-label" style={{ marginBottom: 16 }}>Pipeline Details</div>
        <div style={{ marginBottom: 16 }}>
          <label className="form-label">Name</label>
          <input className="input" value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Vehicle Sales" />
        </div>
        <div>
          <label className="form-label">Color</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {COLORS.map(c => (
              <button key={c} type="button" onClick={() => setColor(c)} style={{
                width: 32, height: 32, borderRadius: 8, background: c, border: color === c ? '3px solid #1a1a1a' : '2px solid transparent',
                cursor: 'pointer', transition: 'border 0.15s',
              }} />
            ))}
          </div>
        </div>
      </div>

      {/* Stages */}
      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div className="section-label">Stages</div>
          <button type="button" onClick={addStage} style={{
            fontSize: 13, fontWeight: 600, color: color, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px',
          }}>
            + Add Stage
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {stages.map((stage, idx) => (
            <div key={idx} draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={e => handleDragOver(e, idx)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                borderRadius: 10, border: '1px solid var(--border)', background: '#fff',
                cursor: 'grab',
              }}
            >
              {/* Drag handle */}
              <span style={{ color: 'var(--text-muted)', cursor: 'grab', fontSize: 16, userSelect: 'none', flexShrink: 0 }}>⠿</span>

              {/* Stage number */}
              <span style={{
                width: 24, height: 24, borderRadius: '50%', background: color + '15', color: color,
                fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {idx + 1}
              </span>

              {/* Name */}
              <input value={stage.name} onChange={e => updateStage(idx, 'name', e.target.value)}
                placeholder="Stage name..." style={{
                  flex: 1, border: 'none', outline: 'none', fontSize: 14, fontWeight: 500,
                  background: 'transparent', padding: '4px 0', minWidth: 0,
                }} />

              {/* Type */}
              <select value={stage.type} onChange={e => updateStage(idx, 'type', e.target.value)}
                style={{
                  border: 'none', outline: 'none', fontSize: 12, fontWeight: 600, background: 'transparent',
                  color: stage.type === 'won' ? '#16a34a' : stage.type === 'lost' ? '#ef4444' : 'var(--text-muted)',
                  cursor: 'pointer', padding: '4px',
                }}>
                {STAGE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>

              {/* Remove */}
              <button type="button" onClick={() => removeStage(idx)} style={{
                border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)',
                fontSize: 18, padding: '0 4px', lineHeight: 1, flexShrink: 0,
              }}>
                ×
              </button>
            </div>
          ))}
        </div>

        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10 }}>
          Drag to reorder. Won and Lost stages are auto-added if missing. Every pipeline needs at least one open stage.
        </p>
      </div>

      {/* Preview */}
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div className="section-label" style={{ marginBottom: 12 }}>Preview</div>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
          {stages.filter(s => s.name.trim()).map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 6, whiteSpace: 'nowrap',
                background: s.type === 'won' ? '#f0fdf4' : s.type === 'lost' ? '#fef2f2' : color + '12',
                color: s.type === 'won' ? '#16a34a' : s.type === 'lost' ? '#ef4444' : color,
                border: `1px solid ${s.type === 'won' ? '#bbf7d0' : s.type === 'lost' ? '#fecaca' : color + '30'}`,
              }}>
                {s.name}
              </span>
              {i < stages.filter(s2 => s2.name.trim()).length - 1 && (
                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>→</span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <button type="submit" className="btn btn-primary" disabled={saving} style={{ flex: 1 }}>
          {saving ? 'Saving...' : 'Save Pipeline'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => router.back()}>Cancel</button>
      </div>
    </form>
  )
}
