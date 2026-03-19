'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { EVENT_TYPE_LABELS, EVENT_STATUS_LABELS } from '@/lib/events'

type EventItem = {
  id: string
  name: string
  type: string
  date: string
  endDate: string | null
  location: string | null
  status: string
  owner: { id: string; name: string }
  progress: number
  totalTasks: number
  completedTasks: number
}

const STATUS_TABS = ['all', 'draft', 'planned', 'active', 'completed', 'cancelled'] as const

export default function EventsPage() {
  const [events, setEvents] = useState<EventItem[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('all')

  useEffect(() => {
    const params = statusFilter !== 'all' ? `?status=${statusFilter}` : ''
    setLoading(true)
    fetch(`/api/events${params}`).then(r => r.json()).then(d => { setEvents(d); setLoading(false) })
  }, [statusFilter])

  const now = new Date()

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>Events</h1>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 4 }}>Plan and track dealership events</p>
        </div>
        <Link href="/events/new" className="btn btn-primary" style={{ fontSize: 14 }}>
          New Event
        </Link>
      </div>

      {/* Status tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, overflowX: 'auto', paddingBottom: 4 }}>
        {STATUS_TABS.map(tab => (
          <button key={tab} onClick={() => setStatusFilter(tab)} style={{
            padding: '8px 16px',
            borderRadius: 8,
            border: '1px solid',
            borderColor: statusFilter === tab ? '#1a1a1a' : 'var(--border)',
            background: statusFilter === tab ? '#1a1a1a' : '#fff',
            color: statusFilter === tab ? '#dffd6e' : 'var(--text-secondary)',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            minHeight: 36,
            whiteSpace: 'nowrap',
            textTransform: 'capitalize',
          }}>
            {tab === 'all' ? 'All' : EVENT_STATUS_LABELS[tab as keyof typeof EVENT_STATUS_LABELS]}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-muted)', padding: 40, textAlign: 'center' }}>Loading...</p>
      ) : events.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          No events yet. Tap "New Event" to create one.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {events.map(event => {
            const date = new Date(event.date)
            const isPast = date < now && event.status !== 'completed'
            const daysUntil = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
            const healthColor = event.totalTasks === 0 ? 'var(--text-muted)'
              : event.progress === 100 ? '#16a34a'
              : isPast ? '#ef4444'
              : daysUntil <= 3 && event.progress < 50 ? '#ef4444'
              : daysUntil <= 7 && event.progress < 70 ? '#f59e0b'
              : '#22c55e'

            return (
              <Link key={event.id} href={`/events/${event.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="card" style={{ padding: '20px 24px', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>{event.name}</h3>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 13, color: 'var(--text-muted)' }}>
                        <span>{date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                        {event.location && <span>· {event.location}</span>}
                        <span>· {EVENT_TYPE_LABELS[event.type as keyof typeof EVENT_TYPE_LABELS] || event.type}</span>
                      </div>
                    </div>
                    <span className={`badge badge-${event.status === 'active' ? 'in-progress' : event.status === 'completed' ? 'done' : event.status === 'cancelled' ? 'blocked' : 'pending'}`}>
                      {EVENT_STATUS_LABELS[event.status as keyof typeof EVENT_STATUS_LABELS] || event.status}
                    </span>
                  </div>

                  {/* Progress */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1, height: 6, background: '#f0f0ec', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${event.progress}%`, height: '100%', background: healthColor, borderRadius: 3, transition: 'width 0.3s' }} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: healthColor, minWidth: 40, textAlign: 'right' }}>
                      {event.progress}%
                    </span>
                  </div>

                  {/* Footer */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
                    <span>Owner: {event.owner.name}</span>
                    <span>{event.completedTasks}/{event.totalTasks} tasks</span>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
