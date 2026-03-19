'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { CALENDAR_TYPE_LABELS, CALENDAR_TYPE_COLORS, CALENDAR_STATUS_LABELS } from '@/lib/calendar'

type CalendarItem = {
  id: string
  title: string
  type: string
  date: string
  endDate: string | null
  allDay: boolean
  location: string | null
  notes: string | null
  status: string
  vehicleId: string | null
  eventId: string | null
  createdBy: { id: string; name: string }
  assignees: { user: { id: string; name: string; role: string } }[]
  vehicle: { id: string; stockNumber: string; year: number; make: string; model: string; color: string } | null
  event: { id: string; name: string; date: string } | null
}

export default function CalendarItemDetail() {
  const router = useRouter()
  const params = useParams()
  const [item, setItem] = useState<CalendarItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editLocation, setEditLocation] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editTime, setEditTime] = useState('')

  useEffect(() => {
    fetch(`/api/calendar/${params.id}`).then(r => r.json()).then(d => {
      setItem(d)
      setLoading(false)
    })
  }, [params.id])

  async function updateStatus(status: string) {
    const res = await fetch(`/api/calendar/${params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (res.ok) {
      setItem(prev => prev ? { ...prev, status } : null)
    }
  }

  async function handleSaveEdit() {
    const dateStr = `${editDate}T${editTime || '09:00'}:00`
    const res = await fetch(`/api/calendar/${params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: editTitle,
        location: editLocation || null,
        notes: editNotes || null,
        date: dateStr,
      }),
    })
    if (res.ok) {
      const updated = await res.json()
      setItem(prev => prev ? { ...prev, ...updated } : null)
      setEditing(false)
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this calendar item?')) return
    const res = await fetch(`/api/calendar/${params.id}`, { method: 'DELETE' })
    if (res.ok) router.push('/calendar')
  }

  function startEdit() {
    if (!item) return
    setEditTitle(item.title)
    setEditLocation(item.location || '')
    setEditNotes(item.notes || '')
    const d = new Date(item.date)
    setEditDate(d.toISOString().split('T')[0])
    setEditTime(d.toTimeString().slice(0, 5))
    setEditing(true)
  }

  if (loading) return <p style={{ color: 'var(--text-muted)', padding: 40, textAlign: 'center' }}>Loading...</p>
  if (!item) return <p style={{ color: 'var(--text-muted)', padding: 40, textAlign: 'center' }}>Not found</p>

  const typeColor = CALENDAR_TYPE_COLORS[item.type as keyof typeof CALENDAR_TYPE_COLORS] || '#6b7280'
  const typeLabel = CALENDAR_TYPE_LABELS[item.type as keyof typeof CALENDAR_TYPE_LABELS] || item.type
  const date = new Date(item.date)
  const isDone = item.status === 'completed' || item.status === 'cancelled'

  return (
    <div style={{ maxWidth: 600 }}>
      {/* Back */}
      <Link href="/calendar" style={{ fontSize: 14, color: 'var(--text-muted)', textDecoration: 'none', fontWeight: 500, display: 'inline-block', marginBottom: 20, minHeight: 'auto' }}>
        ← Back to Calendar
      </Link>

      {/* Hero card */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ height: 6, background: typeColor }} />
        <div style={{ padding: 24 }}>
          {editing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <input className="input" value={editTitle} onChange={e => setEditTitle(e.target.value)} />
              <div style={{ display: 'flex', gap: 12 }}>
                <input className="input" type="date" value={editDate} onChange={e => setEditDate(e.target.value)} style={{ flex: 1 }} />
                <input className="input" type="time" value={editTime} onChange={e => setEditTime(e.target.value)} style={{ flex: 1 }} />
              </div>
              <input className="input" value={editLocation} onChange={e => setEditLocation(e.target.value)} placeholder="Location" />
              <textarea className="input" value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={3} placeholder="Notes" />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" onClick={handleSaveEdit} style={{ flex: 1 }}>Save</button>
                <button className="btn btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div>
                  <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 8 }}>{item.title}</h1>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <span style={{
                      padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                      background: `${typeColor}15`, color: typeColor,
                    }}>{typeLabel}</span>
                    <span className={`badge badge-${item.status === 'completed' ? 'done' : item.status === 'cancelled' ? 'blocked' : 'in-progress'}`}>
                      {CALENDAR_STATUS_LABELS[item.status as keyof typeof CALENDAR_STATUS_LABELS] || item.status}
                    </span>
                  </div>
                </div>
                {!isDone && (
                  <button className="btn btn-secondary" onClick={startEdit} style={{ padding: '6px 14px', fontSize: 13, minHeight: 34 }}>Edit</button>
                )}
              </div>

              {/* Details grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginTop: 16 }}>
                <div>
                  <div className="form-label">Date</div>
                  <div style={{ fontSize: 15, fontWeight: 500 }}>
                    {date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                </div>
                {!item.allDay && (
                  <div>
                    <div className="form-label">Time</div>
                    <div style={{ fontSize: 15, fontWeight: 500 }}>
                      {date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      {item.endDate && ` — ${new Date(item.endDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`}
                    </div>
                  </div>
                )}
                {item.location && (
                  <div>
                    <div className="form-label">Location</div>
                    <div style={{ fontSize: 15, fontWeight: 500 }}>{item.location}</div>
                  </div>
                )}
                <div>
                  <div className="form-label">Created By</div>
                  <div style={{ fontSize: 15, fontWeight: 500 }}>{item.createdBy.name}</div>
                </div>
              </div>

              {/* Notes */}
              {item.notes && (
                <div style={{ marginTop: 20, padding: 16, background: 'var(--bg-primary)', borderRadius: 10 }}>
                  <div className="form-label">Notes</div>
                  <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text-secondary)' }}>{item.notes}</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Assignees */}
      {item.assignees.length > 0 && (
        <div className="card" style={{ padding: 20, marginBottom: 20 }}>
          <div className="form-label" style={{ marginBottom: 12 }}>Assigned To</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {item.assignees.map(a => (
              <div key={a.user.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', background: '#1a1a1a', color: '#dffd6e',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700,
                }}>{a.user.name.charAt(0)}</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{a.user.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{a.user.role}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Linked vehicle */}
      {item.vehicle && (
        <Link href={`/vehicles/${item.vehicle.id}`} className="card" style={{ padding: 16, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit' }}>
          <div className="form-label" style={{ marginBottom: 0, minWidth: 60 }}>Vehicle</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            {item.vehicle.year} {item.vehicle.make} {item.vehicle.model}
            <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 8 }}>#{item.vehicle.stockNumber}</span>
          </div>
        </Link>
      )}

      {/* Linked event */}
      {item.event && (
        <Link href={`/events/${item.event.id}`} className="card" style={{ padding: 16, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit' }}>
          <div className="form-label" style={{ marginBottom: 0, minWidth: 60 }}>Event</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{item.event.name}</div>
        </Link>
      )}

      {/* Actions */}
      {!isDone && !editing && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {item.status === 'scheduled' && (
            <button className="btn btn-secondary" onClick={() => updateStatus('confirmed')} style={{ flex: 1 }}>Confirm</button>
          )}
          {(item.status === 'scheduled' || item.status === 'confirmed') && (
            <button className="btn btn-secondary" onClick={() => updateStatus('in_progress')} style={{ flex: 1 }}>Start</button>
          )}
          {item.status !== 'completed' && (
            <button className="btn btn-success" onClick={() => updateStatus('completed')} style={{ flex: 1 }}>Complete</button>
          )}
          <button className="btn btn-danger" onClick={() => updateStatus('cancelled')}>Cancel</button>
          <button className="btn btn-secondary" onClick={handleDelete} style={{ fontSize: 13 }}>Delete</button>
        </div>
      )}
    </div>
  )
}
