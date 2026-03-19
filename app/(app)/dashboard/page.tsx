'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CALENDAR_TYPE_LABELS, CALENDAR_TYPE_COLORS } from '@/lib/calendar'

type DashboardData = {
  user: { name: string; role: string; id: string }
  pipeline: { mechanic: number; detailing: number; content: number; publish: number; completed: number }
  overdue: number
  blocked: number
  myTasks: number
  recentVehicles: Array<{
    id: string; stockNumber: string; year: number | null; make: string; model: string; status: string; color: string | null
  }>
  myReconTasks: Array<{
    id: string; stage: string; status: string; priority: number
    vehicle: { id: string; stockNumber: string; year: number | null; make: string; model: string }
  }>
  myEventTasks: Array<{
    id: string; title: string; status: string; priority: string; dueDate: string | null
    section: { name: string; event: { id: string; name: string; date: string } }
  }>
  myCalendarItems: Array<{
    id: string; title: string; type: string; date: string; location: string | null; status: string
    vehicle: { id: string; stockNumber: string; make: string; model: string } | null
    event: { id: string; name: string } | null
  }>
  upcomingEvents: Array<{
    id: string; name: string; date: string; status: string
    owner: { id: string; name: string }
    progress: number; totalTasks: number; completedTasks: number
  }>
}

