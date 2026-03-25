'use client'

import { useEffect, useState } from 'react'

type ChecklistItem = { item: string; done: boolean; note: string }

type ScheduleBlock = {
  id: string
  vehicle: { id: string; stockNumber: string; year: number | null; make: string; model: string; color: string | null }
  assignee: { id: string; name: string } | null
  status: string
  estimatedHours: number | null
  checklist: ChecklistItem[]
  startTime: string
  endTime: string
  priority: number
  segmentHours?: number
  isContination?: boolean
  segmentIndex?: number
  totalSegments?: number
  pauseReason?: string | null
  pauseDetail?: string | null
  timerRunning?: boolean
  activeSeconds?: number
  autoPaused?: boolean
}

type CalendarBlock = {
  id: string; title: string; type: string; location: string | null
  startTime: string; endTime: string; isCalendarEvent: true
}

type DayItem = ScheduleBlock | CalendarBlock

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  pending: { bg: '#f9fafb', border: '#e2e5ea', text: 'var(--text-secondary)' },
  in_progress: { bg: '#eff6ff', border: '#3b82f6', text: '#1e40af' },
  in_progress_overdue: { bg: '#fef2f2', border: '#ef4444', text: '#991b1b' },
  paused: { bg: '#fff7ed', border: '#f59e0b', text: '#b45309' },
  blocked: { bg: '#fef2f2', border: '#ef4444', text: '#991b1b' },
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Queued', in_progress: 'In Progress', blocked: 'Blocked',
}

const TYPE_LABELS: Record<string, string> = {
  mechanic_visit: 'Mechanic Visit', sales_meeting: 'Meeting', pickup: 'Pickup',
  dropoff: 'Dropoff', detailing: 'Detailing', content_shoot: 'Content Shoot',
  event_task: 'Event Task', errand: 'Errand',
}

