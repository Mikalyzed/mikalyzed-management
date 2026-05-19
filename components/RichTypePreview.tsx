'use client'

import { useState } from 'react'
import { DEFAULT_FIELDS, type ChecklistField } from '@/lib/checklist-fields'

export type Field = ChecklistField

type Props = {
  type: string
  itemLabel: string
  fields?: Field[]  // current custom fields (if any)
  onSave?: (fields: Field[]) => Promise<void> | void
  onClose: () => void
}

// Per-type input rendering metadata
type Scheme = 'number' | 'pillTri' | 'pillBi' | 'pillYesNo'
const SCHEME: Record<string, Scheme> = {
  tirePsi: 'number',
  brakePads: 'number',
  fluids: 'pillTri',  // OK / Topped / Issue
  engineCheck: 'pillBi',  // OK / Issue
  electrical: 'pillBi',
  steeringCheck: 'pillYesNo',
  suspensionCheck: 'pillYesNo',
}

const TYPE_LABELS: Record<string, string> = {
  tirePsi: 'Tire Pressure',
  brakePads: 'Brake Pad Thickness',
  fluids: 'Fluids Check',
  engineCheck: 'Engine Components',
  electrical: 'Electrical Systems',
  steeringCheck: 'Steering Check',
  suspensionCheck: 'Suspension Check',
}

function slugify(label: string, existing: Field[]): string {
  const base = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'field'
  let key = base
  let n = 2
  const taken = new Set(existing.map(f => f.key))
  while (taken.has(key)) {
    key = `${base}_${n++}`
  }
  return key
}

