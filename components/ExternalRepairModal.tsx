'use client'

import { useEffect, useState } from 'react'

type Repair = {
  id: string
  stockNumber: string
  year: number | null
  make: string
  model: string
  shopName: string
  shopPhone: string | null
  repairDescription: string
  status: string
  partOnly: boolean
  atDealership: boolean
  sentDate: string | null
  expectedReturn: string | null
  notes: string | null
  followUps: Array<{ date?: string; note?: string; etaDays?: number | null }> | null
}

const STATUS_UI: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Not Sent', color: '#6b6b6b', bg: '#f4f4f2' },
  sent: { label: 'Sent', color: '#2563eb', bg: '#eff6ff' },
  in_progress: { label: 'In Progress', color: '#b45309', bg: '#fdf3e7' },
  ready: { label: 'Ready for Pickup', color: '#16a34a', bg: '#f0fdf4' },
  returned: { label: 'Returned', color: '#16a34a', bg: '#f0fdf4' },
}

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null

/**
 * External repair snapshot + actions — the dashboard's way to work an
 * external without leaving the page: push the return date, log a follow-up
 * call, mark ready / returned. Same PATCH endpoints as the External page.
 */
export default function ExternalRepairModal({ externalId, onClose, onChanged }: {
  externalId: string
  onClose: () => void
  onChanged: () => void
}) {
  const [repair, setRepair] = useState<Repair | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dateInput, setDateInput] = useState('')
  const [followNote, setFollowNote] = useState('')
  const [showFollowForm, setShowFollowForm] = useState(false)

  const load = () => fetch(`/api/external?id=${externalId}`)
    .then(r => r.json())
    .then(d => {
      const rep: Repair | undefined = (d.repairs || [])[0]
      if (rep) {
        setRepair(rep)
        setDateInput(rep.expectedReturn ? rep.expectedReturn.slice(0, 10) : '')
      }
    })
    .catch(() => {})

  useEffect(() => { load().finally(() => setLoading(false)) }, [externalId]) // eslint-disable-line react-hooks/exhaustive-deps

  const patch = async (body: Record<string, unknown>) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/external/${externalId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        window.alert(d.error || 'Could not update.')
        return false
      }
      await load()
      onChanged()
      return true
    } finally {
      setSaving(false)
    }
  }

  const eyebrow: React.CSSProperties = {
    fontSize: 10.5, fontWeight: 650, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px',
  }
  const btn: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    border: '1px solid var(--border)', background: 'var(--bg-card, #fff)', color: 'var(--text-primary)',
    borderRadius: 9, padding: '6px 13px', fontSize: 12.5, fontWeight: 600,
    cursor: 'pointer', minHeight: 0, whiteSpace: 'nowrap',
  }

  const overdueDays = repair?.expectedReturn && new Date(repair.expectedReturn).getTime() < Date.now() && !['returned'].includes(repair.status)
    ? Math.floor((Date.now() - new Date(repair.expectedReturn).getTime()) / 86400000)
    : 0
  const su = repair ? (STATUS_UI[repair.status] ?? STATUS_UI.pending) : STATUS_UI.pending
  const followUps = (repair?.followUps ?? []).filter(f => f?.note)

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 460, padding: 24, boxShadow: '0 -4px 30px rgba(0,0,0,0.15)', maxHeight: '86vh', overflowY: 'auto' }}>
        {loading || !repair ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>{loading ? 'Loading…' : 'Repair not found.'}</p>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                fontSize: 10.5, fontWeight: 600, color: 'var(--text-secondary)',
                background: 'var(--bg-primary, #f8f8f6)', border: '1px solid var(--border)',
                padding: '1px 6px', borderRadius: 6, whiteSpace: 'nowrap', flexShrink: 0,
              }}>#{repair.stockNumber}</span>
              <span style={{ flex: 1 }} />
              {repair.partOnly && (
                <span style={{ fontSize: 10.5, fontWeight: 650, color: '#b45309', background: '#fdf3e7', border: '1px solid #fcd34d', padding: '2px 8px', borderRadius: 100, whiteSpace: 'nowrap' }}>Part Only</span>
              )}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 650, color: su.color, background: su.bg, padding: '3px 10px', borderRadius: 100, whiteSpace: 'nowrap' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: su.color, flexShrink: 0 }} />
                {su.label}
              </span>
            </div>
            <p style={{ fontSize: 15.5, fontWeight: 700, letterSpacing: '-0.01em', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {`${repair.year ?? ''} ${repair.make} ${repair.model}`.trim()}
            </p>
            <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '0 0 12px' }}>
              At <span style={{ fontWeight: 650 }}>{repair.shopName}</span>
              {repair.sentDate ? ` · sent ${fmtDate(repair.sentDate)}` : ' · not sent yet'}
              {overdueDays > 0 && <span style={{ color: '#b91c1c', fontWeight: 650 }}> · {overdueDays}d overdue</span>}
            </p>

            <p style={eyebrow}>Work</p>
            <p style={{ fontSize: 13, lineHeight: 1.5, margin: '0 0 14px', color: 'var(--text-primary)' }}>{repair.repairDescription}</p>
            {repair.notes && (
              <>
                <p style={eyebrow}>Notes</p>
                <p style={{ fontSize: 12.5, lineHeight: 1.5, margin: '0 0 14px', color: 'var(--text-secondary)' }}>{repair.notes}</p>
              </>
            )}

            <p style={eyebrow}>Expected Back</p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              <input
                type="date" value={dateInput} onChange={e => setDateInput(e.target.value)}
                style={{ flex: 1, minWidth: 150, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 10, fontSize: 13.5 }}
              />
              <button
                style={btn} disabled={saving || !dateInput}
                onClick={() => patch({ expectedReturn: dateInput })}
              >Save Date</button>
              <button
                style={btn} disabled={saving}
                title="Pushed a week out"
                onClick={() => {
                  const base = repair.expectedReturn ? new Date(repair.expectedReturn).getTime() : Date.now()
                  patch({ expectedReturn: new Date(Math.max(base, Date.now()) + 7 * 86400000).toISOString() })
                }}
              >+1 wk</button>
            </div>

            {followUps.length > 0 && (
              <>
                <p style={eyebrow}>Follow-Up History</p>
                <div style={{ border: '1px solid var(--border-light, #f0f0ec)', borderRadius: 10, marginBottom: 14, overflow: 'hidden' }}>
                  {followUps.slice(-5).reverse().map((f, i) => (
                    <div key={i} style={{ padding: '7px 12px', fontSize: 12.5, borderBottom: '1px solid var(--border-light, #f0f0ec)', display: 'flex', gap: 10 }}>
                      <span style={{ color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                        {f.date ? new Date(f.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>{f.note}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {showFollowForm ? (
              <div style={{ marginBottom: 16 }}>
                <textarea
                  autoFocus rows={2} value={followNote} onChange={e => setFollowNote(e.target.value)}
                  placeholder="Called the shop — what did they say?"
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10, fontSize: 13.5, resize: 'vertical', marginBottom: 8 }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    style={{ ...btn, background: '#1a1a1a', color: '#fff', border: 'none' }}
                    disabled={saving || !followNote.trim()}
                    onClick={async () => {
                      const ok = await patch({ addFollowUp: { note: followNote.trim() } })
                      if (ok) { setFollowNote(''); setShowFollowForm(false) }
                    }}
                  >Log Follow-Up</button>
                  <button style={btn} disabled={saving} onClick={() => setShowFollowForm(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                <button style={btn} disabled={saving} onClick={() => setShowFollowForm(true)}>+ Follow-Up</button>
                {['sent', 'in_progress'].includes(repair.status) && (
                  <button
                    style={{ ...btn, color: '#16a34a' }} disabled={saving}
                    onClick={() => patch({ status: 'ready', fromStatus: repair.status })}
                  >✓ Ready for Pickup</button>
                )}
                {['sent', 'in_progress', 'ready'].includes(repair.status) && (
                  <button
                    style={{ ...btn, color: '#16a34a' }} disabled={saving}
                    onClick={async () => {
                      if (!confirm(`Mark this ${repair.partOnly ? 'part' : 'car'} as returned from ${repair.shopName}?${repair.partOnly ? '' : ' The car goes to Pending Routing on the recon board.'}`)) return
                      const ok = await patch({ status: 'returned', fromStatus: repair.status })
                      if (ok) onClose()
                    }}
                  >✓ Returned</button>
                )}
              </div>
            )}

            <button onClick={onClose} style={{
              width: '100%', marginTop: 12, padding: '12px 0', borderRadius: 10, border: '1px solid var(--border)',
              background: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}>Close</button>
          </>
        )}
      </div>
    </div>
  )
}
