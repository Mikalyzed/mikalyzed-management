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
  const [tab, setTab] = useState<'recon' | 'sales'>('recon')
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
      <div style={{ marginBottom: '24px' }}>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {[{ key: 'recon' as const, label: 'Recon' }, { key: 'sales' as const, label: 'Sales' }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '8px 20px', borderRadius: 8, border: `1px solid ${tab === t.key ? '#1a1a1a' : 'var(--border)'}`,
            background: tab === t.key ? '#1a1a1a' : '#fff', color: tab === t.key ? '#dffd6e' : 'var(--text-secondary)',
            fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'sales' && <SalesSettings />}

      {tab === 'recon' && <>
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
      </>}
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

// ═══ Sales Settings ═══

type Pipeline = { id: string; name: string; stages: { id: string; name: string; type: string }[] }
type Disposition = {
  id: string; name: string; pipelineId: string | null; moveToStageId: string | null
  followUpMinutes: number | null; color: string | null; isActive: boolean
  pipeline: { id: string; name: string } | null
  moveToStage: { id: string; name: string } | null
}
type LeadSource = { id: string; name: string; key: string; isActive: boolean }
type RRWeight = { userId: string; weight: number; user: { id: string; name: string; role: string } }

function SalesSettings() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [dispositions, setDispositions] = useState<Disposition[]>([])
  const [sources, setSources] = useState<LeadSource[]>([])
  const [loading, setLoading] = useState(true)

  // Round Robin
  const [rrPipelineId, setRrPipelineId] = useState('')
  const [rrWeights, setRrWeights] = useState<RRWeight[]>([])
  const [rrSalesUsers, setRrSalesUsers] = useState<{ id: string; name: string; role: string }[]>([])
  const [rrSaving, setRrSaving] = useState(false)

  // Disposition form
  const [showDispForm, setShowDispForm] = useState(false)
  const [dispName, setDispName] = useState('')
  const [dispPipeline, setDispPipeline] = useState('')
  const [dispMoveStage, setDispMoveStage] = useState('')
  const [dispFollowUp, setDispFollowUp] = useState('')
  const [dispSaving, setDispSaving] = useState(false)

  // Lead Source form
  const [newSourceName, setNewSourceName] = useState('')
  const [sourceSaving, setSourceSaving] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/pipelines').then(r => r.json()),
      fetch('/api/settings/dispositions').then(r => r.json()),
      fetch('/api/settings/lead-sources').then(r => r.json()),
    ]).then(([plData, dispData, srcData]) => {
      const pls = plData.pipelines || plData || []
      setPipelines(pls)
      setDispositions(dispData.dispositions || [])
      setSources(srcData.sources || [])
      if (pls.length > 0) setRrPipelineId(pls[0].id)
      setLoading(false)
    })
  }, [])

  // Load round robin weights when pipeline changes
  useEffect(() => {
    if (!rrPipelineId) return
    fetch(`/api/settings/round-robin?pipelineId=${rrPipelineId}`)
      .then(r => r.json())
      .then(data => {
        setRrWeights(data.weights || [])
        setRrSalesUsers(data.salesUsers || [])
      })
  }, [rrPipelineId])

  async function saveRoundRobin() {
    setRrSaving(true)
    await fetch('/api/settings/round-robin', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pipelineId: rrPipelineId,
        weights: rrWeights.map(w => ({ userId: w.userId, weight: w.weight })),
      }),
    })
    setRrSaving(false)
  }

  function addUserToRR(userId: string) {
    const user = rrSalesUsers.find(u => u.id === userId)
    if (!user || rrWeights.find(w => w.userId === userId)) return
    setRrWeights([...rrWeights, { userId, weight: 1, user }])
  }

  async function addDisposition() {
    if (!dispName.trim()) return
    setDispSaving(true)
    const res = await fetch('/api/settings/dispositions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: dispName, pipelineId: dispPipeline || null,
        moveToStageId: dispMoveStage || null, followUpMinutes: dispFollowUp || null,
      }),
    })
    if (res.ok) {
      const allDisps = await fetch('/api/settings/dispositions').then(r => r.json())
      setDispositions(allDisps.dispositions || [])
      setDispName(''); setDispPipeline(''); setDispMoveStage(''); setDispFollowUp('')
      setShowDispForm(false)
    }
    setDispSaving(false)
  }

  async function deleteDisposition(id: string) {
    if (!confirm('Delete this disposition?')) return
    await fetch('/api/settings/dispositions', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setDispositions(dispositions.filter(d => d.id !== id))
  }

  async function addSource() {
    if (!newSourceName.trim()) return
    setSourceSaving(true)
    const res = await fetch('/api/settings/lead-sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newSourceName }),
    })
    if (res.ok) {
      const allSrc = await fetch('/api/settings/lead-sources').then(r => r.json())
      setSources(allSrc.sources || [])
      setNewSourceName('')
    }
    setSourceSaving(false)
  }

  async function toggleSource(id: string, isActive: boolean) {
    await fetch('/api/settings/lead-sources', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, isActive: !isActive }),
    })
    setSources(sources.map(s => s.id === id ? { ...s, isActive: !isActive } : s))
  }

  async function deleteSource(id: string) {
    if (!confirm('Delete this source?')) return
    await fetch('/api/settings/lead-sources', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setSources(sources.filter(s => s.id !== id))
  }

  if (loading) return <p style={{ color: '#999' }}>Loading sales settings…</p>

  const selectedPipelineStages = pipelines.find(p => p.id === dispPipeline)?.stages || []

  return (
    <div>
      {/* ─── Round Robin ─── */}
      <section style={{ marginBottom: 32 }}>
        <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 16 }}>
          Lead Distribution (Round Robin)
        </p>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ marginBottom: 16 }}>
            <label className="form-label">Pipeline</label>
            <select className="input" value={rrPipelineId} onChange={e => setRrPipelineId(e.target.value)}>
              {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
            Set the weight for each sales rep. A weight of 2 means they get 2 leads for every 1 that someone with weight 1 gets.
          </p>

          {rrWeights.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: 12 }}>
              No weights configured — leads will be distributed equally across all active sales users.
            </p>
          )}

          {rrWeights.map((w, i) => (
            <div key={w.userId} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 500, flex: 1 }}>{w.user.name}</span>
              <input type="number" min={0} max={10} value={w.weight}
                onChange={e => setRrWeights(rrWeights.map((ww, j) => j === i ? { ...ww, weight: parseInt(e.target.value) || 0 } : ww))}
                style={{ width: 60, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 14, textAlign: 'center' }} />
              <button onClick={() => setRrWeights(rrWeights.filter((_, j) => j !== i))}
                style={{ fontSize: 12, color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}>Remove</button>
            </div>
          ))}

          {/* Add user */}
          {rrSalesUsers.filter(u => !rrWeights.find(w => w.userId === u.id)).length > 0 && (
            <select onChange={e => { addUserToRR(e.target.value); e.target.value = '' }} value=""
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, marginTop: 8, color: 'var(--text-muted)' }}>
              <option value="">+ Add sales rep...</option>
              {rrSalesUsers.filter(u => !rrWeights.find(w => w.userId === u.id)).map(u => (
                <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
              ))}
            </select>
          )}

          <div style={{ marginTop: 16 }}>
            <button onClick={saveRoundRobin} disabled={rrSaving}
              className="btn btn-primary" style={{ fontSize: 13, opacity: rrSaving ? 0.6 : 1 }}>
              {rrSaving ? 'Saving...' : 'Save Round Robin'}
            </button>
          </div>
        </div>
      </section>

      {/* ─── Dispositions ─── */}
      <section style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
            Dispositions
          </p>
          <button onClick={() => setShowDispForm(!showDispForm)}
            style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}>
            {showDispForm ? 'Cancel' : '+ Add Disposition'}
          </button>
        </div>

        {showDispForm && (
          <div className="card" style={{ padding: 20, marginBottom: 16, borderColor: '#1a1a1a', borderWidth: 2 }}>
            <div style={{ marginBottom: 12 }}>
              <label className="form-label">Name</label>
              <input className="input" value={dispName} onChange={e => setDispName(e.target.value)}
                placeholder="e.g. No Answer, Left Voicemail, Spoke - Interested" />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label className="form-label">Pipeline <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional — leave blank for all)</span></label>
              <select className="input" value={dispPipeline} onChange={e => { setDispPipeline(e.target.value); setDispMoveStage('') }}>
                <option value="">All Pipelines</option>
                {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label className="form-label">Auto-move to stage <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span></label>
              <select className="input" value={dispMoveStage} onChange={e => setDispMoveStage(e.target.value)} disabled={!dispPipeline}>
                <option value="">No auto-move</option>
                {selectedPipelineStages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {!dispPipeline && <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Select a pipeline first to enable auto-move</p>}
            </div>
            <div style={{ marginBottom: 16 }}>
              <label className="form-label">Auto follow-up after <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(minutes, optional)</span></label>
              <input className="input" type="number" value={dispFollowUp} onChange={e => setDispFollowUp(e.target.value)}
                placeholder="e.g. 120 for 2 hours, 1440 for 1 day" />
            </div>
            <button onClick={addDisposition} disabled={dispSaving || !dispName.trim()}
              className="btn btn-primary" style={{ fontSize: 13, opacity: dispSaving || !dispName.trim() ? 0.5 : 1 }}>
              {dispSaving ? 'Saving...' : 'Add Disposition'}
            </button>
          </div>
        )}

        {dispositions.length === 0 && !showDispForm && (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>No dispositions configured yet.</p>
        )}

        {dispositions.map(d => (
          <div key={d.id} className="card" style={{ padding: '12px 16px', marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600 }}>{d.name}</p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {d.pipeline ? d.pipeline.name : 'All pipelines'}
                  {d.moveToStage ? ` → ${d.moveToStage.name}` : ''}
                  {d.followUpMinutes ? ` · Follow up in ${d.followUpMinutes >= 1440 ? `${Math.round(d.followUpMinutes / 1440)}d` : d.followUpMinutes >= 60 ? `${Math.round(d.followUpMinutes / 60)}h` : `${d.followUpMinutes}m`}` : ''}
                </p>
              </div>
              <button onClick={() => deleteDisposition(d.id)}
                style={{ fontSize: 11, color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}>Delete</button>
            </div>
          </div>
        ))}
      </section>

      {/* ─── Lead Sources ─── */}
      <section style={{ marginBottom: 32 }}>
        <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 16 }}>
          Lead Sources
        </p>

        {sources.map(s => (
          <div key={s.id} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 16px', borderBottom: '1px solid var(--border)',
            opacity: s.isActive ? 1 : 0.5,
          }}>
            <span style={{ fontSize: 14 }}>{s.name}</span>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => toggleSource(s.id, s.isActive)}
                style={{ fontSize: 12, color: s.isActive ? 'var(--text-muted)' : 'var(--success)', background: 'none', border: 'none', cursor: 'pointer' }}>
                {s.isActive ? 'Disable' : 'Enable'}
              </button>
              <button onClick={() => deleteSource(s.id)}
                style={{ fontSize: 12, color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}>Delete</button>
            </div>
          </div>
        ))}

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <input className="input" value={newSourceName} onChange={e => setNewSourceName(e.target.value)}
            placeholder="New source name..." style={{ flex: 1 }}
            onKeyDown={e => e.key === 'Enter' && addSource()} />
          <button onClick={addSource} disabled={sourceSaving || !newSourceName.trim()}
            className="btn btn-primary" style={{ fontSize: 13, opacity: sourceSaving || !newSourceName.trim() ? 0.5 : 1 }}>
            Add
          </button>
        </div>
      </section>
    </div>
  )
}
