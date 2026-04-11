'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { LEAD_SOURCE_LABELS } from '@/lib/crm'
import KanbanScrollbar from '@/components/KanbanScrollbar'

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
  const router = useRouter()
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [activePipelineId, setActivePipelineId] = useState('')
  const [opps, setOpps] = useState<Opp[]>([])
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<{ id: string; name: string }[]>([])
  const [assigneeFilter, setAssigneeFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board')
  const kanbanRef = useRef<HTMLDivElement | null>(null)
  const [dispositions, setDispositions] = useState<any[]>([])
  const [dispOpen, setDispOpen] = useState<string | null>(null)
  const [dispSaving, setDispSaving] = useState(false)
  const [modalOpp, setModalOpp] = useState<Opp | null>(null)
  const [modalTab, setModalTab] = useState<'details' | 'tasks' | 'notes'>('details')
  const [modalTasks, setModalTasks] = useState<any[]>([])
  const [modalNotes, setModalNotes] = useState<any[]>([])
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskDue, setNewTaskDue] = useState('')
  const [newNote, setNewNote] = useState('')
  const [modalSaving, setModalSaving] = useState(false)

  useEffect(() => {
    fetch('/api/settings/dispositions').then(r => r.json()).then(d => setDispositions((d.dispositions || []).filter((x: any) => x.isActive)))
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

  async function logDisposition(oppId: string, disp: any) {
    setDispSaving(true)
    try {
      await fetch(`/api/opportunities/${oppId}/dispositions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dispositionId: disp.id }),
      })
      if (disp.moveToStageId) {
        await fetch(`/api/opportunities/${oppId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stageId: disp.moveToStageId }),
        })
        setOpps(prev => prev.map(o => o.id === oppId ? { ...o, stage: stages.find(s => s.id === disp.moveToStageId) || o.stage } as Opp : o))
      }
      if (disp.followUpMinutes) {
        const followUpAt = new Date(Date.now() + disp.followUpMinutes * 60000)
        await fetch(`/api/opportunities/${oppId}/tasks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: `Follow up: ${disp.name}`, dueDate: followUpAt.toISOString() }),
        })
      }
    } catch (e) { console.error(e) }
    setDispOpen(null)
    setDispSaving(false)
  }

  function loadModalData(oppId: string) {
    fetch(`/api/opportunities/${oppId}`).then(r => r.json()).then(d => {
      setModalTasks(d.tasks || [])
      setModalNotes(d.notes || [])
    })
  }

  async function addModalTask(oppId: string) {
    if (!newTaskTitle.trim()) return
    setModalSaving(true)
    await fetch(`/api/opportunities/${oppId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTaskTitle, dueDate: newTaskDue || null }),
    })
    setNewTaskTitle(''); setNewTaskDue('')
    setModalSaving(false)
    loadModalData(oppId)
  }

  async function toggleModalTask(oppId: string, taskId: string, status: string) {
    await fetch(`/api/opportunities/${oppId}/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: status === 'completed' ? 'pending' : 'completed' }),
    })
    loadModalData(oppId)
  }

  async function addModalNote(oppId: string) {
    if (!newNote.trim()) return
    setModalSaving(true)
    await fetch(`/api/opportunities/${oppId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: newNote }),
    })
    setNewNote('')
    setModalSaving(false)
    loadModalData(oppId)
  }

  async function changeAssignee(oppId: string, assigneeId: string) {
    await fetch(`/api/opportunities/${oppId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assigneeId: assigneeId || null }),
    })
    setOpps(prev => prev.map(o => o.id === oppId ? { ...o, assignee: users.find(u => u.id === assigneeId) || null } as Opp : o))
    if (modalOpp && modalOpp.id === oppId) {
      setModalOpp({ ...modalOpp, assignee: users.find(u => u.id === assigneeId) || null } as Opp)
    }
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
        <>
        <div className="kanban-board" ref={kanbanRef}>
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
                      <div onClick={() => { setModalOpp(opp); setModalTab('details'); loadModalData(opp.id) }} style={{ textDecoration: 'none', color: 'inherit' }}>
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
                          <div style={{ display: 'flex', gap: 2, alignItems: 'center', borderTop: '1px solid var(--border-light)', paddingTop: 8 }}
                            onClick={e => e.preventDefault()}
                          >
                            {opp.contact.phone && (
                              <a href={`tel:${opp.contact.phone}`} onClick={e => e.stopPropagation()}
                                style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28 }} title="Call">
                                <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
                                </svg>
                              </a>
                            )}
                            {opp.contact.phone && (
                              <a href={`sms:${opp.contact.phone}`} onClick={e => e.stopPropagation()}
                                style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28 }} title="Text">
                                <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
                                </svg>
                              </a>
                            )}
                            {opp.contact.email && (
                              <a href={`mailto:${opp.contact.email}`} onClick={e => e.stopPropagation()}
                                style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28 }} title="Email">
                                <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                                </svg>
                              </a>
                            )}
                            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28 }} title="Notes">
                              <svg width="15" height="15" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                              </svg>
                              {opp._count.notes > 0 && (
                                <span style={{
                                  marginLeft: -6, marginTop: -10,
                                  background: '#3b82f6', color: '#fff', fontSize: 9, fontWeight: 700,
                                  width: 14, height: 14, borderRadius: '50%',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                }}>{opp._count.notes}</span>
                              )}
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28 }} title="Tasks">
                              <svg width="15" height="15" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                              </svg>
                              {opp._count.tasks > 0 && (
                                <span style={{
                                  marginLeft: -6, marginTop: -10,
                                  background: '#22c55e', color: '#fff', fontSize: 9, fontWeight: 700,
                                  width: 14, height: 14, borderRadius: '50%',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                }}>{opp._count.tasks}</span>
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
        <KanbanScrollbar boardRef={kanbanRef} />
      </>
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
                  onClick={() => { setModalOpp(opp); setModalTab('details'); loadModalData(opp.id) }}>
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
      {/* Opportunity Modal */}
      {modalOpp && (
        <div onClick={() => setModalOpp(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: 16, width: '100%', maxWidth: 600,
            maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
            boxShadow: '0 -4px 30px rgba(0,0,0,0.15)',
          }}>
            {/* Header */}
            <div style={{ padding: '20px 24px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
                  {modalOpp.contact.firstName} {modalOpp.contact.lastName}
                  {modalOpp.vehicleInterest ? ` — ${modalOpp.vehicleInterest}` : ''}
                </h2>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                  {modalOpp.stage.name} · {activePipeline?.name}
                </p>
              </div>
              <button onClick={() => setModalOpp(null)} style={{
                background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-muted)', padding: 4,
              }}>×</button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 0, padding: '12px 24px 0', borderBottom: '1px solid var(--border)' }}>
              {[
                { key: 'details' as const, label: 'Opportunity Details' },
                { key: 'tasks' as const, label: 'Tasks' },
                { key: 'notes' as const, label: 'Notes' },
              ].map(tab => (
                <button key={tab.key} onClick={() => setModalTab(tab.key)} style={{
                  padding: '8px 16px', fontSize: 13, fontWeight: 600, border: 'none', background: 'none', cursor: 'pointer',
                  borderBottom: modalTab === tab.key ? '2px solid #2563eb' : '2px solid transparent',
                  color: modalTab === tab.key ? '#2563eb' : 'var(--text-muted)',
                }}>{tab.label}</button>
              ))}
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
              {modalTab === 'details' && (
                <>
                  {/* Contact Details */}
                  <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>Contact Details</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Name</label>
                      <div style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14 }}>
                        {modalOpp.contact.firstName} {modalOpp.contact.lastName}
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Email</label>
                      <div style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, color: modalOpp.contact.email ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                        {modalOpp.contact.email || '—'}
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Phone</label>
                      <div style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, color: modalOpp.contact.phone ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                        {modalOpp.contact.phone || '—'}
                      </div>
                    </div>
                  </div>

                  {/* Opportunity Details */}
                  <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>Opportunity Details</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Pipeline</label>
                      <div style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14 }}>
                        {activePipeline?.name}
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Stage</label>
                      <select value={modalOpp.stage.id} onChange={async e => {
                        const newStageId = e.target.value
                        await moveOpp(modalOpp.id, newStageId)
                        setModalOpp({ ...modalOpp, stage: stages.find(s => s.id === newStageId) || modalOpp.stage } as Opp)
                      }} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14 }}>
                        {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Source</label>
                      <div style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14 }}>
                        {LEAD_SOURCE_LABELS[modalOpp.source as keyof typeof LEAD_SOURCE_LABELS] || modalOpp.source}
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Value</label>
                      <div style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14 }}>
                        ${(modalOpp.value || 0).toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Owner</label>
                      <select value={modalOpp.assignee?.id || ''} onChange={e => changeAssignee(modalOpp.id, e.target.value)}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14 }}>
                        <option value="">Unassigned</option>
                        {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Vehicle Interest</label>
                      <div style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, color: modalOpp.vehicleInterest ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                        {modalOpp.vehicleInterest || '—'}
                      </div>
                    </div>
                  </div>

                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                    Created: {new Date(modalOpp.createdAt).toLocaleDateString()} {new Date(modalOpp.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </div>
                </>
              )}

              {modalTab === 'tasks' && (
                <>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                    <input value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} placeholder="New task..."
                      onKeyDown={e => e.key === 'Enter' && addModalTask(modalOpp.id)}
                      style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }} />
                    <input type="date" value={newTaskDue} onChange={e => setNewTaskDue(e.target.value)}
                      style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12 }} />
                    <button onClick={() => addModalTask(modalOpp.id)} disabled={modalSaving || !newTaskTitle.trim()} style={{
                      padding: '8px 14px', borderRadius: 8, border: 'none',
                      background: '#1a1a1a', color: '#dffd6e', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      opacity: modalSaving || !newTaskTitle.trim() ? 0.5 : 1,
                    }}>Add</button>
                  </div>
                  {modalTasks.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 20 }}>No tasks yet</p>
                  ) : (
                    modalTasks.map((t: any) => (
                      <div key={t.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                        <input type="checkbox" checked={t.status === 'completed'}
                          onChange={() => toggleModalTask(modalOpp.id, t.id, t.status)}
                          style={{ marginTop: 3, cursor: 'pointer' }} />
                        <div style={{ flex: 1 }}>
                          <p style={{
                            fontSize: 14, margin: 0,
                            color: t.status === 'completed' ? 'var(--text-muted)' : 'var(--text-primary)',
                            textDecoration: t.status === 'completed' ? 'line-through' : 'none',
                          }}>{t.title}</p>
                          {t.dueDate && (
                            <p style={{
                              fontSize: 11, margin: '2px 0 0',
                              color: new Date(t.dueDate) < new Date() && t.status !== 'completed' ? '#ef4444' : 'var(--text-muted)',
                            }}>Due: {new Date(t.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </>
              )}

              {modalTab === 'notes' && (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <textarea value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Add a note..."
                      rows={3} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, resize: 'vertical', fontFamily: 'inherit' }} />
                    <button onClick={() => addModalNote(modalOpp.id)} disabled={modalSaving || !newNote.trim()} style={{
                      marginTop: 6, padding: '6px 14px', borderRadius: 6, border: 'none',
                      background: '#1a1a1a', color: '#dffd6e', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      opacity: modalSaving || !newNote.trim() ? 0.5 : 1,
                    }}>{modalSaving ? 'Saving...' : 'Add Note'}</button>
                  </div>
                  {modalNotes.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 20 }}>No notes yet</p>
                  ) : (
                    modalNotes.map((n: any) => (
                      <div key={n.id} style={{ padding: '10px 12px', background: '#f9fafb', borderRadius: 8, marginBottom: 8, border: '1px solid var(--border)' }}>
                        <p style={{ fontSize: 13, lineHeight: 1.5, margin: 0, wordBreak: 'break-word' }}>{n.body}</p>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                          {new Date(n.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at {new Date(n.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                          {n.createdBy && ` · ${n.createdBy.name}`}
                        </p>
                      </div>
                    ))
                  )}
                </>
              )}
            </div>

            {/* Dispositions */}

            {/* Footer */}
            <div style={{ padding: '12px 24px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button onClick={() => router.push(`/contacts/${modalOpp.contact.id}?from=/leads`)} style={{
                padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)',
                background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>Open Conversation</button>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {dispositions.length > 0 && (
                  <div style={{ position: 'relative' }}>
                    <button onClick={() => setDispOpen(dispOpen === modalOpp.id ? null : modalOpp.id)} style={{
                      padding: '8px 16px', borderRadius: 8, border: 'none',
                      background: dispOpen === modalOpp.id ? '#333' : '#1a1a1a', color: '#dffd6e',
                      fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    }}>Log Outcome</button>
                    {dispOpen === modalOpp.id && (
                      <div style={{
                        position: 'absolute', right: 0, bottom: 42, width: 200, background: '#fff',
                        border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
                        zIndex: 100, padding: '4px 0',
                      }}>
                        {dispositions.map((d: any) => (
                          <button key={d.id} onClick={async () => {
                            await logDisposition(modalOpp.id, d)
                            if (d.moveToStageId) {
                              setModalOpp({ ...modalOpp, stage: stages.find(s => s.id === d.moveToStageId) || modalOpp.stage } as Opp)
                            }
                          }} disabled={dispSaving} style={{
                            width: '100%', padding: '8px 14px', border: 'none', background: 'none',
                            fontSize: 13, textAlign: 'left', cursor: 'pointer',
                          }}
                            onMouseEnter={e => e.currentTarget.style.background = '#f5f5f3'}
                            onMouseLeave={e => e.currentTarget.style.background = 'none'}
                          >{d.name}</button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <button onClick={() => setModalOpp(null)} style={{
                  padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)',
                  background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
