'use client'

import { useEffect, useState } from 'react'
import RichTypePreview from './RichTypePreview'

type Field = { key: string; label: string }
type Item = { item: string; type?: string; done?: boolean; note?: string; fields?: Field[] }
type Template = {
  id: string
  stage: string
  name: string
  items: Item[]
  isDefault: boolean
  isActive: boolean
  sortOrder: number
}

const RICH_TYPES = [
  { value: '', label: 'Plain checkbox' },
  { value: 'tirePsi', label: 'Tire Pressure (FL/FR/RL/RR)' },
  { value: 'brakePads', label: 'Brake Pad Thickness (Front/Rear mm)' },
  { value: 'fluids', label: 'Fluids (OK/Topped/Issue × 5)' },
  { value: 'engineCheck', label: 'Engine Components' },
  { value: 'electrical', label: 'Electrical Systems' },
  { value: 'steeringCheck', label: 'Steering Check' },
  { value: 'suspensionCheck', label: 'Suspension Check' },
]

const RICH_TYPE_SHORT: Record<string, string> = {
  tirePsi: 'Tire PSI',
  brakePads: 'Brake mm',
  fluids: 'Fluids',
  engineCheck: 'Engine',
  electrical: 'Electrical',
  steeringCheck: 'Steering',
  suspensionCheck: 'Suspension',
}

