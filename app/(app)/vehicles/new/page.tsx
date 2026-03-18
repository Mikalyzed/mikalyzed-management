'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const DEFAULT_INSPECTION = [
  'Oil & fluids check',
  'Brake inspection',
  'Tire condition',
  'Engine check',
  'AC system',
  'Electrical systems',
  'Test drive',
  'Body assessment',
]

export default function AddVehiclePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fullInspection, setFullInspection] = useState(false)
  const [customTasks, setCustomTasks] = useState<string[]>([])
  const [newTask, setNewTask] = useState('')

  function addTask() {
    const task = newTask.trim()
    if (!task) return
    setCustomTasks([...customTasks, task])
    setNewTask('')
  }

  function removeTask(index: number) {
    setCustomTasks(customTasks.filter((_, i) => i !== index))
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const form = new FormData(e.currentTarget)

    // Build mechanic checklist
    let mechanicChecklist: string[] = []
    if (fullInspection) {
      mechanicChecklist = [...DEFAULT_INSPECTION, ...customTasks]
    } else if (customTasks.length > 0) {
      mechanicChecklist = customTasks
    } else {
      mechanicChecklist = ['Inspect & clear']
    }

    const data = {
      stockNumber: form.get('stockNumber'),
      vin: form.get('vin'),
      year: form.get('year'),
      make: form.get('make'),
      model: form.get('model'),
      color: form.get('color'),
      trim: form.get('trim'),
      notes: form.get('notes'),
      mechanicChecklist,
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
      <button onClick={() => router.back()} className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
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

        {/* Mechanic Tasks */}
        <div>
          <label className="form-label">Mechanic Tasks</label>

          {/* Full inspection toggle */}
          <label className="card flex items-center gap-3 cursor-pointer mb-3" style={{ padding: '14px 16px' }}>
            <input
              type="checkbox"
              checked={fullInspection}
              onChange={(e) => setFullInspection(e.target.checked)}
              className="w-5 h-5 accent-black rounded"
            />
            <div>
              <p className="font-semibold text-sm">General Inspection</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Full checklist: oil, brakes, tires, engine, AC, electrical, test drive, body
              </p>
            </div>
          </label>

          {/* Custom tasks */}
          <div className="flex gap-2 mb-2">
            <input
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTask() } }}
              className="input flex-1"
              placeholder="Add a specific task..."
            />
            <button type="button" onClick={addTask} className="btn btn-secondary" style={{ padding: '10px 16px' }}>
              Add
            </button>
          </div>

          {customTasks.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {customTasks.map((task, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
                  <span className="text-sm">{task}</span>
                  <button type="button" onClick={() => removeTask(i)} className="text-xs font-medium" style={{ color: 'var(--danger)', minHeight: 'auto' }}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {!fullInspection && customTasks.length === 0 && (
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              No tasks added — mechanic will just need to inspect and clear
            </p>
          )}
        </div>

        <div>
          <label className="form-label">Notes</label>
          <textarea name="notes" rows={3} className="input" style={{ resize: 'vertical', minHeight: '80px' }} placeholder="Any notes about this vehicle..." />
        </div>

        {error && (
          <div className="px-4 py-3 rounded-xl text-sm" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={() => router.back()} className="btn btn-secondary flex-1">Cancel</button>
          <button type="submit" disabled={loading} className="btn btn-primary flex-1" style={loading ? { opacity: 0.5 } : {}}>
            {loading ? 'Creating...' : 'Add to Recon'}
          </button>
        </div>
      </form>
    </div>
  )
}
