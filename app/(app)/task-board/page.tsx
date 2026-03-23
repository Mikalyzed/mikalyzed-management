'use client'

import { useEffect, useState, useRef } from 'react'
import KanbanScrollbar from '@/components/KanbanScrollbar'

type Task = {
  id: string
  title: string
  description: string | null
  category: string
  status: string
  priority: number
  assignee: { id: string; name: string } | null
  createdBy: { id: string; name: string }
  dueDate: string | null
  completedAt: string | null
  createdAt: string
}

type User = { id: string; name: string; role: string }

const DEPARTMENTS = [
  { value: 'content', label: 'Content', color: '#8b5cf6', roles: ['content'] },
  { value: 'marketing', label: 'Marketing', color: '#3b82f6', roles: ['admin'] },
  { value: 'operations', label: 'Operations', color: '#f59e0b', roles: ['admin', 'coordinator'] },
  { value: 'admin', label: 'Admin', color: '#64748b', roles: ['admin'] },
]

const PRIORITY_LABELS: Record<number, { label: string; color: string }> = {
  0: { label: 'Normal', color: 'var(--text-muted)' },
  1: { label: 'High', color: '#f59e0b' },
  2: { label: 'Urgent', color: '#ef4444' },
}

const COLUMNS = [
  { key: 'todo', label: 'To Do' },
  { key: 'done', label: 'Done' },
]

// Map user role to default department
function defaultDept(role: string): string {
  if (role === 'content') return 'content'
  if (role === 'coordinator') return 'operations'
  return 'content' // admin defaults to content
}

