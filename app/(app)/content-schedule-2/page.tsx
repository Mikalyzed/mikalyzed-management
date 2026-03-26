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

function ActiveCard({ job, onToggleTask, onComplete, onStart, acting }: {
  job: ContentJob
  onToggleTask: (jobId: string, taskIdx: number) => void
  onComplete: (jobId: string) => void
  onStart: (jobId: string) => void
  acting: boolean
}) {
  const v = job.vehicle
  const desc = `${v.year ?? ''} ${v.make} ${v.model}`.trim()
  const isInProgress = job.status === 'in_progress'
  const doneCount = job.checklist.filter(c => c.done).length
  const totalCount = job.checklist.length
  const allDone = totalCount > 0 && doneCount === totalCount
  const progress = totalCount > 0 ? doneCount / totalCount : 0

  const statusColor = isInProgress ? '#f59e0b' : '#94a3b8'

  return (
    <div style={{
      background: '#fff', borderRadius: 14, padding: '18px 20px',
      border: `1px solid ${isInProgress ? '#f59e0b40' : '#e8e8e8'}`,
      borderTop: `3px solid ${statusColor}`,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <p style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{desc}</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>
            #{v.stockNumber}{v.color ? ` · ${v.color}` : ''}
          </p>
          <p style={{ fontSize: 12, color: job.assignee ? 'var(--text-secondary)' : '#f59e0b', fontWeight: job.assignee ? 400 : 600, margin: '4px 0 0' }}>
            {job.assignee?.name || 'Unassigned'}
          </p>
        </div>
        <Badge text={isInProgress ? 'In Progress' : 'Up Next'} color={statusColor} />
      </div>

      {/* Progress bar */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>{doneCount}/{totalCount} tasks</span>
          {allDone && <Badge text="All Complete" color="#22c55e" />}
        </div>
        <div style={{ height: 5, background: '#e2e5ea', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 3, transition: 'width 0.3s',
            width: `${progress * 100}%`,
            background: allDone ? '#22c55e' : progress > 0.5 ? '#f59e0b' : '#3b82f6',
          }} />
        </div>
      </div>

      {/* Checklist */}
      {totalCount > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
          {job.checklist.map((task, i) => (
            <label key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
              padding: '6px 8px', borderRadius: 8, background: task.done ? '#f0fdf4' : '#f9fafb',
              border: `1px solid ${task.done ? '#22c55e20' : '#f0f0f0'}`,
              transition: 'background 0.15s',
            }}>
              <input
                type="checkbox"
                checked={task.done}
                onChange={() => onToggleTask(job.id, i)}
                style={{ width: 16, height: 16, accentColor: '#22c55e', cursor: 'pointer', flexShrink: 0 }}
              />
              <span style={{
                fontSize: 13, flex: 1,
                color: task.done ? '#22c55e' : 'var(--text-primary)',
                textDecoration: task.done ? 'line-through' : 'none',
                fontWeight: task.done ? 400 : 500,
              }}>
                {task.item}
              </span>
            </label>
          ))}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        {!isInProgress && (
          <button
            onClick={() => onStart(job.id)}
            disabled={acting}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 10,
              background: '#f59e0b', border: 'none', color: '#fff',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              opacity: acting ? 0.6 : 1,
            }}
          >
            Start Working
          </button>
        )}
        {isInProgress && (
          <button
            onClick={() => onComplete(job.id)}
            disabled={acting || !allDone}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 10,
              background: allDone ? '#22c55e' : '#e2e5ea',
              border: 'none', color: allDone ? '#fff' : '#999',
              fontSize: 13, fontWeight: 700,
              cursor: allDone ? 'pointer' : 'default',
              opacity: acting ? 0.6 : 1,
            }}
          >
            {allDone ? 'Complete Stage' : 'Complete All Tasks First'}
          </button>
        )}
      </div>
    </div>
  )
}

export default function ContentBoard() {
  const [data, setData] = useState<BoardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)

  const fetchData = useCallback(() => {
    fetch('/api/content-board')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const toggleTask = async (jobId: string, taskIdx: number) => {
    if (!data) return
    const updateJobs = (jobs: ContentJob[]) => jobs.map(j => {
      if (j.id !== jobId) return j
      const updated = [...j.checklist]
      updated[taskIdx] = { ...updated[taskIdx], done: !updated[taskIdx].done }
      return { ...j, checklist: updated }
    })
    setData({ ...data, today: updateJobs(data.today), queue: updateJobs(data.queue) })

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

  const startWorking = async (jobId: string) => {
    setActing(true)
    await fetch(`/api/stages/${jobId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'in_progress' }),
    })
    fetchData()
    setActing(false)
  }

  const completeStage = async (jobId: string) => {
    setActing(true)
    await fetch(`/api/stages/${jobId}/advance`, { method: 'POST' })
    fetchData()
    setActing(false)
  }

  if (loading) return <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>Loading...</p>
  if (!data) return <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>Failed to load.</p>

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>Content Board</h1>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        <StatBox label="Total Vehicles" value={data.stats.total} />
        <StatBox label="In Progress" value={data.stats.inProgress} color="#f59e0b" />
        <StatBox label="Done Today" value={data.stats.completedToday} color="#22c55e" />
      </div>

      {/* Active Jobs */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Active Jobs</h2>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{data.today.length} vehicles</span>
        </div>
        {data.today.length === 0 ? (
          <div style={{ background: '#f9fafb', borderRadius: 12, padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
            No active content work. Start a vehicle from the queue below.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {data.today.map(job => (
              <ActiveCard
                key={job.id}
                job={job}
                onToggleTask={toggleTask}
                onComplete={completeStage}
                onStart={startWorking}
                acting={acting}
              />
            ))}
          </div>
        )}
      </div>

      {/* Queue */}
      {data.queue.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Queue</h2>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{data.queue.length} waiting</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.queue.map((job, i) => {
              const v = job.vehicle
              const desc = `${v.year ?? ''} ${v.make} ${v.model}`.trim()
              const doneCount = job.checklist.filter(c => c.done).length
              return (
                <div key={job.id} style={{
                  background: '#fff', borderRadius: 12, padding: '14px 18px',
                  border: '1px solid #e8e8e8', display: 'flex', alignItems: 'center', gap: 14,
                }}>
                  <span style={{
                    fontSize: 13, fontWeight: 800, color: '#d1d5db',
                    minWidth: 24, textAlign: 'center',
                  }}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{desc}</p>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                      #{v.stockNumber}{job.assignee ? ` · ${job.assignee.name}` : ''}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
                      {doneCount}/{job.checklist.length}
                    </span>
                  </div>
                </div>
              )
            })}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.completedToday.map(job => {
              const v = job.vehicle
              const desc = `${v.year ?? ''} ${v.make} ${v.model}`.trim()
              return (
                <div key={job.id} style={{
                  background: '#f0fdf4', borderRadius: 12, padding: '12px 18px',
                  border: '1px solid #22c55e20', borderLeft: '4px solid #22c55e',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{desc}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                      #{v.stockNumber}{job.assignee ? ` · ${job.assignee.name}` : ''}
                    </p>
                  </div>
                  <Badge text="Done" color="#22c55e" />
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
