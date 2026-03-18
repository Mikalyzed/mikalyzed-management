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

  if (!data) return <p style={{ color: 'var(--text-muted)' }}>Loading dashboard...</p>

  const isAdmin = data.user.role === 'admin'
  const isWorker = ['mechanic', 'detailer', 'content'].includes(data.user.role)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">Hey, {data.user.name} 👋</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {isAdmin ? 'Here\'s your operation overview' : 'Here\'s what needs your attention'}
          </p>
        </div>
        {isAdmin && (
          <Link
            href="/vehicles/new"
            className="px-4 py-2 rounded-lg font-semibold text-sm text-white"
            style={{ background: 'var(--accent)' }}
          >
            + Add Vehicle
          </Link>
        )}
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {isAdmin && (
          <>
            <StatCard label="In Pipeline" value={
              data.pipeline.mechanic + data.pipeline.detailing + data.pipeline.content + data.pipeline.publish
            } />
            <StatCard label="Completed" value={data.pipeline.completed} color="var(--success)" />
            <StatCard label="Overdue" value={data.overdue} color={data.overdue > 0 ? 'var(--danger)' : undefined} />
            <StatCard label="Blocked" value={data.blocked} color={data.blocked > 0 ? 'var(--warning)' : undefined} />
          </>
        )}
        {isWorker && (
          <>
            <StatCard label="My Tasks" value={data.myTasks} color="var(--accent)" />
            <StatCard label="Overdue" value={data.overdue} color={data.overdue > 0 ? 'var(--danger)' : undefined} />
          </>
        )}
      </div>

      {/* Pipeline breakdown for admin */}
      {isAdmin && (
        <div className="card mb-6">
          <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>
            Pipeline
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <PipelineStage label="🔧 Mechanic" count={data.pipeline.mechanic} />
            <PipelineStage label="✨ Detailing" count={data.pipeline.detailing} />
            <PipelineStage label="📸 Content" count={data.pipeline.content} />
            <PipelineStage label="🚀 Publish" count={data.pipeline.publish} />
            <PipelineStage label="✅ Done" count={data.pipeline.completed} />
          </div>
        </div>
      )}

      {/* Recent vehicles */}
      {data.recentVehicles.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>
            Recent Vehicles
          </h2>
          <div className="flex flex-col gap-2">
            {data.recentVehicles.map((v) => (
              <Link key={v.id} href={`/vehicles/${v.id}`} className="card flex items-center justify-between">
                <div>
                  <p className="font-semibold text-sm">#{v.stockNumber}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {v.year} {v.make} {v.model}
                  </p>
                </div>
                <span className={`badge badge-${v.status}`}>
                  {v.status}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="card text-center">
      <p className="text-2xl font-bold" style={{ color: color || 'var(--text-primary)' }}>
        {value}
      </p>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</p>
    </div>
  )
}

function PipelineStage({ label, count }: { label: string; count: number }) {
  return (
    <div className="text-center p-2 rounded-lg" style={{ background: 'var(--bg-primary)' }}>
      <p className="text-lg font-bold">{count}</p>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</p>
    </div>
  )
}
