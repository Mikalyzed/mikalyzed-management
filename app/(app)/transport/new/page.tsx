'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import VehicleSearch from '@/components/VehicleSearch'

type VehicleEntry = {
  key: string  // unique React key; stockNumber for inventory, generated for manual
  source: 'inventory' | 'manual'
  stockNumber: string | null
  vin: string | null
  year: number | null
  make: string
  model: string
  color: string | null
}

export default function NewTransportPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedVehicles, setSelectedVehicles] = useState<VehicleEntry[]>([])
  const [purpose, setPurpose] = useState<'event' | 'ship_to_client' | 'other'>('event')
  const [purposeNote, setPurposeNote] = useState('')
  const [estimatedPrice, setEstimatedPrice] = useState('')
  const [showManualForm, setShowManualForm] = useState(false)
  const [manualYear, setManualYear] = useState('')
  const [manualMake, setManualMake] = useState('')
  const [manualModel, setManualModel] = useState('')
  const [manualVin, setManualVin] = useState('')

  function addInventoryVehicle(v: { stockNumber: string; vin: string | null; year: number | null; make: string; model: string; color: string | null }) {
    setSelectedVehicles((prev) => prev.find(x => x.stockNumber === v.stockNumber) ? prev : [
      ...prev,
      { key: v.stockNumber, source: 'inventory', stockNumber: v.stockNumber, vin: v.vin, year: v.year, make: v.make, model: v.model, color: v.color },
    ])
  }

  function addManualVehicle() {
    if (!manualYear.trim() || !manualMake.trim() || !manualModel.trim()) return
    const key = `manual-${Date.now()}`
    setSelectedVehicles((prev) => [...prev, {
      key, source: 'manual', stockNumber: null,
      vin: manualVin.trim() || null,
      year: manualYear ? Number(manualYear) : null,
      make: manualMake.trim(), model: manualModel.trim(), color: null,
    }])
    setManualYear(''); setManualMake(''); setManualModel(''); setManualVin('')
    setShowManualForm(false)
  }

  function removeVehicle(key: string) {
    setSelectedVehicles((prev) => prev.filter(v => v.key !== key))
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')

    if (selectedVehicles.length === 0) {
      setError('Add at least one vehicle')
      return
    }

    setLoading(true)
    const form = new FormData(e.currentTarget)
    const vehicles = selectedVehicles.map(v => ({
      vehicleDescription: `${v.year ?? ''} ${v.make} ${v.model}`.trim(),
      vin: v.vin,
    }))

    const shared = {
      trailerType: form.get('trailerType'),
      pickupLocation: form.get('pickupLocation'),
      deliveryLocation: form.get('deliveryLocation'),
      clientName: form.get('clientName'),
      clientPhone: form.get('clientPhone'),
      urgency: form.get('urgency'),
      scheduledDate: (form.get('scheduledDate') as string) || null,
      carrierInfo: (form.get('carrierInfo') as string) || null,
      purpose,
      purposeNote: purpose === 'other' ? purposeNote : null,
      estimatedPrice: purpose === 'ship_to_client' && estimatedPrice ? Number(estimatedPrice) : null,
      notes: form.get('notes'),
    }

    try {
      // Create one transport request per vehicle, sharing all other fields
      const results = await Promise.all(vehicles.map(v =>
        fetch('/api/transport', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vehicleDescription: v.vehicleDescription,
            vin: v.vin,
            ...shared,
          }),
        })
      ))
      const failed = results.find(r => !r.ok)
      if (failed) {
        const err = await failed.json()
        setError(err.error || 'Failed to create one or more requests')
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

        {/* Purpose */}
        <div>
          <label className="form-label">Purpose *</label>
          <div className="grid grid-cols-3 gap-3">
            {([
              { v: 'event', label: 'Event' },
              { v: 'ship_to_client', label: 'Ship to Client' },
              { v: 'other', label: 'Other' },
            ] as const).map(opt => {
              const active = purpose === opt.v
              return (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setPurpose(opt.v)}
                  style={{
                    padding: '12px 10px', borderRadius: 12,
                    border: active ? '2px solid #1a1a1a' : '1px solid var(--border)',
                    background: active ? '#fafaf8' : '#fff',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                  }}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
          {purpose === 'other' && (
            <input
              value={purposeNote}
              onChange={(e) => setPurposeNote(e.target.value)}
              placeholder="What's it for?"
              required
              className="input"
              style={{ marginTop: 12 }}
            />
          )}
        </div>

        {/* Estimated Price (ship-to-client only) */}
        {purpose === 'ship_to_client' && (
          <div>
            <label className="form-label">Estimated Price *</label>
            <div style={{ position: 'relative' }}>
              <span style={{
                position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
                color: 'var(--text-muted)', fontSize: 14, fontWeight: 500,
              }}>$</span>
              <input
                type="number" step="0.01" min="0" required
                value={estimatedPrice}
                onChange={(e) => setEstimatedPrice(e.target.value)}
                placeholder="0.00"
                className="input"
                style={{ paddingLeft: 30 }}
              />
            </div>
          </div>
        )}

        {/* Vehicles */}
        <div style={{
          background: '#fff', border: '1px solid var(--border)', borderRadius: 16,
          padding: '20px 22px', boxShadow: 'var(--shadow-sm)',
        }}>
          <label className="form-label">Vehicles to Transport *</label>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            Add multiple to send several vehicles in one request (same pickup, drop-off, and driver).
          </p>
          <VehicleSearch
            placeholder="Search inventory by stock #, VIN, or name..."
            onSelect={(v) => addInventoryVehicle({
              stockNumber: v.stockNumber, vin: v.vin,
              year: v.year, make: v.make, model: v.model, color: v.color,
            })}
          />

          {selectedVehicles.length > 0 && (
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {selectedVehicles.map((v) => (
                <div key={v.key} style={{
                  padding: '10px 14px', borderRadius: 10,
                  background: '#f0fdf4', border: '1px solid #bbf7d0',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  fontSize: 13,
                }}>
                  <span>
                    {v.stockNumber ? `#${v.stockNumber} — ` : ''}
                    {[v.year, v.make, v.model].filter(Boolean).join(' ')}
                    {v.source === 'manual' && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)' }}>(manual)</span>}
                  </span>
                  <button type="button" onClick={() => removeVehicle(v.key)} style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#16a34a', fontSize: 16, fontWeight: 600, lineHeight: 1,
                  }}>×</button>
                </div>
              ))}
            </div>
          )}

          {!showManualForm && (
            <button
              type="button"
              onClick={() => setShowManualForm(true)}
              style={{
                marginTop: 14, padding: '10px 14px', borderRadius: 10,
                border: '1px dashed var(--border)', background: '#fff',
                fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)',
                cursor: 'pointer', width: '100%',
              }}
            >
              + Add Vehicle Manually
            </button>
          )}

          {showManualForm && (
            <div style={{
              marginTop: 14, padding: 14, borderRadius: 10,
              border: '1px solid var(--border)', background: 'var(--bg-primary)',
            }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10 }}>
                Add Vehicle Manually
              </p>
              <div className="grid grid-cols-3 gap-2" style={{ marginBottom: 8 }}>
                <input value={manualYear} onChange={e => setManualYear(e.target.value)} className="input" placeholder="Year" type="number" />
                <input value={manualMake} onChange={e => setManualMake(e.target.value)} className="input" placeholder="Make" />
                <input value={manualModel} onChange={e => setManualModel(e.target.value)} className="input" placeholder="Model" />
              </div>
              <input value={manualVin} onChange={e => setManualVin(e.target.value)} className="input" placeholder="VIN (optional)" style={{ marginBottom: 10 }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => { setShowManualForm(false); setManualYear(''); setManualMake(''); setManualModel(''); setManualVin('') }} style={{
                  flex: 1, padding: '10px', borderRadius: 8, border: '1px solid var(--border)',
                  background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}>Cancel</button>
                <button type="button" onClick={addManualVehicle} disabled={!manualYear || !manualMake || !manualModel} style={{
                  flex: 1, padding: '10px', borderRadius: 8, border: 'none',
                  background: '#1a1a1a', color: '#dffd6e', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', opacity: !manualYear || !manualMake || !manualModel ? 0.5 : 1,
                }}>Add Vehicle</button>
              </div>
            </div>
          )}
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

        {/* Already scheduled? */}
        <div>
          <label className="form-label">Scheduled Date <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 12 }}>(optional — fill if already scheduled with carrier)</span></label>
          <input name="scheduledDate" type="date" className="input" />
          <input name="carrierInfo" className="input mt-2" placeholder="Carrier / Driver (if scheduled)" />
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
            {loading ? 'Submitting...' : selectedVehicles.length > 1 ? `Submit ${selectedVehicles.length} Requests` : 'Submit Request'}
          </button>
        </div>
      </form>
    </div>
  )
}
