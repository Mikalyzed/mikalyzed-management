'use client'

import { useEffect, useState } from 'react'
import { STAGE_LABELS } from '@/lib/constants'
import type { Stage } from '@/lib/constants'

type StageConfig = {
  stage: Stage
  slaHours: number
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
    <div className="p-6 md:p-10 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-1" style={{ color: '#1a1a1a' }}>Settings</h1>
      <p className="text-sm mb-8" style={{ color: '#888' }}>Configure stages, notifications, and defaults</p>

      {/* Stage Configuration */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-4" style={{ color: '#1a1a1a' }}>Stage Configuration</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {stages.map((stage, idx) => (
            <div
              key={stage.stage}
              className="rounded-2xl border p-5"
              style={{ background: '#fff', borderColor: '#e5e5e5' }}
            >
              <h3 className="font-semibold mb-4" style={{ color: '#1a1a1a' }}>
                {STAGE_LABELS[stage.stage]}
              </h3>

              {/* Default Assignee */}
              <label className="block text-xs font-medium mb-1" style={{ color: '#888' }}>
                Default Assignee
              </label>
              <select
                className="w-full rounded-lg border px-3 py-2 text-sm mb-4"
                style={{ borderColor: '#e5e5e5', color: '#1a1a1a', background: '#fafafa' }}
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

              {/* SLA Hours */}
              <label className="block text-xs font-medium mb-1" style={{ color: '#888' }}>
                SLA Hours
              </label>
              <input
                type="number"
                min={1}
                className="w-full rounded-lg border px-3 py-2 text-sm mb-4"
                style={{ borderColor: '#e5e5e5', color: '#1a1a1a', background: '#fafafa' }}
                value={stage.slaHours}
                onChange={(e) => updateStage(idx, 'slaHours', parseInt(e.target.value) || 1)}
              />

              {/* Checklist */}
              <label className="block text-xs font-medium mb-2" style={{ color: '#888' }}>
                Default Checklist
              </label>
              <div className="space-y-1 mb-2">
                {stage.defaultChecklist.map((item, itemIdx) => (
                  <div key={itemIdx} className="flex items-center gap-2 group">
                    <span className="text-sm flex-1" style={{ color: '#333' }}>{item}</span>
                    <button
                      type="button"
                      onClick={() => removeChecklistItem(idx, itemIdx)}
                      className="text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ color: '#e55' }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="New item…"
                  className="flex-1 rounded-lg border px-3 py-1.5 text-sm"
                  style={{ borderColor: '#e5e5e5', color: '#1a1a1a', background: '#fafafa' }}
                  value={newItems[stage.stage] || ''}
                  onChange={(e) => setNewItems((prev) => ({ ...prev, [stage.stage]: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && addChecklistItem(idx)}
                />
                <button
                  type="button"
                  onClick={() => addChecklistItem(idx)}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg"
                  style={{ background: '#f0f0f0', color: '#333' }}
                >
                  Add
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Notification Preferences */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-4" style={{ color: '#1a1a1a' }}>Notifications</h2>
        <div className="rounded-2xl border p-5" style={{ background: '#fff', borderColor: '#e5e5e5' }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-medium" style={{ color: '#1a1a1a' }}>Email Notifications</p>
              <p className="text-xs" style={{ color: '#888' }}>Send email alerts when stages advance or vehicles are assigned</p>
            </div>
            <button
              type="button"
              onClick={() => setEmailNotifications(!emailNotifications)}
              className="w-12 h-7 rounded-full relative transition-colors"
              style={{ background: emailNotifications ? '#dffd6e' : '#e5e5e5' }}
            >
              <span
                className="absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform"
                style={{ left: emailNotifications ? '1.375rem' : '0.125rem' }}
              />
            </button>
          </div>
          <div>
            <p className="text-xs font-medium mb-1" style={{ color: '#888' }}>From Address</p>
            <p className="text-sm" style={{ color: '#555' }}>management@mikalyzedautoboutique.com</p>
          </div>
        </div>
      </section>

      {/* General */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-4" style={{ color: '#1a1a1a' }}>General</h2>
        <div className="rounded-2xl border p-5" style={{ background: '#fff', borderColor: '#e5e5e5' }}>
          <div>
            <p className="text-sm font-medium" style={{ color: '#1a1a1a' }}>App Password</p>
            <p className="text-xs mt-1" style={{ color: '#888' }}>Set via environment variable</p>
          </div>
        </div>
      </section>

      {/* Save */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 rounded-xl text-sm font-semibold transition-opacity"
          style={{ background: '#dffd6e', color: '#1a1a1a', opacity: saving ? 0.6 : 1 }}
        >
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
        {message && (
          <p className="text-sm font-medium" style={{ color: message.includes('success') ? '#22c55e' : '#e55' }}>
            {message}
          </p>
        )}
      </div>
    </div>
  )
}
