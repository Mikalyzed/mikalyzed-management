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
  awaitingPartsDate: string | null
  awaitingPartsTracking: string | null
  completedAt: string | null
  startedAt: string | null
}

const STATUS_COLORS: Record<string, { bg: string; border: string; badge: string; text: string }> = {
  active: { bg: '#eff6ff', border: '#3b82f6', badge: '#3b82f6', text: '#1e40af' },
  queued: { bg: '#f8f8f6', border: '#d1d5db', badge: '#9ca3af', text: '#6b7280' },
  paused: { bg: '#fff7ed', border: '#f59e0b', badge: '#f59e0b', text: '#92400e' },
  auto_paused: { bg: '#faf5ff', border: '#a855f7', badge: '#a855f7', text: '#6b21a8' },
  awaiting_parts: { bg: '#fff7ed', border: '#f59e0b', badge: '#f59e0b', text: '#92400e' },
  completed: { bg: '#f0fdf4', border: '#22c55e', badge: '#22c55e', text: '#166534' },
  overdue: { bg: '#fef2f2', border: '#ef4444', badge: '#ef4444', text: '#991b1b' },
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
  const [data, setData] = useState<{
    active: JobCard[]; paused: JobCard[]; queued: JobCard[]; completedToday: JobCard[]
    isWorkHours: boolean
  } | null>(null)
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
  const [userId, setUserId] = useState<string | null>(null)
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
      if (d.user?.id) setUserId(d.user.id)
    }).catch(() => {})
  }, [fetchData])

  // Live timer tick every second
  useEffect(() => {
    timerRef.current = setInterval(() => setTick(t => t + 1), 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  // Refresh data every 30s
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

  const closeModal = () => {
    setSelectedJob(null)
    setShowPauseModal(false)
  }

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
    // Force re-render via tick
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

  const allDone = modalChecklist.length > 0 && modalChecklist.every(c => c.done)
  const doneCount = modalChecklist.filter(c => c.done).length

  const renderCard = (job: JobCard, showActions = true) => {
    const colorKey = getJobColorKey(job)
    const colors = STATUS_COLORS[colorKey]
    const v = job.vehicle
    const desc = `${v.year ?? ''} ${v.make} ${v.model}`.trim()
    const elapsed = getLiveElapsed(job)
    const estSeconds = (job.estimatedHours || 2) * 3600
    const progress = Math.min(elapsed / estSeconds, 1)
    const tasksDone = (job.checklist as ChecklistItem[]).filter(c => c.done).length
    const tasksTotal = (job.checklist as ChecklistItem[]).length

    const badges: string[] = []
    if (job.timerRunning) badges.push('Active')
    else if (job.autoPaused) badges.push('Auto Paused')
    else if (job.awaitingParts) badges.push('Waiting on Parts')
    else if (job.pauseReason) badges.push('Paused')
    else if (job.status === 'done') badges.push('Completed')
    else if (job.status === 'pending') badges.push('Queued')
    if (elapsed > estSeconds && job.status !== 'done') badges.push('Overdue')

    return (
      <div
        key={job.id}
        onClick={() => openJob(job)}
        style={{
          background: colors.bg,
          border: `1px solid ${colors.border}`,
          borderLeft: `4px solid ${colors.border}`,
          borderRadius: 14,
          padding: '16px 18px',
          cursor: 'pointer',
          transition: 'box-shadow 0.15s',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div>
            <p style={{ fontSize: 15, fontWeight: 700 }}>#{v.stockNumber}</p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {desc}{v.color ? ` · ${v.color}` : ''}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {badges.map(b => (
              <span key={b} style={{
                fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 100,
                background: colors.badge + '18', color: colors.badge,
                textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap',
              }}>{b}</span>
            ))}
          </div>
        </div>

        {/* Timer + Tasks */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, gap: 12 }}>
          <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
            <span style={{ color: 'var(--text-secondary)' }}>
              <span style={{ fontWeight: 700, color: elapsed > estSeconds ? '#ef4444' : colors.text }}>
                {formatHours(elapsed)}
              </span>
              {' / '}{job.estimatedHours || 2}h
            </span>
            {tasksTotal > 0 && (
              <span style={{ color: 'var(--text-muted)' }}>
                {tasksDone}/{tasksTotal} tasks
              </span>
            )}
          </div>
          {job.timerRunning && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6', animation: 'pulse 2s infinite' }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: '#3b82f6', fontVariantNumeric: 'tabular-nums' }}>
                {formatTime(elapsed)}
              </span>
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div style={{ marginTop: 8, height: 4, background: '#e0e0e0', borderRadius: 2 }}>
          <div style={{
            height: '100%', borderRadius: 2, transition: 'width 0.5s',
            width: `${Math.min(progress * 100, 100)}%`,
            background: progress >= 1 ? '#ef4444' : colors.badge,
          }} />
        </div>

        {/* Pause info */}
        {job.pauseReason && !job.timerRunning && (
          <p style={{ fontSize: 11, fontWeight: 600, color: colors.text, marginTop: 8 }}>
            {job.pauseReason}{job.pauseDetail ? `: ${job.pauseDetail}` : ''}
            {job.awaitingPartsName && ` — ${job.awaitingPartsName}`}
          </p>
        )}
        {job.autoPaused && (
          <p style={{ fontSize: 11, fontWeight: 600, color: '#a855f7', marginTop: 8 }}>
            Auto Paused — Outside Working Hours
          </p>
        )}

        {/* Quick actions (prevent modal open) */}
        {showActions && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }} onClick={e => e.stopPropagation()}>
            {job.status === 'pending' && (
              <button
                onClick={() => doAction('start', job.id)}
                disabled={acting || !data.isWorkHours}
                style={actionBtnStyle('#3b82f6', !data.isWorkHours)}
              >
                Start
              </button>
            )}
            {job.timerRunning && (
              <>
                <button
                  onClick={() => { openJob(job); setShowPauseModal(true) }}
                  disabled={acting}
                  style={actionBtnStyle('#f59e0b')}
                >
                  Pause
                </button>
                <button
                  onClick={() => doAction('complete', job.id)}
                  disabled={acting}
                  style={actionBtnStyle('#22c55e')}
                >
                  Complete
                </button>
              </>
            )}
            {!job.timerRunning && job.status === 'in_progress' && (
              <button
                onClick={() => doAction('resume', job.id)}
                disabled={acting || !data.isWorkHours}
                style={actionBtnStyle('#3b82f6', !data.isWorkHours)}
              >
                Resume
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  const SectionHeader = ({ title, count, color }: { title: string; count: number; color: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <div style={{ width: 4, height: 20, borderRadius: 2, background: color }} />
      <h2 style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em' }}>{title}</h2>
      <span style={{
        fontSize: 12, fontWeight: 700, background: color + '18', color: color,
        padding: '2px 10px', borderRadius: 100, minWidth: 24, textAlign: 'center',
      }}>{count}</span>
    </div>
  )

  return (
    <div>
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>
          {isAdmin ? 'Mechanic Schedule #2' : 'My Schedule #2'}
        </h1>
        {!data.isWorkHours && (
          <span style={{
            fontSize: 12, fontWeight: 600, padding: '4px 12px', borderRadius: 100,
            background: '#a855f720', color: '#a855f7',
          }}>Outside Working Hours</span>
        )}
      </div>

      {/* Stats bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 10, marginBottom: 24 }}>
        <div className="pipeline-chip">
          <p className="pipeline-chip-value" style={{ color: '#3b82f6' }}>{data.active.length}</p>
          <p className="pipeline-chip-label">Active</p>
        </div>
        <div className="pipeline-chip">
          <p className="pipeline-chip-value" style={{ color: '#9ca3af' }}>{data.queued.length}</p>
          <p className="pipeline-chip-label">Queued</p>
        </div>
        <div className="pipeline-chip">
          <p className="pipeline-chip-value" style={{ color: '#f59e0b' }}>{data.paused.length}</p>
          <p className="pipeline-chip-label">Paused</p>
        </div>
        <div className="pipeline-chip">
          <p className="pipeline-chip-value" style={{ color: '#22c55e' }}>{data.completedToday.length}</p>
          <p className="pipeline-chip-label">Done Today</p>
        </div>
      </div>

      {/* Active Jobs */}
      {data.active.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <SectionHeader title="Active Jobs" count={data.active.length} color="#3b82f6" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
            {data.active.map(j => renderCard(j))}
          </div>
        </div>
      )}

      {/* Queue */}
      {data.queued.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <SectionHeader title="Queue" count={data.queued.length} color="#9ca3af" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
            {data.queued.map(j => renderCard(j))}
          </div>
        </div>
      )}

      {/* Paused / Waiting */}
      {data.paused.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <SectionHeader title="Paused / Waiting" count={data.paused.length} color="#f59e0b" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
            {data.paused.map(j => renderCard(j))}
          </div>
        </div>
      )}

      {/* Completed Today */}
      {data.completedToday.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <SectionHeader title="Completed Today" count={data.completedToday.length} color="#22c55e" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
            {data.completedToday.map(j => renderCard(j, false))}
          </div>
        </div>
      )}

      {data.active.length === 0 && data.queued.length === 0 && data.paused.length === 0 && data.completedToday.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          No mechanic jobs. All clear.
        </div>
      )}

      {/* Job Detail Modal */}
      {selectedJob && (
        <div onClick={closeModal} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: 20,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: 20, width: '100%', maxWidth: 480,
            maxHeight: '85vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 25px 60px rgba(0,0,0,0.2)',
          }}>
            {showPauseModal ? (
              /* Pause Reason Modal */
              <div style={{ padding: 24 }}>
                <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Pause Reason</h3>

                {!pauseType ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <button onClick={() => setPauseType('waiting_on_parts')} style={pauseOptionStyle}>
                      Waiting on Parts
                    </button>
                    <button onClick={() => setPauseType('other')} style={pauseOptionStyle}>
                      Other
                    </button>
                    <button onClick={() => setShowPauseModal(false)} style={{ ...pauseOptionStyle, color: '#999', borderColor: '#e5e5e5' }}>
                      Cancel
                    </button>
                  </div>
                ) : pauseType === 'waiting_on_parts' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <label style={labelStyle}>What part was ordered? *</label>
                      <input value={partName} onChange={e => setPartName(e.target.value)} style={inputStyle} placeholder="e.g. Brake pads" />
                    </div>
                    <div>
                      <label style={labelStyle}>Expected arrival date</label>
                      <input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Tracking number</label>
                      <input value={trackingNumber} onChange={e => setTrackingNumber(e.target.value)} style={inputStyle} placeholder="Optional" />
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                      <button onClick={() => setPauseType(null)} style={{ ...actionBtnStyle('#999'), flex: 1 }}>Back</button>
                      <button onClick={submitPause} disabled={!partName.trim()} style={{ ...actionBtnStyle('#f59e0b', !partName.trim()), flex: 1 }}>Pause Job</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <label style={labelStyle}>Explain why *</label>
                      <textarea value={pauseNote} onChange={e => setPauseNote(e.target.value)} style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} placeholder="Why are you pausing?" />
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                      <button onClick={() => setPauseType(null)} style={{ ...actionBtnStyle('#999'), flex: 1 }}>Back</button>
                      <button onClick={submitPause} disabled={!pauseNote.trim()} style={{ ...actionBtnStyle('#f59e0b', !pauseNote.trim()), flex: 1 }}>Pause Job</button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Job Detail */
              <>
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

                  {/* Timer display */}
                  <div style={{
                    marginTop: 16, padding: '12px 16px', borderRadius: 12,
                    background: selectedJob.timerRunning ? '#eff6ff' : '#f8f8f6',
                    border: `1px solid ${selectedJob.timerRunning ? '#3b82f6' : '#e5e5e5'}`,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <div>
                      <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Labor Time</p>
                      <p style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: selectedJob.timerRunning ? '#3b82f6' : 'var(--text-primary)' }}>
                        {formatTime(getLiveElapsed(selectedJob))}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Estimated</p>
                      <p style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-muted)' }}>{selectedJob.estimatedHours || 2}h</p>
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
                          background: item.done ? '#f0fdf4' : '#f8f8f6', borderRadius: 10,
                          cursor: 'pointer', border: '1px solid', borderColor: item.done ? '#bbf7d0' : '#e5e5e5',
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

                {/* Actions footer */}
                <div style={{ padding: '12px 24px 20px', borderTop: '1px solid #e5e5e5', display: 'flex', gap: 10 }}>
                  {selectedJob.status === 'pending' && (
                    <button onClick={() => doAction('start', selectedJob.id)} disabled={acting || !data.isWorkHours} style={{ ...footerBtnStyle('#3b82f6', !data.isWorkHours), flex: 1 }}>
                      {data.isWorkHours ? 'Start Job' : 'Outside Work Hours'}
                    </button>
                  )}
                  {selectedJob.timerRunning && (
                    <>
                      <button onClick={() => setShowPauseModal(true)} disabled={acting} style={{ ...footerBtnStyle('#f59e0b'), flex: 1 }}>Pause</button>
                      <button onClick={() => doAction('complete', selectedJob.id)} disabled={acting} style={{ ...footerBtnStyle('#22c55e'), flex: 1 }}>Complete</button>
                    </>
                  )}
                  {!selectedJob.timerRunning && selectedJob.status === 'in_progress' && (
                    <button onClick={() => doAction('resume', selectedJob.id)} disabled={acting || !data.isWorkHours} style={{ ...footerBtnStyle('#3b82f6', !data.isWorkHours), flex: 1 }}>
                      {data.isWorkHours ? 'Resume Job' : 'Outside Work Hours'}
                    </button>
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

const actionBtnStyle = (color: string, disabled = false): React.CSSProperties => ({
  padding: '8px 16px', borderRadius: 10, border: 'none',
  background: disabled ? '#e5e5e5' : color,
  color: disabled ? '#999' : '#fff',
  fontSize: 13, fontWeight: 700, cursor: disabled ? 'default' : 'pointer',
  opacity: disabled ? 0.6 : 1,
})

const footerBtnStyle = (color: string, disabled = false): React.CSSProperties => ({
  padding: '14px 0', borderRadius: 12, border: 'none',
  background: disabled ? '#e5e5e5' : color,
  color: disabled ? '#999' : '#fff',
  fontSize: 15, fontWeight: 700, cursor: disabled ? 'default' : 'pointer',
  textAlign: 'center',
})

const pauseOptionStyle: React.CSSProperties = {
  padding: '14px 20px', borderRadius: 12, border: '1px solid #d1d5db',
  background: '#f8f8f6', fontSize: 15, fontWeight: 600, cursor: 'pointer',
  textAlign: 'left', color: '#1a1a1a',
}

const labelStyle: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, marginBottom: 4, display: 'block',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e5e5e5',
  fontSize: 14, background: '#f8f8f6', outline: 'none',
}
