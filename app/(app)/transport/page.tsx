'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

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
  createdAt: string
}

const STATUS_ORDER = ['requested', 'accepted', 'scheduled', 'in_transit', 'delivered']
const STATUS_LABELS: Record<string, string> = {
  requested: 'Requested',
  accepted: 'Accepted',
  scheduled: 'Scheduled',
  in_transit: 'In Transit',
  delivered: 'Delivered',
}

export default function TransportPage() {
  const [requests, setRequests] = useState<TransportRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

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
      }}>
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
              <Link key={req.id} href={`/transport/${req.id}`}>
                <div className="card">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-semibold">{vehicleName}</p>
                      <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        Requested by {req.requestedBy.name}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {req.urgency === 'rush' && <span className="badge badge-rush">Rush</span>}
                      <span className={`badge badge-${req.status === 'in_transit' ? 'in-progress' : req.status === 'delivered' ? 'done' : req.status === 'accepted' ? 'in-progress' : 'pending'}`}>
                        {STATUS_LABELS[req.status]}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    <span>📍 {req.pickupLocation}</span>
                    <span>→</span>
                    <span>📍 {req.deliveryLocation}</span>
                  </div>
                  {req.transportType && (
                    <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                      {req.transportType === 'internal' ? '🚗 Internal' : '🚚 Third Party'}
                      {req.scheduledDate && ` · Scheduled: ${new Date(req.scheduledDate).toLocaleDateString()}`}
                    </p>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
