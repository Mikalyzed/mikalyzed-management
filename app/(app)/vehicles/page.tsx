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

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: '60vh' }}>
        <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'transparent' }} />
      </div>
    )
  }

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
    const slaKey = v.status as keyof typeof DEFAULT_SLA_HOURS
    const sla = DEFAULT_SLA_HOURS[slaKey]
    if (!sla) return false
    const elapsed = (Date.now() - new Date(stage.startedAt).getTime()) / 1000 - stage.totalBlockedSeconds
    return elapsed > sla * 3600
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Recon Board</h1>
        <Link href="/vehicles/new" className="btn btn-primary gap-2">
          <span style={{ fontSize: '18px', lineHeight: 1 }}>+</span>
          <span className="hidden sm:inline">Add Vehicle</span>
        </Link>
      </div>

      <div className="kanban-board">
        {COLUMNS.map((col) => {
          const colVehicles = vehicles.filter((v) => v.status === col)
          return (
            <div key={col} className="kanban-column">
              <div className="kanban-column-header">
                <span className="kanban-column-title">
                  {STAGE_LABELS[col as keyof typeof STAGE_LABELS]}
                </span>
                <span className="kanban-column-count">{colVehicles.length}</span>
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
                  <div className="text-center py-10 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed var(--border)' }}>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Empty</p>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
