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
  const [startingStage, setStartingStage] = useState('mechanic')
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
      startingStage,
      mechanicChecklist,
      estimatedHours: form.get('estimatedHours') ? parseFloat(form.get('estimatedHours') as string) : null,
    }

    try {
      const res = await fetch('/api/vehicles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const result = await res.json()
      if (!res.ok) {
        if (result.error === 'completed' && result.vehicleId) {
          const reason = prompt(
            `${result.vehicle} (Stock #${data.stockNumber}) has already completed recon.\n\nTo send it back through, enter the reason:`
          )
          if (reason) {
            const restartRes = await fetch(`/api/vehicles/${result.vehicleId}/restart`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ reason }),
            })
            if (restartRes.ok) {
              router.push(`/vehicles/${result.vehicleId}`)
              return
            }
            setError('Failed to restart recon')
          }
          return
        }
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
    <div style={{ maxWidth: '520px', margin: '0 auto' }}>
      <button onClick={() => router.back()} style={{ fontSize: '14px', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', marginBottom: '24px', display: 'block', minHeight: 'auto' }}>
        ← Back
      </button>

      <h1 style={{ fontSize: '24px', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '32px' }}>Add Vehicle</h1>

      <form onSubmit={handleSubmit}>
        {/* Vehicle Info Card */}
        <div style={{
          background: '#ffffff',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          padding: '24px',
          marginBottom: '16px',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '20px' }}>
            Vehicle Information
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Stock Number *</label>
              <input name="stockNumber" required className="input" placeholder="e.g. N018750" />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>VIN</label>
              <input name="vin" className="input" placeholder="Optional" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Year</label>
                <input name="year" type="number" className="input" placeholder="2024" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Color</label>
                <input name="color" className="input" placeholder="White" />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Make *</label>
                <input name="make" required className="input" placeholder="Toyota" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Model *</label>
                <input name="model" required className="input" placeholder="Camry" />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Trim</label>
              <input name="trim" className="input" placeholder="Optional" />
            </div>
          </div>
        </div>

        {/* Starting Stage */}
        <div style={{
          background: '#ffffff',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          padding: '24px',
          marginBottom: '16px',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
            Starting Stage
          </p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {(['mechanic', 'detailing', 'content', 'publish'] as const).map((stage) => {
              const labels: Record<string, string> = { mechanic: 'Mechanic', detailing: 'Detailing', content: 'Content', publish: 'Publish' }
              const active = startingStage === stage
              return (
                <button
                  key={stage}
                  type="button"
                  onClick={() => setStartingStage(stage)}
                  style={{
                    padding: '10px 18px',
                    borderRadius: '10px',
                    border: active ? '2px solid #1a1a1a' : '1px solid var(--border)',
                    background: active ? '#fafaf8' : '#ffffff',
                    fontSize: '14px',
                    fontWeight: active ? 600 : 500,
                    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    minHeight: 'auto',
                    transition: 'all 0.15s',
                  }}
                >
                  {labels[stage]}
                </button>
              )
            })}
          </div>
        </div>

        {/* Estimated Hours */}
        <div style={{ marginBottom: 16 }}>
          <label className="form-label">Estimated Hours</label>
          <input type="number" name="estimatedHours" className="input" step="0.5" min="0"
            placeholder="How long should this stage take? (e.g. 4)" />
        </div>

        {/* Tasks Card */}
        <div style={{
          background: '#ffffff',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          padding: '24px',
          marginBottom: '16px',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '20px' }}>
            {startingStage === 'mechanic' ? 'Mechanic' : startingStage === 'detailing' ? 'Detailing' : startingStage === 'content' ? 'Content' : 'Publish'} Tasks
          </p>

          {/* General Inspection Toggle */}
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            padding: '14px 16px',
            borderRadius: '12px',
            border: fullInspection ? '2px solid #1a1a1a' : '1px solid var(--border)',
            background: fullInspection ? '#fafaf8' : '#ffffff',
            cursor: 'pointer',
            marginBottom: '20px',
            transition: 'all 0.15s ease',
          }}>
            <span style={{
              width: '22px',
              height: '22px',
              borderRadius: '6px',
              border: fullInspection ? 'none' : '2px solid #d4d4d4',
              background: fullInspection ? '#1a1a1a' : 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              {fullInspection && <span style={{ color: '#dffd6e', fontSize: '13px', fontWeight: 700 }}>✓</span>}
            </span>
            <input
              type="checkbox"
              checked={fullInspection}
              onChange={(e) => setFullInspection(e.target.checked)}
              style={{ display: 'none' }}
            />
            <div>
              <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>General Inspection</p>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Full checklist: oil, brakes, tires, engine, AC, electrical, test drive, body
              </p>
            </div>
          </label>

          {/* Add task input */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: customTasks.length > 0 ? '16px' : '0' }}>
            <input
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTask() } }}
              className="input"
              placeholder="Add a specific task..."
              style={{ flex: 1 }}
            />
            <button
              type="button"
              onClick={addTask}
              style={{
                padding: '12px 20px',
                borderRadius: '12px',
                border: '1px solid var(--border)',
                background: '#ffffff',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                color: 'var(--text-primary)',
                minHeight: '44px',
                boxShadow: 'var(--shadow-sm)',
                transition: 'all 0.15s',
              }}
            >
              Add
            </button>
          </div>

          {/* Task list */}
          {customTasks.length > 0 && (
            <div style={{
              borderRadius: '12px',
              border: '1px solid var(--border)',
              overflow: 'hidden',
            }}>
              {customTasks.map((task, i) => (
                <div key={i} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 16px',
                  borderBottom: i < customTasks.length - 1 ? '1px solid var(--border-light)' : 'none',
                  background: '#ffffff',
                }}>
                  <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>{task}</span>
                  <button
                    type="button"
                    onClick={() => removeTask(i)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--text-muted)',
                      fontSize: '18px',
                      lineHeight: 1,
                      minHeight: 'auto',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.background = 'var(--danger-bg)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'none' }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {!fullInspection && customTasks.length === 0 && (
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
              No tasks added — mechanic will just need to inspect and clear
            </p>
          )}
        </div>

        {/* Notes Card */}
        <div style={{
          background: '#ffffff',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          padding: '24px',
          marginBottom: '24px',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
            Notes
          </p>
          <textarea name="notes" rows={3} className="input" style={{ resize: 'vertical', minHeight: '80px' }} placeholder="Any notes about this vehicle..." />
        </div>

        {error && (
          <div style={{
            padding: '14px 18px',
            borderRadius: '12px',
            fontSize: '14px',
            background: 'var(--danger-bg)',
            color: 'var(--danger)',
            border: '1px solid var(--danger-border)',
            marginBottom: '16px',
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            type="button"
            onClick={() => router.back()}
            style={{
              flex: 1,
              padding: '14px',
              borderRadius: '12px',
              border: '1px solid var(--border)',
              background: '#ffffff',
              fontSize: '15px',
              fontWeight: 600,
              cursor: 'pointer',
              color: 'var(--text-primary)',
              minHeight: '48px',
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            style={{
              flex: 1,
              padding: '14px',
              borderRadius: '12px',
              border: 'none',
              background: '#1a1a1a',
              color: '#dffd6e',
              fontSize: '15px',
              fontWeight: 600,
              cursor: 'pointer',
              minHeight: '48px',
              opacity: loading ? 0.5 : 1,
            }}
          >
            {loading ? 'Creating...' : 'Add to Recon'}
          </button>
        </div>
      </form>
    </div>
  )
}
