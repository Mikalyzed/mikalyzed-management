'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type ScheduleBlock = {
  id: string
  vehicle: { id: string; stockNumber: string; year: number | null; make: string; model: string; color: string | null }
  assignee: { id: string; name: string } | null
  status: string
  estimatedHours: number | null
  checklist: { item: string; done: boolean; note: string }[]
  startTime: string
  endTime: string
  priority: number
  segmentHours?: number
  isContination?: boolean
  segmentIndex?: number
  totalSegments?: number
}

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  pending: { bg: '#f8f8f6', border: '#e0e0e0', text: 'var(--text-secondary)' },
  in_progress: { bg: '#eff6ff', border: '#3b82f6', text: '#1e40af' },
  in_progress_overdue: { bg: '#fef2f2', border: '#ef4444', text: '#991b1b' },
  blocked: { bg: '#fef2f2', border: '#ef4444', text: '#991b1b' },
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Queued', in_progress: 'In Progress', blocked: 'Blocked',
}

export default function MechanicSchedulePage() {
  const [schedule, setSchedule] = useState<ScheduleBlock[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'list' | 'timeline'>('list')

  useEffect(() => {
    fetch('/api/mechanic-schedule').then(r => r.json()).then(d => {
      setSchedule(d.schedule || [])
      setLoading(false)
    })
  }, [])

  // Group blocks by day
  const days = new Map<string, ScheduleBlock[]>()
  schedule.forEach(block => {
    const day = new Date(block.startTime).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
    if (!days.has(day)) days.set(day, [])
    days.get(day)!.push(block)
  })

  // Stats
  const totalHours = schedule.reduce((sum, b) => sum + (b.estimatedHours || 2), 0)
  const inProgress = schedule.find(b => b.status === 'in_progress')
  const queuedCount = schedule.filter(b => b.status === 'pending').length
  const blockedCount = schedule.filter(b => b.status === 'blocked').length

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>Mechanic Schedule</h1>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 10, marginBottom: 24 }}>
        <div className="pipeline-chip">
          <p className="pipeline-chip-value">{schedule.length}</p>
          <p className="pipeline-chip-label">Total Jobs</p>
        </div>
        <div className="pipeline-chip">
          <p className="pipeline-chip-value" style={{ color: '#3b82f6' }}>{inProgress ? 1 : 0}</p>
          <p className="pipeline-chip-label">Active</p>
        </div>
        <div className="pipeline-chip">
          <p className="pipeline-chip-value">{queuedCount}</p>
          <p className="pipeline-chip-label">Queued</p>
        </div>
        {blockedCount > 0 && (
          <div className="pipeline-chip">
            <p className="pipeline-chip-value" style={{ color: '#ef4444' }}>{blockedCount}</p>
            <p className="pipeline-chip-label">Blocked</p>
          </div>
        )}
        <div className="pipeline-chip">
          <p className="pipeline-chip-value">{totalHours}h</p>
          <p className="pipeline-chip-label">Total Est.</p>
        </div>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>Loading...</p>
      ) : schedule.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          No mechanic jobs scheduled. All clear.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {Array.from(days.entries()).map(([day, blocks]) => {
            const dayHours = blocks.reduce((sum, b) => sum + (b.segmentHours || b.estimatedHours || 2), 0)
            return (
              <div key={day}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <p style={{ fontSize: 14, fontWeight: 700 }}>{day}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
                    {dayHours}h scheduled
                    {dayHours > 10 && <span style={{ color: '#ef4444', marginLeft: 6 }}>Over capacity</span>}
                  </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {blocks.map((block, i) => {
                    const hours = block.estimatedHours || 2
                    const startTime = new Date(block.startTime)
                    const endTime = new Date(block.endTime)
                    const isOverdue = block.status === 'in_progress' && new Date() > endTime
                    const colorKey = isOverdue ? 'in_progress_overdue' : block.status
                    const colors = STATUS_COLORS[colorKey] || STATUS_COLORS.pending
                    const doneCount = (block.checklist as { done: boolean }[]).filter(c => c.done).length
                    const totalCount = (block.checklist as { done: boolean }[]).length
                    const vehicle = block.vehicle
                    const desc = `${vehicle.year ?? ''} ${vehicle.make} ${vehicle.model}`.trim()

                    return (
                      <Link key={block.id} href={`/vehicles/${vehicle.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                        <div style={{
                          display: 'flex', gap: 14, alignItems: 'stretch',
                          background: colors.bg, border: `1px solid ${colors.border}`,
                          borderLeft: `4px solid ${colors.border}`,
                          borderRadius: 12, padding: '14px 16px',
                          transition: 'box-shadow 0.15s',
                        }}>
                          {/* Time column */}
                          <div style={{ minWidth: 60, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                            <p style={{ fontSize: 13, fontWeight: 700, color: colors.text }}>
                              {startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                            </p>
                            <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              {endTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                            </p>
                          </div>

                          {/* Info */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                              <div>
                                <p style={{ fontSize: 14, fontWeight: 700 }}>
                                  #{vehicle.stockNumber}
                                  {block.isContination && (
                                    <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 6 }}>
                                      (continued)
                                    </span>
                                  )}
                                </p>
                                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                                  {desc}{vehicle.color ? ` · ${vehicle.color}` : ''}
                                </p>
                              </div>
                              <span style={{
                                fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 100,
                                background: colors.border + '20', color: colors.border,
                                textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap',
                              }}>
                                {isOverdue ? 'Overdue' : (STATUS_LABELS[block.status] || block.status)}
                              </span>
                            </div>

                            {/* Progress bar */}
                            {totalCount > 0 && (
                              <div style={{ marginTop: 8 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                    {doneCount}/{totalCount} tasks
                                  </span>
                                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>
                                    {block.segmentHours ? `${block.segmentHours}h / ${hours}h total` : `${hours}h est.`}
                                  </span>
                                </div>
                                <div style={{ height: 4, background: '#e0e0e0', borderRadius: 2 }}>
                                  <div style={{
                                    height: '100%', borderRadius: 2,
                                    width: `${totalCount > 0 ? (doneCount / totalCount) * 100 : 0}%`,
                                    background: doneCount === totalCount ? 'var(--success)' : colors.border,
                                    transition: 'width 0.3s',
                                  }} />
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
