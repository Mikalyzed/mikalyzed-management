'use client'

import { useEffect, useState, useCallback } from 'react'

type ChecklistItem = { item: string; done: boolean; note: string }
type Vehicle = { id: string; stockNumber: string; year: number | null; make: string; model: string; color: string | null }
type VehicleJob = {
  id: string; vehicleId: string; vehicle: Vehicle
  assignee: { id: string; name: string } | null
  status: string; checklist: ChecklistItem[]; priority: number; type: 'vehicle'
}
type ContentTask = {
  id: string; title: string; description: string | null
  assignee: { id: string; name: string } | null
  status: string; type: 'task'
}
type BoardData = {
  active: VehicleJob[]; activeTasks: ContentTask[]
  queuedVehicles: VehicleJob[]; queuedTasks: ContentTask[]
  completedToday: VehicleJob[]; completedTasks: ContentTask[]
  stats: { total: number; inProgress: number; completedToday: number }
}

function StatBox({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 12, padding: '14px 18px', border: '1px solid #e8e8e8',
      flex: '1 1 120px', minWidth: 100,
    }}>
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
      <span style={{
        fontSize: 12, fontWeight: 700, background: color + '18', color,
        padding: '2px 10px', borderRadius: 100,
      }}>{count}</span>
    </div>
  )
}

/* ── Active Vehicle Card ── */
function ActiveVehicleCard({ job, onToggleTask, onComplete }: {
  job: VehicleJob
  onToggleTask: (jobId: string, taskIdx: number) => void
  onComplete: (jobId: string) => void
}) {
  const v = job.vehicle
  const doneCount = job.checklist.filter(c => c.done).length
  const totalCount = job.checklist.length
  const allDone = totalCount > 0 && doneCount === totalCount
  const progress = totalCount > 0 ? doneCount / totalCount : 0

  return (
    <div style={{
      background: '#fff', borderRadius: 14, padding: '18px 20px',
      border: '2px solid #3b82f6', flex: '1 1 340px', maxWidth: 420,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div>
          <p style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>#{v.stockNumber}</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '2px 0 0' }}>
            {`${v.year ?? ''} ${v.make} ${v.model}`.trim()}{v.color ? ` · ${v.color}` : ''}
          </p>
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 100, background: '#3b82f618', color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Active</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{doneCount}/{totalCount} tasks</span>
        {job.assignee && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{job.assignee.name}</span>}
      </div>

      <div style={{ height: 5, background: '#e2e5ea', borderRadius: 3, overflow: 'hidden', marginBottom: 14 }}>
        <div style={{ height: '100%', borderRadius: 3, transition: 'width 0.3s', width: `${progress * 100}%`, background: allDone ? '#22c55e' : '#3b82f6' }} />
      </div>

      {totalCount > 0 && (
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

      <button onClick={() => onComplete(job.id)} disabled={!allDone} style={{
        padding: '9px 22px', borderRadius: 8, border: 'none',
        background: allDone ? '#22c55e' : '#e2e5ea', color: allDone ? '#fff' : '#999',
        fontSize: 13, fontWeight: 700, cursor: allDone ? 'pointer' : 'default',
      }}>Complete</button>
    </div>
  )
}

/* ── Active Task Card ── */
function ActiveTaskCard({ task, onComplete }: { task: ContentTask; onComplete: (id: string) => void }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 14, padding: '18px 20px',
      border: '2px solid #8b5cf6', flex: '1 1 340px', maxWidth: 420,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <p style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>{task.title}</p>
          {task.description && <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>{task.description}</p>}
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 100, background: '#8b5cf618', color: '#8b5cf6', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Active</span>
      </div>
      {task.assignee && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 10px' }}>{task.assignee.name}</p>}
      <button onClick={() => onComplete(task.id)} style={{
        padding: '9px 22px', borderRadius: 8, border: 'none',
        background: '#22c55e', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
      }}>Complete</button>
    </div>
  )
}

/* ── Queue Vehicle Card ── */
function QueueVehicleCard({ job, onStart }: { job: VehicleJob; onStart: (id: string) => void }) {
  const v = job.vehicle
  const doneCount = job.checklist.filter(c => c.done).length
  return (
    <div style={{
      background: '#fff', borderRadius: 14, padding: '18px 20px',
      border: '1px solid #e8e8e8', flex: '1 1 280px', maxWidth: 420,
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
    }}>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
          <div>
            <p style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>#{v.stockNumber}</p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '2px 0 0' }}>
              {`${v.year ?? ''} ${v.make} ${v.model}`.trim()}{v.color ? ` · ${v.color}` : ''}
            </p>
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 100, background: '#94a3b818', color: '#94a3b8', textTransform: 'uppercase' }}>Queued</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <span style={{ fontSize: 12, color: job.assignee ? 'var(--text-muted)' : '#f59e0b', fontWeight: job.assignee ? 400 : 600 }}>{job.assignee?.name || 'Unassigned'}</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{doneCount}/{job.checklist.length} tasks</span>
        </div>
      </div>
      <button onClick={() => onStart(job.id)} style={{
        marginTop: 14, padding: '9px 22px', borderRadius: 8, border: 'none',
        background: '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', alignSelf: 'flex-start',
      }}>Start</button>
    </div>
  )
}

/* ── Queue Task Card ── */
function QueueTaskCard({ task, onStart }: { task: ContentTask; onStart: (id: string) => void }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 14, padding: '18px 20px',
      border: '1px solid #e8e8e8', flex: '1 1 280px', maxWidth: 420,
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
    }}>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
          <p style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>{task.title}</p>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 100, background: '#94a3b818', color: '#94a3b8', textTransform: 'uppercase' }}>Queued</span>
        </div>
        {task.description && <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>{task.description}</p>}
        <span style={{ fontSize: 12, color: task.assignee ? 'var(--text-muted)' : '#f59e0b', fontWeight: task.assignee ? 400 : 600, display: 'block', marginTop: 8 }}>{task.assignee?.name || 'Unassigned'}</span>
      </div>
      <button onClick={() => onStart(task.id)} style={{
        marginTop: 14, padding: '9px 22px', borderRadius: 8, border: 'none',
        background: '#8b5cf6', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', alignSelf: 'flex-start',
      }}>Start</button>
    </div>
  )
}

