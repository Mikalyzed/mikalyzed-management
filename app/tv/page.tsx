'use client'

import { useEffect, useState, useCallback, useRef } from 'react'

type PipelineStage = { total: number; inProgress: number; pending: number; done: number }
type ActiveJob = {
  stockNumber: string; vehicle: string; color: string | null; assignee: string
  estimatedHours: number | null; activeSeconds: number; timerRunning: boolean; timerStartedAt: string | null; stage: string
}
type CompletedItem = { stockNumber: string; vehicle: string; stage: string; assignee: string | null; completedAt: string }
type TVData = {
  pipeline: Record<string, PipelineStage>
  mechanicActive: ActiveJob[]; detailingActive: ActiveJob[]; contentActive: ActiveJob[]
  awaitingParts: number; externalRepairs: number; completedToday: number
  totalInventory: number; inRecon: number; completedVehicles: CompletedItem[]
  timestamp: string
}

const STAGE_LABELS: Record<string, string> = { mechanic: 'Mechanic', detailing: 'Detailing', content: 'Content', publish: 'Publish' }
const STAGE_COLORS: Record<string, string> = { mechanic: '#3b82f6', detailing: '#8b5cf6', content: '#f59e0b', publish: '#22c55e' }

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function formatClock(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' })
}

function LiveTimer({ job }: { job: ActiveJob }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!job.timerRunning) return
    const i = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(i)
  }, [job.timerRunning])

  let sec = job.activeSeconds || 0
  if (job.timerRunning && job.timerStartedAt) {
    sec += Math.max(0, Math.floor((Date.now() - new Date(job.timerStartedAt).getTime()) / 1000))
  }
  const est = (job.estimatedHours || 2) * 3600
  const isOver = sec > est
  const pct = Math.min((sec / est) * 100, 100)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: isOver ? '#ef4444' : '#fff' }}>{formatTime(sec)}</span>
        <span style={{ fontSize: 14, color: '#666' }}>{job.estimatedHours || 2}h est.</span>
      </div>
      <div style={{ height: 6, background: '#2a2a2a', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 3, transition: 'width 1s linear',
          width: `${pct}%`,
          background: isOver ? '#ef4444' : pct > 80 ? '#f59e0b' : '#22c55e',
        }} />
      </div>
    </div>
  )
}

