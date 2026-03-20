'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { LEAD_SOURCE_LABELS, LEAD_SOURCE_COLORS } from '@/lib/crm'

type Stage = { id: string; name: string; type: string; sortOrder: number }
type Pipeline = { id: string; name: string; color: string; stages: Stage[]; _count: { opportunities: number } }
type Opp = {
  id: string; source: string; vehicleInterest: string | null; updatedAt: string; createdAt: string
  contact: { id: string; firstName: string; lastName: string; phone: string | null; email: string | null }
  stage: { id: string; name: string; type: string }
  assignee: { id: string; name: string } | null
  vehicle: { id: string; stockNumber: string; year: number; make: string; model: string } | null
  _count: { tasks: number; notes: number }
}

function timeSince(d: string) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export default function LeadsPage() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [activePipelineId, setActivePipelineId] = useState('')
  const [opps, setOpps] = useState<Opp[]>([])
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<{ id: string; name: string }[]>([])
  const [assigneeFilter, setAssigneeFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')

  useEffect(() => {
    fetch('/api/pipelines').then(r => r.json()).then((data: Pipeline[]) => {
      setPipelines(data)
      if (data.length > 0) setActivePipelineId(data[0].id)
    })
    fetch('/api/users').then(r => r.json()).then(d => setUsers((d.users || d).filter((x: { isActive: boolean }) => x.isActive)))
  }, [])

  useEffect(() => {
    if (!activePipelineId) return
    setLoading(true)
    fetch(`/api/opportunities?pipelineId=${activePipelineId}`)
      .then(r => r.json())
      .then(d => { setOpps(d); setLoading(false) })
  }, [activePipelineId])

  const activePipeline = pipelines.find(p => p.id === activePipelineId)
  const stages = activePipeline?.stages || []

  // Group opps by stage
  const grouped = useMemo(() => {
    const map: Record<string, Opp[]> = {}
    stages.forEach(s => { map[s.id] = [] })
    let filtered = opps
    if (assigneeFilter) filtered = filtered.filter(o => o.assignee?.id === assigneeFilter)
    if (sourceFilter) filtered = filtered.filter(o => o.source === sourceFilter)
    filtered.forEach(o => {
      if (map[o.stage.id]) map[o.stage.id].push(o)
    })
    return map
  }, [opps, stages, assigneeFilter, sourceFilter])

  async function moveOpp(oppId: string, newStageId: string) {
    await fetch(`/api/opportunities/${oppId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stageId: newStageId }),
    })
    setOpps(prev => prev.map(o => o.id === oppId ? { ...o, stage: stages.find(s => s.id === newStageId) || o.stage, stageId: newStageId } as Opp : o))
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>Leads</h1>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 4 }}>Sales pipeline and opportunities</p>
        </div>
        <Link href="/leads/new" className="btn btn-primary" style={{ fontSize: 14 }}>New Lead</Link>
      </div>

      {/* Pipeline tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
        {pipelines.map(p => (
          <button key={p.id} onClick={() => setActivePipelineId(p.id)} style={{
            padding: '8px 16px', borderRadius: 8,
            border: `2px solid ${activePipelineId === p.id ? p.color : 'var(--border)'}`,
            background: activePipelineId === p.id ? p.color + '12' : '#fff',
            color: activePipelineId === p.id ? p.color : 'var(--text-secondary)',
            fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 36, whiteSpace: 'nowrap',
          }}>
            {p.name}
            <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.7 }}>{p._count.opportunities}</span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)}
          style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: '#fff', minHeight: 34 }}>
          <option value="">All Reps</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}
          style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: '#fff', minHeight: 34 }}>
          <option value="">All Sources</option>
          {Object.entries(LEAD_SOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {/* Kanban */}
      {loading ? (
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>Loading...</p>
      ) : (
        <div className="kanban-board">
          {stages.map(stage => {
            const stageOpps = grouped[stage.id] || []
            const isWon = stage.type === 'won'
            const isLost = stage.type === 'lost'
            return (
              <div key={stage.id} className="kanban-column">
                <div className="kanban-column-header">
                  <span className="kanban-column-title" style={{
                    color: isWon ? '#16a34a' : isLost ? '#ef4444' : undefined,
                  }}>
                    {stage.name}
                  </span>
                  <span className="kanban-column-count">{stageOpps.length}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 60 }}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => {
                    const oppId = e.dataTransfer.getData('oppId')
                    if (oppId) moveOpp(oppId, stage.id)
                  }}
                >
                  {stageOpps.map(opp => (
                    <div key={opp.id} draggable
                      onDragStart={e => e.dataTransfer.setData('oppId', opp.id)}
                    >
                      <Link href={`/leads/${opp.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                        <div className="card" style={{ padding: '14px 16px', cursor: 'grab' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                            <span style={{ fontSize: 14, fontWeight: 600 }}>
                              {opp.contact.firstName} {opp.contact.lastName}
                            </span>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{timeSince(opp.updatedAt)}</span>
                          </div>
                          {(opp.vehicle || opp.vehicleInterest) && (
                            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
                              {opp.vehicle ? `${opp.vehicle.year} ${opp.vehicle.make} ${opp.vehicle.model}` : opp.vehicleInterest}
                            </p>
                          )}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{
                              fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                              background: (LEAD_SOURCE_COLORS[opp.source as keyof typeof LEAD_SOURCE_COLORS] || '#6b7280') + '15',
                              color: LEAD_SOURCE_COLORS[opp.source as keyof typeof LEAD_SOURCE_COLORS] || '#6b7280',
                            }}>
                              {LEAD_SOURCE_LABELS[opp.source as keyof typeof LEAD_SOURCE_LABELS] || opp.source}
                            </span>
                            {opp.assignee && (
                              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{opp.assignee.name}</span>
                            )}
                          </div>
                        </div>
                      </Link>
                    </div>
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
