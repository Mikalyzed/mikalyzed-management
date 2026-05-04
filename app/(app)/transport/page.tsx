'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type TransportDetail = {
  id: string
  vehicleDescription: string | null
  vehicle: { stockNumber: string; year: number | null; make: string; model: string } | null
  requestedBy: { name: string; email?: string }
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
  trailerType: string | null
  clientName: string | null
  clientPhone: string | null
  purpose: string | null
  purposeNote: string | null
  estimatedPrice: number | null
  createdAt: string
}

type TransportRequest = {
  id: string
  vehicleDescription: string | null
  vehicle: { stockNumber: string; year: number | null; make: string; model: string } | null
  requestedBy: { name: string }
  pickupLocation: string
  deliveryLocation: string
  urgency: string
  status: string
  transportType: string | null
  scheduledDate: string | null
  purpose: string | null
  purposeNote: string | null
  estimatedPrice: number | null
  createdAt: string
}

const PURPOSE_LABELS: Record<string, string> = {
  event: 'Event',
  ship_to_client: 'Ship to Client',
  other: 'Other',
}
const PURPOSE_COLORS: Record<string, { bg: string; fg: string; border: string }> = {
  event: { bg: '#fce7f3', fg: '#be185d', border: '#fbcfe8' },
  ship_to_client: { bg: '#dbeafe', fg: '#1d4ed8', border: '#bfdbfe' },
  other: { bg: '#f3f4f6', fg: '#4b5563', border: '#e5e7eb' },
}

function PurposeBadge({ purpose, purposeNote }: { purpose: string | null; purposeNote: string | null }) {
  if (!purpose) return null
  const c = PURPOSE_COLORS[purpose] || PURPOSE_COLORS.other
  const label = purpose === 'other' && purposeNote ? purposeNote : PURPOSE_LABELS[purpose] || purpose
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100,
      background: c.bg, color: c.fg, border: `1px solid ${c.border}`,
      textTransform: 'uppercase', letterSpacing: '0.04em',
    }}>{label}</span>
  )
}

const STATUS_ORDER = ['requested', 'scheduled', 'in_transit']
const STATUS_LABELS: Record<string, string> = {
  requested: 'Pending',
  accepted: 'Accepted',
  scheduled: 'Scheduled',
  in_transit: 'Vehicle Picked Up',
  delivered: 'Delivered',
}

