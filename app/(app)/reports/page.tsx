'use client'

import { useEffect, useState } from 'react'

type ReportsData = {
  pipeline: { mechanic: number; detailing: number; content: number; publish: number; completed: number }
  vehiclesInStage: Array<{ id: string; stockNumber: string; year: number | null; make: string; model: string; status: string; stageStatus: string; hoursInStage: number }>
  stageTimes: Array<{ stage: string; avgHours: number; count: number }>
  completedThisWeek: number
  completedThisMonth: number
  totalVehicles: number
  transportOpen: number
  transportDelivered: number
}

type ArchivedMeeting = { date: string; savedAt: string | null; url: string }

export default function ReportsPage() {
  const [data, setData] = useState<ReportsData | null>(null)
  const [meetings, setMeetings] = useState<ArchivedMeeting[] | null>(null)
  const [myRole, setMyRole] = useState<string>('')

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => setMyRole(d.user?.role ?? '')).catch(() => {})
    fetch('/api/reports')
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
    // Meeting archive — 403 for roles without access; section simply hides.
    fetch('/api/reports/vehicle-status/archive')
      .then(r => (r.ok ? r.json() : null))
      .then(d => setMeetings(d?.meetings ?? null))
      .catch(() => setMeetings(null))
  }, [])

  if (!data) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: '60vh' }}>
        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#e0e0e0', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8 flex items-start justify-between" style={{ gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Performance metrics and bottleneck analysis
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {myRole === 'admin' && <a
            href="/reports/meeting"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: '#1a1a1a', color: '#dffd6e', textDecoration: 'none',
              padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600,
            }}
          >☀ Morning Meeting</a>}
          {(myRole === 'admin' || myRole === 'sales_manager') && <a
            href="/api/reports/vehicle-status?format=pdf"
            download
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: '#fff', color: 'var(--text-primary)', textDecoration: 'none',
              border: '1px solid var(--border)',
              padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600,
            }}
          >⬇ Status Report (PDF)</a>}
        </div>
      </div>

      {/* Overview stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4" style={{ gap: '16px', marginBottom: '32px' }}>
        <div className="stat-card" style={{ borderLeft: '3px solid #dffd6e' }}>
          <p className="stat-label">Total Vehicles</p>
          <p className="stat-value">{data.totalVehicles}</p>
        </div>
        <div className="stat-card" style={{ borderLeft: '3px solid var(--success)' }}>
          <p className="stat-label">This Week</p>
          <p className="stat-value" style={{ color: 'var(--success)' }}>{data.completedThisWeek}</p>
          <p className="stat-sub">Completed</p>
        </div>
        <div className="stat-card" style={{ borderLeft: '3px solid var(--info)' }}>
          <p className="stat-label">This Month</p>
          <p className="stat-value">{data.completedThisMonth}</p>
          <p className="stat-sub">Completed</p>
        </div>
        <div className="stat-card" style={{ borderLeft: '3px solid var(--warning)' }}>
          <p className="stat-label">Transport</p>
          <p className="stat-value">{data.transportOpen}</p>
          <p className="stat-sub">{data.transportDelivered} delivered</p>
        </div>
      </div>

      {/* Meeting archive — saved Morning Meeting snapshots */}
      {meetings && meetings.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h2 className="text-lg font-bold mb-1">Meeting Archive</h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)', marginBottom: 12 }}>
            Saved Morning Meeting snapshots — open any date to see that day's full status report.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {meetings.map(m => (
              <a
                key={m.date}
                href={m.url}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  border: '1px solid var(--border)', borderRadius: 10,
                  padding: '8px 14px', fontSize: 13, fontWeight: 600,
                  color: 'var(--text-primary)', textDecoration: 'none',
                  background: 'var(--bg-card)',
                }}
              >
                🗂 {new Date(`${m.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: '24px' }}>
        {/* Avg time per stage */}
        <div className="card">
          <h2 className="text-lg font-bold mb-4">Avg Time Per Stage</h2>
          {data.stageTimes.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No completed stages yet</p>
          ) : (
            <div className="flex flex-col gap-3">
              {data.stageTimes.map((s) => {
                const label = s.stage.charAt(0).toUpperCase() + s.stage.slice(1)
                const displayTime = s.avgHours < 1
                  ? `${Math.round(s.avgHours * 60)}m`
                  : s.avgHours < 24
                    ? `${s.avgHours.toFixed(1)}h`
                    : `${(s.avgHours / 24).toFixed(1)}d`
                const maxHours = Math.max(...data.stageTimes.map((x) => x.avgHours), 1)
                const pct = Math.min((s.avgHours / maxHours) * 100, 100)

                return (
                  <div key={s.stage}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium">{label}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{displayTime} · {s.count} done</span>
                    </div>
                    <div className="h-2 rounded-full" style={{ background: 'var(--border)' }}>
                      <div className="h-2 rounded-full" style={{
                        width: `${pct}%`,
                        background: s.stage === 'mechanic' ? '#9333ea'
                          : s.stage === 'detailing' ? '#2563eb'
                          : s.stage === 'content' ? '#d97706'
                          : '#16a34a',
                      }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Time in Stage */}
        <div className="card">
          <h2 className="text-lg font-bold mb-4">
            Time in Stage
            {data.vehiclesInStage.length > 0 && (
              <span className="ml-2 text-xs font-normal" style={{ color: 'var(--text-muted)' }}>{data.vehiclesInStage.length} active</span>
            )}
          </h2>
          {data.vehiclesInStage.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-lg">✅</p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>No active vehicles</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {data.vehiclesInStage.map((v) => {
                const displayTime = v.hoursInStage < 1
                  ? `${Math.round(v.hoursInStage * 60)}m`
                  : v.hoursInStage < 24
                    ? `${v.hoursInStage.toFixed(1)}h`
                    : `${(v.hoursInStage / 24).toFixed(1)}d`
                return (
                  <div key={v.id} className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'var(--bg-primary)' }}>
                    <div>
                      <p className="text-sm font-semibold">#{v.stockNumber}</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {v.year} {v.make} {v.model}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className={`badge badge-${v.status}`}>{v.status}</span>
                      <p className="text-xs mt-1 font-medium" style={{ color: 'var(--text-muted)' }}>
                        {displayTime}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
