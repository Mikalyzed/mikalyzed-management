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
  const [dragInfo, setDragInfo] = useState<{ vehicleId: string; column: string } | null>(null)
  const [liveOrder, setLiveOrder] = useState<Record<string, string[]>>({})
  const columnRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const dragGhostRef = useRef<HTMLDivElement | null>(null)
  const originalOrderRef = useRef<Record<string, string[]>>({})
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

    const ghost = document.createElement('div')
    ghost.style.position = 'fixed'
    ghost.style.top = '-9999px'
    ghost.style.left = '-9999px'
    ghost.style.pointerEvents = 'none'
    document.body.appendChild(ghost)
    dragGhostRef.current = ghost
    return () => { document.body.removeChild(ghost) }
  }, [])

  const getColumnVehicles = useCallback(
    (col: string) => {
      const colVehicles = vehicles.filter((v) => v.status === col)
      if (dragInfo && liveOrder[col]) {
        // Return vehicles in the live reordered order
        return liveOrder[col]
          .map(id => colVehicles.find(v => v.id === id))
          .filter(Boolean) as VehicleWithStage[]
      }
      return colVehicles
    },
    [vehicles, dragInfo, liveOrder]
  )

  const handleDragStart = useCallback((e: React.DragEvent, vehicleId: string, column: string) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', vehicleId)

    // Custom drag image
    const cardEl = (e.currentTarget as HTMLElement).querySelector('.vehicle-card-inner') as HTMLElement
    if (cardEl && dragGhostRef.current) {
      const clone = cardEl.cloneNode(true) as HTMLElement
      clone.style.width = `${cardEl.offsetWidth}px`
      clone.style.background = '#ffffff'
      clone.style.borderRadius = '16px'
      clone.style.border = '2px solid #dffd6e'
      clone.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)'
      clone.style.padding = '16px'
      clone.style.opacity = '0.95'
      dragGhostRef.current.innerHTML = ''
      dragGhostRef.current.appendChild(clone)
      e.dataTransfer.setDragImage(clone, cardEl.offsetWidth / 2, 30)
    }

    // Store original order for this column
    const colVehicles = vehicles.filter(v => v.status === column)
    const ids = colVehicles.map(v => v.id)
    originalOrderRef.current = { [column]: ids }
    setLiveOrder({ [column]: ids })
    setDragInfo({ vehicleId, column })
  }, [vehicles])

  const handleDragOver = useCallback(
    (e: React.DragEvent, column: string) => {
      if (!dragInfo || dragInfo.column !== column) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'

      const container = columnRefs.current[column]
      if (!container) return

      const cards = Array.from(container.querySelectorAll('[data-vehicle-id]')) as HTMLElement[]
      const y = e.clientY
      let hoverIdx = cards.length

      for (let i = 0; i < cards.length; i++) {
        const rect = cards[i].getBoundingClientRect()
        if (y < rect.top + rect.height / 2) {
          hoverIdx = i
          break
        }
      }

      // Reorder the live list
      setLiveOrder(prev => {
        const currentOrder = prev[column] || originalOrderRef.current[column] || []
        const dragIdx = currentOrder.indexOf(dragInfo.vehicleId)
        if (dragIdx === -1) return prev

        // Calculate target index
        let targetIdx = hoverIdx
        if (targetIdx > dragIdx) targetIdx = Math.min(targetIdx, currentOrder.length - 1)
        if (targetIdx === dragIdx) return prev

        const newOrder = [...currentOrder]
        newOrder.splice(dragIdx, 1)
        newOrder.splice(targetIdx, 0, dragInfo.vehicleId)
        return { [column]: newOrder }
      })
    },
    [dragInfo]
  )

  const handleDrop = useCallback(
    async (e: React.DragEvent, column: string) => {
      e.preventDefault()
      if (!dragInfo || dragInfo.column !== column) {
        setDragInfo(null)
        setLiveOrder({})
        return
      }

      const orderedIds = liveOrder[column] || []
      
      // Commit the order to vehicle state
      setVehicles((prev) => {
        const others = prev.filter((v) => v.status !== column)
        const colVehicles = prev.filter((v) => v.status === column)
        const reordered = orderedIds
          .map(id => colVehicles.find(v => v.id === id))
          .filter(Boolean)
          .map((v, i) => ({
            ...v!,
            stages: v!.stages.map((s, si) => (si === 0 ? { ...s, priority: i } : s)),
          }))
        return [...others, ...reordered]
      })

      setDragInfo(null)
      setLiveOrder({})

      if (orderedIds.length > 0) {
        await fetch('/api/stages/reorder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stage: column, orderedIds }),
        })
      }
    },
    [dragInfo, liveOrder]
  )

  const handleDragEnd = useCallback(() => {
    setDragInfo(null)
    setLiveOrder({})
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
      <div className="page-header" style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>Recon Board</h1>
        <Link href="/vehicles/new" className="btn btn-primary gap-2">
          <span style={{ fontSize: '18px', lineHeight: 1 }}>+</span>
          <span className="hidden sm:inline">Add Vehicle</span>
        </Link>
      </div>

      <div className="kanban-board" style={{ marginTop: 8 }}>
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
                onDragLeave={() => {}}
                style={{
                  minHeight: '80px',
                  borderRadius: '12px',
                  padding: '2px',
                }}
              >
                {colVehicles.map((v) => {
                  const isDragging = dragInfo?.vehicleId === v.id

                  return (
                    <div
                      key={v.id}
                      data-vehicle-id={v.id}
                      draggable={isAdmin}
                      onDragStart={(e) => handleDragStart(e, v.id, col)}
                      onDragEnd={handleDragEnd}
                      style={{
                        display: 'flex',
                        alignItems: 'stretch',
                        opacity: isDragging ? 0.3 : 1,
                        transform: isDragging ? 'scale(0.97)' : 'none',
                        transition: 'all 0.2s ease',
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
                            opacity: 0.4,
                            cursor: 'grab',
                          }}
                        >
                          ⠿
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }} className="vehicle-card-inner">
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
                  )
                })}
                {colVehicles.length === 0 && !dragInfo && (
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
