'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

type ChecklistItem = { item: string; done: boolean; note: string }

type ScheduleBlock = {
  id: string
  vehicle: { id: string; stockNumber: string; year: number | null; make: string; model: string; color: string | null }
  assignee: { id: string; name: string } | null
  status: string
  estimatedHours: number | null
  checklist: ChecklistItem[]
  startTime: string
  endTime: string
  priority: number
  segmentHours?: number
  isContination?: boolean
  segmentIndex?: number
  totalSegments?: number
  pauseReason?: string | null
}

type AwaitingPart = {
  id: string
  vehicle: { id: string; stockNumber: string; year: number | null; make: string; model: string; color: string | null }
  assignee: { id: string; name: string } | null
  status: string
  awaitingPartsDate: string | null
  awaitingPartsSince: string | null
  awaitingPartsName: string | null
  awaitingPartsTracking: string | null
}

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  pending: { bg: '#f8f8f6', border: '#e0e0e0', text: 'var(--text-secondary)' },
  in_progress: { bg: '#eff6ff', border: '#3b82f6', text: '#1e40af' },
  in_progress_overdue: { bg: '#fef2f2', border: '#ef4444', text: '#991b1b' },
  blocked: { bg: '#fef2f2', border: '#ef4444', text: '#991b1b' },
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Queued', in_progress: 'In Progress', blocked: 'Blocked',
}

