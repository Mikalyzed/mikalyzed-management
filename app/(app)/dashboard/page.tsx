'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type DashboardData = {
  user: { name: string; role: string }
  pipeline: { mechanic: number; detailing: number; content: number; publish: number; completed: number }
  overdue: number
  blocked: number
  myTasks: number
  recentVehicles: Array<{
    id: string
    stockNumber: string
    year: number | null
    make: string
    model: string
    status: string
    color: string | null
  }>
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)

  useEffect(() => {
    fetch('/api/dashboard')
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
  }, [])

  if (!data) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: '60vh' }}>
        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#e0e0e0', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  const isAdmin = data.user.role === 'admin'
  const totalPipeline = data.pipeline.mechanic + data.pipeline.detailing + data.pipeline.content + data.pipeline.publish
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div>
      {/* Top bar with date */}
      <div className="flex items-center justify-end" style={{ marginBottom: '24px' }}>
        <span className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>{today}</span>
      </div>

      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)', marginTop: '4px' }}>
          Welcome back! Here&apos;s what&apos;s happening at the shop today.
        </p>
      </div>

      {/* Stat cards */}
      {isAdmin && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" style={{ marginBottom: '32px' }}>
          <div className="stat-card" style={{ borderLeft: '3px solid #dffd6e' }}>
            <p className="stat-label">In Pipeline</p>
            <p className="stat-value">{totalPipeline}</p>
            <p className="stat-sub">Awaiting completion</p>
          </div>
          <div className="stat-card" style={{ borderLeft: '3px solid var(--warning)' }}>
            <p className="stat-label">In Progress</p>
            <p className="stat-value">{data.pipeline.mechanic + data.pipeline.detailing}</p>
            <p className="stat-sub">Currently working</p>
          </div>
          <div className="stat-card" style={{ borderLeft: '3px solid var(--success)' }}>
            <p className="stat-label">Completed</p>
            <p className="stat-value">{data.pipeline.completed}</p>
            <p className="stat-sub">Ready for lot</p>
          </div>
          <div className="stat-card" style={{ borderLeft: data.overdue > 0 ? '3px solid var(--danger)' : '3px solid var(--border)' }}>
            <p className="stat-label">Overdue</p>
            <p className="stat-value" style={{ color: data.overdue > 0 ? 'var(--danger)' : undefined }}>{data.overdue}</p>
            <p className="stat-sub">{data.overdue > 0 ? 'Needs attention' : 'All on track'}</p>
          </div>
        </div>
      )}

      {/* Pipeline + Quick Actions — aligned at same baseline */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" style={{ alignItems: 'start' }}>
        {/* Left: Pipeline + Vehicles */}
        {isAdmin && (
          <div className="lg:col-span-2">
            {/* Pipeline header */}
            <div className="flex items-center justify-between" style={{ marginBottom: '16px' }}>
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold">Recon Pipeline</h2>
                {data.overdue > 0 && (
                  <span className="badge badge-blocked" style={{ fontSize: '11px' }}>
                    {data.overdue} overdue
                  </span>
                )}
              </div>
              <Link href="/vehicles" className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>
                View all →
              </Link>
            </div>

            {/* Pipeline chips */}
            <div className="grid grid-cols-3 md:grid-cols-5 gap-3" style={{ marginBottom: '24px' }}>
              <div className="pipeline-chip">
                <p className="pipeline-chip-value">{data.pipeline.mechanic}</p>
                <p className="pipeline-chip-label">Mechanic</p>
              </div>
              <div className="pipeline-chip">
                <p className="pipeline-chip-value">{data.pipeline.detailing}</p>
                <p className="pipeline-chip-label">Detailing</p>
              </div>
              <div className="pipeline-chip">
                <p className="pipeline-chip-value">{data.pipeline.content}</p>
                <p className="pipeline-chip-label">Content</p>
              </div>
              <div className="pipeline-chip">
                <p className="pipeline-chip-value">{data.pipeline.publish}</p>
                <p className="pipeline-chip-label">Publish</p>
              </div>
              <div className="pipeline-chip">
                <p className="pipeline-chip-value" style={{ color: 'var(--success)' }}>{data.pipeline.completed}</p>
                <p className="pipeline-chip-label">Done</p>
              </div>
            </div>

            {/* Recent vehicles */}
            {data.recentVehicles.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {data.recentVehicles.slice(0, 4).map((v) => (
                  <Link key={v.id} href={`/vehicles/${v.id}`}>
                    <div className="card">
                      <div className="flex items-start justify-between" style={{ marginBottom: '8px' }}>
                        <span className="text-sm font-bold" style={{ color: 'var(--text-secondary)' }}>#{v.stockNumber}</span>
                        <span className={`badge badge-${v.status}`}>{v.status}</span>
                      </div>
                      <p className="font-semibold">{v.year} {v.make} {v.model}</p>
                      {v.color && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{v.color}</p>}
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {/* Empty state */}
            {data.recentVehicles.length === 0 && (
              <div className="card-flat text-center" style={{ padding: '48px 20px' }}>
                <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center"
                  style={{ background: '#f5f5f3', fontSize: '24px', marginBottom: '16px' }}>
                  🚗
                </div>
                <p className="font-bold text-lg" style={{ marginBottom: '4px' }}>No vehicles yet</p>
                <p className="text-sm" style={{ color: 'var(--text-muted)', maxWidth: '280px', margin: '0 auto 24px' }}>
                  Add your first vehicle to start tracking the recon workflow
                </p>
                <Link href="/vehicles/new" className="btn btn-primary">
                  Add First Vehicle
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Right: Quick Actions — same top baseline as Recon Pipeline */}
        <div>
          <h2 className="text-lg font-bold" style={{ marginBottom: '16px' }}>Quick Actions</h2>
          <div className="flex flex-col gap-3">
            <Link href="/vehicles/new" className="card flex items-center gap-3" style={{ padding: '16px' }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold" style={{ background: '#dffd6e', color: '#1a1a1a', fontSize: '18px', flexShrink: 0 }}>+</div>
              <div>
                <p className="font-semibold text-sm">Add Vehicle</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Start recon process</p>
              </div>
            </Link>
            <Link href="/vehicles" className="card flex items-center gap-3" style={{ padding: '16px' }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#f0f0ec', fontSize: '16px', flexShrink: 0 }}>◫</div>
              <div>
                <p className="font-semibold text-sm">Recon Board</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>View pipeline</p>
              </div>
            </Link>
            <Link href="/transport" className="card flex items-center gap-3" style={{ padding: '16px' }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#f0f0ec', fontSize: '16px', flexShrink: 0 }}>⇄</div>
              <div>
                <p className="font-semibold text-sm">Transport</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Manage requests</p>
              </div>
            </Link>
          </div>

          {data.blocked > 0 && (
            <div className="p-4 rounded-xl" style={{ background: 'var(--warning-bg)', border: '1px solid var(--warning-border)', marginTop: '16px' }}>
              <p className="text-sm font-semibold" style={{ color: '#92400e' }}>⚠ {data.blocked} Blocked</p>
              <p className="text-xs" style={{ color: '#a16207', marginTop: '4px' }}>Vehicles waiting on resolution</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
