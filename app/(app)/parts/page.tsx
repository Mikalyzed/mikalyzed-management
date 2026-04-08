'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import OrderPartModal from '@/components/OrderPartModal'

type Part = {
  id: string
  name: string
  url: string | null
  status: string
  price: string | null
  tracking: string | null
  expectedDelivery: string | null
  orderImage: string | null
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
  const [filter, setFilter] = useState('active')
  const [saving, setSaving] = useState<string | null>(null)
  const [addingUrlId, setAddingUrlId] = useState<string | null>(null)
  const [urlInput, setUrlInput] = useState('')
  const [orderModalPart, setOrderModalPart] = useState<{ id: string; name: string } | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [editingPart, setEditingPart] = useState<Part | null>(null)
  const [editTracking, setEditTracking] = useState('')
  const [editDelivery, setEditDelivery] = useState('')
  const [editImage, setEditImage] = useState<string | null>(null)
  const [editUploading, setEditUploading] = useState(false)

  function load() {
    fetch('/api/parts')
      .then(r => r.json())
      .then(data => { setParts(data.parts || []); setIsAdmin(data.userRole === 'admin') })
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

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
    active: parts.filter(p => p.status !== 'received').length,
    requested: parts.filter(p => p.status === 'requested').length,
    sourced: parts.filter(p => p.status === 'sourced').length,
    ready_to_order: parts.filter(p => p.status === 'ready_to_order').length,
    ordered: parts.filter(p => p.status === 'ordered').length,
    received: parts.filter(p => p.status === 'received').length,
  }

  const filtered = (() => {
    let list = filter === 'active' ? parts.filter(p => p.status !== 'received') : parts.filter(p => p.status === filter)
    // Sort ordered parts by expected delivery (soonest first, null at end)
    if (filter === 'ordered' || filter === 'active') {
      list = [...list].sort((a, b) => {
        if (a.status === 'ordered' && b.status === 'ordered') {
          if (!a.expectedDelivery && !b.expectedDelivery) return 0
          if (!a.expectedDelivery) return 1
          if (!b.expectedDelivery) return -1
          return new Date(a.expectedDelivery).getTime() - new Date(b.expectedDelivery).getTime()
        }
        return 0
      })
    }
    return list
  })()

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
          { key: 'active', label: 'Active' },
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

      {/* Arriving Today banner */}
      {(() => {
        const today = new Date().toISOString().slice(0, 10)
        const arrivingToday = parts.filter(p => p.status === 'ordered' && p.expectedDelivery && p.expectedDelivery.slice(0, 10) <= today)
        if (arrivingToday.length === 0 || (filter !== 'ordered' && filter !== 'active')) return null
        return (
          <div style={{
            background: '#fefce8', border: '1px solid #eab308', borderRadius: 10,
            padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#92400e' }}>
              {arrivingToday.length} part{arrivingToday.length > 1 ? 's' : ''} expected today or overdue
            </span>
            <span style={{ fontSize: 12, color: '#a16207' }}>
              {arrivingToday.map(p => p.name).join(', ')}
            </span>
          </div>
        )
      })()}

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 24px', color: 'var(--text-muted)' }}>
          <p style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>No parts found</p>
          <p style={{ fontSize: '14px' }}>
            {filter === 'active' ? 'No active parts.' : `No parts with status "${STATUS_LABELS[filter]}".`}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filtered.map((part) => {
            const ss = STATUS_COLORS[part.status] || STATUS_COLORS.requested
            const vehicleDesc = `${part.vehicle.year || ''} ${part.vehicle.make} ${part.vehicle.model}`.trim()

            return (
              <div key={part.id} onClick={() => {
                if (isAdmin && part.status === 'ordered') {
                  setEditingPart(part); setEditTracking(part.tracking || ''); setEditDelivery(part.expectedDelivery ? part.expectedDelivery.slice(0, 10) : ''); setEditImage(part.orderImage || null)
                }
              }} style={{
                background: '#fff', border: '1px solid var(--border)', borderRadius: '12px',
                padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px',
                cursor: isAdmin && part.status === 'ordered' ? 'pointer' : 'default',
              }}>
                {/* Vehicle */}
                <div style={{ width: '220px', flex: '0 0 220px' }}>
                  <Link href={`/vehicles/${part.vehicle.id}`} style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', textDecoration: 'none' }}>
                    {vehicleDesc}
                  </Link>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0' }}>#{part.vehicle.stockNumber}</p>
                </div>

                {/* Part info */}
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>{part.name}</p>
                  {part.url && (
                    <a href={part.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px', color: '#2563eb', textDecoration: 'none', wordBreak: 'break-all' }}>
                      {part.url.length > 50 ? part.url.slice(0, 50) + '...' : part.url}
                    </a>
                  )}
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                    by {part.requestedBy.name}{part.price ? ` • ${part.price}` : ''}
                  </p>
                  {part.status === 'ordered' && part.expectedDelivery && (
                    <p style={{ fontSize: '12px', color: '#2563eb', margin: '2px 0 0', fontWeight: 500 }}>
                      Expected: {new Date(part.expectedDelivery).toLocaleDateString()}
                    </p>
                  )}
                </div>

                {/* Status badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                  <div style={{
                    background: ss.bg, color: ss.color, border: `1px solid ${ss.border}`,
                    padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}>
                    {STATUS_LABELS[part.status]}
                  </div>
                  {part.status === 'ordered' && !part.tracking && !part.orderImage && (
                    <span style={{ fontSize: '11px', color: '#ef4444', fontWeight: 600, whiteSpace: 'nowrap' }}>Needs info</span>
                  )}
                </div>

                {/* Actions */}
                <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  {part.status === 'requested' && !part.url && (
                    <button onClick={() => { setAddingUrlId(part.id); setUrlInput('') }} style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #2563eb', background: '#eff6ff', color: '#2563eb', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Add Link</button>
                  )}
                  {isAdmin && part.status === 'sourced' && (
                    <>
                      <button onClick={() => updatePart(part.id, { status: 'ready_to_order' })} disabled={saving === part.id} style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #16a34a', background: '#f0fdf4', color: '#16a34a', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>✓ Approve</button>
                      <button onClick={() => updatePart(part.id, { status: 'requested', url: null })} disabled={saving === part.id} style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #ef4444', background: '#fef2f2', color: '#ef4444', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>✗ Decline</button>
                    </>
                  )}
                  {isAdmin && part.status === 'ready_to_order' && (
                    <button onClick={() => setOrderModalPart({ id: part.id, name: part.name })} disabled={saving === part.id} style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #eab308', background: '#fefce8', color: '#a16207', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Mark Ordered</button>
                  )}
                  {part.status === 'ordered' && (
                    <button onClick={() => updatePart(part.id, { status: 'received' })} disabled={saving === part.id} style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #16a34a', background: '#f0fdf4', color: '#16a34a', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Mark Received</button>
                  )}
                </div>
                {/* Inline URL input */}
                {addingUrlId === part.id && (
                  <div style={{ display: 'flex', gap: '8px', width: '100%', marginTop: '8px' }}>
                    <input type="url" value={urlInput} onChange={e => setUrlInput(e.target.value)} placeholder="Paste part link here..." autoFocus
                      onKeyDown={async e => { if (e.key === 'Enter' && urlInput.trim()) { e.preventDefault(); await updatePart(part.id, { url: urlInput }); setAddingUrlId(null); setUrlInput('') } }}
                      style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '13px' }} />
                    <button onClick={() => { setAddingUrlId(null); setUrlInput('') }} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: '#fff', fontSize: '12px', cursor: 'pointer' }}>Cancel</button>
                    <button onClick={async () => { if (!urlInput.trim()) return; await updatePart(part.id, { url: urlInput }); setAddingUrlId(null); setUrlInput('') }}
                      disabled={!urlInput.trim()} style={{ padding: '8px 12px', borderRadius: '6px', border: 'none', background: '#1a1a1a', color: '#dffd6e', fontSize: '12px', fontWeight: 600, cursor: 'pointer', opacity: !urlInput.trim() ? 0.5 : 1 }}>Submit</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      {orderModalPart && (
        <OrderPartModal partId={orderModalPart.id} partName={orderModalPart.name} onClose={() => setOrderModalPart(null)} onComplete={load} />
      )}
      {editingPart && (
        <div onClick={() => setEditingPart(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 420, padding: '24px', boxShadow: '0 -4px 30px rgba(0,0,0,0.15)' }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>Edit Ordered Part</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>{editingPart.name}</p>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Tracking Number</label>
              <input type="text" value={editTracking} onChange={e => setEditTracking(e.target.value)} placeholder="Enter tracking number..."
                style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14 }} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Expected Delivery Date</label>
              <input type="date" value={editDelivery} onChange={e => setEditDelivery(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14 }} />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Order Confirmation / Receipt</label>
              {editImage ? (
                <div>
                  <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', cursor: 'pointer' }}
                    onClick={() => window.open(editImage, '_blank')}>
                    <img src={editImage} alt="Order confirmation" style={{ width: '100%', maxHeight: 200, objectFit: 'contain', background: '#f9fafb' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button onClick={() => window.open(editImage, '_blank')} style={{
                      flex: 1, padding: '6px 0', borderRadius: 6, border: '1px solid var(--border)',
                      background: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: 'var(--text-secondary)',
                    }}>View Full Size</button>
                    <a href={editImage} download={`receipt-${editingPart?.name?.replace(/\s+/g, '-')}`} style={{
                      flex: 1, padding: '6px 0', borderRadius: 6, border: '1px solid var(--border)',
                      background: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: 'var(--text-secondary)',
                      textAlign: 'center', textDecoration: 'none',
                    }}>Download</a>
                    <button onClick={() => setEditImage(null)} style={{
                      padding: '6px 10px', borderRadius: 6, border: '1px solid #fca5a5',
                      background: '#fef2f2', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#ef4444',
                    }}>Remove</button>
                  </div>
                </div>
              ) : (
                <label
                  onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#2563eb' }}
                  onDragLeave={e => { e.preventDefault(); e.currentTarget.style.borderColor = '' }}
                  onDrop={async e => {
                    e.preventDefault(); e.currentTarget.style.borderColor = ''
                    const file = e.dataTransfer.files?.[0]
                    if (!file) return
                    setEditUploading(true)
                    try {
                      const formData = new FormData()
                      formData.append('file', file)
                      const res = await fetch('/api/upload', { method: 'POST', body: formData })
                      const data = await res.json()
                      if (res.ok) setEditImage(data.url)
                    } catch { /* ignore */ }
                    setEditUploading(false)
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    padding: '20px', borderRadius: 8, border: '2px dashed var(--border)',
                    background: '#f9fafb', cursor: 'pointer', fontSize: 14, color: 'var(--text-muted)',
                    transition: 'border-color 0.15s',
                  }}>
                  <input type="file" accept="image/*,.pdf" onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    setEditUploading(true)
                    try {
                      const formData = new FormData()
                      formData.append('file', file)
                      const res = await fetch('/api/upload', { method: 'POST', body: formData })
                      const data = await res.json()
                      if (res.ok) setEditImage(data.url)
                    } catch { /* ignore */ }
                    setEditUploading(false)
                  }} style={{ display: 'none' }} />
                  {editUploading ? 'Uploading...' : 'Click or drag file here'}
                </label>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setEditingPart(null)} style={{
                flex: 1, padding: '12px 0', borderRadius: 10, border: '1px solid var(--border)',
                background: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}>Cancel</button>
              <button onClick={async () => {
                setSaving(editingPart.id)
                await updatePart(editingPart.id, {
                  tracking: editTracking.trim() || null,
                  expectedDelivery: editDelivery || null,
                  orderImage: editImage || null,
                })
                setEditingPart(null)
              }} disabled={saving === editingPart.id} style={{
                flex: 1, padding: '12px 0', borderRadius: 10, border: 'none',
                background: '#1a1a1a', color: '#dffd6e', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                opacity: saving === editingPart.id ? 0.5 : 1,
              }}>{saving === editingPart.id ? 'Saving...' : 'Save'}</button>
            </div>

            <button onClick={async () => {
              if (!confirm('Delete this part?')) return
              setSaving(editingPart.id)
              await fetch(`/api/parts/${editingPart.id}`, { method: 'DELETE' })
              setSaving(null)
              setEditingPart(null)
              load()
            }} disabled={saving === editingPart.id} style={{
              width: '100%', marginTop: 12, padding: '10px 0', borderRadius: 10,
              border: '1px solid #fca5a5', background: '#fef2f2', color: '#ef4444',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>Delete Part</button>
          </div>
        </div>
      )}
    </div>
  )
}