export default function ScheduleView() {
  const [schedule, setSchedule] = useState<ScheduleBlock[]>([])
  const [calendarBlocks, setCalendarBlocks] = useState<CalendarBlock[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/mechanic-schedule')
      .then(r => r.json())
      .then(d => {
        setSchedule(d.schedule || [])
        setCalendarBlocks((d.calendarBlocks || []).map((cb: CalendarBlock) => ({ ...cb, isCalendarEvent: true as const })))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading) {
    return <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>Loading schedule...</p>
  }

  if (schedule.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
        No mechanic jobs scheduled. All clear.
      </div>
    )
  }

  // Group by day
  const days = new Map<string, DayItem[]>()
  schedule.forEach(block => {
    const day = new Date(block.startTime).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
    if (!days.has(day)) days.set(day, [])
    days.get(day)!.push(block)
  })
  calendarBlocks.forEach(cb => {
    const day = new Date(cb.startTime).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
    if (!days.has(day)) days.set(day, [])
    days.get(day)!.push(cb)
  })
  days.forEach((items, key) => {
    items.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    days.set(key, items)
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {Array.from(days.entries()).map(([day, blocks]) => {
        const dayHours = blocks.reduce((sum, b) => {
          if ('isCalendarEvent' in b && b.isCalendarEvent) {
            return sum + Math.round((new Date(b.endTime).getTime() - new Date(b.startTime).getTime()) / 3600000 * 10) / 10
          }
          return sum + ((b as ScheduleBlock).segmentHours || (b as ScheduleBlock).estimatedHours || 2)
        }, 0)

        return (
          <div key={day}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <p style={{ fontSize: 14, fontWeight: 700 }}>{day}</p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
                {Math.round(dayHours * 10) / 10}h scheduled
                {dayHours > 10 && <span style={{ color: '#ef4444', marginLeft: 6 }}>Over capacity</span>}
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {blocks.map((block) => {
                // Calendar event
                if ('isCalendarEvent' in block && block.isCalendarEvent) {
                  const evtStart = new Date(block.startTime)
                  const evtEnd = new Date(block.endTime)
                  const durationH = Math.round((evtEnd.getTime() - evtStart.getTime()) / 3600000 * 10) / 10
                  return (
                    <div key={`cal-${block.id}`} style={{
                      display: 'flex', gap: 14, alignItems: 'stretch',
                      background: '#faf5ff', border: '1px solid #a855f7',
                      borderLeft: '4px solid #a855f7', borderRadius: 12, padding: '14px 16px',
                    }}>
                      <div style={{ minWidth: 60, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: '#7c3aed' }}>
                          {evtStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        </p>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {evtEnd.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        </p>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                          <div>
                            <p style={{ fontSize: 14, fontWeight: 700 }}>{block.title}</p>
                            {block.location && <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{block.location}</p>}
                          </div>
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 100,
                            background: '#a855f720', color: '#a855f7',
                            textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap',
                          }}>
                            {TYPE_LABELS[block.type] || block.type}
                          </span>
                        </div>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>{durationH}h blocked</p>
                      </div>
                    </div>
                  )
                }

                // Vehicle block
                const b = block as ScheduleBlock
                const hours = b.estimatedHours || 2
                const startTime = new Date(b.startTime)
                const endTime = new Date(b.endTime)
                let finalEndTime = endTime
                if (b.totalSegments && b.totalSegments > 1) {
                  const lastSeg = schedule.filter(s => s.id === b.id).pop()
                  if (lastSeg) finalEndTime = new Date(lastSeg.endTime)
                }
                const isOverdue = b.status === 'in_progress' && new Date() > finalEndTime
                const isPaused = b.status === 'in_progress' && !b.timerRunning && !b.autoPaused
                const isAutoPaused = b.autoPaused
                const isActive = b.status === 'in_progress' && b.timerRunning
                
                // Pick color based on real status
                let colorKey = b.status
                if (isOverdue && !isActive) colorKey = 'in_progress_overdue'
                if (isPaused || isAutoPaused) colorKey = 'paused'
                const colors = STATUS_COLORS[colorKey] || STATUS_COLORS.pending
                
                // Determine status label
                let statusLabel = STATUS_LABELS[b.status] || b.status
                if (isActive && isOverdue) statusLabel = 'Active · Overdue'
                else if (isActive) statusLabel = 'Active'
                else if (isAutoPaused) statusLabel = 'Auto Paused'
                else if (isPaused && b.pauseReason === 'waiting_on_parts') statusLabel = 'Awaiting Parts'
                else if (isPaused) statusLabel = 'Paused'
                else if (isOverdue) statusLabel = 'Overdue'
                
                // Status badge color
                let badgeBg = colors.border + '20'
                let badgeColor = colors.border
                if (isActive) { badgeBg = '#3b82f620'; badgeColor = '#3b82f6' }
                else if (isPaused || isAutoPaused) { badgeBg = '#f59e0b20'; badgeColor = '#f59e0b' }
                else if (isOverdue) { badgeBg = '#ef444420'; badgeColor = '#ef4444' }
                
                const doneCount = (b.checklist as ChecklistItem[]).filter(c => c.done).length
                const totalCount = (b.checklist as ChecklistItem[]).length
                const v = b.vehicle
                const desc = `${v.year ?? ''} ${v.make} ${v.model}`.trim()

                return (
                  <div key={`${b.id}-${b.segmentIndex ?? 0}`} style={{
                    display: 'flex', gap: 14, alignItems: 'stretch',
                    background: isActive ? '#eff6ff' : (isPaused || isAutoPaused) ? '#fff7ed' : colors.bg, 
                    border: `1px solid ${isActive ? '#3b82f6' : (isPaused || isAutoPaused) ? '#f59e0b' : colors.border}`,
                    borderLeft: `4px solid ${isActive ? '#3b82f6' : (isPaused || isAutoPaused) ? '#f59e0b' : colors.border}`, 
                    borderRadius: 12, padding: '14px 16px',
                  }}>
                    <div style={{ minWidth: 60, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: isActive ? '#1e40af' : (isPaused || isAutoPaused) ? '#b45309' : colors.text }}>
                        {startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </p>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {endTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </p>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <div>
                          <p style={{ fontSize: 14, fontWeight: 700 }}>
                            #{v.stockNumber}
                            {b.isContination && (
                              <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 6 }}>(continued)</span>
                            )}
                          </p>
                          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{desc}{v.color ? ` · ${v.color}` : ''}</p>
                          {isPaused && b.pauseReason && b.pauseReason !== 'waiting_on_parts' && (
                            <p style={{ fontSize: 11, fontWeight: 600, color: '#f59e0b', marginTop: 4 }}>{b.pauseDetail || 'Paused'}</p>
                          )}
                          {isPaused && b.pauseReason === 'waiting_on_parts' && (
                            <p style={{ fontSize: 11, fontWeight: 600, color: '#eab308', marginTop: 4 }}>Parts: {b.pauseDetail || 'Pending'}</p>
                          )}
                        </div>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 100,
                          background: badgeBg, color: badgeColor,
                          textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap',
                        }}>
                          {statusLabel}
                        </span>
                      </div>
                      {totalCount > 0 && (
                        <div style={{ marginTop: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{doneCount}/{totalCount} tasks</span>
                            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>
                              {b.segmentHours ? `${b.segmentHours}h / ${hours}h total` : `${hours}h est.`}
                            </span>
                          </div>
                          <div style={{ height: 4, background: '#e2e5ea', borderRadius: 2 }}>
                            <div style={{
                              height: '100%', borderRadius: 2, transition: 'width 0.3s',
                              width: `${totalCount > 0 ? (doneCount / totalCount) * 100 : 0}%`,
                              background: doneCount === totalCount ? '#22c55e' : colors.border,
                            }} />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