export default function RichTypePreview({ type, itemLabel, fields, onSave, onClose }: Props) {
  const defaults = DEFAULT_FIELDS[type] || []
  const initial = (fields && fields.length > 0) ? fields : defaults
  const [editMode, setEditMode] = useState(false)
  const [draft, setDraft] = useState<Field[]>(initial)
  const [newLabel, setNewLabel] = useState('')
  const [saving, setSaving] = useState(false)

  const scheme = SCHEME[type] || 'number'
  const isCustomized = !!fields && fields.length > 0

  function addField() {
    const label = newLabel.trim()
    if (!label) return
    setDraft([...draft, { key: slugify(label, draft), label }])
    setNewLabel('')
  }

  function removeField(i: number) {
    setDraft(draft.filter((_, idx) => idx !== i))
  }

  function renameField(i: number, label: string) {
    setDraft(draft.map((f, idx) => idx === i ? { ...f, label } : f))
  }

  function moveField(i: number, dir: -1 | 1) {
    const next = [...draft]
    const target = i + dir
    if (target < 0 || target >= next.length) return
    ;[next[i], next[target]] = [next[target], next[i]]
    setDraft(next)
  }

  async function handleSave() {
    if (!onSave) return
    setSaving(true)
    try {
      await onSave(draft)
      setEditMode(false)
    } catch { /* parent shows the error */ }
    setSaving(false)
  }

  async function handleResetToDefaults() {
    if (!onSave) return
    if (!confirm('Reset to default fields? This removes your customization for this item.')) return
    setSaving(true)
    try {
      await onSave([])
      setDraft(defaults)
      setEditMode(false)
    } catch { /* ignore */ }
    setSaving(false)
  }

  const displayFields = editMode ? draft : initial

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1600, padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 16, width: '100%', maxWidth: 560,
          maxHeight: '85vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{itemLabel}</h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {TYPE_LABELS[type] || type}
                {isCustomized && (
                  <span style={{
                    marginLeft: 8, fontSize: 10, fontWeight: 700,
                    padding: '2px 8px', borderRadius: 999,
                    background: '#dcfce7', color: '#16a34a',
                    textTransform: 'uppercase', letterSpacing: '0.04em',
                  }}>Customized</span>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-muted)', padding: '0 4px', lineHeight: 1 }}
            >×</button>
          </div>

          {onSave && (
            <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
              {!editMode ? (
                <>
                  <button
                    type="button"
                    onClick={() => setEditMode(true)}
                    style={{
                      padding: '6px 14px', borderRadius: 8, border: 'none',
                      background: '#1a1a1a', color: '#dffd6e',
                      fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    }}
                  >Edit fields</button>
                  {isCustomized && (
                    <button
                      type="button"
                      onClick={handleResetToDefaults}
                      style={{
                        padding: '6px 14px', borderRadius: 8,
                        background: '#fff', border: '1px solid var(--border)',
                        fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer',
                      }}
                    >Reset to default</button>
                  )}
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || draft.length === 0}
                    style={{
                      padding: '6px 14px', borderRadius: 8, border: 'none',
                      background: '#1a1a1a', color: '#dffd6e',
                      fontSize: 12, fontWeight: 700,
                      cursor: saving || draft.length === 0 ? 'not-allowed' : 'pointer',
                      opacity: saving || draft.length === 0 ? 0.5 : 1,
                    }}
                  >{saving ? 'Saving…' : 'Save fields'}</button>
                  <button
                    type="button"
                    onClick={() => { setEditMode(false); setDraft(initial) }}
                    disabled={saving}
                    style={{
                      padding: '6px 14px', borderRadius: 8,
                      background: '#fff', border: '1px solid var(--border)',
                      fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer',
                    }}
                  >Cancel</button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {!editMode ? (
            // ── PREVIEW MODE ──
            <>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 12 }}>
                What the mechanic sees
              </p>
              {scheme === 'number' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {displayFields.map(f => (
                    <NumberInputPreview key={f.key} label={f.label} placeholder={type === 'tirePsi' ? '32' : '8'} />
                  ))}
                </div>
              )}
              {scheme !== 'number' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {displayFields.map(f => (
                    <PillRowPreview
                      key={f.key}
                      label={f.label}
                      options={scheme === 'pillTri' ? ['OK', 'Topped', 'Issue'] : scheme === 'pillYesNo' ? ['No', 'Yes'] : ['OK', 'Issue']}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            // ── EDIT MODE ──
            <>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 12 }}>
                Fields ({draft.length})
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {draft.map((f, i) => (
                  <div key={f.key} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 10px', borderRadius: 10,
                    background: '#fafaf8', border: '1px solid var(--border)',
                  }}>
                    <input
                      value={f.label}
                      onChange={e => renameField(i, e.target.value)}
                      style={{
                        flex: 1, padding: '6px 10px', borderRadius: 6,
                        border: '1px solid var(--border)', fontSize: 13, background: '#fff', outline: 'none',
                      }}
                    />
                    <div style={{ display: 'flex', gap: 2 }}>
                      <button
                        type="button" onClick={() => moveField(i, -1)} disabled={i === 0}
                        style={{
                          width: 26, height: 26, borderRadius: 6,
                          background: '#fff', border: '1px solid var(--border)',
                          cursor: i === 0 ? 'not-allowed' : 'pointer',
                          opacity: i === 0 ? 0.3 : 1, fontSize: 12,
                        }}
                      >↑</button>
                      <button
                        type="button" onClick={() => moveField(i, 1)} disabled={i === draft.length - 1}
                        style={{
                          width: 26, height: 26, borderRadius: 6,
                          background: '#fff', border: '1px solid var(--border)',
                          cursor: i === draft.length - 1 ? 'not-allowed' : 'pointer',
                          opacity: i === draft.length - 1 ? 0.3 : 1, fontSize: 12,
                        }}
                      >↓</button>
                      <button
                        type="button" onClick={() => removeField(i)}
                        style={{
                          width: 26, height: 26, borderRadius: 6,
                          background: '#fff', border: '1px solid #fecaca', color: '#dc2626',
                          cursor: 'pointer', fontSize: 14, fontWeight: 600,
                        }}
                      >×</button>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{
                marginTop: 14, padding: 12, borderRadius: 10,
                background: '#fff', border: '1px dashed var(--border)',
              }}>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 6 }}>
                  Add Field
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={newLabel}
                    onChange={e => setNewLabel(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addField() } }}
                    placeholder={
                      scheme === 'number'
                        ? (type === 'tirePsi' ? 'e.g. Spare tire' : 'e.g. Parking brake')
                        : type === 'fluids' ? 'e.g. Coolant'
                        : 'e.g. Bouncing'
                    }
                    style={{
                      flex: 1, padding: '8px 12px', borderRadius: 8,
                      border: '1px solid var(--border)', fontSize: 13, background: '#fafaf8', outline: 'none',
                    }}
                  />
                  <button
                    type="button"
                    onClick={addField}
                    disabled={!newLabel.trim()}
                    style={{
                      padding: '8px 14px', borderRadius: 8, border: 'none',
                      background: '#1a1a1a', color: '#dffd6e',
                      fontSize: 12, fontWeight: 700,
                      cursor: newLabel.trim() ? 'pointer' : 'not-allowed',
                      opacity: newLabel.trim() ? 1 : 0.4,
                    }}
                  >+ Add</button>
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.4 }}>
                  Each field uses the same input style as the others in this section.
                  {scheme === 'number' && ' (Number input)'}
                  {scheme === 'pillTri' && ' (OK / Topped / Issue pills)'}
                  {scheme === 'pillBi' && ' (OK / Issue pills)'}
                  {scheme === 'pillYesNo' && ' (No / Yes pills)'}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function NumberInputPreview({ label, placeholder }: { label: string; placeholder: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</label>
      <input
        type="number" disabled placeholder={placeholder}
        style={{
          padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)',
          fontSize: 14, background: '#f9fafb', cursor: 'not-allowed',
        }}
      />
    </div>
  )
}

function PillRowPreview({ label, options }: { label: string; options: string[] }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 13, flex: 1 }}>{label}</span>
      <div style={{ display: 'flex', gap: 4 }}>
        {options.map(opt => {
          const fg = opt === 'OK' || opt === 'No'
            ? 'var(--text-muted)'
            : opt === 'Topped' ? '#2563eb' : '#dc2626'
          return (
            <button
              key={opt}
              disabled
              style={{
                padding: '4px 10px', borderRadius: 6,
                border: '1px solid var(--border)', background: '#fff', color: fg,
                fontSize: 11, fontWeight: 600, cursor: 'not-allowed',
              }}
            >{opt}</button>
          )
        })}
      </div>
    </div>
  )
}