export default function MechanicSchedulePage() {
  const [schedule, setSchedule] = useState<ScheduleBlock[]>([])
  const [awaitingParts, setAwaitingParts] = useState<AwaitingPart[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedBlock, setSelectedBlock] = useState<ScheduleBlock | null>(null)
  const [modalChecklist, setModalChecklist] = useState<ChecklistItem[]>([])
  const [saving, setSaving] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [showAwaitingPrompt, setShowAwaitingPrompt] = useState(false)
  const [expectedDate, setExpectedDate] = useState('')
  const [partName, setPartName] = useState('')
  const [trackingNumber, setTrackingNumber] = useState('')
  const [showAddTask, setShowAddTask] = useState(false)
  const [newTaskName, setNewTaskName] = useState('')
  const [newTaskHours, setNewTaskHours] = useState('')
  const [noExtraHours, setNoExtraHours] = useState(false)
  const [addingTask, setAddingTask] = useState(false)
  const [showPausePrompt, setShowPausePrompt] = useState(false)
  const [pauseReason, setPauseReason] = useState('')
  const [startingNext, setStartingNext] = useState(false)
  const [pendingApprovals, setPendingApprovals] = useState<Array<{ id: string; taskName: string; additionalHours: number | null; status: string }>>([])
  const [taskSubmitMsg, setTaskSubmitMsg] = useState('')

  const fetchSchedule = useCallback(() => {
    fetch('/api/mechanic-schedule').then(r => r.json()).then(d => {
      setSchedule(d.schedule || [])
      setAwaitingParts(d.awaitingParts || [])
      setLoading(false)
    })
  }, [])

  useEffect(() => { fetchSchedule() }, [fetchSchedule])

  // Fetch pending approvals for a stage
  const fetchPendingApprovals = useCallback((stageId: string) => {
    fetch(`/api/task-approvals?stageId=${stageId}`)
      .then(r => r.json())
      .then(d => setPendingApprovals((d.approvals || []).filter((a: { vehicleStageId: string; status: string }) => a.vehicleStageId === stageId && a.status === 'pending')))
      .catch(() => setPendingApprovals([]))
  }, [])

  // Open modal
  const openModal = (block: ScheduleBlock) => {
    setSelectedBlock(block)
    setModalChecklist(JSON.parse(JSON.stringify(block.checklist || [])))
    setShowAwaitingPrompt(false)
    setExpectedDate('')
    setPartName('')
    setTrackingNumber('')
    setShowAddTask(false)
    setNewTaskName('')
    setNewTaskHours('')
    setNoExtraHours(false)
    setShowPausePrompt(false)
    setPauseReason('')
    setTaskSubmitMsg('')
    fetchPendingApprovals(block.id)
  }

  const closeModal = () => {
    setSelectedBlock(null)
    setModalChecklist([])
    setShowAwaitingPrompt(false)
  }

  // Toggle checklist item
  const toggleItem = async (index: number) => {
    const updated = [...modalChecklist]
    updated[index] = { ...updated[index], done: !updated[index].done }
    setModalChecklist(updated)
    setSaving(true)
    await fetch(`/api/stages/${selectedBlock!.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checklist: updated }),
    })
    setSaving(false)
    // Update local schedule data
    setSchedule(prev => prev.map(b => b.id === selectedBlock!.id ? { ...b, checklist: updated } : b))
  }

  // Complete stage
  const completeStage = async () => {
    if (!selectedBlock) return
    setCompleting(true)
    await fetch(`/api/stages/${selectedBlock.id}/advance`, { method: 'POST' })
    setCompleting(false)
    closeModal()
    fetchSchedule()
  }

  // Set awaiting parts
  const submitAwaitingParts = async () => {
    if (!selectedBlock) return
    setSaving(true)
    await fetch(`/api/stages/${selectedBlock.id}/awaiting-parts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        awaitingParts: true,
        expectedDate: expectedDate || undefined,
        partName: partName || undefined,
        trackingNumber: trackingNumber || undefined,
      }),
    })
    setSaving(false)
    setPartName('')
    setTrackingNumber('')
    closeModal()
    fetchSchedule()
  }

  // Add task — submit for approval instead of directly adding
  const addTask = async () => {
    if (!selectedBlock || !newTaskName.trim()) return
    setAddingTask(true)
    const extraHours = noExtraHours ? 0 : parseFloat(newTaskHours) || 0
    try {
      await fetch('/api/task-approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleStageId: selectedBlock.id,
          taskName: newTaskName.trim(),
          additionalHours: extraHours > 0 ? extraHours : null,
        }),
      })
      setNewTaskName('')
      setNewTaskHours('')
      setNoExtraHours(false)
      setShowAddTask(false)
      setTaskSubmitMsg('Task submitted for approval')
      fetchPendingApprovals(selectedBlock.id)
      setTimeout(() => setTaskSubmitMsg(''), 3000)
    } catch { /* ignore */ }
    setAddingTask(false)
  }

  // Start next vehicle
  const startNextVehicle = async () => {
    if (!selectedBlock || !pauseReason.trim()) return
    setStartingNext(true)
    await fetch(`/api/stages/${selectedBlock.id}/start-next`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pauseReason: pauseReason.trim() }),
    })
    setStartingNext(false)
    setShowPausePrompt(false)
    setPauseReason('')
    closeModal()
    fetchSchedule()
  }

  // Parts arrived
  const partsArrived = async (stageId: string) => {
    await fetch(`/api/stages/${stageId}/awaiting-parts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ awaitingParts: false }),
    })
    fetchSchedule()
  }

  // Group blocks by day
  const days = new Map<string, ScheduleBlock[]>()
  schedule.forEach(block => {
    const day = new Date(block.startTime).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
    if (!days.has(day)) days.set(day, [])
    days.get(day)!.push(block)
  })

  // Stats — deduplicate continuation segments (only count unique vehicle stage IDs)
  const uniqueBlocks = schedule.filter(b => !b.isContination)
  const totalHours = uniqueBlocks.reduce((sum, b) => sum + (b.estimatedHours || 2), 0)
  const inProgressCount = uniqueBlocks.filter(b => b.status === 'in_progress').length
  const queuedCount = uniqueBlocks.filter(b => b.status === 'pending').length
  const blockedCount = uniqueBlocks.filter(b => b.status === 'blocked').length

  const allDone = modalChecklist.length > 0 && modalChecklist.every(c => c.done)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>Mechanic Schedule</h1>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 10, marginBottom: 24 }}>
        <div className="pipeline-chip">
          <p className="pipeline-chip-value">{uniqueBlocks.length}</p>
          <p className="pipeline-chip-label">Total Jobs</p>
        </div>
        <div className="pipeline-chip">
          <p className="pipeline-chip-value" style={{ color: '#3b82f6' }}>{inProgressCount}</p>
          <p className="pipeline-chip-label">Active</p>
        </div>
        <div className="pipeline-chip">
          <p className="pipeline-chip-value">{queuedCount}</p>
          <p className="pipeline-chip-label">Queued</p>
        </div>
        {blockedCount > 0 && (
          <div className="pipeline-chip">
            <p className="pipeline-chip-value" style={{ color: '#ef4444' }}>{blockedCount}</p>
            <p className="pipeline-chip-label">Blocked</p>
          </div>
        )}
        <div className="pipeline-chip">
          <p className="pipeline-chip-value">{totalHours}h</p>
          <p className="pipeline-chip-label">Total Est.</p>
        </div>
        <div className="pipeline-chip" style={{ borderColor: '#f59e0b' }}>
          <p className="pipeline-chip-value" style={{ color: '#f59e0b' }}>{awaitingParts.length}</p>
          <p className="pipeline-chip-label">Awaiting Parts</p>
        </div>
      </div>

      {/* Awaiting Parts Section */}
      {awaitingParts.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: '#92400e' }}>Awaiting Parts</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {awaitingParts.map(ap => {
              const v = ap.vehicle
              const desc = `${v.year ?? ''} ${v.make} ${v.model}`.trim()
              const expDate = ap.awaitingPartsDate ? new Date(ap.awaitingPartsDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null
              return (
                <div key={ap.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  background: '#fffbeb', border: '1px solid #f59e0b', borderRadius: 12,
                  padding: '12px 16px',
                }}>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 700 }}>#{v.stockNumber}</p>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      {desc}{v.color ? ` · ${v.color}` : ''}
                    </p>
                    {ap.awaitingPartsName && <p style={{ fontSize: 12, color: '#92400e', fontWeight: 600 }}>{ap.awaitingPartsName}</p>}
                    {expDate && <p style={{ fontSize: 12, color: '#92400e' }}>Expected: {expDate}</p>}
                    {ap.awaitingPartsTracking && <p style={{ fontSize: 11, color: '#b45309' }}>Tracking: {ap.awaitingPartsTracking}</p>}
                  </div>
                  <button
                    onClick={() => partsArrived(ap.id)}
                    style={{
                      padding: '8px 16px', borderRadius: 8, border: '1px solid #f59e0b',
                      background: '#fef3c7', fontWeight: 600, fontSize: 13, cursor: 'pointer',
                      color: '#92400e',
                    }}
                  >
                    Parts Arrived
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>Loading...</p>
      ) : schedule.length === 0 && awaitingParts.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          No mechanic jobs scheduled. All clear.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {Array.from(days.entries()).map(([day, blocks]) => {
            const dayHours = blocks.reduce((sum, b) => sum + (b.segmentHours || b.estimatedHours || 2), 0)
            return (
              <div key={day}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <p style={{ fontSize: 14, fontWeight: 700 }}>{day}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
                    {dayHours}h scheduled
                    {dayHours > 10 && <span style={{ color: '#ef4444', marginLeft: 6 }}>Over capacity</span>}
                  </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {blocks.map((block) => {
                    const hours = block.estimatedHours || 2
                    const startTime = new Date(block.startTime)
                    const endTime = new Date(block.endTime)
                    const isOverdue = block.status === 'in_progress' && new Date() > endTime
                    const colorKey = isOverdue ? 'in_progress_overdue' : block.status
                    const colors = STATUS_COLORS[colorKey] || STATUS_COLORS.pending
                    const doneCount = (block.checklist as ChecklistItem[]).filter(c => c.done).length
                    const totalCount = (block.checklist as ChecklistItem[]).length
                    const vehicle = block.vehicle
                    const desc = `${vehicle.year ?? ''} ${vehicle.make} ${vehicle.model}`.trim()

                    return (
                      <div key={`${block.id}-${block.segmentIndex ?? 0}`} onClick={() => openModal(block)} style={{ cursor: 'pointer' }}>
                        <div style={{
                          display: 'flex', gap: 14, alignItems: 'stretch',
                          background: colors.bg, border: `1px solid ${colors.border}`,
                          borderLeft: `4px solid ${colors.border}`,
                          borderRadius: 12, padding: '14px 16px',
                          transition: 'box-shadow 0.15s',
                        }}>
                          {/* Time column */}
                          <div style={{ minWidth: 60, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                            <p style={{ fontSize: 13, fontWeight: 700, color: colors.text }}>
                              {startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                            </p>
                            <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              {endTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                            </p>
                          </div>

                          {/* Info */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                              <div>
                                <p style={{ fontSize: 14, fontWeight: 700 }}>
                                  #{vehicle.stockNumber}
                                  {block.isContination && (
                                    <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 6 }}>
                                      (continued)
                                    </span>
                                  )}
                                </p>
                                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                                  {desc}{vehicle.color ? ` · ${vehicle.color}` : ''}
                                </p>
                                {block.pauseReason && (
                                  <p style={{ fontSize: 11, fontWeight: 600, color: '#f59e0b', marginTop: 4 }}>
                                    Paused: {block.pauseReason}
                                  </p>
                                )}
                              </div>
                              <span style={{
                                fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 100,
                                background: colors.border + '20', color: colors.border,
                                textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap',
                              }}>
                                {isOverdue ? 'Overdue' : (STATUS_LABELS[block.status] || block.status)}
                              </span>
                            </div>

                            {/* Progress bar */}
                            {totalCount > 0 && (
                              <div style={{ marginTop: 8 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                    {doneCount}/{totalCount} tasks
                                  </span>
                                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>
                                    {block.segmentHours ? `${block.segmentHours}h / ${hours}h total` : `${hours}h est.`}
                                  </span>
                                </div>
                                <div style={{ height: 4, background: '#e0e0e0', borderRadius: 2 }}>
                                  <div style={{
                                    height: '100%', borderRadius: 2,
                                    width: `${totalCount > 0 ? (doneCount / totalCount) * 100 : 0}%`,
                                    background: doneCount === totalCount ? 'var(--success)' : colors.border,
                                    transition: 'width 0.3s',
                                  }} />
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Task Modal */}
      {selectedBlock && (
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
              maxHeight: '85vh', overflow: 'auto', padding: '24px 20px',
              boxShadow: '0 -4px 30px rgba(0,0,0,0.15)',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <p style={{ fontSize: 18, fontWeight: 700 }}>#{selectedBlock.vehicle.stockNumber}</p>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                  {`${selectedBlock.vehicle.year ?? ''} ${selectedBlock.vehicle.make} ${selectedBlock.vehicle.model}`.trim()}
                  {selectedBlock.vehicle.color ? ` · ${selectedBlock.vehicle.color}` : ''}
                </p>
                <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 100,
                    background: (STATUS_COLORS[selectedBlock.status]?.border || '#e0e0e0') + '20',
                    color: STATUS_COLORS[selectedBlock.status]?.border || '#888',
                    textTransform: 'uppercase', letterSpacing: '0.04em',
                  }}>
                    {STATUS_LABELS[selectedBlock.status] || selectedBlock.status}
                  </span>
                  <Link
                    href={`/vehicles/${selectedBlock.vehicle.id}`}
                    style={{ fontSize: 12, color: '#3b82f6', textDecoration: 'none' }}
                  >
                    View Details
                  </Link>
                </div>
              </div>
              <button onClick={closeModal} style={{
                background: 'none', border: 'none', fontSize: 22, cursor: 'pointer',
                color: 'var(--text-muted)', padding: '0 4px', lineHeight: 1,
              }}>
                &times;
              </button>
            </div>

            {/* Checklist */}
            <div style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: 'var(--text-secondary)' }}>
                Tasks ({modalChecklist.filter(c => c.done).length}/{modalChecklist.length})
                {saving && <span style={{ fontWeight: 400, fontSize: 11, marginLeft: 8, color: 'var(--text-muted)' }}>Saving...</span>}
              </p>
              {modalChecklist.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No checklist items</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {modalChecklist.map((item, i) => (
                    <div
                      key={i}
                      onClick={() => toggleItem(i)}
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

            {/* Pending Approvals */}
            {pendingApprovals.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                {pendingApprovals.map(pa => (
                  <div key={pa.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                    background: '#f8f8f6', borderRadius: 10, marginBottom: 6,
                    border: '1px solid #e5e5e5', fontStyle: 'italic', color: '#999',
                  }}>
                    <span style={{ fontSize: 14, flex: 1 }}>{pa.taskName}</span>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                      background: '#f59e0b20', color: '#f59e0b', textTransform: 'uppercase',
                      letterSpacing: '0.03em', whiteSpace: 'nowrap',
                    }}>Pending Approval</span>
                  </div>
                ))}
              </div>
            )}

            {/* Task submitted message */}
            {taskSubmitMsg && (
              <div style={{
                padding: '10px 14px', borderRadius: 10, marginBottom: 12,
                background: '#f0fdf4', border: '1px solid #bbf7d0',
                fontSize: 13, fontWeight: 600, color: '#16a34a',
              }}>
                {taskSubmitMsg}
              </div>
            )}

            {/* Add Task */}
            <div style={{ marginBottom: 16 }}>
              {!showAddTask ? (
                <button
                  onClick={() => setShowAddTask(true)}
                  style={{
                    width: '100%', padding: '10px 0', borderRadius: 10, border: '1px dashed #d1d5db',
                    background: 'transparent', color: 'var(--text-secondary)', fontWeight: 600,
                    fontSize: 13, cursor: 'pointer',
                  }}
                >
                  + Add Task
                </button>
              ) : (
                <div style={{ padding: 14, background: '#f8f8f6', borderRadius: 12, border: '1px solid #e5e5e5' }}>
                  <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: 'var(--text-secondary)' }}>New Task</p>
                  <input
                    type="text"
                    placeholder="Task name"
                    value={newTaskName}
                    onChange={e => setNewTaskName(e.target.value)}
                    style={{
                      width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e5e5e5',
                      fontSize: 14, marginBottom: 10, boxSizing: 'border-box',
                    }}
                  />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 10, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={noExtraHours}
                      onChange={e => setNoExtraHours(e.target.checked)}
                      style={{ width: 16, height: 16 }}
                    />
                    No additional hours needed
                  </label>
                  {!noExtraHours && (
                    <input
                      type="number"
                      placeholder="Additional hours"
                      step="0.5"
                      min="0"
                      value={newTaskHours}
                      onChange={e => setNewTaskHours(e.target.value)}
                      style={{
                        width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e5e5e5',
                        fontSize: 14, marginBottom: 10, boxSizing: 'border-box',
                      }}
                    />
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={addTask}
                      disabled={!newTaskName.trim() || addingTask}
                      style={{
                        flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
                        background: newTaskName.trim() ? '#dffd6e' : '#e5e5e5',
                        color: '#1a1a1a', fontWeight: 700, fontSize: 13,
                        cursor: newTaskName.trim() ? 'pointer' : 'not-allowed',
                        opacity: addingTask ? 0.6 : 1,
                      }}
                    >
                      {addingTask ? 'Adding...' : 'Add'}
                    </button>
                    <button
                      onClick={() => { setShowAddTask(false); setNewTaskName(''); setNewTaskHours(''); setNoExtraHours(false) }}
                      style={{
                        padding: '10px 16px', borderRadius: 10, border: '1px solid #e5e5e5',
                        background: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Start Next Vehicle */}
            {selectedBlock.status === 'in_progress' && queuedCount > 0 && (
              <div style={{ marginBottom: 16 }}>
                {!showPausePrompt ? (
                  <button
                    onClick={() => setShowPausePrompt(true)}
                    style={{
                      width: '100%', padding: '12px 0', borderRadius: 12, border: '1px solid #3b82f6',
                      background: '#eff6ff', color: '#1e40af', fontWeight: 700, fontSize: 14,
                      cursor: 'pointer',
                    }}
                  >
                    Start Next Vehicle
                  </button>
                ) : (
                  <div style={{ padding: 14, background: '#eff6ff', borderRadius: 12, border: '1px solid #3b82f6' }}>
                    <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#1e40af' }}>Why are you pausing this vehicle?</p>
                    <input
                      type="text"
                      placeholder="e.g. Waiting for bed to dry"
                      value={pauseReason}
                      onChange={e => setPauseReason(e.target.value)}
                      style={{
                        width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e5e5e5',
                        fontSize: 14, marginBottom: 10, boxSizing: 'border-box',
                      }}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={startNextVehicle}
                        disabled={!pauseReason.trim() || startingNext}
                        style={{
                          flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
                          background: pauseReason.trim() ? '#3b82f6' : '#e5e5e5',
                          color: '#fff', fontWeight: 700, fontSize: 13,
                          cursor: pauseReason.trim() ? 'pointer' : 'not-allowed',
                          opacity: startingNext ? 0.6 : 1,
                        }}
                      >
                        {startingNext ? 'Starting...' : 'Confirm'}
                      </button>
                      <button
                        onClick={() => { setShowPausePrompt(false); setPauseReason('') }}
                        style={{
                          padding: '10px 16px', borderRadius: 10, border: '1px solid #e5e5e5',
                          background: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Awaiting Parts Prompt */}
            {showAwaitingPrompt ? (
              <div style={{ marginBottom: 16, padding: 16, background: '#fffbeb', borderRadius: 12, border: '1px solid #f59e0b' }}>
                <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#92400e' }}>What part was ordered?</p>
                <input
                  type="text"
                  placeholder="e.g. Brake pads, alternator..."
                  value={partName}
                  onChange={e => setPartName(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e5e5e5',
                    fontSize: 14, marginBottom: 10, boxSizing: 'border-box',
                  }}
                />
                <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#92400e' }}>Expected delivery date (optional)</p>
                <input
                  type="date"
                  value={expectedDate}
                  onChange={e => setExpectedDate(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e5e5e5',
                    fontSize: 14, marginBottom: 10, boxSizing: 'border-box',
                  }}
                />
                <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#92400e' }}>Tracking number (optional)</p>
                <input
                  type="text"
                  placeholder="Tracking #"
                  value={trackingNumber}
                  onChange={e => setTrackingNumber(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e5e5e5',
                    fontSize: 14, marginBottom: 10, boxSizing: 'border-box',
                  }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={submitAwaitingParts}
                    disabled={saving}
                    style={{
                      flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
                      background: '#f59e0b', color: '#fff', fontWeight: 700, fontSize: 14,
                      cursor: 'pointer', opacity: saving ? 0.6 : 1,
                    }}
                  >
                    {saving ? 'Saving...' : 'Confirm'}
                  </button>
                  <button
                    onClick={() => setShowAwaitingPrompt(false)}
                    style={{
                      padding: '10px 16px', borderRadius: 10, border: '1px solid #e5e5e5',
                      background: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <button
                  onClick={() => setShowAwaitingPrompt(true)}
                  style={{
                    flex: 1, padding: '12px 0', borderRadius: 12, border: '1px solid #f59e0b',
                    background: '#fffbeb', color: '#92400e', fontWeight: 700, fontSize: 14,
                    cursor: 'pointer',
                  }}
                >
                  Awaiting Parts
                </button>
              </div>
            )}

            {/* Complete Button */}
            <button
              onClick={completeStage}
              disabled={!allDone || completing}
              style={{
                width: '100%', padding: '14px 0', borderRadius: 12, border: 'none',
                background: allDone ? '#dffd6e' : '#e5e5e5',
                color: allDone ? '#1a1a1a' : '#999',
                fontWeight: 700, fontSize: 15, cursor: allDone ? 'pointer' : 'not-allowed',
                opacity: completing ? 0.6 : 1, transition: 'all 0.15s',
              }}
            >
              {completing ? 'Completing...' : 'Complete Stage'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
