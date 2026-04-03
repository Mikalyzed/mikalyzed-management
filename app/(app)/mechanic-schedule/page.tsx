'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import ScheduleView from './ScheduleView'
import PlanView from './PlanView'
import OrderPartModal from '@/components/OrderPartModal'

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
  pausedAt: string | null
  awaitingParts: boolean
  awaitingPartsName: string | null
  awaitingPartsDate: string | null
  awaitingPartsTracking: string | null
  completedAt: string | null
  startedAt: string | null
  partsLabel: string | null
}

type DayBucket = { day: string; jobs: JobCard[] }

type BoardData = {
  active: JobCard[]; paused: JobCard[]; queued: JobCard[]; completedToday: JobCard[]
  today: JobCard[]; remainingDays: DayBucket[]
  weeklyEstimatedHours: number; weeklyWorkedHours: number; remainingHoursThisWeek: number; hoursLeftToday: number
  isWorkHours: boolean
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

function formatHours(seconds: number): string {
  return (seconds / 3600).toFixed(1) + 'h'
}

export default function MechanicBoard() {
  const [data, setData] = useState<BoardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedJob, setSelectedJob] = useState<JobCard | null>(null)
  const [modalChecklist, setModalChecklist] = useState<ChecklistItem[]>([])
  const [saving, setSaving] = useState(false)
  const [acting, setActing] = useState(false)
  const [showPauseModal, setShowPauseModal] = useState(false)
  const [pauseType, setPauseType] = useState<'waiting_on_parts' | 'lunch' | 'other' | null>(null)
  const [pauseNote, setPauseNote] = useState('')
  const [partName, setPartName] = useState('')
  const [expectedDate, setExpectedDate] = useState('')
  const [trackingNumber, setTrackingNumber] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [showAllQueued, setShowAllQueued] = useState(false)
  const [showRemainingWeek, setShowRemainingWeek] = useState(false)
  const [viewMode, setViewMode] = useState<'board' | 'schedule' | 'plan'>('board')
  const [tick, setTick] = useState(0)
  const [timeExtJob, setTimeExtJob] = useState<JobCard | null>(null)
  const [timeExtHours, setTimeExtHours] = useState('')
  const [timeExtNote, setTimeExtNote] = useState('')
  const [timeExtSubmitting, setTimeExtSubmitting] = useState(false)
  const [addTaskJob, setAddTaskJob] = useState<JobCard | null>(null)
  const [addTaskItems, setAddTaskItems] = useState<{ name: string; hours: string; note: string }[]>([{ name: '', hours: '', note: '' }])
  const [addTaskSubmitting, setAddTaskSubmitting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<JobCard | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [externalModal, setExternalModal] = useState<JobCard | null>(null)
  const [mechParts, setMechParts] = useState<any[]>([])
  const [mechPartsAddId, setMechPartsAddId] = useState<string | null>(null)
  const [mechPartsNewName, setMechPartsNewName] = useState('')
  const [mechPartsUrlId, setMechPartsUrlId] = useState<string | null>(null)
  const [mechPartsUrlInput, setMechPartsUrlInput] = useState('')
  const [mechPartsSaving, setMechPartsSaving] = useState(false)
  const [mechOrderModal, setMechOrderModal] = useState<{ id: string; name: string } | null>(null)
  const [externalSubmitting, setExternalSubmitting] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchData = useCallback(() => {
    fetch('/api/mechanic-board').then(r => r.json()).then(d => {
      setData(d)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchData()
    fetch('/api/auth/me').then(r => r.json()).then(d => {
      if (d.user?.role === 'admin') setIsAdmin(true)
    }).catch(() => {})
  }, [fetchData])

  useEffect(() => {
    timerRef.current = setInterval(() => setTick(t => t + 1), 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  useEffect(() => {
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [fetchData])

  const doAction = async (action: string, stageId: string, extra?: Record<string, unknown>) => {
    setActing(true)
    try {
      await fetch('/api/mechanic-board', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, stageId, ...extra }),
      })
      fetchData()
      if (action === 'complete' || action === 'start') setSelectedJob(null)
    } catch { /* ignore */ }
    setActing(false)
  }

  const toggleChecklist = async (index: number) => {
    if (!selectedJob) return
    const updated = [...modalChecklist]
    updated[index] = { ...updated[index], done: !updated[index].done }
    setModalChecklist(updated)
    setSaving(true)
    try {
      await fetch(`/api/stages/${selectedJob.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checklist: updated }),
      })
    } catch { /* ignore */ }
    setSaving(false)
  }

  const openJob = (job: JobCard) => {
    setSelectedJob(job)
    setModalChecklist(JSON.parse(JSON.stringify(job.checklist || [])))
    setShowPauseModal(false)
    setPauseType(null)
    setPauseNote('')
    setPartName('')
    setExpectedDate('')
    setTrackingNumber('')
    // Load parts for this vehicle
    fetch(`/api/parts?vehicleId=${job.vehicle.id}`).then(r => r.json()).then(d => setMechParts(d.parts || [])).catch(() => setMechParts([]))
  }

  const closeModal = () => { setSelectedJob(null); setShowPauseModal(false) }

  const submitPause = () => {
    if (!selectedJob || !pauseType) return
    const extra: Record<string, unknown> = { pauseReason: pauseType }
    if (pauseType === 'other') extra.pauseDetail = pauseNote
    if (pauseType === 'lunch') extra.pauseDetail = null
    if (pauseType === 'waiting_on_parts') {
      extra.partName = partName
      extra.expectedDate = expectedDate || undefined
      extra.trackingNumber = trackingNumber || undefined
    }
    doAction('pause', selectedJob.id, extra)
    setShowPauseModal(false)
    setSelectedJob(null)
  }

  const getLiveElapsed = (job: JobCard): number => {
    void tick
    if (job.timerRunning && job.timerStartedAt) {
      const extra = Math.floor((Date.now() - new Date(job.timerStartedAt).getTime()) / 1000)
      return job.elapsedSeconds + extra
    }
    return job.elapsedSeconds
  }

  const getJobColorKey = (job: JobCard): string => {
    if (job.awaitingParts) return 'awaiting_parts'
    if (job.autoPaused) return 'auto_paused'
    if (job.timerRunning) {
      const est = (job.estimatedHours || 2) * 3600
      if (getLiveElapsed(job) > est) return 'overdue'
      return 'active'
    }
    if (job.status === 'done') return 'completed'
    if (job.status === 'pending') return 'queued'
    if (job.pauseReason) return 'paused'
    return 'paused'
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'transparent' }} />
      </div>
    )
  }
  if (!data) return <p style={{ textAlign: 'center', padding: 40 }}>Failed to load</p>

  const doneCount = modalChecklist.filter(c => c.done).length

  // Efficiency
  const effPct = data.weeklyEstimatedHours > 0 ? Math.round((data.weeklyWorkedHours / data.weeklyEstimatedHours) * 100) : 0
  const effLabel = effPct >= 90 && effPct <= 110 ? 'On Track' : effPct > 110 ? 'Over Estimate' : 'Under Estimate'
  const effColor = effPct >= 90 && effPct <= 110 ? '#22c55e' : effPct > 110 ? '#ef4444' : '#f59e0b'

  const COLORS: Record<string, { bg: string; border: string; badge: string; text: string }> = {
    active: { bg: '#eff6ff', border: '#3b82f6', badge: '#3b82f6', text: '#1e40af' },
    queued: { bg: '#f9fafb', border: '#e2e5ea', badge: '#94a3b8', text: '#64748b' },
    paused: { bg: '#fff7ed', border: '#f59e0b', badge: '#f59e0b', text: '#92400e' },
    auto_paused: { bg: '#faf5ff', border: '#a855f7', badge: '#a855f7', text: '#6b21a8' },
    awaiting_parts: { bg: '#fff7ed', border: '#f59e0b', badge: '#f59e0b', text: '#92400e' },
    completed: { bg: '#f0fdf4', border: '#22c55e', badge: '#22c55e', text: '#166534' },
    overdue: { bg: '#fef2f2', border: '#ef4444', badge: '#ef4444', text: '#991b1b' },
  }

  const renderCard = (job: JobCard, showActions = true) => {
    const colorKey = getJobColorKey(job)
    const colors = COLORS[colorKey]
    const v = job.vehicle
    const desc = `${v.year ?? ''} ${v.make} ${v.model}`.trim()
    const elapsed = getLiveElapsed(job)
    const estSeconds = (job.estimatedHours || 2) * 3600
    const progress = Math.min(elapsed / estSeconds, 1)
    const isOver = elapsed > estSeconds && job.status !== 'done'
    const tasksDone = (job.checklist as ChecklistItem[]).filter(c => c.done).length
    const tasksTotal = (job.checklist as ChecklistItem[]).length

    return (
      <div key={job.id} onClick={() => openJob(job)} style={{
        background: colors.bg, border: `1px solid ${colors.border}`,
        borderLeft: `4px solid ${colors.border}`, borderRadius: 14,
        padding: '16px 18px', cursor: 'pointer', transition: 'box-shadow 0.15s',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div>
            <p style={{ fontSize: 15, fontWeight: 700 }}>#{v.stockNumber}</p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{desc}{v.color ? ` · ${v.color}` : ''}</p>
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {job.timerRunning && <Badge text="Active" color={colors.badge} />}
            {job.autoPaused && <Badge text="Auto Paused" color="#a855f7" />}
            {job.awaitingParts && <Badge text="Parts" color="#f59e0b" />}
            {!job.timerRunning && job.pauseReason && !job.awaitingParts && !job.autoPaused && job.pauseReason === 'Lunch' && <Badge text="Lunch" color="#8b5cf6" />}
            {!job.timerRunning && job.pauseReason && !job.awaitingParts && !job.autoPaused && job.pauseReason !== 'Lunch' && <Badge text="Paused" color="#f59e0b" />}
            {job.status === 'pending' && <Badge text="Queued" color="#94a3b8" />}
            {job.status === 'done' && <Badge text="Done" color="#22c55e" />}
            {isOver && <Badge text="Overdue" color="#ef4444" />}
          </div>
        </div>

        {/* Parts status */}
        {job.partsLabel && (
          <div style={{
            marginTop: 8, padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, textAlign: 'center',
            background: job.partsLabel.includes('found') ? '#fef2f2' : job.partsLabel.includes('approval') ? '#fef9c3' : job.partsLabel.includes('ordered') ? '#fefce8' : '#eff6ff',
            color: job.partsLabel.includes('found') ? '#ef4444' : job.partsLabel.includes('approval') ? '#a16207' : job.partsLabel.includes('ordered') ? '#eab308' : '#2563eb',
          }}>
            🔧 {job.partsLabel}
          </div>
        )}

        {/* Timer row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, gap: 12 }}>
          <div style={{ fontSize: 13 }}>
            <span style={{ fontWeight: 700, color: isOver ? '#ef4444' : colors.text, fontVariantNumeric: 'tabular-nums' }}>
              {formatHours(elapsed)}
            </span>
            <span style={{ color: 'var(--text-muted)' }}> / {job.estimatedHours || 2}h est.</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {tasksTotal > 0 && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{tasksDone}/{tasksTotal} tasks</span>
            )}
            {job.timerRunning && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#3b82f6', animation: 'pulse 2s infinite' }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#3b82f6', fontVariantNumeric: 'tabular-nums' }}>{formatTime(elapsed)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ marginTop: 8, height: 5, background: '#e2e5ea', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 3, transition: 'width 0.5s',
            width: `${Math.min(progress * 100, 100)}%`,
            background: isOver ? '#ef4444' : progress >= 0.8 ? '#f59e0b' : colors.badge,
          }} />
        </div>

        {/* Pause info */}
        {job.pauseReason && !job.timerRunning && !job.autoPaused && (
          <p style={{ fontSize: 11, fontWeight: 600, color: job.pauseReason === 'Lunch' ? '#7c3aed' : colors.text, marginTop: 8 }}>
            {job.pauseReason === 'Lunch' ? '🍽️ On Lunch' : job.pauseReason}{job.pauseDetail ? `: ${job.pauseDetail}` : ''}
            {job.awaitingPartsName && ` — ${job.awaitingPartsName}`}
          </p>
        )}
        {job.autoPaused && (
          <p style={{ fontSize: 11, fontWeight: 600, color: '#a855f7', marginTop: 8 }}>Auto Paused — Outside Working Hours</p>
        )}
        {(job.pauseReason || job.awaitingParts || job.autoPaused) && !job.timerRunning && job.pausedAt && (() => {
          const mins = Math.floor((Date.now() - new Date(job.pausedAt).getTime()) / 60000)
          const label = mins < 1 ? 'just now' : mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`
          return <p style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>⏸ Paused {label}</p>
        })()}

        {/* Request More Time — when overdue */}
        {isOver && !showActions && (
          <button
            onClick={(e) => { e.stopPropagation(); setTimeExtJob(job) }}
            style={{
              marginTop: 10, width: '100%', padding: '8px 0', borderRadius: 8,
              background: 'transparent', border: '1px solid #ef4444', color: '#ef4444',
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Request More Time
          </button>
        )}

        {/* Quick actions */}
        {showActions && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
            {job.status === 'pending' && (
              <ActionBtn label="Start" color="#3b82f6" disabled={acting || !data.isWorkHours} onClick={() => doAction('start', job.id)} />
            )}
            {job.timerRunning && (
              <>
                <ActionBtn label="Pause" color="#f59e0b" disabled={acting} onClick={() => { openJob(job); setShowPauseModal(true) }} />
                <ActionBtn label="Complete" color="#22c55e" disabled={acting} onClick={() => doAction('complete', job.id)} />
              </>
            )}
            {!job.timerRunning && job.status === 'in_progress' && (
              <ActionBtn label="Resume" color="#3b82f6" disabled={acting || !data.isWorkHours} onClick={() => doAction('resume', job.id)} />
            )}
            {isOver && (
              <ActionBtn label="Request More Time" color="#ef4444" disabled={acting} onClick={() => setTimeExtJob(job)} />
            )}
            {job.status === 'in_progress' && (
              <ActionBtn label="Add Task" color="#8b5cf6" disabled={acting} onClick={() => setAddTaskJob(job)} />
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>
          {isAdmin ? 'Mechanic Schedule' : 'My Schedule'}
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!data.isWorkHours && <Badge text="Outside Working Hours" color="#a855f7" />}
          <div style={{
            display: 'flex', background: '#f1f3f5', borderRadius: 10, padding: 3,
          }}>
            <button
              onClick={() => setViewMode('board')}
              style={{
                padding: '6px 14px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.15s',
                background: viewMode === 'board' ? '#fff' : 'transparent',
                color: viewMode === 'board' ? '#1a1a1a' : '#94a3b8',
                boxShadow: viewMode === 'board' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              Board
            </button>
            <button
              onClick={() => setViewMode('schedule')}
              style={{
                padding: '6px 14px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.15s',
                background: viewMode === 'schedule' ? '#fff' : 'transparent',
                color: viewMode === 'schedule' ? '#1a1a1a' : '#94a3b8',
                boxShadow: viewMode === 'schedule' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              Schedule
            </button>
            {isAdmin && (
              <button
                onClick={() => setViewMode('plan')}
                style={{
                  padding: '6px 14px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', transition: 'all 0.15s',
                  background: viewMode === 'plan' ? '#fff' : 'transparent',
                  color: viewMode === 'plan' ? '#4f46e5' : '#94a3b8',
                  boxShadow: viewMode === 'plan' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}
              >
                Plan
              </button>
            )}
          </div>
        </div>
      </div>

      {viewMode === 'plan' ? (
        <PlanView />
      ) : viewMode === 'schedule' ? (
        <ScheduleView />
      ) : (<>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 24 }}>
        <StatBox value={data.active.length} label="Active" color="#3b82f6" />
        <StatBox value={data.queued.length} label="Queued" color="#94a3b8" />
        <StatBox value={data.paused.length} label="Paused" color="#f59e0b" />
        <StatBox value={data.completedToday.length} label="Done Today" color="#22c55e" />
        <div className="pipeline-chip">
          <p className="pipeline-chip-value" style={{ fontSize: 18 }}>{data.weeklyEstimatedHours}h</p>
          <p className="pipeline-chip-label">Est. This Week</p>
        </div>
        <div className="pipeline-chip" style={{ position: 'relative' }}>
          <p className="pipeline-chip-value" style={{ fontSize: 18 }}>{data.weeklyWorkedHours}h</p>
          <p className="pipeline-chip-label">Worked This Week</p>
          {data.weeklyEstimatedHours > 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, color: effColor, marginTop: 2, display: 'block' }}>
              {effPct}% — {effLabel}
            </span>
          )}
        </div>
      </div>

      {/* Today */}
      {data.today.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 4, height: 20, borderRadius: 2, background: '#1a1a1a' }} />
              <h2 style={{ fontSize: 16, fontWeight: 700 }}>Today</h2>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{data.today.length} vehicles</span>
            </div>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{data.hoursLeftToday}h left today</span>
          </div>
          <div style={{
            display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8,
            WebkitOverflowScrolling: 'touch',
          }}>
            {data.today.map((job, i) => <WeekCard key={job.id} job={job} index={i} getLiveElapsed={getLiveElapsed} openJob={openJob} />)}
          </div>
        </div>
      )}

      {/* Remaining This Week — collapsed by default, broken down by day */}
      {data.remainingDays.length > 0 && (() => {
        const totalRemaining = data.remainingDays.reduce((sum, d) => sum + d.jobs.length, 0)
        return (
          <div style={{ marginBottom: 24 }}>
            <button
              onClick={() => setShowRemainingWeek(prev => !prev)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '10px 14px', borderRadius: 12, border: '1px solid #e2e5ea',
                background: '#f9fafb', cursor: 'pointer', marginBottom: showRemainingWeek ? 16 : 0,
              }}
            >
              <div style={{ width: 4, height: 20, borderRadius: 2, background: '#94a3b8' }} />
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)' }}>Remaining This Week</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{totalRemaining} vehicles</span>
              <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
                {showRemainingWeek ? 'Hide' : 'Show'}
              </span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text-muted)', transform: showRemainingWeek ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {showRemainingWeek && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {data.remainingDays.map((bucket) => {
                  const dayHours = bucket.jobs.reduce((sum, j) => sum + (j.estimatedHours || 2), 0)
                  return (
                    <div key={bucket.day}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)' }}>{bucket.day}</span>
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{bucket.jobs.length} vehicles</span>
                        </div>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{dayHours}h est.</span>
                      </div>
                      <div style={{
                        display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4,
                        WebkitOverflowScrolling: 'touch',
                      }}>
                        {bucket.jobs.map((job, i) => <WeekCard key={job.id} job={job} index={i} getLiveElapsed={getLiveElapsed} openJob={openJob} />)}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })()}

      {/* Active Jobs */}
      {data.active.length > 0 && (
        <Section title="Active Jobs" count={data.active.length} color="#3b82f6">
          <CardGrid>{data.active.map(j => renderCard(j))}</CardGrid>
        </Section>
      )}

      {/* Queue */}
      {data.queued.length > 0 && (
        <Section title="Queue" count={data.queued.length} color="#94a3b8">
          <CardGrid>{(showAllQueued ? data.queued : data.queued.slice(0, 6)).map(j => renderCard(j))}</CardGrid>
          {data.queued.length > 6 && (
            <button onClick={() => setShowAllQueued(prev => !prev)} style={{
              marginTop: 12, padding: '10px 20px', borderRadius: 10, border: '1px solid #d1d5db',
              background: '#f9fafb', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#64748b', width: '100%',
            }}>
              {showAllQueued ? 'Show Less' : `Show ${data.queued.length - 6} More`}
            </button>
          )}
        </Section>
      )}

      {/* Waiting for Parts */}
      {data.paused.filter(j => j.awaitingParts).length > 0 && (
        <Section title="Waiting for Parts" count={data.paused.filter(j => j.awaitingParts).length} color="#eab308">
          <CardGrid>{data.paused.filter(j => j.awaitingParts).map(j => renderCard(j))}</CardGrid>
        </Section>
      )}

      {/* On Lunch */}
      {data.paused.filter(j => !j.awaitingParts && j.pauseReason === 'Lunch').length > 0 && (
        <Section title="🍽️ On Lunch" count={data.paused.filter(j => !j.awaitingParts && j.pauseReason === 'Lunch').length} color="#8b5cf6">
          <CardGrid>{data.paused.filter(j => !j.awaitingParts && j.pauseReason === 'Lunch').map(j => renderCard(j))}</CardGrid>
        </Section>
      )}

      {/* Paused */}
      {data.paused.filter(j => !j.awaitingParts && j.pauseReason !== 'Lunch').length > 0 && (
        <Section title="Paused" count={data.paused.filter(j => !j.awaitingParts && j.pauseReason !== 'Lunch').length} color="#f59e0b">
          <CardGrid>{data.paused.filter(j => !j.awaitingParts && j.pauseReason !== 'Lunch').map(j => renderCard(j))}</CardGrid>
        </Section>
      )}

      {/* Completed Today */}
      {data.completedToday.length > 0 && (
        <Section title="Completed Today" count={data.completedToday.length} color="#22c55e">
          <CardGrid>
            {data.completedToday.map(j => {
              const v = j.vehicle
              return (
                <div key={j.id} style={{
                  background: '#f0fdf4', border: '1px solid #bbf7d0', borderLeft: '4px solid #22c55e',
                  borderRadius: 14, padding: '16px 18px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <p style={{ fontSize: 15, fontWeight: 700 }}>#{v.stockNumber}</p>
                      <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                        {`${v.year ?? ''} ${v.make} ${v.model}`.trim()}{v.color ? ` · ${v.color}` : ''}
                      </p>
                    </div>
                    <Badge text="Done" color="#22c55e" />
                  </div>
                  <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 12, color: '#166534' }}>
                    {j.completedAt && <span>Completed {new Date(j.completedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>}
                    <span style={{ fontWeight: 700 }}>Total: {formatHours(j.elapsedSeconds)}</span>
                  </div>
                </div>
              )
            })}
          </CardGrid>
        </Section>
      )}

      {data.active.length === 0 && data.queued.length === 0 && data.paused.length === 0 && data.completedToday.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No mechanic jobs. All clear.</div>
      )}

      </>)}

      {/* Job Detail Modal */}
      {selectedJob && (
        <div onClick={closeModal} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: 20, width: '100%', maxWidth: 480,
            maxHeight: '85vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 25px 60px rgba(0,0,0,0.2)',
          }}>
            {showPauseModal ? (
              <div style={{ padding: 24 }}>
                <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Pause Reason</h3>
                {!pauseType ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <button onClick={() => setPauseType('waiting_on_parts')} style={pauseOptionStyle}>Waiting on Parts</button>
                    <button onClick={() => setPauseType('lunch')} style={pauseOptionStyle}>🍽️ Lunch</button>
                    <button onClick={() => setPauseType('other')} style={pauseOptionStyle}>Other</button>
                    <button onClick={() => setShowPauseModal(false)} style={{ ...pauseOptionStyle, color: '#999', borderColor: '#e5e5e5' }}>Cancel</button>
                  </div>
                ) : pauseType === 'waiting_on_parts' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <Field label="What part was ordered? *">
                      <input value={partName} onChange={e => setPartName(e.target.value)} style={inputStyle} placeholder="e.g. Brake pads" />
                    </Field>
                    <Field label="Expected arrival date">
                      <input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} style={inputStyle} />
                    </Field>
                    <Field label="Tracking number">
                      <input value={trackingNumber} onChange={e => setTrackingNumber(e.target.value)} style={inputStyle} placeholder="Optional" />
                    </Field>
                    <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                      <FooterBtn label="Back" color="#999" onClick={() => setPauseType(null)} />
                      <FooterBtn label="Pause Job" color="#f59e0b" disabled={!partName.trim()} onClick={submitPause} />
                    </div>
                  </div>
                ) : pauseType === 'lunch' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', padding: '10px 0' }}>
                    <p style={{ fontSize: 40, marginBottom: 4 }}>🍽️</p>
                    <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Going on lunch break</p>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Timer will be paused until you resume.</p>
                    <div style={{ display: 'flex', gap: 10, marginTop: 8, width: '100%' }}>
                      <FooterBtn label="Back" color="#999" onClick={() => setPauseType(null)} />
                      <FooterBtn label="Pause for Lunch" color="#f59e0b" onClick={submitPause} />
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <Field label="Explain why *">
                      <textarea value={pauseNote} onChange={e => setPauseNote(e.target.value)} style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} placeholder="Why are you pausing?" />
                    </Field>
                    <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                      <FooterBtn label="Back" color="#999" onClick={() => setPauseType(null)} />
                      <FooterBtn label="Pause Job" color="#f59e0b" disabled={!pauseNote.trim()} onClick={submitPause} />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Modal header */}
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e5e5' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <p style={{ fontSize: 18, fontWeight: 700 }}>#{selectedJob.vehicle.stockNumber}</p>
                      <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                        {`${selectedJob.vehicle.year ?? ''} ${selectedJob.vehicle.make} ${selectedJob.vehicle.model}`.trim()}
                        {selectedJob.vehicle.color ? ` · ${selectedJob.vehicle.color}` : ''}
                      </p>
                    </div>
                    <button onClick={closeModal} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-muted)', padding: '0 4px' }}>&times;</button>
                  </div>

                  {/* Timer block */}
                  <div style={{
                    marginTop: 16, padding: '14px 16px', borderRadius: 12,
                    background: selectedJob.timerRunning ? '#eff6ff' : '#f9fafb',
                    border: `1px solid ${selectedJob.timerRunning ? '#3b82f6' : '#e2e5ea'}`,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <div>
                      <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Labor Time</p>
                      <p style={{ fontSize: 26, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: selectedJob.timerRunning ? '#3b82f6' : 'var(--text-primary)', lineHeight: 1.2 }}>
                        {formatTime(getLiveElapsed(selectedJob))}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Estimated</p>
                      <p style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-muted)', lineHeight: 1.2 }}>{selectedJob.estimatedHours || 2}h</p>
                    </div>
                  </div>
                </div>

                {/* Checklist */}
                <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px' }}>
                  <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: 'var(--text-secondary)' }}>
                    Tasks ({doneCount}/{modalChecklist.length})
                    {saving && <span style={{ fontWeight: 400, fontSize: 11, marginLeft: 8, color: 'var(--text-muted)' }}>Saving...</span>}
                  </p>
                  {modalChecklist.length === 0 ? (
                    <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No tasks assigned</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {modalChecklist.map((item, i) => (
                        <div key={i} onClick={() => toggleChecklist(i)} style={{
                          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                          background: item.done ? '#f0fdf4' : '#f9fafb', borderRadius: 10,
                          cursor: 'pointer', border: '1px solid', borderColor: item.done ? '#bbf7d0' : '#e2e5ea',
                        }}>
                          <div style={{
                            width: 22, height: 22, borderRadius: 6, border: '2px solid',
                            borderColor: item.done ? '#22c55e' : '#d1d5db',
                            background: item.done ? '#22c55e' : '#fff',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          }}>
                            {item.done && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                          </div>
                          <span style={{ fontSize: 14, color: item.done ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: item.done ? 'line-through' : 'none' }}>{item.item}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Parts Section */}
                <div style={{ padding: '0 24px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', margin: 0 }}>Parts {mechParts.length > 0 ? `(${mechParts.length})` : ''}</p>
                    <button onClick={() => setMechPartsAddId(mechPartsAddId ? null : selectedJob.vehicle.id)} style={{ padding: '3px 10px', borderRadius: 5, border: '1px solid #1a1a1a', background: '#1a1a1a', color: '#dffd6e', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>+ Add</button>
                  </div>
                  {mechPartsAddId && (
                    <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                      <input type="text" value={mechPartsNewName} onChange={e => setMechPartsNewName(e.target.value)} placeholder="Part name..." autoFocus
                        onKeyDown={async e => { if (e.key === 'Enter' && mechPartsNewName.trim()) { e.preventDefault(); setMechPartsSaving(true); await fetch('/api/parts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vehicleId: selectedJob.vehicle.id, name: mechPartsNewName }) }); setMechPartsNewName(''); setMechPartsAddId(null); setMechPartsSaving(false); fetch(`/api/parts?vehicleId=${selectedJob.vehicle.id}`).then(r => r.json()).then(d => setMechParts(d.parts || [])) } }}
                        style={{ flex: 1, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 5, fontSize: 12 }} />
                      <button onClick={async () => { if (!mechPartsNewName.trim()) return; setMechPartsSaving(true); await fetch('/api/parts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vehicleId: selectedJob.vehicle.id, name: mechPartsNewName }) }); setMechPartsNewName(''); setMechPartsAddId(null); setMechPartsSaving(false); fetch(`/api/parts?vehicleId=${selectedJob.vehicle.id}`).then(r => r.json()).then(d => setMechParts(d.parts || [])) }}
                        disabled={mechPartsSaving || !mechPartsNewName.trim()} style={{ padding: '6px 10px', borderRadius: 5, border: 'none', background: '#1a1a1a', color: '#dffd6e', fontSize: 11, fontWeight: 600, cursor: 'pointer', opacity: mechPartsSaving || !mechPartsNewName.trim() ? 0.5 : 1 }}>Add</button>
                    </div>
                  )}
                  {mechParts.filter(p => p.status !== 'received').map(part => {
                    const sLabels: Record<string,string> = { requested: 'Requested', sourced: 'Pending Approval', ready_to_order: 'Ready to Order', ordered: 'Ordered' }
                    const sColors: Record<string,{bg:string;color:string}> = { requested: {bg:'#fef2f2',color:'#ef4444'}, sourced: {bg:'#fef9c3',color:'#a16207'}, ready_to_order: {bg:'#eff6ff',color:'#2563eb'}, ordered: {bg:'#fefce8',color:'#eab308'} }
                    const sc = sColors[part.status] || sColors.requested
                    return (
                      <div key={part.id} style={{ padding: '8px 10px', marginBottom: 6, borderRadius: 8, background: '#f8f9fa', border: '1px solid #e5e7eb' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 12, fontWeight: 600 }}>{part.name}</span>
                              <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 5px', borderRadius: 3, background: sc.bg, color: sc.color }}>{sLabels[part.status]}</span>
                            </div>
                            {part.url && <a href={part.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#2563eb', textDecoration: 'none', wordBreak: 'break-all' }}>{part.url.length > 40 ? part.url.slice(0, 40) + '...' : part.url}</a>}
                          </div>
                          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                            {part.status === 'requested' && !part.url && (
                              <button onClick={() => { setMechPartsUrlId(part.id); setMechPartsUrlInput('') }} style={{ padding: '3px 6px', borderRadius: 4, border: '1px solid #2563eb', background: '#eff6ff', color: '#2563eb', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>Add Link</button>
                            )}
                            {part.status === 'sourced' && isAdmin && (
                              <>
                                <button onClick={async () => { setMechPartsSaving(true); await fetch(`/api/parts/${part.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'ready_to_order' }) }); setMechPartsSaving(false); fetch(`/api/parts?vehicleId=${selectedJob.vehicle.id}`).then(r => r.json()).then(d => setMechParts(d.parts || [])) }} style={{ padding: '3px 6px', borderRadius: 4, border: '1px solid #16a34a', background: '#f0fdf4', color: '#16a34a', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>✓</button>
                                <button onClick={async () => { setMechPartsSaving(true); await fetch(`/api/parts/${part.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'requested', url: null }) }); setMechPartsSaving(false); fetch(`/api/parts?vehicleId=${selectedJob.vehicle.id}`).then(r => r.json()).then(d => setMechParts(d.parts || [])) }} style={{ padding: '3px 6px', borderRadius: 4, border: '1px solid #ef4444', background: '#fef2f2', color: '#ef4444', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>✗</button>
                              </>
                            )}
                            {part.status === 'ready_to_order' && isAdmin && (
                              <button onClick={() => setMechOrderModal({ id: part.id, name: part.name })} style={{ padding: '3px 6px', borderRadius: 4, border: '1px solid #eab308', background: '#fefce8', color: '#a16207', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>Order</button>
                            )}
                            {part.status === 'ordered' && isAdmin && (
                              <button onClick={async () => { setMechPartsSaving(true); await fetch(`/api/parts/${part.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'received' }) }); setMechPartsSaving(false); fetch(`/api/parts?vehicleId=${selectedJob.vehicle.id}`).then(r => r.json()).then(d => setMechParts(d.parts || [])) }} style={{ padding: '3px 6px', borderRadius: 4, border: '1px solid #16a34a', background: '#f0fdf4', color: '#16a34a', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>Received</button>
                            )}
                            {isAdmin && (
                              <button onClick={async () => { if (!confirm('Delete this part?')) return; setMechPartsSaving(true); await fetch(`/api/parts/${part.id}`, { method: 'DELETE' }); setMechPartsSaving(false); fetch(`/api/parts?vehicleId=${selectedJob.vehicle.id}`).then(r => r.json()).then(d => setMechParts(d.parts || [])) }} style={{ padding: '3px 5px', borderRadius: 4, border: '1px solid #fca5a5', background: '#fef2f2', color: '#ef4444', fontSize: 10, cursor: 'pointer', lineHeight: 1 }} title="Delete">🗑</button>
                            )}
                          </div>
                        </div>
                        {mechPartsUrlId === part.id && (
                          <div style={{ display: 'flex', gap: 5, marginTop: 6 }}>
                            <input type="url" value={mechPartsUrlInput} onChange={e => setMechPartsUrlInput(e.target.value)} placeholder="Paste link..." autoFocus
                              onKeyDown={async e => { if (e.key === 'Enter' && mechPartsUrlInput.trim()) { e.preventDefault(); setMechPartsSaving(true); await fetch(`/api/parts/${part.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: mechPartsUrlInput }) }); setMechPartsUrlId(null); setMechPartsUrlInput(''); setMechPartsSaving(false); fetch(`/api/parts?vehicleId=${selectedJob.vehicle.id}`).then(r => r.json()).then(d => setMechParts(d.parts || [])) } }}
                              style={{ flex: 1, padding: '5px 7px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11 }} />
                            <button onClick={() => setMechPartsUrlId(null)} style={{ padding: '5px 7px', borderRadius: 4, border: '1px solid var(--border)', background: '#fff', fontSize: 10, cursor: 'pointer' }}>Cancel</button>
                            <button onClick={async () => { if (!mechPartsUrlInput.trim()) return; setMechPartsSaving(true); await fetch(`/api/parts/${part.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: mechPartsUrlInput }) }); setMechPartsUrlId(null); setMechPartsUrlInput(''); setMechPartsSaving(false); fetch(`/api/parts?vehicleId=${selectedJob.vehicle.id}`).then(r => r.json()).then(d => setMechParts(d.parts || [])) }}
                              disabled={mechPartsSaving || !mechPartsUrlInput.trim()} style={{ padding: '5px 7px', borderRadius: 4, border: 'none', background: '#1a1a1a', color: '#dffd6e', fontSize: 10, fontWeight: 600, cursor: 'pointer', opacity: mechPartsSaving || !mechPartsUrlInput.trim() ? 0.5 : 1 }}>Submit</button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {mechParts.filter(p => p.status !== 'received').length === 0 && !mechPartsAddId && (
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '6px 0' }}>No pending parts</p>
                  )}
                </div>

                {/* Footer actions */}
                <div style={{ padding: '12px 24px 20px', borderTop: '1px solid #e5e5e5', display: 'flex', gap: 10 }}>
                  {selectedJob.status === 'pending' && (
                    <FooterBtn label={data.isWorkHours ? 'Start Job' : 'Outside Work Hours'} color="#3b82f6" disabled={acting || !data.isWorkHours} onClick={() => doAction('start', selectedJob.id)} full />
                  )}
                  {selectedJob.timerRunning && (
                    <>
                      <FooterBtn label="Pause" color="#f59e0b" disabled={acting} onClick={() => setShowPauseModal(true)} />
                      <FooterBtn label="Complete" color="#22c55e" disabled={acting} onClick={() => doAction('complete', selectedJob.id)} />
                    </>
                  )}
                  {!selectedJob.timerRunning && selectedJob.status === 'in_progress' && (
                    <FooterBtn label={data.isWorkHours ? 'Resume Job' : 'Outside Work Hours'} color="#3b82f6" disabled={acting || !data.isWorkHours} onClick={() => doAction('resume', selectedJob.id)} full />
                  )}
                </div>

                {/* Admin actions */}
                {isAdmin && (
                  <div style={{ padding: '0 24px 16px', display: 'flex', gap: 10 }}>
                    <button
                      onClick={() => { setExternalModal(selectedJob); closeModal() }}
                      style={{
                        flex: 1, padding: '10px 0', borderRadius: 10,
                        border: '1px solid #f59e0b', background: '#fffbeb',
                        fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#b45309',
                      }}
                    >
                      Send to External Repair
                    </button>
                    <button
                      onClick={() => { setDeleteConfirm(selectedJob); closeModal() }}
                      style={{
                        flex: 1, padding: '10px 0', borderRadius: 10,
                        border: '1px solid #fca5a5', background: '#fef2f2',
                        fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#dc2626',
                      }}
                    >
                      Delete Vehicle
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Time Extension Request Modal */}
      {timeExtJob && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }} onClick={() => { setTimeExtJob(null); setTimeExtHours(''); setTimeExtNote('') }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 400,
            boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
          }}>
            <p style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Request More Time</p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
              #{timeExtJob.vehicle.stockNumber} — {`${timeExtJob.vehicle.year ?? ''} ${timeExtJob.vehicle.make} ${timeExtJob.vehicle.model}`.trim()}
            </p>

            <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: 'block' }}>Additional hours needed</label>
            <input
              type="number" step="0.5" min="0.5"
              value={timeExtHours} onChange={e => setTimeExtHours(e.target.value)}
              placeholder="e.g. 2"
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e2e5ea',
                fontSize: 14, background: '#f9fafb', outline: 'none', marginBottom: 12,
              }}
            />

            <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: 'block' }}>Reason (optional)</label>
            <input
              type="text" value={timeExtNote} onChange={e => setTimeExtNote(e.target.value)}
              placeholder="e.g. Found additional rust underneath"
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e2e5ea',
                fontSize: 14, background: '#f9fafb', outline: 'none', marginBottom: 20,
              }}
            />

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => { setTimeExtJob(null); setTimeExtHours(''); setTimeExtNote('') }}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 10, border: '1px solid #e2e5ea',
                  background: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: 'var(--text-secondary)',
                }}
              >Cancel</button>
              <button
                disabled={!timeExtHours || timeExtSubmitting}
                onClick={async () => {
                  setTimeExtSubmitting(true)
                  try {
                    await fetch('/api/task-approvals', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        vehicleStageId: timeExtJob.id,
                        taskName: `Time extension: +${timeExtHours}h${timeExtNote ? ` — ${timeExtNote}` : ''}`,
                        additionalHours: parseFloat(timeExtHours),
                      }),
                    })
                    setTimeExtJob(null); setTimeExtHours(''); setTimeExtNote('')
                  } catch { /* ignore */ }
                  setTimeExtSubmitting(false)
                }}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
                  background: !timeExtHours ? '#e2e5ea' : '#ef4444', color: '#fff',
                  fontSize: 14, fontWeight: 700, cursor: timeExtHours ? 'pointer' : 'default',
                  opacity: timeExtSubmitting ? 0.6 : 1,
                }}
              >{timeExtSubmitting ? 'Sending...' : 'Send Request'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Task Modal */}
      {addTaskJob && (() => {
        const validTasks = addTaskItems.filter(t => t.name.trim() && t.hours)
        const totalHours = validTasks.reduce((sum, t) => sum + parseFloat(t.hours || '0'), 0)
        const updateItem = (idx: number, field: string, val: string) => {
          const updated = [...addTaskItems]
          updated[idx] = { ...updated[idx], [field]: val }
          setAddTaskItems(updated)
        }
        const removeItem = (idx: number) => {
          if (addTaskItems.length <= 1) return
          setAddTaskItems(addTaskItems.filter((_, i) => i !== idx))
        }
        const resetModal = () => { setAddTaskJob(null); setAddTaskItems([{ name: '', hours: '', note: '' }]) }

        return (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }} onClick={resetModal}>
            <div onClick={e => e.stopPropagation()} style={{
              background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 440,
              boxShadow: '0 20px 60px rgba(0,0,0,0.15)', maxHeight: '85vh', overflowY: 'auto',
            }}>
              <p style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Add Tasks</p>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
                #{addTaskJob.vehicle.stockNumber} — {`${addTaskJob.vehicle.year ?? ''} ${addTaskJob.vehicle.make} ${addTaskJob.vehicle.model}`.trim()}
              </p>

              {addTaskItems.map((item, idx) => (
                <div key={idx} style={{
                  background: '#f9fafb', borderRadius: 12, padding: '14px 14px 10px', marginBottom: 10,
                  border: '1px solid #e8e8e8', position: 'relative',
                }}>
                  {addTaskItems.length > 1 && (
                    <button onClick={() => removeItem(idx)} style={{
                      position: 'absolute', top: 8, right: 8, background: 'none', border: 'none',
                      cursor: 'pointer', color: '#ccc', padding: 4,
                    }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                  )}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Task</label>
                      <input
                        type="text" value={item.name} onChange={e => updateItem(idx, 'name', e.target.value)}
                        placeholder="e.g. Replace brake pads"
                        autoFocus={idx === 0}
                        style={{
                          width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e5ea',
                          fontSize: 13, outline: 'none', boxSizing: 'border-box',
                        }}
                      />
                    </div>
                    <div style={{ width: 80, flexShrink: 0 }}>
                      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Hours</label>
                      <input
                        type="number" step="0.5" min="0.5" value={item.hours}
                        onChange={e => updateItem(idx, 'hours', e.target.value)}
                        placeholder="1.5"
                        style={{
                          width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e5ea',
                          fontSize: 13, outline: 'none', boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Note (optional)</label>
                    <input
                      type="text" value={item.note} onChange={e => updateItem(idx, 'note', e.target.value)}
                      placeholder="Additional details..."
                      style={{
                        width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e5ea',
                        fontSize: 13, outline: 'none', boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </div>
              ))}

              {/* Add another task */}
              <button
                onClick={() => setAddTaskItems([...addTaskItems, { name: '', hours: '', note: '' }])}
                style={{
                  width: '100%', padding: '10px 0', borderRadius: 10, border: '1px dashed #d1d5db',
                  background: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  color: '#8b5cf6', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                Add another task
              </button>

              {/* Summary */}
              {validTasks.length > 0 && (
                <div style={{
                  background: '#faf5ff', borderRadius: 10, padding: '10px 14px', marginBottom: 16,
                  border: '1px solid #e9d5ff', display: 'flex', justifyContent: 'space-between',
                  fontSize: 13, fontWeight: 600,
                }}>
                  <span>{validTasks.length} task{validTasks.length !== 1 ? 's' : ''}</span>
                  <span style={{ color: '#8b5cf6' }}>+{totalHours}h total</span>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={resetModal} style={{
                  flex: 1, padding: '10px 0', borderRadius: 10, border: '1px solid #e2e5ea',
                  background: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: 'var(--text-secondary)',
                }}>Cancel</button>
                <button
                  disabled={validTasks.length === 0 || addTaskSubmitting}
                  onClick={async () => {
                    setAddTaskSubmitting(true)
                    try {
                      const taskList = validTasks.map(t => ({
                        name: t.name.trim(),
                        hours: parseFloat(t.hours),
                        note: t.note.trim() || null,
                      }))
                      await fetch('/api/task-approvals', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          vehicleStageId: addTaskJob.id,
                          taskName: taskList.length === 1 ? taskList[0].name : `${taskList.length} new tasks`,
                          additionalHours: totalHours,
                          tasks: taskList,
                        }),
                      })
                      resetModal()
                      fetchData()
                    } catch { /* ignore */ }
                    setAddTaskSubmitting(false)
                  }}
                  style={{
                    flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
                    background: validTasks.length === 0 ? '#e2e5ea' : '#8b5cf6', color: '#fff',
                    fontSize: 14, fontWeight: 700, cursor: validTasks.length > 0 ? 'pointer' : 'default',
                    opacity: addTaskSubmitting ? 0.6 : 1,
                  }}
                >{addTaskSubmitting ? 'Sending...' : 'Submit for Approval'}</button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }} onClick={() => setDeleteConfirm(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 400,
            boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
          }}>
            <p style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, color: '#dc2626' }}>Delete Vehicle</p>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 8 }}>
              Are you sure you want to delete <strong>#{deleteConfirm.vehicle.stockNumber}</strong> — {`${deleteConfirm.vehicle.year ?? ''} ${deleteConfirm.vehicle.make} ${deleteConfirm.vehicle.model}`.trim()}?
            </p>
            <p style={{ fontSize: 13, color: '#dc2626', marginBottom: 20, padding: '10px 14px', background: '#fef2f2', borderRadius: 10, border: '1px solid #fecaca' }}>
              This will permanently remove the vehicle and all its stage history. This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setDeleteConfirm(null)}
                style={{
                  flex: 1, padding: '12px 0', borderRadius: 10, border: '1px solid #e2e5ea',
                  background: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: 'var(--text-secondary)',
                }}
              >Cancel</button>
              <button
                disabled={deleting}
                onClick={async () => {
                  setDeleting(true)
                  try {
                    await fetch(`/api/vehicles/${deleteConfirm.vehicle.id}`, { method: 'DELETE' })
                    setDeleteConfirm(null)
                    fetchData()
                  } catch { /* ignore */ }
                  setDeleting(false)
                }}
                style={{
                  flex: 1, padding: '12px 0', borderRadius: 10, border: 'none',
                  background: deleting ? '#e5e5e5' : '#dc2626', color: '#fff',
                  fontSize: 14, fontWeight: 700, cursor: deleting ? 'default' : 'pointer',
                  opacity: deleting ? 0.6 : 1,
                }}
              >{deleting ? 'Deleting...' : 'Delete Vehicle'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Send to External Repair Modal */}
      {externalModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }} onClick={() => setExternalModal(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 480,
            boxShadow: '0 20px 60px rgba(0,0,0,0.15)', maxHeight: '90vh', overflowY: 'auto',
          }}>
            <p style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Send to External Repair</p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
              #{externalModal.vehicle.stockNumber} — {`${externalModal.vehicle.year ?? ''} ${externalModal.vehicle.make} ${externalModal.vehicle.model}`.trim()}
              {externalModal.vehicle.color ? ` · ${externalModal.vehicle.color}` : ''}
            </p>

            <form onSubmit={async (e) => {
              e.preventDefault()
              setExternalSubmitting(true)
              const form = new FormData(e.currentTarget)
              try {
                // 1. Create external repair record
                const res = await fetch('/api/external', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    stockNumber: externalModal.vehicle.stockNumber,
                    year: externalModal.vehicle.year,
                    make: externalModal.vehicle.make,
                    model: externalModal.vehicle.model,
                    color: externalModal.vehicle.color || null,
                    shopName: form.get('shopName'),
                    shopPhone: form.get('shopPhone') || null,
                    repairDescription: form.get('repairDescription'),
                    estimatedDays: form.get('estimatedDays') ? Number(form.get('estimatedDays')) : null,
                    sentDate: form.get('sentDate'),
                    notes: form.get('notes') || null,
                  }),
                })
                if (res.ok) {
                  // 2. Mark mechanic stage as done (without advancing to next recon stage)
                  await fetch(`/api/stages/${externalModal.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'done' }),
                  })
                  // 3. Set vehicle status to 'external' so it's removed from boards
                  await fetch(`/api/vehicles/${externalModal.vehicle.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'external' }),
                  })
                  setExternalModal(null)
                  fetchData()
                }
              } catch { /* ignore */ }
              setExternalSubmitting(false)
            }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Shop Name *</label>
                  <input name="shopName" required style={inputStyle} placeholder="Joe's Auto Body" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Shop Phone</label>
                  <input name="shopPhone" type="tel" style={inputStyle} placeholder="(305) 555-1234" />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>What&apos;s Being Done *</label>
                <textarea name="repairDescription" required style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }} placeholder="Paint front bumper, fix dent on driver door..." />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Date Sent *</label>
                  <input name="sentDate" type="date" required style={inputStyle} defaultValue={new Date().toISOString().split('T')[0]} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Estimated Days</label>
                  <input name="estimatedDays" type="number" style={inputStyle} placeholder="e.g. 5" />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Notes</label>
                <textarea name="notes" style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} placeholder="Any additional notes..." />
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button type="button" onClick={() => setExternalModal(null)} style={{
                  flex: 1, padding: '12px 0', borderRadius: 10, border: '1px solid #e2e5ea',
                  background: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: 'var(--text-secondary)',
                }}>Cancel</button>
                <button type="submit" disabled={externalSubmitting} style={{
                  flex: 1, padding: '12px 0', borderRadius: 10, border: 'none',
                  background: externalSubmitting ? '#e5e5e5' : '#f59e0b', color: '#fff',
                  fontSize: 14, fontWeight: 700, cursor: externalSubmitting ? 'default' : 'pointer',
                  opacity: externalSubmitting ? 0.6 : 1,
                }}>{externalSubmitting ? 'Sending...' : 'Send to External'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {mechOrderModal && selectedJob && (
        <OrderPartModal partId={mechOrderModal.id} partName={mechOrderModal.name} onClose={() => setMechOrderModal(null)} onComplete={() => {
          fetch(`/api/parts?vehicleId=${selectedJob.vehicle.id}`).then(r => r.json()).then(d => setMechParts(d.parts || []))
        }} />
      )}
    </div>
  )
}

// Sub-components
function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 100,
      background: color + '15', color, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap',
    }}>{text}</span>
  )
}

function StatBox({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="pipeline-chip">
      <p className="pipeline-chip-value" style={{ color }}>{value}</p>
      <p className="pipeline-chip-label">{label}</p>
    </div>
  )
}

function Section({ title, count, color, children }: { title: string; count: number; color: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{ width: 4, height: 20, borderRadius: 2, background: color }} />
        <h2 style={{ fontSize: 16, fontWeight: 700 }}>{title}</h2>
        <span style={{
          fontSize: 12, fontWeight: 700, background: color + '18', color,
          padding: '2px 10px', borderRadius: 100, minWidth: 24, textAlign: 'center',
        }}>{count}</span>
      </div>
      {children}
    </div>
  )
}

function CardGrid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>{children}</div>
}

function ActionBtn({ label, color, disabled, onClick }: { label: string; color: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: '8px 16px', borderRadius: 10, border: 'none',
      background: disabled ? '#e5e5e5' : color, color: disabled ? '#999' : '#fff',
      fontSize: 13, fontWeight: 700, cursor: disabled ? 'default' : 'pointer',
    }}>{label}</button>
  )
}

function FooterBtn({ label, color, disabled, onClick, full }: { label: string; color: string; disabled?: boolean; onClick: () => void; full?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      flex: 1, padding: '14px 0', borderRadius: 12, border: 'none',
      background: disabled ? '#e5e5e5' : color, color: disabled ? '#999' : '#fff',
      fontSize: 15, fontWeight: 700, cursor: disabled ? 'default' : 'pointer', textAlign: 'center',
      ...(full ? { width: '100%' } : {}),
    }}>{label}</button>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: 'block' }}>{label}</label>
      {children}
    </div>
  )
}

const pauseOptionStyle: React.CSSProperties = {
  padding: '14px 20px', borderRadius: 12, border: '1px solid #d1d5db',
  background: '#f9fafb', fontSize: 15, fontWeight: 600, cursor: 'pointer',
  textAlign: 'left', color: '#1a1a1a',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e2e5ea',
  fontSize: 14, background: '#f9fafb', outline: 'none',
}

function WeekCard({ job, index, getLiveElapsed, openJob, muted }: {
  job: JobCard; index: number; getLiveElapsed: (j: JobCard) => number; openJob: (j: JobCard) => void; muted?: boolean
}) {
  const v = job.vehicle
  const elapsed = getLiveElapsed(job)
  const est = job.estimatedHours || 2
  const isOver = elapsed > est * 3600
  const isActive = job.timerRunning
  const isPaused = !job.timerRunning && job.status === 'in_progress' && !job.awaitingParts
  const isAwaiting = job.awaitingParts
  const isDone = job.status === 'done'

  // Determine card colors based on status
  const cardBg = muted ? '#f4f4f5' : isDone ? '#f0fdf4' : isAwaiting ? '#fefce8' : isActive ? '#eff6ff' : isPaused ? '#fff7ed' : '#f9fafb'
  const cardBorder = muted ? '#e2e5ea' : isDone ? '#22c55e' : isAwaiting ? '#eab308' : isActive ? '#3b82f6' : isPaused ? '#f59e0b' : '#e2e5ea'
  const topBorder = muted ? '#d1d5db' : isDone ? '#22c55e' : isAwaiting ? '#eab308' : isActive ? '#3b82f6' : isPaused ? '#f59e0b' : isOver ? '#ef4444' : '#d1d5db'

  return (
    <div onClick={() => openJob(job)} style={{
      minWidth: 180, maxWidth: 220, padding: '12px 14px',
      background: cardBg,
      border: `1px solid ${cardBorder}`,
      borderRadius: 12, cursor: 'pointer', flexShrink: 0,
      borderTop: `3px solid ${topBorder}`,
      opacity: muted ? 0.7 : 1,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>#{index + 1}</span>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {isOver && !isDone && <Badge text="Overdue" color="#ef4444" />}
          {isActive && <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#3b82f6', animation: 'pulse 2s infinite' }} />}
          {isActive && <Badge text="Active" color="#3b82f6" />}
          {isPaused && job.pauseReason === 'Lunch' && <Badge text="Lunch" color="#8b5cf6" />}
          {isPaused && job.pauseReason !== 'Lunch' && <Badge text="Paused" color="#f59e0b" />}
          {isAwaiting && <Badge text="Awaiting Parts" color="#eab308" />}
          {isDone && <Badge text="Completed" color="#22c55e" />}
          {!isActive && !isPaused && !isAwaiting && !isDone && job.status === 'pending' && <Badge text="Queued" color="#94a3b8" />}
        </div>
      </div>
      <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>#{v.stockNumber}</p>
      <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {`${v.year ?? ''} ${v.make} ${v.model}`.trim()}
      </p>
      {isPaused && job.pauseReason && (
        <p style={{ fontSize: 10, color: '#b45309', marginBottom: 4, fontStyle: 'italic' }}>
          {job.pauseReason === 'Lunch' ? '🍽️ On Lunch' : job.pauseReason === 'waiting_on_parts' ? `Parts: ${job.awaitingPartsName || 'Pending'}` : job.pauseDetail || 'Paused'}
        </p>
      )}
      {isAwaiting && job.awaitingPartsName && (
        <p style={{ fontSize: 10, color: '#a16207', marginBottom: 4, fontStyle: 'italic' }}>
          Parts: {job.awaitingPartsName}
        </p>
      )}
      {(isPaused || isAwaiting) && job.pausedAt && (() => {
        const mins = Math.floor((Date.now() - new Date(job.pausedAt).getTime()) / 60000)
        const label = mins < 1 ? 'Just now' : mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ${mins % 60}m ago`
        return <p style={{ fontSize: 10, color: '#6b7280', marginBottom: 4 }}>Paused {label}</p>
      })()}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
        <span style={{ fontWeight: 700, color: isOver && !isDone ? '#ef4444' : 'var(--text-secondary)' }}>{formatHours(elapsed)}</span>
        <span>{est}h est.</span>
      </div>
      <div style={{ marginTop: 6, height: 3, background: '#e2e5ea', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 2,
          width: `${Math.min((elapsed / (est * 3600)) * 100, 100)}%`,
          background: isDone ? '#22c55e' : isOver ? '#ef4444' : isActive ? '#3b82f6' : '#94a3b8',
        }} />
      </div>
    </div>
  )
}
