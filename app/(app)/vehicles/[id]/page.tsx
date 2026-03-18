'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

type ChecklistItem = { item: string; done: boolean; note: string }

type Stage = {
  id: string
  stage: string
  status: string
  assignee: { id: string; name: string } | null
  checklist: ChecklistItem[]
  notes: string | null
  startedAt: string
  completedAt: string | null
}

type Vehicle = {
  id: string
  stockNumber: string
  vin: string | null
  year: number | null
  make: string
  model: string
  color: string | null
  trim: string | null
  status: string
  notes: string | null
  currentAssignee: { id: string; name: string; role: string } | null
  createdBy: { id: string; name: string } | null
  createdAt: string
  completedAt: string | null
  stages: Stage[]
}

const STAGE_LABELS: Record<string, string> = {
  mechanic: 'Mechanic', detailing: 'Detailing', content: 'Content', publish: 'Publish', completed: 'Completed',
}
const STAGE_ICONS: Record<string, string> = {
  mechanic: '🔧', detailing: '✨', content: '📸', publish: '🚀', completed: '✅',
}
const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending', in_progress: 'In Progress', blocked: 'Blocked', done: 'Done',
}
const STATUS_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  pending: { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
  in_progress: { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
  blocked: { bg: '#fef2f2', color: '#ef4444', border: '#fecaca' },
  done: { bg: '#f0f0ec', color: '#9a9a9a', border: '#e8e8e4' },
}

export default function VehicleDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const [vehicle, setVehicle] = useState<Vehicle | null>(null)
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editChecklist, setEditChecklist] = useState<ChecklistItem[]>([])
  const [newTaskText, setNewTaskText] = useState('')
  const [saving, setSaving] = useState(false)

  const refresh = () => fetch(`/api/vehicles/${id}`).then(r => r.json()).then(d => setVehicle(d.vehicle))

  useEffect(() => {
    refresh().finally(() => setLoading(false))
    // Check if admin
    const cookies = document.cookie.split(';').reduce((acc, c) => {
      const [k, v] = c.trim().split('=')
      acc[k] = v
      return acc
    }, {} as Record<string, string>)
    if (cookies.mm_user_role === 'admin') setIsAdmin(true)
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: '60vh' }}>
        <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#e8e8e4', borderTopColor: 'transparent' }} />
      </div>
    )
  }
  if (!vehicle) return <p style={{ color: 'var(--danger)', textAlign: 'center', marginTop: '40px' }}>Vehicle not found</p>

  const currentStage = vehicle.stages.find((s) => s.status !== 'done')
  const completedStages = vehicle.stages.filter((s) => s.status === 'done')
  const stageIcon = STAGE_ICONS[vehicle.status] || '📋'
  const stageLabel = STAGE_LABELS[vehicle.status] || vehicle.status

  // Time in current stage
  let timeStr = ''
  if (currentStage) {
    const elapsed = (Date.now() - new Date(currentStage.startedAt).getTime()) / 1000
    const hours = Math.floor(elapsed / 3600)
    if (hours < 1) timeStr = `${Math.floor(elapsed / 60)}m`
    else if (hours < 24) timeStr = `${hours}h`
    else timeStr = `${Math.floor(hours / 24)}d ${hours % 24}h`
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Back */}
      <button onClick={() => router.back()} className="text-sm mb-5 flex items-center gap-1" style={{ color: 'var(--text-muted)', minHeight: 'auto' }}>
        ← Back
      </button>

      {/* Hero Card */}
      <div style={{
        background: '#ffffff',
        border: '1px solid var(--border)',
        borderRadius: '20px',
        padding: '24px',
        marginBottom: '16px',
        boxShadow: 'var(--shadow)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '4px' }}>
              STOCK #{vehicle.stockNumber}
            </p>
            <h1 style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              {vehicle.year} {vehicle.make} {vehicle.model}
            </h1>
            <div style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
              {vehicle.color && (
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{vehicle.color}</span>
              )}
              {vehicle.trim && (
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>· {vehicle.trim}</span>
              )}
              {vehicle.vin && (
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>· VIN: {vehicle.vin}</span>
              )}
            </div>
          </div>
        </div>

        {/* Status row */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '12px 16px',
          background: 'var(--bg-primary)',
          borderRadius: '12px',
          flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: '20px' }}>{stageIcon}</span>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: '14px', fontWeight: 600 }}>{stageLabel}</p>
            {currentStage && (
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {STATUS_LABELS[currentStage.status] || currentStage.status}
                {timeStr && ` · ${timeStr}`}
                {currentStage.assignee && ` · ${currentStage.assignee.name}`}
              </p>
            )}
            {vehicle.status === 'completed' && (
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Completed {vehicle.completedAt && new Date(vehicle.completedAt).toLocaleDateString()}
              </p>
            )}
          </div>
          {currentStage && (
            <span style={{
              padding: '4px 12px',
              borderRadius: '100px',
              fontSize: '12px',
              fontWeight: 600,
              background: STATUS_COLORS[currentStage.status]?.bg || '#f5f5f3',
              color: STATUS_COLORS[currentStage.status]?.color || '#9a9a9a',
              border: `1px solid ${STATUS_COLORS[currentStage.status]?.border || '#e8e8e4'}`,
            }}>
              {STATUS_LABELS[currentStage.status] || currentStage.status}
            </span>
          )}
        </div>
      </div>

      {/* Notes */}
      {vehicle.notes && (
        <div style={{
          background: '#ffffff',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          padding: '16px 20px',
          marginBottom: '16px',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Notes</p>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{vehicle.notes}</p>
        </div>
      )}

      {/* Checklist & Actions */}
      {currentStage && (
        <div style={{
          background: '#ffffff',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          padding: '20px',
          marginBottom: '16px',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Tasks ({currentStage.checklist.filter(c => c.done).length}/{currentStage.checklist.length})
            </p>
            {isAdmin && !editing && (
              <button
                onClick={() => { setEditing(true); setEditChecklist([...currentStage.checklist]); setNewTaskText('') }}
                style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', minHeight: 'auto', padding: '4px 8px' }}
              >
                ✏️ Edit
              </button>
            )}
          </div>

          {!editing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {currentStage.checklist.map((item, i) => (
                <ChecklistRow key={i} item={item} index={i} stageId={currentStage.id} onUpdate={refresh} />
              ))}
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px' }}>
                {editChecklist.map((item, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '8px 12px', borderRadius: '10px',
                    background: 'var(--bg-primary)', border: '1px solid var(--border)',
                  }}>
                    <input
                      value={item.item}
                      onChange={(e) => {
                        const updated = [...editChecklist]
                        updated[i] = { ...updated[i], item: e.target.value }
                        setEditChecklist(updated)
                      }}
                      style={{
                        flex: 1, border: 'none', background: 'transparent',
                        fontSize: '14px', fontWeight: 500, outline: 'none',
                        color: 'var(--text-primary)',
                      }}
                    />
                    <button
                      onClick={() => setEditChecklist(editChecklist.filter((_, idx) => idx !== i))}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--danger)', fontSize: '14px', fontWeight: 700,
                        minHeight: 'auto', padding: '2px 6px',
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              {/* Add new task */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <input
                  value={newTaskText}
                  onChange={(e) => setNewTaskText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newTaskText.trim()) {
                      e.preventDefault()
                      setEditChecklist([...editChecklist, { item: newTaskText.trim(), done: false, note: '' }])
                      setNewTaskText('')
                    }
                  }}
                  placeholder="Add a task..."
                  style={{
                    flex: 1, padding: '10px 14px', borderRadius: '10px',
                    border: '1px solid var(--border)', background: '#fff',
                    fontSize: '14px', outline: 'none',
                  }}
                />
                <button
                  onClick={() => {
                    if (!newTaskText.trim()) return
                    setEditChecklist([...editChecklist, { item: newTaskText.trim(), done: false, note: '' }])
                    setNewTaskText('')
                  }}
                  style={{
                    padding: '10px 16px', borderRadius: '10px',
                    border: '1px solid var(--border)', background: '#fff',
                    fontSize: '14px', fontWeight: 600, cursor: 'pointer', minHeight: 'auto',
                  }}
                >
                  Add
                </button>
              </div>

              {/* Save / Cancel */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setEditing(false)}
                  style={{
                    flex: 1, padding: '10px', borderRadius: '10px',
                    border: '1px solid var(--border)', background: '#fff',
                    fontSize: '14px', fontWeight: 600, cursor: 'pointer', minHeight: '44px',
                  }}
                >
                  Cancel
                </button>
                <button
                  disabled={saving}
                  onClick={async () => {
                    setSaving(true)
                    const filtered = editChecklist.filter(c => c.item.trim())
                    await fetch(`/api/stages/${currentStage.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ checklist: filtered }),
                    })
                    setEditing(false)
                    setSaving(false)
                    refresh()
                  }}
                  style={{
                    flex: 1, padding: '10px', borderRadius: '10px',
                    border: 'none', background: '#1a1a1a', color: '#dffd6e',
                    fontSize: '14px', fontWeight: 600, cursor: 'pointer', minHeight: '44px',
                    opacity: saving ? 0.5 : 1,
                  }}
                >
                  {saving ? 'Saving...' : 'Save Tasks'}
                </button>
              </div>
            </div>
          )}

          {/* Stage notes */}
          {currentStage.notes && (
            <p style={{
              fontSize: '13px',
              marginTop: '12px',
              padding: '10px 12px',
              borderRadius: '8px',
              background: 'var(--bg-primary)',
              color: 'var(--text-secondary)',
              lineHeight: 1.4,
            }}>
              {currentStage.notes}
            </p>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            {currentStage.status === 'pending' && (
              <ActionBtn label="Start Working" style="primary" onClick={async () => {
                await fetch(`/api/stages/${currentStage.id}`, {
                  method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ status: 'in_progress' }),
                })
                refresh()
              }} />
            )}
            {currentStage.status === 'in_progress' && (
              <>
                <ActionBtn label="Advance to Next Stage →" style="success" onClick={async () => {
                  await fetch(`/api/stages/${currentStage.id}/advance`, { method: 'POST' })
                  refresh()
                }} />
                <ActionBtn label="Block" style="danger" onClick={async () => {
                  const note = prompt('Block reason:')
                  if (!note) return
                  await fetch(`/api/stages/${currentStage.id}`, {
                    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'blocked', blockNote: note }),
                  })
                  refresh()
                }} />
              </>
            )}
            {currentStage.status === 'blocked' && (
              <ActionBtn label="Unblock" style="warning" onClick={async () => {
                await fetch(`/api/stages/${currentStage.id}`, {
                  method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ status: 'in_progress' }),
                })
                refresh()
              }} />
            )}
          </div>
        </div>
      )}

      {/* Stage History */}
      {completedStages.length > 0 && (
        <div style={{
          background: '#ffffff',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          padding: '20px',
          marginBottom: '16px',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
            Completed Stages
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {completedStages.map((s) => {
              const dur = s.completedAt && s.startedAt
                ? Math.round((new Date(s.completedAt).getTime() - new Date(s.startedAt).getTime()) / 3600000)
                : null
              return (
                <div key={s.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  background: 'var(--bg-primary)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '16px' }}>{STAGE_ICONS[s.stage] || '✅'}</span>
                    <div>
                      <p style={{ fontSize: '13px', fontWeight: 600 }}>{STAGE_LABELS[s.stage] || s.stage}</p>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {s.assignee?.name || 'Unassigned'}
                        {dur !== null && ` · ${dur < 24 ? `${dur}h` : `${Math.floor(dur / 24)}d`}`}
                      </p>
                    </div>
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {s.completedAt && new Date(s.completedAt).toLocaleDateString()}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Meta */}
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0 24px' }}>
        Added by {vehicle.createdBy?.name || 'System'} on {new Date(vehicle.createdAt).toLocaleDateString()}
      </p>
    </div>
  )
}

function ChecklistRow({ item, index, stageId, onUpdate }: {
  item: ChecklistItem; index: number; stageId: string; onUpdate: () => void
}) {
  const [toggling, setToggling] = useState(false)

  async function toggle() {
    setToggling(true)
    try {
      const res = await fetch(`/api/stages/${stageId}`)
      const data = await res.json()
      const checklist = data.stage?.checklist || []
      if (checklist[index]) {
        checklist[index].done = !checklist[index].done
        await fetch(`/api/stages/${stageId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ checklist }),
        })
      }
      onUpdate()
    } finally {
      setToggling(false)
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={toggling}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '10px 12px',
        borderRadius: '10px',
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        width: '100%',
        textAlign: 'left',
        transition: 'background 0.15s',
        minHeight: '44px',
        opacity: toggling ? 0.5 : 1,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-primary)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <span style={{
        width: '22px',
        height: '22px',
        borderRadius: '6px',
        border: item.done ? 'none' : '2px solid #d4d4d4',
        background: item.done ? '#1a1a1a' : 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        transition: 'all 0.15s',
      }}>
        {item.done && <span style={{ color: '#dffd6e', fontSize: '13px', fontWeight: 700 }}>✓</span>}
      </span>
      <span style={{
        fontSize: '14px',
        color: item.done ? 'var(--text-muted)' : 'var(--text-primary)',
        textDecoration: item.done ? 'line-through' : 'none',
        fontWeight: 500,
      }}>
        {item.item}
      </span>
    </button>
  )
}

function ActionBtn({ label, onClick, style: btnStyle }: { label: string; onClick: () => void; style: 'primary' | 'success' | 'danger' | 'warning' }) {
  const [loading, setLoading] = useState(false)
  const styles: Record<string, { bg: string; color: string; border: string }> = {
    primary: { bg: '#1a1a1a', color: '#dffd6e', border: '#1a1a1a' },
    success: { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
    danger: { bg: '#fef2f2', color: '#ef4444', border: '#fecaca' },
    warning: { bg: '#fffbeb', color: '#d97706', border: '#fde68a' },
  }
  const s = styles[btnStyle]

  return (
    <button
      onClick={async () => { setLoading(true); await onClick(); setLoading(false) }}
      disabled={loading}
      style={{
        flex: btnStyle === 'danger' ? '0 0 auto' : 1,
        padding: '10px 20px',
        borderRadius: '12px',
        border: `1px solid ${s.border}`,
        background: s.bg,
        color: s.color,
        fontSize: '14px',
        fontWeight: 600,
        cursor: 'pointer',
        minHeight: '44px',
        opacity: loading ? 0.5 : 1,
        transition: 'opacity 0.15s',
      }}
    >
      {loading ? '...' : label}
    </button>
  )
}
