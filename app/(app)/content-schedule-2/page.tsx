'use client'

import { useEffect, useState, useCallback } from 'react'

type ChecklistItem = { item: string; done: boolean; note: string }
type Vehicle = { id: string; stockNumber: string; year: number | null; make: string; model: string; color: string | null }
type ContentJob = {
  id: string; vehicleId: string; vehicle: Vehicle
  assignee: { id: string; name: string } | null
  status: string; checklist: ChecklistItem[]; priority: number
}
type BoardData = {
  today: ContentJob[]; queue: ContentJob[]; completedToday: ContentJob[]
  stats: { total: number; inProgress: number; completedToday: number }
}

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 100,
      background: color + '18', color, textTransform: 'uppercase', letterSpacing: '0.04em',
    }}>
      {text}
    </span>
  )
}

function TaskProgress({ checklist }: { checklist: ChecklistItem[] }) {
  const done = checklist.filter(c => c.done).length
  const total = checklist.length
  if (total === 0) return <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No tasks</span>
  const pct = (done / total) * 100
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{done}/{total} tasks</span>
        {done === total && <Badge text="Ready" color="#22c55e" />}
      </div>
      <div style={{ height: 4, background: '#e2e5ea', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 2, transition: 'width 0.3s',
          width: `${pct}%`,
          background: done === total ? '#22c55e' : pct > 50 ? '#f59e0b' : '#3b82f6',
        }} />
      </div>
    </div>
  )
}

