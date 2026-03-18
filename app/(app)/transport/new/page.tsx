'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

type VehicleOption = { id: string; stockNumber: string; year: number | null; make: string; model: string }

export default function NewTransportPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [vehicles, setVehicles] = useState<VehicleOption[]>([])
  const [useExisting, setUseExisting] = useState(true)

  useEffect(() => {
    fetch('/api/vehicles')
      .then((r) => r.json())
      .then((data) => setVehicles(data.vehicles || []))
      .catch(console.error)
  }, [])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const form = new FormData(e.currentTarget)
    const data = {
      vehicleId: useExisting ? form.get('vehicleId') : null,
      vehicleDescription: !useExisting ? form.get('vehicleDescription') : null,
      pickupLocation: form.get('pickupLocation'),
      deliveryLocation: form.get('deliveryLocation'),
      urgency: form.get('urgency'),
      preferredDate: form.get('preferredDate') || null,
      notes: form.get('notes'),
    }

    try {
      const res = await fetch('/api/transport', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const result = await res.json()
      if (!res.ok) {
        setError(result.error || 'Failed to create request')
        return
      }
      router.push('/transport')
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto">
      <button onClick={() => router.back()} className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
        ← Back
      </button>

      <h1 className="text-2xl font-bold tracking-tight mb-6">New Transport Request</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {/* Vehicle selection */}
        <div>
          <label className="form-label">Vehicle</label>
          <div className="flex gap-2 mb-3">
            <button type="button" onClick={() => setUseExisting(true)}
              className="px-4 py-2 rounded-lg text-sm font-semibold"
              style={{
                background: useExisting ? 'var(--bg-sidebar)' : 'var(--bg-card)',
                color: useExisting ? 'var(--accent)' : 'var(--text-secondary)',
                border: useExisting ? 'none' : '1px solid var(--border)',
              }}>
              From Inventory
            </button>
            <button type="button" onClick={() => setUseExisting(false)}
              className="px-4 py-2 rounded-lg text-sm font-semibold"
              style={{
                background: !useExisting ? 'var(--bg-sidebar)' : 'var(--bg-card)',
                color: !useExisting ? 'var(--accent)' : 'var(--text-secondary)',
                border: !useExisting ? 'none' : '1px solid var(--border)',
              }}>
              Manual Entry
            </button>
          </div>
          {useExisting ? (
            <select name="vehicleId" required className="input" style={{ appearance: 'auto' }}>
              <option value="">Select a vehicle...</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  #{v.stockNumber} — {v.year} {v.make} {v.model}
                </option>
              ))}
            </select>
          ) : (
            <input name="vehicleDescription" required className="input" placeholder="e.g. 2024 BMW X5 - White" />
          )}
        </div>

        <div>
          <label className="form-label">Pickup Location *</label>
          <input name="pickupLocation" required className="input" placeholder="Address or location name" />
        </div>

        <div>
          <label className="form-label">Delivery Location *</label>
          <input name="deliveryLocation" required className="input" placeholder="Address or location name" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="form-label">Urgency</label>
            <select name="urgency" className="input" style={{ appearance: 'auto' }}>
              <option value="standard">Standard</option>
              <option value="rush">Rush</option>
            </select>
          </div>
          <div>
            <label className="form-label">Preferred Date</label>
            <input name="preferredDate" type="date" className="input" />
          </div>
        </div>

        <div>
          <label className="form-label">Notes</label>
          <textarea name="notes" rows={3} className="input" style={{ resize: 'vertical', minHeight: '80px' }} placeholder="Special instructions, contact info, etc." />
        </div>

        {error && (
          <div className="px-4 py-3 rounded-xl text-sm" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={() => router.back()} className="btn btn-secondary flex-1">Cancel</button>
          <button type="submit" disabled={loading} className="btn btn-primary flex-1" style={loading ? { opacity: 0.5 } : {}}>
            {loading ? 'Submitting...' : 'Submit Request'}
          </button>
        </div>
      </form>
    </div>
  )
}
