'use client'

import { useEffect, useState, useCallback, useRef } from 'react'

type PipelineStage = { total: number; inProgress: number; pending: number; done: number }
type StageVehicle = {
  stockNumber: string; vehicle: string; color: string | null; assignee: string
  estimatedHours: number | null; activeSeconds: number; timerRunning: boolean
  timerStartedAt: string | null; stage: string; status: string
}
type CompletedItem = { stockNumber: string; vehicle: string; stage: string; assignee: string | null; completedAt: string }
type TVData = {
  pipeline: Record<string, PipelineStage>
  stageVehicles: Record<string, StageVehicle[]>
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

function LiveTimer({ job, color }: { job: StageVehicle; color: string }) {
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
    <div style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
        <span style={{ fontWeight: 700, color: isOver ? '#ef4444' : '#ccc', fontVariantNumeric: 'tabular-nums' }}>{formatTime(sec)}</span>
        <span style={{ color: '#555' }}>{job.estimatedHours || 2}h</span>
      </div>
      <div style={{ height: 4, background: '#2a2a2a', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 2, transition: 'width 1s linear',
          width: `${pct}%`,
          background: isOver ? '#ef4444' : pct > 80 ? '#f59e0b' : color,
        }} />
      </div>
    </div>
  )
}

function VehicleCard({ job, color }: { job: StageVehicle; color: string }) {
  const isMechanic = job.stage === 'mechanic'
  // Mechanic uses timer system; other stages just use status field
  const isActive = isMechanic ? job.timerRunning : job.status === 'in_progress'
  const isPaused = isMechanic ? (!job.timerRunning && job.status === 'in_progress') : false
  const isQueued = job.status === 'pending'

  return (
    <div style={{
      background: '#1a1a1a', borderRadius: 10, padding: '12px 14px',
      borderLeft: `3px solid ${isActive ? color : isPaused ? '#f59e0b' : isQueued ? '#333' : '#333'}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>{job.vehicle}</span>
        {isActive && (
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: color + '20', color }}>
            {isMechanic ? 'ACTIVE' : 'IN PROGRESS'}
          </span>
        )}
        {isPaused && (
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: '#f59e0b20', color: '#f59e0b' }}>PAUSED</span>
        )}
        {isQueued && (
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: '#33333380', color: '#666' }}>QUEUED</span>
        )}
      </div>
      <p style={{ fontSize: 12, color: '#666', margin: '0 0 2px' }}>#{job.stockNumber}{job.color ? ` · ${job.color}` : ''}</p>
      <p style={{ fontSize: 11, color: '#555', margin: 0 }}>{job.assignee}</p>
      {isMechanic && (isActive || isPaused) && <LiveTimer job={job} color={color} />}
    </div>
  )
}

function CompletedTicker({ items }: { items: CompletedItem[] }) {
  const [currentIdx, setCurrentIdx] = useState(0)

  useEffect(() => {
    if (items.length <= 1) return
    const i = setInterval(() => setCurrentIdx(prev => (prev + 1) % items.length), 4000)
    return () => clearInterval(i)
  }, [items.length])

  const item = items[currentIdx]
  if (!item) return null

  return (
    <div style={{ background: '#111', borderRadius: 12, padding: '14px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#888' }}>Completed Today</span>
          <span style={{ fontSize: 12, color: '#22c55e', fontWeight: 700 }}>{items.length}</span>
        </div>
        {items.length > 1 && (
          <div style={{ display: 'flex', gap: 4 }}>
            {items.map((_, i) => (
              <div key={i} style={{
                width: 6, height: 6, borderRadius: '50%',
                background: i === currentIdx ? '#22c55e' : '#2a2a2a',
                transition: 'background 0.3s',
              }} />
            ))}
          </div>
        )}
      </div>
      <div style={{
        marginTop: 10, display: 'flex', alignItems: 'center', gap: 14,
        padding: '10px 16px', background: '#1a1a1a', borderRadius: 10,
        borderLeft: `3px solid ${STAGE_COLORS[item.stage] || '#666'}`,
        transition: 'opacity 0.3s',
      }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{item.vehicle}</p>
          <p style={{ fontSize: 12, color: '#666', margin: '2px 0 0' }}>
            #{item.stockNumber} · {STAGE_LABELS[item.stage] || item.stage}{item.assignee ? ` — ${item.assignee}` : ''}
          </p>
        </div>
        {item.completedAt && (
          <span style={{ fontSize: 13, color: '#555' }}>
            {new Date(item.completedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })}
          </span>
        )}
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
    refreshRef.current = setInterval(fetchData, 30000)
    const clockInterval = setInterval(() => setClock(new Date()), 1000)
    return () => { clearInterval(refreshRef.current); clearInterval(clockInterval) }
  }, [fetchData])

  if (!data) {
    return (
      <div style={{ background: '#0a0a0a', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#666', fontSize: 24 }}>Loading...</p>
      </div>
    )
  }

  const stageOrder = ['mechanic', 'detailing', 'content', 'publish']
  const allActive = Object.values(data.stageVehicles).flat()

  return (
    <div style={{
      background: '#0a0a0a', minHeight: '100vh', color: '#fff',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      padding: '24px 32px', overflow: 'hidden',
    }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', margin: 0 }}>
            Mikalyzed Auto Boutique
          </h1>
          <p style={{ fontSize: 13, color: '#666', margin: '2px 0 0', fontWeight: 600 }}>Operations Overview</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 28, fontWeight: 700, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{formatClock(clock)}</p>
          <p style={{ fontSize: 12, color: '#666', margin: 0 }}>
            {clock.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/New_York' })}
          </p>
        </div>
      </div>

      {/* Top Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'In Recon', value: data.inRecon, color: '#3b82f6' },
          { label: 'Completed Today', value: data.completedToday, color: '#22c55e' },
          { label: 'Awaiting Parts', value: data.awaitingParts, color: '#eab308' },
          { label: 'External Repairs', value: data.externalRepairs, color: '#f97316' },
          { label: 'Active Now', value: allActive.filter(j => j.timerRunning).length, color: '#06b6d4' },
          { label: 'Total Vehicles', value: data.totalInventory, color: '#8b5cf6' },
        ].map(stat => (
          <div key={stat.label} style={{
            background: '#111', borderRadius: 12, padding: '14px 16px',
            borderLeft: `4px solid ${stat.color}`,
          }}>
            <p style={{ fontSize: 32, fontWeight: 800, margin: 0, color: stat.color, lineHeight: 1 }}>{stat.value}</p>
            <p style={{ fontSize: 11, color: '#888', margin: '5px 0 0', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Pipeline Cards + Vehicle Columns */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20, alignItems: 'stretch' }}>
        {stageOrder.map(stage => {
          const p = data.pipeline[stage] || { total: 0, inProgress: 0, pending: 0, done: 0 }
          const color = STAGE_COLORS[stage]
          const vehicles = data.stageVehicles[stage] || []

          return (
            <div key={stage} style={{
              display: 'flex', flexDirection: 'column', gap: 10,
              background: '#0f0f0f', borderRadius: 14, padding: 12,
              border: `1px solid ${color}30`, 
            }}>
              {/* Pipeline summary card */}
              <div style={{ background: '#111', borderRadius: 10, padding: '14px 16px', borderTop: `3px solid ${color}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{STAGE_LABELS[stage]}</span>
                  <span style={{ fontSize: 26, fontWeight: 800, color }}>{p.total}</span>
                </div>
                <div style={{ display: 'flex', gap: 10, fontSize: 12, color: '#888' }}>
                  <span><span style={{ color, fontWeight: 700 }}>{p.inProgress}</span> active</span>
                  <span><span style={{ color: '#666', fontWeight: 700 }}>{p.pending}</span> queued</span>
                  <span><span style={{ color: '#22c55e', fontWeight: 700 }}>{p.done}</span> done</span>
                </div>
              </div>

              {/* Vehicle cards under this stage */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                {vehicles.length > 0 ? vehicles.map(job => (
                  <VehicleCard key={job.stockNumber} job={job} color={color} />
                )) : (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 60 }}>
                    <p style={{ color: '#2a2a2a', fontSize: 13, fontStyle: 'italic', margin: 0 }}>No active vehicles</p>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Completed Today — auto-rotating ticker */}
      {data.completedVehicles.length > 0 && <CompletedTicker items={data.completedVehicles} />}

      {/* Auto-refresh indicator */}
      <div style={{ position: 'fixed', bottom: 10, right: 16, fontSize: 10, color: '#222' }}>
        Auto-refreshes every 30s
      </div>
    </div>
  )
}
