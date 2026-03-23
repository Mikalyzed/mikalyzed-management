'use client'

import { useEffect, useState } from 'react'
import { STAGE_LABELS } from '@/lib/constants'
import type { Stage } from '@/lib/constants'

type StageConfig = {
  stage: Stage
  defaultAssigneeId: string | null
  defaultChecklist: string[]
}

type User = { id: string; name: string; role: string }

const STAGE_ROLE_MAP: Record<string, string[]> = {
  mechanic: ['mechanic'],
  detailing: ['detailer'],
  content: ['content'],
  publish: ['admin', 'content'],
}

export default function SettingsPage() {
  const [stages, setStages] = useState<StageConfig[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [emailNotifications, setEmailNotifications] = useState(true)
  const [newItems, setNewItems] = useState<Record<string, string>>({})

  useEffect(() => {
    Promise.all([
      fetch('/api/settings/stages').then((r) => r.json()),
      fetch('/api/users').then((r) => r.json()),
    ]).then(([stageData, userData]) => {
      if (stageData.error) {
        setMessage('Access denied — admin only')
        setLoading(false)
        return
      }
      setStages(stageData.stages)
      setUsers(userData.users || [])
      setLoading(false)
    })
  }, [])

  const getUsersForStage = (stage: string) => {
    const roles = STAGE_ROLE_MAP[stage] || []
    const filtered = users.filter((u) => roles.includes(u.role))
    return filtered.length > 0 ? filtered : users
  }

  const updateStage = (idx: number, field: string, value: unknown) => {
    setStages((prev) => prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)))
  }

  const removeChecklistItem = (stageIdx: number, itemIdx: number) => {
    setStages((prev) =>
      prev.map((s, i) =>
        i === stageIdx ? { ...s, defaultChecklist: s.defaultChecklist.filter((_, j) => j !== itemIdx) } : s
      )
    )
  }

  const addChecklistItem = (stageIdx: number) => {
    const stage = stages[stageIdx].stage
    const text = (newItems[stage] || '').trim()
    if (!text) return
    setStages((prev) =>
      prev.map((s, i) =>
        i === stageIdx ? { ...s, defaultChecklist: [...s.defaultChecklist, text] } : s
      )
    )
    setNewItems((prev) => ({ ...prev, [stage]: '' }))
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage('')
    try {
      const res = await fetch('/api/settings/stages', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stages }),
      })
      if (res.ok) setMessage('Settings saved successfully!')
      else setMessage('Failed to save settings')
    } catch {
      setMessage('Error saving settings')
    }
    setSaving(false)
    setTimeout(() => setMessage(''), 3000)
  }

  if (loading) {
    return (
      <div className="p-6 md:p-10">
        <p style={{ color: '#999' }}>Loading settings…</p>
      </div>
    )
  }

  if (!stages.length) {
    return (
      <div className="p-6 md:p-10">
        <p style={{ color: '#e55' }}>{message || 'Unable to load settings'}</p>
      </div>
    )
  }

  return (
    <div>
      <div style={{ marginBottom: '32px' }}>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)', marginTop: '4px' }}>
          Configure stages, notifications, and defaults
        </p>
      </div>

      {/* Stage Configuration */}
      <section style={{ marginBottom: '32px' }}>
        <p style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '16px' }}>
          Stage Configuration
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: '16px' }}>
          {stages.map((stage, idx) => (
            <div key={stage.stage} className="card">
              <h3 className="font-semibold" style={{ marginBottom: '16px' }}>
                {STAGE_LABELS[stage.stage]}
              </h3>

              {/* Default Assignee */}
              <label className="form-label">Default Assignee</label>
              <select
                className="input"
                style={{ marginBottom: '16px' }}
                value={stage.defaultAssigneeId || ''}
                onChange={(e) => updateStage(idx, 'defaultAssigneeId', e.target.value || null)}
              >
                <option value="">None</option>
                {getUsersForStage(stage.stage).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role})
                  </option>
                ))}
              </select>

              {/* Checklist */}
              <label className="form-label" style={{ marginBottom: '8px' }}>Default Checklist</label>
              <div style={{ marginBottom: '12px' }}>
                {stage.defaultChecklist.map((item, itemIdx) => (
                  <div
                    key={itemIdx}
                    className="flex items-center justify-between group"
                    style={{
                      padding: '10px 12px',
                      borderBottom: '1px solid var(--border)',
                      ...(itemIdx === 0 ? { borderTop: '1px solid var(--border)' } : {}),
                    }}
                  >
                    <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{item}</span>
                    <button
                      type="button"
                      onClick={() => removeChecklistItem(idx, itemIdx)}
                      className="text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ color: 'var(--danger)', minHeight: 'auto' }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="New item..."
                  className="input"
                  style={{ flex: 1 }}
                  value={newItems[stage.stage] || ''}
                  onChange={(e) => setNewItems((prev) => ({ ...prev, [stage.stage]: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && addChecklistItem(idx)}
                />
                <button
                  type="button"
                  onClick={() => addChecklistItem(idx)}
                  className="btn btn-secondary"
                  style={{ whiteSpace: 'nowrap' }}
                >
                  Add
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Notification Preferences */}
      <section style={{ marginBottom: '32px' }}>
        <p style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '16px' }}>
          Notifications
        </p>
        <div className="card">
          <div className="flex items-center justify-between" style={{ marginBottom: '16px' }}>
            <div>
              <p className="text-sm font-medium">Email Notifications</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)', marginTop: '2px' }}>Send email alerts when stages advance or vehicles are assigned</p>
            </div>
            <button
              type="button"
              onClick={() => setEmailNotifications(!emailNotifications)}
              className="rounded-full relative transition-colors"
              style={{ width: '48px', height: '28px', background: emailNotifications ? '#dffd6e' : 'var(--border)', flexShrink: 0, minHeight: 'auto', border: 'none' }}
            >
              <span
                className="absolute rounded-full bg-white shadow transition-transform"
                style={{ width: '24px', height: '24px', top: '2px', left: emailNotifications ? '22px' : '2px' }}
              />
            </button>
          </div>
          <div style={{ paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
            <label className="form-label">From Address</label>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>management@mikalyzedautoboutique.com</p>
          </div>
        </div>
      </section>

      {/* General */}
      <section style={{ marginBottom: '32px' }}>
        <p style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '16px' }}>
          General
        </p>
        <div className="card">
          <p className="text-sm font-medium">App Password</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)', marginTop: '4px' }}>Set via environment variable</p>
        </div>
      </section>

      {/* Save */}
      <div className="flex items-center gap-4" style={{ marginBottom: 40 }}>
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn btn-primary"
          style={{ opacity: saving ? 0.6 : 1 }}
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
        {message && (
          <p className="text-sm font-medium" style={{ color: message.includes('success') ? 'var(--success)' : 'var(--danger)' }}>
            {message}
          </p>
        )}
      </div>

      {/* Work Scopes */}
      <WorkScopeManager />
    </div>
  )
}

