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

const RECON_STAGES = [
  { value: 'mechanic', label: 'Mechanic' },
  { value: 'detailing', label: 'Detailing' },
  { value: 'content', label: 'Content' },
  { value: 'publish', label: 'Publish' },
]

export default function ExternalRepairsPage() {
  const [repairs, setRepairs] = useState<ExternalRepair[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('active')
  const [editId, setEditId] = useState<string | null>(null)
  const [reconModal, setReconModal] = useState<ExternalRepair | null>(null)
  const [reconStage, setReconStage] = useState('mechanic')
  const [sendingToRecon, setSendingToRecon] = useState(false)

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
    return Math.floor((Date.now() - new Date(sentDate).getTime()) / 86400000)
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ width: 20, height: 20, border: '2px solid #e8e8e4', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      </div>
    )
  }

  return (
    <div>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        .ext-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 24px; gap: 12px; }
        .ext-header h1 { font-size: 24px; }
        .ext-add-btn span { display: none; }
        .ext-card-padding { padding: 16px 16px 12px; }
        .ext-info-grid { grid-template-columns: 1fr !important; }
        .ext-actions { margin: 0 16px 16px !important; flex-direction: column; }
        .ext-actions button { border-right: none !important; border-bottom: 1px solid var(--border); }
        .ext-actions button:last-child { border-bottom: none !important; }
        .ext-notes-area { margin: 0 16px 12px !important; }
        .ext-form-grid-4 { grid-template-columns: 1fr 1fr; }

        @media (min-width: 768px) {
          .ext-header h1 { font-size: 28px; }
          .ext-add-btn span { display: inline; }
          .ext-card-padding { padding: 20px 24px 16px; }
          .ext-info-grid { grid-template-columns: repeat(3, 1fr) !important; }
          .ext-actions { margin: 0 24px 20px !important; flex-direction: row; }
          .ext-actions button { border-bottom: none !important; border-right: 1px solid var(--border); }
          .ext-actions button:last-child { border-right: none !important; }
          .ext-notes-area { margin: 0 24px 16px !important; }
          .ext-form-grid-4 { grid-template-columns: repeat(4, 1fr); }
        }
      `}</style>

      {/* Header */}
      <div className="ext-header">
        <div>
          <h1 style={{ fontWeight: 700, letterSpacing: '-0.02em' }}>External Repairs</h1>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Track vehicles sent to outside shops
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="ext-add-btn"
          style={{
            padding: '10px 20px', borderRadius: '12px', border: 'none',
            background: '#1a1a1a', color: '#dffd6e',
            fontSize: '14px', fontWeight: 600, cursor: 'pointer', minHeight: '44px',
            display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0,
          }}
        >
          + <span>Add Repair</span>
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
                padding: '12px 8px',
                fontSize: '13px',
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
                gap: '6px',
              }}
            >
              {f}
              {count > 0 && (
                <span style={{
                  background: active ? '#1a1a1a' : '#e8e8e4',
                  color: active ? '#dffd6e' : 'var(--text-muted)',
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 7px',
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
        <div style={{ background: '#fff', border: '2px solid var(--accent)', borderRadius: '16px', padding: '20px', marginBottom: '24px', boxShadow: 'var(--shadow)' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px' }}>Add External Repair</h2>
          <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="ext-form-grid-4" style={{ display: 'grid', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Stock # *</label>
                <input name="stockNumber" required className="input" placeholder="A1234" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Year</label>
                <input name="year" type="number" className="input" placeholder="2024" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Make *</label>
                <input name="make" required className="input" placeholder="BMW" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Model *</label>
                <input name="model" required className="input" placeholder="X5" />
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Color</label>
              <input name="color" className="input" placeholder="Optional" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Shop Name *</label>
                <input name="shopName" required className="input" placeholder="Joe's Auto Body" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Shop Phone</label>
                <input name="shopPhone" type="tel" className="input" placeholder="(305) 555-1234" />
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>What&apos;s Being Done *</label>
              <textarea name="repairDescription" required className="input" rows={2} style={{ resize: 'vertical', minHeight: '60px' }} placeholder="Paint front bumper, fix dent on driver door..." />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Date Sent *</label>
                <input name="sentDate" type="date" required className="input" defaultValue={new Date().toISOString().split('T')[0]} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Estimated Days</label>
                <input name="estimatedDays" type="number" className="input" placeholder="e.g. 5" />
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Notes</label>
              <textarea name="notes" className="input" rows={2} style={{ resize: 'vertical', minHeight: '60px' }} placeholder="Any additional notes..." />
            </div>
            {error && <div style={{ padding: '12px 16px', borderRadius: '12px', fontSize: '14px', background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger-border)' }}>{error}</div>}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" onClick={() => setShowAdd(false)} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid var(--border)', background: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer', minHeight: '44px' }}>Cancel</button>
              <button type="submit" disabled={saving} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: 'none', background: '#1a1a1a', color: '#dffd6e', fontSize: '14px', fontWeight: 600, cursor: 'pointer', minHeight: '44px', opacity: saving ? 0.5 : 1 }}>
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
                <div className="ext-card-padding">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', gap: '12px' }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
                        STOCK #{r.stockNumber}
                      </p>
                      <p style={{ fontSize: '17px', fontWeight: 700, letterSpacing: '-0.01em' }}>
                        {r.year} {r.make} {r.model}
                      </p>
                      {r.color && <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>{r.color}</p>}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {overdue && <span className="badge badge-blocked">Overdue</span>}
                      <span className={`badge ${r.status === 'returned' ? 'badge-done' : r.status === 'ready' ? 'badge-content' : r.status === 'in_progress' ? 'badge-in-progress' : 'badge-pending'}`}>
                        {STATUS_LABELS[r.status]}
                      </span>
                    </div>
                  </div>

                  {/* Info grid */}
                  <div className="ext-info-grid" style={{
                    display: 'grid',
                    gap: '14px',
                    padding: '14px',
                    background: overdue ? 'rgba(255,255,255,0.6)' : 'var(--bg-primary)',
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
                  <div className="ext-notes-area">
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
                    className="ext-notes-area"
                    onClick={() => setEditId(r.id)}
                    style={{
                      padding: '12px 14px', borderRadius: '10px',
                      background: 'var(--bg-primary)', cursor: 'pointer', fontSize: '14px',
                      color: 'var(--text-secondary)', lineHeight: 1.5,
                    }}
                  >
                    {r.notes}
                  </div>
                ) : null}

                {/* Actions */}
                {r.status !== 'returned' && (
                  <div className="ext-actions" style={{
                    display: 'flex',
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
                        fontSize: '14px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        color: 'var(--text-primary)',
                        minHeight: '44px',
                        whiteSpace: 'nowrap',
                        flex: r.status !== 'returned' ? undefined : 1,
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
                        onClick={async () => {
                          await updateStatus(r.id, 'returned')
                          setReconModal(r)
                          setReconStage('mechanic')
                        }}
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
      {/* Return to Recon Modal */}
      {reconModal && (
        <div
          onClick={() => setReconModal(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 20, width: '100%', maxWidth: 420,
              padding: '28px 24px', boxShadow: '0 -4px 30px rgba(0,0,0,0.15)',
            }}
          >
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
              Send back to recon?
            </h3>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20 }}>
              {reconModal.year} {reconModal.make} {reconModal.model} (#{reconModal.stockNumber})
            </p>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Select stage
            </label>
            <select
              value={reconStage}
              onChange={e => setReconStage(e.target.value)}
              className="input"
              style={{ width: '100%', marginBottom: 20, padding: '10px 12px', fontSize: 14 }}
            >
              {RECON_STAGES.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setReconModal(null)}
                style={{
                  flex: 1, padding: '12px 0', borderRadius: 12,
                  border: '1px solid var(--border)', background: '#fff',
                  fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}
              >
                No, just mark returned
              </button>
              <button
                onClick={async () => {
                  setSendingToRecon(true)
                  // Find vehicle by stock number
                  const res = await fetch(`/api/vehicles?stockNumber=${reconModal.stockNumber}`)
                  const data = await res.json()
                  const vehicle = data.vehicles?.[0]
                  if (vehicle) {
                    await fetch(`/api/vehicles/${vehicle.id}/move-stage`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ targetStage: reconStage }),
                    })
                  }
                  setSendingToRecon(false)
                  setReconModal(null)
                  load()
                }}
                disabled={sendingToRecon}
                style={{
                  flex: 1, padding: '12px 0', borderRadius: 12, border: 'none',
                  background: '#1a1a1a', color: '#dffd6e',
                  fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  opacity: sendingToRecon ? 0.5 : 1,
                }}
              >
                {sendingToRecon ? 'Sending...' : 'Send to Recon'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
