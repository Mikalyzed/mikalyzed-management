'use client'

import { useEffect, useState, useCallback, useRef } from 'react'

type ChecklistItem = { item: string; done: boolean; note: string }

type JobCard = {
  id: string
  vehicle: { id: string; stockNumber: string; year: number | null; make: string; model: string; color: string | null }
  assignee: { id: string; name: string } | null
  status: string
  estimatedHours: number | null
  checklist: ChecklistItem[]
  priority: number
  elapsedSeconds: number
  timerRunning: boolean
  timerStartedAt: string | null
  autoPaused: boolean
  pauseReason: string | null
  pauseDetail: string | null
  awaitingParts: boolean
  awaitingPartsName: string | null
  completedAt: string | null
  startedAt: string | null
}

type DayBucket = { day: string; jobs: JobCard[] }

type BoardData = {
  active: JobCard[]; paused: JobCard[]; queued: JobCard[]; completedToday: JobCard[]
  today: JobCard[]; remainingDays: DayBucket[]
  weeklyEstimatedHours: number; weeklyWorkedHours: number; hoursLeftToday: number
  isWorkHours: boolean
}

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 100,
      background: color + '18', color,
      textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap',
    }}>
      {text}
    </span>
  )
}

function formatHours(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function getStatusInfo(job: JobCard, elapsed: number): { badges: { text: string; color: string }[]; cardBg: string; borderColor: string } {
  const est = (job.estimatedHours || 2) * 3600
  const isOver = elapsed > est && job.status !== 'done'
  const isActive = job.timerRunning
  const isPaused = !job.timerRunning && job.status === 'in_progress' && !job.awaitingParts && !job.autoPaused
  const isAutoPaused = job.autoPaused
  const isAwaiting = job.awaitingParts
  const isDone = job.status === 'done'

  const badges: { text: string; color: string }[] = []

  if (isDone) {
    badges.push({ text: 'Completed', color: '#22c55e' })
    return { badges, cardBg: '#f0fdf4', borderColor: '#22c55e' }
  }

  if (isOver) badges.push({ text: 'Overdue', color: '#ef4444' })

  if (isAwaiting) {
    badges.push({ text: 'Awaiting Parts', color: '#eab308' })
    return { badges, cardBg: isOver ? '#fef2f2' : '#fefce8', borderColor: isOver ? '#ef4444' : '#eab308' }
  }
  if (isAutoPaused) {
    badges.push({ text: 'Auto Paused', color: '#f59e0b' })
    return { badges, cardBg: isOver ? '#fef2f2' : '#fff7ed', borderColor: isOver ? '#ef4444' : '#f59e0b' }
  }
  if (isPaused) {
    badges.push({ text: 'Paused', color: '#f59e0b' })
    return { badges, cardBg: isOver ? '#fef2f2' : '#fff7ed', borderColor: isOver ? '#ef4444' : '#f59e0b' }
  }
  if (isActive) {
    if (!isOver) badges.push({ text: 'Active', color: '#3b82f6' })
    return { badges, cardBg: isOver ? '#fef2f2' : '#eff6ff', borderColor: isOver ? '#ef4444' : '#3b82f6' }
  }

  // Queued
  badges.push({ text: 'Queued', color: '#94a3b8' })
  return { badges, cardBg: '#f9fafb', borderColor: '#e2e5ea' }
}

function JobRow({ job, getLiveElapsed }: { job: JobCard; getLiveElapsed: (j: JobCard) => number }) {
  const v = job.vehicle
  const elapsed = getLiveElapsed(job)
  const est = job.estimatedHours || 2
  const { badges, cardBg, borderColor } = getStatusInfo(job, elapsed)
  const desc = `${v.year ?? ''} ${v.make} ${v.model}`.trim()
  const doneCount = job.checklist.filter(c => c.done).length
  const totalCount = job.checklist.length

  return (
    <div style={{
      background: cardBg,
      border: `1px solid ${borderColor}`,
      borderLeft: `4px solid ${borderColor}`,
      borderRadius: 12, padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 700 }}>#{v.stockNumber}</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{desc}{v.color ? ` · ${v.color}` : ''}</p>
          {job.awaitingParts && job.awaitingPartsName && (
            <p style={{ fontSize: 11, fontWeight: 600, color: '#eab308', marginTop: 4 }}>Parts: {job.awaitingPartsName}</p>
          )}
          {!job.awaitingParts && job.pauseReason && job.status === 'in_progress' && !job.timerRunning && (
            <p style={{ fontSize: 11, fontWeight: 600, color: '#f59e0b', marginTop: 4 }}>{job.pauseDetail || 'Paused'}</p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {badges.map((b, i) => <Badge key={i} text={b.text} color={b.color} />)}
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {totalCount > 0 ? `${doneCount}/${totalCount} tasks` : 'No tasks'}
          </span>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>
            {formatHours(elapsed)} / {est}h est.
          </span>
        </div>
        <div style={{ height: 4, background: '#e2e5ea', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 2, transition: 'width 0.3s',
            width: `${Math.min((elapsed / (est * 3600)) * 100, 100)}%`,
            background: elapsed > est * 3600 ? '#ef4444' : doneCount === totalCount && totalCount > 0 ? '#22c55e' : borderColor,
          }} />
        </div>
      </div>
    </div>
  )
}

export default function ScheduleView() {
  const [data, setData] = useState<BoardData | null>(null)
  const [loading, setLoading] = useState(true)
  const tickRef = useRef(0)
  const [, setTick] = useState(0)

  useEffect(() => {
    fetch('/api/mechanic-board')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  // Live timer tick
  useEffect(() => {
    const interval = setInterval(() => {
      tickRef.current++
      setTick(t => t + 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const getLiveElapsed = useCallback((job: JobCard) => {
    let sec = job.elapsedSeconds || 0
    if (job.timerRunning && job.timerStartedAt) {
      sec += Math.max(0, Math.floor((Date.now() - new Date(job.timerStartedAt).getTime()) / 1000))
    }
    return sec
  }, [])

  if (loading) return <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>Loading schedule...</p>
  if (!data) return <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>Failed to load schedule.</p>

  // Build day sections from the board data
  // "Today" = active + paused (non-awaiting) + today's queued jobs
  // "Remaining Days" = future day buckets
  // Also show completed today and awaiting parts separately

  const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })

  // Deduplicate: active/paused jobs are already in data.today from the API
  const todayJobs = data.today || []
  const completedToday = data.completedToday || []
  const awaitingParts = data.paused.filter(j => j.awaitingParts)

  const sections: { label: string; hours: number; jobs: JobCard[]; muted?: boolean }[] = []

  if (todayJobs.length > 0 || completedToday.length > 0) {
    const allToday = [...todayJobs, ...completedToday]
    const todayHours = allToday.reduce((s, j) => s + (j.estimatedHours || 2), 0)
    sections.push({ label: `Today — ${todayName}`, hours: todayHours, jobs: allToday })
  }

  for (const bucket of (data.remainingDays || [])) {
    const hours = bucket.jobs.reduce((s, j) => s + (j.estimatedHours || 2), 0)
    sections.push({ label: bucket.day, hours, jobs: bucket.jobs })
  }

  if (awaitingParts.length > 0) {
    sections.push({ label: 'Awaiting Parts', hours: 0, jobs: awaitingParts, muted: true })
  }

  if (sections.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
        No mechanic jobs scheduled. All clear.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {sections.map((section) => (
        <div key={section.label}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: section.muted ? 'var(--text-muted)' : undefined }}>
              {section.label}
            </p>
            {section.hours > 0 && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
                {section.hours}h planned
                {section.hours > 10 && <span style={{ color: '#ef4444', marginLeft: 6 }}>Over capacity</span>}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {section.jobs.map((job) => (
              <JobRow key={job.id} job={job} getLiveElapsed={getLiveElapsed} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
