'use client'

import { useEffect, useState, useCallback, useRef } from 'react'

type ChecklistItem = { item: string; done: boolean; note: string }
type Vehicle = { id: string; stockNumber: string; year: number | null; make: string; model: string; color: string | null }
type VehicleJob = {
  id: string; vehicleId: string; vehicle: Vehicle
  assignee: { id: string; name: string } | null
  status: string; checklist: ChecklistItem[]; priority: number
  scheduledDate: string | null; type: 'vehicle'
}
type ContentTask = {
  id: string; title: string; description: string | null
  assignee: { id: string; name: string } | null
  status: string; scheduledDate: string | null; type: 'task'
}
type BoardData = {
  today: VehicleJob[]; todayTasks: ContentTask[]
  queuedVehicles: VehicleJob[]; queuedTasks: ContentTask[]
  completedToday: VehicleJob[]; completedTasks: ContentTask[]
  stats: { total: number; todayCount: number; completedToday: number }
}

function StatBox({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: '14px 18px', border: '1px solid #e8e8e8', flex: '1 1 120px', minWidth: 100 }}>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0 }}>{label}</p>
      <p style={{ fontSize: 28, fontWeight: 800, margin: '4px 0 0', color: color || 'var(--text-primary)' }}>{value}</p>
    </div>
  )
}

function SectionHeader({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <div style={{ width: 4, height: 20, borderRadius: 2, background: color }} />
      <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>{label}</h2>
      <span style={{ fontSize: 12, fontWeight: 700, background: color + '18', color, padding: '2px 10px', borderRadius: 100 }}>{count}</span>
    </div>
  )
}

