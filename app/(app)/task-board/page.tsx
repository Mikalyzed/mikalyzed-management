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

    // Save new order
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
        title: newTitle,
        category: 'content',
        assigneeId: newAssignee || null,
        dueDate: newDueDate || null,
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
      {/* Header */}
      <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 16 }}>Content Schedule</h1>

      {/* Stats Bar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
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

      {/* Vehicle Queue */}
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: '#333' }}>Vehicle Queue</h2>
        {vehicles.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 12, padding: 32, textAlign: 'center', color: '#999', border: '1px solid #e8e8e6' }}>
            No vehicles in content stage
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                    background: '#fff', borderRadius: 12, padding: '14px 16px',
                    border: '1px solid #e8e8e6', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 14,
                    transition: 'box-shadow 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)' }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none' }}
                >
                  {/* Drag handle */}
                  {isAdmin && (
                    <div style={{ color: '#ccc', cursor: 'grab', flexShrink: 0, fontSize: 16, lineHeight: 1 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/>
                        <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
                        <circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/>
                      </svg>
                    </div>
                  )}

                  {/* Vehicle info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: 700 }}>
                        #{v.vehicle.stockNumber}
                      </span>
                      <span style={{ fontSize: 13, color: '#555' }}>
                        {v.vehicle.year} {v.vehicle.make} {v.vehicle.model}
                      </span>
                      {v.vehicle.color && (
                        <span style={{ fontSize: 12, color: '#999' }}>{v.vehicle.color}</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100,
                        background: sc.bg, color: sc.text, textTransform: 'uppercase', letterSpacing: '0.04em',
                      }}>
                        {STATUS_LABELS[v.status] || v.status}
                      </span>
                      {v.assignee && (
                        <span style={{ fontSize: 12, color: '#999' }}>{v.assignee.name}</span>
                      )}
                    </div>
                  </div>

                  {/* Progress */}
                  <div style={{ width: 80, flexShrink: 0, textAlign: 'right' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 4 }}>
                      {done}/{total}
                    </div>
                    <div style={{ height: 4, borderRadius: 2, background: '#eee', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#22c55e' : '#dffd6e', borderRadius: 2, transition: 'width 0.3s' }} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Additional Tasks */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#333' }}>Additional Tasks</h2>
          {isAdmin && (
            <button onClick={() => setShowAddTask(true)} style={{
              padding: '8px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: '#1a1a1a', color: '#dffd6e', fontSize: 13, fontWeight: 600,
            }}>+ Add Task</button>
          )}
        </div>

        {/* Add task inline form */}
        {showAddTask && (
          <div style={{ background: '#fff', borderRadius: 12, padding: 16, border: '1px solid #e8e8e6', marginBottom: 12 }}>
            <div style={{ marginBottom: 10 }}>
              <input
                className="input"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="Task title"
                autoFocus
              />
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

        {tasks.filter(t => t.status !== 'done').length === 0 && tasks.filter(t => t.status === 'done').length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, textAlign: 'center', color: '#999', border: '1px solid #e8e8e6', fontSize: 13 }}>
            No additional tasks
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {tasks.filter(t => t.status !== 'done').map(task => (
              <div key={task.id} style={{
                background: '#fff', borderRadius: 10, padding: '12px 14px',
                border: '1px solid #e8e8e6', display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{task.title}</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
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
                </div>
                <button onClick={() => toggleTask(task)} style={{
                  fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6,
                  border: 'none', background: '#1a1a1a', color: '#dffd6e', cursor: 'pointer',
                }}>Complete</button>
              </div>
            ))}
            {tasks.filter(t => t.status === 'done').map(task => (
              <div key={task.id} style={{
                background: '#fafaf8', borderRadius: 10, padding: '12px 14px',
                border: '1px solid #e8e8e6', display: 'flex', alignItems: 'center', gap: 12, opacity: 0.6,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, textDecoration: 'line-through', color: '#999' }}>{task.title}</div>
                </div>
                <button onClick={() => toggleTask(task)} style={{
                  fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6,
                  border: '1px solid #e0e0e0', background: '#fff', cursor: 'pointer', color: '#888',
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
            background: '#fff', borderRadius: 16, padding: 24, maxWidth: 480, width: '100%', maxHeight: '90vh', overflowY: 'auto',
          }}>
            {/* Header */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>
                #{selectedVehicle.vehicle.stockNumber}
              </div>
              <div style={{ fontSize: 14, color: '#555', marginTop: 2 }}>
                {selectedVehicle.vehicle.year} {selectedVehicle.vehicle.make} {selectedVehicle.vehicle.model}
                {selectedVehicle.vehicle.color && ` - ${selectedVehicle.vehicle.color}`}
              </div>
              {selectedVehicle.assignee && (
                <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>Assigned to {selectedVehicle.assignee.name}</div>
              )}
            </div>

            {/* Checklist */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                Tasks ({doneCount(modalChecklist)}/{modalChecklist.length})
              </div>
              {modalChecklist.length === 0 ? (
                <div style={{ fontSize: 13, color: '#999', padding: '12px 0' }}>No tasks configured</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {modalChecklist.map((item, i) => (
                    <div key={i} onClick={() => toggleItem(i)} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                      borderRadius: 8, border: '1px solid #e8e8e6', cursor: 'pointer',
                      background: item.done ? '#f8fef0' : '#fff',
                      transition: 'background 0.15s',
                    }}>
                      <div style={{
                        width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                        border: item.done ? 'none' : '2px solid #ddd',
                        background: item.done ? '#22c55e' : '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {item.done && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>
                      <span style={{
                        fontSize: 14, fontWeight: 500,
                        textDecoration: item.done ? 'line-through' : 'none',
                        color: item.done ? '#999' : '#333',
                      }}>{item.item}</span>
                    </div>
                  ))}
                </div>
              )}
              {saving && <div style={{ fontSize: 11, color: '#999', marginTop: 6 }}>Saving...</div>}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={closeModal} style={{
                flex: 1, padding: '12px', borderRadius: 10, border: '1px solid #e0e0e0',
                background: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#666',
              }}>Close</button>
              <button
                onClick={completeStage}
                disabled={!allDone || completing}
                style={{
                  flex: 1, padding: '12px', borderRadius: 10, border: 'none',
                  background: allDone ? '#1a1a1a' : '#e0e0e0',
                  color: allDone ? '#dffd6e' : '#999',
                  cursor: allDone ? 'pointer' : 'not-allowed',
                  fontSize: 14, fontWeight: 600,
                }}
              >
                {completing ? 'Advancing...' : 'Complete Stage'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
