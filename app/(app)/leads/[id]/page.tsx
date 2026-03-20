'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { LEAD_SOURCE_LABELS, LEAD_SOURCE_COLORS, LOST_REASON_LABELS, LOST_REASONS, ACTIVITY_LABELS } from '@/lib/crm'

type PipelineStage = { id: string; name: string; type: string; sortOrder: number }
type OppDetail = {
  id: string; source: string; sourceDetail: string | null; vehicleInterest: string | null
  value: number | null; lostReason: string | null; lostNotes: string | null
  appointmentDate: string | null; firstContactAt: string | null
  wonAt: string | null; lostAt: string | null; createdAt: string; updatedAt: string
  contact: { id: string; firstName: string; lastName: string; email: string | null; phone: string | null; address: string | null; city: string | null; state: string | null; tags: string[] }
  pipeline: { id: string; name: string; color: string }
  stage: { id: string; name: string; type: string }
  assignee: { id: string; name: string; role: string } | null
  vehicle: { id: string; stockNumber: string; year: number; make: string; model: string; color: string | null; status: string } | null
  pipelineStages: PipelineStage[]
  tasks: Array<{ id: string; title: string; status: string; dueDate: string | null; assignee: { id: string; name: string } | null; completedAt: string | null }>
  notes: Array<{ id: string; body: string; createdAt: string; createdBy: { id: string; name: string } | null }>
  activities: Array<{ id: string; type: string; description: string; createdAt: string; actor: { id: string; name: string } | null; metadata: Record<string, string> | null }>
}

