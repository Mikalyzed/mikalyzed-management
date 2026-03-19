'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CALENDAR_TYPE_LABELS } from '@/lib/calendar'

export default function NewCalendarItem() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [users, setUsers] = useState<{ id: string; name: string }[]>([])
  const [vehicles, setVehicles] = useState<{ id: string; stockNumber: string; make: string; model: string }[]>([])
  const [events, setEvents] = useState<{ id: string; name: string }[]>([])

  const [title, setTitle] = useState('')
  const [type, setType] = useState('errand')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [allDay, setAllDay] = useState(false)
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [assigneeIds, setAssigneeIds] = useState<string[]>([])
  const [vehicleId, setVehicleId] = useState('')
  const [eventId, setEventId] = useState('')

  useEffect(() => {
    fetch('/api/users').then(r => r.json()).then(u => setUsers(u.filter((x: { isActive: boolean }) => x.isActive)))
    fetch('/api/vehicles').then(r => r.json()).then(v => setVehicles(v))
    fetch('/api/events').then(r => r.json()).then(e => setEvents(e))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title || !date) return
    setSaving(true)

    const dateStr = allDay ? `${date}T00:00:00` : `${date}T${time || '09:00'}:00`
    const endDateStr = !allDay && endTime ? `${date}T${endTime}:00` : null

    const res = await fetch('/api/calendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title, type, date: dateStr, endDate: endDateStr, allDay,
        location: location || null, notes: notes || null,
        assigneeIds, vehicleId: vehicleId || null, eventId: eventId || null,
      }),
    })

    if (res.ok) router.push('/calendar')
    else setSaving(false)
  }

  function toggleAssignee(id: string) {
    setAssigneeIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, letterSpacing: '-0.02em' }}>New Calendar Item</h1>

      <form onSubmit={handleSubmit}>
        <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Title */}
          <div>
            <label className="form-label">Title</label>
            <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Pick up BMW from auction" required />
          </div>

          {/* Type */}
          <div>
            <label className="form-label">Type</label>
            <select className="input" value={type} onChange={e => setType(e.target.value)}>
              {Object.entries(CALENDAR_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          {/* Date & Time */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label className="form-label">Date</label>
              <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} required />
            </div>
            {!allDay && (
              <>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <label className="form-label">Start Time</label>
                  <input className="input" type="time" value={time} onChange={e => setTime(e.target.value)} />
                </div>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <label className="form-label">End Time</label>
                  <input className="input" type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
                </div>
              </>
            )}
          </div>

          {/* All Day toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>
            <input type="checkbox" checked={allDay} onChange={e => setAllDay(e.target.checked)}
              style={{ width: 18, height: 18, accentColor: '#1a1a1a' }} />
            All Day
          </label>

          {/* Location */}
          <div>
            <label className="form-label">Location</label>
            <input className="input" value={location} onChange={e => setLocation(e.target.value)} placeholder="Address or location name" />
          </div>

          {/* Assignees */}
          <div>
            <label className="form-label">Assign To</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
              {users.map(u => (
                <button key={u.id} type="button" onClick={() => toggleAssignee(u.id)} style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: `1px solid ${assigneeIds.includes(u.id) ? '#1a1a1a' : 'var(--border)'}`,
                  background: assigneeIds.includes(u.id) ? '#1a1a1a' : '#fff',
                  color: assigneeIds.includes(u.id) ? '#dffd6e' : 'var(--text-secondary)',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  minHeight: 36,
                }}>
                  {u.name}
                </button>
              ))}
            </div>
          </div>

          {/* Link Vehicle */}
          <div>
            <label className="form-label">Link Vehicle (optional)</label>
            <select className="input" value={vehicleId} onChange={e => setVehicleId(e.target.value)}>
              <option value="">None</option>
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>{v.stockNumber} — {v.make} {v.model}</option>
              ))}
            </select>
          </div>

          {/* Link Event */}
          {events.length > 0 && (
            <div>
              <label className="form-label">Link Event (optional)</label>
              <select className="input" value={eventId} onChange={e => setEventId(e.target.value)}>
                <option value="">None</option>
                {events.map(ev => (
                  <option key={ev.id} value={ev.id}>{ev.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="form-label">Notes</label>
            <textarea className="input" value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              placeholder="Instructions or details" style={{ resize: 'vertical' }} />
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
          <button type="submit" className="btn btn-primary" disabled={saving} style={{ flex: 1 }}>
            {saving ? 'Saving...' : 'Create Item'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => router.back()}>Cancel</button>
        </div>
      </form>
    </div>
  )
}
