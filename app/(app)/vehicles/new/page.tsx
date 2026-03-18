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
      <h1 className="text-xl font-bold mb-6">Add Vehicle</h1>

      <form onSubmit={handleSubmit} className="card flex flex-col gap-4" style={{ padding: '24px' }}>
        <Field label="Stock Number *" name="stockNumber" required />
        <Field label="VIN" name="vin" placeholder="Optional" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Year" name="year" type="number" placeholder="2024" />
          <Field label="Color" name="color" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Make *" name="make" required placeholder="Toyota" />
          <Field label="Model *" name="model" required placeholder="Camry" />
        </div>
        <Field label="Trim" name="trim" placeholder="Optional" />
        <div>
          <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Notes</label>
          <textarea
            name="notes"
            rows={3}
            className="w-full px-3 py-2 rounded-lg border"
            style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-primary)', resize: 'vertical' }}
          />
        </div>

        {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex-1 py-3 rounded-lg font-semibold text-sm border"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', background: 'transparent' }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 py-3 rounded-lg font-semibold text-sm text-white"
            style={{ background: loading ? 'var(--text-muted)' : 'var(--accent)' }}
          >
            {loading ? 'Creating...' : 'Add to Recon'}
          </button>
        </div>
      </form>
    </div>
  )
}

function Field({ label, name, type = 'text', required = false, placeholder = '' }: {
  label: string; name: string; type?: string; required?: boolean; placeholder?: string
}) {
  return (
    <div>
      <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>{label}</label>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg border"
        style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
      />
    </div>
  )
}
