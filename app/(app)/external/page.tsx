'use client'

import { useEffect, useState } from 'react'

type ExternalRepair = {
  id: string
  stockNumber: string
  year: number | null
  make: string
  model: string
  color: string | null
  shopName: string
  shopPhone: string | null
  repairDescription: string
  estimatedDays: number | null
  sentDate: string
  expectedReturn: string | null
  status: string
  notes: string | null
  createdAt: string
}

const STATUS_LABELS: Record<string, string> = {
  sent: 'At Shop',
  in_progress: 'In Progress',
  ready: 'Ready for Pickup',
  returned: 'Returned',
}

export default function ExternalRepairsPage() {
  const [repairs, setRepairs] = useState<ExternalRepair[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('active')
  const [editId, setEditId] = useState<string | null>(null)

  function load() {
    fetch('/api/external')
      .then((r) => r.json())
      .then((data) => setRepairs(data.repairs || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const filtered = filter === 'active'
    ? repairs.filter((r) => r.status !== 'returned')
    : filter === 'returned'
      ? repairs.filter((r) => r.status === 'returned')
      : repairs

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const form = new FormData(e.currentTarget)
    const data = {
      stockNumber: form.get('stockNumber'),
      year: form.get('year') ? Number(form.get('year')) : null,
      make: form.get('make'),
      model: form.get('model'),
      color: form.get('color'),
      shopName: form.get('shopName'),
      shopPhone: form.get('shopPhone'),
      repairDescription: form.get('repairDescription'),
      estimatedDays: form.get('estimatedDays') ? Number(form.get('estimatedDays')) : null,
      sentDate: form.get('sentDate'),
      notes: form.get('notes'),
    }
    try {
      const res = await fetch('/api/external', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error); return }
      setShowAdd(false)
      load()
    } catch { setError('Network error') }
    finally { setSaving(false) }
  }

  async function updateStatus(id: string, status: string) {
    await fetch(`/api/external/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    load()
  }

  async function updateNotes(id: string, notes: string) {
    await fetch(`/api/external/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
    })
    load()
    setEditId(null)
  }

  function getDaysOut(sentDate: string) {
    const days = Math.floor((Date.now() - new Date(sentDate).getTime()) / 86400000)
    return days
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
          <h1 className="text-3xl font-bold tracking-tight">External Repairs</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Track vehicles sent to outside shops
          </p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn btn-primary">+ Add Repair</button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6">
        {['active', 'returned', 'all'].map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className="px-4 py-2 rounded-lg text-sm font-semibold capitalize"
            style={{
              background: filter === f ? 'var(--bg-sidebar)' : 'var(--bg-card)',
              color: filter === f ? 'var(--accent)' : 'var(--text-secondary)',
              border: filter === f ? 'none' : '1px solid var(--border)',
              minHeight: '36px',
            }}>
            {f} {f === 'active' && `(${repairs.filter(r => r.status !== 'returned').length})`}
          </button>
        ))}
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="card mb-6" style={{ borderColor: 'var(--accent)', borderWidth: '2px' }}>
          <h2 className="text-lg font-bold mb-4">Add External Repair</h2>
          <form onSubmit={handleAdd} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="form-label">Stock # *</label>
                <input name="stockNumber" required className="input" placeholder="A1234" />
              </div>
              <div>
                <label className="form-label">Year</label>
                <input name="year" type="number" className="input" placeholder="2024" />
              </div>
              <div>
                <label className="form-label">Make *</label>
                <input name="make" required className="input" placeholder="BMW" />
              </div>
              <div>
                <label className="form-label">Model *</label>
                <input name="model" required className="input" placeholder="X5" />
              </div>
            </div>
            <div>
              <label className="form-label">Color</label>
              <input name="color" className="input" placeholder="Optional" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="form-label">Shop Name *</label>
                <input name="shopName" required className="input" placeholder="Joe's Auto Body" />
              </div>
              <div>
                <label className="form-label">Shop Phone</label>
                <input name="shopPhone" type="tel" className="input" placeholder="(305) 555-1234" />
              </div>
            </div>
            <div>
              <label className="form-label">What's Being Done *</label>
              <textarea name="repairDescription" required className="input" rows={2} style={{ resize: 'vertical', minHeight: '60px' }} placeholder="Paint front bumper, fix dent on driver door..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label">Date Sent *</label>
                <input name="sentDate" type="date" required className="input" defaultValue={new Date().toISOString().split('T')[0]} />
              </div>
              <div>
                <label className="form-label">Estimated Days</label>
                <input name="estimatedDays" type="number" className="input" placeholder="e.g. 5" />
              </div>
            </div>
            <div>
              <label className="form-label">Notes</label>
              <textarea name="notes" className="input" rows={2} style={{ resize: 'vertical', minHeight: '60px' }} placeholder="Any additional notes..." />
            </div>
            {error && <div className="px-4 py-3 rounded-xl text-sm" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>{error}</div>}
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowAdd(false)} className="btn btn-secondary flex-1">Cancel</button>
              <button type="submit" disabled={saving} className="btn btn-primary flex-1" style={saving ? { opacity: 0.5 } : {}}>
                {saving ? 'Adding...' : 'Add Repair'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Repairs list */}
      {filtered.length === 0 ? (
        <div className="card-flat text-center" style={{ padding: '48px 20px' }}>
          <p className="text-lg mb-1">No external repairs</p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>All vehicles are in-house</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((r) => {
            const daysOut = getDaysOut(r.sentDate)
            const overdue = r.estimatedDays && daysOut > r.estimatedDays && r.status !== 'returned'

            return (
              <div key={r.id} className="card" style={overdue ? { borderColor: 'var(--danger-border)', background: 'var(--danger-bg)' } : {}}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-bold">#{r.stockNumber} — {r.year} {r.make} {r.model}</p>
                    {r.color && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{r.color}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {overdue && <span className="badge badge-blocked">Overdue</span>}
                    <span className={`badge ${r.status === 'returned' ? 'badge-done' : r.status === 'ready' ? 'badge-content' : 'badge-pending'}`}>
                      {STATUS_LABELS[r.status]}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3 text-sm">
                  <div>
                    <p style={{ color: 'var(--text-muted)' }}>Shop</p>
                    <p className="font-medium">{r.shopName}</p>
                    {r.shopPhone && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{r.shopPhone}</p>}
                  </div>
                  <div>
                    <p style={{ color: 'var(--text-muted)' }}>Repair</p>
                    <p className="font-medium">{r.repairDescription}</p>
                  </div>
                  <div>
                    <p style={{ color: 'var(--text-muted)' }}>Timeline</p>
                    <p className="font-medium">
                      {daysOut} day{daysOut !== 1 ? 's' : ''} out
                      {r.estimatedDays && <span style={{ color: 'var(--text-muted)' }}> / {r.estimatedDays}d est.</span>}
                    </p>
                    {r.expectedReturn && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Expected: {new Date(r.expectedReturn).toLocaleDateString()}</p>}
                  </div>
                </div>

                {/* Notes */}
                {editId === r.id ? (
                  <div className="mb-3">
                    <textarea
                      id={`notes-${r.id}`}
                      defaultValue={r.notes || ''}
                      className="input text-sm"
                      rows={2}
                      style={{ resize: 'vertical', minHeight: '50px' }}
                      placeholder="Add update notes..."
                    />
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => setEditId(null)} className="text-xs font-medium" style={{ color: 'var(--text-muted)', minHeight: 'auto' }}>Cancel</button>
                      <button onClick={() => {
                        const el = document.getElementById(`notes-${r.id}`) as HTMLTextAreaElement
                        updateNotes(r.id, el.value)
                      }} className="text-xs font-semibold" style={{ color: 'var(--text-primary)', minHeight: 'auto' }}>Save</button>
                    </div>
                  </div>
                ) : r.notes ? (
                  <p className="text-sm mb-3 px-3 py-2 rounded-lg cursor-pointer" style={{ background: 'var(--bg-primary)' }} onClick={() => setEditId(r.id)}>
                    {r.notes}
                  </p>
                ) : null}

                {/* Actions */}
                {r.status !== 'returned' && (
                  <div className="flex gap-2">
                    <button onClick={() => setEditId(r.id)} className="text-xs font-medium px-3 py-1.5 rounded-lg" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', minHeight: '32px' }}>
                      Update Notes
                    </button>
                    {r.status === 'sent' && (
                      <button onClick={() => updateStatus(r.id, 'in_progress')} className="text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ background: 'var(--info-bg)', color: 'var(--info)', border: '1px solid var(--info-border)', minHeight: '32px' }}>
                        Mark In Progress
                      </button>
                    )}
                    {r.status === 'in_progress' && (
                      <button onClick={() => updateStatus(r.id, 'ready')} className="text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ background: 'var(--warning-bg)', color: '#d97706', border: '1px solid var(--warning-border)', minHeight: '32px' }}>
                        Ready for Pickup
                      </button>
                    )}
                    {r.status === 'ready' && (
                      <button onClick={() => updateStatus(r.id, 'returned')} className="text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ background: 'var(--success-bg)', color: '#16a34a', border: '1px solid var(--success-border)', minHeight: '32px' }}>
                        Mark Returned
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
