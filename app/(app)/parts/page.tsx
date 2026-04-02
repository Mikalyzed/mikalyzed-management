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
  requestedBy: {
    id: string
    name: string
  }
  assignedTo: {
    id: string
    name: string
  } | null
}

const STATUS_LABELS: Record<string, string> = {
  requested: 'Requested',
  sourced: 'Sourced',
  ordered: 'Ordered',
  received: 'Received',
}

const STATUS_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  requested: { bg: '#fef2f2', color: '#ef4444', border: '#fecaca' },
  sourced: { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
  ordered: { bg: '#fefce8', color: '#eab308', border: '#fde047' },
  received: { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
}

export default function PartsOverviewPage() {
  const [parts, setParts] = useState<Part[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [updating, setUpdating] = useState<string | null>(null)

  function load() {
    const params = new URLSearchParams()
    if (filter !== 'all') {
      params.set('status', filter)
    }
    
    fetch(`/api/parts?${params}`)
      .then(r => r.json())
      .then(data => setParts(data.parts || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [filter])

  async function updateStatus(partId: string, newStatus: string) {
    setUpdating(partId)
    try {
      const response = await fetch(`/api/parts/${partId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      })
      
      if (response.ok) {
        load() // Refresh the list
      } else {
        console.error('Failed to update part status')
      }
    } catch (error) {
      console.error('Error updating part status:', error)
    }
    setUpdating(null)
  }

  const filteredParts = parts.filter(part => {
    if (filter === 'all') return true
    return part.status === filter
  })

  const counts = {
    all: parts.length,
    requested: parts.filter(p => p.status === 'requested').length,
    sourced: parts.filter(p => p.status === 'sourced').length,
    ordered: parts.filter(p => p.status === 'ordered').length,
    received: parts.filter(p => p.status === 'received').length,
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-center" style={{ minHeight: '60vh' }}>
          <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#e8e8e4', borderTopColor: 'transparent' }} />
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, letterSpacing: '-0.02em' }}>Parts Management</h1>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', overflowX: 'auto', paddingBottom: '2px' }}>
        {[
          { key: 'all', label: 'All' },
          { key: 'requested', label: 'Requested' },
          { key: 'sourced', label: 'Sourced' },
          { key: 'ordered', label: 'Ordered' },
          { key: 'received', label: 'Received' }
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: '1px solid',
              borderColor: filter === tab.key ? '#1a1a1a' : 'var(--border)',
              background: filter === tab.key ? '#1a1a1a' : '#fff',
              color: filter === tab.key ? '#dffd6e' : 'var(--text-secondary)',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {tab.label}
            <span style={{
              background: filter === tab.key ? 'rgba(223, 253, 110, 0.2)' : 'var(--border)',
              color: filter === tab.key ? '#dffd6e' : 'var(--text-muted)',
              fontSize: '12px',
              fontWeight: 600,
              padding: '2px 6px',
              borderRadius: '4px',
              minWidth: '20px',
              textAlign: 'center'
            }}>
              {counts[tab.key as keyof typeof counts]}
            </span>
          </button>
        ))}
      </div>

      {filteredParts.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '80px 24px',
          color: 'var(--text-muted)'
        }}>
          <p style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>No parts found</p>
          <p style={{ fontSize: '14px' }}>
            {filter === 'all' ? 'No parts have been requested yet.' : `No parts with status "${STATUS_LABELS[filter]}".`}
          </p>
        </div>
      ) : (
        <div style={{
          background: '#ffffff',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          overflow: 'hidden'
        }}>
          {filteredParts.map((part, index) => {
            const statusStyle = STATUS_COLORS[part.status] || STATUS_COLORS.requested
            const vehicleDesc = `${part.vehicle.year} ${part.vehicle.make} ${part.vehicle.model}`
            
            return (
              <div
                key={part.id}
                style={{
                  padding: '20px 24px',
                  borderBottom: index < filteredParts.length - 1 ? '1px solid var(--border)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px'
                }}
              >
                {/* Vehicle info */}
                <div style={{ flex: '1', minWidth: '200px' }}>
                  <Link
                    href={`/vehicles/${part.vehicle.id}`}
                    style={{
                      fontSize: '15px',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      textDecoration: 'none',
                      display: 'block',
                      marginBottom: '4px'
                    }}
                  >
                    {vehicleDesc}
                  </Link>
                  <p style={{
                    fontSize: '13px',
                    color: 'var(--text-muted)',
                    margin: 0
                  }}>
                    Stock #{part.vehicle.stockNumber}
                    {part.vehicle.color && ` • ${part.vehicle.color}`}
                  </p>
                </div>

                {/* Part info */}
                <div style={{ flex: '1.5', minWidth: '250px' }}>
                  <p style={{
                    fontSize: '15px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    margin: '0 0 4px 0'
                  }}>
                    {part.name}
                  </p>
                  {part.url && (
                    <a
                      href={part.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: '13px',
                        color: '#2563eb',
                        textDecoration: 'none',
                        display: 'block',
                        marginBottom: '4px'
                      }}
                    >
                      View Link →
                    </a>
                  )}
                  <p style={{
                    fontSize: '13px',
                    color: 'var(--text-muted)',
                    margin: 0
                  }}>
                    Requested by {part.requestedBy.name}
                    {part.assignedTo && ` • Assigned to ${part.assignedTo.name}`}
                  </p>
                </div>

                {/* Status and price */}
                <div style={{ minWidth: '120px' }}>
                  <div style={{
                    ...statusStyle,
                    padding: '4px 8px',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 600,
                    textAlign: 'center',
                    marginBottom: '8px',
                    border: `1px solid ${statusStyle.border}`
                  }}>
                    {STATUS_LABELS[part.status]}
                  </div>
                  {part.price && (
                    <p style={{
                      fontSize: '13px',
                      color: 'var(--text-secondary)',
                      margin: 0,
                      textAlign: 'center'
                    }}>
                      {part.price}
                    </p>
                  )}
                </div>

                {/* Status actions */}
                <div style={{ minWidth: '120px' }}>
                  <select
                    value={part.status}
                    onChange={(e) => updateStatus(part.id, e.target.value)}
                    disabled={updating === part.id}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      fontSize: '13px',
                      background: '#fff',
                      cursor: updating === part.id ? 'not-allowed' : 'pointer'
                    }}
                  >
                    <option value="requested">Requested</option>
                    <option value="sourced">Sourced</option>
                    <option value="ordered">Ordered</option>
                    <option value="received">Received</option>
                  </select>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}