/* ── Active Vehicle Card (with checklist) ── */
function ActiveVehicleCard({ job, onToggleTask, onComplete, adminAction }: {
  job: VehicleJob; onToggleTask: (id: string, idx: number) => void; onComplete: (id: string) => void
  adminAction?: () => void
}) {
  const v = job.vehicle
  const doneCount = job.checklist.filter(c => c.done).length
  const totalCount = job.checklist.length
  const allDone = totalCount > 0 && doneCount === totalCount
  const progress = totalCount > 0 ? doneCount / totalCount : 0

  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: '18px 20px', border: '2px solid #3b82f6', flex: '1 1 340px', maxWidth: 420 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div>
          <p style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>#{v.stockNumber}</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '2px 0 0' }}>
            {`${v.year ?? ''} ${v.make} ${v.model}`.trim()}{v.color ? ` · ${v.color}` : ''}
          </p>
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 100, background: job.status === 'in_progress' ? '#3b82f618' : '#f59e0b18', color: job.status === 'in_progress' ? '#3b82f6' : '#f59e0b', textTransform: 'uppercase' }}>
          {job.status === 'in_progress' ? 'Active' : 'Scheduled'}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{doneCount}/{totalCount} tasks</span>
        {job.assignee && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{job.assignee.name}</span>}
      </div>
      <div style={{ height: 5, background: '#e2e5ea', borderRadius: 3, overflow: 'hidden', marginBottom: 14 }}>
        <div style={{ height: '100%', borderRadius: 3, transition: 'width 0.3s', width: `${progress * 100}%`, background: allDone ? '#22c55e' : '#3b82f6' }} />
      </div>
      {totalCount > 0 && job.status === 'in_progress' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
          {job.checklist.map((task, i) => (
            <label key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
              padding: '6px 8px', borderRadius: 8, background: task.done ? '#f0fdf4' : '#f9fafb',
              border: `1px solid ${task.done ? '#22c55e20' : '#f0f0f0'}`,
            }}>
              <input type="checkbox" checked={task.done} onChange={() => onToggleTask(job.id, i)}
                style={{ width: 16, height: 16, accentColor: '#22c55e', cursor: 'pointer', flexShrink: 0 }} />
              <span style={{ fontSize: 13, flex: 1, color: task.done ? '#22c55e' : 'var(--text-primary)', textDecoration: task.done ? 'line-through' : 'none', fontWeight: task.done ? 400 : 500 }}>{task.item}</span>
            </label>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {job.status === 'in_progress' && (
          <button onClick={() => onComplete(job.id)} disabled={!allDone} style={{
            padding: '9px 22px', borderRadius: 8, border: 'none',
            background: allDone ? '#22c55e' : '#e2e5ea', color: allDone ? '#fff' : '#999',
            fontSize: 13, fontWeight: 700, cursor: allDone ? 'pointer' : 'default',
          }}>Complete</button>
        )}
        {adminAction && (
          <button onClick={adminAction} style={{
            padding: '9px 16px', borderRadius: 8, border: '1px solid #fecaca',
            background: '#fff', color: '#ef4444', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>Remove from Today</button>
        )}
      </div>
    </div>
  )
}

/* ── Active Task Card ── */
function ActiveTaskCard({ task, onComplete, adminAction }: { task: ContentTask; onComplete: (id: string) => void; adminAction?: () => void }) {
  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: '18px 20px', border: '2px solid #8b5cf6', flex: '1 1 340px', maxWidth: 420 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <p style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>{task.title}</p>
          {task.description && <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>{task.description}</p>}
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 100, background: task.status === 'in_progress' ? '#8b5cf618' : '#f59e0b18', color: task.status === 'in_progress' ? '#8b5cf6' : '#f59e0b', textTransform: 'uppercase' }}>
          {task.status === 'in_progress' ? 'Active' : 'Scheduled'}
        </span>
      </div>
      {task.assignee && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 6px' }}>{task.assignee.name}</p>}

      {/* Default task */}
      <div style={{
        padding: '8px 10px', borderRadius: 8, background: task.status === 'in_progress' ? '#f9fafb' : '#faf5ff',
        border: '1px solid #f0f0f0', marginBottom: 12, fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round"><path d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9A2.25 2.25 0 0013.5 5.25h-9A2.25 2.25 0 002.25 7.5v9A2.25 2.25 0 004.5 18.75z" /></svg>
        Reel for social media
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {task.status === 'in_progress' && (
          <button onClick={() => onComplete(task.id)} style={{
            padding: '9px 22px', borderRadius: 8, border: 'none',
            background: '#22c55e', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}>Complete</button>
        )}
        {adminAction && (
          <button onClick={adminAction} style={{
            padding: '9px 16px', borderRadius: 8, border: '1px solid #fecaca',
            background: '#fff', color: '#ef4444', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>Remove from Today</button>
        )}
      </div>
    </div>
  )
}

/* ── Queue Vehicle Card ── */
function QueueVehicleCard({ job, onStart, isAdmin, onSchedule, index }: {
  job: VehicleJob; onStart: (id: string) => void; isAdmin: boolean
  onSchedule?: (id: string, type: 'vehicle') => void; index?: number
}) {
  const v = job.vehicle
  const doneCount = job.checklist.filter(c => c.done).length
  return (
    <div style={{
      background: '#fff', borderRadius: 12, padding: '14px 18px',
      border: '1px solid #e8e8e8', display: 'flex', alignItems: 'center', gap: 12,
    }}>
      {isAdmin && (
        <div style={{ cursor: 'grab', color: '#ccc', flexShrink: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>
        </div>
      )}
      {index !== undefined && (
        <span style={{ fontSize: 14, fontWeight: 800, color: '#d1d5db', minWidth: 20, textAlign: 'center', flexShrink: 0 }}>{index + 1}</span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>#{v.stockNumber} — {`${v.year ?? ''} ${v.make} ${v.model}`.trim()}</p>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>
          {job.assignee?.name || 'Unassigned'} · {doneCount}/{job.checklist.length} tasks
        </p>
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button onClick={() => onStart(job.id)} style={{
          padding: '7px 16px', borderRadius: 8, border: 'none',
          background: '#3b82f6', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
        }}>Start</button>
        {isAdmin && onSchedule && (
          <button onClick={() => onSchedule(job.id, 'vehicle')} style={{
            padding: '7px 12px', borderRadius: 8, border: '1px solid #e8e8e8',
            background: '#fff', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>Schedule</button>
        )}
      </div>
    </div>
  )
}

/* ── Queue Task Card ── */
function QueueTaskCard({ task, onStart, isAdmin, onSchedule, onDelete, index }: {
  task: ContentTask; onStart: (id: string) => void; isAdmin: boolean
  onSchedule?: (id: string, type: 'task') => void; onDelete?: (id: string) => void; index?: number
}) {
  return (
    <div style={{
      background: '#fff', borderRadius: 12, padding: '14px 18px',
      border: '1px solid #e8e8e8', display: 'flex', alignItems: 'center', gap: 12,
    }}>
      {isAdmin && (
        <div style={{ cursor: 'grab', color: '#ccc', flexShrink: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>
        </div>
      )}
      {index !== undefined && (
        <span style={{ fontSize: 14, fontWeight: 800, color: '#d1d5db', minWidth: 20, textAlign: 'center', flexShrink: 0 }}>{index + 1}</span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{task.title}</p>
          <span style={{ fontSize: 10, color: '#8b5cf6', fontWeight: 600, background: '#faf5ff', padding: '2px 8px', borderRadius: 6 }}>Reel</span>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>
          {task.assignee?.name || 'Unassigned'}
        </p>
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button onClick={() => onStart(task.id)} style={{
          padding: '7px 16px', borderRadius: 8, border: 'none',
          background: '#8b5cf6', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
        }}>Start</button>
        {isAdmin && onSchedule && (
          <button onClick={() => onSchedule(task.id, 'task')} style={{
            padding: '7px 12px', borderRadius: 8, border: '1px solid #e8e8e8',
            background: '#fff', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>Schedule</button>
        )}
        {isAdmin && onDelete && (
          <button onClick={() => { if (confirm('Remove this task?')) onDelete(task.id) }} style={{
            padding: '7px 10px', borderRadius: 8, border: '1px solid #fecaca',
            background: '#fff', color: '#ef4444', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        )}
      </div>
    </div>
  )
}

/* ── Schedule Modal ── */
function ScheduleModal({ onConfirm, onCancel }: {
  onConfirm: (date: string) => void; onCancel: () => void
}) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const [date, setDate] = useState(today)

  // Generate next 7 days as quick picks
  const days: { label: string; value: string }[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date()
    d.setDate(d.getDate() + i)
    const val = d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York' })
    days.push({ label, value: val })
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onCancel}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '24px', width: '100%', maxWidth: 360 }}
        onClick={e => e.stopPropagation()}>
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px' }}>Schedule for</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {days.map(d => (
            <button key={d.value} onClick={() => setDate(d.value)} style={{
              padding: '8px 14px', borderRadius: 8, border: `1px solid ${date === d.value ? '#3b82f6' : '#e8e8e8'}`,
              background: date === d.value ? '#3b82f618' : '#fff',
              color: date === d.value ? '#3b82f6' : 'var(--text-secondary)',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>{d.label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => onConfirm(date)} style={{
            flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
            background: '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}>Confirm</button>
          <button onClick={onCancel} style={{
            padding: '10px 20px', borderRadius: 10, border: '1px solid #e8e8e8',
            background: '#fff', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

/* ── Add Task Modal ── */
function AddTaskModal({ users, onConfirm, onCancel }: {
  users: { id: string; name: string }[]
  onConfirm: (title: string, assigneeId: string | null) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const [assigneeId, setAssigneeId] = useState('')

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onCancel}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 400 }}
        onClick={e => e.stopPropagation()}>
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px' }}>Add Content Task</h3>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Title</label>
          <input
            value={title} onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Plymouth Roadrunner Reel"
            autoFocus
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e5ea',
              fontSize: 14, outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Assign to</label>
          <select
            value={assigneeId} onChange={e => setAssigneeId(e.target.value)}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e5ea',
              fontSize: 14, outline: 'none', background: '#fff', boxSizing: 'border-box',
            }}
          >
            <option value="">Unassigned</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => title.trim() && onConfirm(title.trim(), assigneeId || null)}
            disabled={!title.trim()}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
              background: title.trim() ? '#8b5cf6' : '#e2e5ea',
              color: title.trim() ? '#fff' : '#999',
              fontSize: 13, fontWeight: 700, cursor: title.trim() ? 'pointer' : 'default',
            }}
          >Add Task</button>
          <button onClick={onCancel} style={{
            padding: '10px 20px', borderRadius: 10, border: '1px solid #e8e8e8',
            background: '#fff', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

export default function ContentBoard() {
  const [data, setData] = useState<BoardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAllVehicles, setShowAllVehicles] = useState(false)
  const [showAllTasks, setShowAllTasks] = useState(false)
  const [userRole, setUserRole] = useState('')
  const [scheduling, setScheduling] = useState<{ id: string; type: 'vehicle' | 'task' } | null>(null)
  const [showAddTask, setShowAddTask] = useState(false)
  const [users, setUsers] = useState<{ id: string; name: string }[]>([])
  const dragItem = useRef<number | null>(null)
  const dragOver = useRef<number | null>(null)

  const isAdmin = userRole === 'admin'

  const fetchData = useCallback(() => {
    fetch('/api/content-board').then(r => r.json()).then(d => { setData(d); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchData()
    fetch('/api/auth/me').then(r => r.json()).then(d => { if (d.user) setUserRole(d.user.role) }).catch(() => {})
    fetch('/api/users').then(r => r.json()).then(d => { if (Array.isArray(d.users || d)) setUsers(d.users || d) }).catch(() => {})
  }, [fetchData])

  const toggleTask = async (jobId: string, taskIdx: number) => {
    if (!data) return
    const updateJobs = (jobs: VehicleJob[]) => jobs.map(j => {
      if (j.id !== jobId) return j
      const updated = [...j.checklist]
      updated[taskIdx] = { ...updated[taskIdx], done: !updated[taskIdx].done }
      return { ...j, checklist: updated }
    })
    setData({ ...data, today: updateJobs(data.today), queuedVehicles: updateJobs(data.queuedVehicles) })
    const job = [...data.today, ...data.queuedVehicles].find(j => j.id === jobId)
    if (!job) return
    const updated = [...job.checklist]
    updated[taskIdx] = { ...updated[taskIdx], done: !updated[taskIdx].done }
    await fetch(`/api/stages/${jobId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ checklist: updated }) })
  }

  const startVehicle = async (id: string) => {
    await fetch(`/api/stages/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'in_progress' }) })
    fetchData()
  }

  const completeVehicle = async (id: string) => {
    await fetch(`/api/stages/${id}/advance`, { method: 'POST' })
    fetchData()
  }

  const startTask = async (id: string) => {
    await fetch(`/api/board-tasks/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'in_progress' }) })
    fetchData()
  }

  const completeTask = async (id: string) => {
    await fetch(`/api/board-tasks/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'done' }) })
    fetchData()
  }

  const openSchedule = (id: string, type: 'vehicle' | 'task') => setScheduling({ id, type })

  const confirmSchedule = async (date: string) => {
    if (!scheduling) return
    await fetch('/api/content-board/schedule', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ id: scheduling.id, type: scheduling.type, date }] }),
    })
    setScheduling(null)
    fetchData()
  }

  const unschedule = async (id: string, type: 'vehicle' | 'task') => {
    await fetch('/api/content-board/schedule', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ id, type, date: null }] }),
    })
    fetchData()
  }

  const reorderVehicles = async (fromIdx: number, toIdx: number) => {
    if (!data) return
    const reordered = [...data.queuedVehicles]
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)
    setData({ ...data, queuedVehicles: reordered })
    await fetch('/api/stages/reorder', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: 'content', orderedIds: reordered.map(v => v.vehicleId) }),
    })
  }

  const reorderTasks = async (fromIdx: number, toIdx: number) => {
    if (!data) return
    const reordered = [...data.queuedTasks]
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)
    setData({ ...data, queuedTasks: reordered })
    await fetch('/api/board-tasks/reorder', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds: reordered.map(t => t.id) }),
    })
  }

  const deleteTask = async (id: string) => {
    await fetch(`/api/board-tasks/${id}`, { method: 'DELETE' })
    fetchData()
  }

  const createTask = async (title: string, assigneeId: string | null) => {
    await fetch('/api/board-tasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, category: 'content', assigneeId }),
    })
    setShowAddTask(false)
    fetchData()
  }

  if (loading) return <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>Loading...</p>
  if (!data) return <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>Failed to load.</p>

  const LIMIT = 6
  const visibleVehicles = showAllVehicles ? data.queuedVehicles : data.queuedVehicles.slice(0, LIMIT)
  const hiddenVehicles = data.queuedVehicles.length - LIMIT
  const visibleTasks = showAllTasks ? data.queuedTasks : data.queuedTasks.slice(0, LIMIT)
  const hiddenTasks = data.queuedTasks.length - LIMIT

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 20 }}>Content Board</h1>

      <div style={{ display: 'flex', gap: 10, marginBottom: 28, flexWrap: 'wrap' }}>
        <StatBox label="Total" value={data.stats.total} />
        <StatBox label="Today" value={data.stats.todayCount} color="#3b82f6" />
        <StatBox label="Done Today" value={data.stats.completedToday} color="#22c55e" />
      </div>

      {/* Today */}
      <div style={{ marginBottom: 32 }}>
        <SectionHeader label="Today" count={data.today.length + data.todayTasks.length} color="#3b82f6" />
        {data.today.length === 0 && data.todayTasks.length === 0 ? (
          <div style={{ background: '#f9fafb', borderRadius: 12, padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
            Nothing scheduled for today{isAdmin ? '. Use the Schedule button on queue items to plan the day.' : '.'}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {data.today.map(job => (
              <ActiveVehicleCard key={job.id} job={job} onToggleTask={toggleTask} onComplete={completeVehicle}
                adminAction={isAdmin && job.status !== 'in_progress' ? () => unschedule(job.id, 'vehicle') : undefined} />
            ))}
            {data.todayTasks.map(task => (
              <ActiveTaskCard key={task.id} task={task} onComplete={completeTask}
                adminAction={isAdmin && task.status !== 'in_progress' ? () => unschedule(task.id, 'task') : undefined} />
            ))}
          </div>
        )}
      </div>

      {/* Queue: Recon Vehicles */}
      <div style={{ marginBottom: 28 }}>
        <SectionHeader label="Recon Vehicles" count={data.queuedVehicles.length} color="#94a3b8" />
        {data.queuedVehicles.length === 0 ? (
          <div style={{ background: '#f9fafb', borderRadius: 12, padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No recon vehicles waiting</div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {visibleVehicles.map((job, idx) => (
                <div key={job.id}
                  draggable={isAdmin}
                  onDragStart={() => { dragItem.current = idx }}
                  onDragEnter={() => { dragOver.current = idx }}
                  onDragEnd={() => { if (dragItem.current !== null && dragOver.current !== null && dragItem.current !== dragOver.current) reorderVehicles(dragItem.current, dragOver.current); dragItem.current = null; dragOver.current = null }}
                  onDragOver={e => e.preventDefault()}
                  style={{ cursor: isAdmin ? 'grab' : 'default' }}
                >
                  <QueueVehicleCard job={job} onStart={startVehicle} isAdmin={isAdmin} onSchedule={openSchedule} index={idx} />
                </div>
              ))}
            </div>
            {!showAllVehicles && hiddenVehicles > 0 && (
              <button onClick={() => setShowAllVehicles(true)} style={{
                width: '100%', marginTop: 14, padding: '14px 0', borderRadius: 12,
                background: '#f9fafb', border: '1px solid #e8e8e8', color: 'var(--text-secondary)',
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}>Show {hiddenVehicles} More</button>
            )}
          </>
        )}
      </div>

      {/* Queue: Content to Create */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 4, height: 20, borderRadius: 2, background: '#8b5cf6' }} />
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Content to Create</h2>
            <span style={{ fontSize: 12, fontWeight: 700, background: '#8b5cf618', color: '#8b5cf6', padding: '2px 10px', borderRadius: 100 }}>{data.queuedTasks.length}</span>
          </div>
          {isAdmin && (
            <button onClick={() => setShowAddTask(true)} style={{
              padding: '7px 16px', borderRadius: 8, border: 'none',
              background: '#8b5cf6', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              Add Task
            </button>
          )}
        </div>
        {data.queuedTasks.length === 0 ? (
          <div style={{ background: '#f9fafb', borderRadius: 12, padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No content tasks queued</div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {visibleTasks.map((task, idx) => (
                <div key={task.id}
                  draggable={isAdmin}
                  onDragStart={() => { dragItem.current = idx }}
                  onDragEnter={() => { dragOver.current = idx }}
                  onDragEnd={() => { if (dragItem.current !== null && dragOver.current !== null && dragItem.current !== dragOver.current) reorderTasks(dragItem.current, dragOver.current); dragItem.current = null; dragOver.current = null }}
                  onDragOver={e => e.preventDefault()}
                  style={{ cursor: isAdmin ? 'grab' : 'default' }}
                >
                  <QueueTaskCard task={task} onStart={startTask} isAdmin={isAdmin} onSchedule={openSchedule} onDelete={deleteTask} index={idx} />
                </div>
              ))}
            </div>
            {!showAllTasks && hiddenTasks > 0 && (
              <button onClick={() => setShowAllTasks(true)} style={{
                width: '100%', marginTop: 14, padding: '14px 0', borderRadius: 12,
                background: '#f9fafb', border: '1px solid #e8e8e8', color: 'var(--text-secondary)',
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}>Show {hiddenTasks} More</button>
            )}
          </>
        )}
      </div>

      {/* Completed Today */}
      {(data.completedToday.length > 0 || data.completedTasks.length > 0) && (
        <div>
          <SectionHeader label="Completed Today" count={data.completedToday.length + data.completedTasks.length} color="#22c55e" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {data.completedToday.map(job => {
              const v = job.vehicle
              return (
                <div key={job.id} style={{ background: '#f0fdf4', borderRadius: 14, padding: '16px 20px', border: '1px solid #22c55e30', flex: '1 1 280px', maxWidth: 420 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <p style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>#{v.stockNumber}</p>
                      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '2px 0 0' }}>{`${v.year ?? ''} ${v.make} ${v.model}`.trim()}{job.assignee ? ` · ${job.assignee.name}` : ''}</p>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 100, background: '#22c55e18', color: '#22c55e', textTransform: 'uppercase' }}>Done</span>
                  </div>
                </div>
              )
            })}
            {data.completedTasks.map(task => (
              <div key={task.id} style={{ background: '#f0fdf4', borderRadius: 14, padding: '16px 20px', border: '1px solid #22c55e30', flex: '1 1 280px', maxWidth: 420 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>{task.title}</p>
                    {task.assignee && <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '2px 0 0' }}>{task.assignee.name}</p>}
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 100, background: '#22c55e18', color: '#22c55e', textTransform: 'uppercase' }}>Done</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Task Modal */}
      {showAddTask && <AddTaskModal users={users} onConfirm={createTask} onCancel={() => setShowAddTask(false)} />}

      {/* Schedule Modal */}
      {scheduling && <ScheduleModal onConfirm={confirmSchedule} onCancel={() => setScheduling(null)} />}
    </div>
  )
}
