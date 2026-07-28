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
  updatedAt: string
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

const PRT_CSS = `
.prt-btn {
  display: inline-flex; align-items: center; gap: 6px;
  border: 1px solid var(--border); background: var(--bg-card); color: var(--text-primary);
  border-radius: 9px; padding: 6px 13px; font-size: 12.5px; font-weight: 600;
  cursor: pointer; min-height: 0; white-space: nowrap;
  transition: background 0.15s ease, border-color 0.15s ease, transform 0.05s ease;
}
.prt-btn:hover { background: var(--bg-card-hover); border-color: #ddddd8; }
.prt-btn:active { transform: scale(0.98); }
.prt-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.prt-btn-dark { border: 1px solid #1a1a1a; background: #1a1a1a; color: #fff; }
.prt-btn-dark:hover { background: #2e2e2e; border-color: #2e2e2e; }
.prt-btn-danger { color: #b91c1c; }
.prt-btn-danger:hover { background: #fef2f2; border-color: rgba(185,28,28,0.35); }
.prt-tab {
  display: inline-flex; align-items: center; gap: 6px;
  border: 1px solid var(--border); background: var(--bg-card); color: var(--text-secondary);
  border-radius: 100px; padding: 7px 15px; font-size: 13px; font-weight: 600;
  cursor: pointer; min-height: 0; white-space: nowrap;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.prt-tab:hover { background: var(--bg-card-hover); }
.prt-tab.on { background: #1a1a1a; border-color: #1a1a1a; color: #fff; }
`

