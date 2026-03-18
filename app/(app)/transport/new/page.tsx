'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function NewTransportPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const form = new FormData(e.currentTarget)
    const data = {
      trailerType: form.get('trailerType'),
      vehicleYear: form.get('vehicleYear'),
      vehicleMake: form.get('vehicleMake'),
      vehicleModel: form.get('vehicleModel'),
      vin: form.get('vin'),
      pickupLocation: form.get('pickupLocation'),
      deliveryLocation: form.get('deliveryLocation'),
      clientName: form.get('clientName'),
      clientPhone: form.get('clientPhone'),
      urgency: form.get('urgency'),
      notes: form.get('notes'),
    }

    // Build vehicle description from fields
    const vehicleDesc = `${data.vehicleYear} ${data.vehicleMake} ${data.vehicleModel}`.trim()

    try {
      const res = await fetch('/api/transport', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleDescription: vehicleDesc,
          vin: data.vin,
          trailerType: data.trailerType,
          pickupLocation: data.pickupLocation,
          deliveryLocation: data.deliveryLocation,
          clientName: data.clientName,
          clientPhone: data.clientPhone,
          urgency: data.urgency,
          notes: data.notes,
        }),
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
        {/* Trailer Type */}
        <div>
          <label className="form-label">Trailer Type *</label>
          <div className="grid grid-cols-2 gap-3">
            <label className="card flex items-center gap-3 cursor-pointer" style={{ padding: '14px 16px' }}>
              <input type="radio" name="trailerType" value="enclosed" required className="accent-black" />
              <div>
                <p className="font-semibold text-sm">Enclosed</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Protected transport</p>
              </div>
            </label>
            <label className="card flex items-center gap-3 cursor-pointer" style={{ padding: '14px 16px' }}>
              <input type="radio" name="trailerType" value="open" className="accent-black" />
              <div>
                <p className="font-semibold text-sm">Open</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Standard trailer</p>
              </div>
            </label>
          </div>
        </div>

        {/* Vehicle Info */}
        <div>
          <label className="form-label">Vehicle Information</label>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div>
              <input name="vehicleYear" required className="input" placeholder="Year" type="number" />
            </div>
            <div>
              <input name="vehicleMake" required className="input" placeholder="Make" />
            </div>
            <div>
              <input name="vehicleModel" required className="input" placeholder="Model" />
            </div>
          </div>
          <input name="vin" className="input" placeholder="VIN (optional)" />
        </div>

        {/* Pickup */}
        <div>
          <label className="form-label">Pickup Address *</label>
          <input name="pickupLocation" required className="input" placeholder="Full address" />
        </div>

        {/* Drop Off */}
        <div>
          <label className="form-label">Drop Off Address *</label>
          <input name="deliveryLocation" required className="input" placeholder="Full address" />
        </div>

        {/* Client Contact */}
        <div>
          <label className="form-label">Client Contact</label>
          <div className="grid grid-cols-2 gap-3">
            <input name="clientName" required className="input" placeholder="Contact Name" />
            <input name="clientPhone" required className="input" placeholder="Phone Number" type="tel" />
          </div>
        </div>

        {/* Urgency */}
        <div>
          <label className="form-label">Urgency</label>
          <select name="urgency" className="input" style={{ appearance: 'auto' }}>
            <option value="standard">Standard</option>
            <option value="rush">Rush</option>
          </select>
        </div>

        {/* Notes */}
        <div>
          <label className="form-label">Notes</label>
          <textarea name="notes" rows={3} className="input" style={{ resize: 'vertical', minHeight: '80px' }} placeholder="Special instructions..." />
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
