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
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 700, letterSpacing: '-0.02em' }}>External Repairs</h1>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Track vehicles sent to outside shops
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          style={{
            padding: '10px 22px', borderRadius: '12px', border: 'none',
            background: '#1a1a1a', color: '#dffd6e',
            fontSize: '14px', fontWeight: 600, cursor: 'pointer', minHeight: '44px',
            display: 'flex', alignItems: 'center', gap: '6px',
          }}
        >
          + Add Repair
        </button>
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex',
        marginBottom: '24px',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        overflow: 'hidden',
        background: '#ffffff',
      }}>
        {['active', 'returned', 'all'].map((f, i) => {
          const count = f === 'active' ? repairs.filter(r => r.status !== 'returned').length
            : f === 'returned' ? repairs.filter(r => r.status === 'returned').length
            : repairs.length
          const active = filter === f
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                flex: 1,
                padding: '12px 16px',
                fontSize: '14px',
                fontWeight: active ? 700 : 500,
                cursor: 'pointer',
                border: 'none',
                borderRight: i < 2 ? '1px solid var(--border)' : 'none',
                minHeight: 'auto',
                transition: 'all 0.15s ease',
                background: active ? 'var(--bg-primary)' : '#ffffff',
                color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                textTransform: 'capitalize',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              {f}
              {count > 0 && (
                <span style={{
                  background: active ? '#1a1a1a' : '#e8e8e4',
                  color: active ? '#dffd6e' : 'var(--text-muted)',
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '100px',
                  lineHeight: '16px',
                }}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
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
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '16px', padding: '48px 20px', textAlign: 'center' }}>
          <p style={{ fontSize: '16px', marginBottom: '4px' }}>No external repairs</p>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>All vehicles are in-house</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filtered.map((r) => {
            const daysOut = getDaysOut(r.sentDate)
            const overdue = !!(r.estimatedDays && daysOut > r.estimatedDays && r.status !== 'returned')

            return (
              <div key={r.id} style={{
                background: overdue ? 'var(--danger-bg)' : '#ffffff',
                border: `1px solid ${overdue ? 'var(--danger-border)' : 'var(--border)'}`,
                borderRadius: '16px',
                overflow: 'hidden',
                boxShadow: 'var(--shadow-sm)',
              }}>
                {/* Header */}
                <div style={{ padding: '20px 24px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                    <div>
                      <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
                        STOCK #{r.stockNumber}
                      </p>
                      <p style={{ fontSize: '17px', fontWeight: 700, letterSpacing: '-0.01em' }}>
                        {r.year} {r.make} {r.model}
                      </p>
                      {r.color && <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>{r.color}</p>}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                      {overdue && <span className="badge badge-blocked">Overdue</span>}
                      <span className={`badge ${r.status === 'returned' ? 'badge-done' : r.status === 'ready' ? 'badge-content' : r.status === 'in_progress' ? 'badge-in-progress' : 'badge-pending'}`}>
                        {STATUS_LABELS[r.status]}
                      </span>
                    </div>
                  </div>

                  {/* Info grid */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                    gap: '16px',
                    padding: '16px',
                    background: 'var(--bg-primary)',
                    borderRadius: '12px',
                  }}>
                    <div>
                      <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Shop</p>
                      <p style={{ fontSize: '14px', fontWeight: 600 }}>{r.shopName}</p>
                      {r.shopPhone && <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{r.shopPhone}</p>}
                    </div>
                    <div>
                      <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Repair</p>
                      <p style={{ fontSize: '14px', fontWeight: 500 }}>{r.repairDescription}</p>
                    </div>
                    <div>
                      <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Timeline</p>
                      <p style={{ fontSize: '14px', fontWeight: 600, color: overdue ? 'var(--danger)' : 'var(--text-primary)' }}>
                        {overdue && '⚠ '}{daysOut} day{daysOut !== 1 ? 's' : ''} out
                      </p>
                      {r.estimatedDays && (
                        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{r.estimatedDays}d estimated</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Notes section */}
                {editId === r.id ? (
                  <div style={{ padding: '0 24px 16px' }}>
                    <textarea
                      id={`notes-${r.id}`}
                      defaultValue={r.notes || ''}
                      className="input"
                      rows={2}
                      style={{ resize: 'vertical', minHeight: '60px', fontSize: '14px' }}
                      placeholder="Add update notes..."
                      autoFocus
                    />
                    <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                      <button
                        onClick={() => setEditId(null)}
                        style={{
                          padding: '8px 18px', borderRadius: '10px', border: '1px solid var(--border)',
                          background: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer', minHeight: 'auto',
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          const el = document.getElementById(`notes-${r.id}`) as HTMLTextAreaElement
                          updateNotes(r.id, el.value)
                        }}
                        style={{
                          padding: '8px 18px', borderRadius: '10px', border: 'none',
                          background: '#1a1a1a', color: '#dffd6e', fontSize: '13px', fontWeight: 600, cursor: 'pointer', minHeight: 'auto',
                        }}
                      >
                        Save Notes
                      </button>
                    </div>
                  </div>
                ) : r.notes ? (
                  <div
                    onClick={() => setEditId(r.id)}
                    style={{
                      margin: '0 24px 16px', padding: '12px 14px', borderRadius: '10px',
                      background: 'var(--bg-primary)', cursor: 'pointer', fontSize: '14px',
                      color: 'var(--text-secondary)', lineHeight: 1.5,
                    }}
                  >
                    {r.notes}
                  </div>
                ) : null}

                {/* Actions */}
                {r.status !== 'returned' && (
                  <div style={{
                    display: 'flex',
                    margin: '0 24px 20px',
                    border: '1px solid var(--border)',
                    borderRadius: '12px',
                    overflow: 'hidden',
                  }}>
                    <button
                      onClick={() => setEditId(r.id)}
                      style={{
                        padding: '12px 20px',
                        background: '#ffffff',
                        border: 'none',
                        borderRight: '1px solid var(--border)',
                        fontSize: '14px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        color: 'var(--text-primary)',
                        minHeight: '44px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {r.notes ? 'Edit Notes' : 'Add Notes'}
                    </button>
                    {r.status === 'sent' && (
                      <button
                        onClick={() => updateStatus(r.id, 'in_progress')}
                        style={{
                          flex: 1, padding: '12px 20px',
                          background: '#ffffff', border: 'none',
                          fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                          color: 'var(--text-primary)', minHeight: '44px',
                        }}
                      >
                        Mark In Progress
                      </button>
                    )}
                    {r.status === 'in_progress' && (
                      <button
                        onClick={() => updateStatus(r.id, 'ready')}
                        style={{
                          flex: 1, padding: '12px 20px',
                          background: '#ffffff', border: 'none',
                          fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                          color: 'var(--text-primary)', minHeight: '44px',
                        }}
                      >
                        Ready for Pickup
                      </button>
                    )}
                    {r.status === 'ready' && (
                      <button
                        onClick={() => updateStatus(r.id, 'returned')}
                        style={{
                          flex: 1, padding: '12px 20px',
                          background: '#ffffff', border: 'none',
                          fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                          color: 'var(--text-primary)', minHeight: '44px',
                        }}
                      >
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
