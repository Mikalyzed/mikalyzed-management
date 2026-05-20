'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import VehicleSearch from '@/components/VehicleSearch'
import VendorSearch, { VendorResult } from '@/components/VendorSearch'
import AddPartModal from '@/components/AddPartModal'

type InventoryPick = {
  stockNumber: string; vin: string | null
  year: number | null; make: string; model: string; color: string | null
}

type ExternalRepair = {
  id: string
  stockNumber: string
  year: number | null
  make: string
  model: string
  color: string | null
  vendorId: string | null
  shopName: string
  shopPhone: string | null
  atDealership: boolean
  repairDescription: string
  estimatedDays: number | null
  sentDate: string | null
  expectedReturn: string | null
  status: string
  notes: string | null
  createdAt: string
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending Schedule',
  sent: 'Scheduled for service',
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
  const router = useRouter()
  const [repairs, setRepairs] = useState<ExternalRepair[]>([])
  const [resolving, setResolving] = useState<string | null>(null)

  async function openVehicleDetail(stockNumber: string) {
    if (resolving) return
    setResolving(stockNumber)
    try {
      const res = await fetch('/api/vehicles/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stockNumber }),
      })
      const data = await res.json()
      if (data.vehicleId) router.push(`/vehicles/${data.vehicleId}`)
    } catch {}
    setResolving(null)
  }
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [selectedInv, setSelectedInv] = useState<InventoryPick | null>(null)
  const [addAsPending, setAddAsPending] = useState(false)
  const [addVendor, setAddVendor] = useState<VendorResult | null>(null)
  const [addAtDealership, setAddAtDealership] = useState(false)
  const [addPartFor, setAddPartFor] = useState<{ stockNumber: string; vehicleDesc: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [scheduleModal, setScheduleModal] = useState<ExternalRepair | null>(null)
  const [scheduleSentDate, setScheduleSentDate] = useState('')
  const [scheduleEstDays, setScheduleEstDays] = useState('')
  const [scheduleSaving, setScheduleSaving] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
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
  const [editRepairModal, setEditRepairModal] = useState<ExternalRepair | null>(null)
  const [editRepairSaving, setEditRepairSaving] = useState(false)
  const [editStatus, setEditStatus] = useState('')
  const [editReason, setEditReason] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; stock: string; vehicle: string } | null>(null)
  const [deleteDeleting, setDeleteDeleting] = useState(false)

  function load() {
    fetch('/api/external')
      .then((r) => r.json())
      .then((data) => setRepairs(data.repairs || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(data => {
        if (data.user?.role === 'admin') setIsAdmin(true)
      })
      .catch(() => setIsAdmin(false))
    load()
  }, [])

  const filtered = (() => {
    const q = search.toLowerCase().trim()
    let list = filter === 'all'
      ? repairs.filter((r) => r.status !== 'returned')
      : repairs.filter((r) => r.status === filter)
    if (q) {
      list = list.filter(r => {
        const desc = `${r.year || ''} ${r.make} ${r.model} ${r.stockNumber} ${r.shopName} ${r.color || ''}`.toLowerCase()
        return desc.includes(q)
      })
    }
    return list
  })()

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const form = new FormData(e.currentTarget)
    if (!addVendor) { setError('Pick or add a vendor'); setSaving(false); return }
    const data = {
      stockNumber: form.get('stockNumber'),
      year: form.get('year') ? Number(form.get('year')) : null,
      make: form.get('make'),
      model: form.get('model'),
      color: form.get('color'),
      vendorId: addVendor.id,
      shopName: addVendor.name,
      shopPhone: addVendor.phone,
      atDealership: addAtDealership,
      repairDescription: form.get('repairDescription'),
      estimatedDays: addAsPending ? null : (form.get('estimatedDays') ? Number(form.get('estimatedDays')) : null),
      sentDate: addAsPending ? null : form.get('sentDate'),
      notes: form.get('notes'),
      status: addAsPending ? 'pending' : 'sent',
    }
    try {
      const res = await fetch('/api/external', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error); return }
      setShowAdd(false)
      setSelectedInv(null)
      setAddAsPending(false)
      setAddVendor(null)
      setAddAtDealership(false)
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

  function getDaysOut(sentDate: string | null) {
    if (!sentDate) return null
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
        .ext-header { display: flex; flex-direction: column; align-items: stretch; margin-bottom: 24px; gap: 12px; }
        .ext-header h1 { font-size: 24px; }
        .ext-add-btn { min-height: 38px !important; padding: 8px 14px !important; border-radius: 8px !important; }
        .ext-add-btn span { display: none; }
        .ext-card-padding { padding: 16px 16px 12px; }
        .ext-info-grid { grid-template-columns: 1fr !important; }
        .ext-actions { margin: 0 16px 16px !important; display: flex !important; flex-wrap: wrap; gap: 6px; }
        .ext-actions button { border-radius: 8px !important; flex: 1 1 calc(50% - 3px); min-width: 0; }
        /* Mobile: View Vehicle + Add Part live inside the card's modal, not on the card itself */
        .ext-action-extra { display: none !important; }
        .ext-notes-area { margin: 0 16px 12px !important; }
        .ext-form-grid-4 { grid-template-columns: 1fr 1fr; }

        @media (min-width: 768px) {
          .ext-header { flex-direction: row; align-items: flex-start; justify-content: space-between; }
          .ext-header h1 { font-size: 28px; }
          .ext-add-btn { min-height: 44px !important; padding: 10px 20px !important; border-radius: 12px !important; }
          .ext-add-btn span { display: inline; }
          .ext-card-padding { padding: 20px 24px 16px; }
          .ext-info-grid { grid-template-columns: repeat(3, 1fr) !important; }
          .ext-actions { margin: 0 24px 20px !important; }
          .ext-actions button { flex: 1 1 0 !important; }
          /* Desktop: always show all action buttons */
          .ext-action-extra { display: inline-flex !important; align-items: center; justify-content: center; }
          .ext-notes-area { margin: 0 24px 16px !important; }
          .ext-form-grid-4 { grid-template-columns: repeat(4, 1fr); }
        }
      `}</style>

      {/* Header */}
      <div className="ext-header">
        <h1 className="page-h1-mobile-pad" style={{ fontWeight: 700, letterSpacing: '-0.02em' }}>External Repairs</h1>
        <div className="ext-controls" style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minWidth: 0 }}>
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search vehicles..."
            style={{ flex: 1, minWidth: 0, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14 }}
          />
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
      </div>

      {/* Filter tabs — horizontal scroll pill style (matches Parts page) */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', overflowX: 'auto', paddingBottom: '2px' }}>
        {(() => {
          const TABS = [
            { key: 'all', label: 'All Vehicles' },
            { key: 'pending', label: 'Pending' },
            { key: 'sent', label: 'Scheduled' },
            { key: 'in_progress', label: 'In Progress' },
            { key: 'ready', label: 'Ready' },
            { key: 'returned', label: 'Returned' },
          ]
          return TABS.map(tab => {
            const count = tab.key === 'all'
              ? repairs.filter(r => r.status !== 'returned').length
              : repairs.filter(r => r.status === tab.key).length
            const active = filter === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                style={{
                  padding: '8px 16px', borderRadius: '8px',
                  border: `1px solid ${active ? '#1a1a1a' : 'var(--border)'}`,
                  background: active ? '#1a1a1a' : '#fff',
                  color: active ? '#dffd6e' : 'var(--text-secondary)',
                  fontSize: '14px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                  display: 'flex', alignItems: 'center', gap: '6px',
                  flexShrink: 0,
                }}
              >
                {tab.label}
                {count > 0 && (
                  <span style={{
                    background: active ? 'rgba(223,253,110,0.2)' : 'var(--border)',
                    color: active ? '#dffd6e' : 'var(--text-muted)',
                    fontSize: '12px', fontWeight: 600, padding: '2px 6px', borderRadius: '4px',
                  }}>{count}</span>
                )}
              </button>
            )
          })
        })()}
      </div>

      {/* Add form */}
      {showAdd && (
        <div style={{ background: '#fff', border: '2px solid var(--accent)', borderRadius: '16px', padding: '20px', marginBottom: '24px', boxShadow: 'var(--shadow)' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px' }}>Add External Repair</h2>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Find vehicle in inventory
            </label>
            <VehicleSearch
              placeholder="Search by stock #, VIN, or name..."
              onSelect={(v) => setSelectedInv({
                stockNumber: v.stockNumber, vin: v.vin,
                year: v.year, make: v.make, model: v.model, color: v.color,
              })}
            />
            {selectedInv && (
              <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Selected: #{selectedInv.stockNumber} — {selectedInv.year} {selectedInv.make} {selectedInv.model}</span>
                <button type="button" onClick={() => setSelectedInv(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#16a34a', fontSize: 13, fontWeight: 600 }}>Clear</button>
              </div>
            )}
          </div>
          <form key={selectedInv?.stockNumber || 'blank'} onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="ext-form-grid-4" style={{ display: 'grid', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Stock # *</label>
                <input name="stockNumber" required className="input" placeholder="A1234" defaultValue={selectedInv?.stockNumber || ''} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Year</label>
                <input name="year" type="number" className="input" placeholder="2024" defaultValue={selectedInv?.year || ''} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Make *</label>
                <input name="make" required className="input" placeholder="BMW" defaultValue={selectedInv?.make || ''} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Model *</label>
                <input name="model" required className="input" placeholder="X5" defaultValue={selectedInv?.model || ''} />
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Color</label>
              <input name="color" className="input" placeholder="Optional" defaultValue={selectedInv?.color || ''} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Vendor *</label>
              <VendorSearch
                onSelect={v => setAddVendor(v)}
                placeholder="Search vendors or type to add new..."
              />
              {addVendor && (
                <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>
                    <strong>{addVendor.name}</strong>
                    {addVendor.phone && <span style={{ marginLeft: 8, color: 'var(--text-muted)' }}>· {addVendor.phone}</span>}
                  </span>
                  <button type="button" onClick={() => setAddVendor(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#16a34a', fontSize: 13, fontWeight: 600 }}>Clear</button>
                </div>
              )}
            </div>
            <label style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', borderRadius: 10,
              background: addAtDealership ? '#dbeafe' : '#f9fafb',
              border: `1px solid ${addAtDealership ? '#93c5fd' : 'var(--border)'}`,
              cursor: 'pointer', fontSize: 14,
            }}>
              <input
                type="checkbox"
                checked={addAtDealership}
                onChange={e => setAddAtDealership(e.target.checked)}
                style={{ width: 18, height: 18, cursor: 'pointer' }}
              />
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Vendor working at our dealership</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  Vehicle stays on-site — vendor comes to us. (Not actually sent out.)
                </div>
              </div>
            </label>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>What&apos;s Being Done *</label>
              <textarea name="repairDescription" required className="input" rows={2} style={{ resize: 'vertical', minHeight: '60px' }} placeholder="Paint front bumper, fix dent on driver door..." />
            </div>
            <label style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', borderRadius: 10,
              background: addAsPending ? '#fef3c7' : '#f9fafb',
              border: `1px solid ${addAsPending ? '#fcd34d' : 'var(--border)'}`,
              cursor: 'pointer', fontSize: 14,
            }}>
              <input
                type="checkbox"
                checked={addAsPending}
                onChange={e => setAddAsPending(e.target.checked)}
                style={{ width: 18, height: 18, cursor: 'pointer' }}
              />
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Not scheduled yet</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  Track this vehicle as pending — fill in the date and estimated days later.
                </div>
              </div>
            </label>
            {!addAsPending && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Date Sent *</label>
                  <input name="sentDate" type="date" required={!addAsPending} className="input" defaultValue={new Date().toISOString().split('T')[0]} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Estimated Days *</label>
                  <input name="estimatedDays" type="number" required={!addAsPending} className="input" placeholder="e.g. 5" />
                </div>
              </div>
            )}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Notes</label>
              <textarea name="notes" className="input" rows={2} style={{ resize: 'vertical', minHeight: '60px' }} placeholder="Any additional notes..." />
            </div>
            {error && <div style={{ padding: '12px 16px', borderRadius: '12px', fontSize: '14px', background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger-border)' }}>{error}</div>}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" onClick={() => { setShowAdd(false); setSelectedInv(null); setAddAsPending(false); setAddVendor(null); setAddAtDealership(false) }} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid var(--border)', background: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer', minHeight: '44px' }}>Cancel</button>
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
            const isPending = r.status === 'pending'
            const hasFollowUp = (r as any).followUps && (r as any).followUps.length > 0
            const overdue = !!(daysOut !== null && r.estimatedDays && daysOut > r.estimatedDays && r.status !== 'returned' && !hasFollowUp)

            return (
              <div
                key={r.id}
                onClick={(e) => {
                  // Don't open modal if click landed on a button or interactive element
                  if ((e.target as HTMLElement).closest('button, a, select, input, textarea')) return
                  setEditRepairModal(r); setEditStatus(r.status); setEditReason('')
                }}
                style={{
                  background: overdue ? 'var(--danger-bg)' : '#ffffff',
                  border: `1px solid ${overdue ? 'var(--danger-border)' : 'var(--border)'}`,
                  borderRadius: '16px',
                  overflow: 'hidden',
                  boxShadow: 'var(--shadow-sm)',
                  cursor: 'pointer',
                }}>
                {/* Header - Clickable for admin */}
                <div className="ext-card-padding" style={{ cursor: isAdmin ? 'pointer' : 'default' }} onClick={() => isAdmin && (setEditRepairModal(r), setEditStatus(r.status), setEditReason(''))}>
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
                      {r.atDealership && (
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4,
                          background: '#dbeafe', color: '#1d4ed8', whiteSpace: 'nowrap',
                        }}>In-House</span>
                      )}
                      <span className={`badge ${r.status === 'returned' ? 'badge-done' : r.status === 'ready' ? 'badge-content' : r.status === 'in_progress' ? 'badge-in-progress' : 'badge-pending'}`}>
                        {STATUS_LABELS[r.status]}
                      </span>
                    </div>
                  </div>

                  {/* Info grid - Clickable for admin */}
                  <div className="ext-info-grid" style={{
                    display: 'grid',
                    gap: '14px',
                    padding: '14px',
                    background: overdue ? 'rgba(255,255,255,0.6)' : 'var(--bg-primary)',
                    borderRadius: '12px',
                    cursor: isAdmin ? 'pointer' : 'default',
                  }} onClick={() => isAdmin && (setEditRepairModal(r), setEditStatus(r.status), setEditReason(''))}>
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
                        {isPending ? (
                          <div style={{ fontSize: '13px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            Not yet scheduled — use the Schedule button when ready.
                          </div>
                        ) : (
                          <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                              <span style={{ color: 'var(--text-secondary)' }}>Total out:</span>
                              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{daysOut}d</span>
                            </div>

                            {r.estimatedDays && (
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                                <span style={{ color: 'var(--text-secondary)' }}>Original est:</span>
                                <span style={{ fontWeight: 500, color: 'var(--text-muted)' }}>{r.estimatedDays}d</span>
                              </div>
                            )}

                            {daysOut !== null && r.estimatedDays && daysOut > r.estimatedDays && (
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                                <span style={{ color: 'var(--danger)' }}>Overdue by:</span>
                                <span style={{ fontWeight: 600, color: 'var(--danger)' }}>{daysOut - r.estimatedDays}d</span>
                              </div>
                            )}
                          </>
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

                {/* Follow-up History - Clickable for admin */}
                {(r as any).followUps && Array.isArray((r as any).followUps) && (r as any).followUps.length > 0 && (
                  <div className="ext-notes-area" style={{ padding: '12px 14px', cursor: isAdmin ? 'pointer' : 'default' }} onClick={() => isAdmin && (setEditRepairModal(r), setEditStatus(r.status), setEditReason(''))}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setExpandedFollowUps(expandedFollowUps === r.id ? null : r.id)
                      }}
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

                {/* Actions — slim grid of action buttons */}
                {r.status !== 'returned' && (() => {
                  const actionBtn = (bg: string, color: string): React.CSSProperties => ({
                    padding: '9px 10px',
                    background: bg,
                    border: `1px solid ${color}33`,
                    fontSize: 13,
                    fontWeight: 600,
                    color,
                    cursor: 'pointer',
                    minHeight: 0,
                    whiteSpace: 'nowrap',
                  })
                  return (
                    <div className="ext-actions">
                      <button
                        className="ext-action-extra"
                        onClick={() => openVehicleDetail(r.stockNumber)}
                        disabled={resolving === r.stockNumber}
                        style={{
                          ...actionBtn('#eff6ff', '#1d4ed8'),
                          cursor: resolving === r.stockNumber ? 'wait' : 'pointer',
                          opacity: resolving === r.stockNumber ? 0.6 : 1,
                        }}
                      >View Vehicle</button>
                      <button
                        className="ext-action-extra"
                        onClick={() => setAddPartFor({
                          stockNumber: r.stockNumber,
                          vehicleDesc: `${r.year || ''} ${r.make} ${r.model}`.trim(),
                        })}
                        style={actionBtn('#f3e8ff', '#7c3aed')}
                      >+ Add Part</button>
                      {r.status === 'pending' && (
                        <button
                          onClick={() => {
                            setScheduleModal(r)
                            setScheduleSentDate(new Date().toISOString().split('T')[0])
                            setScheduleEstDays(r.estimatedDays ? String(r.estimatedDays) : '')
                          }}
                          style={{ ...actionBtn('#fffbeb', '#b45309'), fontWeight: 700 }}
                        >Schedule</button>
                      )}
                      {r.status !== 'pending' && (
                        <button
                          onClick={() => setFollowUpModal({
                            repairId: r.id,
                            stockNumber: r.stockNumber,
                            vehicleDesc: `${r.year} ${r.make} ${r.model}`,
                          })}
                          style={actionBtn('#fef2f2', '#ef4444')}
                        >Log Follow-up</button>
                      )}
                      {r.status === 'sent' && (
                        <button
                          onClick={() => updateStatus(r.id, 'in_progress')}
                          style={actionBtn('#f9fafb', '#1a1a1a')}
                        >Mark In Progress</button>
                      )}
                      {r.status === 'in_progress' && (
                        <button
                          onClick={() => updateStatus(r.id, 'ready')}
                          style={actionBtn('#f9fafb', '#1a1a1a')}
                        >Ready for Pickup</button>
                      )}
                      {r.status === 'ready' && (
                        <button
                          onClick={() => { setReconModal(r); setReconStage('mechanic') }}
                          style={actionBtn('#f0fdf4', '#16a34a')}
                        >Mark Returned</button>
                      )}
                    </div>
                  )
                })()}
              </div>
            )
          })}
        </div>
      )}
      {/* Return to Recon Modal — Full Form */}
      {reconModal && (
        <div
          onClick={() => { setReconModal(null); setReconError('') }}
          className="modal-below-topbar"
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
          className="modal-below-topbar"
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
          className="modal-below-topbar"
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

      {/* Edit Repair Modal */}
      {editRepairModal && (
        <div onClick={() => setEditRepairModal(null)} className="modal-below-topbar" style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: 20,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: 16, width: '100%', maxWidth: 480,
            maxHeight: '85vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 20px 60px rgba(0,0,0,0.15)', padding: 24,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Edit Repair</h2>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  #{editRepairModal.stockNumber} — {editRepairModal.year} {editRepairModal.make} {editRepairModal.model}
                </p>
                <button
                  type="button"
                  onClick={() => { openVehicleDetail(editRepairModal.stockNumber); setEditRepairModal(null) }}
                  disabled={resolving === editRepairModal.stockNumber}
                  style={{
                    marginTop: 4, padding: 0, background: 'transparent', border: 'none',
                    color: '#2563eb', fontSize: 13, fontWeight: 600,
                    cursor: resolving === editRepairModal.stockNumber ? 'wait' : 'pointer',
                    opacity: resolving === editRepairModal.stockNumber ? 0.6 : 1,
                    minHeight: 0,
                  }}
                >Vehicle details →</button>
              </div>
              <button
                type="button"
                onClick={() => { setEditRepairModal(null); setEditReason('') }}
                aria-label="Close"
                style={{
                  flexShrink: 0, width: 32, height: 32,
                  background: 'transparent', border: 'none', color: 'var(--text-muted)',
                  fontSize: 24, lineHeight: 1, cursor: 'pointer', padding: 0,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}
              >×</button>
            </div>

            <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Status</label>
                <select value={editStatus} onChange={e => setEditStatus(e.target.value)} id="edit-status" className="input">
                  <option value="pending">Pending Schedule</option>
                  <option value="sent">Scheduled for service</option>
                  <option value="in_progress">In Progress</option>
                  <option value="ready">Ready for Pickup</option>
                  <option value="returned">Returned</option>
                </select>
              </div>
              {editStatus !== editRepairModal.status && (
                <div style={{ padding: '12px 14px', borderRadius: 10, background: '#fffbeb', border: '1px solid #fcd34d' }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#92400e', marginBottom: 6 }}>
                    Reason for status change *
                  </label>
                  <p style={{ fontSize: 12, color: '#92400e', marginBottom: 8, lineHeight: 1.4 }}>
                    You're overriding the normal flow ({STATUS_LABELS[editRepairModal.status]} → {STATUS_LABELS[editStatus]}). This will be logged.
                  </p>
                  <textarea
                    value={editReason}
                    onChange={e => setEditReason(e.target.value)}
                    className="input"
                    rows={2}
                    placeholder="e.g. Marked as In Progress by accident — moving back to Pending."
                    style={{ resize: 'vertical', minHeight: 60, background: '#fff' }}
                  />
                </div>
              )}
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Shop Name</label>
                <input defaultValue={editRepairModal.shopName} id="edit-shop-name" className="input" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Shop Phone</label>
                <input defaultValue={editRepairModal.shopPhone || ''} id="edit-shop-phone" className="input" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Repair Description</label>
                <textarea defaultValue={editRepairModal.repairDescription} id="edit-repair-desc" className="input" rows={3} style={{ resize: 'vertical', minHeight: 80 }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Estimated Days</label>
                <input type="number" defaultValue={editRepairModal.estimatedDays || ''} id="edit-est-days" className="input" style={{ maxWidth: 160 }} />
              </div>
            </div>

            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={async () => {
                const statusChanged = editStatus !== editRepairModal.status
                if (statusChanged && !editReason.trim()) return
                setEditRepairSaving(true)
                try {
                  await fetch(`/api/external/${editRepairModal.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      status: editStatus,
                      shopName: (document.getElementById('edit-shop-name') as HTMLInputElement).value,
                      shopPhone: (document.getElementById('edit-shop-phone') as HTMLInputElement).value,
                      repairDescription: (document.getElementById('edit-repair-desc') as HTMLTextAreaElement).value,
                      estimatedDays: Number((document.getElementById('edit-est-days') as HTMLInputElement).value) || null,
                      ...(statusChanged ? {
                        statusChangeReason: editReason.trim(),
                        fromStatus: editRepairModal.status,
                      } : {}),
                    })
                  })
                  setEditRepairModal(null)
                  setEditReason('')
                  load()
                } catch {}
                setEditRepairSaving(false)
              }} disabled={editRepairSaving || (editStatus !== editRepairModal.status && !editReason.trim())} style={{
                padding: '11px 14px', borderRadius: 10, border: 'none', minHeight: 0,
                background: editRepairSaving ? '#e5e5e5' : '#1a1a1a', color: '#dffd6e',
                fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}>{editRepairSaving ? 'Saving…' : 'Save'}</button>

              {/* Delete as slim text link — tapping opens a confirmation, never deletes directly */}
              <button onClick={() => {
                setDeleteConfirm({
                  id: editRepairModal.id,
                  stock: editRepairModal.stockNumber,
                  vehicle: `${editRepairModal.year} ${editRepairModal.make} ${editRepairModal.model}`,
                })
                setEditRepairModal(null)
              }} style={{
                alignSelf: 'center', padding: '6px 12px', borderRadius: 6,
                background: 'transparent', border: 'none',
                fontSize: 12, fontWeight: 500, cursor: 'pointer',
                color: '#9ca3af',
                textDecoration: 'underline', textDecorationColor: '#fca5a5',
                minHeight: 0,
              }}>Delete this repair</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Part Modal */}
      {addPartFor && (
        <AddPartModal
          stockNumber={addPartFor.stockNumber}
          vehicleDesc={addPartFor.vehicleDesc}
          onClose={() => setAddPartFor(null)}
        />
      )}

      {/* Schedule Modal */}
      {scheduleModal && (
        <div
          onClick={() => !scheduleSaving && setScheduleModal(null)}
          className="modal-below-topbar"
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 16, width: '100%', maxWidth: 440,
              padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
            }}
          >
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Schedule Pickup</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
              #{scheduleModal.stockNumber} — {scheduleModal.year} {scheduleModal.make} {scheduleModal.model}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Date Sent *
                </label>
                <input
                  type="date"
                  className="input"
                  value={scheduleSentDate}
                  onChange={e => setScheduleSentDate(e.target.value)}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Estimated Days *
                </label>
                <input
                  type="number"
                  className="input"
                  placeholder="e.g. 5"
                  value={scheduleEstDays}
                  onChange={e => setScheduleEstDays(e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setScheduleModal(null)}
                disabled={scheduleSaving}
                style={{
                  flex: 1, padding: '12px 0', borderRadius: 10, border: '1px solid var(--border)',
                  background: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!scheduleSentDate || !scheduleEstDays.trim()) return
                  setScheduleSaving(true)
                  try {
                    await fetch(`/api/external/${scheduleModal.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        sentDate: scheduleSentDate,
                        estimatedDays: Number(scheduleEstDays),
                        status: 'sent',
                      }),
                    })
                    setScheduleModal(null)
                    setScheduleSentDate('')
                    setScheduleEstDays('')
                    load()
                  } catch {}
                  setScheduleSaving(false)
                }}
                disabled={scheduleSaving || !scheduleSentDate || !scheduleEstDays.trim()}
                style={{
                  flex: 1, padding: '12px 0', borderRadius: 10, border: 'none',
                  background: '#1a1a1a', color: '#dffd6e',
                  fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  opacity: (scheduleSaving || !scheduleSentDate || !scheduleEstDays.trim()) ? 0.5 : 1,
                }}
              >
                {scheduleSaving ? 'Saving...' : 'Schedule'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div onClick={() => setDeleteConfirm(null)} className="modal-below-topbar" style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: 20,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: 16, width: '100%', maxWidth: 400,
            padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
          }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Delete Repair?</h2>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20 }}>
              #{deleteConfirm.stock} - {deleteConfirm.vehicle}
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24 }}>
              This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setDeleteConfirm(null)} disabled={deleteDeleting} style={{
                flex: 1, padding: '12px 0', borderRadius: 10, border: '1px solid var(--border)',
                background: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}>Cancel</button>
              <button onClick={async () => {
                setDeleteDeleting(true)
                try {
                  await fetch(`/api/external/${deleteConfirm.id}`, { method: 'DELETE' })
                  setDeleteConfirm(null)
                  load()
                } catch {}
                setDeleteDeleting(false)
              }} disabled={deleteDeleting} style={{
                flex: 1, padding: '12px 0', borderRadius: 10, border: 'none',
                background: deleteDeleting ? '#e5e5e5' : '#dc2626', color: '#fff',
                fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}>{deleteDeleting ? 'Deleting...' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
