'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Part = {
  id: string
  name: string
  url: string | null
  status: string
  price: string | null
  tracking: string | null
  notes: string | null
  createdAt: string
  vehicle: {
    id: string
    stockNumber: string
    year: number | null
    make: string
    model: string
    color: string | null
  }
  requestedBy: { id: string; name: string }
  assignedTo: { id: string; name: string } | null
}

const STATUS_LABELS: Record<string, string> = {
  requested: 'Requested',
  sourced: 'Pending Approval',
  ready_to_order: 'Ready to Order',
  ordered: 'Ordered',
  received: 'Received',
}

const STATUS_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  requested: { bg: '#fef2f2', color: '#ef4444', border: '#fecaca' },
  sourced: { bg: '#fef9c3', color: '#a16207', border: '#fde047' },
  ready_to_order: { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
  ordered: { bg: '#fefce8', color: '#eab308', border: '#fde047' },
  received: { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
}

export default function PartsOverviewPage() {
  const [parts, setParts] = useState<Part[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [saving, setSaving] = useState<string | null>(null)

  function load() {
    const params = new URLSearchParams()
    if (filter !== 'all') params.set('status', filter)
    fetch(`/api/parts?${params}`)
      .then(r => r.json())
      .then(data => setParts(data.parts || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [filter])

  async function updatePart(partId: string, updates: Record<string, unknown>) {
    setSaving(partId)
    try {
      const res = await fetch(`/api/parts/${partId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      })
      if (res.ok) load()
    } catch (e) { console.error(e) }
    setSaving(null)
  }

  const counts: Record<string, number> = {
    all: parts.length,
    requested: parts.filter(p => p.status === 'requested').length,
    sourced: parts.filter(p => p.status === 'sourced').length,
    ready_to_order: parts.filter(p => p.status === 'ready_to_order').length,
    ordered: parts.filter(p => p.status === 'ordered').length,
    received: parts.filter(p => p.status === 'received').length,
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ width: 20, height: 20, border: '2px solid #e8e8e4', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  return (
    <div>
      <h1 style={{ fontSize: '24px', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '24px' }}>Parts Management</h1>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', overflowX: 'auto', paddingBottom: '2px' }}>
        {[
          { key: 'all', label: 'All' },
          { key: 'requested', label: 'Requested' },
          { key: 'sourced', label: 'Pending Approval' },
          { key: 'ready_to_order', label: 'Ready to Order' },
          { key: 'ordered', label: 'Ordered' },
          { key: 'received', label: 'Received' }
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            style={{
              padding: '8px 16px', borderRadius: '8px',
              border: `1px solid ${filter === tab.key ? '#1a1a1a' : 'var(--border)'}`,
              background: filter === tab.key ? '#1a1a1a' : '#fff',
              color: filter === tab.key ? '#dffd6e' : 'var(--text-secondary)',
              fontSize: '14px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
              display: 'flex', alignItems: 'center', gap: '6px',
            }}
          >
            {tab.label}
            {counts[tab.key] > 0 && (
              <span style={{
                background: filter === tab.key ? 'rgba(223,253,110,0.2)' : 'var(--border)',
                color: filter === tab.key ? '#dffd6e' : 'var(--text-muted)',
                fontSize: '12px', fontWeight: 600, padding: '2px 6px', borderRadius: '4px',
              }}>{counts[tab.key]}</span>
            )}
          </button>
        ))}
      </div>

      {parts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 24px', color: 'var(--text-muted)' }}>
          <p style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>No parts found</p>
          <p style={{ fontSize: '14px' }}>
            {filter === 'all' ? 'No parts have been requested yet.' : `No parts with status "${STATUS_LABELS[filter]}".`}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {parts.map((part) => {
            const ss = STATUS_COLORS[part.status] || STATUS_COLORS.requested
            const vehicleDesc = `${part.vehicle.year || ''} ${part.vehicle.make} ${part.vehicle.model}`.trim()

            return (
              <div key={part.id} style={{
                background: '#fff', border: '1px solid var(--border)', borderRadius: '12px',
                padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px',
                flexWrap: 'wrap',
              }}>
                {/* Vehicle */}
                <div style={{ minWidth: '160px', flex: '0 0 auto' }}>
                  <Link href={`/vehicles/${part.vehicle.id}`} style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', textDecoration: 'none' }}>
                    {vehicleDesc}
                  </Link>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0' }}>#{part.vehicle.stockNumber}</p>
                </div>

                {/* Part info */}
                <div style={{ flex: 1, minWidth: '180px' }}>
                  <p style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>{part.name}</p>
                  {part.url && (
                    <a href={part.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px', color: '#2563eb', textDecoration: 'none', wordBreak: 'break-all' }}>
                      {part.url.length > 50 ? part.url.slice(0, 50) + '...' : part.url}
                    </a>
                  )}
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                    by {part.requestedBy.name}{part.price ? ` • ${part.price}` : ''}
                  </p>
                </div>

                {/* Status badge */}
                <div style={{
                  background: ss.bg, color: ss.color, border: `1px solid ${ss.border}`,
                  padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}>
                  {STATUS_LABELS[part.status]}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  {part.status === 'sourced' && (
                    <>
                      <button onClick={() => updatePart(part.id, { status: 'ready_to_order' })} disabled={saving === part.id} style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #16a34a', background: '#f0fdf4', color: '#16a34a', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>✓ Approve</button>
                      <button onClick={() => updatePart(part.id, { status: 'requested', url: null })} disabled={saving === part.id} style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #ef4444', background: '#fef2f2', color: '#ef4444', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>✗ Decline</button>
                    </>
                  )}
                  {part.status === 'ready_to_order' && (
                    <button onClick={() => updatePart(part.id, { status: 'ordered' })} disabled={saving === part.id} style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #eab308', background: '#fefce8', color: '#a16207', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Mark Ordered</button>
                  )}
                  {part.status === 'ordered' && (
                    <button onClick={() => updatePart(part.id, { status: 'received' })} disabled={saving === part.id} style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #16a34a', background: '#f0fdf4', color: '#16a34a', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Mark Received</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
