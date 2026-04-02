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
  dueDate: string | null
  scopeName: string | null
  estimatedHours: number | null
  startedAt: string
  completedAt: string | null
}

type ScopeTemplate = {
  id: string
  stage: string
  name: string
  checklist: { item: string; done: boolean; note: string }[]
}

type Part = {
  id: string
  name: string
  url: string | null
  status: string
  price: string | null
  tracking: string | null
  notes: string | null
  createdAt: string
  requestedBy: { id: string; name: string }
  assignedTo: { id: string; name: string } | null
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
  mechanic: '', detailing: '', content: '', publish: '', completed: '',
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
  const [activeTab, setActiveTab] = useState('overview')
  
  // Parts state
  const [parts, setParts] = useState<Part[]>([])
  const [partsLoading, setPartsLoading] = useState(false)
  const [showAddPart, setShowAddPart] = useState(false)
  const [partForm, setPartForm] = useState({ name: '', url: '', notes: '', assignedToId: '' })
  const [editingPartId, setEditingPartId] = useState<string | null>(null)
  
  // History state
  const [history, setHistory] = useState<any[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // Original state
  const [editing, setEditing] = useState(false)
  const [editChecklist, setEditChecklist] = useState<ChecklistItem[]>([])
  const [newTaskText, setNewTaskText] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingInfo, setEditingInfo] = useState(false)
  const [editInfo, setEditInfo] = useState({ stockNumber: '', vin: '', year: '', make: '', model: '', color: '', trim: '', notes: '', stageStatus: '', estimatedHours: '', dueDate: '' })
  const [showAdvanceModal, setShowAdvanceModal] = useState(false)
  const [scopeTemplates, setScopeTemplates] = useState<ScopeTemplate[]>([])
  const [selectedScope, setSelectedScope] = useState('')
  const [advanceDueDate, setAdvanceDueDate] = useState('')
  const [advanceChecklist, setAdvanceChecklist] = useState<ChecklistItem[]>([])
  const [advanceEstHours, setAdvanceEstHours] = useState('')

  const refresh = () => fetch(`/api/vehicles/${id}`).then(r => r.json()).then(d => setVehicle(d.vehicle))
  
  const loadParts = () => {
    setPartsLoading(true)
    fetch(`/api/parts?vehicleId=${id}`)
      .then(r => r.json())
      .then(d => setParts(d.parts || []))
      .catch(console.error)
      .finally(() => setPartsLoading(false))
  }

  const loadHistory = () => {
    if (history.length > 0) return // Already loaded
    setHistoryLoading(true)
    fetch(`/api/vehicles/${id}/history`)
      .then(r => r.json())
      .then(d => setHistory(d.events || []))
      .catch(console.error)
      .finally(() => setHistoryLoading(false))
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false))
    loadParts()
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

  const currentStage = vehicle.stages.find((s) => s.status !== 'done' && s.status !== 'skipped')
  const completedStages = vehicle.stages.filter((s) => s.status === 'done' || s.status === 'skipped')
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
        {!editingInfo ? (
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
            {isAdmin && (
              <button onClick={() => {
                setEditInfo({
                  stockNumber: vehicle.stockNumber,
                  vin: vehicle.vin || '',
                  year: vehicle.year?.toString() || '',
                  make: vehicle.make,
                  model: vehicle.model,
                  color: vehicle.color || '',
                  trim: vehicle.trim || '',
                  notes: vehicle.notes || '',
                  stageStatus: currentStage?.status || 'pending',
                  estimatedHours: currentStage?.estimatedHours?.toString() || '',
                  dueDate: currentStage?.dueDate ? new Date(currentStage.dueDate).toISOString().split('T')[0] : '',
                })
                setEditingInfo(true)
              }} style={{
                fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', background: 'none',
                border: '1px solid var(--border)', borderRadius: 8, padding: '4px 12px', cursor: 'pointer', minHeight: 'auto',
              }}>Edit</button>
            )}
          </div>
        ) : (
          <div style={{ marginBottom: 16 }}>
            <div className="form-row" style={{ marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <label className="form-label">Stock #</label>
                <input className="input" value={editInfo.stockNumber} onChange={e => setEditInfo({ ...editInfo, stockNumber: e.target.value })} />
              </div>
              <div style={{ flex: 1 }}>
                <label className="form-label">VIN</label>
                <input className="input" value={editInfo.vin} onChange={e => setEditInfo({ ...editInfo, vin: e.target.value })} />
              </div>
            </div>
            <div className="form-row" style={{ marginBottom: 8 }}>
              <div style={{ flex: '0 0 80px' }}>
                <label className="form-label">Year</label>
                <input className="input" type="number" value={editInfo.year} onChange={e => setEditInfo({ ...editInfo, year: e.target.value })} />
              </div>
              <div style={{ flex: 1 }}>
                <label className="form-label">Make</label>
                <input className="input" value={editInfo.make} onChange={e => setEditInfo({ ...editInfo, make: e.target.value })} />
              </div>
              <div style={{ flex: 1 }}>
                <label className="form-label">Model</label>
                <input className="input" value={editInfo.model} onChange={e => setEditInfo({ ...editInfo, model: e.target.value })} />
              </div>
            </div>
            <div className="form-row" style={{ marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <label className="form-label">Color</label>
                <input className="input" value={editInfo.color} onChange={e => setEditInfo({ ...editInfo, color: e.target.value })} />
              </div>
              <div style={{ flex: 1 }}>
                <label className="form-label">Trim</label>
                <input className="input" value={editInfo.trim} onChange={e => setEditInfo({ ...editInfo, trim: e.target.value })} />
              </div>
            </div>
            <div style={{ marginBottom: 8 }}>
              <label className="form-label">Notes</label>
              <textarea className="input" rows={2} value={editInfo.notes} onChange={e => setEditInfo({ ...editInfo, notes: e.target.value })} style={{ resize: 'vertical' }} />
            </div>
            {/* Stage settings */}
            {currentStage && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginBottom: 8 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                  Stage Settings
                </p>
                <div className="form-row" style={{ marginBottom: 8, gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label className="form-label">Status</label>
                    <select className="input" value={editInfo.stageStatus} onChange={e => setEditInfo({ ...editInfo, stageStatus: e.target.value })} style={{ fontSize: 13 }}>
                      <option value="pending">Pending</option>
                      <option value="in_progress">In Progress</option>
                      <option value="blocked">Blocked</option>
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="form-label">Est. Hours</label>
                    <input type="number" className="input" step="0.5" min="0" placeholder="e.g. 4"
                      value={editInfo.estimatedHours} onChange={e => setEditInfo({ ...editInfo, estimatedHours: e.target.value })} style={{ fontSize: 13 }} />
                  </div>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <label className="form-label">Due Date</label>
                  <input type="date" className="input"
                    value={editInfo.dueDate} onChange={e => setEditInfo({ ...editInfo, dueDate: e.target.value })}
                    style={{ fontSize: 13 }} />
                </div>
                <div style={{ marginBottom: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                  <label className="form-label">Move to Stage</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select id="moveStageSelect" className="input" defaultValue="" style={{ fontSize: 13, flex: 1 }}>
                      <option value="" disabled>Current: {currentStage.stage.charAt(0).toUpperCase() + currentStage.stage.slice(1)}</option>
                      {['mechanic', 'detailing', 'content', 'publish', 'completed'].filter(s => s !== currentStage.stage).map(s => (
                        <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                      ))}
                    </select>
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: 13, whiteSpace: 'nowrap' }}
                      onClick={async () => {
                        const sel = (document.getElementById('moveStageSelect') as HTMLSelectElement).value
                        if (!sel) { alert('Select a stage'); return }
                        if (!confirm(`Move this vehicle to ${sel.charAt(0).toUpperCase() + sel.slice(1)}?`)) return
                        const res = await fetch(`/api/vehicles/${vehicle.id}/move-stage`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ targetStage: sel }),
                        })
                        if (res.ok) {
                          window.location.reload()
                        } else {
                          const err = await res.json()
                          alert(err.error || 'Failed to move stage')
                        }
                      }}
                    >Move</button>
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setEditingInfo(false)} className="btn btn-secondary" style={{ fontSize: 13 }}>Cancel</button>
              <button onClick={async () => {
                await fetch(`/api/vehicles/${vehicle.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    stockNumber: editInfo.stockNumber,
                    vin: editInfo.vin || null,
                    year: editInfo.year ? parseInt(editInfo.year) : null,
                    make: editInfo.make,
                    model: editInfo.model,
                    color: editInfo.color || null,
                    trim: editInfo.trim || null,
                    notes: editInfo.notes || null,
                  }),
                })
                if (currentStage) {
                  const stageRes = await fetch(`/api/stages/${currentStage.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      status: editInfo.stageStatus,
                      estimatedHours: editInfo.estimatedHours || null,
                      dueDate: editInfo.dueDate || null,
                    }),
                  })
                  if (!stageRes.ok) {
                    const err = await stageRes.json()
                    alert(`Stage update failed: ${err.error || 'Unknown error'}`)
                    return
                  }
                }
                setEditingInfo(false)
                refresh()
              }} className="btn btn-primary" style={{ fontSize: 13 }}>Save</button>
            </div>
          </div>
        )}

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
          {stageIcon && <span style={{ fontSize: '20px' }}>{stageIcon}</span>}
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: '14px', fontWeight: 600 }}>{stageLabel}</p>
            {currentStage && (
              <>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {STATUS_LABELS[currentStage.status] || currentStage.status}
                  {currentStage.scopeName && ` · ${currentStage.scopeName}`}
                  {timeStr && ` · ${timeStr}`}
                  {currentStage.assignee && ` · ${currentStage.assignee.name}`}
                </p>
                {currentStage.dueDate && (
                  <p style={{
                    fontSize: '11px', fontWeight: 600, marginTop: 2,
                    color: new Date(currentStage.dueDate) < new Date() && currentStage.status !== 'done' ? '#ef4444' : 'var(--text-muted)',
                  }}>
                    Due: {new Date(currentStage.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    {new Date(currentStage.dueDate) < new Date() && currentStage.status !== 'done' && ' (OVERDUE)'}
                  </p>
                )}
                {currentStage.estimatedHours && (
                  <p style={{ fontSize: '11px', fontWeight: 600, marginTop: 2, color: 'var(--text-muted)' }}>
                    Est: {currentStage.estimatedHours}h
                  </p>
                )}
              </>
            )}
            {vehicle.status === 'completed' && (
              <div>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Completed {vehicle.completedAt && new Date(vehicle.completedAt).toLocaleDateString()}
                </p>
                {isAdmin && (
                  <button onClick={async () => {
                    const reason = prompt('Why is this vehicle going back through recon?')
                    if (!reason) return
                    await fetch(`/api/vehicles/${vehicle.id}/restart`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ reason }),
                    })
                    refresh()
                  }} style={{
                    marginTop: 8, padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                    background: '#1a1a1a', color: '#dffd6e', border: 'none', cursor: 'pointer',
                  }}>
                    Restart Recon
                  </button>
                )}
              </div>
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

      {/* Tabs */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border)', marginBottom: '24px' }}>
          {[
            { key: 'overview', label: 'Overview', count: null },
            { key: 'parts', label: 'Parts', count: parts.length },
            { key: 'history', label: 'History', count: completedStages.length }
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key)
                if (tab.key === 'history') loadHistory()
              }}
              style={{
                padding: '12px 16px',
                borderRadius: '8px 8px 0 0',
                border: 'none',
                background: activeTab === tab.key ? '#ffffff' : 'transparent',
                color: activeTab === tab.key ? 'var(--text-primary)' : 'var(--text-muted)',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                borderBottom: activeTab === tab.key ? '2px solid #1a1a1a' : '2px solid transparent',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              {tab.label}
              {tab.count !== null && (
                <span style={{
                  background: activeTab === tab.key ? '#1a1a1a' : 'var(--border)',
                  color: activeTab === tab.key ? '#dffd6e' : 'var(--text-muted)',
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '2px 6px',
                  borderRadius: '4px',
                  minWidth: '18px',
                  textAlign: 'center'
                }}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && currentStage && (
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
                Edit Tasks
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
          {(() => {
            const allDone = currentStage.checklist.length > 0 && currentStage.checklist.every(c => c.done)
            const doneCount = currentStage.checklist.filter(c => c.done).length
            const totalCount = currentStage.checklist.length
            return (
              <div style={{ marginTop: '16px' }}>
                {/* Progress indicator */}
                {currentStage.status === 'in_progress' && totalCount > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: allDone ? '#16a34a' : 'var(--text-muted)' }}>
                        {allDone ? 'All tasks complete — ready to advance' : `${totalCount - doneCount} task${totalCount - doneCount !== 1 ? 's' : ''} remaining`}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: allDone ? '#16a34a' : 'var(--text-secondary)' }}>
                        {doneCount}/{totalCount}
                      </span>
                    </div>
                    <div style={{ height: 6, background: '#f0f0ec', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{
                        width: `${totalCount > 0 ? (doneCount / totalCount) * 100 : 0}%`,
                        height: '100%',
                        background: allDone ? '#22c55e' : '#1a1a1a',
                        borderRadius: 3,
                        transition: 'width 0.3s ease',
                      }} />
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '8px' }}>
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
                      {allDone ? (
                        <ActionBtn label="Advance to Next Stage →" style="success" onClick={async () => {
                          // Fetch scope templates for next stage
                          const NEXT: Record<string, string> = { mechanic: 'detailing', detailing: 'content', content: 'publish', publish: 'completed' }
                          const next = NEXT[currentStage.stage]
                          if (next === 'completed') {
                            await fetch(`/api/stages/${currentStage.id}/advance`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
                            refresh()
                            return
                          }
                          const tmplRes = await fetch(`/api/stage-templates?stage=${next}`)
                          const tmpls = await tmplRes.json()
                          setScopeTemplates(tmpls)
                          setSelectedScope('')
                          setAdvanceDueDate('')
                          setAdvanceEstHours('')
                          setAdvanceChecklist([])
                          setShowAdvanceModal(true)
                        }} />
                      ) : (
                        <div style={{
                          flex: 1, padding: '10px 20px', borderRadius: 12,
                          border: '1px solid var(--border)', background: '#f5f5f3',
                          fontSize: 14, fontWeight: 600, color: 'var(--text-muted)',
                          textAlign: 'center', minHeight: 44,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          Complete all tasks to advance
                        </div>
                      )}
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
            )
          })()}
        </div>
        )}

        {activeTab === 'parts' && (
          <PartsSection 
            vehicleId={vehicle.id}
            parts={parts}
            onPartsChange={loadParts}
            isAdmin={isAdmin}
          />
        )}

        {activeTab === 'history' && (
          <VehicleHistorySection 
            history={history}
            loading={historyLoading}
          />
        )}
      </div>

      {/* Meta */}
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0 24px' }}>
        Added by {vehicle.createdBy?.name || 'System'} on {new Date(vehicle.createdAt).toLocaleDateString()}
      </p>

      {/* Advance Modal — pick scope + deadline for next stage */}
      {showAdvanceModal && currentStage && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, maxWidth: 480, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Advance to Next Stage</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
              Configure the next stage before advancing.
            </p>

            {/* Due Date + Estimated Hours */}
            <div className="form-row" style={{ marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <label className="form-label">Due Date</label>
                <input type="date" className="input" value={advanceDueDate} onChange={e => setAdvanceDueDate(e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <label className="form-label">Est. Hours</label>
                <input type="number" className="input" step="0.5" min="0" placeholder="e.g. 4"
                  value={advanceEstHours} onChange={e => setAdvanceEstHours(e.target.value)} />
              </div>
            </div>

            {/* Scope Templates */}
            {scopeTemplates.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <label className="form-label">Work Scope</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button type="button" onClick={() => { setSelectedScope(''); setAdvanceChecklist([]) }}
                    style={{
                      padding: '10px 14px', borderRadius: 10, border: `2px solid ${!selectedScope ? '#1a1a1a' : 'var(--border)'}`,
                      background: !selectedScope ? '#1a1a1a' : '#fff', color: !selectedScope ? '#dffd6e' : 'var(--text-secondary)',
                      fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left', minHeight: 42,
                    }}>
                    Use default checklist
                  </button>
                  {scopeTemplates.map(t => (
                    <button key={t.id} type="button" onClick={() => {
                      setSelectedScope(t.name)
                      setAdvanceChecklist((t.checklist as { item: string }[]).map(c => ({ item: c.item, done: false, note: '' })))
                    }}
                      style={{
                        padding: '10px 14px', borderRadius: 10, border: `2px solid ${selectedScope === t.name ? '#1a1a1a' : 'var(--border)'}`,
                        background: selectedScope === t.name ? '#1a1a1a' : '#fff', color: selectedScope === t.name ? '#dffd6e' : 'var(--text-secondary)',
                        fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left', minHeight: 42,
                      }}>
                      {t.name}
                      <span style={{ display: 'block', fontSize: 11, fontWeight: 400, marginTop: 2, color: selectedScope === t.name ? '#b0b0b0' : 'var(--text-muted)' }}>
                        {(t.checklist as { item: string }[]).map(c => c.item).join(', ')}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Preview checklist if scope selected */}
            {advanceChecklist.length > 0 && (
              <div style={{ marginBottom: 16, padding: 14, background: 'var(--bg-primary)', borderRadius: 10 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>
                  Checklist Preview
                </p>
                {advanceChecklist.map((c, i) => (
                  <p key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '3px 0' }}>
                    {i + 1}. {c.item}
                  </p>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button onClick={() => setShowAdvanceModal(false)} className="btn btn-secondary" style={{ flex: 1 }}>Cancel</button>
              <button onClick={async () => {
                await fetch(`/api/stages/${currentStage.id}/advance`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    dueDate: advanceDueDate || null,
                    scopeName: selectedScope || null,
                    checklist: advanceChecklist.length > 0 ? advanceChecklist : undefined,
                    estimatedHours: advanceEstHours ? parseFloat(advanceEstHours) : null,
                  }),
                })
                setShowAdvanceModal(false)
                refresh()
              }} className="btn btn-primary" style={{ flex: 1 }}>
                Advance
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function VehicleHistorySection({ history, loading }: {
  history: any[]
  loading: boolean
}) {
  const getEventIcon = (type: string, status?: string) => {
    switch (type) {
      case 'stage':
        if (status === 'skipped') return '⚠️'
        return status === 'done' ? '✅' : '🔄'
      case 'part':
        return status === 'received' ? '📦' : '🔧'
      case 'external':
        return status === 'returned' ? '🏠' : '🏪'
      case 'activity':
        return '📋'
      default:
        return '•'
    }
  }

  const getEventColor = (type: string, status?: string) => {
    switch (type) {
      case 'stage':
        if (status === 'skipped') return '#f59e0b'
        return status === 'done' ? '#16a34a' : '#6366f1'
      case 'part':
        return status === 'received' ? '#16a34a' : '#2563eb'
      case 'external':
        return status === 'returned' ? '#16a34a' : '#f59e0b'
      case 'activity':
        return '#6b7280'
      default:
        return '#6b7280'
    }
  }

  if (loading) {
    return (
      <div style={{
        background: '#ffffff',
        border: '1px solid var(--border)',
        borderRadius: '16px',
        padding: '40px',
        textAlign: 'center'
      }}>
        <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin mx-auto" style={{ borderColor: '#e8e8e4', borderTopColor: 'transparent' }} />
        <p style={{ marginTop: '16px', fontSize: '14px', color: 'var(--text-muted)' }}>Loading history...</p>
      </div>
    )
  }

  if (history.length === 0) {
    return (
      <div style={{
        background: '#ffffff',
        border: '1px solid var(--border)',
        borderRadius: '16px',
        padding: '40px',
        textAlign: 'center'
      }}>
        <p style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>No history available</p>
        <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Vehicle history will appear here as events occur</p>
      </div>
    )
  }

  return (
    <div style={{
      background: '#ffffff',
      border: '1px solid var(--border)',
      borderRadius: '16px',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        padding: '20px 24px',
        borderBottom: '1px solid var(--border)',
        background: '#f8f9fa'
      }}>
        <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>Vehicle History Timeline</h3>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
          Complete chronological history of all events
        </p>
      </div>

      {/* Timeline */}
      <div style={{ padding: '20px 24px' }}>
        <div style={{ position: 'relative' }}>
          {/* Timeline line */}
          <div style={{
            position: 'absolute',
            left: '20px',
            top: '0',
            bottom: '0',
            width: '2px',
            background: 'linear-gradient(to bottom, #e5e7eb, #f3f4f6)'
          }} />

          {/* Timeline events */}
          {history.map((event, index) => {
            const eventColor = getEventColor(event.type, event.status)
            const isLast = index === history.length - 1

            return (
              <div key={index} style={{ 
                position: 'relative', 
                paddingLeft: '52px',
                paddingBottom: isLast ? '0' : '24px'
              }}>
                {/* Timeline dot */}
                <div style={{
                  position: 'absolute',
                  left: '11px',
                  top: '4px',
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  background: '#ffffff',
                  border: `3px solid ${eventColor}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '10px',
                  zIndex: 1
                }}>
                  {getEventIcon(event.type, event.status)}
                </div>

                {/* Event content */}
                <div style={{
                  background: event.details?.skipped ? '#fef3c7' : '#f8f9fa',
                  border: `1px solid ${event.details?.skipped ? '#fbbf24' : '#e5e7eb'}`,
                  borderRadius: '12px',
                  padding: '16px 20px'
                }}>
                  {/* Event header */}
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'flex-start',
                    marginBottom: '8px'
                  }}>
                    <h4 style={{ 
                      fontSize: '15px', 
                      fontWeight: 600, 
                      margin: 0,
                      color: event.details?.skipped ? '#92400e' : 'var(--text-primary)'
                    }}>
                      {event.title}
                      {event.details?.skipped && (
                        <span style={{
                          marginLeft: '8px',
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: '#fbbf24',
                          color: '#92400e',
                          textTransform: 'uppercase'
                        }}>
                          SKIPPED
                        </span>
                      )}
                    </h4>
                    <span style={{ 
                      fontSize: '12px', 
                      color: 'var(--text-muted)',
                      whiteSpace: 'nowrap'
                    }}>
                      {new Date(event.date).toLocaleDateString()} {new Date(event.date).toLocaleTimeString()}
                    </span>
                  </div>

                  {/* Event details */}
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    {event.type === 'stage' && (
                      <div>
                        <p style={{ margin: '0 0 4px 0' }}>
                          Assigned to: {event.details.assignee}
                          {event.details.duration && (
                            <span style={{ marginLeft: '12px' }}>
                              Duration: {event.details.duration < 24 ? `${event.details.duration}h` : `${Math.floor(event.details.duration / 24)}d`}
                            </span>
                          )}
                        </p>
                        {event.details.totalTasks > 0 && (
                          <p style={{ margin: '4px 0 0 0' }}>
                            Tasks completed: {event.details.completedTasks}/{event.details.totalTasks}
                            {event.details.skipped && event.details.completedTasks < event.details.totalTasks && (
                              <span style={{ color: '#f59e0b', fontWeight: 600, marginLeft: '8px' }}>
                                ({event.details.totalTasks - event.details.completedTasks} tasks remaining)
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                    )}

                    {event.type === 'part' && (
                      <div>
                        <p style={{ margin: '0 0 4px 0' }}>
                          Part: {event.details.partName}
                          {event.details.requestedBy && (
                            <span style={{ marginLeft: '12px' }}>
                              Requested by: {event.details.requestedBy}
                            </span>
                          )}
                        </p>
                        {event.details.url && (
                          <p style={{ margin: '4px 0 0 0' }}>
                            <a href={event.details.url} target="_blank" rel="noopener noreferrer" 
                               style={{ color: '#2563eb', textDecoration: 'none' }}>
                              View Link →
                            </a>
                          </p>
                        )}
                        {event.details.currentStatus && (
                          <p style={{ margin: '4px 0 0 0', fontWeight: 600 }}>
                            Current status: {event.details.currentStatus}
                          </p>
                        )}
                      </div>
                    )}

                    {event.type === 'external' && (
                      <div>
                        <p style={{ margin: '0 0 4px 0' }}>
                          Shop: {event.details.shopName}
                        </p>
                        <p style={{ margin: '4px 0 0 0' }}>
                          Work: {event.details.repairDescription}
                        </p>
                        {event.details.estimatedDays && (
                          <p style={{ margin: '4px 0 0 0' }}>
                            Estimated: {event.details.estimatedDays} days
                          </p>
                        )}
                      </div>
                    )}

                    {event.type === 'activity' && (
                      <p style={{ margin: 0 }}>
                        {event.details.actor && `by ${event.details.actor}`}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function PartsSection({ vehicleId, parts, onPartsChange, isAdmin }: {
  vehicleId: string
  parts: Part[]
  onPartsChange: () => void
  isAdmin: boolean
}) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [newPart, setNewPart] = useState({ name: '', url: '', notes: '', assignedToId: '' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editData, setEditData] = useState<any>({})
  const [saving, setSaving] = useState(false)

  const statusLabels: Record<string, string> = {
    requested: 'Requested',
    sourced: 'Sourced', 
    ordered: 'Ordered',
    received: 'Received'
  }

  const statusColors: Record<string, { bg: string; color: string; border: string }> = {
    requested: { bg: '#fef2f2', color: '#ef4444', border: '#fecaca' },
    sourced: { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
    ordered: { bg: '#fefce8', color: '#eab308', border: '#fde047' },
    received: { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' }
  }

  async function addPart() {
    if (!newPart.name.trim()) return
    setSaving(true)
    try {
      const response = await fetch('/api/parts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleId,
          name: newPart.name,
          url: newPart.url || null,
          notes: newPart.notes || null,
          assignedToId: newPart.assignedToId || null
        })
      })
      if (response.ok) {
        setNewPart({ name: '', url: '', notes: '', assignedToId: '' })
        setShowAddForm(false)
        onPartsChange()
      }
    } catch (error) {
      console.error('Error adding part:', error)
    }
    setSaving(false)
  }

  async function updatePart(partId: string, updates: any) {
    setSaving(true)
    try {
      const response = await fetch(`/api/parts/${partId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      })
      if (response.ok) {
        setEditingId(null)
        onPartsChange()
      }
    } catch (error) {
      console.error('Error updating part:', error)
    }
    setSaving(false)
  }

  return (
    <div style={{
      background: '#ffffff',
      border: '1px solid var(--border)',
      borderRadius: '16px',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        padding: '20px 24px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>Parts</h3>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
            Track vehicle parts requests and sourcing
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            border: '1px solid #1a1a1a',
            background: '#1a1a1a',
            color: '#dffd6e',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          Add Part
        </button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', background: '#f8f9fa' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                Part Name *
              </label>
              <input
                type="text"
                value={newPart.name}
                onChange={e => setNewPart({ ...newPart, name: e.target.value })}
                placeholder="e.g. Front brake pads"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '14px'
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                URL (optional)
              </label>
              <input
                type="url"
                value={newPart.url}
                onChange={e => setNewPart({ ...newPart, url: e.target.value })}
                placeholder="https://..."
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '14px'
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                Notes (optional)
              </label>
              <textarea
                value={newPart.notes}
                onChange={e => setNewPart({ ...newPart, notes: e.target.value })}
                rows={2}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  resize: 'vertical'
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowAddForm(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: '#fff',
                  color: 'var(--text-secondary)',
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={addPart}
                disabled={saving || !newPart.name.trim()}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: '1px solid #1a1a1a',
                  background: '#1a1a1a',
                  color: '#dffd6e',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving || !newPart.name.trim() ? 0.5 : 1
                }}
              >
                {saving ? 'Adding...' : 'Add Part'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Parts list */}
      {parts.length === 0 ? (
        <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <p style={{ fontSize: '14px', marginBottom: '8px' }}>No parts requested yet</p>
          <p style={{ fontSize: '13px' }}>Add parts needed for this vehicle</p>
        </div>
      ) : (
        <div>
          {parts.map((part, index) => {
            const statusStyle = statusColors[part.status] || statusColors.requested
            const isEditing = editingId === part.id

            return (
              <div
                key={part.id}
                style={{
                  padding: '16px 24px',
                  borderBottom: index < parts.length - 1 ? '1px solid var(--border)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px'
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
                    <h4 style={{ fontSize: '15px', fontWeight: 600, margin: 0 }}>{part.name}</h4>
                    <div style={{
                      ...statusStyle,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 600,
                      border: `1px solid ${statusStyle.border}`
                    }}>
                      {statusLabels[part.status]}
                    </div>
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                    Requested by {part.requestedBy.name}
                    {part.assignedTo && ` • Assigned to ${part.assignedTo.name}`}
                    {part.price && ` • ${part.price}`}
                  </div>
                  {part.url && (
                    <a
                      href={part.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: '13px',
                        color: '#2563eb',
                        textDecoration: 'none',
                        display: 'block',
                        marginTop: '4px'
                      }}
                    >
                      View Link →
                    </a>
                  )}
                  {part.notes && (
                    <p style={{
                      fontSize: '13px',
                      color: 'var(--text-secondary)',
                      margin: '4px 0 0 0',
                      fontStyle: 'italic'
                    }}>
                      {part.notes}
                    </p>
                  )}
                </div>
                {(isAdmin || part.assignedTo) && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {isAdmin && (
                      <select
                        value={part.status}
                        onChange={(e) => updatePart(part.id, { status: e.target.value })}
                        disabled={saving}
                        style={{
                          padding: '4px 8px',
                          border: '1px solid var(--border)',
                          borderRadius: '4px',
                          fontSize: '12px',
                          cursor: 'pointer'
                        }}
                      >
                        <option value="requested">Requested</option>
                        <option value="sourced">Sourced</option>
                        <option value="ordered">Ordered</option>
                        <option value="received">Received</option>
                      </select>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
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
