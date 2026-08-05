'use client'

import { useEffect, useState } from 'react'
import { PART_STATUS_LABELS, PART_STATUS_COLORS, PART_LIVE_LABELS, PART_LIVE_COLORS, type PartRecord } from '@/lib/parts-ui'
import ConfirmDialog, { type ConfirmState } from '@/components/ConfirmDialog'

/**
 * Part Details — THE single part modal. The parts page and the dashboard's
 * Attention card both mount this; give it a partId and it fetches the rest.
 * Full action surface: status switcher (admin), tracking/expected/receipt
 * for ordered parts, wrong-part reset, delete.
 */
export default function PartDetailModal({ partId, isAdmin, role, onClose, onChanged }: {
  partId: string
  isAdmin: boolean
  role: string
  onClose: () => void
  onChanged: () => void
}) {
  const [part, setPart] = useState<PartRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editTracking, setEditTracking] = useState('')
  const [editDelivery, setEditDelivery] = useState('')
  const [editImage, setEditImage] = useState<string | null>(null)
  const [editUploading, setEditUploading] = useState(false)
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)
  const [extShop, setExtShop] = useState('')
  const [showExtForm, setShowExtForm] = useState(false)

  useEffect(() => {
    fetch(`/api/parts?id=${partId}`)
      .then(r => r.json())
      .then(d => {
        const p: PartRecord | undefined = (d.parts || [])[0]
        if (p) {
          setPart(p)
          setEditTracking(p.tracking || '')
          setEditDelivery(p.expectedDelivery ? p.expectedDelivery.slice(0, 10) : '')
          setEditImage(p.orderImage || null)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [partId])

  const updatePart = async (updates: Record<string, unknown>): Promise<boolean> => {
    setSaving(true)
    try {
      const res = await fetch(`/api/parts/${partId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setConfirmState({ title: 'Could not update the part', message: (d as { error?: string }).error || 'Try again.', hideCancel: true })
        return false
      }
      onChanged()
      return true
    } finally {
      setSaving(false)
    }
  }

  // Assign this part's install to an outside shop. Not-yet-received → a gated
  // mission ("Waiting on part"); already received → a live mission + alert.
  const assignExternal = async () => {
    const shop = extShop.trim()
    if (!shop) return
    setSaving(true)
    try {
      const res = await fetch(`/api/parts/${partId}/external-install`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setConfirmState({ title: 'Could not set the outside install', message: (d as { error?: string }).error || 'Try again.', hideCancel: true })
        return
      }
      const d = await res.json().catch(() => ({}))
      setShowExtForm(false)
      setExtShop('')
      onChanged()
      setConfirmState({
        title: d.gated ? `Install set — waiting on the part` : `Install mission created`,
        message: d.gated
          ? `The mission to ${shop} goes live the moment this part is marked received.`
          : `Part's in hand — take it to ${shop} to install. Lenny and admin were alerted.`,
        hideCancel: true,
        onConfirm: onClose,
      })
    } finally {
      setSaving(false)
    }
  }

  const uploadFile = async (file: File) => {
    setEditUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (res.ok) setEditImage(data.url)
    } catch { /* ignore */ }
    setEditUploading(false)
  }

  const label = (text: string) => (
    <label style={{ display: 'block', fontSize: 10.5, fontWeight: 650, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{text}</label>
  )

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20 }}>
      {/* .prt-btn lives on the parts page; redeclare so the modal is self-contained anywhere */}
      <style>{`
        .prt-btn { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--border); background: var(--bg-card); color: var(--text-primary); border-radius: 9px; padding: 6px 13px; font-size: 12.5px; font-weight: 600; cursor: pointer; min-height: 0; white-space: nowrap; }
        .prt-btn:hover { background: var(--bg-card-hover); }
        .prt-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .prt-btn-danger { color: #b91c1c; }
        .prt-btn-danger:hover { background: #fef2f2; }
      `}</style>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 440, padding: '24px', boxShadow: '0 -4px 30px rgba(0,0,0,0.15)', maxHeight: '86vh', overflowY: 'auto' }}>
        {loading || !part ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>{loading ? 'Loading…' : 'Part not found.'}</p>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Part Details</h3>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
                fontSize: 10.5, fontWeight: 650, padding: '3px 10px', borderRadius: 100,
                background: (PART_STATUS_COLORS[part.status] || PART_STATUS_COLORS.requested).bg,
                color: (PART_STATUS_COLORS[part.status] || PART_STATUS_COLORS.requested).color,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: (PART_STATUS_COLORS[part.status] || PART_STATUS_COLORS.requested).color, flexShrink: 0 }} />
                {PART_STATUS_LABELS[part.status] ?? part.status}
              </span>
            </div>
            <p style={{
              fontSize: 13.5, fontWeight: 640, letterSpacing: '-0.01em', lineHeight: 1.4, margin: '0 0 4px',
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>{part.name}</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
              <span style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                fontSize: 10.5, fontWeight: 600, color: 'var(--text-secondary)',
                background: 'var(--bg-primary, #f8f8f6)', border: '1px solid var(--border)',
                padding: '1px 6px', borderRadius: 6, whiteSpace: 'nowrap',
              }}>#{part.vehicle.stockNumber}</span>
              {`${part.vehicle.year ?? ''} ${part.vehicle.make} ${part.vehicle.model}`.trim()}
            </p>

            {/* Outside-install plan: this part installs at an external vendor.
                Show the plan if set; otherwise offer to assign one. */}
            {part.status !== 'requested' || part.installVenue === 'external' ? (
              part.installVenue === 'external' ? (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, margin: '2px 0 12px',
                  padding: '8px 11px', borderRadius: 9, background: '#fdf3e7', border: '1px solid #f6e0c0',
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#d97706', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: '#92400e', lineHeight: 1.35 }}>
                    Installs at <strong style={{ fontWeight: 700 }}>{part.installShop || 'an outside shop'}</strong> (outside)
                    {part.status !== 'received' && <span style={{ display: 'block', fontSize: 11, opacity: 0.85 }}>Mission goes live when this part is received.</span>}
                  </span>
                </div>
              ) : showExtForm ? (
                <div style={{ margin: '4px 0 12px', padding: '10px 11px', borderRadius: 10, background: 'var(--bg-primary, #f8f8f6)', border: '1px solid var(--border)' }}>
                  <label style={{ display: 'block', fontSize: 10.5, fontWeight: 650, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Install at outside shop</label>
                  <div style={{ display: 'flex', gap: 7 }}>
                    <input
                      autoFocus value={extShop} onChange={e => setExtShop(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') assignExternal() }}
                      placeholder="Shop name, e.g. Garage 27"
                      style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}
                    />
                    <button onClick={assignExternal} disabled={saving || !extShop.trim()} style={{
                      border: '1px solid #bfd3fc', background: '#eaf0fe', color: '#1d4ed8',
                      borderRadius: 8, padding: '0 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                      opacity: !extShop.trim() ? 0.5 : 1, whiteSpace: 'nowrap',
                    }}>{saving ? '…' : 'Set'}</button>
                  </div>
                  <button onClick={() => { setShowExtForm(false); setExtShop('') }} style={{ marginTop: 7, border: 'none', background: 'none', color: 'var(--text-muted)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', padding: 0 }}>Cancel</button>
                </div>
              ) : (
                <button onClick={() => setShowExtForm(true)} className="prt-btn" style={{ margin: '2px 0 12px', fontSize: 12 }}>
                  Install at an outside shop ›
                </button>
              )
            ) : null}
            {part.status === 'ordered' && part.trackingStatus && (
              <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, margin: '0 0 6px', color: PART_LIVE_COLORS[part.trackingStatus] ?? '#6b6b6b' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: PART_LIVE_COLORS[part.trackingStatus] ?? '#6b6b6b', flexShrink: 0 }} />
                {PART_LIVE_LABELS[part.trackingStatus] ?? part.trackingStatus}
                {part.expectedDelivery && !['delivered', 'available_for_pickup'].includes(part.trackingStatus) &&
                  ` · ${new Date(part.expectedDelivery).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
              </p>
            )}
            {part.url && (
              <a href={part.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, color: '#2563eb', textDecoration: 'none', fontWeight: 600, display: 'inline-block', marginBottom: 14, minHeight: 0 }}>
                View link ↗
              </a>
            )}

            {/* Note entered when the part was added. */}
            {part.notes && (
              <div style={{ margin: '2px 0 14px', padding: '9px 11px', borderRadius: 9, background: 'var(--bg-primary, #f8f8f6)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 10.5, fontWeight: 650, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Note</div>
                <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{part.notes}</div>
              </div>
            )}

            {/* Admin: move part to any other status (recover from mistaken clicks) */}
            {isAdmin && (
              <div style={{ margin: '8px 0 18px' }}>
                <p style={{ fontSize: 10.5, fontWeight: 650, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>
                  Status
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {(['requested', 'sourced', 'ready_to_order', 'ordered', 'received'] as const).map(s => {
                    const isCurrent = s === part.status
                    const c = PART_STATUS_COLORS[s]
                    return (
                      <button
                        key={s}
                        disabled={isCurrent || saving}
                        onClick={() => setConfirmState({
                          title: `Move to ${PART_STATUS_LABELS[s]}?`,
                          message: part.name.trim(),
                          confirmLabel: PART_STATUS_LABELS[s],
                          onConfirm: async () => { const ok = await updatePart({ status: s }); if (ok) setPart({ ...part, status: s }) },
                        })}
                        style={{
                          padding: '4px 12px', borderRadius: 100, fontSize: 11.5, fontWeight: 650,
                          background: isCurrent ? c.bg : 'var(--bg-card)',
                          color: isCurrent ? c.color : 'var(--text-secondary)',
                          border: `1px solid ${isCurrent ? 'transparent' : 'var(--border)'}`,
                          cursor: isCurrent ? 'default' : 'pointer', minHeight: 0,
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                        }}
                      >
                        {isCurrent && <span style={{ width: 5, height: 5, borderRadius: '50%', background: c.color, flexShrink: 0 }} />}
                        {PART_STATUS_LABELS[s]}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Ordered parts carry the shipping paperwork */}
            {part.status === 'ordered' && (
              <>
                <div className="form-row" style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1.2, minWidth: 140 }}>
                    {label('Tracking #')}
                    <input type="text" value={editTracking} onChange={e => setEditTracking(e.target.value)} placeholder="Tracking number…"
                      style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10, fontSize: 14 }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 130 }}>
                    {label('Expected')}
                    <input type="date" value={editDelivery} onChange={e => setEditDelivery(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10, fontSize: 14 }} />
                  </div>
                </div>

                <div style={{ marginBottom: 20 }}>
                  {label('Order confirmation / receipt')}
                  {editImage ? (
                    <div>
                      <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', cursor: 'pointer' }}
                        onClick={() => window.open(editImage, '_blank')}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={editImage} alt="Order confirmation" style={{ width: '100%', maxHeight: 200, objectFit: 'contain', background: '#f9fafb' }} />
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <button onClick={() => window.open(editImage, '_blank')} className="prt-btn" style={{ flex: 1, justifyContent: 'center', fontSize: 12 }}>View Full Size</button>
                        <a href={editImage} download={`receipt-${part.name.replace(/\s+/g, '-')}`} className="prt-btn" style={{ flex: 1, justifyContent: 'center', fontSize: 12, textDecoration: 'none' }}>Download</a>
                        <button onClick={() => setEditImage(null)} className="prt-btn prt-btn-danger" style={{ fontSize: 12 }}>Remove</button>
                      </div>
                    </div>
                  ) : (
                    <label
                      onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#2563eb' }}
                      onDragLeave={e => { e.preventDefault(); e.currentTarget.style.borderColor = '' }}
                      onDrop={async e => {
                        e.preventDefault(); e.currentTarget.style.borderColor = ''
                        const file = e.dataTransfer.files?.[0]
                        if (file) await uploadFile(file)
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        padding: '20px', borderRadius: 8, border: '2px dashed var(--border)',
                        background: '#f9fafb', cursor: 'pointer', fontSize: 14, color: 'var(--text-muted)',
                        transition: 'border-color 0.15s',
                      }}>
                      <input type="file" accept="image/*,.pdf" onChange={async (e) => {
                        const file = e.target.files?.[0]
                        if (file) await uploadFile(file)
                      }} style={{ display: 'none' }} />
                      {editUploading ? 'Uploading...' : 'Click or drag file here'}
                    </label>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={onClose} style={{
                    flex: 1, padding: '12px 0', borderRadius: 10, border: '1px solid var(--border)',
                    background: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  }}>Cancel</button>
                  <button onClick={async () => {
                    const ok = await updatePart({
                      tracking: editTracking.trim() || null,
                      expectedDelivery: editDelivery || null,
                      orderImage: editImage || null,
                    })
                    if (ok) onClose()
                  }} disabled={saving} style={{
                    flex: 1, padding: '12px 0', borderRadius: 10, border: 'none',
                    background: '#1a1a1a', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                    opacity: saving ? 0.5 : 1,
                  }}>{saving ? 'Saving...' : 'Save'}</button>
                </div>
              </>
            )}

            {part.status !== 'ordered' && (
              <button onClick={onClose} style={{
                width: '100%', padding: '12px 0', borderRadius: 10, border: '1px solid var(--border)',
                background: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}>Close</button>
            )}

            {/* Danger zone — quiet text actions, both behind a confirm */}
            {role !== 'shop_coordinator' && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border-light, #f0f0ec)' }}>
                {['sourced', 'ready_to_order', 'ordered', 'received'].includes(part.status) && (
                  <button onClick={() => setConfirmState({
                    title: 'Wrong part — reset to Requested?',
                    message: 'The link, tracking, and receipt come off; it goes back to the source queue.',
                    confirmLabel: 'Reset', tone: 'danger',
                    onConfirm: async () => {
                      const ok = await updatePart({
                        status: 'requested', url: null, tracking: null,
                        expectedDelivery: null, orderImage: null,
                      })
                      if (ok) onClose()
                    },
                  })} disabled={saving} style={{
                    border: 'none', background: 'none', color: '#b45309',
                    fontSize: 12.5, fontWeight: 600, cursor: 'pointer', minHeight: 0, padding: '4px 6px',
                  }}>Wrong part — reset</button>
                )}
                {isAdmin && (
                  <button onClick={() => setConfirmState({
                    title: 'Delete this part?',
                    message: `"${part.name.trim()}" is removed for good.`,
                    confirmLabel: 'Delete', tone: 'danger',
                    onConfirm: async () => {
                      setSaving(true)
                      await fetch(`/api/parts/${partId}`, { method: 'DELETE' })
                      setSaving(false)
                      onChanged()
                      onClose()
                    },
                  })} disabled={saving} style={{
                    border: 'none', background: 'none', color: '#ef4444',
                    fontSize: 12.5, fontWeight: 600, cursor: 'pointer', minHeight: 0, padding: '4px 6px',
                  }}>Delete part</button>
                )}
              </div>
            )}
          </>
        )}
        <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
      </div>
    </div>
  )
}
