'use client'

import { useEffect, useState, useCallback, useRef } from 'react'

type PlanEntry = {
  vehicleStageId: string
  vehicleId: string
  stockNumber: string
  year: number | null
  make: string
  model: string
  color: string | null
  day: string
  estimatedHours: number
  assigneeName: string | null
  // Live status overlay
  liveStatus: string
  elapsedSeconds: number
  timerRunning: boolean
  completedAt: string | null
  awaitingParts: boolean
  awaitingPartsName: string | null
  autoPaused?: boolean
  pauseReason?: string | null
  checklist: { item: string; done: boolean; note: string }[]
}

type PlanData = {
  exists: boolean
  weekStart: string
  createdAt?: string
  entries: PlanEntry[]
}

function formatHours(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function getOutcome(entry: PlanEntry): { label: string; color: string; bg: string; border: string } {
  const est = entry.estimatedHours * 3600
  const isOver = entry.elapsedSeconds > est && entry.liveStatus !== 'done'

  if (entry.liveStatus === 'done') {
    const wasOver = entry.elapsedSeconds > est
    return wasOver
      ? { label: 'Completed (Over)', color: '#ea580c', bg: '#fff7ed', border: '#fdba74' }
      : { label: 'Completed', color: '#16a34a', bg: '#f0fdf4', border: '#86efac' }
  }
  if (entry.liveStatus === 'unknown') return { label: 'Removed', color: '#94a3b8', bg: '#f8fafc', border: '#e2e8f0' }
  if (entry.awaitingParts) return { label: 'Awaiting Parts', color: '#a16207', bg: '#fefce8', border: '#fde68a' }
  if (isOver) return { label: 'Overdue', color: '#dc2626', bg: '#fef2f2', border: '#fca5a5' }
  if (entry.timerRunning) return { label: 'In Progress', color: '#2563eb', bg: '#eff6ff', border: '#93c5fd' }
  if (entry.liveStatus === 'in_progress') return { label: 'Paused', color: '#d97706', bg: '#fff7ed', border: '#fcd34d' }
  if (entry.liveStatus === 'pending') return { label: 'Queued', color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' }
  return { label: entry.liveStatus, color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' }
}

function PlanCard({ entry }: { entry: PlanEntry }) {
  const outcome = getOutcome(entry)
  const est = entry.estimatedHours
  const elapsed = entry.elapsedSeconds
  const progress = Math.min(elapsed / (est * 3600), 1)
  const desc = `${entry.year ?? ''} ${entry.make} ${entry.model}`.trim()
  const doneTaskCount = entry.checklist.filter(c => c.done).length
  const totalTasks = entry.checklist.length

  return (
    <div style={{
      background: outcome.bg,
      border: `1px solid ${outcome.border}`,
      borderLeft: `4px solid ${outcome.color}`,
      borderRadius: 12, padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 700 }}>#{entry.stockNumber}</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {desc}{entry.color ? ` · ${entry.color}` : ''}
          </p>
          {entry.assigneeName && (
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{entry.assigneeName}</p>
          )}
          {entry.awaitingParts && entry.awaitingPartsName && (
            <p style={{ fontSize: 11, fontWeight: 600, color: '#a16207', marginTop: 4 }}>
              Parts: {entry.awaitingPartsName}
            </p>
          )}
        </div>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 100,
          background: outcome.color + '15', color: outcome.color,
          textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          {outcome.label}
        </span>
      </div>

      <div style={{ marginTop: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {totalTasks > 0 ? `${doneTaskCount}/${totalTasks} tasks` : 'No tasks'}
          </span>
          <span style={{ fontSize: 11, fontWeight: 600, color: outcome.color }}>
            {formatHours(elapsed)} / {est}h est.
          </span>
        </div>
        <div style={{ height: 4, background: '#e2e5ea', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 2, transition: 'width 0.3s',
            width: `${Math.min(progress * 100, 100)}%`,
            background: entry.liveStatus === 'done' ? '#22c55e' : outcome.color,
          }} />
        </div>
      </div>

      {entry.completedAt && (
        <p style={{ fontSize: 11, color: '#16a34a', fontWeight: 600, marginTop: 6 }}>
          Completed {new Date(entry.completedAt).toLocaleDateString('en-US', { weekday: 'short' })}{' '}
          {new Date(entry.completedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
        </p>
      )}
    </div>
  )
}

export default function PlanView() {
  const [data, setData] = useState<PlanData | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const tickRef = useRef(0)
  const [, setTick] = useState(0)

  const fetchPlan = useCallback(() => {
    fetch('/api/weekly-plan')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { fetchPlan() }, [fetchPlan])

  // Live timer tick for active vehicles
  useEffect(() => {
    const interval = setInterval(() => {
      tickRef.current++
      setTick(t => t + 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Refresh data every 30s to get updated live statuses
  useEffect(() => {
    const interval = setInterval(fetchPlan, 30000)
    return () => clearInterval(interval)
  }, [fetchPlan])

  const generatePlan = async () => {
    setGenerating(true)
    try {
      const res = await fetch('/api/weekly-plan', { method: 'POST' })
      if (res.ok) {
        fetchPlan()
      } else {
        const err = await res.json()
        alert(err.error || 'Failed to generate plan')
      }
    } catch { /* ignore */ }
    setGenerating(false)
  }

  const regeneratePlan = async () => {
    if (!confirm('This will delete the current plan and create a new one based on the current queue. Continue?')) return
    setGenerating(true)
    try {
      await fetch('/api/weekly-plan', { method: 'DELETE' })
      await fetch('/api/weekly-plan', { method: 'POST' })
      fetchPlan()
    } catch { /* ignore */ }
    setGenerating(false)
  }

  if (loading) return <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>Loading plan...</p>

  // No plan exists yet — show generate button
  if (!data?.exists) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
        <p style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>No Weekly Plan Yet</p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, maxWidth: 360, margin: '0 auto 20px' }}>
          Generate a plan to snapshot the current schedule. This freezes the plan so you can track what was planned vs what actually happened.
        </p>
        <button
          onClick={generatePlan}
          disabled={generating}
          style={{
            padding: '12px 28px', borderRadius: 12, border: 'none',
            background: generating ? '#e2e5ea' : '#4f46e5', color: '#fff',
            fontSize: 14, fontWeight: 700, cursor: generating ? 'default' : 'pointer',
          }}
        >
          {generating ? 'Generating...' : 'Generate Weekly Plan'}
        </button>
      </div>
    )
  }

  const entries = data.entries || []
  const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
  const todayDayName = new Date().toLocaleDateString('en-US', { weekday: 'long' })

  // Group entries by day
  const byDay: Record<string, PlanEntry[]> = {}
  for (const d of [...DAY_NAMES, 'Awaiting Parts', 'Overflow']) byDay[d] = []
  for (const e of entries) {
    if (byDay[e.day]) byDay[e.day].push(e)
  }

  // Totals
  const workEntries = entries.filter(e => e.day !== 'Awaiting Parts' && e.day !== 'Overflow')
  const totalPlanned = workEntries.length
  const totalCompleted = workEntries.filter(e => e.liveStatus === 'done').length
  const totalEstHours = workEntries.reduce((s, e) => s + e.estimatedHours, 0)
  const totalWorkedSeconds = workEntries.reduce((s, e) => s + e.elapsedSeconds, 0)

  return (
    <div>
      {/* Header with regenerate */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Plan created {data.createdAt ? new Date(data.createdAt).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}
          </p>
        </div>
        <button
          onClick={regeneratePlan}
          disabled={generating}
          style={{
            padding: '6px 14px', borderRadius: 8, border: '1px solid #e2e5ea',
            background: '#f9fafb', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            color: 'var(--text-secondary)',
          }}
        >
          {generating ? 'Regenerating...' : 'Regenerate Plan'}
        </button>
      </div>

      {/* Summary cards */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
        gap: 10, marginBottom: 24,
      }}>
        <SummaryCard label="Planned" value={`${totalPlanned}`} sub="vehicles" color="#6366f1" />
        <SummaryCard label="Completed" value={`${totalCompleted}`} sub={`of ${totalPlanned}`} color="#22c55e" />
        <SummaryCard label="Estimated" value={`${totalEstHours}h`} sub="total hours" color="#8b5cf6" />
        <SummaryCard label="Worked" value={formatHours(totalWorkedSeconds)} sub="actual time" color="#3b82f6" />
        <SummaryCard
          label="Completion"
          value={totalPlanned > 0 ? `${Math.round((totalCompleted / totalPlanned) * 100)}%` : '—'}
          sub="of plan done"
          color={totalPlanned > 0 && totalCompleted / totalPlanned >= 0.8 ? '#22c55e' : '#f59e0b'}
        />
      </div>

      {/* Days */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {DAY_NAMES.map(day => {
          const jobs = byDay[day]
          if (jobs.length === 0) return (
            <div key={day}>
              <DayHeader day={day} todayDayName={todayDayName} jobs={jobs} />
              <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: '12px 0' }}>No vehicles planned</p>
            </div>
          )

          return (
            <div key={day}>
              <DayHeader day={day} todayDayName={todayDayName} jobs={jobs} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {jobs.map(entry => <PlanCard key={entry.vehicleStageId} entry={entry} />)}
              </div>
            </div>
          )
        })}

        {/* Awaiting Parts */}
        {byDay['Awaiting Parts'].length > 0 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ width: 4, height: 20, borderRadius: 2, background: '#eab308' }} />
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-muted)' }}>Awaiting Parts</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{byDay['Awaiting Parts'].length} vehicles</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {byDay['Awaiting Parts'].map(entry => <PlanCard key={entry.vehicleStageId} entry={entry} />)}
            </div>
          </div>
        )}

        {/* Overflow */}
        {byDay['Overflow'].length > 0 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ width: 4, height: 20, borderRadius: 2, background: '#ef4444' }} />
              <span style={{ fontSize: 15, fontWeight: 700, color: '#ef4444' }}>Beyond This Week</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{byDay['Overflow'].length} vehicles</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {byDay['Overflow'].map(entry => <PlanCard key={entry.vehicleStageId} entry={entry} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function DayHeader({ day, todayDayName, jobs }: { day: string; todayDayName: string; jobs: PlanEntry[] }) {
  const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
  const isPast = DAY_NAMES.indexOf(day) < DAY_NAMES.indexOf(todayDayName)
  const isToday = day === todayDayName
  const doneCount = jobs.filter(j => j.liveStatus === 'done').length
  const totalEst = jobs.reduce((s, j) => s + j.estimatedHours, 0)
  const totalWorked = jobs.reduce((s, j) => s + j.elapsedSeconds, 0)

  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      marginBottom: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 4, height: 20, borderRadius: 2,
          background: isToday ? '#4f46e5' : isPast && doneCount === jobs.length && jobs.length > 0 ? '#22c55e' : isPast ? '#94a3b8' : '#d1d5db',
        }} />
        <span style={{ fontSize: 15, fontWeight: 700 }}>{day}</span>
        {isToday && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100,
            background: '#4f46e518', color: '#4f46e5', textTransform: 'uppercase',
          }}>Today</span>
        )}
        {isPast && jobs.length > 0 && doneCount === jobs.length && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100,
            background: '#22c55e18', color: '#22c55e', textTransform: 'uppercase',
          }}>All Done</span>
        )}
      </div>
      {jobs.length > 0 && (
        <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-muted)' }}>
          <span style={{ fontWeight: 600 }}>{doneCount}/{jobs.length} done</span>
          <span>{totalEst}h est.</span>
          <span>{formatHours(totalWorked)} worked</span>
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div style={{
      background: color + '08', border: `1px solid ${color}30`,
      borderRadius: 12, padding: '14px 16px',
    }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 700, color }}>{value}</p>
      <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sub}</p>
    </div>
  )
}
