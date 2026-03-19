'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { EVENT_TYPE_LABELS } from '@/lib/events'

export default function EditEventPage() {
  const router = useRouter()
  const params = useParams()
  const eventId = params.id as string
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<{ id: string; name: string }[]>([])

  const [name, setName] = useState('')
  const [type, setType] = useState('')
  const [date, setDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [ownerId, setOwnerId] = useState('')

  useEffect(() => {
    fetch('/api/users').then(r => r.json()).then(d => setUsers((d.users || d).filter((x: { isActive: boolean }) => x.isActive)))
    fetch(`/api/events/${eventId}`).then(r => r.json()).then(event => {
      setName(event.name)
      setType(event.type)
      setDate(new Date(event.date).toISOString().split('T')[0])
      setEndDate(event.endDate ? new Date(event.endDate).toISOString().split('T')[0] : '')
      setLocation(event.location || '')
      setDescription(event.description || '')
      setOwnerId(event.owner?.id || '')
      setLoading(false)
    })
  }, [eventId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name || !date) return
    setSaving(true)

    const res = await fetch(`/api/events/${eventId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, type,
        date: `${date}T00:00:00`,
        endDate: endDate ? `${endDate}T23:59:59` : null,
        location: location || null,
        description: description || null,
        ownerId: ownerId || undefined,
      }),
    })

    if (res.ok) router.push(`/events/${eventId}`)
    else setSaving(false)
  }

  if (loading) return <p style={{ color: 'var(--text-muted)', padding: 40, textAlign: 'center' }}>Loading...</p>

  return (
    <div style={{ maxWidth: 600 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, letterSpacing: '-0.02em' }}>Edit Event</h1>

      <form onSubmit={handleSubmit}>
        <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <label className="form-label">Event Name</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} required />
          </div>

          <div>
            <label className="form-label">Type</label>
            <select className="input" value={type} onChange={e => setType(e.target.value)}>
              {Object.entries(EVENT_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label className="form-label">Start Date</label>
              <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} required />
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label className="form-label">End Date (optional)</label>
              <input className="input" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="form-label">Location</label>
            <input className="input" value={location} onChange={e => setLocation(e.target.value)} placeholder="Venue or address" />
          </div>

          <div>
            <label className="form-label">Event Owner</label>
            <select className="input" value={ownerId} onChange={e => setOwnerId(e.target.value)}>
              <option value="">Select owner</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>

          <div>
            <label className="form-label">Description</label>
            <textarea className="input" value={description} onChange={e => setDescription(e.target.value)} rows={3}
              placeholder="What's this event about?" style={{ resize: 'vertical' }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
          <button type="submit" className="btn btn-primary" disabled={saving} style={{ flex: 1 }}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => router.push(`/events/${eventId}`)}>Cancel</button>
        </div>
      </form>
    </div>
  )
}
