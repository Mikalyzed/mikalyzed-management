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

/* ── Active Job Card ── */
function ActiveCard({ job, onToggleTask, onComplete }: {
  job: ContentJob
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
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 100,
          background: '#3b82f618', color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.04em',
        }}>Active</span>
      </div>

      {/* Task count */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{doneCount}/{totalCount} tasks</span>
        {job.assignee && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{job.assignee.name}</span>}
      </div>

      {/* Progress bar */}
      <div style={{ height: 5, background: '#e2e5ea', borderRadius: 3, overflow: 'hidden', marginBottom: 14 }}>
        <div style={{
          height: '100%', borderRadius: 3, transition: 'width 0.3s',
          width: `${progress * 100}%`, background: allDone ? '#22c55e' : '#3b82f6',
        }} />
      </div>

      {/* Checklist */}
      {totalCount > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
          {job.checklist.map((task, i) => (
            <label key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
              padding: '6px 8px', borderRadius: 8, background: task.done ? '#f0fdf4' : '#f9fafb',
              border: `1px solid ${task.done ? '#22c55e20' : '#f0f0f0'}`,
            }}>
              <input
                type="checkbox" checked={task.done}
                onChange={() => onToggleTask(job.id, i)}
                style={{ width: 16, height: 16, accentColor: '#22c55e', cursor: 'pointer', flexShrink: 0 }}
              />
              <span style={{
                fontSize: 13, flex: 1,
                color: task.done ? '#22c55e' : 'var(--text-primary)',
                textDecoration: task.done ? 'line-through' : 'none',
                fontWeight: task.done ? 400 : 500,
              }}>{task.item}</span>
            </label>
          ))}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => onComplete(job.id)}
          disabled={!allDone}
          style={{
            padding: '9px 22px', borderRadius: 8, border: 'none',
            background: allDone ? '#22c55e' : '#e2e5ea',
            color: allDone ? '#fff' : '#999',
            fontSize: 13, fontWeight: 700,
            cursor: allDone ? 'pointer' : 'default',
          }}
        >Complete</button>
      </div>
    </div>
  )
}

/* ── Queue Card ── */
function QueueCard({ job, onStart }: { job: ContentJob; onStart: (id: string) => void }) {
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
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 100,
            background: '#94a3b818', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em',
          }}>Queued</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          {job.assignee && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{job.assignee.name}</span>}
          {!job.assignee && <span style={{ fontSize: 12, color: '#f59e0b', fontWeight: 600 }}>Unassigned</span>}
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{doneCount}/{job.checklist.length} tasks</span>
        </div>
      </div>
      <button
        onClick={() => onStart(job.id)}
        style={{
          marginTop: 14, padding: '9px 22px', borderRadius: 8, border: 'none',
          background: '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          alignSelf: 'flex-start',
        }}
      >Start</button>
    </div>
  )
}

export default function ContentBoard() {
  const [data, setData] = useState<BoardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAll, setShowAll] = useState(false)

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
    await fetch(`/api/stages/${jobId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'in_progress' }),
    })
    fetchData()
  }

  const completeStage = async (jobId: string) => {
    await fetch(`/api/stages/${jobId}/advance`, { method: 'POST' })
    fetchData()
  }

  if (loading) return <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>Loading...</p>
  if (!data) return <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>Failed to load.</p>

  const QUEUE_LIMIT = 6
  const visibleQueue = showAll ? data.queue : data.queue.slice(0, QUEUE_LIMIT)
  const hiddenCount = data.queue.length - QUEUE_LIMIT

  return (
    <div>
      {/* Header */}
      <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 20 }}>Content Board</h1>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 28, flexWrap: 'wrap' }}>
        <StatBox label="Total Vehicles" value={data.stats.total} />
        <StatBox label="In Progress" value={data.stats.inProgress} color="#3b82f6" />
        <StatBox label="Done Today" value={data.stats.completedToday} color="#22c55e" />
      </div>

      {/* Active Jobs */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ width: 4, height: 20, borderRadius: 2, background: '#3b82f6' }} />
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Active Jobs</h2>
          <span style={{
            fontSize: 12, fontWeight: 700, background: '#3b82f618', color: '#3b82f6',
            padding: '2px 10px', borderRadius: 100,
          }}>{data.today.filter(j => j.status === 'in_progress').length}</span>
        </div>
        {data.today.filter(j => j.status === 'in_progress').length === 0 ? (
          <div style={{ background: '#f9fafb', borderRadius: 12, padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
            No active content work. Start a vehicle from the queue below.
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {data.today.filter(j => j.status === 'in_progress').map(job => (
              <ActiveCard key={job.id} job={job} onToggleTask={toggleTask} onComplete={completeStage} />
            ))}
          </div>
        )}
      </div>

      {/* Queue */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ width: 4, height: 20, borderRadius: 2, background: '#94a3b8' }} />
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Queue</h2>
          <span style={{
            fontSize: 12, fontWeight: 700, background: '#94a3b818', color: '#94a3b8',
            padding: '2px 10px', borderRadius: 100,
          }}>{data.queue.length + data.today.filter(j => j.status === 'pending').length}</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {/* Pending from today section first */}
          {data.today.filter(j => j.status === 'pending').map(job => (
            <QueueCard key={job.id} job={job} onStart={startWorking} />
          ))}
          {visibleQueue.map(job => (
            <QueueCard key={job.id} job={job} onStart={startWorking} />
          ))}
        </div>
        {!showAll && hiddenCount > 0 && (
          <button
            onClick={() => setShowAll(true)}
            style={{
              width: '100%', marginTop: 14, padding: '14px 0', borderRadius: 12,
              background: '#f9fafb', border: '1px solid #e8e8e8', color: 'var(--text-secondary)',
              fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}
          >Show {hiddenCount} More</button>
        )}
      </div>

      {/* Completed Today */}
      {data.completedToday.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ width: 4, height: 20, borderRadius: 2, background: '#22c55e' }} />
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Completed Today</h2>
            <span style={{
              fontSize: 12, fontWeight: 700, background: '#22c55e18', color: '#22c55e',
              padding: '2px 10px', borderRadius: 100,
            }}>{data.completedToday.length}</span>
          </div>
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
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 100,
                      background: '#22c55e18', color: '#22c55e', textTransform: 'uppercase',
                    }}>Done</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
