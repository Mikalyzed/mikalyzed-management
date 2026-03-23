'use client'

import { useEffect, useState } from 'react'
import KanbanScrollbar from '@/components/KanbanScrollbar'
import { useRef } from 'react'

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

type User = { id: string; name: string }

const CATEGORIES = [
  { value: 'content', label: 'Content', color: '#8b5cf6' },
  { value: 'marketing', label: 'Marketing', color: '#3b82f6' },
  { value: 'admin', label: 'Admin', color: '#64748b' },
  { value: 'operations', label: 'Operations', color: '#f59e0b' },
]

const PRIORITY_LABELS: Record<number, { label: string; color: string }> = {
  0: { label: 'Normal', color: 'var(--text-muted)' },
  1: { label: 'High', color: '#f59e0b' },
  2: { label: 'Urgent', color: '#ef4444' },
}

const COLUMNS = [
  { key: 'todo', label: 'To Do' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'done', label: 'Done' },
]

export default function TaskBoardPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const kanbanRef = useRef<HTMLDivElement | null>(null)

  // New task form
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newCategory, setNewCategory] = useState('content')
  const [newAssignee, setNewAssignee] = useState('')
  const [newDueDate, setNewDueDate] = useState('')
  const [newPriority, setNewPriority] = useState(0)

  function load() {
    const params = new URLSearchParams()
    if (categoryFilter) params.set('category', categoryFilter)
    if (assigneeFilter) params.set('assigneeId', assigneeFilter)
    fetch(`/api/board-tasks?${params}`).then(r => r.json()).then(d => { setTasks(d); setLoading(false) })
  }

  useEffect(() => {
    load()
    fetch('/api/users').then(r => r.json()).then(d => {
      const list = d.users || d
      setUsers(Array.isArray(list) ? list : [])
    })
    // Check admin
    const cookies = document.cookie.split(';').reduce((acc: Record<string, string>, c) => {
      const [k, v] = c.trim().split('='); acc[k] = v; return acc
    }, {})
    setIsAdmin(cookies.mm_user_role === 'admin')
  }, [])

  useEffect(() => { if (!loading) load() }, [categoryFilter, assigneeFilter])

  async function addTask() {
    if (!newTitle.trim()) return
    await fetch('/api/board-tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: newTitle, description: newDesc || null,
        category: newCategory, assigneeId: newAssignee || null,
        dueDate: newDueDate || null, priority: newPriority,
      }),
    })
    setNewTitle(''); setNewDesc(''); setNewCategory('content')
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

  const catColor = (cat: string) => CATEGORIES.find(c => c.value === cat)?.color || '#888'
  const catLabel = (cat: string) => CATEGORIES.find(c => c.value === cat)?.label || cat

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>Task Board</h1>
        <button onClick={() => setShowAdd(true)} style={{
          padding: '10px 20px', borderRadius: 12, border: 'none', cursor: 'pointer',
          background: '#1a1a1a', color: '#dffd6e', fontSize: 14, fontWeight: 600,
        }}>+ New Task</button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <select className="input" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
          style={{ width: 'auto', minWidth: 120 }}>
          <option value="">All Categories</option>
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <select className="input" value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)}
          style={{ width: 'auto', minWidth: 120 }}>
          <option value="">All Assignees</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </div>

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
                        {/* Priority + Category */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100,
                            background: catColor(task.category) + '18', color: catColor(task.category),
                            textTransform: 'uppercase', letterSpacing: '0.04em',
                          }}>{catLabel(task.category)}</span>
                          {task.priority > 0 && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: PRIORITY_LABELS[task.priority]?.color }}>
                              {PRIORITY_LABELS[task.priority]?.label}
                            </span>
                          )}
                        </div>
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
                                background: '#e8e8e8', display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>{task.assignee.name.split(' ').map(n => n[0]).join('')}</span>
                            )}
                            {task.dueDate && (
                              <span style={{
                                fontSize: 11, color: new Date(task.dueDate) < new Date() && task.status !== 'done' ? '#ef4444' : 'var(--text-muted)',
                                fontWeight: 600,
                              }}>
                                {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </span>
                            )}
                          </div>
                          {/* Status actions */}
                          <div style={{ display: 'flex', gap: 4 }}>
                            {col.key === 'todo' && (
                              <button onClick={() => updateStatus(task.id, 'in_progress')} style={{
                                fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
                                border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--text-secondary)',
                              }}>Start</button>
                            )}
                            {col.key === 'in_progress' && (
                              <button onClick={() => updateStatus(task.id, 'done')} style={{
                                fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
                                border: 'none', background: '#1a1a1a', color: '#dffd6e', cursor: 'pointer',
                              }}>Done</button>
                            )}
                            {col.key === 'done' && (
                              <button onClick={() => updateStatus(task.id, 'todo')} style={{
                                fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
                                border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--text-secondary)',
                              }}>Reopen</button>
                            )}
                            {isAdmin && (
                              <button onClick={() => deleteTask(task.id)} style={{
                                fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
                                border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: '#ef4444',
                              }}>X</button>
                            )}
                          </div>
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
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>New Task</h3>

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
                <label className="form-label">Category</label>
                <select className="input" value={newCategory} onChange={e => setNewCategory(e.target.value)}>
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
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

            <div className="form-row" style={{ marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <label className="form-label">Assignee</label>
                <select className="input" value={newAssignee} onChange={e => setNewAssignee(e.target.value)}>
                  <option value="">Unassigned</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label className="form-label">Due Date</label>
                <input className="input" type="date" value={newDueDate} onChange={e => setNewDueDate(e.target.value)} />
              </div>
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