export default function PartsOverviewPage() {
  const [parts, setParts] = useState<Part[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('active')
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState<string | null>(null)
  const [addingUrlId, setAddingUrlId] = useState<string | null>(null)
  const [urlInput, setUrlInput] = useState('')
  const [orderModalPart, setOrderModalPart] = useState<{ id: string; name: string } | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [myRole, setMyRole] = useState<string>('')
  const [showAddPart, setShowAddPart] = useState(false)
  const [boughtPart, setBoughtPart] = useState<{ id: string; name: string } | null>(null)
  const [editingPart, setEditingPart] = useState<Part | null>(null)
  const [editTracking, setEditTracking] = useState('')
  const [editDelivery, setEditDelivery] = useState('')
  const [editImage, setEditImage] = useState<string | null>(null)
  const [editUploading, setEditUploading] = useState(false)
  const [users, setUsers] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    fetch('/api/users').then(r => r.json()).then((d) => {
      setUsers((d.users || d).filter((u: { isActive?: boolean }) => u.isActive !== false).map((u: { id: string; name: string }) => ({ id: u.id, name: u.name })))
    }).catch(() => {})
  }, [])

  // Scroll to + highlight a specific part if hash is in URL
  useEffect(() => {
    if (loading) return
    const hash = typeof window !== 'undefined' ? window.location.hash : ''
    if (!hash.startsWith('#part-')) return
    const partId = hash.slice('#part-'.length)
    // Wait for render
    setTimeout(() => {
      const el = document.getElementById(`part-${partId}`)
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.style.transition = 'box-shadow 0.3s, border-color 0.3s'
      el.style.boxShadow = '0 0 0 3px #3b82f6'
      el.style.borderColor = '#3b82f6'
      setTimeout(() => {
        el.style.boxShadow = ''
        el.style.borderColor = ''
      }, 2400)
    }, 200)
  }, [loading])

  function load() {
    fetch('/api/parts')
      .then(r => r.json())
      .then(data => { setParts(data.parts || []); setIsAdmin(data.userRole === 'admin'); setMyRole(data.userRole || '') })
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
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(p =>
        [p.name, p.vehicle.stockNumber, String(p.vehicle.year ?? ''), p.vehicle.make, p.vehicle.model, p.assignedTo?.name, p.requestedBy?.name]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q))
    }
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
      <style>{PRT_CSS}</style>
      <div className="page-h1-mobile-pad" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '24px' }}>
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search parts, vehicle, stock #, person…"
          style={{
            flex: 1, minWidth: 0, padding: '10px 14px', borderRadius: 10,
            border: '1px solid var(--border)', fontSize: 14, background: 'var(--bg-card)',
            outline: 'none',
          }}
          onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent-dark)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(223,253,110,0.35)' }}
          onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }}
        />
        {(isAdmin || myRole === 'shop_coordinator') && (
          <button
            onClick={() => setShowAddPart(true)}
            style={{
              padding: '10px 18px', borderRadius: 10, border: 'none', flexShrink: 0,
              background: '#1a1a1a', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >+ Add Part</button>
        )}
      </div>

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

      {/* Arriving Today banner — collapsible */}
      {(() => {
        const today = new Date().toISOString().slice(0, 10)
        const arrivingToday = parts.filter(p => p.status === 'ordered' && p.expectedDelivery && p.expectedDelivery.slice(0, 10) <= today)
        if (arrivingToday.length === 0 || (filter !== 'ordered' && filter !== 'active')) return null
        return (
          <details style={{
            background: '#fefce8', border: '1px solid #eab308', borderRadius: 10,
            marginBottom: 16, overflow: 'hidden',
          }}>
            <summary style={{
              padding: '12px 16px',
              display: 'flex', alignItems: 'center', gap: 8,
              cursor: 'pointer', listStyle: 'none',
              fontSize: 14, fontWeight: 600, color: '#92400e',
              userSelect: 'none',
            }}>
              <span className="parts-banner-chevron" style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 20, height: 20, borderRadius: 5,
                background: '#fde68a', color: '#92400e',
                fontSize: 10, fontWeight: 700,
                transition: 'transform 0.15s ease',
              }}>▶</span>
              {arrivingToday.length} part{arrivingToday.length > 1 ? 's' : ''} expected today or overdue
            </summary>
            <div style={{
              padding: '0 16px 14px 44px',
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              {arrivingToday.map(p => {
                const vehicleDesc = `${p.vehicle.year || ''} ${p.vehicle.make} ${p.vehicle.model}`.trim()
                return (
                  <div key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#92400e', opacity: 0.75, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {vehicleDesc} · #{p.vehicle.stockNumber}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#92400e' }}>
                      {p.name}
                    </span>
                  </div>
                )
              })}
            </div>
          </details>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
          {(() => {
            // Group parts under their vehicle — the car name reads once, not
            // once per part.
            const groups: Array<{ v: (typeof filtered)[number]['vehicle']; items: typeof filtered }> = []
            const at = new Map<string, number>()
            for (const p of filtered) {
              const k = p.vehicle.id
              if (!at.has(k)) { at.set(k, groups.length); groups.push({ v: p.vehicle, items: [] }) }
              groups[at.get(k)!].items.push(p)
            }
            return groups.map(g => {
              const vehicleDesc = `${g.v.year || ''} ${g.v.make} ${g.v.model}`.trim()
              return (
                <div key={g.v.id}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    <Link href={`/vehicles/${g.v.id}`} style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text-primary)', textDecoration: 'none', minHeight: 0 }}>
                      {vehicleDesc}
                    </Link>
                    <span style={{
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                      fontSize: 10.5, fontWeight: 600, color: 'var(--text-secondary)',
                      background: 'var(--bg-card)', border: '1px solid var(--border)',
                      padding: '2px 7px', borderRadius: 6,
                    }}>#{g.v.stockNumber}</span>
                    {g.items.length > 1 && (
                      <span style={{ fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 600 }}>{g.items.length} parts</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {g.items.map((part) => {
            const ss = STATUS_COLORS[part.status] || STATUS_COLORS.requested

            return (
              <div key={part.id} id={`part-${part.id}`} onClick={() => {
                if (isAdmin) {
                  setEditingPart(part); setEditTracking(part.tracking || ''); setEditDelivery(part.expectedDelivery ? part.expectedDelivery.slice(0, 10) : ''); setEditImage(part.orderImage || null)
                }
              }} className="parts-row routing-card" style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px',
                padding: '13px 15px', display: 'flex', alignItems: 'center', gap: '16px',
                boxShadow: '0 1px 2px rgba(24,24,27,.04)',
                cursor: isAdmin ? 'pointer' : 'default',
              }}>
                {/* Part info */}
                <div className="parts-info" style={{ flex: 1 }}>
                  <p style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>{part.name}</p>
                  {part.url && (
                    <a href={part.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '12px', fontWeight: 600,
                      color: '#2563eb', textDecoration: 'none', background: 'var(--info-bg)',
                      border: '1px solid var(--info-border)', borderRadius: 999, padding: '2px 10px',
                      minHeight: 0, marginTop: 2,
                    }}>
                      View part ↗
                    </a>
                  )}
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span>by {part.requestedBy.name}</span>
                    {part.status === 'requested' ? (
                      <>
                        <span>•</span>
                        <select
                          value={part.assignedTo?.id || ''}
                          onChange={e => updatePart(part.id, { assignedToId: e.target.value || null })}
                          onClick={e => e.stopPropagation()}
                          style={{
                            padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)',
                            fontSize: 12, background: '#fff', color: 'var(--text-secondary)',
                          }}
                        >
                          <option value="">Unassigned (admin)</option>
                          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                      </>
                    ) : (
                      <span>{part.assignedTo ? `• Assigned to ${part.assignedTo.name}` : '• Unassigned'}</span>
                    )}
                    {part.price && <span>• {part.price}</span>}
                  </div>
                  {part.status === 'ordered' && part.expectedDelivery && (
                    <p style={{ fontSize: '12px', color: '#2563eb', margin: '2px 0 0', fontWeight: 500 }}>
                      Expected: {new Date(part.expectedDelivery).toLocaleDateString()}
                    </p>
                  )}
                  {part.status === 'received' && (
                    <p style={{ fontSize: '12px', color: '#16a34a', margin: '2px 0 0', fontWeight: 500 }}>
                      Received: {new Date(part.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at {new Date(part.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </p>
                  )}
                </div>

                {/* Status badge */}
                <div className="parts-status-badge" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: ss.bg, color: ss.color,
                    padding: '3px 10px', borderRadius: 100, fontSize: '10.5px', fontWeight: 650,
                    whiteSpace: 'nowrap', letterSpacing: '-0.005em',
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: ss.color, flexShrink: 0 }} />
                    {STATUS_LABELS[part.status]}
                  </div>
                  {part.status === 'ordered' && !part.tracking && !part.orderImage && (
                    <span style={{ fontSize: '11px', color: '#ef4444', fontWeight: 600, whiteSpace: 'nowrap' }}>Needs info</span>
                  )}
                </div>

                {/* Actions */}
                <div className="parts-actions" onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: '6px', flexShrink: 0, flexWrap: 'wrap' }}>
                  {part.status === 'requested' && !part.url && (
                    <button onClick={() => { setAddingUrlId(part.id); setUrlInput('') }} className="prt-btn">Add Link</button>
                  )}
                  {['requested', 'sourced', 'ready_to_order'].includes(part.status) && (
                    <button onClick={() => setBoughtPart({ id: part.id, name: part.name })} className="prt-btn">In Store</button>
                  )}
                  {isAdmin && part.status === 'sourced' && (
                    <>
                      <button onClick={() => updatePart(part.id, { status: 'ready_to_order' })} disabled={saving === part.id} className="prt-btn prt-btn-dark">✓ Approve</button>
                      <button onClick={() => updatePart(part.id, { status: 'requested', url: null })} disabled={saving === part.id} className="prt-btn prt-btn-danger">✗ Decline</button>
                    </>
                  )}
                  {isAdmin && part.status === 'ready_to_order' && (
                    <button onClick={() => setOrderModalPart({ id: part.id, name: part.name })} disabled={saving === part.id} className="prt-btn prt-btn-dark">Mark Ordered</button>
                  )}
                  {part.status === 'ordered' && myRole !== 'shop_coordinator' && (
                    <button onClick={() => updatePart(part.id, { status: 'received' })} disabled={saving === part.id} className="prt-btn prt-btn-dark">Mark Received</button>
                  )}
                </div>
                {/* Inline URL input */}
                {addingUrlId === part.id && (
                  <div style={{ display: 'flex', gap: '8px', width: '100%', marginTop: '8px' }}>
                    <input type="url" value={urlInput} onChange={e => setUrlInput(e.target.value)} placeholder="Paste part link here..." autoFocus
                      onKeyDown={async e => { if (e.key === 'Enter' && urlInput.trim()) { e.preventDefault(); await updatePart(part.id, { url: urlInput }); setAddingUrlId(null); setUrlInput('') } }}
                      style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '13px' }} />
                    <button onClick={() => { setAddingUrlId(null); setUrlInput('') }} className="prt-btn">Cancel</button>
                    <button onClick={async () => { if (!urlInput.trim()) return; await updatePart(part.id, { url: urlInput }); setAddingUrlId(null); setUrlInput('') }}
                      disabled={!urlInput.trim()} className="prt-btn prt-btn-dark">Submit</button>
                  </div>
                )}
              </div>
            )
          })}
                  </div>
                </div>
              )
            })
          })()}
        </div>
      )}
      {orderModalPart && (
        <OrderPartModal partId={orderModalPart.id} partName={orderModalPart.name} onClose={() => setOrderModalPart(null)} onComplete={load} />
      )}
      {showAddPart && (
        <AddPartModal onClose={() => setShowAddPart(false)} onAdded={() => { setShowAddPart(false); load() }} />
      )}
      {boughtPart && (
        <BoughtModal part={boughtPart} onClose={() => setBoughtPart(null)} onDone={() => { setBoughtPart(null); load() }} />
      )}
      {editingPart && (
        <div onClick={() => setEditingPart(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 420, padding: '24px', boxShadow: '0 -4px 30px rgba(0,0,0,0.15)' }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>Part Details</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>{editingPart.name}</p>
            <div style={{ marginBottom: 20 }}>
              <span style={{
                display: 'inline-block', fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 4,
                background: (STATUS_COLORS[editingPart.status] || STATUS_COLORS.requested).bg,
                color: (STATUS_COLORS[editingPart.status] || STATUS_COLORS.requested).color,
                border: `1px solid ${(STATUS_COLORS[editingPart.status] || STATUS_COLORS.requested).border}`,
              }}>{STATUS_LABELS[editingPart.status]}</span>
            </div>

            {/* Admin: move part to any other status (recover from mistaken clicks) */}
            {isAdmin && (
              <div style={{ marginBottom: 20, padding: '12px 14px', background: '#fafaf8', border: '1px solid var(--border)', borderRadius: 10 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px' }}>
                  Move to status (admin)
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {(['requested', 'sourced', 'ready_to_order', 'ordered', 'received'] as const).map(s => {
                    const isCurrent = s === editingPart.status
                    const c = STATUS_COLORS[s]
                    return (
                      <button
                        key={s}
                        disabled={isCurrent || saving === editingPart.id}
                        onClick={async () => {
                          if (!confirm(`Move "${editingPart.name.trim()}" to ${STATUS_LABELS[s]}?`)) return
                          await updatePart(editingPart.id, { status: s })
                          setEditingPart({ ...editingPart, status: s })
                        }}
                        style={{
                          padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                          background: isCurrent ? c.bg : '#fff',
                          color: isCurrent ? c.color : 'var(--text-secondary)',
                          border: `1px solid ${isCurrent ? c.border : 'var(--border)'}`,
                          cursor: isCurrent ? 'default' : 'pointer',
                          opacity: isCurrent ? 0.6 : 1,
                        }}
                      >{STATUS_LABELS[s]}</button>
                    )
                  })}
                </div>
              </div>
            )}

            {editingPart.url && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Link</label>
                <a href={editingPart.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: '#2563eb', wordBreak: 'break-all' }}>
                  {editingPart.url}
                </a>
              </div>
            )}

            {editingPart.status === 'ordered' && (
              <>
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
              </>
            )}

            {editingPart.status !== 'ordered' && (
              <button onClick={() => setEditingPart(null)} style={{
                width: '100%', padding: '12px 0', borderRadius: 10, border: '1px solid var(--border)',
                background: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}>Close</button>
            )}

            {/* Wrong Part — for any status past requested */}
            {['sourced', 'ready_to_order', 'ordered', 'received'].includes(editingPart.status) && (
              <button onClick={async () => {
                if (!confirm('Mark as wrong part and reset to Requested? The link will be cleared.')) return
                setSaving(editingPart.id)
                await updatePart(editingPart.id, {
                  status: 'requested', url: null, tracking: null,
                  expectedDelivery: null, orderImage: null,
                })
                setEditingPart(null)
              }} disabled={saving === editingPart.id} style={{
                width: '100%', marginTop: 10, padding: '10px 0', borderRadius: 10,
                border: '1px solid #f59e0b', background: '#fffbeb', color: '#b45309',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>Wrong Part — Reset</button>
            )}

            <button onClick={async () => {
              if (!confirm('Delete this part?')) return
              setSaving(editingPart.id)
              await fetch(`/api/parts/${editingPart.id}`, { method: 'DELETE' })
              setSaving(null)
              setEditingPart(null)
              load()
            }} disabled={saving === editingPart.id} style={{
              width: '100%', marginTop: 10, padding: '10px 0', borderRadius: 10,
              border: '1px solid #fca5a5', background: '#fef2f2', color: '#ef4444',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>Delete Part</button>
          </div>
        </div>
      )}
    </div>
  )
}


/**
 * Add a part from the Parts page: pick the car, name the part, optionally
 * paste the sourcing link (link -> lands as "sourced" in admin's approve
 * queue). Used by admin and the shop coordinator.
 */
function AddPartModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [vehicles, setVehicles] = useState<Array<{ id: string; stockNumber: string; year: number | null; make: string; model: string }>>([])
  const [search, setSearch] = useState('')
  const [vehicleId, setVehicleId] = useState<string | null>(null)
  const [rows, setRows] = useState<Array<{ name: string; url: string; notes: string }>>([{ name: '', url: '', notes: '' }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const setRow = (i: number, patch: Partial<{ name: string; url: string; notes: string }>) =>
    setRows(r => r.map((row, ri) => ri === i ? { ...row, ...patch } : row))

  useEffect(() => {
    fetch('/api/vehicles')
      .then(r => r.json())
      .then(d => {
        const list = Array.isArray(d) ? d : (d.vehicles || [])
        setVehicles(list.map((v: any) => ({ id: v.id, stockNumber: v.stockNumber, year: v.year, make: v.make, model: v.model })))
      })
      .catch(() => {})
  }, [])

  const selected = vehicles.find(v => v.id === vehicleId) || null
  const q = search.trim().toLowerCase()
  const matches = q
    ? vehicles.filter(v => `${v.stockNumber} ${v.year ?? ''} ${v.make} ${v.model}`.toLowerCase().includes(q)).slice(0, 8)
    : []

  return (
    <div onClick={() => !saving && onClose()} className="modal-below-topbar" style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 16, width: '100%', maxWidth: 440,
        padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.15)', maxHeight: '86vh', overflowY: 'auto',
      }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Add Part</h2>

        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 6px' }}>Vehicle</p>
        {selected ? (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
            border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', marginBottom: 16,
          }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>
              #{selected.stockNumber} · {selected.year ?? ''} {selected.make} {selected.model}
            </span>
            <button onClick={() => { setVehicleId(null); setSearch('') }} style={{
              background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)',
            }}>Change</button>
          </div>
        ) : (
          <div style={{ marginBottom: 16 }}>
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search stock #, make, model..."
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14 }}
            />
            {matches.length > 0 && (
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, marginTop: 6, overflow: 'hidden' }}>
                {matches.map(v => (
                  <button
                    key={v.id}
                    onClick={() => setVehicleId(v.id)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px',
                      background: '#fff', border: 'none', borderBottom: '1px solid var(--border)',
                      fontSize: 13, cursor: 'pointer',
                    }}
                  >
                    <b>#{v.stockNumber}</b> {v.year ?? ''} {v.make} {v.model}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 6px' }}>Parts</p>
        {rows.map((row, i) => (
          <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                autoFocus={i === rows.length - 1 && i > 0}
                value={row.name}
                onChange={e => setRow(i, { name: e.target.value })}
                placeholder={`Part ${i + 1} — e.g. "Rear bumper"`}
                style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, minWidth: 0 }}
              />
              {rows.length > 1 && (
                <button
                  onClick={() => setRows(r => r.filter((_, ri) => ri !== i))}
                  title="Remove this part"
                  style={{ border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, padding: '0 4px', minHeight: 0, flexShrink: 0 }}
                >×</button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input
                type="url"
                value={row.url}
                onChange={e => setRow(i, { url: e.target.value })}
                placeholder="Link (optional)"
                style={{ flex: 1.4, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, minWidth: 0 }}
              />
              <input
                value={row.notes}
                onChange={e => setRow(i, { notes: e.target.value })}
                placeholder="Notes"
                style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, minWidth: 0 }}
              />
            </div>
          </div>
        ))}
        <button
          onClick={() => setRows(r => [...r, { name: '', url: '', notes: '' }])}
          style={{
            width: '100%', padding: '10px 0', borderRadius: 10, border: '1.5px dashed var(--border)',
            background: 'none', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)',
            cursor: 'pointer', marginBottom: 20,
          }}
        >+ Add another part</button>

        {error && <p style={{ fontSize: 13, color: '#dc2626', margin: '0 0 12px' }}>{error}</p>}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} disabled={saving} style={{
            flex: 1, padding: '12px 0', borderRadius: 10, border: '1px solid var(--border)',
            background: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>Cancel</button>
          <button
            disabled={saving || !vehicleId || !rows.some(r => r.name.trim())}
            onClick={async () => {
              const valid = rows.filter(r => r.name.trim())
              if (!vehicleId || valid.length === 0) return
              setSaving(true)
              setError(null)
              try {
                let added = 0
                for (const r of valid) {
                  const res = await fetch('/api/parts', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ vehicleId, name: r.name.trim(), url: r.url.trim() || null, notes: r.notes.trim() || null }),
                  })
                  if (res.ok) added++
                }
                if (added === 0) { setError('Could not add the parts.'); return }
                if (added < valid.length) setError(`${added}/${valid.length} added — retry the rest.`)
                else onAdded()
              } finally {
                setSaving(false)
              }
            }}
            style={{
              flex: 1, padding: '12px 0', borderRadius: 10, border: 'none',
              background: saving || !vehicleId || !rows.some(r => r.name.trim()) ? '#e5e5e5' : '#1a1a1a',
              color: '#fff', fontSize: 14, fontWeight: 700,
              cursor: saving || !vehicleId || !rows.some(r => r.name.trim()) ? 'not-allowed' : 'pointer',
            }}
          >{saving
            ? 'Adding…'
            : rows.filter(r => r.name.trim()).length > 1
              ? `Add ${rows.filter(r => r.name.trim()).length} Parts`
              : 'Add Part'}</button>
        </div>
      </div>
    </div>
  )
}


