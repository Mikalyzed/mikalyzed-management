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

const DEFAULT_INSPECTION = [
  'Oil & fluids check',
  'Brake inspection',
  'Tire condition',
  'Engine check',
  'AC system',
  'Electrical systems',
  'Test drive',
  'Body assessment',
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
  const [reconFullInspection, setReconFullInspection] = useState(false)
  const [reconCustomTasks, setReconCustomTasks] = useState<string[]>([])
  const [reconNewTask, setReconNewTask] = useState('')
  const [reconNotes, setReconNotes] = useState('')
  const [reconEstHours, setReconEstHours] = useState('')
  const [reconError, setReconError] = useState('')
  const [showAnotherShopForm, setShowAnotherShopForm] = useState(false)
  const [anotherShopName, setAnotherShopName] = useState('')
  const [anotherShopPhone, setAnotherShopPhone] = useState('')
  const [anotherRepairDesc, setAnotherRepairDesc] = useState('')
  const [anotherEstDays, setAnotherEstDays] = useState('')
  const [anotherNotes, setAnotherNotes] = useState('')
  const [sendingToShop, setSendingToShop] = useState(false)
  
  // Follow-up state
  const [followUpModal, setFollowUpModal] = useState<{ 
    repairId: string; 
    stockNumber: string; 
    vehicleDesc: string 
  } | null>(null)
  const [followUpNote, setFollowUpNote] = useState('')
  const [followUpNewEta, setFollowUpNewEta] = useState('')
  const [followUpSaving, setFollowUpSaving] = useState(false)
  const [expandedFollowUps, setExpandedFollowUps] = useState<string | null>(null)

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

  async function handleFollowUp() {
    if (!followUpModal || !followUpNote.trim()) return
    setFollowUpSaving(true)
    try {
      const response = await fetch(`/api/external/${followUpModal.repairId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          addFollowUp: {
            note: followUpNote,
            etaDays: followUpNewEta ? Number(followUpNewEta) : null
          }
        })
      })
      if (response.ok) {
        setFollowUpModal(null)
        setFollowUpNote('')
        setFollowUpNewEta('')
        load()
      }
    } catch (error) {
      console.error('Error adding follow-up:', error)
    }
    setFollowUpSaving(false)
  }

  const getDaysOverdue = (sentDate: string, estimatedDays: number | null) => {
    if (!estimatedDays) return 0
    const sent = new Date(sentDate)
    const expected = new Date(sent.getTime() + estimatedDays * 86400000)
    const now = new Date()
    return Math.max(0, Math.floor((now.getTime() - expected.getTime()) / 86400000))
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
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Estimated Days *</label>
                <input name="estimatedDays" type="number" required className="input" placeholder="e.g. 5" />
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
            const hasFollowUp = (r as any).followUps && (r as any).followUps.length > 0
            const overdue = !!(r.estimatedDays && daysOut > r.estimatedDays && r.status !== 'returned' && !hasFollowUp)

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
                      <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Timeline</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {/* Total Days Out */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Total out:</span>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{daysOut}d</span>
                        </div>
                        
                        {/* Original Estimate */}
                        {r.estimatedDays && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Original est:</span>
                            <span style={{ fontWeight: 500, color: 'var(--text-muted)' }}>{r.estimatedDays}d</span>
                          </div>
                        )}
                        
                        {/* Original Overdue */}
                        {r.estimatedDays && daysOut > r.estimatedDays && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                            <span style={{ color: 'var(--danger)' }}>⚠ Overdue by:</span>
                            <span style={{ fontWeight: 600, color: 'var(--danger)' }}>{daysOut - r.estimatedDays}d</span>
                          </div>
                        )}
                        
                        {/* Extensions from Follow-ups */}
                        {(r as any).followUps && (r as any).followUps.length > 0 && (r as any).followUps.some((f: any) => f.etaDays) && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                            <span style={{ color: '#8b5cf6' }}>Extended by:</span>
                            <span style={{ fontWeight: 600, color: '#8b5cf6' }}>
                              +{((r as any).followUps as any[]).reduce((sum: number, f: any) => sum + (f.etaDays || 0), 0)}d
                            </span>
                          </div>
                        )}
                        
                        {/* Latest ETA from Follow-up */}
                        {(r as any).followUps && (r as any).followUps.length > 0 && ((r as any).followUps as any[]).some((f: any) => f.calculatedDeadline) && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', paddingTop: '6px', borderTop: '1px solid var(--border)' }}>
                            <span style={{ color: '#8b5cf6', fontWeight: 500 }}>Latest ETA:</span>
                            <span style={{ fontWeight: 600, color: '#8b5cf6' }}>
                              {(() => {
                                const latestFollowUp = ((r as any).followUps as any[])
                                  .filter((f: any) => f.calculatedDeadline)
                                  .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
                                if (!latestFollowUp) return ''
                                const deadline = new Date(latestFollowUp.calculatedDeadline)
                                const daysLeft = Math.ceil((deadline.getTime() - Date.now()) / 86400000)
                                return daysLeft > 0 ? `Due in ${daysLeft}d` : `${Math.abs(daysLeft)}d overdue`
                              })()}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Follow-up History */}
                {(r as any).followUps && Array.isArray((r as any).followUps) && (r as any).followUps.length > 0 && (
                  <div className="ext-notes-area" style={{ padding: '12px 14px' }}>
                    <button
                      onClick={() => setExpandedFollowUps(expandedFollowUps === r.id ? null : r.id)}
                      style={{
                        background: 'none', border: 'none', fontSize: '13px', fontWeight: 600,
                        color: 'var(--text-primary)', cursor: 'pointer', padding: 0, marginBottom: '8px'
                      }}
                    >
                      Follow-ups ({(r as any).followUps.length}) {expandedFollowUps === r.id ? '▲' : '▼'}
                    </button>
                    {expandedFollowUps === r.id && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {((r as any).followUps as any[]).map((followUp, i) => (
                          <div key={i} style={{
                            padding: '12px', background: '#f8f9fa', borderRadius: '8px',
                            borderLeft: '3px solid #8b5cf6'
                          }}>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 500 }}>
                              {new Date(followUp.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                              {followUp.etaDays && (
                                <span style={{ fontWeight: 600, color: '#8b5cf6', marginLeft: '10px' }}>
                                  +{followUp.etaDays}d ETA
                                </span>
                              )}
                            </div>
                            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '6px 0 0 0', lineHeight: 1.4 }}>
                              {followUp.note}
                            </p>
                            {followUp.calculatedDeadline && (
                              <div style={{ fontSize: '11px', color: '#8b5cf6', marginTop: '6px', paddingTop: '6px', borderTop: '1px solid rgba(139,92,246,0.2)' }}>
                                Deadline: {new Date(followUp.calculatedDeadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                {r.status !== 'returned' && (
                  <div className="ext-actions" style={{
                    display: 'flex',
                    border: '1px solid var(--border)',
                    borderRadius: '12px',
                    overflow: 'hidden',
                  }}>
                    {(r.status !== 'returned' && (r.estimatedDays && daysOut > r.estimatedDays)) && (
                      <button
                        onClick={() => setFollowUpModal({ 
                          repairId: r.id, 
                          stockNumber: r.stockNumber, 
                          vehicleDesc: `${r.year} ${r.make} ${r.model}` 
                        })}
                        style={{
                          padding: '12px 20px',
                          background: '#fef2f2',
                          border: 'none',
                          fontSize: '14px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          color: '#ef4444',
                          minHeight: '44px',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Log Follow-up
                      </button>
                    )}
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
                        onClick={() => {
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
      {/* Return to Recon Modal — Full Form */}
      {reconModal && (
        <div
          onClick={() => { setReconModal(null); setReconError('') }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 20, width: '100%', maxWidth: 480,
              maxHeight: '85vh', display: 'flex', flexDirection: 'column',
              boxShadow: '0 -4px 30px rgba(0,0,0,0.15)',
            }}
          >
            <div style={{ padding: '24px 24px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Send to Recon Board</h3>
                  <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                    {reconModal.year} {reconModal.make} {reconModal.model} · #{reconModal.stockNumber}
                  </p>
                </div>
                <button onClick={() => { setReconModal(null); setReconError('') }} style={{
                  background: 'none', border: 'none', fontSize: 22, cursor: 'pointer',
                  color: 'var(--text-muted)', padding: '0 4px', lineHeight: 1,
                }}>&times;</button>
              </div>
            </div>

            <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
              {/* Starting Stage */}
              <div style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                  Starting Stage
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {RECON_STAGES.map(s => {
                    const active = reconStage === s.value
                    return (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => setReconStage(s.value)}
                        style={{
                          padding: '10px 18px', borderRadius: 10,
                          border: active ? '2px solid #1a1a1a' : '1px solid var(--border)',
                          background: active ? '#fafaf8' : '#fff',
                          fontSize: 14, fontWeight: active ? 600 : 500,
                          color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                          cursor: 'pointer', minHeight: 'auto', transition: 'all 0.15s',
                        }}
                      >{s.label}</button>
                    )
                  })}
                </div>
              </div>

              {/* Estimated Hours */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Estimated Hours
                </label>
                <input
                  type="number"
                  step="0.5"
                  className="input"
                  placeholder="e.g. 4"
                  value={reconEstHours}
                  onChange={e => setReconEstHours(e.target.value)}
                  style={{ maxWidth: 160 }}
                />
              </div>

              {/* Tasks / Checklist */}
              <div style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                  Tasks / Checklist
                </p>
                {reconStage === 'mechanic' && (
                  <label style={{
                    display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
                    cursor: 'pointer', fontSize: 14,
                  }}>
                    <input
                      type="checkbox"
                      checked={reconFullInspection}
                      onChange={e => setReconFullInspection(e.target.checked)}
                      style={{ width: 18, height: 18, cursor: 'pointer' }}
                    />
                    Full inspection checklist ({DEFAULT_INSPECTION.length} items)
                  </label>
                )}

                {/* Custom tasks */}
                {reconCustomTasks.map((task, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
                    padding: '8px 12px', background: 'var(--bg-primary)', borderRadius: 10,
                    fontSize: 14,
                  }}>
                    <span style={{ flex: 1 }}>{task}</span>
                    <button
                      type="button"
                      onClick={() => setReconCustomTasks(reconCustomTasks.filter((_, j) => j !== i))}
                      style={{
                        background: 'none', border: 'none', fontSize: 16,
                        cursor: 'pointer', color: 'var(--text-muted)', padding: '0 4px',
                        lineHeight: 1, minHeight: 'auto',
                      }}
                    >&times;</button>
                  </div>
                ))}

                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="input"
                    placeholder="Add a task..."
                    value={reconNewTask}
                    onChange={e => setReconNewTask(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        const t = reconNewTask.trim()
                        if (t) { setReconCustomTasks([...reconCustomTasks, t]); setReconNewTask('') }
                      }
                    }}
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const t = reconNewTask.trim()
                      if (t) { setReconCustomTasks([...reconCustomTasks, t]); setReconNewTask('') }
                    }}
                    style={{
                      padding: '8px 16px', borderRadius: 10, border: '1px solid var(--border)',
                      background: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', minHeight: 'auto',
                    }}
                  >Add</button>
                </div>
              </div>

              {/* Notes */}
              <div style={{ marginBottom: 8 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Notes
                </label>
                <textarea
                  className="input"
                  rows={2}
                  placeholder="Any notes for the recon team..."
                  value={reconNotes}
                  onChange={e => setReconNotes(e.target.value)}
                  style={{ resize: 'vertical', minHeight: 60 }}
                />
              </div>

              {reconError && (
                <div style={{ padding: '10px 14px', borderRadius: 10, fontSize: 13, background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger-border)', marginTop: 12 }}>
                  {reconError}
                </div>
              )}
            </div>

            {/* Footer buttons */}
            <div style={{ padding: '16px 24px 24px', display: 'flex', gap: 10 }}>
              <button
                onClick={async () => {
                  await fetch(`/api/external/${(reconModal as any).id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'returned' })
                  })
                  setReconModal(null)
                  setReconError('')
                  load()
                }}
                style={{
                  flex: 1, padding: '12px 0', borderRadius: 12,
                  border: '1px solid var(--border)', background: '#fff',
                  fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Skip (just returned)
              </button>
              <button
                onClick={async () => {
                  setSendingToRecon(true)
                  setReconError('')

                  // Build checklist
                  let mechanicChecklist: string[] = []
                  if (reconFullInspection) {
                    mechanicChecklist = [...DEFAULT_INSPECTION, ...reconCustomTasks]
                  } else if (reconCustomTasks.length > 0) {
                    mechanicChecklist = reconCustomTasks
                  }

                  const payload = {
                    stockNumber: reconModal.stockNumber,
                    year: reconModal.year,
                    make: reconModal.make,
                    model: reconModal.model,
                    color: reconModal.color,
                    startingStage: reconStage,
                    mechanicChecklist: mechanicChecklist.length > 0 ? mechanicChecklist : undefined,
                    estimatedHours: reconEstHours ? parseFloat(reconEstHours) : null,
                    notes: reconNotes || undefined,
                  }

                  try {
                    // Mark as returned first
                    await fetch(`/api/external/${(reconModal as any).id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ status: 'returned' })
                    })
                    const res = await fetch('/api/vehicles', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(payload),
                    })
                    if (!res.ok) {
                      const d = await res.json()
                      setReconError(d.error || 'Failed to send to recon')
                      setSendingToRecon(false)
                      return
                    }
                    // Reset form state
                    setReconModal(null)
                    setReconStage('mechanic')
                    setReconFullInspection(false)
                    setReconCustomTasks([])
                    setReconNewTask('')
                    setReconNotes('')
                    setReconEstHours('')
                    setReconError('')
                    load()
                  } catch {
                    setReconError('Network error')
                  }
                  setSendingToRecon(false)
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
              <button
                type="button"
                onClick={() => {
                  setShowAnotherShopForm(true)
                  setAnotherShopName('')
                  setAnotherShopPhone('')
                  setAnotherRepairDesc('')
                  setAnotherEstDays('')
                  setAnotherNotes('')
                }}
                style={{
                  flex: 1, padding: '12px 0', borderRadius: 12, border: '1px solid #f59e0b',
                  background: '#fff', color: '#f59e0b',
                  fontSize: 14, fontWeight: 700, cursor: 'pointer'
                }}
              >
                Send to Another Shop
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Send to Another Shop Modal */}
      {showAnotherShopForm && reconModal && (
        <div
          onClick={() => !sendingToShop && setShowAnotherShopForm(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1100, padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 20, width: '100%', maxWidth: 480,
              maxHeight: '85vh', display: 'flex', flexDirection: 'column',
              boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
            }}
          >
            <div style={{ padding: '24px 24px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Send to Another Shop</h3>
                  <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                    {reconModal.year} {reconModal.make} {reconModal.model} · #{reconModal.stockNumber}
                  </p>
                </div>
                <button onClick={() => setShowAnotherShopForm(false)} style={{
                  background: 'none', border: 'none', fontSize: 22, cursor: 'pointer',
                  color: 'var(--text-muted)', padding: '0 4px', lineHeight: 1,
                }}>&times;</button>
              </div>
            </div>

            <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Shop Name *
                </label>
                <input
                  className="input"
                  placeholder="e.g. Mike's Auto Body"
                  value={anotherShopName}
                  onChange={e => setAnotherShopName(e.target.value)}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Shop Phone
                </label>
                <input
                  className="input"
                  placeholder="Optional"
                  value={anotherShopPhone}
                  onChange={e => setAnotherShopPhone(e.target.value)}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  What&apos;s Being Done *
                </label>
                <textarea
                  className="input"
                  rows={3}
                  placeholder="Describe the repair..."
                  value={anotherRepairDesc}
                  onChange={e => setAnotherRepairDesc(e.target.value)}
                  style={{ resize: 'vertical', minHeight: 60 }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Estimated Days *
                </label>
                <input
                  className="input"
                  type="number"
                  placeholder="e.g. 5"
                  value={anotherEstDays}
                  onChange={e => setAnotherEstDays(e.target.value)}
                  style={{ maxWidth: 160 }}
                />
              </div>

              <div style={{ marginBottom: 8 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Notes
                </label>
                <textarea
                  className="input"
                  rows={2}
                  placeholder="Optional notes..."
                  value={anotherNotes}
                  onChange={e => setAnotherNotes(e.target.value)}
                  style={{ resize: 'vertical', minHeight: 50 }}
                />
              </div>
            </div>

            <div style={{ padding: '16px 24px 24px', display: 'flex', gap: 10 }}>
              <button
                onClick={() => setShowAnotherShopForm(false)}
                disabled={sendingToShop}
                style={{
                  flex: 1, padding: '12px 0', borderRadius: 12,
                  border: '1px solid var(--border)', background: '#fff',
                  fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!anotherShopName.trim() || !anotherRepairDesc.trim() || !anotherEstDays.trim()) return
                  setSendingToShop(true)
                  try {
                    await fetch(`/api/external/${(reconModal as any).id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ status: 'returned' })
                    })
                    await fetch('/api/external', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        stockNumber: reconModal.stockNumber,
                        year: reconModal.year,
                        make: reconModal.make,
                        model: reconModal.model,
                        color: reconModal.color || null,
                        shopName: anotherShopName.trim(),
                        shopPhone: anotherShopPhone.trim() || null,
                        repairDescription: anotherRepairDesc.trim(),
                        estimatedDays: Number(anotherEstDays),
                        sentDate: new Date().toISOString().split('T')[0],
                        notes: anotherNotes.trim() || null,
                      })
                    })
                    setShowAnotherShopForm(false)
                    setReconModal(null)
                    load()
                  } catch (error) {
                    console.error('Error sending to another shop:', error)
                  }
                  setSendingToShop(false)
                }}
                disabled={sendingToShop || !anotherShopName.trim() || !anotherRepairDesc.trim() || !anotherEstDays.trim()}
                style={{
                  flex: 1, padding: '12px 0', borderRadius: 12, border: 'none',
                  background: '#f59e0b', color: '#fff',
                  fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  opacity: (sendingToShop || !anotherShopName.trim() || !anotherRepairDesc.trim() || !anotherEstDays.trim()) ? 0.5 : 1,
                }}
              >
                {sendingToShop ? 'Sending...' : 'Send to Shop'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Follow-up Modal */}
      {followUpModal && (
        <div
          onClick={() => !followUpSaving && setFollowUpModal(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 20
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 16, width: '100%', maxWidth: 480,
              padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.15)'
            }}
          >
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Log Follow-up</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
              #{followUpModal.stockNumber} - {followUpModal.vehicleDesc}
            </p>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                Follow-up Note *
              </label>
              <textarea
                value={followUpNote}
                onChange={e => setFollowUpNote(e.target.value)}
                rows={3}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 10,
                  border: '1px solid #e2e5ea', fontSize: 14, background: '#f9fafb',
                  outline: 'none', resize: 'vertical', minHeight: 80
                }}
                placeholder="Called shop, spoke with John. Car is in queue, should be ready by..."
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                New ETA (days, optional)
              </label>
              <input
                type="number"
                value={followUpNewEta}
                onChange={e => setFollowUpNewEta(e.target.value)}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 10,
                  border: '1px solid #e2e5ea', fontSize: 14, background: '#f9fafb',
                  outline: 'none'
                }}
                placeholder="e.g. 7"
              />
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                If provided, this will reset the estimated completion date
              </p>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setFollowUpModal(null)}
                disabled={followUpSaving}
                style={{
                  flex: 1, padding: '12px 0', borderRadius: 10, border: '1px solid #e2e5ea',
                  background: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  color: 'var(--text-secondary)', opacity: followUpSaving ? 0.5 : 1
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleFollowUp}
                disabled={!followUpNote.trim() || followUpSaving}
                style={{
                  flex: 1, padding: '12px 0', borderRadius: 10, border: 'none',
                  background: !followUpNote.trim() || followUpSaving ? '#e5e5e5' : '#ef4444',
                  color: '#fff', fontSize: 14, fontWeight: 700,
                  cursor: !followUpNote.trim() || followUpSaving ? 'not-allowed' : 'pointer'
                }}
              >
                {followUpSaving ? 'Saving...' : 'Log Follow-up'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
