'use client'

import { useState } from 'react'

type Props = {
  stockNumber: string
  vehicleDesc: string  // e.g. "1969 Porsche 911"
  onClose: () => void
  onAdded?: () => void
  defaultName?: string  // Pre-fill the part name (e.g. when opened from a specific inspection task)
  sourceItem?: string  // Inspection task this part is linked to (for inline display under that task)
  sourceSubField?: string  // Sub-field within the parent task (e.g. "Brake lights" in Electrical)
}

export default function AddPartModal({ stockNumber, vehicleDesc, onClose, onAdded, defaultName, sourceItem, sourceSubField }: Props) {
  const [name, setName] = useState(defaultName || '')
  const [url, setUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    if (!name.trim()) return
    setSaving(true)
    setError('')

    // Step 1: resolve stockNumber → vehicleId
    let vehicleId: string | null = null
    try {
      const resolveRes = await fetch('/api/vehicles/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stockNumber }),
      })
      const resolveText = await resolveRes.text()
      let resolveData: { vehicleId?: string; error?: string } = {}
      try {
        resolveData = JSON.parse(resolveText)
      } catch {
        setError(`Resolve returned non-JSON (${resolveRes.status}): ${resolveText.slice(0, 200)}`)
        setSaving(false)
        return
      }
      if (!resolveRes.ok || !resolveData.vehicleId) {
        setError(resolveData.error || `Resolve failed (${resolveRes.status})`)
        setSaving(false)
        return
      }
      vehicleId = resolveData.vehicleId
    } catch (e: any) {
      setError(`Resolve error: ${e?.message || 'Network error'}`)
      setSaving(false)
      return
    }

    // Step 2: create the part
    try {
      const res = await fetch('/api/parts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleId,
          name: name.trim(),
          url: url.trim() || null,
          notes: notes.trim() || null,
          sourceItem: sourceItem || null,
          sourceSubField: sourceSubField || null,
        }),
      })
      const text = await res.text()
      let data: { error?: string; part?: { id: string } } = {}
      try {
        data = JSON.parse(text)
      } catch {
        setError(`Create returned non-JSON (${res.status}): ${text.slice(0, 200)}`)
        setSaving(false)
        return
      }
      if (!res.ok) {
        setError(data.error || `Failed to add part (${res.status})`)
        setSaving(false)
        return
      }
      onAdded?.()
      onClose()
    } catch (e: any) {
      setError(`Create error: ${e?.message || 'Network error'}`)
    }
    setSaving(false)
  }

  return (
    <div
      onClick={() => !saving && onClose()}
      className="modal-below-topbar"
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
            type="text"
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
            type="text"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="paste link here..."
            className="input"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
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
