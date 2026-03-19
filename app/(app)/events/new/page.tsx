'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { EVENT_TYPE_LABELS, SUGGESTED_SECTIONS } from '@/lib/events'

export default function NewEventPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [users, setUsers] = useState<{ id: string; name: string }[]>([])

  const [name, setName] = useState('')
  const [type, setType] = useState('dealership_event')
  const [date, setDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [ownerId, setOwnerId] = useState('')
  const [sections, setSections] = useState<string[]>([])
  const [customSection, setCustomSection] = useState('')

  useEffect(() => {
    fetch('/api/users').then(r => r.json()).then(d => setUsers((d.users || d).filter((x: { isActive: boolean }) => x.isActive)))
  }, [])

  function toggleSection(name: string) {
    setSections(prev => prev.includes(name) ? prev.filter(s => s !== name) : [...prev, name])
  }

  function addCustomSection() {
    if (customSection.trim() && !sections.includes(customSection.trim())) {
      setSections(prev => [...prev, customSection.trim()])
      setCustomSection('')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name || !date) return
    setSaving(true)

    const res = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, type,
        date: `${date}T00:00:00`,
        endDate: endDate ? `${endDate}T23:59:59` : null,
        location: location || null,
        description: description || null,
        ownerId: ownerId || undefined,
        sections: sections.map(s => ({ name: s })),
      }),
    })

    if (res.ok) {
      const event = await res.json()
      router.push(`/events/${event.id}`)
    } else {
      setSaving(false)
    }
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, letterSpacing: '-0.02em' }}>New Event</h1>

      <form onSubmit={handleSubmit}>
        <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Name */}
          <div>
            <label className="form-label">Event Name</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Saturday Car Show" required />
          </div>

          {/* Type */}
          <div>
            <label className="form-label">Type</label>
            <select className="input" value={type} onChange={e => setType(e.target.value)}>
              {Object.entries(EVENT_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          {/* Dates */}
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

          {/* Location */}
          <div>
            <label className="form-label">Location</label>
            <input className="input" value={location} onChange={e => setLocation(e.target.value)} placeholder="Venue or address" />
          </div>

          {/* Owner */}
          <div>
            <label className="form-label">Event Owner</label>
            <select className="input" value={ownerId} onChange={e => setOwnerId(e.target.value)}>
              <option value="">Select owner</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="form-label">Description</label>
            <textarea className="input" value={description} onChange={e => setDescription(e.target.value)} rows={3}
              placeholder="What's this event about?" style={{ resize: 'vertical' }} />
          </div>

          {/* Sections */}
          <div>
            <label className="form-label">Sections (you can add more later)</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4, marginBottom: 12 }}>
              {SUGGESTED_SECTIONS.map(s => (
                <button key={s} type="button" onClick={() => toggleSection(s)} style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: `1px solid ${sections.includes(s) ? '#1a1a1a' : 'var(--border)'}`,
                  background: sections.includes(s) ? '#1a1a1a' : '#fff',
                  color: sections.includes(s) ? '#dffd6e' : 'var(--text-secondary)',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  minHeight: 36,
                }}>
                  {s}
                </button>
              ))}
            </div>
            {/* Custom section */}
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input" value={customSection} onChange={e => setCustomSection(e.target.value)}
                placeholder="Custom section name" style={{ flex: 1 }}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomSection() } }} />
              <button type="button" className="btn btn-secondary" onClick={addCustomSection}
                style={{ padding: '8px 16px', minHeight: 36 }}>Add</button>
            </div>
            {/* Selected sections */}
            {sections.length > 0 && (
              <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {sections.map((s, i) => (
                  <span key={s} style={{
                    padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                    background: 'var(--bg-primary)', color: 'var(--text-secondary)',
                    border: '1px solid var(--border)',
                  }}>
                    {i + 1}. {s}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
          <button type="submit" className="btn btn-primary" disabled={saving} style={{ flex: 1 }}>
            {saving ? 'Creating...' : 'Create Event'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => router.back()}>Cancel</button>
        </div>
      </form>
    </div>
  )
}
