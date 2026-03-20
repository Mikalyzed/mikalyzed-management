'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LEAD_SOURCE_LABELS } from '@/lib/crm'

type Pipeline = { id: string; name: string; color: string; stages: { id: string; name: string }[] }

export default function NewLeadPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [users, setUsers] = useState<{ id: string; name: string }[]>([])
  const [vehicles, setVehicles] = useState<{ id: string; stockNumber: string; make: string; model: string; year: number }[]>([])

  // Contact fields
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')

  // Opportunity fields
  const [pipelineId, setPipelineId] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [vehicleId, setVehicleId] = useState('')
  const [vehicleInterest, setVehicleInterest] = useState('')
  const [source, setSource] = useState('walk_in')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    fetch('/api/pipelines').then(r => r.json()).then((data: Pipeline[]) => {
      setPipelines(data)
      if (data.length > 0) setPipelineId(data[0].id)
    })
    fetch('/api/users').then(r => r.json()).then(d => setUsers((d.users || d).filter((x: { isActive: boolean }) => x.isActive)))
    fetch('/api/vehicles').then(r => r.json()).then(d => setVehicles(d.vehicles || d))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!firstName || !lastName || !pipelineId) return
    setSaving(true)

    // Create contact
    const contactRes = await fetch('/api/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName, lastName, phone: phone || null, email: email || null, source }),
    })

    let contactId: string
    if (contactRes.status === 409) {
      // Contact exists, use existing
      const existing = await contactRes.json()
      contactId = existing.existingId
    } else if (contactRes.ok) {
      const contact = await contactRes.json()
      contactId = contact.id
    } else {
      setSaving(false)
      return
    }

    // Create opportunity
    const oppRes = await fetch('/api/opportunities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contactId,
        pipelineId,
        assigneeId: assigneeId || null,
        vehicleId: vehicleId || null,
        vehicleInterest: vehicleInterest || null,
        source,
      }),
    })

    if (oppRes.ok) {
      const opp = await oppRes.json()
      // Add note if provided
      if (notes.trim()) {
        await fetch(`/api/opportunities/${opp.id}/notes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: notes }),
        })
      }
      router.push('/leads')
    } else {
      setSaving(false)
    }
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, letterSpacing: '-0.02em' }}>New Lead</h1>

      <form onSubmit={handleSubmit}>
        {/* Contact Info */}
        <div className="card" style={{ padding: 24, marginBottom: 16 }}>
          <div className="section-label" style={{ marginBottom: 16 }}>Contact Info</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label className="form-label">First Name</label>
                <input className="input" value={firstName} onChange={e => setFirstName(e.target.value)} required />
              </div>
              <div style={{ flex: 1 }}>
                <label className="form-label">Last Name</label>
                <input className="input" value={lastName} onChange={e => setLastName(e.target.value)} required />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label className="form-label">Phone</label>
                <input className="input" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 (305) 555-1234" />
              </div>
              <div style={{ flex: 1 }}>
                <label className="form-label">Email</label>
                <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        {/* Opportunity Info */}
        <div className="card" style={{ padding: 24, marginBottom: 16 }}>
          <div className="section-label" style={{ marginBottom: 16 }}>Opportunity</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label className="form-label">Pipeline</label>
                <select className="input" value={pipelineId} onChange={e => setPipelineId(e.target.value)}>
                  {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label className="form-label">Source</label>
                <select className="input" value={source} onChange={e => setSource(e.target.value)}>
                  {Object.entries(LEAD_SOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="form-label">Assign To (leave blank for round robin)</label>
              <select className="input" value={assigneeId} onChange={e => setAssigneeId(e.target.value)}>
                <option value="">Auto-assign (Round Robin)</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>

            <div>
              <label className="form-label">Vehicle Interest</label>
              <select className="input" value={vehicleId} onChange={e => setVehicleId(e.target.value)}>
                <option value="">No specific vehicle</option>
                {vehicles.map(v => (
                  <option key={v.id} value={v.id}>#{v.stockNumber} — {v.year} {v.make} {v.model}</option>
                ))}
              </select>
            </div>

            {!vehicleId && (
              <div>
                <label className="form-label">General Interest (if no specific vehicle)</label>
                <input className="input" value={vehicleInterest} onChange={e => setVehicleInterest(e.target.value)}
                  placeholder="e.g. White SUV under $30K" />
              </div>
            )}

            <div>
              <label className="form-label">Notes</label>
              <textarea className="input" value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                placeholder="Any details about this lead..." style={{ resize: 'vertical' }} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button type="submit" className="btn btn-primary" disabled={saving} style={{ flex: 1 }}>
            {saving ? 'Creating...' : 'Create Lead'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => router.back()}>Cancel</button>
        </div>
      </form>
    </div>
  )
}
