'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CALENDAR_TYPE_LABELS, CALENDAR_TYPE_COLORS } from '@/lib/calendar'

type DashboardData = {
  user: { name: string; role: string; id: string }
  pipeline: { mechanic: number; detailing: number; content: number; publish: number; completed: number; externalRepairs: number }
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
  myBoardTasks: Array<{
    id: string; title: string; category: string; status: string; priority: number; dueDate: string | null
  }>
  upcomingEvents: Array<{
    id: string; name: string; date: string; status: string
    owner: { id: string; name: string }
    progress: number; totalTasks: number; completedTasks: number
  }>
}

const STAGE_LABELS: Record<string, string> = {
  mechanic: 'Mechanic', detailing: 'Detailing', content: 'Content', publish: 'Publish', completed: 'Done',
}

// ─── My Assignments Component ───
function MyAssignments({ data }: { data: DashboardData }) {
  const hasRecon = data.myReconTasks.length > 0
  const hasEvents = data.myEventTasks.length > 0
  const hasCalendar = data.myCalendarItems.length > 0
  const hasBoardTasks = (data.myBoardTasks || []).length > 0

  // Count how many categories have items
  const categories = [hasRecon, hasEvents, hasCalendar, hasBoardTasks].filter(Boolean).length
  const showTabs = categories > 1

  const [filter, setFilter] = useState<'all' | 'recon' | 'events' | 'calendar' | 'tasks'>('all')

  const tabs: { key: typeof filter; label: string; count: number }[] = []
  tabs.push({ key: 'all', label: 'All', count: data.myReconTasks.length + data.myEventTasks.length + data.myCalendarItems.length + (data.myBoardTasks || []).length })
  if (hasRecon) tabs.push({ key: 'recon', label: 'Recon', count: data.myReconTasks.length })
  if (hasBoardTasks) tabs.push({ key: 'tasks', label: 'Tasks', count: (data.myBoardTasks || []).length })
  if (hasEvents) tabs.push({ key: 'events', label: 'Events', count: data.myEventTasks.length })
  if (hasCalendar) tabs.push({ key: 'calendar', label: 'Calendar', count: data.myCalendarItems.length })

  const showRecon = filter === 'all' || filter === 'recon'
  const showEvents = filter === 'all' || filter === 'events'
  const showCalendar = filter === 'all' || filter === 'calendar'

  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>My Assignments</h2>
      </div>

      {/* Filter tabs — only show if multiple categories */}
      {showTabs && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto', paddingBottom: 2 }}>
          {tabs.map(tab => (
            <button key={tab.key} onClick={() => setFilter(tab.key)} style={{
              padding: '7px 14px',
              borderRadius: 8,
              border: '1px solid',
              borderColor: filter === tab.key ? '#1a1a1a' : 'var(--border)',
              background: filter === tab.key ? '#1a1a1a' : '#fff',
              color: filter === tab.key ? '#dffd6e' : 'var(--text-secondary)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              minHeight: 34,
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}>
              {tab.label}
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '1px 7px',
                borderRadius: 6,
                background: filter === tab.key ? 'rgba(223,253,110,0.2)' : '#f0f0ec',
                color: filter === tab.key ? '#dffd6e' : 'var(--text-muted)',
              }}>{tab.count}</span>
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* ── Recon Section ── */}
        {showRecon && hasRecon && (
          <>
            {filter === 'all' && categories > 1 && (
              <div className="section-label" style={{ marginTop: 4 }}>Recon Board</div>
            )}
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
          </>
        )}

        {/* ── Events Section ── */}
        {showEvents && hasEvents && (
          <>
            {filter === 'all' && categories > 1 && (
              <div className="section-label" style={{ marginTop: 12 }}>Events</div>
            )}
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
          </>
        )}

        {/* ── Calendar Section ── */}
        {showCalendar && hasCalendar && (
          <>
            {filter === 'all' && categories > 1 && (
              <div className="section-label" style={{ marginTop: 12 }}>Calendar</div>
            )}
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
          </>
        )}

        {/* Board Tasks */}
        {(filter === 'all' || filter === 'tasks') && hasBoardTasks && (
          <>
            {filter === 'all' && categories > 1 && (
              <div className="section-label" style={{ marginTop: 12 }}>Tasks</div>
            )}
            {(data.myBoardTasks || []).map(task => {
              const catColors: Record<string, string> = { content: '#8b5cf6', marketing: '#3b82f6', admin: '#64748b', operations: '#f59e0b' }
              const catLabels: Record<string, string> = { content: 'Content', marketing: 'Marketing', admin: 'Admin', operations: 'Operations' }
              const color = catColors[task.category] || '#888'
              return (
                <Link key={task.id} href="/task-board" style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div className="card" style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14, borderLeft: `4px solid ${color}` }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{task.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                        {catLabels[task.category] || task.category}
                        {task.dueDate && ` · Due ${new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                      </div>
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6,
                      background: task.priority === 2 ? '#fef2f2' : task.priority === 1 ? '#fffbeb' : `${color}15`,
                      color: task.priority === 2 ? '#ef4444' : task.priority === 1 ? '#f59e0b' : color,
                    }}>
                      {task.priority === 2 ? 'Urgent' : task.priority === 1 ? 'High' : catLabels[task.category] || 'Task'}
                    </span>
                  </div>
                </Link>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Add Button Dropdown ───
function AddButton() {
  const [open, setOpen] = useState(false)

  const actions = [
    { href: '/leads/new', label: 'New Lead' },
    { href: '/vehicles/new', label: 'Add Vehicle' },
    { href: '/calendar/new', label: 'Calendar Item' },
    { href: '/events/new', label: 'New Event' },
    { href: '/transport/new', label: 'Transport Request' },
    { href: '/external', label: 'External Repair' },
  ]

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: 38, height: 38, borderRadius: 10,
          background: '#1a1a1a', color: '#dffd6e',
          border: 'none', cursor: 'pointer',
          fontSize: 20, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          minHeight: 'auto',
          transition: 'transform 0.2s',
          transform: open ? 'rotate(45deg)' : 'none',
        }}
      >+</button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 50 }} />
          <div style={{
            position: 'absolute', top: 44, right: 0, zIndex: 51,
            background: '#fff', border: '1px solid var(--border)',
            borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
            padding: '6px', minWidth: 200,
          }}>
            {actions.map(a => (
              <Link key={a.href} href={a.href} onClick={() => setOpen(false)} style={{
                display: 'block', padding: '10px 14px', borderRadius: 8,
                fontSize: 14, fontWeight: 500, color: 'var(--text-primary)',
                textDecoration: 'none', minHeight: 'auto',
                transition: 'background 0.1s',
              }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-primary)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                {a.label}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Main Dashboard ───
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
  const hasAssignments = data.myReconTasks.length > 0 || data.myEventTasks.length > 0 || data.myCalendarItems.length > 0 || (data.myBoardTasks || []).length > 0

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>Dashboard</h1>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 4 }}>Welcome back, {data.user.name}.</p>
        </div>
        {isAdmin && <AddButton />}
      </div>

      {/* ═══ Recon Pipeline ═══ */}
      {isAdmin && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700 }}>Recon Pipeline</h2>
            <Link href="/vehicles" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textDecoration: 'none', minHeight: 'auto' }}>View all →</Link>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {(['mechanic', 'detailing', 'content', 'publish'] as const).map(stage => (
              <div key={stage} className="pipeline-chip" style={{ flex: '1 1 100px' }}>
                <p className="pipeline-chip-value">{data.pipeline[stage]}</p>
                <p className="pipeline-chip-label">{STAGE_LABELS[stage]}</p>
              </div>
            ))}
            <div style={{ width: 1, height: 40, background: 'var(--border)', flexShrink: 0 }} />
            <Link href="/external" style={{ flex: '1 1 100px', textDecoration: 'none', color: 'inherit' }}>
              <div className="pipeline-chip">
                <p className="pipeline-chip-value" style={{ color: data.pipeline.externalRepairs > 0 ? '#e67e22' : 'var(--text-muted)' }}>
                  {data.pipeline.externalRepairs}
                </p>
                <p className="pipeline-chip-label">External</p>
              </div>
            </Link>
          </div>
        </div>
      )}

      {/* ═══ My Assignments ═══ */}
      {hasAssignments && <MyAssignments data={data} />}

      {/* No assignments for workers */}
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

      {/* ═══ Upcoming Calendar (admin) ═══ */}
      {isAdmin && data.myCalendarItems.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700 }}>Upcoming Schedule</h2>
            <Link href="/calendar" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textDecoration: 'none', minHeight: 'auto' }}>View all →</Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.myCalendarItems.slice(0, 5).map(item => {
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
                        {typeLabel}
                      </div>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
