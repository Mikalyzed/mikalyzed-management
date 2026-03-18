'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

type TransportDetail = {
  id: string
  vehicleDescription: string | null
  vehicle: { stockNumber: string; year: number | null; make: string; model: string } | null
  requestedBy: { name: string; email: string }
  coordinator: { name: string } | null
  pickupLocation: string
  deliveryLocation: string
  urgency: string
  preferredDate: string | null
  transportType: string | null
  status: string
  carrierInfo: string | null
  scheduledDate: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

const STATUS_FLOW = ['requested', 'accepted', 'scheduled', 'in_transit', 'delivered']
const STATUS_LABELS: Record<string, string> = {
  requested: 'Requested',
  accepted: 'Accepted',
  scheduled: 'Scheduled',
  in_transit: 'In Transit',
  delivered: 'Delivered',
}

export default function TransportDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const [req, setReq] = useState<TransportDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)

  function load() {
    fetch(`/api/transport/${id}`)
      .then((r) => r.json())
      .then((data) => setReq(data.request))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [id])

  async function updateStatus(status: string) {
    setUpdating(true)
    await fetch(`/api/transport/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    load()
    setUpdating(false)
  }

  async function updateField(field: string, value: string) {
    await fetch(`/api/transport/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
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
  if (!req) return <p style={{ color: 'var(--danger)' }}>Request not found</p>

  const vehicleName = req.vehicle
    ? `${req.vehicle.year} ${req.vehicle.make} ${req.vehicle.model} (#${req.vehicle.stockNumber})`
    : req.vehicleDescription || 'Unknown vehicle'

  const currentIdx = STATUS_FLOW.indexOf(req.status)
  const nextStatus = currentIdx < STATUS_FLOW.length - 1 ? STATUS_FLOW[currentIdx + 1] : null

  return (
    <div className="max-w-2xl mx-auto">
      <button onClick={() => router.back()} className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
        ← Back to Transport
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{vehicleName}</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Requested by {req.requestedBy.name} · {new Date(req.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex gap-2">
          {req.urgency === 'rush' && <span className="badge badge-rush">Rush</span>}
          <span className={`badge badge-${req.status === 'in_transit' ? 'in-progress' : req.status === 'delivered' ? 'done' : req.status === 'accepted' ? 'in-progress' : 'pending'}`}>
            {STATUS_LABELS[req.status]}
          </span>
        </div>
      </div>

      {/* Status timeline */}
      <div className="card mb-6">
        <p className="form-label mb-3">Status Progress</p>
        <div className="flex items-center gap-2">
          {STATUS_FLOW.map((s, i) => {
            const done = STATUS_FLOW.indexOf(req.status) >= i
            return (
              <div key={s} className="flex items-center gap-2 flex-1">
                <div className="flex-1 text-center">
                  <div className="w-8 h-8 rounded-full mx-auto mb-1 flex items-center justify-center text-xs font-bold"
                    style={{
                      background: done ? 'var(--success)' : 'var(--border)',
                      color: done ? '#fff' : 'var(--text-muted)',
                    }}>
                    {done ? '✓' : i + 1}
                  </div>
                  <p className="text-xs font-medium" style={{ color: done ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                    {STATUS_LABELS[s]}
                  </p>
                </div>
                {i < STATUS_FLOW.length - 1 && (
                  <div className="h-0.5 flex-shrink-0" style={{
                    width: '24px',
                    background: STATUS_FLOW.indexOf(req.status) > i ? 'var(--success)' : 'var(--border)',
                  }} />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="card">
          <p className="form-label">Pickup</p>
          <p className="font-semibold">{req.pickupLocation}</p>
        </div>
        <div className="card">
          <p className="form-label">Delivery</p>
          <p className="font-semibold">{req.deliveryLocation}</p>
        </div>
      </div>

      {/* Coordinator controls */}
      <div className="card mb-6">
        <p className="form-label mb-3">Coordinator Actions</p>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Transport Type</label>
            <select className="input mt-1" style={{ appearance: 'auto' }}
              value={req.transportType || ''}
              onChange={(e) => updateField('transportType', e.target.value)}>
              <option value="">Select...</option>
              <option value="internal">Internal</option>
              <option value="third_party">Third Party</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Scheduled Date</label>
            <input type="date" className="input mt-1"
              value={req.scheduledDate ? req.scheduledDate.split('T')[0] : ''}
              onChange={(e) => updateField('scheduledDate', e.target.value)} />
          </div>
        </div>
        <div className="mb-4">
          <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Carrier / Driver Info</label>
          <input className="input mt-1" placeholder="Name, company, phone..."
            defaultValue={req.carrierInfo || ''}
            onBlur={(e) => updateField('carrierInfo', e.target.value)} />
        </div>

        {nextStatus && (
          <button onClick={() => updateStatus(nextStatus)} disabled={updating}
            className="btn btn-primary w-full" style={updating ? { opacity: 0.5 } : {}}>
            {updating ? 'Updating...' : nextStatus === 'accepted' ? 'Accept Request' : `Mark as ${STATUS_LABELS[nextStatus]}`}
          </button>
        )}

        {req.status === 'delivered' && (
          <div className="text-center py-3" style={{ color: 'var(--success)' }}>
            <p className="font-semibold">✓ Delivered</p>
          </div>
        )}
      </div>

      {/* Notes */}
      {req.notes && (
        <div className="card">
          <p className="form-label">Notes</p>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{req.notes}</p>
        </div>
      )}
    </div>
  )
}