function WorkScopeManager() {
  type Template = { id: string; stage: string; name: string; checklist: { item: string }[]; isActive: boolean }
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [addingStage, setAddingStage] = useState('')
  const [newName, setNewName] = useState('')
  const [newChecklist, setNewChecklist] = useState('')

  const STAGES = ['mechanic', 'detailing', 'content', 'publish'] as const

  function load() {
    fetch('/api/stage-templates').then(r => r.json()).then(d => { setTemplates(d); setLoading(false) })
  }
  useEffect(() => { load() }, [])

  async function addTemplate() {
    if (!addingStage || !newName.trim()) return
    const items = newChecklist.split('\n').filter(l => l.trim()).map(l => ({ item: l.trim(), done: false, note: '' }))
    await fetch('/api/stage-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: addingStage, name: newName, checklist: items }),
    })
    setNewName('')
    setNewChecklist('')
    setAddingStage('')
    load()
  }

  async function deleteTemplate(id: string) {
    if (!confirm('Delete this scope?')) return
    await fetch(`/api/stage-templates/${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <section style={{ marginBottom: 32 }}>
      <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 16 }}>
        Work Scopes
      </p>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
        Define work scope templates per stage. When advancing a vehicle, you can pick a scope to set the right checklist.
      </p>

      {loading ? <p style={{ color: 'var(--text-muted)' }}>Loading...</p> : (
        <>
          {STAGES.map(stage => {
            const stageTemplates = templates.filter(t => t.stage === stage)
            return (
              <div key={stage} style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, textTransform: 'capitalize' }}>
                    {STAGE_LABELS[stage as Stage] || stage}
                  </p>
                  <button onClick={() => setAddingStage(addingStage === stage ? '' : stage)} style={{
                    fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer',
                  }}>
                    {addingStage === stage ? 'Cancel' : '+ Add Scope'}
                  </button>
                </div>

                {stageTemplates.length === 0 && addingStage !== stage && (
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>No scopes defined — default checklist will be used.</p>
                )}

                {stageTemplates.map(t => (
                  <div key={t.id} className="card" style={{ padding: '12px 16px', marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <p style={{ fontSize: 14, fontWeight: 600 }}>{t.name}</p>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                          {t.checklist.map(c => c.item).join(' · ')}
                        </p>
                      </div>
                      <button onClick={() => deleteTemplate(t.id)} style={{
                        fontSize: 11, color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer',
                      }}>Delete</button>
                    </div>
                  </div>
                ))}

                {addingStage === stage && (
                  <div className="card" style={{ padding: 16, marginBottom: 8, borderColor: '#1a1a1a', borderWidth: 2 }}>
                    <div style={{ marginBottom: 12 }}>
                      <label className="form-label">Scope Name</label>
                      <input className="input" value={newName} onChange={e => setNewName(e.target.value)}
                        placeholder={`e.g. ${stage === 'detailing' ? 'Wet Sand & Buff' : stage === 'mechanic' ? 'Full Service' : 'Standard'}`} />
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <label className="form-label">Checklist Items (one per line)</label>
                      <textarea className="input" value={newChecklist} onChange={e => setNewChecklist(e.target.value)} rows={4}
                        placeholder={`e.g.\nWet sand panels\nBuff compound\nPolish\nFinal wipe`} style={{ resize: 'vertical' }} />
                    </div>
                    <button onClick={addTemplate} className="btn btn-primary" style={{ fontSize: 13 }}>Save Scope</button>
                  </div>
                )}
              </div>
            )
          })}
        </>
      )}
    </section>
  )
}
