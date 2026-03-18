'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AddVehiclePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const form = new FormData(e.currentTarget)
    const data = {
      stockNumber: form.get('stockNumber'),
      vin: form.get('vin'),
      year: form.get('year'),
      make: form.get('make'),
      model: form.get('model'),
      color: form.get('color'),
      trim: form.get('trim'),
      notes: form.get('notes'),
    }

    try {
      const res = await fetch('/api/vehicles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const result = await res.json()
      if (!res.ok) {
        setError(result.error || 'Failed to create vehicle')
        return
      }
      router.push(`/vehicles/${result.vehicle.id}`)
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto">
      <button onClick={() => router.back()} className="text-sm mb-6 flex items-center gap-1" style={{ color: 'var(--accent)' }}>
        ← Back
      </button>

      <h1 className="text-2xl font-bold tracking-tight mb-6">Add Vehicle</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div>
          <label className="form-label">Stock Number *</label>
          <input name="stockNumber" required className="input" placeholder="e.g. A1234" />
        </div>

        <div>
          <label className="form-label">VIN</label>
          <input name="vin" className="input" placeholder="Optional" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="form-label">Year</label>
            <input name="year" type="number" className="input" placeholder="2024" />
          </div>
          <div>
            <label className="form-label">Color</label>
            <input name="color" className="input" placeholder="White" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="form-label">Make *</label>
            <input name="make" required className="input" placeholder="Toyota" />
          </div>
          <div>
            <label className="form-label">Model *</label>
            <input name="model" required className="input" placeholder="Camry" />
          </div>
        </div>

        <div>
          <label className="form-label">Trim</label>
          <input name="trim" className="input" placeholder="Optional" />
        </div>

        <div>
          <label className="form-label">Notes</label>
          <textarea name="notes" rows={3} className="input" style={{ resize: 'vertical', minHeight: '80px' }} placeholder="Any notes about this vehicle..." />
        </div>

        {error && (
          <div className="px-4 py-3 rounded-xl text-sm" style={{ background: 'rgba(255,69,58,0.1)', color: 'var(--danger)' }}>
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={() => router.back()} className="btn btn-secondary flex-1">
            Cancel
          </button>
          <button type="submit" disabled={loading} className="btn btn-primary flex-1" style={loading ? { opacity: 0.5 } : {}}>
            {loading ? 'Creating...' : 'Add to Recon'}
          </button>
        </div>
      </form>
    </div>
  )
}
