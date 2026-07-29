'use client'

import { useState } from 'react'

/**
 * "Bought in person" — someone drove out and bought the part; no link, no
 * order step. Receipt + price attach if in hand; otherwise admin gets a
 * reminder task to enter them later. Shared by the parts page and the
 * coordinator board's Source Queue.
 */
export default function BoughtPartModal({ part, onClose, onDone }: {
  part: { id: string; name: string }
  onClose: () => void
  onDone: () => void
}) {
  const [price, setPrice] = useState('')
  const [receipt, setReceipt] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (res.ok) setReceipt(data.url)
      else setError('Upload failed — try again.')
    } catch { setError('Upload failed — try again.') }
    setUploading(false)
  }

  async function submit(receiptToAdmin: boolean) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/parts/${part.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selfPurchase: true,
          price: price.trim() || undefined,
          orderImage: receipt || undefined,
          receiptToAdmin,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error || 'Could not save.')
        return
      }
      onDone()
    } finally {
      setSaving(false)
    }
  }

  const hasProof = !!(price.trim() || receipt)

  return (
    <div onClick={() => !saving && onClose()} className="modal-below-topbar" style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 16, width: '100%', maxWidth: 420,
        padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
      }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Purchased in store</h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 18 }}>{part.name} — marks it received, no link or order step needed.</p>

        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 6px' }}>Price paid</p>
        <input
          value={price}
          onChange={e => setPrice(e.target.value)}
          placeholder="e.g. $84.99"
          inputMode="decimal"
          style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14, marginBottom: 16 }}
        />

        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 6px' }}>Receipt photo</p>
        {receipt ? (
          <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
            <img src={receipt} alt="Receipt" style={{ width: '100%', maxHeight: 160, objectFit: 'contain', background: '#f9fafb' }} />
            <button onClick={() => setReceipt(null)} style={{ width: '100%', padding: '8px 0', border: 'none', borderTop: '1px solid var(--border)', background: '#fff', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer' }}>Remove</button>
          </div>
        ) : (
          <label style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '14px', borderRadius: 10, border: '1.5px dashed var(--border)',
            fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer', marginBottom: 16,
          }}>
            {uploading ? 'Uploading…' : 'Snap / upload the receipt'}
            <input type="file" accept="image/*" capture="environment" onChange={handleUpload} style={{ display: 'none' }} disabled={uploading} />
          </label>
        )}

        {error && <p style={{ fontSize: 13, color: '#dc2626', margin: '0 0 12px' }}>{error}</p>}

        <button
          disabled={saving || uploading || !hasProof}
          onClick={() => submit(false)}
          style={{
            width: '100%', padding: '12px 0', borderRadius: 10, border: 'none',
            background: saving || !hasProof ? '#e5e5e5' : '#1a1a1a', color: '#fff',
            fontSize: 14, fontWeight: 700, cursor: saving || !hasProof ? 'not-allowed' : 'pointer', marginBottom: 8,
          }}
        >{saving ? 'Saving…' : '✓ Done — receipt & price attached'}</button>
        <button
          disabled={saving || uploading}
          onClick={() => submit(true)}
          style={{
            width: '100%', padding: '12px 0', borderRadius: 10,
            border: '1px solid var(--border)', background: '#fff',
            fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer', marginBottom: 8,
          }}
        >Admin has the receipt — remind them to enter it</button>
        <button disabled={saving} onClick={onClose} style={{ width: '100%', padding: '10px 0', borderRadius: 10, border: 'none', background: 'none', fontSize: 13, color: 'var(--text-muted)', cursor: 'pointer' }}>Cancel</button>
      </div>
    </div>
  )
}
