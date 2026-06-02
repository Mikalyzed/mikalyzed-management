'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { STAGE_LABELS } from '@/lib/constants'
import type { Stage } from '@/lib/constants'
import StageTemplatesInline from '@/components/StageTemplatesInline'

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
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {[{ key: 'recon' as const, label: 'Recon' }, { key: 'sales' as const, label: 'Sales' }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '8px 20px', borderRadius: 8, border: `1px solid ${tab === t.key ? '#1a1a1a' : 'var(--border)'}`,
            background: tab === t.key ? '#1a1a1a' : '#fff', color: tab === t.key ? '#dffd6e' : 'var(--text-secondary)',
            fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>{t.label}</button>
        ))}
        <Link href="/settings/integrations" style={{
          padding: '8px 20px', borderRadius: 8, border: '1px solid var(--border)',
          background: '#fff', color: 'var(--text-secondary)',
          fontSize: 14, fontWeight: 600, cursor: 'pointer',
          textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
          </svg>
          Integrations
        </Link>
      </div>

      {tab === 'sales' && <SalesSettings />}

      {tab === 'recon' && <>
      <div className="settings-recon-layout" style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 28, alignItems: 'start' }}>
        {/* Sticky sidebar nav */}
        <aside className="settings-sidebar" style={{ position: 'sticky', top: 84, alignSelf: 'start' }}>
          <p style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 10, paddingLeft: 12 }}>
            Stages
          </p>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 24 }}>
            {stages.map(s => (
              <a key={s.stage} href={`#stage-${s.stage}`} onClick={(e) => {
                e.preventDefault()
                document.getElementById(`stage-${s.stage}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }} style={{
                padding: '8px 12px', borderRadius: 8,
                fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)',
                textDecoration: 'none', cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
                onMouseEnter={e => { e.currentTarget.style.background = '#fafaf8'; e.currentTarget.style.color = 'var(--text-primary)' }}
                onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-secondary)' }}
              >
                {STAGE_LABELS[s.stage]}
              </a>
            ))}
          </nav>
          <p style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 10, paddingLeft: 12 }}>
            Other
          </p>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {[
              { id: 'notifications', label: 'Notifications' },
              { id: 'general', label: 'General' },
            ].map(s => (
              <a key={s.id} href={`#${s.id}`} onClick={(e) => {
                e.preventDefault()
                document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }} style={{
                padding: '8px 12px', borderRadius: 8,
                fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)',
                textDecoration: 'none', cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
                onMouseEnter={e => { e.currentTarget.style.background = '#fafaf8'; e.currentTarget.style.color = 'var(--text-primary)' }}
                onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-secondary)' }}
              >
                {s.label}
              </a>
            ))}
          </nav>
        </aside>

        {/* Main column */}
        <div>
      {/* Stage Configuration */}
      <section style={{ marginBottom: '32px' }}>
        <p style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '16px' }}>
          Stage Configuration
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {stages.map((stage, idx) => (
            <div key={stage.stage} id={`stage-${stage.stage}`} className="card" style={{ scrollMarginTop: 84 }}>
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

              {/* All stages use the same collapsible templates UI */}
              <StageTemplatesInline stage={stage.stage} />
            </div>
          ))}
        </div>
      </section>

      {/* Notification Preferences */}
      <section id="notifications" style={{ marginBottom: '32px', scrollMarginTop: 84 }}>
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
      <section id="general" style={{ marginBottom: '32px', scrollMarginTop: 84 }}>
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

        </div>
      </div>
      </>}
    </div>
  )
}

// Deprecated WorkScopeManager removed — superseded by ChecklistTemplate system.

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
type DispositionRule = {
  id: string
  pipelineId: string
  dispositionId: string
  currentStageId: string | null
  moveToStageId: string
  enabled: boolean
  description: string | null
  sortOrder: number
  pipeline: { id: string; name: string; color: string }
  disposition: { id: string; name: string }
  currentStage: { id: string; name: string; type: string } | null
  moveToStage: { id: string; name: string; type: string }
}

type SalesSubTab = 'dispositions' | 'logic' | 'distribution' | 'sources' | 'email'

