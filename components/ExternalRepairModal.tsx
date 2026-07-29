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

const QUICK_DAYS = [
  { d: 1, label: '1d' },
  { d: 3, label: '3d' },
  { d: 7, label: '1wk' },
  { d: 14, label: '2wk' },
]

const DAY_MS = 86400000

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null
const fmtShort = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
// For YYYY-MM-DD strings: parse as LOCAL so the label matches the picker
const fmtDay = (ymd: string) => {
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
const localYmd = (t: number) => {
  const dt = new Date(t)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

/**
 * External repair action flow. Updating the expected-back date (quick chip or
 * manual date) REQUIRES logging what the shop said — the date change and the
 * follow-up note commit together, so the history always explains the moves.
 */
export default function ExternalRepairModal({ externalId, onClose, onChanged }: {
  externalId: string
  onClose: () => void
  onChanged: () => void
}) {
  const [repair, setRepair] = useState<Repair | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  // Staged date update: chip or manual date + the required note
  const [pendingDate, setPendingDate] = useState<string | null>(null) // YYYY-MM-DD
  const [selectedChip, setSelectedChip] = useState<number | null>(null)
  const [updateNote, setUpdateNote] = useState('')
  const [customOpen, setCustomOpen] = useState(false)

  const load = () => fetch(`/api/external?id=${externalId}`)
    .then(r => r.json())
    .then(d => {
      const rep: Repair | undefined = (d.repairs || [])[0]
      if (rep) setRepair(rep)
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
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    border: '1px solid var(--border)', background: 'var(--bg-card, #fff)', color: 'var(--text-primary)',
    borderRadius: 9, padding: '6px 13px', fontSize: 12.5, fontWeight: 600,
    cursor: 'pointer', minHeight: 0, whiteSpace: 'nowrap',
  }

  const currentDate = repair?.expectedReturn ? repair.expectedReturn.slice(0, 10) : ''
  const hasDateChange = !!pendingDate && pendingDate !== currentDate
  const daysOut = repair?.sentDate ? Math.max(0, Math.floor((Date.now() - new Date(repair.sentDate).getTime()) / DAY_MS)) : null
  const overdueDays = repair?.expectedReturn && new Date(repair.expectedReturn).getTime() < Date.now() && repair.status !== 'returned'
    ? Math.floor((Date.now() - new Date(repair.expectedReturn).getTime()) / DAY_MS)
    : 0
  const su = repair ? (STATUS_UI[repair.status] ?? STATUS_UI.pending) : STATUS_UI.pending
  const followUps = (repair?.followUps ?? []).filter(f => f?.note)

  const clearStaged = () => { setPendingDate(null); setSelectedChip(null); setUpdateNote(''); setCustomOpen(false) }

  const toggleChip = (d: number) => {
    if (selectedChip === d) { clearStaged(); return }
    setSelectedChip(d)
    setCustomOpen(false)
    setPendingDate(localYmd(Date.now() + d * DAY_MS))
  }

  const commitUpdate = async () => {
    if (!hasDateChange || !updateNote.trim()) return
    const ok = await patch({
      expectedReturn: pendingDate,
      addFollowUp: { note: updateNote.trim(), etaDays: selectedChip ?? undefined },
    })
    if (ok) clearStaged()
  }

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
            <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: 0 }}>
              At <span style={{ fontWeight: 650 }}>{repair.shopName}</span>
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 12px' }}>
              {repair.sentDate ? `sent ${fmtDate(repair.sentDate)}` : 'not sent yet'}
              {daysOut != null && <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}> · {daysOut}d out</span>}
            </p>

            <p style={eyebrow}>Work</p>
            <p style={{ fontSize: 13, lineHeight: 1.5, margin: '0 0 14px', color: 'var(--text-primary)' }}>{repair.repairDescription}</p>
            {repair.notes && (
              <>
                <p style={eyebrow}>Notes</p>
                <p style={{ fontSize: 12.5, lineHeight: 1.5, margin: '0 0 14px', color: 'var(--text-secondary)' }}>{repair.notes}</p>
              </>
            )}

            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
              <p style={eyebrow}>Expected Back</p>
              <p style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>
                {currentDate ? fmtDay(currentDate) : 'No date set'}
                {overdueDays > 0 && <span style={{ color: '#b91c1c', fontWeight: 650, fontSize: 11.5 }}> · {overdueDays}d overdue</span>}
              </p>
            </div>
            <div style={{ marginBottom: 16 }}>
              {/* Segmented push control — tap to stage, tap again to clear */}
              <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
                {QUICK_DAYS.map((q, qi) => {
                  const on = selectedChip === q.d
                  return (
                    <button
                      key={q.d}
                      disabled={saving}
                      onClick={() => toggleChip(q.d)}
                      style={{
                        flex: 1, padding: '8px 0', fontSize: 12.5, fontWeight: 650, cursor: 'pointer', minHeight: 0,
                        border: 'none', borderLeft: qi === 0 ? 'none' : '1px solid var(--border-light, #f0f0ec)',
                        background: on ? '#eaf0fe' : '#fff',
                        color: on ? '#1d4ed8' : 'var(--text-secondary)',
                      }}
                    >+{q.label}</button>
                  )
                })}
                <button
                  disabled={saving}
                  onClick={() => {
                    if (customOpen) { clearStaged(); return }
                    setSelectedChip(null)
                    setCustomOpen(true)
                  }}
                  style={{
                    flex: 1.2, padding: '8px 0', fontSize: 12.5, fontWeight: 650, cursor: 'pointer', minHeight: 0,
                    border: 'none', borderLeft: '1px solid var(--border-light, #f0f0ec)',
                    background: customOpen ? '#eaf0fe' : '#fff',
                    color: customOpen ? '#1d4ed8' : 'var(--text-secondary)',
                  }}
                >Date…</button>
              </div>
              {customOpen && (
                <input
                  type="date"
                  autoFocus
                  value={pendingDate ?? currentDate}
                  disabled={saving}
                  onChange={e => { setPendingDate(e.target.value || null); setSelectedChip(null) }}
                  style={{ width: '100%', marginTop: 8, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 10, fontSize: 13.5, background: '#fff' }}
                />
              )}

              {/* A new date only commits WITH the reason — the history must explain it */}
              {hasDateChange && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg-primary, #f8f8f6)', marginTop: 8, padding: '10px 12px' }}>
                  <p style={{ fontSize: 12.5, fontWeight: 650, margin: '0 0 6px' }}>
                    {currentDate ? fmtDay(currentDate) : '—'} → <span style={{ color: '#1d4ed8' }}>{fmtDay(pendingDate!)}</span>
                    <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}> · what did the shop say?</span>
                  </p>
                  <textarea
                    autoFocus rows={2} value={updateNote} onChange={e => setUpdateNote(e.target.value)}
                    placeholder="Required — e.g. Called Singer, panel is in, one more week."
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12.5, resize: 'vertical', marginBottom: 8, background: '#fff' }}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      style={{ ...btn, flex: 1, background: '#eaf0fe', color: '#1d4ed8', border: '1px solid #bfd3fc', opacity: updateNote.trim() ? 1 : 0.5 }}
                      disabled={saving || !updateNote.trim()}
                      onClick={commitUpdate}
                    >Update — back {fmtDay(pendingDate!)}</button>
                    <button style={btn} disabled={saving} onClick={clearStaged}>Cancel</button>
                  </div>
                </div>
              )}
            </div>

            {followUps.length > 0 && (
              <>
                <p style={eyebrow}>Follow-Up History</p>
                <div style={{ border: '1px solid var(--border-light, #f0f0ec)', borderRadius: 10, marginBottom: 14, overflow: 'hidden' }}>
                  {followUps.slice(-5).reverse().map((f, i) => (
                    <div key={i} style={{ padding: '7px 12px', fontSize: 12.5, borderBottom: '1px solid var(--border-light, #f0f0ec)', display: 'flex', gap: 10 }}>
                      <span style={{ color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                        {f.date ? fmtShort(f.date) : '—'}
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>{f.note}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Not-sent repairs: the forward action is sending it out */}
            {repair.status === 'pending' && (
              <button
                style={{ ...btn, width: '100%', padding: '10px 0', background: '#eaf0fe', color: '#1d4ed8', border: '1px solid #bfd3fc', marginBottom: 8 }}
                disabled={saving}
                onClick={async () => {
                  if (!confirm(`Mark as sent to ${repair.shopName} today?${repair.partOnly ? '' : ' The car will show as at the shop.'}`)) return
                  await patch({ status: 'sent', fromStatus: 'pending', sentDate: new Date().toISOString() })
                }}
              >✓ Mark Sent Today</button>
            )}

            {/* Terminal actions: 50/50, then Close full width */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <button
                style={{ ...btn, flex: 1, padding: '10px 0', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', opacity: ['sent', 'in_progress'].includes(repair.status) ? 1 : 0.45 }}
                disabled={saving || !['sent', 'in_progress'].includes(repair.status)}
                onClick={() => patch({ status: 'ready', fromStatus: repair.status })}
              >✓ Ready for Pickup</button>
              <button
                style={{ ...btn, flex: 1, padding: '10px 0', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', opacity: ['sent', 'in_progress', 'ready'].includes(repair.status) ? 1 : 0.45 }}
                disabled={saving || !['sent', 'in_progress', 'ready'].includes(repair.status)}
                onClick={async () => {
                  if (!confirm(`Mark this ${repair.partOnly ? 'part' : 'car'} as returned from ${repair.shopName}?${repair.partOnly ? '' : ' The car goes to Pending Routing on the recon board.'}`)) return
                  const ok = await patch({ status: 'returned', fromStatus: repair.status })
                  if (ok) onClose()
                }}
              >✓ Returned</button>
            </div>
            <button onClick={onClose} style={{
              width: '100%', padding: '12px 0', borderRadius: 10, border: '1px solid var(--border)',
              background: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}>Close</button>
          </>
        )}
      </div>
    </div>
  )
}