/**
 * "Bought in person" — someone drove out and bought the part; no link, no
 * order step. Receipt + price attach if in hand; otherwise admin gets a
 * reminder task to enter them later.
 */
function BoughtModal({ part, onClose, onDone }: {
  part: { id: string; name: string }
  onClose: () => void
  onDone: () => void
}) {
  const [price, setPrice] = useState('')
  const [receipt, setReceipt] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (res.ok) setReceipt(data.url)
      else setError('Upload failed — try again.')
    } catch { setError('Upload failed — try again.') }
    setUploading(false)
  }

  async function submit(receiptToAdmin: boolean) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/parts/${part.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selfPurchase: true,
          price: price.trim() || undefined,
          orderImage: receipt || undefined,
          receiptToAdmin,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error || 'Could not save.')
        return
      }
      onDone()
    } finally {
      setSaving(false)
    }
  }

  const hasProof = !!(price.trim() || receipt)

  return (
    <div onClick={() => !saving && onClose()} className="modal-below-topbar" style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 16, width: '100%', maxWidth: 420,
        padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
      }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Purchased in store</h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 18 }}>{part.name} — marks it received, no link or order step needed.</p>

        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 6px' }}>Price paid</p>
        <input
          value={price}
          onChange={e => setPrice(e.target.value)}
          placeholder="e.g. $84.99"
          inputMode="decimal"
          style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14, marginBottom: 16 }}
        />

        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 6px' }}>Receipt photo</p>
        {receipt ? (
          <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
            <img src={receipt} alt="Receipt" style={{ width: '100%', maxHeight: 160, objectFit: 'contain', background: '#f9fafb' }} />
            <button onClick={() => setReceipt(null)} style={{ width: '100%', padding: '8px 0', border: 'none', borderTop: '1px solid var(--border)', background: '#fff', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer' }}>Remove</button>
          </div>
        ) : (
          <label style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '14px', borderRadius: 10, border: '1.5px dashed var(--border)',
            fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer', marginBottom: 16,
          }}>
            {uploading ? 'Uploading…' : 'Snap / upload the receipt'}
            <input type="file" accept="image/*" capture="environment" onChange={handleUpload} style={{ display: 'none' }} disabled={uploading} />
          </label>
        )}

        {error && <p style={{ fontSize: 13, color: '#dc2626', margin: '0 0 12px' }}>{error}</p>}

        <button
          disabled={saving || uploading || !hasProof}
          onClick={() => submit(false)}
          style={{
            width: '100%', padding: '12px 0', borderRadius: 10, border: 'none',
            background: saving || !hasProof ? '#e5e5e5' : '#1a1a1a', color: '#fff',
            fontSize: 14, fontWeight: 700, cursor: saving || !hasProof ? 'not-allowed' : 'pointer', marginBottom: 8,
          }}
        >{saving ? 'Saving…' : '✓ Done — receipt & price attached'}</button>
        <button
          disabled={saving || uploading}
          onClick={() => submit(true)}
          style={{
            width: '100%', padding: '12px 0', borderRadius: 10,
            border: '1px solid var(--border)', background: '#fff',
            fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer', marginBottom: 8,
          }}
        >Admin has the receipt — remind them to enter it</button>
        <button disabled={saving} onClick={onClose} style={{ width: '100%', padding: '10px 0', borderRadius: 10, border: 'none', background: 'none', fontSize: 13, color: 'var(--text-muted)', cursor: 'pointer' }}>Cancel</button>
      </div>
    </div>
  )
}