export default function StageTemplatesInline({ stage }: { stage: string }) {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [newItemText, setNewItemText] = useState<Record<string, string>>({})
  const [newItemType, setNewItemType] = useState<Record<string, string>>({})
  const [showTypePicker, setShowTypePicker] = useState<Record<string, boolean>>({})
  const [addingTemplate, setAddingTemplate] = useState(false)
  const [newTemplateName, setNewTemplateName] = useState('')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [preview, setPreview] = useState<{ templateId: string; itemIndex: number; type: string; label: string; fields?: Field[] } | null>(null)

  async function saveFieldsForItem(templateId: string, itemIndex: number, fields: Field[]) {
    const tpl = templates.find(t => t.id === templateId)
    if (!tpl) return
    const newItems = tpl.items.map((it, i) => {
      if (i !== itemIndex) return it
      // Empty array means "reset to defaults" — strip the fields key
      if (fields.length === 0) {
        const { fields: _drop, ...rest } = it
        void _drop
        return rest
      }
      return { ...it, fields }
    })
    await fetch(`/api/checklist-templates/${templateId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: newItems }),
    })
    load()
    // Update the open preview so the "Customized" badge appears immediately
    setPreview(prev => prev && prev.templateId === templateId && prev.itemIndex === itemIndex
      ? { ...prev, fields: fields.length > 0 ? fields : undefined }
      : prev,
    )
  }

  function toggleExpand(id: string) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }

  function load() {
    setLoading(true)
    fetch(`/api/checklist-templates?stage=${stage}`)
      .then(async r => {
        if (!r.ok) return { templates: [] }
        const text = await r.text()
        if (!text) return { templates: [] }
        try { return JSON.parse(text) } catch { return { templates: [] } }
      })
      .then(d => setTemplates(d.templates || []))
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [stage])

  async function addItem(tpl: Template) {
    const text = (newItemText[tpl.id] || '').trim()
    if (!text) return
    const type = newItemType[tpl.id] || undefined
    const items = [...tpl.items, { item: text, ...(type ? { type } : {}) }]
    await fetch(`/api/checklist-templates/${tpl.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    })
    setNewItemText(prev => ({ ...prev, [tpl.id]: '' }))
    setNewItemType(prev => ({ ...prev, [tpl.id]: '' }))
    setShowTypePicker(prev => ({ ...prev, [tpl.id]: false }))
    load()
  }

  async function removeItem(tpl: Template, idx: number) {
    const items = tpl.items.filter((_, i) => i !== idx)
    await fetch(`/api/checklist-templates/${tpl.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    })
    load()
  }

  async function deleteTemplate(tpl: Template) {
    if (!confirm(`Delete the "${tpl.name}" checklist? This can't be undone.`)) return
    await fetch(`/api/checklist-templates/${tpl.id}`, { method: 'DELETE' })
    load()
  }

  async function renameTemplate(tpl: Template) {
    const name = prompt('Rename checklist', tpl.name)?.trim()
    if (!name || name === tpl.name) return
    await fetch(`/api/checklist-templates/${tpl.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    load()
  }

  async function createTemplate() {
    const name = newTemplateName.trim()
    if (!name) return
    const res = await fetch('/api/checklist-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage, name, items: [] }),
    })
    if (res.ok) {
      setNewTemplateName('')
      setAddingTemplate(false)
      load()
    }
  }

  if (loading) {
    return <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading checklists…</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {templates.length === 0 && !addingTemplate && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px 0' }}>
          No checklists yet. Click "+ Add Checklist" below.
        </p>
      )}

      {templates.map(tpl => {
        const isOpen = !!expanded[tpl.id]
        const richCount = tpl.items.filter(i => i.type).length
        return (
          <div
            key={tpl.id}
            style={{
              border: '1px solid var(--border)',
              borderRadius: 14,
              overflow: 'hidden',
              background: '#fff',
              boxShadow: isOpen ? '0 1px 3px rgba(0,0,0,0.04)' : 'none',
              transition: 'box-shadow 0.15s',
            }}
          >
            {/* Header */}
            <div
              onClick={() => toggleExpand(tpl.id)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 16px', cursor: 'pointer',
                background: isOpen ? 'linear-gradient(to bottom, #fafaf8, #ffffff)' : '#fff',
                borderBottom: isOpen ? '1px solid var(--border)' : 'none',
                transition: 'background 0.15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 22, height: 22, borderRadius: 6,
                  background: isOpen ? '#1a1a1a' : '#f3f4f6',
                  color: isOpen ? '#dffd6e' : 'var(--text-muted)',
                  fontSize: 10, fontWeight: 700,
                  transition: 'transform 0.2s, background 0.15s',
                  transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                }}>▶</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                    {tpl.name}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {tpl.items.length} item{tpl.items.length === 1 ? '' : 's'}
                    {richCount > 0 && ` · ${richCount} structured`}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => renameTemplate(tpl)}
                  style={{
                    padding: '6px 10px', borderRadius: 8,
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600,
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#f3f4f6' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >Rename</button>
                <button
                  type="button"
                  onClick={() => deleteTemplate(tpl)}
                  style={{
                    padding: '6px 10px', borderRadius: 8,
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    fontSize: 12, color: 'var(--danger)', fontWeight: 600,
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#fef2f2' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >Delete</button>
              </div>
            </div>

            {/* Expanded body */}
            {isOpen && (
              <div style={{ padding: '16px', background: '#fff' }}>
                {/* Items */}
                {tpl.items.length === 0 ? (
                  <div style={{
                    padding: '20px', textAlign: 'center',
                    background: '#fafaf8', borderRadius: 10, marginBottom: 12,
                    fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic',
                  }}>
                    No items yet — add your first one below
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                    {tpl.items.map((it, i) => {
                      const clickable = !!it.type
                      return (
                        <div
                          key={i}
                          className="group tpl-item"
                          onClick={() => clickable && setPreview({ templateId: tpl.id, itemIndex: i, type: it.type!, label: it.item, fields: it.fields })}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '10px 12px', borderRadius: 10,
                            background: clickable ? '#fafaf8' : '#fff',
                            border: '1px solid',
                            borderColor: clickable ? '#f0ead6' : 'var(--border)',
                            cursor: clickable ? 'pointer' : 'default',
                            transition: 'all 0.15s ease',
                          }}
                          onMouseEnter={e => {
                            if (clickable) {
                              e.currentTarget.style.borderColor = '#1a1a1a'
                              e.currentTarget.style.transform = 'translateY(-1px)'
                              e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)'
                            }
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.borderColor = clickable ? '#f0ead6' : 'var(--border)'
                            e.currentTarget.style.transform = ''
                            e.currentTarget.style.boxShadow = ''
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                              {it.item}
                            </span>
                            {it.type && (
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                fontSize: 9, fontWeight: 700, padding: '3px 7px', borderRadius: 999,
                                background: '#1a1a1a', color: '#dffd6e',
                                textTransform: 'uppercase', letterSpacing: '0.05em',
                              }}>
                                <span>✦</span>
                                {RICH_TYPE_SHORT[it.type] || it.type}
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {clickable && (
                              <span
                                className="opacity-0 group-hover:opacity-100"
                                style={{
                                  fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
                                  transition: 'opacity 0.15s',
                                }}
                              >Preview →</span>
                            )}
                            <button
                              type="button"
                              onClick={e => { e.stopPropagation(); removeItem(tpl, i) }}
                              className="opacity-0 group-hover:opacity-100"
                              style={{
                                width: 24, height: 24, borderRadius: 6,
                                background: '#fff', border: '1px solid #fecaca',
                                color: '#dc2626', cursor: 'pointer',
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 14, lineHeight: 1, fontWeight: 600,
                                transition: 'opacity 0.15s',
                              }}
                              title="Remove item"
                            >×</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Add item area */}
                <div style={{
                  padding: 12, borderRadius: 10,
                  background: '#fafaf8', border: '1px dashed var(--border)',
                }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="text"
                      placeholder="Add a new item…"
                      style={{
                        flex: 1, padding: '8px 12px', borderRadius: 8,
                        border: '1px solid var(--border)', fontSize: 13,
                        background: '#fff', outline: 'none',
                      }}
                      value={newItemText[tpl.id] || ''}
                      onChange={e => setNewItemText(prev => ({ ...prev, [tpl.id]: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem(tpl) } }}
                    />
                    <button
                      type="button"
                      onClick={() => addItem(tpl)}
                      disabled={!(newItemText[tpl.id] || '').trim()}
                      style={{
                        padding: '8px 16px', borderRadius: 8, border: 'none',
                        background: '#1a1a1a', color: '#dffd6e',
                        fontSize: 13, fontWeight: 700,
                        cursor: (newItemText[tpl.id] || '').trim() ? 'pointer' : 'not-allowed',
                        opacity: (newItemText[tpl.id] || '').trim() ? 1 : 0.4,
                        whiteSpace: 'nowrap',
                      }}
                    >Add</button>
                  </div>

                  {!showTypePicker[tpl.id] ? (
                    <button
                      type="button"
                      onClick={() => setShowTypePicker(prev => ({ ...prev, [tpl.id]: true }))}
                      style={{
                        marginTop: 8, fontSize: 11, fontWeight: 600,
                        color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer',
                        padding: 0, display: 'inline-flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      <span>✦</span> Use structured input
                    </button>
                  ) : (
                    <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: '#fff', border: '1px solid var(--border)' }}>
                      <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 6 }}>
                        Structured input type
                      </p>
                      <select
                        value={newItemType[tpl.id] || ''}
                        onChange={e => setNewItemType(prev => ({ ...prev, [tpl.id]: e.target.value }))}
                        style={{
                          width: '100%', padding: '7px 10px', borderRadius: 6,
                          border: '1px solid var(--border)', fontSize: 12, background: '#fff', outline: 'none',
                        }}
                      >
                        {RICH_TYPES.map(t => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.4 }}>
                        Type the item name above and click Add — it'll get this structured input on the mechanic page.
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowTypePicker(prev => ({ ...prev, [tpl.id]: false }))}
                        style={{
                          marginTop: 6, fontSize: 11, fontWeight: 600,
                          color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                        }}
                      >Cancel</button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}

      {preview && (
        <RichTypePreview
          type={preview.type}
          itemLabel={preview.label}
          fields={preview.fields}
          onSave={(fields) => saveFieldsForItem(preview.templateId, preview.itemIndex, fields)}
          onClose={() => setPreview(null)}
        />
      )}

      {/* Add new template */}
      {addingTemplate ? (
        <div style={{
          padding: 14, borderRadius: 12,
          background: '#fafaf8', border: '1px dashed var(--border)',
        }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 8 }}>
            New Checklist
          </p>
          <input
            type="text"
            placeholder="e.g. Sold Vehicle Inspection"
            value={newTemplateName}
            onChange={e => setNewTemplateName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); createTemplate() } }}
            autoFocus
            style={{
              width: '100%', padding: '9px 12px', borderRadius: 8,
              border: '1px solid var(--border)', fontSize: 13,
              background: '#fff', outline: 'none', marginBottom: 8,
            }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={createTemplate}
              disabled={!newTemplateName.trim()}
              style={{
                padding: '8px 16px', borderRadius: 8, border: 'none',
                background: '#1a1a1a', color: '#dffd6e',
                fontSize: 13, fontWeight: 700,
                cursor: newTemplateName.trim() ? 'pointer' : 'not-allowed',
                opacity: newTemplateName.trim() ? 1 : 0.4,
              }}
            >Create</button>
            <button
              type="button"
              onClick={() => { setAddingTemplate(false); setNewTemplateName('') }}
              style={{
                padding: '8px 14px', borderRadius: 8,
                background: '#fff', border: '1px solid var(--border)',
                fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer',
              }}
            >Cancel</button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAddingTemplate(true)}
          style={{
            padding: '12px 14px', borderRadius: 12,
            background: '#fff', border: '1px dashed var(--border)', cursor: 'pointer',
            fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)',
            textAlign: 'left',
            display: 'flex', alignItems: 'center', gap: 8,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = '#fafaf8'
            e.currentTarget.style.borderColor = '#1a1a1a'
            e.currentTarget.style.color = 'var(--text-primary)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = '#fff'
            e.currentTarget.style.borderColor = 'var(--border)'
            e.currentTarget.style.color = 'var(--text-secondary)'
          }}
        >
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 20, height: 20, borderRadius: 6, background: '#f3f4f6',
            fontSize: 13, fontWeight: 700,
          }}>+</span>
          Add Checklist
        </button>
      )}
    </div>
  )
}
