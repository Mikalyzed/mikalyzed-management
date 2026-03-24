'use client'

import { useEffect, useState, useCallback, useRef } from 'react'

type ChecklistItem = { item: string; done: boolean; note: string }

type ContentVehicle = {
  id: string
  vehicleId: string
  vehicle: { id: string; stockNumber: string; year: number | null; make: string; model: string; color: string | null }
  assignee: { id: string; name: string } | null
  status: string
  checklist: ChecklistItem[]
  priority: number
}

type ContentTask = {
  id: string
  title: string
  status: string
  priority: number
  assignee: { id: string; name: string } | null
  dueDate: string | null
  completedAt: string | null
}

type User = { id: string; name: string; role: string }

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending: { bg: '#f0f0ee', text: '#888' },
  in_progress: { bg: '#eff6ff', text: '#1e40af' },
  blocked: { bg: '#fef2f2', text: '#991b1b' },
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  blocked: 'Blocked',
}

export default function ContentSchedulePage() {
  const [vehicles, setVehicles] = useState<ContentVehicle[]>([])
  const [tasks, setTasks] = useState<ContentTask[]>([])
  const [stats, setStats] = useState({ total: 0, inProgress: 0, completedToday: 0 })
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [users, setUsers] = useState<User[]>([])

  // Modal state
  const [selectedVehicle, setSelectedVehicle] = useState<ContentVehicle | null>(null)
  const [modalChecklist, setModalChecklist] = useState<ChecklistItem[]>([])
  const [saving, setSaving] = useState(false)
  const [completing, setCompleting] = useState(false)

  // Add task form
  const [showAddTask, setShowAddTask] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newAssignee, setNewAssignee] = useState('')
  const [newDueDate, setNewDueDate] = useState('')

  // Drag state
  const dragItem = useRef<number | null>(null)
  const dragOver = useRef<number | null>(null)

  useEffect(() => {
    const cookies = document.cookie.split(';').reduce((acc: Record<string, string>, c) => {
      const [k, v] = c.trim().split('='); acc[k] = v; return acc
    }, {})
    setIsAdmin(cookies.mm_user_role === 'admin')
    fetch('/api/users').then(r => r.json()).then(d => {
      const list = d.users || d
      setUsers(Array.isArray(list) ? list.filter((u: User) => u.role === 'content' || u.role === 'admin') : [])
    })
  }, [])

  const fetchData = useCallback(() => {
    fetch('/api/content-schedule').then(r => r.json()).then(d => {
      setVehicles(d.vehicles || [])
      setTasks(d.tasks || [])
      setStats(d.stats || { total: 0, inProgress: 0, completedToday: 0 })
      setLoading(false)
    })
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Modal
  const openModal = (v: ContentVehicle) => {
    setSelectedVehicle(v)
    setModalChecklist(JSON.parse(JSON.stringify(v.checklist || [])))
  }

  const closeModal = () => {
    setSelectedVehicle(null)
    setModalChecklist([])
  }

  const toggleItem = async (index: number) => {
    const updated = [...modalChecklist]
    updated[index] = { ...updated[index], done: !updated[index].done }
    setModalChecklist(updated)
    setSaving(true)
    await fetch(`/api/stages/${selectedVehicle!.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checklist: updated }),
    })
    setSaving(false)
    setVehicles(prev => prev.map(v => v.id === selectedVehicle!.id ? { ...v, checklist: updated } : v))
  }

  const completeStage = async () => {
    if (!selectedVehicle) return
    setCompleting(true)
    await fetch(`/api/stages/${selectedVehicle.id}/advance`, { method: 'POST' })
    setCompleting(false)
    closeModal()
    fetchData()
  }

  // Drag reorder
  const handleDragStart = (index: number) => { dragItem.current = index }
  const handleDragEnter = (index: number) => { dragOver.current = index }
  const handleDragEnd = async () => {
    if (dragItem.current === null || dragOver.current === null || dragItem.current === dragOver.current) return
    const reordered = [...vehicles]
    const [removed] = reordered.splice(dragItem.current, 1)
    reordered.splice(dragOver.current, 0, removed)
    setVehicles(reordered)
    dragItem.current = null
    dragOver.current = null
    const updates = reordered.map((v, i) => ({ id: v.id, priority: i }))
    await fetch('/api/stages/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stages: updates }),
    })
  }

  // Add standalone task
  const addTask = async () => {
    if (!newTitle.trim()) return
    await fetch('/api/board-tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: newTitle, category: 'content',
        assigneeId: newAssignee || null, dueDate: newDueDate || null,
      }),
    })
    setNewTitle(''); setNewAssignee(''); setNewDueDate('')
    setShowAddTask(false)
    fetchData()
  }

  const toggleTask = async (task: ContentTask) => {
    const newStatus = task.status === 'done' ? 'todo' : 'done'
    await fetch(`/api/board-tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    fetchData()
  }

  const allDone = modalChecklist.length > 0 && modalChecklist.every(c => c.done)
  const doneCount = (cl: ChecklistItem[]) => cl.filter(c => c.done).length

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>Loading...</div>
  }

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 16 }}>Content Schedule</h1>

      {/* Stats Bar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 28, flexWrap: 'wrap' }}>
        {[
          { label: 'Total Vehicles', value: stats.total },
          { label: 'In Progress', value: stats.inProgress },
          { label: 'Completed Today', value: stats.completedToday },
        ].map(s => (
          <div key={s.label} style={{
            background: '#fff', borderRadius: 12, padding: '14px 20px', flex: '1 1 140px',
            border: '1px solid #e8e8e6',
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ═══ Recon Vehicles ═══ */}
      <div style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 14, color: '#1a1a1a' }}>Recon Vehicles</h2>
        {vehicles.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 12, padding: 32, textAlign: 'center', color: '#999', border: '1px solid #e8e8e6' }}>
            No vehicles in content stage
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 12,
          }}>
            {vehicles.map((v, i) => {
              const done = doneCount(v.checklist)
              const total = v.checklist.length
              const pct = total > 0 ? (done / total) * 100 : 0
              const sc = STATUS_COLORS[v.status] || STATUS_COLORS.pending
              return (
                <div
                  key={v.id}
                  draggable={isAdmin}
                  onDragStart={() => handleDragStart(i)}
                  onDragEnter={() => handleDragEnter(i)}
                  onDragEnd={handleDragEnd}
                  onDragOver={e => e.preventDefault()}
                  onClick={() => openModal(v)}
                  style={{
                    background: '#fff', borderRadius: 14, padding: '18px 18px 16px',
                    border: '1px solid #e8e8e6', cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', gap: 10,
                    transition: 'box-shadow 0.15s, transform 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.07)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none' }}
                >
                  {/* Stock + Status */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <p style={{ fontSize: 15, fontWeight: 700 }}>#{v.vehicle.stockNumber}</p>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 100,
                      background: sc.bg, color: sc.text, textTransform: 'uppercase', letterSpacing: '0.04em',
                    }}>
                      {STATUS_LABELS[v.status] || v.status}
                    </span>
                  </div>

                  {/* Vehicle info */}
                  <p style={{ fontSize: 13, color: '#555', lineHeight: 1.3 }}>
                    {v.vehicle.year} {v.vehicle.make} {v.vehicle.model}
                    {v.vehicle.color && <span style={{ color: '#999' }}> · {v.vehicle.color}</span>}
                  </p>

                  {/* Assignee */}
                  {v.assignee && (
                    <p style={{ fontSize: 12, color: '#999' }}>{v.assignee.name}</p>
                  )}

                  {/* Progress */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: '#999' }}>{done}/{total} tasks</span>
                    </div>
                    <div style={{ height: 4, borderRadius: 2, background: '#eee', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 2, transition: 'width 0.3s',
                        width: `${pct}%`,
                        background: pct === 100 ? '#22c55e' : '#dffd6e',
                      }} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ═══ Content to Create ═══ */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: '#1a1a1a' }}>Content to Create</h2>
          {isAdmin && (
            <button onClick={() => setShowAddTask(true)} style={{
              padding: '8px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: '#1a1a1a', color: '#dffd6e', fontSize: 13, fontWeight: 600,
            }}>+ Add Task</button>
          )}
        </div>

        {showAddTask && (
          <div style={{ background: '#fff', borderRadius: 12, padding: 16, border: '1px solid #e8e8e6', marginBottom: 12 }}>
            <div style={{ marginBottom: 10 }}>
              <input className="input" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Task title" autoFocus />
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <select className="input" value={newAssignee} onChange={e => setNewAssignee(e.target.value)} style={{ flex: 1, minWidth: 120 }}>
                <option value="">Unassigned</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              <input className="input" type="date" value={newDueDate} onChange={e => setNewDueDate(e.target.value)} style={{ flex: 1, minWidth: 120 }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowAddTask(false)} style={{
                padding: '8px 16px', borderRadius: 8, border: '1px solid #e0e0e0', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#666',
              }}>Cancel</button>
              <button onClick={addTask} style={{
                padding: '8px 16px', borderRadius: 8, border: 'none', background: '#1a1a1a', color: '#dffd6e', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              }}>Create</button>
            </div>
          </div>
        )}

        {tasks.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, textAlign: 'center', color: '#999', border: '1px solid #e8e8e6', fontSize: 13 }}>
            No additional tasks
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 12,
          }}>
            {tasks.filter(t => t.status !== 'done').map(task => (
              <div key={task.id} style={{
                background: '#fff', borderRadius: 14, padding: '16px 18px',
                border: '1px solid #e8e8e6', display: 'flex', flexDirection: 'column', gap: 8,
              }}>
                <p style={{ fontSize: 14, fontWeight: 700 }}>{task.title}</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {task.assignee && <span style={{ fontSize: 12, color: '#999' }}>{task.assignee.name}</span>}
                  {task.dueDate && (
                    <span style={{
                      fontSize: 12, fontWeight: 600,
                      color: new Date(task.dueDate) < new Date() ? '#ef4444' : '#999',
                    }}>
                      {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </div>
                <button onClick={() => toggleTask(task)} style={{
                  marginTop: 'auto', padding: '8px 0', borderRadius: 8, border: 'none',
                  background: '#1a1a1a', color: '#dffd6e', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}>Complete</button>
              </div>
            ))}
            {tasks.filter(t => t.status === 'done').map(task => (
              <div key={task.id} style={{
                background: '#fafaf8', borderRadius: 14, padding: '16px 18px',
                border: '1px solid #e8e8e6', display: 'flex', flexDirection: 'column', gap: 8, opacity: 0.5,
              }}>
                <p style={{ fontSize: 14, fontWeight: 600, textDecoration: 'line-through', color: '#999' }}>{task.title}</p>
                <button onClick={() => toggleTask(task)} style={{
                  marginTop: 'auto', padding: '8px 0', borderRadius: 8,
                  border: '1px solid #e0e0e0', background: '#fff', color: '#888', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}>Reopen</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Vehicle Task Modal */}
      {selectedVehicle && (
        <div onClick={closeModal} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: 20, maxWidth: 500, width: '100%',
            maxHeight: '85vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 8px 40px rgba(0,0,0,0.15)',
          }}>
            {/* Scrollable content */}
            <div style={{ flex: 1, overflow: 'auto', padding: '24px 20px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div>
                  <p style={{ fontSize: 18, fontWeight: 700 }}>#{selectedVehicle.vehicle.stockNumber}</p>
                  <p style={{ fontSize: 14, color: '#555', marginTop: 2 }}>
                    {selectedVehicle.vehicle.year} {selectedVehicle.vehicle.make} {selectedVehicle.vehicle.model}
                    {selectedVehicle.vehicle.color && ` · ${selectedVehicle.vehicle.color}`}
                  </p>
                  {selectedVehicle.assignee && (
                    <p style={{ fontSize: 12, color: '#999', marginTop: 6 }}>Assigned to {selectedVehicle.assignee.name}</p>
                  )}
                </div>
                <button onClick={closeModal} style={{
                  background: 'none', border: 'none', fontSize: 22, cursor: 'pointer',
                  color: '#999', padding: '0 4px', lineHeight: 1,
                }}>&times;</button>
              </div>

              {/* Checklist */}
              <div>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
                  Tasks ({doneCount(modalChecklist)}/{modalChecklist.length})
                  {saving && <span style={{ fontWeight: 400, fontSize: 11, marginLeft: 8 }}>Saving...</span>}
                </p>
                {modalChecklist.length === 0 ? (
                  <p style={{ fontSize: 13, color: '#999', padding: '12px 0' }}>No tasks configured</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {modalChecklist.map((item, i) => (
                      <div key={i} onClick={() => toggleItem(i)} style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                        borderRadius: 10, border: '1px solid', cursor: 'pointer',
                        borderColor: item.done ? '#bbf7d0' : '#e5e5e5',
                        background: item.done ? '#f0fdf4' : '#f8f8f6',
                        transition: 'all 0.15s',
                      }}>
                        <div style={{
                          width: 22, height: 22, borderRadius: 6, border: '2px solid',
                          borderColor: item.done ? '#22c55e' : '#d1d5db',
                          background: item.done ? '#22c55e' : '#fff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          {item.done && (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </div>
                        <span style={{
                          fontSize: 14, color: item.done ? '#999' : '#333',
                          textDecoration: item.done ? 'line-through' : 'none',
                        }}>{item.item}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Sticky footer */}
            <div style={{ padding: '12px 20px 20px', borderTop: '1px solid #e5e5e5', flexShrink: 0 }}>
              <button
                onClick={completeStage}
                disabled={!allDone || completing}
                style={{
                  width: '100%', padding: '14px 0', borderRadius: 12, border: 'none',
                  background: allDone ? '#dffd6e' : '#e5e5e5',
                  color: allDone ? '#1a1a1a' : '#999',
                  fontSize: 15, fontWeight: 700,
                  cursor: !allDone || completing ? 'default' : 'pointer',
                  opacity: completing ? 0.6 : 1,
                }}
              >
                {completing ? 'Advancing...' : allDone ? 'Advance Stage' : 'Complete all tasks to advance'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
