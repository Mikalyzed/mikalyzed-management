'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
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
    priority: number
  }>
}

const COLUMNS = ['mechanic', 'detailing', 'content', 'publish', 'completed'] as const

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState<VehicleWithStage[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [dragState, setDragState] = useState<{
    vehicleId: string
    column: string
    dropIndex: number | null
  } | null>(null)
  const columnRefs = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => {
    fetch('/api/vehicles')
      .then((r) => r.json())
      .then((data) => setVehicles(data.vehicles || []))
      .catch(console.error)
      .finally(() => setLoading(false))

    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((data) => {
        if (data.user?.role === 'admin') setIsAdmin(true)
      })
      .catch(() => {})
  }, [])

  const getColumnVehicles = useCallback(
    (col: string) => vehicles.filter((v) => v.status === col),
    [vehicles]
  )

  const handleDragStart = useCallback((e: React.DragEvent, vehicleId: string, column: string) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', vehicleId)
    setDragState({ vehicleId, column, dropIndex: null })
  }, [])

  const handleDragOver = useCallback(
    (e: React.DragEvent, column: string) => {
      if (!dragState || dragState.column !== column) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'

      const container = columnRefs.current[column]
      if (!container) return

      const cards = Array.from(container.querySelectorAll('[data-vehicle-id]')) as HTMLElement[]
      const y = e.clientY
      let dropIdx = cards.length

      for (let i = 0; i < cards.length; i++) {
        const rect = cards[i].getBoundingClientRect()
        if (y < rect.top + rect.height / 2) {
          dropIdx = i
          break
        }
      }

      setDragState((prev) => (prev ? { ...prev, dropIndex: dropIdx } : null))
    },
    [dragState]
  )

  const handleDrop = useCallback(
    async (e: React.DragEvent, column: string) => {
      e.preventDefault()
      if (!dragState || dragState.column !== column || dragState.dropIndex === null) {
        setDragState(null)
        return
      }

      const colVehicles = getColumnVehicles(column)
      const draggedId = dragState.vehicleId
      const filtered = colVehicles.filter((v) => v.id !== draggedId)
      const dragged = colVehicles.find((v) => v.id === draggedId)
      if (!dragged) { setDragState(null); return }

      const dropIdx = Math.min(dragState.dropIndex, filtered.length)
      filtered.splice(dropIdx, 0, dragged)
      const orderedIds = filtered.map((v) => v.id)

      // Optimistic update
      setVehicles((prev) => {
        const others = prev.filter((v) => v.status !== column)
        const reordered = filtered.map((v, i) => ({
          ...v,
          stages: v.stages.map((s, si) => (si === 0 ? { ...s, priority: i } : s)),
        }))
        return [...others, ...reordered].sort((a, b) => {
          const ap = a.stages[0]?.priority ?? 999999
          const bp = b.stages[0]?.priority ?? 999999
          return ap - bp
        })
      })

      setDragState(null)

      await fetch('/api/stages/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: column, orderedIds }),
      })
    },
    [dragState, getColumnVehicles]
  )

  const handleDragEnd = useCallback(() => setDragState(null), [])

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
          const colVehicles = getColumnVehicles(col)
          return (
            <div key={col} className="kanban-column">
              <div className="kanban-column-header">
                <span className="kanban-column-title">
                  {STAGE_LABELS[col as keyof typeof STAGE_LABELS]}
                </span>
                <span className="kanban-column-count">{colVehicles.length}</span>
              </div>
              <div
                className="flex flex-col gap-2"
                ref={(el) => { columnRefs.current[col] = el }}
                onDragOver={(e) => handleDragOver(e, col)}
                onDrop={(e) => handleDrop(e, col)}
                onDragLeave={() => {
                  if (dragState?.column === col) {
                    setDragState((prev) => (prev ? { ...prev, dropIndex: null } : null))
                  }
                }}
              >
                {colVehicles.map((v, idx) => (
                  <div key={v.id} data-vehicle-id={v.id}>
                    {isAdmin && dragState?.column === col && dragState.dropIndex === idx && dragState.vehicleId !== v.id && (
                      <div style={{ height: '2px', background: '#dffd6e', borderRadius: '1px', margin: '0 0 4px 0' }} />
                    )}
                    <div
                      draggable={isAdmin}
                      onDragStart={(e) => handleDragStart(e, v.id, col)}
                      onDragEnd={handleDragEnd}
                      style={{
                        display: 'flex',
                        alignItems: 'stretch',
                        opacity: dragState?.vehicleId === v.id ? 0.5 : 1,
                        boxShadow: dragState?.vehicleId === v.id ? '0 4px 12px rgba(0,0,0,0.15)' : undefined,
                        transition: 'opacity 0.15s',
                        cursor: isAdmin ? 'grab' : undefined,
                      }}
                    >
                      {isAdmin && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            padding: '0 6px 0 2px',
                            color: 'var(--text-muted)',
                            fontSize: '12px',
                            userSelect: 'none',
                            opacity: 0.5,
                            cursor: 'grab',
                          }}
                        >
                          ⠿
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <VehicleCard
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
                      </div>
                    </div>
                  </div>
                ))}
                {/* Drop indicator at end */}
                {isAdmin && dragState?.column === col && dragState.dropIndex === colVehicles.length && (
                  <div style={{ height: '2px', background: '#dffd6e', borderRadius: '1px' }} />
                )}
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
