'use client'

import { useState } from 'react'

type Props = {
  stockNumber: string
  vehicleDesc: string  // e.g. "1969 Porsche 911"
  onClose: () => void
  onAdded?: () => void
}

export default function AddPartModal({ stockNumber, vehicleDesc, onClose, onAdded }: Props) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    if (!name.trim()) return
    setSaving(true)
    setError('')
    try {
      // Resolve stockNumber → Vehicle.id (creates a placeholder if no recon record)
      const resolveRes = await fetch('/api/vehicles/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stockNumber }),
      })
      const resolveData = await resolveRes.json()
      if (!resolveData.vehicleId) {
        setError(resolveData.error || 'Could not link this part to a vehicle')
        setSaving(false)
        return
      }

      const res = await fetch('/api/parts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleId: resolveData.vehicleId,
          name: name.trim(),
          url: url.trim() || null,
          notes: notes.trim() || null,
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error || 'Failed to add part')
        setSaving(false)
        return
      }
      onAdded?.()
      onClose()
    } catch (e: any) {
      setError(e.message || 'Network error')
    }
    setSaving(false)
  }

  return (
    <div
      onClick={() => !saving && onClose()}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1500, padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 16, width: '100%', maxWidth: 460,
          padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
        }}
      >
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Add Part</h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
          #{stockNumber} — {vehicleDesc}
        </p>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
            Part Name *
          </label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Front brake rotors"
            className="input"
            autoFocus
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
            Link (optional)
          </label>
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://..."
            className="input"
          />
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            If you have a vendor link, paste it. Otherwise leave blank and parts will source it.
          </p>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
            Notes
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            placeholder="Anything the parts team should know"
            className="input"
            style={{ resize: 'vertical', minHeight: 60 }}
          />
        </div>

        {error && (
          <div style={{
            padding: '10px 14px', borderRadius: 8, marginBottom: 14,
            background: 'var(--danger-bg)', color: 'var(--danger)',
            border: '1px solid var(--danger-border)', fontSize: 13,
          }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              flex: 1, padding: '12px 0', borderRadius: 10,
              border: '1px solid var(--border)', background: '#fff',
              fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}
          >Cancel</button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || !name.trim()}
            style={{
              flex: 1, padding: '12px 0', borderRadius: 10, border: 'none',
              background: '#1a1a1a', color: '#dffd6e',
              fontSize: 14, fontWeight: 700,
              cursor: saving || !name.trim() ? 'not-allowed' : 'pointer',
              opacity: saving || !name.trim() ? 0.5 : 1,
            }}
          >{saving ? 'Adding…' : 'Add Part'}</button>
        </div>
      </div>
    </div>
  )
}
