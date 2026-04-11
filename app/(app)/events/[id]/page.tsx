'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { EVENT_TYPE_LABELS, EVENT_STATUS_LABELS, SUGGESTED_SECTIONS } from '@/lib/events'

type Task = {
  id: string
  title: string
  status: string
  priority: string
  dueDate: string | null
  notes: string | null
  assignee: { id: string; name: string; role: string } | null
  completedAt: string | null
  sortOrder: number
}

type Section = {
  id: string
  name: string
  sortOrder: number
  progress: number
  totalTasks: number
  completedTasks: number
  tasks: Task[]
}

type EventDetail = {
  id: string
  name: string
  type: string
  date: string
  endDate: string | null
  location: string | null
  description: string | null
  status: string
  owner: { id: string; name: string; role: string }
  createdBy: { id: string; name: string }
  sections: Section[]
  progress: number
  totalTasks: number
  completedTasks: number
}

export default function EventDetailPage() {
  const router = useRouter()
  const params = useParams()
  const eventId = params.id as string
  const [event, setEvent] = useState<EventDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<{ id: string; name: string }[]>([])
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())
  const [newTaskInputs, setNewTaskInputs] = useState<Record<string, string>>({})
  const [newTaskAssignees, setNewTaskAssignees] = useState<Record<string, string>>({})
  const [addingSectionName, setAddingSectionName] = useState('')
  const [showAddSection, setShowAddSection] = useState(false)
  const [personFilter, setPersonFilter] = useState('')
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editAssignee, setEditAssignee] = useState('')
  const [editDue, setEditDue] = useState('')
  const [editPriority, setEditPriority] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  const loadEvent = useCallback(() => {
    fetch(`/api/events/${eventId}`).then(r => r.json()).then(d => { setEvent(d); setLoading(false) })
  }, [eventId])

  useEffect(() => { loadEvent() }, [loadEvent])
  useEffect(() => {
    fetch('/api/users').then(r => r.json()).then(d => setUsers((d.users || d).filter((x: { isActive: boolean }) => x.isActive)))
  }, [])

  function toggleCollapse(sectionId: string) {
    setCollapsedSections(prev => {
      const next = new Set(prev)
      next.has(sectionId) ? next.delete(sectionId) : next.add(sectionId)
      return next
    })
  }

  async function toggleTask(taskId: string, currentStatus: string) {
    const newStatus = currentStatus === 'completed' ? 'pending' : 'completed'
    await fetch(`/api/events/${eventId}/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    loadEvent()
  }

  async function addTask(sectionId: string) {
    const title = newTaskInputs[sectionId]?.trim()
    if (!title) return
    await fetch(`/api/events/${eventId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sectionId,
        title,
        assigneeId: newTaskAssignees[sectionId] || null,
      }),
    })
    setNewTaskInputs(prev => ({ ...prev, [sectionId]: '' }))
    setNewTaskAssignees(prev => ({ ...prev, [sectionId]: '' }))
    loadEvent()
  }

  async function deleteTask(taskId: string) {
    if (!confirm('Delete this task?')) return
    await fetch(`/api/events/${eventId}/tasks/${taskId}`, { method: 'DELETE' })
    loadEvent()
  }

  async function addSection() {
    const name = addingSectionName.trim()
    if (!name) return
    await fetch(`/api/events/${eventId}/sections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    setAddingSectionName('')
    setShowAddSection(false)
    loadEvent()
  }

  async function deleteSection(sectionId: string) {
    if (!confirm('Delete this section and all its tasks?')) return
    await fetch(`/api/events/${eventId}/sections/${sectionId}`, { method: 'DELETE' })
    loadEvent()
  }

  function openEditTask(task: Task) {
    setEditingTask(task)
    setEditTitle(task.title)
    setEditNotes(task.notes || '')
    setEditAssignee(task.assignee?.id || '')
    setEditDue(task.dueDate ? task.dueDate.slice(0, 10) : '')
    setEditPriority(task.priority)
  }

  async function saveEditTask() {
    if (!editingTask) return
    setEditSaving(true)
    await fetch(`/api/events/${eventId}/tasks/${editingTask.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: editTitle.trim(),
        notes: editNotes.trim() || null,
        assigneeId: editAssignee || null,
        dueDate: editDue || null,
        priority: editPriority,
      }),
    })
    setEditSaving(false)
    setEditingTask(null)
    loadEvent()
  }

  async function updateEventStatus(status: string) {
    await fetch(`/api/events/${eventId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    loadEvent()
  }

  async function handleDelete() {
    if (!confirm('Delete this event and all sections/tasks?')) return
    const res = await fetch(`/api/events/${eventId}`, { method: 'DELETE' })
    if (res.ok) router.push('/events')
  }

  if (loading) return <p style={{ color: 'var(--text-muted)', padding: 40, textAlign: 'center' }}>Loading...</p>
  if (!event) return <p style={{ color: 'var(--text-muted)', padding: 40, textAlign: 'center' }}>Not found</p>

  const date = new Date(event.date)
  const isDone = event.status === 'completed' || event.status === 'cancelled'

  // Get all unique assignees for filter
  const allAssignees = new Map<string, string>()
  event.sections.forEach(s => s.tasks.forEach(t => {
    if (t.assignee) allAssignees.set(t.assignee.id, t.assignee.name)
  }))

  return (
    <div>
      {/* Back */}
      <Link href="/events" style={{ fontSize: 14, color: 'var(--text-muted)', textDecoration: 'none', fontWeight: 500, display: 'inline-block', marginBottom: 20, minHeight: 'auto' }}>
        ← Back to Events
      </Link>

      {/* Hero card */}
      <div className="card" style={{ padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 8 }}>{event.name}</h1>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 13, color: 'var(--text-muted)' }}>
              <span>{date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</span>
              {event.location && <span>· {event.location}</span>}
              <span>· {EVENT_TYPE_LABELS[event.type as keyof typeof EVENT_TYPE_LABELS] || event.type}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className={`badge badge-${event.status === 'active' ? 'in-progress' : event.status === 'completed' ? 'done' : event.status === 'cancelled' ? 'blocked' : 'pending'}`}>
              {EVENT_STATUS_LABELS[event.status as keyof typeof EVENT_STATUS_LABELS] || event.status}
            </span>
            <Link href={`/events/${eventId}/edit`} className="btn btn-secondary" style={{ padding: '6px 14px', fontSize: 13, minHeight: 34 }}>Edit</Link>
          </div>
        </div>

        {event.description && (
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: 16 }}>{event.description}</p>
        )}

        {/* Progress */}
        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
              Owner: {event.owner.name}
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: event.progress === 100 ? '#16a34a' : 'var(--text-primary)' }}>
              {event.progress}% · {event.completedTasks}/{event.totalTasks} tasks
            </span>
          </div>
          <div style={{ height: 8, background: '#f0f0ec', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{
              width: `${event.progress}%`,
              height: '100%',
              background: event.progress === 100 ? '#22c55e' : '#1a1a1a',
              borderRadius: 4,
              transition: 'width 0.3s ease',
            }} />
          </div>
        </div>

        {/* Status actions */}
        <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          {event.status === 'draft' && (
            <button className="btn btn-primary" onClick={() => updateEventStatus('planned')} style={{ fontSize: 13, padding: '8px 16px', minHeight: 36 }}>
              Publish Event
            </button>
          )}
          {event.status === 'planned' && (
            <button className="btn btn-primary" onClick={() => updateEventStatus('active')} style={{ fontSize: 13, padding: '8px 16px', minHeight: 36 }}>
              Mark Active
            </button>
          )}
          {event.status === 'active' && (
            <button className="btn btn-success" onClick={() => updateEventStatus('completed')} style={{ fontSize: 13, padding: '8px 16px', minHeight: 36 }}>
              Complete Event
            </button>
          )}
          {!isDone && (
            <button className="btn btn-danger" onClick={() => updateEventStatus('cancelled')} style={{ fontSize: 13, padding: '8px 16px', minHeight: 36 }}>
              Cancel
            </button>
          )}
          {(event.status === 'cancelled' || event.status === 'completed') && (
            <button className="btn btn-secondary" onClick={() => updateEventStatus('planned')} style={{ fontSize: 13, padding: '8px 16px', minHeight: 36 }}>
              Reopen
            </button>
          )}
          <button className="btn btn-secondary" onClick={handleDelete} style={{ fontSize: 13, padding: '8px 16px', minHeight: 36, marginLeft: 'auto', color: 'var(--danger)' }}>
            Delete Event
          </button>
        </div>
      </div>

      {/* Person filter */}
      {allAssignees.size > 0 && (
        <div style={{ marginBottom: 16 }}>
          <select value={personFilter} onChange={e => setPersonFilter(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13, background: '#fff', minHeight: 36 }}>
            <option value="">All People</option>
            {Array.from(allAssignees).map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {event.sections.map(section => {
          const isCollapsed = collapsedSections.has(section.id)
          const filteredTasks = personFilter
            ? section.tasks.filter(t => t.assignee?.id === personFilter)
            : section.tasks
          const dimSection = personFilter && filteredTasks.length === 0

          return (
            <div key={section.id} className="card" style={{
              padding: 0,
              overflow: 'hidden',
              opacity: dimSection ? 0.4 : 1,
              transition: 'opacity 0.2s',
            }}>
              {/* Section header */}
              <div
                onClick={() => toggleCollapse(section.id)}
                style={{
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  background: section.progress === 100 ? 'rgba(34, 197, 94, 0.04)' : 'transparent',
                  borderBottom: isCollapsed ? 'none' : '1px solid var(--border-light)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', transition: 'transform 0.2s', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>
                    ▼
                  </span>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{section.name}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', background: '#f0f0ec', padding: '2px 8px', borderRadius: 6 }}>
                    {section.completedTasks}/{section.totalTasks}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {/* Mini progress bar */}
                  <div style={{ width: 60, height: 4, background: '#f0f0ec', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ width: `${section.progress}%`, height: '100%', background: section.progress === 100 ? '#22c55e' : '#1a1a1a', borderRadius: 2 }} />
                  </div>
                  {!isDone && (
                    <button onClick={(e) => { e.stopPropagation(); deleteSection(section.id) }}
                      style={{ fontSize: 14, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', minHeight: 'auto', padding: 4 }}>
                      ×
                    </button>
                  )}
                </div>
              </div>

              {/* Tasks */}
              {!isCollapsed && (
                <div style={{ padding: '4px 0' }}>
                  {filteredTasks.map(task => {
                    const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'completed'
                    const dimTask = personFilter && task.assignee?.id !== personFilter
                    return (
                      <div key={task.id} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '12px 20px',
                        borderLeft: isOverdue ? '3px solid #ef4444' : '3px solid transparent',
                        opacity: dimTask ? 0.3 : 1,
                        transition: 'opacity 0.2s',
                      }}>
                        {/* Checkbox */}
                        <button
                          onClick={() => toggleTask(task.id, task.status)}
                          disabled={isDone}
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 6,
                            border: `2px solid ${task.status === 'completed' ? '#22c55e' : '#d4d4d4'}`,
                            background: task.status === 'completed' ? '#22c55e' : 'transparent',
                            cursor: isDone ? 'default' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            minHeight: 'auto',
                            padding: 0,
                          }}
                        >
                          {task.status === 'completed' && (
                            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                              <path d="M20 6 9 17l-5-5" />
                            </svg>
                          )}
                        </button>

                        {/* Task content — click to edit */}
                        <div onClick={() => openEditTask(task)} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
                          <div style={{
                            fontSize: 14,
                            fontWeight: 500,
                            textDecoration: task.status === 'completed' ? 'line-through' : 'none',
                            color: task.status === 'completed' ? 'var(--text-muted)' : 'var(--text-primary)',
                          }}>
                            {task.title}
                          </div>
                          {task.notes && (
                            <div style={{ fontSize: 11, color: '#2563eb', marginTop: 2 }}>
                              Note: {task.notes.length > 40 ? task.notes.slice(0, 40) + '...' : task.notes}
                            </div>
                          )}
                          {task.dueDate && (
                            <div style={{ fontSize: 11, color: isOverdue ? '#ef4444' : 'var(--text-muted)', marginTop: 2 }}>
                              Due {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              {isOverdue && ' — Overdue'}
                            </div>
                          )}
                        </div>

                        {/* Priority badge */}
                        {task.priority !== 'normal' && (
                          <span style={{
                            fontSize: 10,
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            color: task.priority === 'urgent' ? '#ef4444' : task.priority === 'high' ? '#f59e0b' : 'var(--text-muted)',
                          }}>
                            {task.priority}
                          </span>
                        )}

                        {/* Assignee */}
                        <div style={{
                          fontSize: 12,
                          fontWeight: 500,
                          color: task.assignee ? 'var(--text-secondary)' : '#ef4444',
                          whiteSpace: 'nowrap',
                        }}>
                          {task.assignee ? task.assignee.name : 'No owner'}
                        </div>

                        {/* Delete */}
                        {!isDone && (
                          <button onClick={() => deleteTask(task.id)}
                            style={{ fontSize: 16, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', minHeight: 'auto', padding: '0 4px' }}>
                            ×
                          </button>
                        )}
                      </div>
                    )
                  })}

                  {/* Add task inline */}
                  {!isDone && (
                    <div style={{ display: 'flex', gap: 8, padding: '8px 20px 12px', alignItems: 'center' }}>
                      <input
                        value={newTaskInputs[section.id] || ''}
                        onChange={e => setNewTaskInputs(prev => ({ ...prev, [section.id]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') addTask(section.id) }}
                        placeholder="Add a task..."
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          border: '1px solid var(--border-light)',
                          borderRadius: 8,
                          fontSize: 13,
                          outline: 'none',
                          background: 'var(--bg-primary)',
                          minHeight: 36,
                        }}
                      />
                      <select
                        value={newTaskAssignees[section.id] || ''}
                        onChange={e => setNewTaskAssignees(prev => ({ ...prev, [section.id]: e.target.value }))}
                        style={{
                          padding: '8px 8px',
                          border: '1px solid var(--border-light)',
                          borderRadius: 8,
                          fontSize: 12,
                          background: 'var(--bg-primary)',
                          minHeight: 36,
                          maxWidth: 120,
                        }}
                      >
                        <option value="">Assign</option>
                        {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                      <button onClick={() => addTask(section.id)}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 8,
                          border: '1px solid var(--border)',
                          background: '#fff',
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: 'pointer',
                          minHeight: 36,
                        }}>
                        Add
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Add section */}
      {!isDone && (
        <div style={{ marginTop: 16 }}>
          {showAddSection ? (
            <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {SUGGESTED_SECTIONS.filter(s => !event.sections.find(sec => sec.name === s)).map(s => (
                  <button key={s} onClick={() => { setAddingSectionName(s) }}
                    style={{
                      padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                      border: `1px solid ${addingSectionName === s ? '#1a1a1a' : 'var(--border)'}`,
                      background: addingSectionName === s ? '#1a1a1a' : '#fff',
                      color: addingSectionName === s ? '#dffd6e' : 'var(--text-secondary)',
                      cursor: 'pointer', minHeight: 'auto',
                    }}>
                    {s}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="input" value={addingSectionName} onChange={e => setAddingSectionName(e.target.value)}
                  placeholder="Section name" style={{ flex: 1 }}
                  onKeyDown={e => { if (e.key === 'Enter') addSection() }} />
                <button className="btn btn-primary" onClick={addSection} style={{ padding: '8px 16px', minHeight: 36 }}>Add</button>
                <button className="btn btn-secondary" onClick={() => { setShowAddSection(false); setAddingSectionName('') }}
                  style={{ padding: '8px 16px', minHeight: 36 }}>Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowAddSection(true)}
              style={{
                width: '100%',
                padding: 14,
                borderRadius: 12,
                border: '2px dashed var(--border)',
                background: 'transparent',
                color: 'var(--text-muted)',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                minHeight: 48,
              }}>
              + Add Section
            </button>
          )}
        </div>
      )}
      {/* Edit Task Modal */}
      {editingTask && (
        <div onClick={() => setEditingTask(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: 16, width: '100%', maxWidth: 480,
            padding: 24, boxShadow: '0 -4px 30px rgba(0,0,0,0.15)',
          }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 16 }}>Edit Task</h3>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Title</label>
              <input value={editTitle} onChange={e => setEditTitle(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14 }} />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Notes</label>
              <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={3}
                placeholder="Add notes about this task..."
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, resize: 'vertical', fontFamily: 'inherit' }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Assigned To</label>
                <select value={editAssignee} onChange={e => setEditAssignee(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}>
                  <option value="">Unassigned</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Due Date</label>
                <input type="date" value={editDue} onChange={e => setEditDue(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }} />
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Priority</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {['normal', 'high', 'urgent'].map(p => (
                  <button key={p} onClick={() => setEditPriority(p)} style={{
                    padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    border: `1px solid ${editPriority === p ? (p === 'urgent' ? '#ef4444' : p === 'high' ? '#f59e0b' : '#1a1a1a') : 'var(--border)'}`,
                    background: editPriority === p ? (p === 'urgent' ? '#fef2f2' : p === 'high' ? '#fefce8' : '#f5f5f3') : '#fff',
                    color: editPriority === p ? (p === 'urgent' ? '#ef4444' : p === 'high' ? '#f59e0b' : 'var(--text-primary)') : 'var(--text-muted)',
                    textTransform: 'capitalize',
                  }}>{p}</button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setEditingTask(null)} style={{
                flex: 1, padding: '10px 0', borderRadius: 10, border: '1px solid var(--border)',
                background: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}>Cancel</button>
              <button onClick={saveEditTask} disabled={editSaving || !editTitle.trim()} style={{
                flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
                background: '#1a1a1a', color: '#dffd6e', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                opacity: editSaving || !editTitle.trim() ? 0.5 : 1,
              }}>{editSaving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