export default function LeadDetailPage() {
  const router = useRouter()
  const { id } = useParams()
  const [opp, setOpp] = useState<OppDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<{ id: string; name: string }[]>([])
  const [newNote, setNewNote] = useState('')
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [tab, setTab] = useState<'notes' | 'tasks' | 'timeline'>('timeline')
  const [showLostModal, setShowLostModal] = useState(false)
  const [lostReason, setLostReason] = useState('')
  const [lostNotes, setLostNotes] = useState('')

  const load = useCallback(() => {
    fetch(`/api/opportunities/${id}`).then(r => r.json()).then(d => { setOpp(d); setLoading(false) })
  }, [id])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    fetch('/api/users').then(r => r.json()).then(d => setUsers((d.users || d).filter((x: { isActive: boolean }) => x.isActive)))
  }, [])

  async function changeStage(stageId: string) {
    if (!opp) return
    const stage = opp.pipelineStages.find(s => s.id === stageId)
    if (stage?.type === 'lost') {
      setShowLostModal(true)
      return
    }
    await fetch(`/api/opportunities/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stageId }),
    })
    load()
  }

  async function submitLost() {
    if (!opp || !lostReason) return
    const lostStage = opp.pipelineStages.find(s => s.type === 'lost')
    await fetch(`/api/opportunities/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stageId: lostStage?.id, lostReason, lostNotes: lostNotes || null }),
    })
    setShowLostModal(false)
    load()
  }

  async function changeAssignee(assigneeId: string) {
    await fetch(`/api/opportunities/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assigneeId: assigneeId || null }),
    })
    load()
  }

  async function addNote() {
    if (!newNote.trim()) return
    await fetch(`/api/opportunities/${id}/notes`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: newNote }),
    })
    setNewNote('')
    load()
  }

  async function addTask() {
    if (!newTaskTitle.trim()) return
    await fetch(`/api/opportunities/${id}/tasks`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTaskTitle }),
    })
    setNewTaskTitle('')
    load()
  }

  async function toggleTask(taskId: string, currentStatus: string) {
    await fetch(`/api/opportunities/${id}/tasks/${taskId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: currentStatus === 'completed' ? 'pending' : 'completed' }),
    })
    load()
  }

  async function handleDelete() {
    if (!confirm('Delete this lead?')) return
    await fetch(`/api/opportunities/${id}`, { method: 'DELETE' })
    router.push('/leads')
  }

  if (loading) return <p style={{ color: 'var(--text-muted)', padding: 40, textAlign: 'center' }}>Loading...</p>
  if (!opp) return <p style={{ color: 'var(--text-muted)', padding: 40, textAlign: 'center' }}>Not found</p>

  const sourceColor = LEAD_SOURCE_COLORS[opp.source as keyof typeof LEAD_SOURCE_COLORS] || '#6b7280'
  const sourceLabel = LEAD_SOURCE_LABELS[opp.source as keyof typeof LEAD_SOURCE_LABELS] || opp.source
  const isClosed = opp.stage.type === 'won' || opp.stage.type === 'lost'

  return (
    <div style={{ maxWidth: 700 }}>
      <Link href="/leads" style={{ fontSize: 14, color: 'var(--text-muted)', textDecoration: 'none', fontWeight: 500, display: 'inline-block', marginBottom: 20, minHeight: 'auto' }}>
        ← Back to Pipeline
      </Link>

      {/* Hero */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ height: 5, background: opp.pipeline.color }} />
        <div style={{ padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>
                {opp.contact.firstName} {opp.contact.lastName}
              </h1>
              <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap', fontSize: 13, color: 'var(--text-muted)' }}>
                {opp.contact.phone && <span>{opp.contact.phone}</span>}
                {opp.contact.email && <span>· {opp.contact.email}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, background: sourceColor + '15', color: sourceColor }}>
                {sourceLabel}
              </span>
              <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, background: opp.pipeline.color + '15', color: opp.pipeline.color }}>
                {opp.pipeline.name}
              </span>
            </div>
          </div>

          {/* Stage selector */}
          <div style={{ display: 'flex', gap: 4, marginTop: 20, overflowX: 'auto', paddingBottom: 4 }}>
            {opp.pipelineStages.map(stage => {
              const isCurrent = stage.id === opp.stage.id
              const isWon = stage.type === 'won'
              const isLost = stage.type === 'lost'
              return (
                <button key={stage.id} onClick={() => changeStage(stage.id)} style={{
                  padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                  border: `1px solid ${isCurrent ? (isWon ? '#22c55e' : isLost ? '#ef4444' : '#1a1a1a') : 'var(--border)'}`,
                  background: isCurrent ? (isWon ? '#f0fdf4' : isLost ? '#fef2f2' : '#1a1a1a') : '#fff',
                  color: isCurrent ? (isWon ? '#16a34a' : isLost ? '#ef4444' : '#dffd6e') : 'var(--text-muted)',
                  cursor: 'pointer', minHeight: 32, whiteSpace: 'nowrap',
                }}>
                  {stage.name}
                </button>
              )
            })}
          </div>

          {/* Assignee + actions */}
          <div style={{ display: 'flex', gap: 12, marginTop: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Assigned:</span>
              <select value={opp.assignee?.id || ''} onChange={e => changeAssignee(e.target.value)}
                style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13, background: '#fff', minHeight: 30 }}>
                <option value="">Unassigned</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <button onClick={handleDelete} style={{
                fontSize: 12, color: 'var(--danger)', background: 'none', border: '1px solid var(--danger-border)',
                padding: '5px 12px', borderRadius: 6, cursor: 'pointer', minHeight: 30,
              }}>Delete</button>
            </div>
          </div>
        </div>
      </div>

      {/* Vehicle interest */}
      {opp.vehicle && (
        <Link href={`/vehicles/${opp.vehicle.id}`} className="card" style={{
          padding: '14px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12,
          textDecoration: 'none', color: 'inherit',
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 2 }}>Vehicle Interest</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>
              {opp.vehicle.year} {opp.vehicle.make} {opp.vehicle.model}
              <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 8, fontSize: 12 }}>#{opp.vehicle.stockNumber}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, textTransform: 'capitalize' }}>
              Status: {opp.vehicle.status}
            </div>
          </div>
        </Link>
      )}
      {!opp.vehicle && opp.vehicleInterest && (
        <div className="card" style={{ padding: '14px 18px', marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 2 }}>Vehicle Interest</div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>{opp.vehicleInterest}</div>
        </div>
      )}

      {/* Lost reason */}
      {opp.lostReason && (
        <div className="card" style={{ padding: '14px 18px', marginBottom: 16, borderLeft: '4px solid #ef4444' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#ef4444', marginBottom: 4 }}>Lost Reason</div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>
            {LOST_REASON_LABELS[opp.lostReason as keyof typeof LOST_REASON_LABELS] || opp.lostReason}
          </div>
          {opp.lostNotes && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{opp.lostNotes}</div>}
        </div>
      )}

      {/* Tabs: Timeline / Notes / Tasks */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {(['timeline', 'notes', 'tasks'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
            border: `1px solid ${tab === t ? '#1a1a1a' : 'var(--border)'}`,
            background: tab === t ? '#1a1a1a' : '#fff',
            color: tab === t ? '#dffd6e' : 'var(--text-secondary)',
            cursor: 'pointer', minHeight: 34, textTransform: 'capitalize',
          }}>
            {t} {t === 'tasks' ? `(${opp.tasks.length})` : t === 'notes' ? `(${opp.notes.length})` : ''}
          </button>
        ))}
      </div>

      {/* Timeline */}
      {tab === 'timeline' && (
        <div className="card" style={{ padding: 20 }}>
          {opp.activities.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>No activity yet</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {opp.activities.map((a, i) => (
                <div key={a.id} style={{
                  display: 'flex', gap: 12, padding: '10px 0',
                  borderBottom: i < opp.activities.length - 1 ? '1px solid var(--border-light)' : 'none',
                }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%', marginTop: 6, flexShrink: 0,
                    background: a.type.includes('lost') ? '#ef4444' : a.type.includes('won') || a.type.includes('sold') ? '#22c55e' : '#d4d4d4',
                  }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                      {a.description}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      {a.actor?.name || 'System'} · {new Date(a.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                    {ACTIVITY_LABELS[a.type] || a.type}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Notes */}
      {tab === 'notes' && (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input value={newNote} onChange={e => setNewNote(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addNote() }}
              placeholder="Add a note..." className="input" style={{ flex: 1 }} />
            <button onClick={addNote} className="btn btn-primary" style={{ padding: '8px 16px', minHeight: 36, fontSize: 13 }}>Add</button>
          </div>
          {opp.notes.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 12 }}>No notes yet</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {opp.notes.map(n => (
                <div key={n.id} style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--bg-primary)' }}>
                  <p style={{ fontSize: 14, lineHeight: 1.5 }}>{n.body}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                    {n.createdBy?.name || 'System'} · {new Date(n.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tasks */}
      {tab === 'tasks' && (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addTask() }}
              placeholder="Add a task..." className="input" style={{ flex: 1 }} />
            <button onClick={addTask} className="btn btn-primary" style={{ padding: '8px 16px', minHeight: 36, fontSize: 13 }}>Add</button>
          </div>
          {opp.tasks.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 12 }}>No tasks yet</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {opp.tasks.map(t => (
                <button key={t.id} onClick={() => toggleTask(t.id, t.status)} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                  borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer',
                  width: '100%', textAlign: 'left', minHeight: 44,
                }}>
                  <span style={{
                    width: 20, height: 20, borderRadius: 5,
                    border: t.status === 'completed' ? 'none' : '2px solid #d4d4d4',
                    background: t.status === 'completed' ? '#1a1a1a' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    {t.status === 'completed' && <span style={{ color: '#dffd6e', fontSize: 12, fontWeight: 700 }}>✓</span>}
                  </span>
                  <div style={{ flex: 1 }}>
                    <span style={{
                      fontSize: 14, fontWeight: 500,
                      textDecoration: t.status === 'completed' ? 'line-through' : 'none',
                      color: t.status === 'completed' ? 'var(--text-muted)' : 'var(--text-primary)',
                    }}>{t.title}</span>
                    {t.dueDate && (
                      <div style={{ fontSize: 11, color: new Date(t.dueDate) < new Date() && t.status !== 'completed' ? '#ef4444' : 'var(--text-muted)' }}>
                        Due {new Date(t.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>
                    )}
                  </div>
                  {t.assignee && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.assignee.name}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Lost Modal */}
      {showLostModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, maxWidth: 400, width: '100%' }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Mark as Lost</h3>
            <div style={{ marginBottom: 16 }}>
              <label className="form-label">Reason (required)</label>
              <select className="input" value={lostReason} onChange={e => setLostReason(e.target.value)}>
                <option value="">Select reason</option>
                {LOST_REASONS.map(r => <option key={r} value={r}>{LOST_REASON_LABELS[r]}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label className="form-label">Notes (optional)</label>
              <textarea className="input" value={lostNotes} onChange={e => setLostNotes(e.target.value)} rows={2} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={submitLost} disabled={!lostReason} className="btn btn-danger" style={{ flex: 1 }}>Mark Lost</button>
              <button onClick={() => setShowLostModal(false)} className="btn btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