export default function TVBoard() {
  const [data, setData] = useState<TVData | null>(null)
  const [clock, setClock] = useState(new Date())
  const refreshRef = useRef<NodeJS.Timeout>()

  const fetchData = useCallback(() => {
    fetch('/api/tv-board')
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetchData()
    refreshRef.current = setInterval(fetchData, 30000) // Refresh every 30s
    const clockInterval = setInterval(() => setClock(new Date()), 1000)
    return () => {
      clearInterval(refreshRef.current)
      clearInterval(clockInterval)
    }
  }, [fetchData])

  if (!data) {
    return (
      <div style={{ background: '#0a0a0a', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#666', fontSize: 24 }}>Loading...</p>
      </div>
    )
  }

  const stageOrder = ['mechanic', 'detailing', 'content', 'publish']
  const allActive = [...data.mechanicActive, ...data.detailingActive, ...data.contentActive]

  return (
    <div style={{
      background: '#0a0a0a', minHeight: '100vh', color: '#fff',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      padding: '24px 32px', overflow: 'hidden',
    }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', margin: 0 }}>
            Mikalyzed Auto Boutique
          </h1>
          <p style={{ fontSize: 14, color: '#666', margin: '2px 0 0', fontWeight: 600 }}>Operations Overview</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 32, fontWeight: 700, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{formatClock(clock)}</p>
          <p style={{ fontSize: 13, color: '#666', margin: 0 }}>
            {clock.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/New_York' })}
          </p>
        </div>
      </div>

      {/* Top Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'In Recon', value: data.inRecon, color: '#3b82f6' },
          { label: 'Completed Today', value: data.completedToday, color: '#22c55e' },
          { label: 'Awaiting Parts', value: data.awaitingParts, color: '#eab308' },
          { label: 'External Repairs', value: data.externalRepairs, color: '#f97316' },
          { label: 'Active Now', value: allActive.filter(j => j.timerRunning).length, color: '#06b6d4' },
          { label: 'Total Inventory', value: data.totalInventory, color: '#8b5cf6' },
        ].map(stat => (
          <div key={stat.label} style={{
            background: '#111', borderRadius: 14, padding: '16px 18px',
            borderLeft: `4px solid ${stat.color}`,
          }}>
            <p style={{ fontSize: 36, fontWeight: 800, margin: 0, color: stat.color, lineHeight: 1 }}>{stat.value}</p>
            <p style={{ fontSize: 12, color: '#888', margin: '6px 0 0', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Pipeline Progress */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {stageOrder.map(stage => {
          const p = data.pipeline[stage] || { total: 0, inProgress: 0, pending: 0, done: 0 }
          const color = STAGE_COLORS[stage]
          return (
            <div key={stage} style={{ background: '#111', borderRadius: 14, padding: '16px 18px', borderTop: `3px solid ${color}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 16, fontWeight: 700 }}>{STAGE_LABELS[stage]}</span>
                <span style={{ fontSize: 28, fontWeight: 800, color }}>{p.total}</span>
              </div>
              <div style={{ display: 'flex', gap: 12, fontSize: 13, color: '#888' }}>
                <span><span style={{ color: '#3b82f6', fontWeight: 700 }}>{p.inProgress}</span> active</span>
                <span><span style={{ color: '#888', fontWeight: 700 }}>{p.pending}</span> queued</span>
                <span><span style={{ color: '#22c55e', fontWeight: 700 }}>{p.done}</span> done today</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Main Content: Active Work + Completed Feed */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 340px', gap: 16 }}>

        {/* Mechanic Column */}
        <div style={{ background: '#111', borderRadius: 14, padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#3b82f6' }} />
            <span style={{ fontSize: 16, fontWeight: 700 }}>Mechanic</span>
          </div>
          {data.mechanicActive.length === 0 ? (
            <p style={{ color: '#444', fontSize: 14, fontStyle: 'italic' }}>No active work</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {data.mechanicActive.map(job => (
                <div key={job.stockNumber} style={{
                  background: '#1a1a1a', borderRadius: 12, padding: '14px 16px',
                  borderLeft: `3px solid ${job.timerRunning ? '#3b82f6' : '#f59e0b'}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 16, fontWeight: 700 }}>#{job.stockNumber}</span>
                    {job.timerRunning ? (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 100, background: '#3b82f620', color: '#3b82f6' }}>ACTIVE</span>
                    ) : (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 100, background: '#f59e0b20', color: '#f59e0b' }}>PAUSED</span>
                    )}
                  </div>
                  <p style={{ fontSize: 13, color: '#888', margin: '0 0 4px' }}>{job.vehicle}{job.color ? ` · ${job.color}` : ''}</p>
                  <p style={{ fontSize: 12, color: '#555', margin: '0 0 8px' }}>{job.assignee}</p>
                  <LiveTimer job={job} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detailing + Content Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Detailing */}
          <div style={{ background: '#111', borderRadius: 14, padding: '18px 20px', flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#8b5cf6' }} />
              <span style={{ fontSize: 16, fontWeight: 700 }}>Detailing</span>
            </div>
            {data.detailingActive.length === 0 ? (
              <p style={{ color: '#444', fontSize: 14, fontStyle: 'italic' }}>No active work</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {data.detailingActive.map(job => (
                  <div key={job.stockNumber} style={{ background: '#1a1a1a', borderRadius: 10, padding: '12px 14px', borderLeft: '3px solid #8b5cf6' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 15, fontWeight: 700 }}>#{job.stockNumber}</span>
                      <span style={{ fontSize: 12, color: '#888' }}>{job.assignee}</span>
                    </div>
                    <p style={{ fontSize: 13, color: '#666', margin: '2px 0 0' }}>{job.vehicle}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Content */}
          <div style={{ background: '#111', borderRadius: 14, padding: '18px 20px', flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b' }} />
              <span style={{ fontSize: 16, fontWeight: 700 }}>Content</span>
            </div>
            {data.contentActive.length === 0 ? (
              <p style={{ color: '#444', fontSize: 14, fontStyle: 'italic' }}>No active work</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {data.contentActive.map(job => (
                  <div key={job.stockNumber} style={{ background: '#1a1a1a', borderRadius: 10, padding: '12px 14px', borderLeft: '3px solid #f59e0b' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 15, fontWeight: 700 }}>#{job.stockNumber}</span>
                      <span style={{ fontSize: 12, color: '#888' }}>{job.assignee}</span>
                    </div>
                    <p style={{ fontSize: 13, color: '#666', margin: '2px 0 0' }}>{job.vehicle}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Activity Feed */}
        <div style={{ background: '#111', borderRadius: 14, padding: '18px 20px' }}>
          <p style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>Completed Today</p>
          {data.completedVehicles.length === 0 ? (
            <p style={{ color: '#444', fontSize: 14, fontStyle: 'italic' }}>Nothing completed yet today</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.completedVehicles.map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: i < data.completedVehicles.length - 1 ? '1px solid #1a1a1a' : 'none' }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: STAGE_COLORS[item.stage] || '#666',
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>#{item.stockNumber}</p>
                    <p style={{ fontSize: 12, color: '#666', margin: 0 }}>{STAGE_LABELS[item.stage] || item.stage}{item.assignee ? ` — ${item.assignee}` : ''}</p>
                  </div>
                  {item.completedAt && (
                    <span style={{ fontSize: 11, color: '#555', flexShrink: 0 }}>
                      {new Date(item.completedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Auto-refresh indicator */}
      <div style={{ position: 'fixed', bottom: 12, right: 16, fontSize: 11, color: '#333' }}>
        Auto-refreshes every 30s
      </div>
    </div>
  )
}
