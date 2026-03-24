'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import VehicleCard from '@/components/VehicleCard'
import KanbanScrollbar from '@/components/KanbanScrollbar'
import { STAGE_LABELS } from '@/lib/constants'

type ChecklistItem = { item: string; done: boolean; note: string }

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
    id?: string
    status: string
    startedAt: string
    totalBlockedSeconds: number
    priority: number
    estimatedHours: number | null
    checklist?: ChecklistItem[]
    assignee?: { id: string; name: string } | null
  }>
}

type ModalData = {
  vehicle: {
    id: string
    stockNumber: string
    year: number | null
    make: string
    model: string
    color: string | null
    status: string
    currentAssignee: { id: string; name: string } | null
    stages: Array<{
      id: string
      stage: string
      status: string
      startedAt: string
      totalBlockedSeconds: number
      checklist: ChecklistItem[]
      assignee: { id: string; name: string } | null
    }>
  }
}

const COLUMNS = ['mechanic', 'detailing', 'content', 'publish', 'completed'] as const

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState<VehicleWithStage[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [dragInfo, setDragInfo] = useState<{ vehicleId: string; column: string } | null>(null)
  const [liveOrder, setLiveOrder] = useState<Record<string, string[]>>({})
  const columnRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const dragGhostRef = useRef<HTMLDivElement | null>(null)
  const originalOrderRef = useRef<Record<string, string[]>>({})
  const kanbanRef = useRef<HTMLDivElement | null>(null)
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null)
  const [modalData, setModalData] = useState<ModalData | null>(null)
  const [modalChecklist, setModalChecklist] = useState<ChecklistItem[]>([])
  const [modalSaving, setModalSaving] = useState(false)
  const [modalLoading, setModalLoading] = useState(false)
  const [advancing, setAdvancing] = useState(false)
  const mouseDownPos = useRef<{ x: number; y: number } | null>(null)
  const didDrag = useRef(false)
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
        if (data.user?.id) setUserId(data.user.id)
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
    didDrag.current = true
  }, [])

  const openModal = useCallback(async (vehicleId: string) => {
    setSelectedVehicleId(vehicleId)
    setModalLoading(true)
    setModalData(null)
    try {
      const res = await fetch(`/api/vehicles/${vehicleId}`)
      const data = await res.json()
      setModalData(data)
      const currentStage = data.vehicle?.stages?.find(
        (s: { stage: string }) => s.stage === data.vehicle.status
      )
      setModalChecklist(currentStage?.checklist ? JSON.parse(JSON.stringify(currentStage.checklist)) : [])
    } catch { /* ignore */ }
    setModalLoading(false)
  }, [])

  const closeModal = useCallback(() => {
    setSelectedVehicleId(null)
    setModalData(null)
    setModalChecklist([])
  }, [])

  const getCurrentStage = useCallback(() => {
    if (!modalData) return null
    return modalData.vehicle.stages.find(s => s.stage === modalData.vehicle.status) || null
  }, [modalData])

  const toggleChecklistItem = useCallback(async (index: number) => {
    const stage = getCurrentStage()
    if (!stage) return
    const updated = [...modalChecklist]
    updated[index] = { ...updated[index], done: !updated[index].done }
    setModalChecklist(updated)
    setModalSaving(true)
    try {
      await fetch(`/api/stages/${stage.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checklist: updated }),
      })
    } catch { /* ignore */ }
    setModalSaving(false)
  }, [modalChecklist, getCurrentStage])

  const handleAdvanceStage = useCallback(async () => {
    const stage = getCurrentStage()
    if (!stage) return
    setAdvancing(true)
    try {
      await fetch(`/api/stages/${stage.id}/advance`, { method: 'POST' })
      closeModal()
      // Refresh vehicles
      const res = await fetch('/api/vehicles')
      const data = await res.json()
      setVehicles(data.vehicles || [])
    } catch { /* ignore */ }
    setAdvancing(false)
  }, [getCurrentStage, closeModal])

  const handleCardMouseDown = useCallback((e: React.MouseEvent) => {
    mouseDownPos.current = { x: e.clientX, y: e.clientY }
    didDrag.current = false
  }, [])

  const handleCardClick = useCallback((e: React.MouseEvent, vehicleId: string) => {
    if (didDrag.current) return
    if (mouseDownPos.current) {
      const dx = Math.abs(e.clientX - mouseDownPos.current.x)
      const dy = Math.abs(e.clientY - mouseDownPos.current.y)
      if (dx > 5 || dy > 5) return
    }
    openModal(vehicleId)
  }, [openModal])

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

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>Recon Board</h1>
        <Link href="/vehicles/new" className="btn btn-primary gap-2">
          <span style={{ fontSize: '18px', lineHeight: 1 }}>+</span>
          <span className="hidden sm:inline">Add Vehicle</span>
        </Link>
      </div>

      <div className="kanban-board" ref={kanbanRef} style={{ marginTop: 8 }}>
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
                      <div
                        style={{ flex: 1, minWidth: 0 }}
                        className="vehicle-card-inner"
                        onMouseDown={handleCardMouseDown}
                        onClick={(e) => handleCardClick(e, v.id)}
                      >
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
      <KanbanScrollbar boardRef={kanbanRef} />

      {/* Vehicle Detail Modal */}
      {selectedVehicleId && (
        <div
          onClick={closeModal}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 20, width: '100%', maxWidth: 500,
              maxHeight: '85vh', display: 'flex', flexDirection: 'column',
              boxShadow: '0 -4px 30px rgba(0,0,0,0.15)',
            }}
          >
            {modalLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 20px' }}>
                <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'transparent' }} />
              </div>
            ) : modalData?.vehicle ? (() => {
              const v = modalData.vehicle
              const currentStage = getCurrentStage()
              const vehicleDesc = `${v.year ?? ''} ${v.make} ${v.model}`.trim()
              const doneCount = modalChecklist.filter(c => c.done).length
              const allDone = modalChecklist.length > 0 && modalChecklist.every(c => c.done)
              const canAdvance = currentStage && (isAdmin || (userId && currentStage.assignee?.id === userId))
              const elapsed = currentStage ? (Date.now() - new Date(currentStage.startedAt).getTime()) / 1000 - currentStage.totalBlockedSeconds : 0
              const hours = Math.floor(elapsed / 3600)
              const timeStr = hours < 1 ? `${Math.floor(elapsed / 60)}m` : hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d ${hours % 24}h`

              return (
                <>
                  <div style={{ flex: 1, overflow: 'auto', padding: '24px 20px 0' }}>
                  {/* Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                    <div>
                      <p style={{ fontSize: 18, fontWeight: 700 }}>#{v.stockNumber}</p>
                      <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                        {vehicleDesc}{v.color ? ` · ${v.color}` : ''}
                      </p>
                      <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        {currentStage && (
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 100,
                            background: '#dffd6e40', color: '#555',
                            textTransform: 'uppercase', letterSpacing: '0.04em',
                          }}>
                            {STAGE_LABELS[currentStage.stage as keyof typeof STAGE_LABELS] || currentStage.stage}
                            {currentStage.status !== 'done' ? ` · ${currentStage.status.replace('_', ' ')}` : ''}
                          </span>
                        )}
                      </div>
                      <Link
                        href={`/vehicles/${v.id}`}
                        style={{ fontSize: 12, color: '#3b82f6', textDecoration: 'none', marginTop: 4, display: 'inline-block' }}
                      >
                        View Full Details →
                      </Link>
                    </div>
                    <button onClick={closeModal} style={{
                      background: 'none', border: 'none', fontSize: 22, cursor: 'pointer',
                      color: 'var(--text-muted)', padding: '0 4px', lineHeight: 1,
                    }}>
                      &times;
                    </button>
                  </div>

                  {/* Info row */}
                  <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
                    {currentStage?.assignee && (
                      <div>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Assigned to</p>
                        <p style={{ fontSize: 13, fontWeight: 600 }}>{currentStage.assignee.name}</p>
                      </div>
                    )}
                    {currentStage && (
                      <div>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Time in stage</p>
                        <p style={{ fontSize: 13, fontWeight: 600 }}>{timeStr}</p>
                      </div>
                    )}
                  </div>

                  {/* Progress bar */}
                  {modalChecklist.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ height: 6, borderRadius: 3, background: '#e5e5e5', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', borderRadius: 3,
                          background: allDone ? '#22c55e' : '#dffd6e',
                          width: `${(doneCount / modalChecklist.length) * 100}%`,
                          transition: 'width 0.2s',
                        }} />
                      </div>
                    </div>
                  )}

                  {/* Checklist */}
                  <div style={{ marginBottom: 20 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: 'var(--text-secondary)' }}>
                      Tasks ({doneCount}/{modalChecklist.length})
                      {modalSaving && <span style={{ fontWeight: 400, fontSize: 11, marginLeft: 8, color: 'var(--text-muted)' }}>Saving...</span>}
                    </p>
                    {modalChecklist.length === 0 ? (
                      <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No checklist items</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {modalChecklist.map((item, i) => (
                          <div
                            key={i}
                            onClick={() => toggleChecklistItem(i)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                              background: item.done ? '#f0fdf4' : '#f8f8f6', borderRadius: 10,
                              cursor: 'pointer', border: '1px solid', borderColor: item.done ? '#bbf7d0' : '#e5e5e5',
                              transition: 'all 0.15s',
                            }}
                          >
                            <div style={{
                              width: 22, height: 22, borderRadius: 6, border: '2px solid',
                              borderColor: item.done ? '#22c55e' : '#d1d5db',
                              background: item.done ? '#22c55e' : '#fff',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              flexShrink: 0, transition: 'all 0.15s',
                            }}>
                              {item.done && (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              )}
                            </div>
                            <span style={{
                              fontSize: 14, color: item.done ? 'var(--text-muted)' : 'var(--text-primary)',
                              textDecoration: item.done ? 'line-through' : 'none',
                            }}>
                              {item.item}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  </div>
                  {/* Advance Stage Button — sticky footer */}
                  <div style={{ padding: '12px 20px 20px', borderTop: '1px solid #e5e5e5', flexShrink: 0 }}>
                    <button
                      onClick={handleAdvanceStage}
                      disabled={!allDone || advancing}
                      style={{
                        width: '100%', padding: '14px 0', borderRadius: 12, border: 'none',
                        background: allDone ? '#dffd6e' : '#e5e5e5',
                        color: allDone ? '#1a1a1a' : '#999',
                        fontSize: 15, fontWeight: 700,
                        cursor: !allDone || advancing ? 'default' : 'pointer',
                        opacity: advancing ? 0.6 : 1,
                        transition: 'all 0.15s',
                      }}
                    >
                      {advancing ? 'Advancing...' : allDone ? 'Advance Stage' : 'Complete all tasks to advance'}
                    </button>
                  </div>
                </>
              )
            })() : (
              <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>Vehicle not found</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