export default function TaskBoardPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [userRole, setUserRole] = useState('')
  const [activeDept, setActiveDept] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const kanbanRef = useRef<HTMLDivElement | null>(null)

  // New task form
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newAssignee, setNewAssignee] = useState('')
  const [newDueDate, setNewDueDate] = useState('')
  const [newPriority, setNewPriority] = useState(0)

  useEffect(() => {
    const cookies = document.cookie.split(';').reduce((acc: Record<string, string>, c) => {
      const [k, v] = c.trim().split('='); acc[k] = v; return acc
    }, {})
    const role = cookies.mm_user_role || 'admin'
    setUserRole(role)
    setIsAdmin(role === 'admin')
    setActiveDept(defaultDept(role))

    fetch('/api/users').then(r => r.json()).then(d => {
      const list = d.users || d
      setUsers(Array.isArray(list) ? list : [])
    })
  }, [])

  function load() {
    if (!activeDept) return
    const params = new URLSearchParams()
    params.set('category', activeDept)
    if (assigneeFilter) params.set('assigneeId', assigneeFilter)
    fetch(`/api/board-tasks?${params}`).then(r => r.json()).then(d => { setTasks(d); setLoading(false) })
  }

  useEffect(() => { if (activeDept) { setLoading(true); load() } }, [activeDept, assigneeFilter])

  const dept = DEPARTMENTS.find(d => d.value === activeDept)
  const deptColor = dept?.color || '#888'

  async function addTask() {
    if (!newTitle.trim()) return
    await fetch('/api/board-tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: newTitle, description: newDesc || null,
        category: activeDept, assigneeId: newAssignee || null,
        dueDate: newDueDate || null, priority: newPriority,
      }),
    })
    setNewTitle(''); setNewDesc('')
    setNewAssignee(''); setNewDueDate(''); setNewPriority(0)
    setShowAdd(false)
    load()
  }

  async function updateStatus(id: string, status: string) {
    await fetch(`/api/board-tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    load()
  }

  async function deleteTask(id: string) {
    if (!confirm('Delete this task?')) return
    await fetch(`/api/board-tasks/${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>Task Board</h1>
          <span style={{ width: 1, height: 24, background: 'var(--border)' }} />
          {isAdmin ? (
            <div style={{ display: 'flex', gap: 4 }}>
              {DEPARTMENTS.map(d => (
                <button key={d.value} onClick={() => setActiveDept(d.value)} style={{
                  padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontSize: 13, fontWeight: 600,
                  background: activeDept === d.value ? d.color + '20' : 'transparent',
                  color: activeDept === d.value ? d.color : 'var(--text-muted)',
                }}>
                  {d.label}
                </button>
              ))}
            </div>
          ) : (
            <span style={{ fontSize: 14, fontWeight: 600, color: deptColor }}>{dept?.label}</span>
          )}
        </div>
        <button onClick={() => setShowAdd(true)} style={{
          padding: '10px 20px', borderRadius: 12, border: 'none', cursor: 'pointer',
          background: '#1a1a1a', color: '#dffd6e', fontSize: 14, fontWeight: 600,
          whiteSpace: 'nowrap',
        }}>+ New Task</button>
      </div>

      {/* Assignee filter */}
      {isAdmin && (
        <div style={{ marginBottom: 16 }}>
          <select className="input" value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)}
            style={{ width: 'auto', minWidth: 140 }}>
            <option value="">All Assignees</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>Loading...</p>
      ) : (
        <>
        <div className="kanban-board" ref={kanbanRef}>
          {COLUMNS.map(col => {
            const colTasks = tasks.filter(t => t.status === col.key)
            return (
              <div key={col.key} className="kanban-column">
                <div className="kanban-column-header">
                  <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                    {col.label}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>{colTasks.length}</span>
                </div>
                {colTasks.length === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>Empty</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {colTasks.map(task => (
                      <div key={task.id} className="card" style={{ padding: '12px 14px', margin: 0 }}>
                        {/* Priority badge */}
                        {task.priority > 0 && (
                          <div style={{ marginBottom: 6 }}>
                            <span style={{
                              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100,
                              background: task.priority === 2 ? '#fef2f2' : '#fffbeb',
                              color: PRIORITY_LABELS[task.priority]?.color,
                              textTransform: 'uppercase', letterSpacing: '0.04em',
                            }}>{PRIORITY_LABELS[task.priority]?.label}</span>
                          </div>
                        )}
                        {/* Title */}
                        <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{task.title}</p>
                        {task.description && (
                          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, lineHeight: 1.4 }}>{task.description}</p>
                        )}
                        {/* Meta row */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {task.assignee && (
                              <span style={{
                                width: 22, height: 22, borderRadius: '50%', fontSize: 10, fontWeight: 700,
                                background: deptColor + '20', color: deptColor,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>{task.assignee.name.split(' ').map(n => n[0]).join('')}</span>
                            )}
                            {task.dueDate && (
                              <span style={{
                                fontSize: 11, fontWeight: 600,
                                color: new Date(task.dueDate) < new Date() && task.status !== 'done' ? '#ef4444' : 'var(--text-muted)',
                              }}>
                                {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </span>
                            )}
                          </div>
                          {col.key === 'todo' ? (
                            <button onClick={() => updateStatus(task.id, 'done')} style={{
                              fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
                              border: 'none', background: '#1a1a1a', color: '#dffd6e', cursor: 'pointer',
                            }}>Complete</button>
                          ) : (
                            <button onClick={() => updateStatus(task.id, 'todo')} style={{
                              fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
                              border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--text-secondary)',
                            }}>Reopen</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <KanbanScrollbar boardRef={kanbanRef} />
        </>
      )}

      {/* Add Task Modal */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, maxWidth: 480, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>New Task</h3>
            <p style={{ fontSize: 13, color: deptColor, fontWeight: 600, marginBottom: 16 }}>{dept?.label} Department</p>

            <div style={{ marginBottom: 12 }}>
              <label className="form-label">Title</label>
              <input className="input" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="What needs to be done?" />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label className="form-label">Description</label>
              <textarea className="input" value={newDesc} onChange={e => setNewDesc(e.target.value)} rows={3}
                placeholder="Details, links, notes..." style={{ resize: 'vertical' }} />
            </div>

            <div className="form-row" style={{ marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <label className="form-label">Assignee</label>
                <select className="input" value={newAssignee} onChange={e => setNewAssignee(e.target.value)}>
                  <option value="">Unassigned</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label className="form-label">Priority</label>
                <select className="input" value={newPriority} onChange={e => setNewPriority(Number(e.target.value))}>
                  <option value={0}>Normal</option>
                  <option value={1}>High</option>
                  <option value={2}>Urgent</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label className="form-label">Due Date</label>
              <input className="input" type="date" value={newDueDate} onChange={e => setNewDueDate(e.target.value)} />
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => setShowAdd(false)} className="btn btn-secondary" style={{ flex: 1 }}>Cancel</button>
              <button onClick={addTask} className="btn btn-primary" style={{ flex: 1 }}>Create Task</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
