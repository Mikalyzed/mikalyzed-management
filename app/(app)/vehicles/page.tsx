'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import VehicleCard from '@/components/VehicleCard'
import { STAGE_LABELS, DEFAULT_SLA_HOURS } from '@/lib/constants'

type VehicleWithStage = {
  id: string
  stockNumber: string
  year: number | null
  make: string
  model: string
  color: string | null
  status: string
  currentAssignee: { id: string; name: string } | null
  stages: Array<{
    status: string
    startedAt: string
    totalBlockedSeconds: number
  }>
}

const COLUMNS = ['mechanic', 'detailing', 'content', 'publish', 'completed'] as const

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState<VehicleWithStage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/vehicles')
      .then((r) => r.json())
      .then((data) => setVehicles(data.vehicles || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p style={{ color: 'var(--text-muted)' }}>Loading board...</p>

  function getTimeInStage(v: VehicleWithStage): string {
    const stage = v.stages[0]
    if (!stage) return ''
    const elapsed = (Date.now() - new Date(stage.startedAt).getTime()) / 1000 - stage.totalBlockedSeconds
    const hours = Math.floor(elapsed / 3600)
    if (hours < 1) return `${Math.floor(elapsed / 60)}m`
    if (hours < 24) return `${hours}h`
    return `${Math.floor(hours / 24)}d ${hours % 24}h`
  }

  function isOverdue(v: VehicleWithStage): boolean {
    if (v.status === 'completed') return false
    const stage = v.stages[0]
    if (!stage) return false
    const sla = DEFAULT_SLA_HOURS[stage.status as keyof typeof DEFAULT_SLA_HOURS]
    if (!sla) return false
    const elapsed = (Date.now() - new Date(stage.startedAt).getTime()) / 1000 - stage.totalBlockedSeconds
    return elapsed > sla * 3600
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">Recon Board</h1>
        <Link
          href="/vehicles/new"
          className="px-4 py-2 rounded-lg font-semibold text-sm text-white"
          style={{ background: 'var(--accent)' }}
        >
          + Add Vehicle
        </Link>
      </div>

      <div className="kanban-board">
        {COLUMNS.map((col) => {
          const colVehicles = vehicles.filter((v) => v.status === col)
          return (
            <div key={col} className="kanban-column">
              <div className="flex items-center justify-between mb-3 px-1">
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  {STAGE_LABELS[col as keyof typeof STAGE_LABELS]}
                </h2>
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-primary)', color: 'var(--text-muted)' }}>
                  {colVehicles.length}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {colVehicles.map((v) => (
                  <VehicleCard
                    key={v.id}
                    id={v.id}
                    stockNumber={v.stockNumber}
                    year={v.year}
                    make={v.make}
                    model={v.model}
                    color={v.color}
                    status={v.status}
                    stageStatus={v.stages[0]?.status}
                    assigneeName={v.currentAssignee?.name}
                    timeInStage={getTimeInStage(v)}
                    isOverdue={isOverdue(v)}
                  />
                ))}
                {colVehicles.length === 0 && (
                  <p className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>
                    No vehicles
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
