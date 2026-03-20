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
  const [addPassword, setAddPassword] = useState('')
  const [addRole, setAddRole] = useState('sales')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Edit state
  const [editUser, setEditUser] = useState<User | null>(null)
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editPassword, setEditPassword] = useState('')
  const [editRole, setEditRole] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  function load() {
    fetch('/api/users')
      .then((r) => r.json())
      .then((data) => setUsers(data.users || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  function openEdit(u: User) {
    setEditUser(u)
    setEditName(u.name)
    setEditEmail(u.email)
    setEditPassword('')
    setEditRole(u.role)
    setEditError('')
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: addName, email: addEmail, password: addPassword, role: addRole }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      setShowAdd(false)
      setAddName('')
      setAddEmail('')
      setAddPassword('')
      setAddRole('sales')
      load()
    } catch { setError('Network error') }
    finally { setSaving(false) }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editUser) return
    setEditSaving(true)
    setEditError('')
    try {
      const body: Record<string, string> = { name: editName, email: editEmail, role: editRole }
      if (editPassword.trim()) body.password = editPassword
      const res = await fetch(`/api/users/${editUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { setEditError(data.error || 'Failed to update'); return }
      setEditUser(null)
      load()
    } catch { setEditError('Network error') }
    finally { setEditSaving(false) }
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="form-label">Password *</label>
                <input type="text" value={addPassword} onChange={(e) => setAddPassword(e.target.value)} required className="input" placeholder="Set their password" />
              </div>
              <div className="flex items-end">
                <p className="text-xs pb-3" style={{ color: 'var(--text-muted)' }}>Each person has their own password to sign in</p>
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
          <div key={u.id} className="card" style={{ opacity: u.isActive ? 1 : 0.5, padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 0 }}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
                  style={{ background: u.isActive ? '#dffd6e' : 'var(--border)', color: '#1a1a1a', flexShrink: 0 }}>
                  {u.name.charAt(0).toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                  <p className="font-semibold" style={{ fontSize: 15 }}>{u.name}</p>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{u.email}</p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  fontSize: 12, fontWeight: 600, padding: '4px 12px', borderRadius: 6,
                  background: '#f5f5f3', color: 'var(--text-secondary)', textTransform: 'capitalize',
                }}>
                  {u.role}
                </span>
                <button onClick={() => openEdit(u)} style={{
                  padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)',
                  background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  color: 'var(--text-secondary)', minHeight: 34,
                }}>
                  Edit
                </button>
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
          </div>
        ))}
      </div>

      {/* Edit Modal */}
      {editUser && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, maxWidth: 480, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Edit Team Member</h3>
            <form onSubmit={handleEdit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label className="form-label">Name</label>
                <input className="input" value={editName} onChange={e => setEditName(e.target.value)} required />
              </div>
              <div>
                <label className="form-label">Email</label>
                <input className="input" type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} required />
              </div>
              <div>
                <label className="form-label">New Password</label>
                <input className="input" type="text" value={editPassword} onChange={e => setEditPassword(e.target.value)} placeholder="Leave blank to keep current" />
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Only fill if you want to change their password</p>
              </div>
              <div>
                <label className="form-label">Role</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                  {ROLES.map(r => (
                    <label key={r.value} className="card" style={{
                      padding: 12, cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 10,
                      borderColor: editRole === r.value ? '#1a1a1a' : 'var(--border)',
                      borderWidth: editRole === r.value ? '2px' : '1px',
                    }}>
                      <input type="radio" name="editRole" value={r.value}
                        checked={editRole === r.value} onChange={() => setEditRole(r.value)}
                        className="mt-0.5 accent-black" />
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 600 }}>{r.label}</p>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              {editError && (
                <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--danger-bg)', color: 'var(--danger)', fontSize: 13 }}>
                  {editError}
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button type="button" onClick={() => setEditUser(null)} className="btn btn-secondary" style={{ flex: 1 }}>Cancel</button>
                <button type="submit" disabled={editSaving} className="btn btn-primary" style={{ flex: 1, opacity: editSaving ? 0.5 : 1 }}>
                  {editSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
