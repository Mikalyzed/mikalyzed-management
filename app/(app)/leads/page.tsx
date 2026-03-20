'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { LEAD_SOURCE_LABELS } from '@/lib/crm'

type Stage = { id: string; name: string; type: string; sortOrder: number }
type Pipeline = { id: string; name: string; color: string; stages: Stage[]; _count: { opportunities: number } }
type Opp = {
  id: string; source: string; vehicleInterest: string | null; value: number | null
  updatedAt: string; createdAt: string
  contact: { id: string; firstName: string; lastName: string; phone: string | null; email: string | null }
  stage: { id: string; name: string; type: string }
  assignee: { id: string; name: string } | null
  vehicle: { id: string; stockNumber: string; year: number; make: string; model: string } | null
  _count: { tasks: number; notes: number }
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

// Consistent color from name
function initialsColor(name: string) {
  const colors = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316']
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

export default function LeadsPage() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [activePipelineId, setActivePipelineId] = useState('')
  const [opps, setOpps] = useState<Opp[]>([])
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<{ id: string; name: string }[]>([])
  const [assigneeFilter, setAssigneeFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board')

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
  const totalOpps = opps.length

  const grouped = useMemo(() => {
    const map: Record<string, Opp[]> = {}
    stages.forEach(s => { map[s.id] = [] })
    let filtered = opps
    if (assigneeFilter) filtered = filtered.filter(o => o.assignee?.id === assigneeFilter)
    if (sourceFilter) filtered = filtered.filter(o => o.source === sourceFilter)
    if (search) {
      const q = search.toLowerCase()
      filtered = filtered.filter(o =>
        `${o.contact.firstName} ${o.contact.lastName}`.toLowerCase().includes(q) ||
        o.contact.phone?.includes(q) ||
        o.contact.email?.toLowerCase().includes(q) ||
        o.vehicleInterest?.toLowerCase().includes(q) ||
        (o.vehicle && `${o.vehicle.year} ${o.vehicle.make} ${o.vehicle.model}`.toLowerCase().includes(q))
      )
    }
    filtered.forEach(o => {
      if (map[o.stage.id]) map[o.stage.id].push(o)
    })
    return map
  }, [opps, stages, assigneeFilter, sourceFilter, search])

  async function moveOpp(oppId: string, newStageId: string) {
    await fetch(`/api/opportunities/${oppId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stageId: newStageId }),
    })
    setOpps(prev => prev.map(o => o.id === oppId ? { ...o, stage: stages.find(s => s.id === newStageId) || o.stage } as Opp : o))
  }

  function stageValue(stageId: string) {
    return (grouped[stageId] || []).reduce((sum, o) => sum + (o.value || 0), 0)
  }

  function vehicleLabel(o: Opp) {
    if (o.vehicle) return `${o.vehicle.year} ${o.vehicle.make} ${o.vehicle.model}`
    return o.vehicleInterest || ''
  }

  function cardTitle(o: Opp) {
    const name = `${o.contact.firstName} ${o.contact.lastName}`
    const veh = vehicleLabel(o)
    return veh ? `${name} ${veh}` : name
  }

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>Leads</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={activePipelineId} onChange={e => setActivePipelineId(e.target.value)}
            style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, fontWeight: 600, background: '#fff', minHeight: 38 }}>
            {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#3b82f6', background: '#eff6ff', padding: '4px 10px', borderRadius: 20 }}>
            {totalOpps}
          </span>
          <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <button onClick={() => setViewMode('board')} style={{
              padding: '7px 12px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, minHeight: 34,
              background: viewMode === 'board' ? '#1a1a1a' : '#fff',
              color: viewMode === 'board' ? '#dffd6e' : 'var(--text-muted)',
            }}>Board</button>
            <button onClick={() => setViewMode('list')} style={{
              padding: '7px 12px', border: 'none', borderLeft: '1px solid var(--border)', cursor: 'pointer', fontSize: 12, fontWeight: 600, minHeight: 34,
              background: viewMode === 'list' ? '#1a1a1a' : '#fff',
              color: viewMode === 'list' ? '#dffd6e' : 'var(--text-muted)',
            }}>List</button>
          </div>
          <Link href="/leads/new" className="btn btn-primary" style={{ fontSize: 13 }}>+ Add</Link>
        </div>
      </div>

      {/* Filters row */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)}
          style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: '#fff', minHeight: 34, flex: '0 0 auto' }}>
          <option value="">All Reps</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}
          style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: '#fff', minHeight: 34, flex: '0 0 auto' }}>
          <option value="">All Sources</option>
          {Object.entries(LEAD_SOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..."
          style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: '#fff', minHeight: 34, flex: '1 1 140px', minWidth: 0 }} />
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>Loading...</p>
      ) : viewMode === 'board' ? (
        /* BOARD VIEW */
        <div className="kanban-board">
          {stages.map(stage => {
            const stageOpps = grouped[stage.id] || []
            const total = stageValue(stage.id)
            return (
              <div key={stage.id} className="kanban-column">
                <div className="kanban-column-header" style={{ marginBottom: 10 }}>
                  <div>
                    <span className="kanban-column-title" style={{
                      color: stage.type === 'won' ? '#16a34a' : stage.type === 'lost' ? '#ef4444' : undefined,
                      fontSize: 14,
                    }}>
                      {stage.name}
                    </span>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                      {stageOpps.length} Opportunities{total > 0 ? ` · $${total.toLocaleString()}` : ''}
                    </div>
                  </div>
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
                          {/* Title + assignee avatar */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
                            <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>
                              {cardTitle(opp)}
                            </span>
                            {opp.assignee && (
                              <span style={{
                                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                                background: initialsColor(opp.assignee.name), color: '#fff',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 10, fontWeight: 700,
                              }}>
                                {getInitials(opp.assignee.name)}
                              </span>
                            )}
                          </div>

                          {/* Source + Value */}
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'flex', gap: 16 }}>
                            <span>Source: {LEAD_SOURCE_LABELS[opp.source as keyof typeof LEAD_SOURCE_LABELS] || opp.source}</span>
                            <span>Value: ${(opp.value || 0).toLocaleString()}</span>
                          </div>

                          {/* Created date */}
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
                            Created: {formatDate(opp.createdAt)}
                          </div>

                          {/* Action icons row */}
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', borderTop: '1px solid var(--border-light)', paddingTop: 8 }}
                            onClick={e => e.preventDefault()}
                          >
                            {/* Phone */}
                            {opp.contact.phone && (
                              <a href={`tel:${opp.contact.phone}`} onClick={e => e.stopPropagation()}
                                style={{ color: 'var(--text-muted)', display: 'flex', padding: 4 }} title="Call">
                                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
                                </svg>
                              </a>
                            )}
                            {/* SMS */}
                            {opp.contact.phone && (
                              <a href={`sms:${opp.contact.phone}`} onClick={e => e.stopPropagation()}
                                style={{ color: 'var(--text-muted)', display: 'flex', padding: 4 }} title="Text">
                                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
                                </svg>
                              </a>
                            )}
                            {/* Email */}
                            {opp.contact.email && (
                              <a href={`mailto:${opp.contact.email}`} onClick={e => e.stopPropagation()}
                                style={{ color: 'var(--text-muted)', display: 'flex', padding: 4 }} title="Email">
                                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                                </svg>
                              </a>
                            )}
                            {/* Notes count */}
                            <span style={{ display: 'flex', alignItems: 'center', gap: 2, padding: 4, position: 'relative' }} title="Notes">
                              <svg width="16" height="16" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                              </svg>
                              {opp._count.notes > 0 && (
                                <span style={{
                                  position: 'absolute', top: 0, right: -2,
                                  background: '#3b82f6', color: '#fff', fontSize: 9, fontWeight: 700,
                                  width: 15, height: 15, borderRadius: '50%',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>{opp._count.notes}</span>
                              )}
                            </span>
                            {/* Tasks count */}
                            <span style={{ display: 'flex', alignItems: 'center', gap: 2, padding: 4, position: 'relative' }} title="Tasks">
                              <svg width="16" height="16" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                              </svg>
                              {opp._count.tasks > 0 && (
                                <span style={{
                                  position: 'absolute', top: 0, right: -2,
                                  background: '#22c55e', color: '#fff', fontSize: 9, fontWeight: 700,
                                  width: 15, height: 15, borderRadius: '50%',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>{opp._count.tasks}</span>
                              )}
                            </span>
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
      ) : (
        /* LIST VIEW */
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 600 }}>
            <thead>
              <tr style={{ background: 'var(--bg-primary)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>Name</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>Vehicle</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>Stage</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>Source</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>Rep</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>Created</th>
              </tr>
            </thead>
            <tbody>
              {opps.filter(o => {
                if (assigneeFilter && o.assignee?.id !== assigneeFilter) return false
                if (sourceFilter && o.source !== sourceFilter) return false
                if (search) {
                  const q = search.toLowerCase()
                  return `${o.contact.firstName} ${o.contact.lastName}`.toLowerCase().includes(q) ||
                    o.contact.phone?.includes(q) || o.contact.email?.toLowerCase().includes(q) ||
                    vehicleLabel(o).toLowerCase().includes(q)
                }
                return true
              }).map(opp => (
                <tr key={opp.id} style={{ borderBottom: '1px solid var(--border-light)', cursor: 'pointer' }}
                  onClick={() => window.location.href = `/leads/${opp.id}`}>
                  <td style={{ padding: '12px 16px', fontWeight: 600 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {opp.assignee && (
                        <span style={{
                          width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                          background: initialsColor(opp.assignee.name), color: '#fff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 9, fontWeight: 700,
                        }}>{getInitials(opp.assignee.name)}</span>
                      )}
                      {opp.contact.firstName} {opp.contact.lastName}
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>{vehicleLabel(opp) || '—'}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6,
                      background: opp.stage.type === 'won' ? '#f0fdf4' : opp.stage.type === 'lost' ? '#fef2f2' : '#f5f5f3',
                      color: opp.stage.type === 'won' ? '#16a34a' : opp.stage.type === 'lost' ? '#ef4444' : 'var(--text-secondary)',
                    }}>{opp.stage.name}</span>
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>
                    {LEAD_SOURCE_LABELS[opp.source as keyof typeof LEAD_SOURCE_LABELS] || opp.source}
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{opp.assignee?.name || '—'}</td>
                  <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: 12 }}>{formatDate(opp.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  )
}
