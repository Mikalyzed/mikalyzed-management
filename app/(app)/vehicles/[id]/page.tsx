'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { StageBadge, StatusBadge } from '@/components/StageBadge'

type ChecklistItem = { item: string; done: boolean; note: string }

type Stage = {
  id: string
  stage: string
  status: string
  assignee: { id: string; name: string } | null
  checklist: ChecklistItem[]
  notes: string | null
  startedAt: string
  completedAt: string | null
}

type Vehicle = {
  id: string
  stockNumber: string
  vin: string | null
  year: number | null
  make: string
  model: string
  color: string | null
  trim: string | null
  status: string
  notes: string | null
  currentAssignee: { id: string; name: string; role: string } | null
  createdBy: { id: string; name: string } | null
  createdAt: string
  completedAt: string | null
  stages: Stage[]
}

export default function VehicleDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const [vehicle, setVehicle] = useState<Vehicle | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/vehicles/${id}`)
      .then((r) => r.json())
      .then((data) => setVehicle(data.vehicle))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <p style={{ color: 'var(--text-muted)' }}>Loading...</p>
  if (!vehicle) return <p style={{ color: 'var(--danger)' }}>Vehicle not found</p>

  const currentStage = vehicle.stages.find((s) => s.status !== 'done')
  const completedStages = vehicle.stages.filter((s) => s.status === 'done')

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <button onClick={() => router.back()} className="text-sm mb-4 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
        ← Back
      </button>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">#{vehicle.stockNumber}</h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            {vehicle.year} {vehicle.make} {vehicle.model}
            {vehicle.color && ` · ${vehicle.color}`}
            {vehicle.trim && ` · ${vehicle.trim}`}
          </p>
          {vehicle.vin && <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>VIN: {vehicle.vin}</p>}
        </div>
        <StageBadge stage={vehicle.status} />
      </div>

      {/* Notes */}
      {vehicle.notes && (
        <div className="card mb-4">
          <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>NOTES</p>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{vehicle.notes}</p>
        </div>
      )}

      {/* Current Stage */}
      {currentStage && (
        <div className="card mb-4" style={{ borderColor: 'var(--accent)', borderWidth: '2px' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <StageBadge stage={currentStage.stage} />
              <StatusBadge status={currentStage.status} />
            </div>
            {currentStage.assignee && (
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                👤 {currentStage.assignee.name}
              </span>
            )}
          </div>

          {/* Checklist */}
          <StageChecklist stageId={currentStage.id} checklist={currentStage.checklist} onUpdate={() => {
            fetch(`/api/vehicles/${id}`).then(r => r.json()).then(d => setVehicle(d.vehicle))
          }} />

          {/* Stage notes */}
          {currentStage.notes && (
            <p className="text-sm mt-3 p-2 rounded" style={{ background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>
              {currentStage.notes}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-2 mt-4">
            {currentStage.status === 'pending' && (
              <ActionButton label="Start Working" onClick={async () => {
                await fetch(`/api/stages/${currentStage.id}`, {
                  method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ status: 'in_progress' }),
                })
                fetch(`/api/vehicles/${id}`).then(r => r.json()).then(d => setVehicle(d.vehicle))
              }} />
            )}
            {currentStage.status === 'in_progress' && (
              <>
                <ActionButton label="Advance →" color="var(--success)" onClick={async () => {
                  await fetch(`/api/stages/${currentStage.id}/advance`, { method: 'POST' })
                  fetch(`/api/vehicles/${id}`).then(r => r.json()).then(d => setVehicle(d.vehicle))
                }} />
                <ActionButton label="Block" color="var(--danger)" onClick={async () => {
                  const note = prompt('Block reason:')
                  if (!note) return
                  await fetch(`/api/stages/${currentStage.id}`, {
                    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'blocked', blockNote: note }),
                  })
                  fetch(`/api/vehicles/${id}`).then(r => r.json()).then(d => setVehicle(d.vehicle))
                }} />
              </>
            )}
            {currentStage.status === 'blocked' && (
              <ActionButton label="Unblock" color="var(--warning)" onClick={async () => {
                await fetch(`/api/stages/${currentStage.id}`, {
                  method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ status: 'in_progress' }),
                })
                fetch(`/api/vehicles/${id}`).then(r => r.json()).then(d => setVehicle(d.vehicle))
              }} />
            )}
          </div>
        </div>
      )}

      {/* Stage History */}
      {completedStages.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-muted)' }}>
            COMPLETED STAGES
          </h2>
          <div className="flex flex-col gap-2">
            {completedStages.map((s) => (
              <div key={s.id} className="card" style={{ opacity: 0.7 }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <StageBadge stage={s.stage} />
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      ✅ {s.assignee?.name || 'Unassigned'}
                    </span>
                  </div>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {s.completedAt && new Date(s.completedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Meta */}
      <div className="mt-6 text-xs" style={{ color: 'var(--text-muted)' }}>
        <p>Added by {vehicle.createdBy?.name || 'System'} on {new Date(vehicle.createdAt).toLocaleDateString()}</p>
        {vehicle.completedAt && <p>Completed on {new Date(vehicle.completedAt).toLocaleDateString()}</p>}
      </div>
    </div>
  )
}

function StageChecklist({ stageId, checklist, onUpdate }: {
  stageId: string; checklist: ChecklistItem[]; onUpdate: () => void
}) {
  async function toggleItem(index: number) {
    const updated = [...checklist]
    updated[index] = { ...updated[index], done: !updated[index].done }
    await fetch(`/api/stages/${stageId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checklist: updated }),
    })
    onUpdate()
  }

  return (
    <div className="flex flex-col gap-1">
      {checklist.map((item, i) => (
        <button
          key={i}
          onClick={() => toggleItem(i)}
          className="flex items-center gap-2 text-left text-sm py-1.5 px-2 rounded hover:bg-white/5"
        >
          <span style={{ opacity: item.done ? 1 : 0.3 }}>{item.done ? '✅' : '⬜'}</span>
          <span style={{ color: item.done ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: item.done ? 'line-through' : 'none' }}>
            {item.item}
          </span>
        </button>
      ))}
    </div>
  )
}

function ActionButton({ label, onClick, color }: { label: string; onClick: () => void; color?: string }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 py-2.5 rounded-lg font-semibold text-sm text-white"
      style={{ background: color || 'var(--accent)' }}
    >
      {label}
    </button>
  )
}
