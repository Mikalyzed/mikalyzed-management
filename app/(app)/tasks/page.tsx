'use client'

import { useEffect, useState } from 'react'
import VehicleCard from '@/components/VehicleCard'

type Task = {
  id: string
  vehicle: {
    id: string
    stockNumber: string
    year: number | null
    make: string
    model: string
    color: string | null
    status: string
  }
  stage: string
  status: string
  startedAt: string
  totalBlockedSeconds: number
}

export default function MyTasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/tasks')
      .then((r) => r.json())
      .then((data) => setTasks(data.tasks || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p style={{ color: 'var(--text-muted)' }}>Loading tasks...</p>

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">My Tasks</h1>

      {tasks.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-lg">🎉</p>
          <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>No tasks right now</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {tasks.map((t, idx) => {
            const elapsed = (Date.now() - new Date(t.startedAt).getTime()) / 1000 - t.totalBlockedSeconds
            const hours = Math.floor(elapsed / 3600)
            const timeStr = hours < 1 ? `${Math.floor(elapsed / 60)}m` : hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`

            return (
              <div key={t.id} style={{ position: 'relative' }}>
                <div
                  style={{
                    position: 'absolute',
                    top: '8px',
                    left: '8px',
                    zIndex: 2,
                    background: 'var(--bg-secondary, #f5f5f7)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    padding: '1px 6px',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                  }}
                >
                  #{idx + 1}
                </div>
                <VehicleCard
                  id={t.vehicle.id}
                  stockNumber={t.vehicle.stockNumber}
                  year={t.vehicle.year}
                  make={t.vehicle.make}
                  model={t.vehicle.model}
                  color={t.vehicle.color}
                  status={t.vehicle.status}
                  stageStatus={t.status}
                  timeInStage={timeStr}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