export default function ContentBoard() {
  const [data, setData] = useState<BoardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAllVehicles, setShowAllVehicles] = useState(false)
  const [showAllTasks, setShowAllTasks] = useState(false)

  const fetchData = useCallback(() => {
    fetch('/api/content-board')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const toggleTask = async (jobId: string, taskIdx: number) => {
    if (!data) return
    const updateJobs = (jobs: VehicleJob[]) => jobs.map(j => {
      if (j.id !== jobId) return j
      const updated = [...j.checklist]
      updated[taskIdx] = { ...updated[taskIdx], done: !updated[taskIdx].done }
      return { ...j, checklist: updated }
    })
    setData({ ...data, active: updateJobs(data.active), queuedVehicles: updateJobs(data.queuedVehicles) })

    const job = [...data.active, ...data.queuedVehicles].find(j => j.id === jobId)
    if (!job) return
    const updated = [...job.checklist]
    updated[taskIdx] = { ...updated[taskIdx], done: !updated[taskIdx].done }
    await fetch(`/api/stages/${jobId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checklist: updated }),
    })
  }

  const startVehicle = async (jobId: string) => {
    await fetch(`/api/stages/${jobId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'in_progress' }),
    })
    fetchData()
  }

  const completeVehicle = async (jobId: string) => {
    await fetch(`/api/stages/${jobId}/advance`, { method: 'POST' })
    fetchData()
  }

  const startTask = async (taskId: string) => {
    await fetch(`/api/board-tasks/${taskId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'in_progress' }),
    })
    fetchData()
  }

  const completeTask = async (taskId: string) => {
    await fetch(`/api/board-tasks/${taskId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'done' }),
    })
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

      {/* Stats */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 28, flexWrap: 'wrap' }}>
        <StatBox label="Total" value={data.stats.total} />
        <StatBox label="In Progress" value={data.stats.inProgress} color="#3b82f6" />
        <StatBox label="Done Today" value={data.stats.completedToday} color="#22c55e" />
      </div>

      {/* Active Jobs */}
      <div style={{ marginBottom: 32 }}>
        <SectionHeader label="Active Jobs" count={data.active.length + data.activeTasks.length} color="#3b82f6" />
        {data.active.length === 0 && data.activeTasks.length === 0 ? (
          <div style={{ background: '#f9fafb', borderRadius: 12, padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
            No active content work. Start a vehicle or task from the queue below.
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {data.active.map(job => (
              <ActiveVehicleCard key={job.id} job={job} onToggleTask={toggleTask} onComplete={completeVehicle} />
            ))}
            {data.activeTasks.map(task => (
              <ActiveTaskCard key={task.id} task={task} onComplete={completeTask} />
            ))}
          </div>
        )}
      </div>

      {/* Queue: Recon Vehicles */}
      <div style={{ marginBottom: 28 }}>
        <SectionHeader label="Recon Vehicles" count={data.queuedVehicles.length} color="#94a3b8" />
        {data.queuedVehicles.length === 0 ? (
          <div style={{ background: '#f9fafb', borderRadius: 12, padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            No recon vehicles waiting for content
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {visibleVehicles.map(job => <QueueVehicleCard key={job.id} job={job} onStart={startVehicle} />)}
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
        <SectionHeader label="Content to Create" count={data.queuedTasks.length} color="#8b5cf6" />
        {data.queuedTasks.length === 0 ? (
          <div style={{ background: '#f9fafb', borderRadius: 12, padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            No content tasks queued
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {visibleTasks.map(task => <QueueTaskCard key={task.id} task={task} onStart={startTask} />)}
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
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {data.completedToday.map(job => {
              const v = job.vehicle
              return (
                <div key={job.id} style={{
                  background: '#f0fdf4', borderRadius: 14, padding: '16px 20px',
                  border: '1px solid #22c55e30', flex: '1 1 280px', maxWidth: 420,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <p style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>#{v.stockNumber}</p>
                      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                        {`${v.year ?? ''} ${v.make} ${v.model}`.trim()}{job.assignee ? ` · ${job.assignee.name}` : ''}
                      </p>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 100, background: '#22c55e18', color: '#22c55e', textTransform: 'uppercase' }}>Done</span>
                  </div>
                </div>
              )
            })}
            {data.completedTasks.map(task => (
              <div key={task.id} style={{
                background: '#f0fdf4', borderRadius: 14, padding: '16px 20px',
                border: '1px solid #22c55e30', flex: '1 1 280px', maxWidth: 420,
              }}>
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
    </div>
  )
}
