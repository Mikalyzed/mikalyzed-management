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
        <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  const isAdmin = data.user.role === 'admin'
  const isWorker = ['mechanic', 'detailer', 'content'].includes(data.user.role)
  const totalPipeline = data.pipeline.mechanic + data.pipeline.detailing + data.pipeline.content + data.pipeline.publish

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Welcome back, {data.user.name}
          </p>
        </div>
        {isAdmin && (
          <Link href="/vehicles/new" className="btn btn-primary gap-2">
            <span style={{ fontSize: '18px', lineHeight: 1 }}>+</span>
            <span className="hidden sm:inline">Add Vehicle</span>
          </Link>
        )}
      </div>

      {/* Stats */}
      {isAdmin && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="stat-card">
            <p className="stat-value">{totalPipeline}</p>
            <p className="stat-label">In Pipeline</p>
          </div>
          <div className="stat-card">
            <p className="stat-value" style={{ color: 'var(--success)' }}>{data.pipeline.completed}</p>
            <p className="stat-label">Completed</p>
          </div>
          <div className="stat-card">
            <p className="stat-value" style={{ color: data.overdue > 0 ? 'var(--danger)' : 'var(--text-primary)' }}>{data.overdue}</p>
            <p className="stat-label">Overdue</p>
          </div>
          <div className="stat-card">
            <p className="stat-value" style={{ color: data.blocked > 0 ? 'var(--warning)' : 'var(--text-primary)' }}>{data.blocked}</p>
            <p className="stat-label">Blocked</p>
          </div>
        </div>
      )}

      {isWorker && (
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="stat-card">
            <p className="stat-value" style={{ color: 'var(--accent)' }}>{data.myTasks}</p>
            <p className="stat-label">My Tasks</p>
          </div>
          <div className="stat-card">
            <p className="stat-value" style={{ color: data.overdue > 0 ? 'var(--danger)' : 'var(--text-primary)' }}>{data.overdue}</p>
            <p className="stat-label">Overdue</p>
          </div>
        </div>
      )}

      {/* Pipeline */}
      {isAdmin && (
        <div className="mb-8">
          <p className="section-label">Pipeline Overview</p>
          <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
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
              <p className="pipeline-chip-label">Completed</p>
            </div>
          </div>
        </div>
      )}

      {/* Recent vehicles */}
      {data.recentVehicles.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="section-label" style={{ marginBottom: 0 }}>Recent Vehicles</p>
            <Link href="/vehicles" className="text-xs font-medium" style={{ color: 'var(--accent)' }}>
              View All →
            </Link>
          </div>
          <div className="flex flex-col gap-2">
            {data.recentVehicles.map((v) => (
              <Link key={v.id} href={`/vehicles/${v.id}`}>
                <div className="card flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold tracking-tight">#{v.stockNumber}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {v.year} {v.make} {v.model}
                    </p>
                  </div>
                  <span className={`badge badge-${v.status}`}>
                    {v.status}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {data.recentVehicles.length === 0 && (
        <div className="card-flat text-center" style={{ padding: '60px 20px' }}>
          <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.04)', fontSize: '28px' }}>
            🚗
          </div>
          <p className="font-semibold text-lg mb-1">No vehicles yet</p>
          <p className="text-sm mb-6" style={{ color: 'var(--text-muted)', maxWidth: '300px', margin: '0 auto 24px' }}>
            Add your first vehicle to start tracking the recon workflow
          </p>
          <Link href="/vehicles/new" className="btn btn-primary">
            Add First Vehicle
          </Link>
        </div>
      )}
    </div>
  )
}