function ContentCard({ job, onToggleTask, onMarkInProgress }: {
  job: ContentJob
  onToggleTask: (jobId: string, taskIdx: number) => void
  onMarkInProgress: (jobId: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const v = job.vehicle
  const desc = `${v.year ?? ''} ${v.make} ${v.model}`.trim()
  const isInProgress = job.status === 'in_progress'

  return (
    <div style={{
      background: '#fff', borderRadius: 14, padding: '16px 20px',
      border: `1px solid ${isInProgress ? '#f59e0b' : '#e8e8e8'}`,
      borderLeft: `4px solid ${isInProgress ? '#f59e0b' : '#e2e5ea'}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ cursor: 'pointer', flex: 1 }} onClick={() => setExpanded(!expanded)}>
          <p style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{desc}</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>
            #{v.stockNumber}{v.color ? ` · ${v.color}` : ''}
          </p>
          {job.assignee && (
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0' }}>{job.assignee.name}</p>
          )}
          {!job.assignee && (
            <p style={{ fontSize: 12, color: '#f59e0b', fontWeight: 600, margin: '4px 0 0' }}>Unassigned</p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
          {isInProgress && <Badge text="In Progress" color="#f59e0b" />}
          {!isInProgress && <Badge text="Queued" color="#94a3b8" />}
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <TaskProgress checklist={job.checklist} />
      </div>

      {/* Expanded: show checklist + actions */}
      {expanded && (
        <div style={{ marginTop: 12, borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
          {job.checklist.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {job.checklist.map((task, i) => (
                <label key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                  fontSize: 13, color: task.done ? 'var(--text-muted)' : 'var(--text-primary)',
                  textDecoration: task.done ? 'line-through' : 'none',
                }}>
                  <input
                    type="checkbox"
                    checked={task.done}
                    onChange={() => onToggleTask(job.id, i)}
                    style={{ width: 16, height: 16, accentColor: '#22c55e', cursor: 'pointer' }}
                  />
                  {task.item}
                </label>
              ))}
            </div>
          )}

          {!isInProgress && (
            <button
              onClick={() => onMarkInProgress(job.id)}
              style={{
                marginTop: 12, width: '100%', padding: '10px 0', borderRadius: 10,
                background: '#f59e0b', border: 'none', color: '#fff',
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}
            >
              Mark In Progress
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function CompletedCard({ job }: { job: ContentJob }) {
  const v = job.vehicle
  const desc = `${v.year ?? ''} ${v.make} ${v.model}`.trim()
  const done = job.checklist.filter(c => c.done).length

  return (
    <div style={{
      background: '#f0fdf4', borderRadius: 12, padding: '12px 16px',
      border: '1px solid #22c55e30', borderLeft: '4px solid #22c55e',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{desc}</p>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>
            #{v.stockNumber} · {done}/{job.checklist.length} tasks
            {job.assignee ? ` · ${job.assignee.name}` : ''}
          </p>
        </div>
        <Badge text="Done" color="#22c55e" />
      </div>
    </div>
  )
}

export default function ContentSchedule2() {
  const [data, setData] = useState<BoardData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(() => {
    fetch('/api/content-board')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const toggleTask = async (jobId: string, taskIdx: number) => {
    if (!data) return
    // Optimistic update
    const updateJobs = (jobs: ContentJob[]) => jobs.map(j => {
      if (j.id !== jobId) return j
      const updated = [...j.checklist]
      updated[taskIdx] = { ...updated[taskIdx], done: !updated[taskIdx].done }
      return { ...j, checklist: updated }
    })
    setData({ ...data, today: updateJobs(data.today), queue: updateJobs(data.queue) })

    // Save to server
    const job = [...data.today, ...data.queue].find(j => j.id === jobId)
    if (!job) return
    const updated = [...job.checklist]
    updated[taskIdx] = { ...updated[taskIdx], done: !updated[taskIdx].done }
    await fetch(`/api/stages/${jobId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checklist: updated }),
    })
  }

  const markInProgress = async (jobId: string) => {
    await fetch(`/api/stages/${jobId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'in_progress' }),
    })
    fetchData()
  }

  if (loading) return <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>Loading...</p>
  if (!data) return <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>Failed to load.</p>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>Content Schedule</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{
            background: '#fff', borderRadius: 10, padding: '8px 14px', border: '1px solid #e8e8e8',
            fontSize: 13, fontWeight: 600,
          }}>
            <span style={{ color: 'var(--text-muted)' }}>Total </span>
            <span style={{ fontWeight: 800 }}>{data.stats.total}</span>
          </div>
          <div style={{
            background: '#fff', borderRadius: 10, padding: '8px 14px', border: '1px solid #e8e8e8',
            fontSize: 13, fontWeight: 600,
          }}>
            <span style={{ color: 'var(--text-muted)' }}>In Progress </span>
            <span style={{ fontWeight: 800, color: '#f59e0b' }}>{data.stats.inProgress}</span>
          </div>
          <div style={{
            background: '#fff', borderRadius: 10, padding: '8px 14px', border: '1px solid #e8e8e8',
            fontSize: 13, fontWeight: 600,
          }}>
            <span style={{ color: 'var(--text-muted)' }}>Done Today </span>
            <span style={{ fontWeight: 800, color: '#22c55e' }}>{data.stats.completedToday}</span>
          </div>
        </div>
      </div>

      {/* Today's Work */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Today</h2>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{data.today.length} vehicles</span>
        </div>
        {data.today.length === 0 ? (
          <div style={{ background: '#f9fafb', borderRadius: 12, padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
            No content work scheduled for today
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.today.map(job => (
              <ContentCard key={job.id} job={job} onToggleTask={toggleTask} onMarkInProgress={markInProgress} />
            ))}
          </div>
        )}
      </div>

      {/* Queue */}
      {data.queue.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Queue</h2>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{data.queue.length} vehicles</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.queue.map((job, i) => (
              <div key={job.id} style={{
                background: '#f9fafb', borderRadius: 12, padding: '14px 18px',
                border: '1px solid #e8e8e8', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>#{i + 1}</span>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>
                      {`${job.vehicle.year ?? ''} ${job.vehicle.make} ${job.vehicle.model}`.trim()}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                    #{job.vehicle.stockNumber}{job.assignee ? ` · ${job.assignee.name}` : ''}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {job.checklist.filter(c => c.done).length}/{job.checklist.length} tasks
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Completed Today */}
      {data.completedToday.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Completed Today</h2>
            <span style={{ fontSize: 12, color: '#22c55e', fontWeight: 700 }}>{data.completedToday.length}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.completedToday.map(job => (
              <CompletedCard key={job.id} job={job} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