function SalesSettings() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [dispositions, setDispositions] = useState<Disposition[]>([])
  const [sources, setSources] = useState<LeadSource[]>([])
  const [loading, setLoading] = useState(true)
  const [subTab, setSubTab] = useState<SalesSubTab>('dispositions')

  // Round Robin
  const [rrPipelineId, setRrPipelineId] = useState('')
  const [rrWeights, setRrWeights] = useState<RRWeight[]>([])
  const [rrSalesUsers, setRrSalesUsers] = useState<{ id: string; name: string; role: string }[]>([])
  const [rrSaving, setRrSaving] = useState(false)

  // Disposition form
  const [showDispForm, setShowDispForm] = useState(false)
  const [dispName, setDispName] = useState('')
  const [dispPipeline, setDispPipeline] = useState('')
  const [dispFollowUp, setDispFollowUp] = useState('')
  const [dispSaving, setDispSaving] = useState(false)

  // Disposition Stage Rules
  const [rules, setRules] = useState<DispositionRule[]>([])
  const [rulesPipelineId, setRulesPipelineId] = useState('')
  const [showRuleForm, setShowRuleForm] = useState(false)
  const [ruleDisp, setRuleDisp] = useState('')
  const [ruleCurrentStage, setRuleCurrentStage] = useState('') // '' = wildcard
  const [ruleMoveTo, setRuleMoveTo] = useState('')
  const [ruleDescription, setRuleDescription] = useState('')
  const [ruleSaving, setRuleSaving] = useState(false)
  const [ruleError, setRuleError] = useState('')

  // Lead Source form
  const [newSourceName, setNewSourceName] = useState('')
  const [sourceSaving, setSourceSaving] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/pipelines').then(r => r.json()),
      fetch('/api/settings/dispositions').then(r => r.json()),
      fetch('/api/settings/lead-sources').then(r => r.json()),
      fetch('/api/settings/disposition-rules').then(r => r.json()),
    ]).then(([plData, dispData, srcData, rulesData]) => {
      const pls = plData.pipelines || plData || []
      setPipelines(pls)
      setDispositions(dispData.dispositions || [])
      setSources(srcData.sources || [])
      setRules(rulesData.rules || [])
      if (pls.length > 0) {
        setRrPipelineId(pls[0].id)
        setRulesPipelineId(pls[0].id)
      }
      setLoading(false)
    })
  }, [])

  async function reloadRules() {
    const data = await fetch('/api/settings/disposition-rules').then(r => r.json())
    setRules(data.rules || [])
  }

  async function addRule() {
    setRuleError('')
    if (!rulesPipelineId || !ruleDisp || !ruleMoveTo) {
      setRuleError('Pipeline, disposition, and target stage are required')
      return
    }
    setRuleSaving(true)
    const res = await fetch('/api/settings/disposition-rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pipelineId: rulesPipelineId,
        dispositionId: ruleDisp,
        currentStageId: ruleCurrentStage || null,
        moveToStageId: ruleMoveTo,
        description: ruleDescription || null,
      }),
    })
    if (res.ok) {
      await reloadRules()
      setRuleDisp(''); setRuleCurrentStage(''); setRuleMoveTo(''); setRuleDescription('')
      setShowRuleForm(false)
    } else {
      const err = await res.json().catch(() => ({}))
      setRuleError(err.error || 'Failed to save rule')
    }
    setRuleSaving(false)
  }

  async function toggleRule(ruleId: string, enabled: boolean) {
    await fetch(`/api/settings/disposition-rules/${ruleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    })
    setRules(rules.map(r => r.id === ruleId ? { ...r, enabled } : r))
  }

  async function deleteRule(ruleId: string) {
    if (!confirm('Delete this rule?')) return
    await fetch(`/api/settings/disposition-rules/${ruleId}`, { method: 'DELETE' })
    setRules(rules.filter(r => r.id !== ruleId))
  }

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
        followUpMinutes: dispFollowUp || null,
      }),
    })
    if (res.ok) {
      const allDisps = await fetch('/api/settings/dispositions').then(r => r.json())
      setDispositions(allDisps.dispositions || [])
      setDispName(''); setDispPipeline(''); setDispFollowUp('')
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

  const rulesCurrentPipeline = pipelines.find(p => p.id === rulesPipelineId)
  const rulesPipelineStages = rulesCurrentPipeline?.stages || []
  const rulesPipelineDispositions = dispositions.filter(d => !d.pipelineId || d.pipelineId === rulesPipelineId)
  const filteredRules = rules.filter(r => r.pipelineId === rulesPipelineId)

  const subTabs: { key: SalesSubTab; label: string; sublabel: string }[] = [
    { key: 'dispositions', label: 'Dispositions', sublabel: 'Outcomes reps can log' },
    { key: 'logic', label: 'Stage Logic', sublabel: 'Auto-move rules' },
    { key: 'distribution', label: 'Lead Distribution', sublabel: 'Round-robin weights' },
    { key: 'sources', label: 'Lead Sources', sublabel: 'Where leads come from' },
    { key: 'email', label: 'Email Mirror', sublabel: 'Sync Outlook to CRM' },
  ]

  return (
    <div>
      {/* Sub-tab nav */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 28, flexWrap: 'wrap' }}>
        {subTabs.map(t => {
          const active = subTab === t.key
          return (
            <button key={t.key} onClick={() => setSubTab(t.key)}
              style={{
                padding: '10px 16px', borderRadius: 12,
                border: active ? '1px solid #1a1a1a' : '1px solid var(--border)',
                background: active ? '#1a1a1a' : '#fff',
                color: active ? '#dffd6e' : 'var(--text-primary)',
                cursor: 'pointer', textAlign: 'left', minWidth: 160,
              }}>
              <p style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>{t.label}</p>
              <p style={{ fontSize: 11, fontWeight: 400, margin: '2px 0 0', color: active ? '#9ca39e' : 'var(--text-muted)' }}>{t.sublabel}</p>
            </button>
          )
        })}
      </div>

      {/* ─── Tab: Dispositions ─── */}
      {subTab === 'dispositions' && (
        <section>
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em', marginBottom: 4 }}>Dispositions</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              The outcomes a rep can log when they touch a lead. Examples: <em>No Answer, Left Voicemail, Interested, Appointment Set</em>. Set up the outcomes here, then go to <strong>Stage Logic</strong> to decide if any of these should move the lead between stages.
            </p>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button onClick={() => setShowDispForm(!showDispForm)}
              className="btn btn-primary" style={{ fontSize: 13 }}>
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
                <select className="input" value={dispPipeline} onChange={e => setDispPipeline(e.target.value)}>
                  <option value="">All Pipelines</option>
                  {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
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
            <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
              <p style={{ fontSize: 14, fontStyle: 'italic' }}>No dispositions yet. Add one to get started.</p>
            </div>
          )}

          {dispositions.length > 0 && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              {dispositions.map((d, i) => (
                <div key={d.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '14px 18px',
                  borderBottom: i < dispositions.length - 1 ? '1px solid var(--border)' : 'none',
                  background: '#fff',
                }}>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 600 }}>{d.name}</p>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                      {d.pipeline ? d.pipeline.name : 'All pipelines'}
                      {d.followUpMinutes ? ` · Follow up in ${d.followUpMinutes >= 1440 ? `${Math.round(d.followUpMinutes / 1440)}d` : d.followUpMinutes >= 60 ? `${Math.round(d.followUpMinutes / 60)}h` : `${d.followUpMinutes}m`}` : ''}
                    </p>
                  </div>
                  <button onClick={() => deleteDisposition(d.id)}
                    style={{ fontSize: 12, color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}>Delete</button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ─── Tab: Stage Logic ─── */}
      {subTab === 'logic' && (
        <section>
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em', marginBottom: 4 }}>Stage Logic</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              When a rep logs a disposition on a lead, you can have it automatically move the lead to a different stage. Each rule reads like:
              <em> &ldquo;When <strong>X disposition</strong> is logged on a lead in <strong>Y stage</strong>, move it to <strong>Z stage</strong>.&rdquo;</em>
            </p>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ flex: 1, maxWidth: 280 }}>
              <label className="form-label" style={{ marginBottom: 4 }}>Pipeline</label>
              <select className="input" value={rulesPipelineId} onChange={e => setRulesPipelineId(e.target.value)}>
                {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <button onClick={() => { setShowRuleForm(!showRuleForm); setRuleError('') }}
              className="btn btn-primary" style={{ fontSize: 13 }}>
              {showRuleForm ? 'Cancel' : '+ Add Rule'}
            </button>
          </div>

          {showRuleForm && (
            <div className="card" style={{ padding: 20, marginBottom: 16, borderColor: '#1a1a1a', borderWidth: 2 }}>
              <div style={{ marginBottom: 12 }}>
                <label className="form-label">When this disposition is logged...</label>
                <select className="input" value={ruleDisp} onChange={e => setRuleDisp(e.target.value)}>
                  <option value="">Select a disposition…</option>
                  {rulesPipelineDispositions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label className="form-label">...on a lead currently in this stage <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(or any non-final stage)</span></label>
                <select className="input" value={ruleCurrentStage} onChange={e => setRuleCurrentStage(e.target.value)}>
                  <option value="">Any non-final stage</option>
                  {rulesPipelineStages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label className="form-label">...move it to this stage</label>
                <select className="input" value={ruleMoveTo} onChange={e => setRuleMoveTo(e.target.value)}>
                  <option value="">Select target stage…</option>
                  {rulesPipelineStages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label className="form-label">Description <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span></label>
                <input className="input" value={ruleDescription} onChange={e => setRuleDescription(e.target.value)}
                  placeholder="e.g. Move fresh leads into Attempting Contact" />
              </div>
              {ruleError && <p style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 12 }}>{ruleError}</p>}
              <button onClick={addRule} disabled={ruleSaving || !ruleDisp || !ruleMoveTo}
                className="btn btn-primary" style={{ fontSize: 13, opacity: ruleSaving || !ruleDisp || !ruleMoveTo ? 0.5 : 1 }}>
                {ruleSaving ? 'Saving…' : 'Add Rule'}
              </button>
            </div>
          )}

          {filteredRules.length === 0 && !showRuleForm && (
            <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
              <p style={{ fontSize: 14, fontStyle: 'italic', marginBottom: 4 }}>No rules for this pipeline yet.</p>
              <p style={{ fontSize: 12 }}>Without rules, dispositions just log to the timeline and don&apos;t move the card.</p>
            </div>
          )}

          {filteredRules.map(r => (
            <div key={r.id} className="card" style={{ padding: '16px 18px', marginBottom: 10, opacity: r.enabled ? 1 : 0.55 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--text-primary)' }}>
                    When{' '}
                    <span style={{ fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: '#eef2ff', color: '#3730a3' }}>{r.disposition.name}</span>
                    {' '}is logged on a lead in{' '}
                    <span style={{ fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: '#f3f4f6', color: r.currentStage ? '#1f2937' : '#6b7280', fontStyle: r.currentStage ? 'normal' : 'italic' }}>
                      {r.currentStage ? r.currentStage.name : 'any non-final stage'}
                    </span>
                    , move it to{' '}
                    <span style={{
                      fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                      background: r.moveToStage.type === 'won' ? '#dcfce7' : r.moveToStage.type === 'lost' ? '#fee2e2' : '#fef3c7',
                      color: r.moveToStage.type === 'won' ? '#166534' : r.moveToStage.type === 'lost' ? '#991b1b' : '#92400e',
                    }}>{r.moveToStage.name}</span>
                    .
                  </p>
                  {r.description && (
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, fontStyle: 'italic' }}>{r.description}</p>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: r.enabled ? '#16a34a' : 'var(--text-muted)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={r.enabled} onChange={e => toggleRule(r.id, e.target.checked)}
                      style={{ width: 14, height: 14, cursor: 'pointer' }} />
                    {r.enabled ? 'Enabled' : 'Disabled'}
                  </label>
                  <button onClick={() => deleteRule(r.id)}
                    style={{ fontSize: 12, color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* ─── Tab: Lead Distribution ─── */}
      {subTab === 'distribution' && (
        <section>
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em', marginBottom: 4 }}>Lead Distribution</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              When a new lead comes in, it gets auto-assigned to a sales rep using a weighted round robin. Set the weight for each rep — a weight of 2 means they get 2 leads for every 1 that someone with weight 1 gets.
            </p>
          </div>

          <div className="card" style={{ padding: 20 }}>
            <div style={{ marginBottom: 16 }}>
              <label className="form-label">Pipeline</label>
              <select className="input" value={rrPipelineId} onChange={e => setRrPipelineId(e.target.value)}>
                {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

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
      )}

      {/* ─── Tab: Lead Sources ─── */}
      {subTab === 'sources' && (
        <section>
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em', marginBottom: 4 }}>Lead Sources</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Track where each lead comes from (Autotrader, Hemmings, walk-in, referral, etc.). Sources show up in the lead form and filters.
            </p>
          </div>

          {sources.length > 0 && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 12 }}>
              {sources.map((s, i) => (
                <div key={s.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 18px',
                  borderBottom: i < sources.length - 1 ? '1px solid var(--border)' : 'none',
                  opacity: s.isActive ? 1 : 0.5,
                }}>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{s.name}</span>
                  <div style={{ display: 'flex', gap: 14 }}>
                    <button onClick={() => toggleSource(s.id, s.isActive)}
                      style={{ fontSize: 12, color: s.isActive ? 'var(--text-muted)' : 'var(--success)', background: 'none', border: 'none', cursor: 'pointer' }}>
                      {s.isActive ? 'Disable' : 'Enable'}
                    </button>
                    <button onClick={() => deleteSource(s.id)}
                      style={{ fontSize: 12, color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input" value={newSourceName} onChange={e => setNewSourceName(e.target.value)}
              placeholder="New source name..." style={{ flex: 1 }}
              onKeyDown={e => e.key === 'Enter' && addSource()} />
            <button onClick={addSource} disabled={sourceSaving || !newSourceName.trim()}
              className="btn btn-primary" style={{ fontSize: 13, opacity: sourceSaving || !newSourceName.trim() ? 0.5 : 1 }}>
              Add
            </button>
          </div>
        </section>
      )}

      {subTab === 'email' && <EmailMirrorTab />}
    </div>
  )
}

function EmailMirrorTab() {
  type Sub = {
    id: string
    userEmail: string
    subscriptionId: string
    expiresAt: string
    user: { id: string; name: string; email: string }
  }
  const [subs, setSubs] = useState<Sub[]>([])
  const [loading, setLoading] = useState(true)
  const [activating, setActivating] = useState(false)
  const [message, setMessage] = useState<string>('')

  function load() {
    setLoading(true)
    fetch('/api/email/subscriptions')
      .then(r => r.json())
      .then(d => setSubs(d.subscriptions || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function activate() {
    setActivating(true)
    setMessage('')
    const res = await fetch('/api/email/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    })
    const data = await res.json()
    if (!res.ok) {
      setMessage(`Error: ${data.error || res.status}`)
    } else {
      const ok = (data.results || []).filter((r: { ok: boolean }) => r.ok).length
      const fail = (data.results || []).filter((r: { ok: boolean }) => !r.ok).length
      setMessage(`Activated ${ok} mailbox${ok === 1 ? '' : 'es'}${fail ? `, ${fail} failed` : ''}.`)
      load()
    }
    setActivating(false)
  }

  return (
    <section>
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em', marginBottom: 4 }}>Email Mirror</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          When active, every email sent or received in your reps&apos; Outlook mailboxes is mirrored onto the contact&apos;s CRM thread —
          but <strong>only if the sender or recipient is already a Contact</strong>. Random/personal/vendor emails stay private.
          Click activate once; subscriptions auto-renew daily.
        </p>
      </div>

      <div style={{ marginBottom: 16 }}>
        <button onClick={activate} disabled={activating} className="btn btn-primary" style={{ fontSize: 13, opacity: activating ? 0.6 : 1 }}>
          {activating ? 'Activating…' : subs.length === 0 ? 'Activate email mirror for all reps' : 'Re-activate / refresh subscriptions'}
        </button>
        {message && <span style={{ marginLeft: 12, fontSize: 13, color: 'var(--text-muted)' }}>{message}</span>}
      </div>

      <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 8 }}>
        Active subscriptions
      </p>
      {loading ? (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</p>
      ) : subs.length === 0 ? (
        <div className="card" style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          No mailboxes are being mirrored yet. Click the button above to activate.
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          {subs.map((s, i) => {
            const expires = new Date(s.expiresAt)
            const hours = Math.max(0, Math.round((expires.getTime() - Date.now()) / (1000 * 60 * 60)))
            return (
              <div key={s.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 18px',
                borderBottom: i < subs.length - 1 ? '1px solid var(--border)' : 'none',
              }}>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600 }}>{s.user.name}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.userEmail}</p>
                </div>
                <span style={{ fontSize: 12, color: hours < 24 ? '#d97706' : 'var(--text-muted)' }}>
                  Renews in {hours}h
                </span>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
