'use client'

import { useEffect, useState } from 'react'

type User = {
  id: string
  name: string
  email: string
  role: string
  isActive: boolean
  createdAt: string
}

const ROLES = [
  { value: 'admin', label: 'Admin', desc: 'Full access to everything' },
  { value: 'mechanic', label: 'Mechanic', desc: 'Sees mechanic stage tasks' },
  { value: 'detailer', label: 'Detailer', desc: 'Sees detailing stage tasks' },
  { value: 'content', label: 'Content', desc: 'Sees content stage tasks' },
  { value: 'sales', label: 'Sales', desc: 'Submits transport requests' },
  { value: 'coordinator', label: 'Coordinator', desc: 'Manages transport queue' },
]

export default function TeamPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [addName, setAddName] = useState('')
  const [addEmail, setAddEmail] = useState('')
  const [addRole, setAddRole] = useState('sales')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function load() {
    fetch('/api/users')
      .then((r) => r.json())
      .then((data) => setUsers(data.users || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: addName, email: addEmail, role: addRole }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      setShowAdd(false)
      setAddName('')
      setAddEmail('')
      setAddRole('sales')
      load()
    } catch { setError('Network error') }
    finally { setSaving(false) }
  }

  async function updateRole(userId: string, role: string) {
    await fetch(`/api/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    })
    load()
  }

  async function toggleActive(userId: string, isActive: boolean) {
    await fetch(`/api/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !isActive }),
    })
    load()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: '60vh' }}>
        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#e0e0e0', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Team</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            {users.length} member{users.length !== 1 ? 's' : ''} · Manage roles and access
          </p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn btn-primary">
          + Add Member
        </button>
      </div>

      {/* Add member form */}
      {showAdd && (
        <div className="card mb-6" style={{ borderColor: 'var(--accent)', borderWidth: '2px' }}>
          <h2 className="text-lg font-bold mb-4">Add Team Member</h2>
          <form onSubmit={handleAdd} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="form-label">Name *</label>
                <input value={addName} onChange={(e) => setAddName(e.target.value)} required className="input" placeholder="John Smith" />
              </div>
              <div>
                <label className="form-label">Email *</label>
                <input type="email" value={addEmail} onChange={(e) => setAddEmail(e.target.value)} required className="input" placeholder="john@mikalyzed.com" />
              </div>
            </div>
            <div>
              <label className="form-label">Role *</label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {ROLES.map((r) => (
                  <label key={r.value}
                    className="card cursor-pointer flex items-start gap-3"
                    style={{
                      padding: '12px',
                      borderColor: addRole === r.value ? '#1a1a1a' : 'var(--border)',
                      borderWidth: addRole === r.value ? '2px' : '1px',
                    }}>
                    <input type="radio" name="role" value={r.value}
                      checked={addRole === r.value}
                      onChange={() => setAddRole(r.value)}
                      className="mt-0.5 accent-black" />
                    <div>
                      <p className="text-sm font-semibold">{r.label}</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{r.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            {error && (
              <div className="px-4 py-3 rounded-xl text-sm" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
                {error}
              </div>
            )}
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowAdd(false)} className="btn btn-secondary flex-1">Cancel</button>
              <button type="submit" disabled={saving} className="btn btn-primary flex-1" style={saving ? { opacity: 0.5 } : {}}>
                {saving ? 'Adding...' : 'Add Member'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Team list */}
      <div className="flex flex-col gap-3">
        {users.map((u) => (
          <div key={u.id} className="card flex items-center justify-between" style={{ opacity: u.isActive ? 1 : 0.5 }}>
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
                style={{ background: u.isActive ? '#dffd6e' : 'var(--border)', color: '#1a1a1a' }}>
                {u.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-semibold">{u.name}</p>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{u.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={u.role}
                onChange={(e) => updateRole(u.id, e.target.value)}
                className="input text-sm"
                style={{ width: 'auto', minHeight: '36px', padding: '6px 12px', appearance: 'auto' as const }}
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              <button
                onClick={() => toggleActive(u.id, u.isActive)}
                className="text-xs font-medium px-3 py-1.5 rounded-lg"
                style={{
                  background: u.isActive ? 'var(--danger-bg)' : 'var(--success-bg)',
                  color: u.isActive ? 'var(--danger)' : 'var(--success)',
                  minHeight: '32px',
                }}
              >
                {u.isActive ? 'Disable' : 'Enable'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
