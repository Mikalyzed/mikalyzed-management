'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import ScheduleView from './ScheduleView'

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
  awaitingPartsDate: string | null
  awaitingPartsTracking: string | null
  completedAt: string | null
  startedAt: string | null
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
  const [pauseType, setPauseType] = useState<'waiting_on_parts' | 'other' | null>(null)
  const [pauseNote, setPauseNote] = useState('')
  const [partName, setPartName] = useState('')
  const [expectedDate, setExpectedDate] = useState('')
  const [trackingNumber, setTrackingNumber] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [showAllQueued, setShowAllQueued] = useState(false)
  const [showRemainingWeek, setShowRemainingWeek] = useState(false)
  const [viewMode, setViewMode] = useState<'board' | 'schedule'>('board')
  const [tick, setTick] = useState(0)
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
  }

  const closeModal = () => { setSelectedJob(null); setShowPauseModal(false) }

  const submitPause = () => {
    if (!selectedJob || !pauseType) return
    const extra: Record<string, unknown> = { pauseReason: pauseType }
    if (pauseType === 'other') extra.pauseDetail = pauseNote
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
            {!job.timerRunning && job.pauseReason && !job.awaitingParts && !job.autoPaused && <Badge text="Paused" color="#f59e0b" />}
            {job.status === 'pending' && <Badge text="Queued" color="#94a3b8" />}
            {job.status === 'done' && <Badge text="Done" color="#22c55e" />}
            {isOver && <Badge text="Overdue" color="#ef4444" />}
          </div>
        </div>

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
          <p style={{ fontSize: 11, fontWeight: 600, color: colors.text, marginTop: 8 }}>
            {job.pauseReason}{job.pauseDetail ? `: ${job.pauseDetail}` : ''}
            {job.awaitingPartsName && ` — ${job.awaitingPartsName}`}
          </p>
        )}
        {job.autoPaused && (
          <p style={{ fontSize: 11, fontWeight: 600, color: '#a855f7', marginTop: 8 }}>Auto Paused — Outside Working Hours</p>
        )}

        {/* Quick actions */}
        {showActions && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }} onClick={e => e.stopPropagation()}>
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
          </div>
        </div>
      </div>

      {viewMode === 'schedule' ? (
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

      {/* Paused / Waiting */}
      {data.paused.length > 0 && (
        <Section title="Paused / Waiting" count={data.paused.length} color="#f59e0b">
          <CardGrid>{data.paused.map(j => renderCard(j))}</CardGrid>
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
              </>
            )}
          </div>
        </div>
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
          {isPaused && <Badge text="Paused" color="#f59e0b" />}
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
          {job.pauseReason === 'waiting_on_parts' ? `Parts: ${job.awaitingPartsName || 'Pending'}` : job.pauseDetail || 'Paused'}
        </p>
      )}
      {isAwaiting && job.awaitingPartsName && (
        <p style={{ fontSize: 10, color: '#a16207', marginBottom: 4, fontStyle: 'italic' }}>
          Parts: {job.awaitingPartsName}
        </p>
      )}
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
