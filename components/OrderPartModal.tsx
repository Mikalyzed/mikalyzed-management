'use client'

import { useState } from 'react'

type Props = {
  partId: string
  partName: string
  onClose: () => void
  onComplete: () => void
}

export default function OrderPartModal({ partId, partName, onClose, onComplete }: Props) {
  const [tracking, setTracking] = useState('')
  const [orderImage, setOrderImage] = useState<string | null>(null)
  const [expectedDelivery, setExpectedDelivery] = useState('')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const canSubmit = tracking.trim() || orderImage

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (res.ok) setOrderImage(data.url)
      else setError('Upload failed')
    } catch { setError('Upload failed') }
    setUploading(false)
  }

  async function handleSubmit() {
    if (!canSubmit) { setError('Please provide a tracking number or upload an order confirmation'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/parts/${partId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'ordered',
          tracking: tracking.trim() || null,
          orderImage: orderImage || null,
          expectedDelivery: expectedDelivery || null,
        })
      })
      if (res.ok) { onComplete(); onClose() }
      else { const d = await res.json(); setError(d.error || 'Failed to update') }
    } catch { setError('Network error') }
    setSaving(false)
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 420, padding: '24px', boxShadow: '0 -4px 30px rgba(0,0,0,0.15)' }}>
        <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>Mark as Ordered</h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>{partName}</p>

        {/* Tracking Number */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
            Tracking Number
          </label>
          <input
            type="text" value={tracking} onChange={e => setTracking(e.target.value)}
            placeholder="Enter tracking number..."
            style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14 }}
          />
        </div>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>OR</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        {/* Order Confirmation Image */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
            Order Confirmation Image
          </label>
          {orderImage ? (
            <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
              <img src={orderImage} alt="Order confirmation" style={{ width: '100%', maxHeight: 200, objectFit: 'contain', background: '#f9fafb' }} />
              <button onClick={() => setOrderImage(null)} style={{
                position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: '50%',
                background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', fontSize: 14, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
              }}>×</button>
            </div>
          ) : (
            <label style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '20px', borderRadius: 8, border: '2px dashed var(--border)',
              background: '#f9fafb', cursor: 'pointer', fontSize: 14, color: 'var(--text-muted)',
              transition: 'border-color 0.15s',
            }}>
              <input type="file" accept="image/*" onChange={handleUpload} style={{ display: 'none' }} />
              {uploading ? 'Uploading...' : '📷 Click to upload image'}
            </label>
          )}
        </div>

        {/* Expected Delivery Date */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
            Expected Delivery Date <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span>
          </label>
          <input
            type="date" value={expectedDelivery} onChange={e => setExpectedDelivery(e.target.value)}
            style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14 }}
          />
        </div>

        {error && (
          <div style={{ padding: '10px 14px', borderRadius: 8, fontSize: 13, background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', marginBottom: 16 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '12px 0', borderRadius: 10, border: '1px solid var(--border)',
            background: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={handleSubmit} disabled={saving || !canSubmit} style={{
            flex: 1, padding: '12px 0', borderRadius: 10, border: 'none',
            background: '#1a1a1a', color: '#dffd6e', fontSize: 14, fontWeight: 700, cursor: 'pointer',
            opacity: saving || !canSubmit ? 0.5 : 1,
          }}>{saving ? 'Saving...' : 'Mark Ordered'}</button>
        </div>
      </div>
    </div>
  )
}