const STAGE_LABELS: Record<string, string> = {
  mechanic: 'Mechanic', detailing: 'Detailing', content: 'Content', publish: 'Publish',
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)

  useEffect(() => {
    fetch('/api/dashboard').then(r => r.json()).then(setData).catch(console.error)
  }, [])

  if (!data) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ width: 24, height: 24, border: '2px solid #e0e0e0', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      </div>
    )
  }

  const isAdmin = data.user.role === 'admin'
  const totalPipeline = data.pipeline.mechanic + data.pipeline.detailing + data.pipeline.content + data.pipeline.publish
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const hasAssignments = data.myReconTasks.length > 0 || data.myEventTasks.length > 0 || data.myCalendarItems.length > 0

  return (
    <div>
      {/* Date */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-muted)' }}>{today}</span>
      </div>

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em' }}>Dashboard</h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 4 }}>
          Welcome back, {data.user.name}.
        </p>
      </div>

      {/* ═══ Admin Stats ═══ */}
      {isAdmin && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 32 }}>
          <div className="stat-card" style={{ borderLeft: '3px solid #dffd6e' }}>
            <p className="stat-label">In Pipeline</p>
            <p className="stat-value">{totalPipeline}</p>
          </div>
          <div className="stat-card" style={{ borderLeft: '3px solid var(--warning)' }}>
            <p className="stat-label">In Progress</p>
            <p className="stat-value">{data.pipeline.mechanic + data.pipeline.detailing}</p>
          </div>
          <div className="stat-card" style={{ borderLeft: '3px solid var(--success)' }}>
            <p className="stat-label">Completed</p>
            <p className="stat-value">{data.pipeline.completed}</p>
          </div>
          <div className="stat-card" style={{ borderLeft: data.overdue > 0 ? '3px solid var(--danger)' : '3px solid var(--border)' }}>
            <p className="stat-label">Overdue</p>
            <p className="stat-value" style={{ color: data.overdue > 0 ? 'var(--danger)' : undefined }}>{data.overdue}</p>
          </div>
        </div>
      )}

      {/* ═══ My Assignments ═══ */}
      {hasAssignments && (
        <div style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>My Assignments</h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Recon tasks */}
            {data.myReconTasks.map(task => (
              <Link key={task.id} href={`/vehicles/${task.vehicle.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="card" style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14, borderLeft: '4px solid #9333ea' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>
                      {task.vehicle.year} {task.vehicle.make} {task.vehicle.model}
                      <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 8, fontSize: 12 }}>#{task.vehicle.stockNumber}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                      {STAGE_LABELS[task.stage] || task.stage} — {task.status === 'in_progress' ? 'In Progress' : task.status === 'pending' ? 'Pending' : task.status}
                    </div>
                  </div>
                  <span className={`badge badge-${task.stage}`} style={{ fontSize: 11 }}>
                    {STAGE_LABELS[task.stage] || task.stage}
                  </span>
                </div>
              </Link>
            ))}

            {/* Event tasks */}
            {data.myEventTasks.map(task => {
              const isOverdue = task.dueDate && new Date(task.dueDate) < new Date()
              return (
                <Link key={task.id} href={`/events/${task.section.event.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div className="card" style={{
                    padding: '14px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    borderLeft: `4px solid ${isOverdue ? '#ef4444' : '#65a30d'}`,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{task.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                        {task.section.event.name} — {task.section.name}
                        {task.dueDate && (
                          <span style={{ color: isOverdue ? '#ef4444' : undefined, marginLeft: 8 }}>
                            Due {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            {isOverdue && ' (overdue)'}
                          </span>
                        )}
                      </div>
                    </div>
                    {task.priority !== 'normal' && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                        color: task.priority === 'urgent' ? '#ef4444' : task.priority === 'high' ? '#f59e0b' : 'var(--text-muted)',
                      }}>{task.priority}</span>
                    )}
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, background: 'rgba(101, 163, 13, 0.1)', color: '#65a30d' }}>
                      Event
                    </span>
                  </div>
                </Link>
              )
            })}

            {/* Calendar items */}
            {data.myCalendarItems.map(item => {
              const typeColor = CALENDAR_TYPE_COLORS[item.type as keyof typeof CALENDAR_TYPE_COLORS] || '#6b7280'
              const typeLabel = CALENDAR_TYPE_LABELS[item.type as keyof typeof CALENDAR_TYPE_LABELS] || item.type
              const itemDate = new Date(item.date)
              const isToday = new Date().toDateString() === itemDate.toDateString()
              return (
                <Link key={item.id} href={`/calendar/${item.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div className="card" style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14, borderLeft: `4px solid ${typeColor}` }}>
                    <div style={{ minWidth: 50, textAlign: 'center' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: isToday ? '#1a1a1a' : 'var(--text-secondary)' }}>
                        {isToday ? 'Today' : itemDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {itemDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{item.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                        {item.location && <span>{item.location} · </span>}
                        {item.vehicle && <span>{item.vehicle.make} {item.vehicle.model} · </span>}
                        {typeLabel}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, background: `${typeColor}15`, color: typeColor }}>
                      {typeLabel}
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* No assignments message for workers */}
      {!hasAssignments && !isAdmin && (
        <div className="card" style={{ textAlign: 'center', padding: 40, marginBottom: 32, color: 'var(--text-muted)' }}>
          No assignments right now. You're all caught up.
        </div>
      )}

      {/* ═══ Upcoming Events (admin) ═══ */}
      {isAdmin && data.upcomingEvents.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700 }}>Upcoming Events</h2>
            <Link href="/events" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textDecoration: 'none', minHeight: 'auto' }}>View all →</Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.upcomingEvents.map(event => {
              const daysUntil = Math.ceil((new Date(event.date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
              const healthColor = event.totalTasks === 0 ? 'var(--text-muted)' : event.progress === 100 ? '#16a34a' : daysUntil <= 3 && event.progress < 50 ? '#ef4444' : '#1a1a1a'
              return (
                <Link key={event.id} href={`/events/${event.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div className="card" style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>{event.name}</div>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {daysUntil <= 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : `${daysUntil} days`}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ flex: 1, height: 5, background: '#f0f0ec', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${event.progress}%`, height: '100%', background: healthColor, borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: healthColor }}>{event.progress}%</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{event.completedTasks}/{event.totalTasks}</span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* ═══ Pipeline + Quick Actions (admin) ═══ */}
      {isAdmin && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 32 }}>
          {/* Pipeline */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>Recon Pipeline</h2>
              <Link href="/vehicles" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textDecoration: 'none', minHeight: 'auto' }}>View all →</Link>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 10, marginBottom: 20 }}>
              {(['mechanic', 'detailing', 'content', 'publish', 'completed'] as const).map(stage => (
                <div key={stage} className="pipeline-chip">
                  <p className="pipeline-chip-value" style={{ color: stage === 'completed' ? 'var(--success)' : undefined }}>
                    {data.pipeline[stage]}
                  </p>
                  <p className="pipeline-chip-label">{STAGE_LABELS[stage] || 'Done'}</p>
                </div>
              ))}
            </div>

            {/* Recent vehicles */}
            {data.recentVehicles.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
                {data.recentVehicles.slice(0, 4).map(v => (
                  <Link key={v.id} href={`/vehicles/${v.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div className="card" style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>#{v.stockNumber}</span>
                        <span className={`badge badge-${v.status}`} style={{ fontSize: 11 }}>{v.status}</span>
                      </div>
                      <p style={{ fontSize: 14, fontWeight: 600 }}>{v.year} {v.make} {v.model}</p>
                      {v.color && <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{v.color}</p>}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Quick Actions</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
              {[
                { href: '/vehicles/new', label: 'Add Vehicle', sub: 'Start recon process', icon: '+', bg: '#dffd6e' },
                { href: '/calendar/new', label: 'New Calendar Item', sub: 'Schedule off-site', icon: '◎', bg: '#f0f0ec' },
                { href: '/events/new', label: 'New Event', sub: 'Plan an event', icon: '★', bg: '#f0f0ec' },
                { href: '/transport/new', label: 'Transport Request', sub: 'Request pickup/delivery', icon: '⇄', bg: '#f0f0ec' },
              ].map(action => (
                <Link key={action.href} href={action.href} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div className="card" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 10, background: action.bg,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 18, fontWeight: 700, color: '#1a1a1a', flexShrink: 0,
                    }}>{action.icon}</div>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 600 }}>{action.label}</p>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{action.sub}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
