'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { CALENDAR_TYPE_LABELS, CALENDAR_TYPE_COLORS } from '@/lib/calendar'

type CalendarItem = {
  id: string
  title: string
  type: string
  date: string
  endDate: string | null
  allDay: boolean
  location: string | null
  status: string
  assignees: { user: { id: string; name: string } }[]
  vehicle: { id: string; stockNumber: string; make: string; model: string } | null
  event: { id: string; name: string } | null
}

function formatTime(d: string) {
  return new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}
function formatDateShort(d: Date) {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
function startOfWeek(d: Date) {
  const r = new Date(d)
  r.setDate(r.getDate() - r.getDay())
  r.setHours(0, 0, 0, 0)
  return r
}

const STATUS_ICONS: Record<string, string> = {
  scheduled: '',
  confirmed: 'Confirmed',
  in_progress: 'In Progress',
  completed: 'Done',
  cancelled: 'Cancelled',
}

export default function CalendarPage() {
  const [items, setItems] = useState<CalendarItem[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'agenda' | 'week'>('agenda')
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date()))
  const [typeFilter, setTypeFilter] = useState('')
  const [users, setUsers] = useState<{ id: string; name: string }[]>([])
  const [assigneeFilter, setAssigneeFilter] = useState('')

  useEffect(() => {
    fetch('/api/users').then(r => r.json()).then(d => setUsers((d.users || d).filter((x: { isActive: boolean }) => x.isActive)))
  }, [])

  useEffect(() => {
    const params = new URLSearchParams()
    if (view === 'week') {
      params.set('start', weekStart.toISOString())
      const end = new Date(weekStart)
      end.setDate(end.getDate() + 7)
      params.set('end', end.toISOString())
    }
    if (typeFilter) params.set('type', typeFilter)
    if (assigneeFilter) params.set('assigneeId', assigneeFilter)

    setLoading(true)
    fetch(`/api/calendar?${params}`).then(r => r.json()).then(d => { setItems(d); setLoading(false) })
  }, [view, weekStart, typeFilter, assigneeFilter])

  // Group items by day for agenda view
  const grouped = useMemo(() => {
    const groups: Record<string, CalendarItem[]> = {}
    items.forEach(item => {
      const key = new Date(item.date).toDateString()
      if (!groups[key]) groups[key] = []
      groups[key].push(item)
    })
    return Object.entries(groups).sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
  }, [items])

  // Week days
  const weekDays = useMemo(() => {
    const days: Date[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart)
      d.setDate(d.getDate() + i)
      days.push(d)
    }
    return days
  }, [weekStart])

  const today = new Date()

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>Calendar</h1>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 4 }}>Off-site schedule and appointments</p>
        </div>
        <Link href="/calendar/new" className="btn btn-primary" style={{ fontSize: 14 }}>
          New Item
        </Link>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* View toggle */}
        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          {(['agenda', 'week'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              background: view === v ? '#1a1a1a' : '#fff',
              color: view === v ? '#dffd6e' : 'var(--text-secondary)',
              minHeight: 36,
            }}>
              {v === 'agenda' ? 'Agenda' : 'Week'}
            </button>
          ))}
        </div>

        {/* Type filter */}
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13, background: '#fff', minHeight: 36 }}>
          <option value="">All Types</option>
          {Object.entries(CALENDAR_TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        {/* Assignee filter */}
        <select value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13, background: '#fff', minHeight: 36 }}>
          <option value="">All People</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>

        {/* Week nav (only in week view) */}
        {view === 'week' && (
          <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
            <button onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d) }}
              className="btn btn-secondary" style={{ padding: '8px 12px', minHeight: 36, fontSize: 13 }}>Prev</button>
            <button onClick={() => setWeekStart(startOfWeek(new Date()))}
              className="btn btn-secondary" style={{ padding: '8px 12px', minHeight: 36, fontSize: 13 }}>Today</button>
            <button onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d) }}
              className="btn btn-secondary" style={{ padding: '8px 12px', minHeight: 36, fontSize: 13 }}>Next</button>
          </div>
        )}
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-muted)', padding: 40, textAlign: 'center' }}>Loading...</p>
      ) : view === 'agenda' ? (
        /* ═══ AGENDA VIEW ═══ */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {grouped.length === 0 && (
            <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
              No scheduled items. Tap "New Item" to create one.
            </div>
          )}
          {grouped.map(([dateStr, dayItems]) => {
            const date = new Date(dateStr)
            const isToday = isSameDay(date, today)
            return (
              <div key={dateStr}>
                <div style={{
                  fontSize: 13,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: isToday ? '#1a1a1a' : 'var(--text-muted)',
                  marginBottom: 10,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}>
                  {isToday && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />}
                  {isToday ? 'Today' : formatDateShort(date)}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {dayItems.map(item => (
                    <ItemCard key={item.id} item={item} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        /* ═══ WEEK VIEW ═══ */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
          {weekDays.map(day => {
            const isToday = isSameDay(day, today)
            const dayItems = items.filter(item => isSameDay(new Date(item.date), day))
            return (
              <div key={day.toISOString()} style={{
                background: isToday ? 'rgba(223, 253, 110, 0.08)' : 'var(--bg-card)',
                border: `1px solid ${isToday ? 'var(--accent-dark)' : 'var(--border)'}`,
                borderRadius: 12,
                padding: 12,
                minHeight: 140,
              }}>
                <div style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: isToday ? '#1a1a1a' : 'var(--text-muted)',
                  marginBottom: 8,
                }}>
                  {day.toLocaleDateString('en-US', { weekday: 'short' })}
                  <span style={{ marginLeft: 4, fontSize: 14, fontWeight: 700 }}>
                    {day.getDate()}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {dayItems.map(item => (
                    <Link key={item.id} href={`/calendar/${item.id}`} style={{
                      display: 'block',
                      padding: '6px 8px',
                      borderRadius: 6,
                      borderLeft: `3px solid ${CALENDAR_TYPE_COLORS[item.type as keyof typeof CALENDAR_TYPE_COLORS] || '#6b7280'}`,
                      background: 'rgba(0,0,0,0.02)',
                      fontSize: 12,
                      fontWeight: 500,
                      color: 'var(--text-primary)',
                      textDecoration: 'none',
                      lineHeight: 1.3,
                    }}>
                      <div style={{ fontWeight: 600 }}>{item.title}</div>
                      {!item.allDay && <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{formatTime(item.date)}</div>}
                    </Link>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ItemCard({ item }: { item: CalendarItem }) {
  const typeColor = CALENDAR_TYPE_COLORS[item.type as keyof typeof CALENDAR_TYPE_COLORS] || '#6b7280'
  const typeLabel = CALENDAR_TYPE_LABELS[item.type as keyof typeof CALENDAR_TYPE_LABELS] || item.type

  return (
    <Link href={`/calendar/${item.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="card" style={{
        padding: '16px 20px',
        borderLeft: `4px solid ${typeColor}`,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        cursor: 'pointer',
      }}>
        {/* Time */}
        <div style={{ minWidth: 60, textAlign: 'center' }}>
          {item.allDay ? (
            <span style={{ fontSize: 12, fontWeight: 600, color: typeColor }}>All Day</span>
          ) : (
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{formatTime(item.date)}</span>
          )}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{item.title}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 12, color: 'var(--text-muted)' }}>
            <span style={{
              padding: '2px 8px',
              borderRadius: 6,
              background: `${typeColor}15`,
              color: typeColor,
              fontWeight: 600,
              fontSize: 11,
            }}>
              {typeLabel}
            </span>
            {item.location && <span>{item.location}</span>}
            {item.vehicle && <span>{item.vehicle.make} {item.vehicle.model}</span>}
          </div>
        </div>

        {/* Assignees */}
        <div style={{ display: 'flex', gap: -4 }}>
          {item.assignees.slice(0, 3).map(a => (
            <div key={a.user.id} style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: '#1a1a1a',
              color: '#dffd6e',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              fontWeight: 700,
              border: '2px solid #fff',
              marginLeft: -4,
            }}>
              {a.user.name.charAt(0)}
            </div>
          ))}
          {item.assignees.length > 3 && (
            <div style={{
              width: 28, height: 28, borderRadius: '50%', background: '#f0f0ec',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginLeft: -4,
            }}>+{item.assignees.length - 3}</div>
          )}
        </div>

        {/* Status */}
        {item.status !== 'scheduled' && (
          <span style={{ fontSize: 11, fontWeight: 600, color: item.status === 'completed' ? '#16a34a' : item.status === 'cancelled' ? '#ef4444' : 'var(--text-muted)' }}>
            {STATUS_ICONS[item.status]}
          </span>
        )}
      </div>
    </Link>
  )
}