export default function TransportPage() {
  const [requests, setRequests] = useState<TransportRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const [detail, setDetail] = useState<TransportDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [updating, setUpdating] = useState(false)

  function loadList() {
    fetch('/api/transport')
      .then((r) => r.json())
      .then((data) => setRequests(data.requests || []))
  }

  function openModal(id: string) {
    setOpenId(id)
    setDetail(null)
    setDetailLoading(true)
    fetch(`/api/transport/${id}`)
      .then(r => r.json())
      .then(d => setDetail(d.request))
      .finally(() => setDetailLoading(false))
  }

  async function updateStatus(status: string) {
    if (!openId) return
    setUpdating(true)
    await fetch(`/api/transport/${openId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    const d = await fetch(`/api/transport/${openId}`).then(r => r.json())
    setDetail(d.request)
    loadList()
    setUpdating(false)
  }

  async function updateField(field: string, value: string) {
    if (!openId) return
    await fetch(`/api/transport/${openId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    })
    const d = await fetch(`/api/transport/${openId}`).then(r => r.json())
    setDetail(d.request)
    loadList()
  }

  useEffect(() => {
    fetch('/api/transport')
      .then((r) => r.json())
      .then((data) => setRequests(data.requests || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const filtered = filter === 'all' ? requests : requests.filter((r) => r.status === filter)

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: '60vh' }}>
        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#e0e0e0', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  return (
    <div>
      <style>{`
        @media (max-width: 767px) {
          .transport-card { padding: 18px !important; }
          .transport-locations { flex-direction: column !important; gap: 4px !important; }
          .transport-locations .loc-arrow { display: none; }
          .transport-filter-tabs button { padding: 10px 12px !important; font-size: 12px !important; }
        }
      `}</style>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Transport</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Manage vehicle transport requests
          </p>
        </div>
        <Link href="/transport/new" className="btn btn-primary">
          + New Request
        </Link>
      </div>

      {/* Filter tabs */}
      <div style={{
        display: 'flex',
        gap: '4px',
        marginBottom: '24px',
        padding: '4px',
        background: '#f0f0ec',
        borderRadius: '12px',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
      }} className="transport-filter-tabs">
        {['all', ...STATUS_ORDER].map((s) => {
          const count = s === 'all' ? requests.length : requests.filter(r => r.status === s).length
          const active = filter === s
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              style={{
                flex: 1,
                padding: '10px 16px',
                borderRadius: '9px',
                fontSize: '13px',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                border: 'none',
                minHeight: 'auto',
                transition: 'all 0.15s ease',
                background: active ? '#ffffff' : 'transparent',
                color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                boxShadow: active ? 'var(--shadow-sm)' : 'none',
              }}
            >
              {s === 'all' ? 'All' : STATUS_LABELS[s]}
              {count > 0 && <span style={{ marginLeft: '4px', opacity: 0.5 }}>{count}</span>}
            </button>
          )
        })}
      </div>

      {/* Requests list */}
      {filtered.length === 0 ? (
        <div className="card-flat text-center" style={{ padding: '48px 20px' }}>
          <p className="text-lg mb-1">No transport requests</p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {filter === 'all' ? 'Create one to get started' : `No ${STATUS_LABELS[filter]?.toLowerCase()} requests`}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((req) => {
            const vehicleName = req.vehicle
              ? `${req.vehicle.year} ${req.vehicle.make} ${req.vehicle.model} (#${req.vehicle.stockNumber})`
              : req.vehicleDescription || 'Unknown vehicle'

            return (
              <div key={req.id} onClick={() => openModal(req.id)} style={{ cursor: 'pointer' }}>
                <div className="card transport-card">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-semibold">{vehicleName}</p>
                      <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        Requested by {req.requestedBy.name}
                      </p>
                    </div>
                    <div className="flex gap-2 flex-wrap" style={{ justifyContent: 'flex-end' }}>
                      <PurposeBadge purpose={req.purpose} purposeNote={req.purposeNote} />
                      {req.urgency === 'rush' && <span className="badge badge-rush">Rush</span>}
                      <span className={`badge badge-${req.status === 'in_transit' ? 'in-progress' : req.status === 'delivered' ? 'done' : req.status === 'accepted' ? 'in-progress' : 'pending'}`}>
                        {STATUS_LABELS[req.status]}
                      </span>
                    </div>
                  </div>
                  <div className="transport-locations flex items-center gap-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    <span>📍 {req.pickupLocation}</span>
                    <span className="loc-arrow">→</span>
                    <span>📍 {req.deliveryLocation}</span>
                  </div>
                  {req.transportType && (
                    <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                      {req.transportType === 'internal' ? '🚗 Internal' : '🚚 Third Party'}
                      {req.scheduledDate && ` · Scheduled: ${new Date(req.scheduledDate).toLocaleDateString()}`}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Detail Modal */}
      {openId && (
        <div
          onClick={() => { setOpenId(null); setDetail(null) }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 16, padding: 24,
              width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto',
            }}
          >
            {detailLoading || !detail ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#e0e0e0', borderTopColor: 'transparent' }} />
              </div>
            ) : (() => {
              const vehicleName = detail.vehicle
                ? `${detail.vehicle.year ?? ''} ${detail.vehicle.make} ${detail.vehicle.model} (#${detail.vehicle.stockNumber})`.trim()
                : detail.vehicleDescription || 'Unknown vehicle'
              const currentIdx = STATUS_ORDER.indexOf(detail.status)
              const nextStatus = currentIdx >= 0 && currentIdx < STATUS_ORDER.length - 1 ? STATUS_ORDER[currentIdx + 1] : null
              return (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                    <div>
                      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Transport Request
                      </p>
                      <h2 style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{vehicleName}</h2>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                        Requested by {detail.requestedBy.name} · {new Date(detail.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', flexShrink: 0 }}>
                      <PurposeBadge purpose={detail.purpose} purposeNote={detail.purposeNote} />
                      {detail.urgency === 'rush' && <span className="badge badge-rush">Rush</span>}
                      <span className={`badge badge-${detail.status === 'in_transit' ? 'in-progress' : detail.status === 'delivered' ? 'done' : 'pending'}`}>
                        {STATUS_LABELS[detail.status] || detail.status}
                      </span>
                    </div>
                  </div>

                  {/* Status flow */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20 }}>
                    {STATUS_ORDER.map((s, i) => {
                      const reached = STATUS_ORDER.indexOf(detail.status) >= i
                      return (
                        <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                          <div style={{
                            width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                            background: reached ? '#16a34a' : '#e5e7eb',
                            color: '#fff', fontSize: 11, fontWeight: 700,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>{reached ? '✓' : i + 1}</div>
                          <span style={{ fontSize: 11, fontWeight: 600, color: reached ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                            {STATUS_LABELS[s]}
                          </span>
                          {i < STATUS_ORDER.length - 1 && (
                            <div style={{ flex: 1, height: 2, background: STATUS_ORDER.indexOf(detail.status) > i ? '#16a34a' : '#e5e7eb' }} />
                          )}
                        </div>
                      )
                    })}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                    <div>
                      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Pickup</p>
                      <p style={{ fontSize: 14 }}>{detail.pickupLocation}</p>
                    </div>
                    <div>
                      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Delivery</p>
                      <p style={{ fontSize: 14 }}>{detail.deliveryLocation}</p>
                    </div>
                    {(detail.clientName || detail.clientPhone) && (
                      <div>
                        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Client</p>
                        <p style={{ fontSize: 14 }}>{detail.clientName} {detail.clientPhone ? `· ${detail.clientPhone}` : ''}</p>
                      </div>
                    )}
                    {detail.scheduledDate && (
                      <div>
                        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Scheduled</p>
                        <p style={{ fontSize: 14 }}>{new Date(detail.scheduledDate).toLocaleDateString()}</p>
                      </div>
                    )}
                    {detail.purpose === 'ship_to_client' && detail.estimatedPrice != null && (
                      <div>
                        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Estimated Price</p>
                        <p style={{ fontSize: 14, fontWeight: 600 }}>${Number(detail.estimatedPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      </div>
                    )}
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Carrier / Driver</label>
                    <input
                      defaultValue={detail.carrierInfo || ''}
                      onBlur={(e) => e.target.value !== (detail.carrierInfo || '') && updateField('carrierInfo', e.target.value)}
                      placeholder="Name, company, phone..."
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, marginTop: 4 }}
                    />
                  </div>

                  {detail.notes && (
                    <div style={{ marginBottom: 12 }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Notes</p>
                      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{detail.notes}</p>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                    <button
                      onClick={() => { setOpenId(null); setDetail(null) }}
                      style={{ flex: 1, padding: 12, borderRadius: 10, border: '1px solid var(--border)', background: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                    >
                      Close
                    </button>
                    {nextStatus && (
                      <button
                        onClick={() => updateStatus(nextStatus)}
                        disabled={updating}
                        style={{
                          flex: 1, padding: 12, borderRadius: 10, border: 'none',
                          background: '#1a1a1a', color: '#dffd6e', fontSize: 14, fontWeight: 600,
                          cursor: 'pointer', opacity: updating ? 0.5 : 1,
                        }}
                      >
                        {updating ? 'Updating...' : `Mark as ${STATUS_LABELS[nextStatus]}`}
                      </button>
                    )}
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
