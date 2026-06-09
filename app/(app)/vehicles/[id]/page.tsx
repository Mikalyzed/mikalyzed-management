'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

// ─── Types ─────────────────────────────────────────────────────────

type ChecklistItem = { item: string; done: boolean; note?: string }

type ReconStage = {
  id: string
  stage: string
  status: string
  assignee: { id: string; name: string } | null
  startedAt: string
  completedAt: string | null
  scopeName: string | null
  estimatedHours: number | null
  dueDate: string | null
  notes: string | null
  checklist?: ChecklistItem[]
}

type ExternalRepairRecord = {
  id: string
  shopName: string
  shopPhone: string | null
  atDealership: boolean
  repairDescription: string
  estimatedDays: number | null
  sentDate: string | null
  expectedReturn: string | null
  status: string
  notes: string | null
  createdAt: string
  updatedAt: string
  vendor: { id: string; name: string } | null
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
  completedAt: string | null
  createdAt: string
  vehicleInfo: string | null
  mileage: number | null
  location: string | null
  askingPrice: number | null
  vehicleCost: number | null
  purchaseType: string | null
  purchasedFrom: string | null
  titleStatus: string | null
  dateInStock: string | null
  inventoryStatus: string | null
  consignmentCommissionPct: number | null
  // Phase 2 flooring
  floorLender: string | null
  floorPrincipal: number | null
  floorDailyRate: number | null // percent per day (e.g. 0.025 means 0.025%/day)
  floorAdvanceDate: string | null
  floorStatus: string | null // pending | active | paid_off
  stages?: ReconStage[]
  externalRepairs?: ExternalRepairRecord[]
  currentAssignee?: { id: string; name: string } | null
}

type ActivityEvent = {
  id: string
  entityType: string
  entityId: string
  action: string
  createdAt: string
  details: Record<string, unknown> | null
  actor: { name: string } | null
}

type Part = {
  id: string
  name: string
  status: string
  price: string | null
  url: string | null
  tracking: string | null
  notes: string | null
  createdAt: string
  sourceStageId: string | null
  requestedBy: { id: string; name: string } | null
  assignedTo: { id: string; name: string } | null
}

type CostAdd = {
  id: string
  vehicleId: string
  kind: string
  amountCents: number
  description: string | null
  vendor: string | null
  receiptUrl: string | null
  addedAt: string
  addedBy: { id: string; name: string } | null
}

type MediaAsset = {
  id: string
  type: string
  contentType: string | null
  sizeBytes: number | null
  filename: string | null
  caption: string | null
  sortOrder: number
  uploadedAt: string
  uploadedBy: { id: string; name: string } | null
  url: string
}

const MEDIA_TYPE_LABELS: Record<string, string> = {
  exterior: 'Exterior',
  interior: 'Interior',
  undercarriage: 'Undercarriage',
  walkaround_video: 'Walkaround Video',
  turntable_video: 'Turntable Video',
  doc: 'Document',
  other: 'Other',
}

function isVideoType(t: string) { return t.endsWith('_video') }

const COST_KIND_LABELS: Record<string, string> = {
  recon: 'Recon',
  parts: 'Parts',
  transport: 'Transport',
  detail: 'Detail',
  pack: 'Pack',
  acquisition_fee: 'Acquisition Fee',
  other: 'Other',
}

// ─── Helpers ───────────────────────────────────────────────────────

const money = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—')

const fmtDateTime = (s: string | null) => (s ? new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—')

const daysAgo = (s: string | null): number | null => {
  if (!s) return null
  const ms = Date.now() - new Date(s).getTime()
  if (!Number.isFinite(ms) || ms < 0) return null
  return Math.floor(ms / 86400000)
}

// Real flooring calc from vehicle's floor_* fields
function computeFlooring(vehicle: Vehicle) {
  if (!vehicle.floorPrincipal || !vehicle.floorDailyRate || !vehicle.floorAdvanceDate || vehicle.floorStatus === 'paid_off') return null
  const days = daysAgo(vehicle.floorAdvanceDate) ?? 0
  const rateFraction = vehicle.floorDailyRate / 100 // 0.025% per day → 0.00025 multiplier
  const accrued = Math.round(vehicle.floorPrincipal * rateFraction * days * 100) / 100
  const costPerDay = Math.round(vehicle.floorPrincipal * rateFraction * 100) / 100
  return {
    lender: vehicle.floorLender || 'Unspecified lender',
    dailyRate: vehicle.floorDailyRate,
    principal: vehicle.floorPrincipal,
    daysHeld: days,
    accruedInterest: accrued,
    costPerDay,
    payoff: Math.round((vehicle.floorPrincipal + accrued) * 100) / 100,
    status: vehicle.floorStatus || 'active',
    advanceDate: vehicle.floorAdvanceDate,
  }
}

// Activity-log noise filter — checklist toggles, free-text edits, and other micro-actions
// pollute the audit feed. The Logs tab hides these so prominent events stand out.
const NOISY_ACTIONS = new Set<string>([
  'updated',         // generic stage PATCH (checklist toggle, note edit, etc.)
  'part_updated',    // generic part PATCH
])

// Human-readable description of an activity-log event, pulling real values
// from the `details` payload so each row tells a useful story.
function describeEvent(e: ActivityEvent, stages: ReconStage[] = []): { title: string; meta?: string } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d: any = e.details || {}
  const action = e.action

  // Resolve the stage name when the event targets a recon stage on this vehicle
  const stage = e.entityType === 'stage' ? stages.find(s => s.id === e.entityId) : null
  const stageName = stage ? (STAGE_LABEL[stage.stage] || stage.stage) : null

  // ── Stage transitions ─────────────────────────────────────────────
  if (action.startsWith('status_')) {
    const newStatus = action.slice(7).replace(/_/g, ' ')
    return { title: stageName ? `${stageName} → ${newStatus}` : `Status → ${newStatus}` }
  }
  if (action === 'stage_completed') {
    const name = stageName || (d.stage && (STAGE_LABEL[d.stage] || d.stage))
    return { title: name ? `${name} stage completed` : 'Stage completed' }
  }
  if (action === 'paused') {
    const meta = [d.pauseReason, d.pauseDetail].filter(Boolean).join(' · ')
    return { title: stageName ? `${stageName} paused` : 'Stage paused', meta: meta || undefined }
  }
  if (action === 'returned_to_stage') {
    const to = d.returnedStage ? (STAGE_LABEL[d.returnedStage] || d.returnedStage) : null
    const from = d.fromStage ? (STAGE_LABEL[d.fromStage] || d.fromStage) : null
    return { title: to ? `Returned to ${to}` : 'Returned to earlier stage', meta: from ? `from ${from}` : undefined }
  }
  if (action === 'stage_moved') {
    return { title: stageName ? `${stageName} moved` : 'Stage moved' }
  }
  if (action === 'routed') {
    const next = d.nextStage || d.targetStage
    return { title: next ? `Routed → ${STAGE_LABEL[next] || next}` : 'Routed' }
  }
  if (action === 'recon_restarted')      return { title: 'Recon restarted' }
  if (action === 'inspection_completed') return { title: 'Inspection completed' }
  if (action.startsWith('timer_')) {
    const t = action.slice(6).replace(/_/g, ' ')
    const meta = [d.pauseReason, d.pauseDetail].filter(Boolean).join(' · ')
    return { title: stageName ? `${stageName} timer ${t}` : `Timer ${t}`, meta: meta || undefined }
  }
  if (action === 'updated' && e.entityType === 'stage') {
    const fields = Object.keys(d).filter(k => k !== 'status').slice(0, 3).join(', ')
    return { title: stageName ? `${stageName} stage edited` : 'Stage edited', meta: fields || undefined }
  }

  // ── Money ────────────────────────────────────────────────────────
  if (action === 'cost_add_created') {
    const amt = typeof d.amountCents === 'number' ? `$${(d.amountCents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}` : ''
    const kind = d.kind ? (COST_KIND_LABELS[d.kind] || d.kind) : 'cost'
    const meta = [d.description, d.vendor].filter(Boolean).join(' · ')
    return { title: `${kind} cost added${amt ? ` · ${amt}` : ''}`, meta: meta || undefined }
  }
  if (action === 'cost_add_deleted') {
    const amt = typeof d.amountCents === 'number' ? `$${(d.amountCents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}` : ''
    const kind = d.kind ? (COST_KIND_LABELS[d.kind] || d.kind) : 'cost'
    return { title: `${kind} cost removed${amt ? ` · ${amt}` : ''}` }
  }

  // ── Media ────────────────────────────────────────────────────────
  if (action === 'media_uploaded') {
    const label = d.type ? (MEDIA_TYPE_LABELS[d.type] || d.type) : 'Media'
    return { title: `${label} uploaded`, meta: d.filename || undefined }
  }
  if (action === 'media_deleted') {
    const label = d.type ? (MEDIA_TYPE_LABELS[d.type] || d.type) : 'Media'
    return { title: `${label} deleted` }
  }

  // ── Parts ────────────────────────────────────────────────────────
  if (action.startsWith('part_')) {
    const verb = action.slice(5).replace(/_/g, ' ')
    const name = d.partName || 'Part'
    return { title: `${name} · ${verb}` }
  }

  // ── Vehicle lifecycle ────────────────────────────────────────────
  if (action === 'created')                    return { title: 'Vehicle created' }
  if (action === 'promoted_from_placeholder')  return { title: 'Promoted from placeholder' }
  if (action === 'returned_from_external')     return { title: 'Returned from external repair' }
  if (action === 'status_changed')             return { title: 'Status changed' }

  // Fallback — surface the raw action name humanely
  return { title: action.replace(/_/g, ' ') }
}

const STAGE_LABEL: Record<string, string> = {
  mechanic: 'Mechanic',
  detailing: 'Detailing',
  content: 'Content',
  publish: 'Publish',
  external: 'External Repair',
  awaiting_routing: 'Awaiting Routing',
  completed: 'Completed',
}

// ─── Main ──────────────────────────────────────────────────────────

export default function VehicleDetailV2() {
  const { id } = useParams()
  const router = useRouter()
  const [vehicle, setVehicle] = useState<Vehicle | null>(null)
  const [parts, setParts] = useState<Part[]>([])
  const [activity, setActivity] = useState<ActivityEvent[]>([])
  const [costAdds, setCostAdds] = useState<CostAdd[]>([])
  const [media, setMedia] = useState<MediaAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'general' | 'recon' | 'marketing' | 'media' | 'files' | 'logs'>('general')
  const [vehicleInfoSubTab, setVehicleInfoSubTab] = useState<'general' | 'build_title' | 'description' | 'purchase_info'>('general')
  const [expandedStageId, setExpandedStageId] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [canSeeMoney, setCanSeeMoney] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [showEdit, setShowEdit] = useState(false)
  const [showAddCost, setShowAddCost] = useState(false)
  const [showSetFlooring, setShowSetFlooring] = useState(false)
  const [busy, setBusy] = useState(false)

  const refreshVehicle = () =>
    fetch(`/api/vehicles/${id}`)
      .then(async (r) => {
        if (!r.ok) return null
        const txt = await r.text()
        if (!txt) return null
        try { return JSON.parse(txt) } catch { return null }
      })
      .then((d) => setVehicle(d?.vehicle || null))
      .catch(() => setVehicle(null))

  const refreshParts = () =>
    fetch(`/api/parts?vehicleId=${id}`)
      .then(async (r) => {
        if (!r.ok) return null
        const txt = await r.text()
        if (!txt) return null
        try { return JSON.parse(txt) } catch { return null }
      })
      .then((d) => setParts(d?.parts || []))
      .catch(() => {})

  const refreshActivity = () =>
    fetch(`/api/vehicles/${id}/activity`)
      .then(async (r) => {
        if (!r.ok) return null
        const txt = await r.text()
        if (!txt) return null
        try { return JSON.parse(txt) } catch { return null }
      })
      .then((d) => setActivity(d?.events || []))
      .catch(() => {})

  const refreshCostAdds = () =>
    fetch(`/api/cost-adds?vehicleId=${id}`)
      .then(async (r) => {
        if (!r.ok) return null
        const txt = await r.text()
        if (!txt) return null
        try { return JSON.parse(txt) } catch { return null }
      })
      .then((d) => setCostAdds(d?.costAdds || []))
      .catch(() => {})

  const refreshMedia = () =>
    fetch(`/api/media?vehicleId=${id}`)
      .then(async (r) => {
        if (!r.ok) return null
        const txt = await r.text()
        if (!txt) return null
        try { return JSON.parse(txt) } catch { return null }
      })
      .then((d) => setMedia(d?.media || []))
      .catch(() => {})

  useEffect(() => {
    Promise.all([refreshVehicle(), refreshParts(), refreshActivity(), refreshCostAdds(), refreshMedia()]).finally(() => setLoading(false))

    const cookies = document.cookie.split(';').reduce((acc, c) => {
      const [k, v] = c.trim().split('=')
      acc[k] = v
      return acc
    }, {} as Record<string, string>)
    if (cookies.mm_user_role === 'admin') setIsAdmin(true)
    if (cookies.mm_user_role === 'admin' || cookies.mm_user_role === 'sales_manager') setCanSeeMoney(true)
    if (cookies.mm_user_id) setCurrentUserId(decodeURIComponent(cookies.mm_user_id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function deleteCostAdd(costAddId: string) {
    if (!confirm('Delete this cost add?')) return
    setBusy(true)
    await fetch(`/api/cost-adds/${costAddId}`, { method: 'DELETE' })
    await refreshCostAdds()
    setBusy(false)
  }

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
  if (!vehicle) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--danger)' }}>Vehicle not found</div>

  const days = daysAgo(vehicle.dateInStock)
  const flooring = computeFlooring(vehicle)

  // Stage actions
  async function completeStage(stageId: string) {
    if (!confirm('Mark this stage complete?')) return
    setBusy(true)
    await fetch(`/api/stages/${stageId}/complete`, { method: 'POST' })
    await refreshVehicle()
    setBusy(false)
  }
  async function blockStage(stageId: string) {
    const reason = prompt('Block reason:')
    if (!reason) return
    setBusy(true)
    await fetch(`/api/stages/${stageId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'blocked', blockNote: reason }),
    })
    await refreshVehicle()
    setBusy(false)
  }
  async function unblockStage(stageId: string) {
    setBusy(true)
    await fetch(`/api/stages/${stageId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'in_progress' }),
    })
    await refreshVehicle()
    setBusy(false)
  }

  // Inline checklist editing (mirrors recon board modal)
  async function toggleChecklistItem(stageId: string, index: number) {
    setVehicle((cur) => {
      if (!cur || !cur.stages) return cur
      const stage = cur.stages.find(s => s.id === stageId)
      if (!stage || !stage.checklist) return cur
      const updated = stage.checklist.map((item, i) => i === index ? { ...item, done: !item.done } : item)
      // Fire-and-forget API update
      fetch(`/api/stages/${stageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checklist: updated }),
      }).catch(() => {})
      return { ...cur, stages: cur.stages.map(s => s.id === stageId ? { ...s, checklist: updated } : s) }
    })
  }

  async function addChecklistTask(stageId: string, taskText: string) {
    const trimmed = taskText.trim()
    if (!trimmed) return
    setVehicle((cur) => {
      if (!cur || !cur.stages) return cur
      const stage = cur.stages.find(s => s.id === stageId)
      if (!stage) return cur
      const updated = [...(stage.checklist || []), { item: trimmed, done: false }]
      fetch(`/api/stages/${stageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checklist: updated }),
      }).catch(() => {})
      return { ...cur, stages: cur.stages.map(s => s.id === stageId ? { ...s, checklist: updated } : s) }
    })
  }

  async function removeChecklistTask(stageId: string, index: number) {
    setVehicle((cur) => {
      if (!cur || !cur.stages) return cur
      const stage = cur.stages.find(s => s.id === stageId)
      if (!stage || !stage.checklist) return cur
      const updated = stage.checklist.filter((_, i) => i !== index)
      fetch(`/api/stages/${stageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checklist: updated }),
      }).catch(() => {})
      return { ...cur, stages: cur.stages.map(s => s.id === stageId ? { ...s, checklist: updated } : s) }
    })
  }

  async function advanceStage(stageId: string) {
    if (!confirm('Advance to the next stage?')) return
    setBusy(true)
    await fetch(`/api/stages/${stageId}/advance`, { method: 'POST' })
    await refreshVehicle()
    setBusy(false)
  }

  return (
    <div style={{ maxWidth: '1500px', margin: '0 auto', padding: '16px 24px' }}>
      <button onClick={() => router.back()} style={{ color: 'var(--text-muted)', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', minHeight: 'auto', marginBottom: 16 }}>
        ← Inventory
      </button>

      {/* ═══ GLASSMORPHIC HERO ═══ */}
      <div style={{ position: 'relative', marginBottom: 24 }}>
        {/* Mesh-gradient backdrop (creates the surface that the glass blurs) */}
        <div aria-hidden style={{
          position: 'absolute',
          inset: '-30px',
          background: [
            'radial-gradient(at 18% 24%, hsla(220, 90%, 72%, 0.32) 0px, transparent 55%)',
            'radial-gradient(at 82% 8%, hsla(280, 80%, 68%, 0.28) 0px, transparent 55%)',
            'radial-gradient(at 72% 76%, hsla(190, 70%, 78%, 0.22) 0px, transparent 50%)',
            'radial-gradient(at 4% 96%, hsla(340, 75%, 72%, 0.26) 0px, transparent 55%)',
            'radial-gradient(at 50% 50%, hsla(40, 80%, 80%, 0.16) 0px, transparent 50%)',
          ].join(', '),
          filter: 'blur(60px) saturate(110%)',
          borderRadius: 40,
          zIndex: 0,
          pointerEvents: 'none',
        }} />

        {/* Glass card */}
        <div style={{
          position: 'relative',
          zIndex: 1,
          display: 'grid',
          gridTemplateColumns: '340px 1fr',
          gap: 24,
          padding: 28,
          background: 'rgba(255, 255, 255, 0.45)',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          borderRadius: 28,
          border: '1px solid rgba(255, 255, 255, 0.55)',
          boxShadow: [
            '0 16px 48px -12px rgba(31, 38, 135, 0.18)',
            '0 2px 8px rgba(0, 0, 0, 0.04)',
            'inset 0 1px 0 rgba(255, 255, 255, 0.7)',
            'inset 0 0 0 0.5px rgba(255, 255, 255, 0.3)',
          ].join(', '),
        }}>
          {/* Left: photo box — stretches to right column height */}
          {(() => {
            const heroPhoto = media.find((m) => !isVideoType(m.type) && m.type !== 'doc')
            return heroPhoto ? (
              <button
                type="button"
                onClick={() => setActiveTab('media')}
                title="View all media"
                style={{
                  width: '100%',
                  height: '100%',
                  minHeight: 220,
                  background: 'transparent',
                  borderRadius: 16,
                  overflow: 'hidden',
                  border: '1px solid rgba(255, 255, 255, 0.4)',
                  padding: 0,
                  cursor: 'pointer',
                  boxShadow: '0 8px 24px -8px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.5)',
                  alignSelf: 'stretch',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={heroPhoto.url} alt={heroPhoto.caption || ''} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setActiveTab('media')}
                title="Upload photos"
                style={{
                  width: '100%',
                  height: '100%',
                  minHeight: 220,
                  background: 'linear-gradient(145deg, rgba(20, 22, 30, 0.85), rgba(35, 38, 50, 0.7))',
                  backdropFilter: 'blur(14px)',
                  WebkitBackdropFilter: 'blur(14px)',
                  borderRadius: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'rgba(255, 255, 255, 0.9)',
                  gap: 8,
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  cursor: 'pointer',
                  boxShadow: [
                    '0 8px 24px -8px rgba(0, 0, 0, 0.35)',
                    'inset 0 1px 0 rgba(255, 255, 255, 0.08)',
                    'inset 0 -1px 0 rgba(0, 0, 0, 0.3)',
                  ].join(', '),
                  transition: 'transform 250ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                  alignSelf: 'stretch',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.005)' }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
              >
                <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.65)' }}>No Photo</span>
                <span style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.4)' }}>Click to add</span>
              </button>
            )
          })()}

          {/* Right: identity, chips, metrics */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Title row + actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
              <div>
                <p style={{ fontSize: 11, fontWeight: 600, color: 'rgba(0, 0, 0, 0.45)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6 }}>
                  STOCK · {vehicle.stockNumber}
                </p>
                <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.05, color: '#0a0a0a', marginBottom: 6 }}>
                  {vehicle.year} {vehicle.make}
                </h1>
                <p style={{ fontSize: 17, color: 'rgba(0, 0, 0, 0.6)', fontWeight: 500, letterSpacing: '-0.01em' }}>
                  {vehicle.model}{vehicle.trim && ` · ${vehicle.trim}`}
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end' }}>
                <V2StatusPill value={vehicle.inventoryStatus || vehicle.status} />
                <div style={{ display: 'flex', gap: 8 }}>
                  {isAdmin && <PillButton variant="ghost" onClick={() => setShowEdit(true)}>Edit</PillButton>}
                  <PillButton variant="primary">Mark Sold</PillButton>
                </div>
              </div>
            </div>

            {/* Satin capsules */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {vehicle.color && <SatinCapsule dotColor={vehicle.color}>{vehicle.color}</SatinCapsule>}
              {vehicle.mileage !== null && <SatinCapsule>{vehicle.mileage.toLocaleString()} mi</SatinCapsule>}
              {vehicle.location && <SatinCapsule>{vehicle.location}</SatinCapsule>}
              {vehicle.vin && <SatinCapsule mono>{vehicle.vin}</SatinCapsule>}
            </div>

            {/* Floating glass metric panels */}
            {canSeeMoney ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                <GlassMetric label="Vehicle Cost" value={money(vehicle.vehicleCost)} />
                <GlassMetric label="Asking" value={money(vehicle.askingPrice)} />
                <GlassMetric label="Days Held" value={days !== null ? `${days}d` : '—'} sub={vehicle.dateInStock ? fmtDate(vehicle.dateInStock) : undefined} />
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                <GlassMetric label="Days Held" value={days !== null ? `${days}d` : '—'} sub={vehicle.dateInStock ? fmtDate(vehicle.dateInStock) : undefined} />
                <GlassMetric label="Stage" value={vehicle.status?.replace(/_/g, ' ') || '—'} sub={vehicle.currentAssignee?.name ? `→ ${vehicle.currentAssignee.name}` : undefined} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ Workspace Tab Navigation ═══ */}
      <TabNav
        tabs={[
          { id: 'general',   label: 'Vehicle Info' },
          { id: 'recon',     label: 'Recon',     badge: vehicle.stages && vehicle.stages.length > 0 ? `${vehicle.stages.length}` : undefined },
          { id: 'marketing', label: 'Marketing' },
          { id: 'media',     label: 'Media',     badge: (() => { const n = media.filter(m => m.type !== 'doc').length; return n > 0 ? `${n}` : undefined })() },
          { id: 'files',     label: 'Files',     badge: (() => { const n = media.filter(m => m.type === 'doc').length; return n > 0 ? `${n}` : undefined })() },
          { id: 'logs',      label: 'Logs' },
        ]}
        activeId={activeTab}
        onChange={(id) => setActiveTab(id as typeof activeTab)}
      />

      {/* ═══ VEHICLE INFO TAB — 3 sub-tabs: General Info / Build · Title / Description ═══ */}
      {activeTab === 'general' && (
        <>
          {/* Sub-tab nav */}
          <SubTabNav
            tabs={[
              { id: 'general',       label: 'General Info' },
              { id: 'build_title',   label: 'Build / Title' },
              { id: 'description',   label: 'Description' },
              // Purchase Info holds money + lien data — admin / sales_manager only.
              ...(canSeeMoney ? [{ id: 'purchase_info' as const, label: 'Purchase Info' }] : []),
            ]}
            activeId={vehicleInfoSubTab}
            onChange={(id) => setVehicleInfoSubTab(id as typeof vehicleInfoSubTab)}
          />

          {/* ─── Sub-tab: General Info (2-col asymmetric) ─── */}
          {vehicleInfoSubTab === 'general' && (
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20, alignItems: 'start', marginBottom: 20 }}>

              {/* LEFT COLUMN — Operations & Financials */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
                {canSeeMoney && (
                  <PriceAndCostCard
                    vehicle={vehicle}
                    costAdds={costAdds}
                    isAdmin={isAdmin}
                    currentUserId={currentUserId}
                    busy={busy}
                    onAddCost={() => setShowAddCost(true)}
                    onDeleteCostAdd={deleteCostAdd}
                    onSavePartial={async (patch) => {
                      // Optimistic: reflect the change locally before the network round-trip
                      // so the value updates instantly.  Server response merges in after to
                      // pick up any derived/canonicalized values; on failure we re-fetch.
                      setVehicle((prev) => (prev ? { ...prev, ...patch } as Vehicle : prev))
                      const r = await fetch(`/api/vehicles/${vehicle.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(patch),
                      })
                      if (r.ok) {
                        const data = await r.json().catch(() => null)
                        if (data?.vehicle) {
                          setVehicle((prev) => (prev ? { ...prev, ...data.vehicle } : data.vehicle))
                        }
                      } else {
                        await refreshVehicle()
                      }
                    }}
                  />
                )}

                {/* Notes (Description has moved to its own sub-tab) */}
                {vehicle.notes && (
                  <GlassCard>
                    <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.45)', marginBottom: 12 }}>Notes</p>
                    <p style={{ fontSize: 15, color: 'rgba(0,0,0,0.72)', lineHeight: 1.7, fontStyle: 'italic' }}>{vehicle.notes}</p>
                  </GlassCard>
                )}
              </div>

              {/* RIGHT COLUMN — Status & Logistics */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
                {vehicle.vin && <CarfaxCard vin={vehicle.vin} />}
                <LogisticsHubCard
                  vehicle={vehicle}
                  flooring={flooring}
                  canSeeMoney={canSeeMoney}
                  isAdmin={isAdmin}
                  onEditFlooring={() => setShowSetFlooring(true)}
                />
                <PrintHubCard />
              </div>
            </div>
          )}

          {/* ─── Sub-tab: Title & Build Studio ─── */}
          {vehicleInfoSubTab === 'build_title' && (
            <TitleBuildStudio
              vehicle={vehicle}
              isAdmin={isAdmin}
              onSavePartial={async (patch) => {
                setVehicle((prev) => (prev ? { ...prev, ...patch } as Vehicle : prev))
                const r = await fetch(`/api/vehicles/${vehicle.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(patch),
                })
                if (r.ok) {
                  const data = await r.json().catch(() => null)
                  if (data?.vehicle) {
                    setVehicle((prev) => (prev ? { ...prev, ...data.vehicle } : data.vehicle))
                  }
                } else {
                  await refreshVehicle()
                }
              }}
            />
          )}

          {/* ─── Sub-tab: Description (marketing copy editor + AI polish) ─── */}
          {vehicleInfoSubTab === 'description' && (
            <DescriptionEditor
              value={vehicle.vehicleInfo || ''}
              vehicle={vehicle}
              onSave={async (text) => {
                const r = await fetch(`/api/vehicles/${vehicle.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ vehicleInfo: text || null }),
                })
                if (r.ok) await refreshVehicle()
              }}
            />
          )}

          {/* ─── Sub-tab: Purchase Info (admin / sales_manager only) ─── */}
          {vehicleInfoSubTab === 'purchase_info' && canSeeMoney && (
            <PurchaseInfoStudio
              vehicle={vehicle}
              isAdmin={isAdmin}
              onSavePartial={async (patch: Record<string, unknown>) => {
                setVehicle((prev) => (prev ? { ...prev, ...patch } as Vehicle : prev))
                const r = await fetch(`/api/vehicles/${vehicle.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(patch),
                })
                if (r.ok) {
                  const data = await r.json().catch(() => null)
                  if (data?.vehicle) setVehicle((prev) => (prev ? { ...prev, ...data.vehicle } : data.vehicle))
                } else {
                  await refreshVehicle()
                }
              }}
            />
          )}
        </>
      )}

      {/* ═══ RECON TAB — timeline ═══ */}
      {activeTab === 'recon' && (() => {
        // The vehicle jacket weaves recon stages + external repair tickets
        // into one chronological timeline.  Stages own the "in-house work"
        // story (mechanic / detailing / content / publish); externals are
        // the chunks where the car was off-site at a vendor shop.
        type TimelineEntry =
          | { kind: 'stage'; date: number; stage: ReconStage }
          | { kind: 'external'; date: number; external: ExternalRepairRecord }
        const stageEntries: TimelineEntry[] = (vehicle.stages || []).map((s) => ({
          kind: 'stage',
          date: s.startedAt ? new Date(s.startedAt).getTime() : 0,
          stage: s,
        }))
        const externalEntries: TimelineEntry[] = (vehicle.externalRepairs || []).map((er) => ({
          kind: 'external',
          date: new Date(er.sentDate || er.createdAt).getTime(),
          external: er,
        }))
        const entries = [...stageEntries, ...externalEntries].sort((a, b) => a.date - b.date)
        const stageCount = stageEntries.length
        const externalCount = externalEntries.length

        return (
            <GlassCard>
              <GlassEyebrow
                label="Recon History"
                subtitle={entries.length > 0
                  ? `${stageCount} stage${stageCount === 1 ? '' : 's'}${externalCount > 0 ? ` · ${externalCount} external repair${externalCount === 1 ? '' : 's'}` : ''} · current: ${vehicle.status?.replace(/_/g, ' ')}`
                  : 'No recon history yet'}
              />
              {entries.length > 0 ? (
                <div style={{ position: 'relative' }}>
                  {/* Vertical timeline spine */}
                  <div aria-hidden style={{
                    position: 'absolute', left: 7, top: 18,
                    bottom: 18, width: 1,
                    background: 'linear-gradient(to bottom, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.06) 100%)',
                    pointerEvents: 'none',
                  }} />

                  {entries.map((entry) => {
                    if (entry.kind === 'external') {
                      const er = entry.external
                      const isOpen = er.status !== 'returned'
                      return (
                        <div key={`er-${er.id}`} style={{ position: 'relative', paddingLeft: 30 }}>
                          {/* Amber dot — external repair lives off-site */}
                          <div aria-hidden style={{
                            position: 'absolute', left: 1, top: 18,
                            width: 13, height: 13, borderRadius: '50%',
                            background: isOpen ? '#fef3c7' : '#1d1d1f',
                            border: isOpen ? '2px solid #b45309' : '1.5px solid rgba(0,0,0,0.22)',
                            boxShadow: isOpen ? '0 0 0 4px rgba(180, 83, 9, 0.18)' : '0 1px 3px rgba(0,0,0,0.18)',
                            zIndex: 1,
                            transition: 'all 200ms ease',
                          }} />
                          <div style={{ padding: '12px 0', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                              <span style={{ fontSize: 14, fontWeight: 700, color: '#1d1d1f', letterSpacing: '-0.005em' }}>
                                External Repair
                                <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.5)', marginLeft: 8, fontWeight: 500 }}>
                                  · {er.vendor?.name || er.shopName}
                                </span>
                              </span>
                              <span style={{
                                fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                                padding: '3px 9px', borderRadius: 999,
                                background: isOpen ? 'rgba(180, 83, 9, 0.12)' : 'rgba(0, 0, 0, 0.05)',
                                color: isOpen ? '#92400e' : 'rgba(0,0,0,0.55)',
                                border: `1px solid ${isOpen ? 'rgba(180, 83, 9, 0.25)' : 'rgba(0,0,0,0.1)'}`,
                                whiteSpace: 'nowrap',
                              }}>{er.status.replace(/_/g, ' ')}</span>
                            </div>
                            <div style={{ display: 'flex', gap: 14, marginTop: 5, fontSize: 11, color: 'rgba(0,0,0,0.55)', flexWrap: 'wrap', fontWeight: 500 }}>
                              <span>{fmtDate(er.sentDate || er.createdAt)}{er.expectedReturn ? ` → ${fmtDate(er.expectedReturn)} (est.)` : ''}</span>
                              {er.estimatedDays && <span>~{er.estimatedDays} days</span>}
                              {er.shopPhone && <span>{er.shopPhone}</span>}
                            </div>
                            {er.repairDescription && (
                              <p style={{ fontSize: 12, color: 'rgba(0,0,0,0.65)', marginTop: 8, lineHeight: 1.5 }}>
                                {er.repairDescription}
                              </p>
                            )}
                            {er.notes && (
                              <p style={{ fontSize: 12, color: 'rgba(0,0,0,0.55)', marginTop: 6, fontStyle: 'italic' }}>
                                ↳ {er.notes}
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    }
                    const s = entry.stage
                    const isActive = s.status !== 'done' && s.status !== 'skipped' && !s.completedAt
                    const isDone = s.status === 'done' || !!s.completedAt
                    const isExpanded = expandedStageId === s.id
                    const checkedCount = s.checklist?.filter(c => c.done).length || 0
                    const totalCount = s.checklist?.length || 0
                    const stagePartsOrdered = parts.filter(p => p.sourceStageId === s.id)

                    return (
                      <div key={s.id} style={{ position: 'relative', paddingLeft: 30 }}>
                        {/* Minimal timeline dot */}
                        <div aria-hidden style={{
                          position: 'absolute', left: 1, top: 18,
                          width: 13, height: 13, borderRadius: '50%',
                          background: isDone ? '#1d1d1f' : isActive ? '#dffd6e' : 'rgba(255,255,255,0.9)',
                          border: isActive ? '2px solid #1d1d1f' : '1.5px solid rgba(0,0,0,0.22)',
                          boxShadow: isActive
                            ? '0 0 0 4px rgba(223, 253, 110, 0.35)'
                            : isDone ? '0 1px 3px rgba(0,0,0,0.18)' : 'none',
                          zIndex: 1,
                          transition: 'all 200ms ease',
                        }} />

                        {/* Stage header — clickable */}
                        <button
                          onClick={() => setExpandedStageId(isExpanded ? null : s.id)}
                          style={{
                            width: '100%',
                            display: 'flex',
                            gap: 12,
                            alignItems: 'center',
                            padding: '12px 0',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            textAlign: 'left',
                            minHeight: 'auto',
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                              <span style={{ fontSize: 14, fontWeight: 700, color: '#1d1d1f', letterSpacing: '-0.005em' }}>
                                {STAGE_LABEL[s.stage] || s.stage}
                                {s.scopeName && <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.5)', marginLeft: 8, fontWeight: 500 }}>· {s.scopeName}</span>}
                              </span>
                              <V2StageStatus value={s.status} active={isActive} />
                            </div>
                            {/* Micro labels: technician + dates + timer */}
                            <div style={{ display: 'flex', gap: 14, marginTop: 5, fontSize: 11, color: 'rgba(0,0,0,0.55)', flexWrap: 'wrap', fontWeight: 500 }}>
                              {s.assignee && <span>{s.assignee.name}</span>}
                              <span>{fmtDate(s.startedAt)}{s.completedAt ? ` → ${fmtDate(s.completedAt)}` : ''}</span>
                              {totalCount > 0 && <span>{checkedCount}/{totalCount} tasks</span>}
                              {stagePartsOrdered.length > 0 && <span>{stagePartsOrdered.length} part{stagePartsOrdered.length === 1 ? '' : 's'}</span>}
                              {s.estimatedHours && <span>~{s.estimatedHours}h</span>}
                            </div>
                          </div>
                          <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.3)', flexShrink: 0 }}>
                            {isExpanded ? '▲' : '▼'}
                          </span>
                        </button>

                    {/* Expanded content */}
                    {isExpanded && (
                      <div style={{ padding: '4px 0 16px 40px' }}>
                        {/* Checklist (editable when stage is active) */}
                        {((s.checklist && s.checklist.length > 0) || isActive) && (
                          <div style={{ marginBottom: 12 }}>
                            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                              Checklist {(s.checklist?.length || 0) > 0 && `· ${checkedCount}/${totalCount}`}
                            </p>
                            {s.checklist && s.checklist.length > 0 && s.checklist.map((item, i) => (
                              <div
                                key={i}
                                onClick={isActive ? () => toggleChecklistItem(s.id, i) : undefined}
                                style={{
                                  display: 'flex', gap: 10, alignItems: 'flex-start',
                                  padding: '8px 10px',
                                  background: item.done ? '#f0fdf4' : (isActive ? '#f8f8f6' : 'transparent'),
                                  border: '1px solid',
                                  borderColor: item.done ? '#bbf7d0' : (isActive ? '#e5e5e5' : 'transparent'),
                                  borderRadius: 8,
                                  marginBottom: 4,
                                  cursor: isActive ? 'pointer' : 'default',
                                  transition: 'all 0.15s',
                                }}
                              >
                                <span style={{
                                  display: 'inline-flex', width: 18, height: 18, borderRadius: 4,
                                  background: item.done ? '#22c55e' : 'transparent',
                                  border: `2px solid ${item.done ? '#22c55e' : 'var(--border)'}`,
                                  alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
                                }}>
                                  {item.done && <span style={{ color: '#fff', fontSize: 12, fontWeight: 700, lineHeight: 1 }}>✓</span>}
                                </span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <span style={{ fontSize: 13, color: item.done ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: item.done ? 'line-through' : 'none' }}>
                                    {item.item}
                                  </span>
                                  {item.note && (
                                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, fontStyle: 'italic' }}>↳ {item.note}</p>
                                  )}
                                </div>
                                {/* Admin remove — small X next to each item on the active stage. */}
                                {isAdmin && isActive && (
                                  <button
                                    type="button"
                                    title="Remove this task"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      if (confirm(`Remove "${item.item}" from this checklist?`)) {
                                        removeChecklistTask(s.id, i)
                                      }
                                    }}
                                    style={{
                                      flexShrink: 0,
                                      width: 22, height: 22, borderRadius: 6,
                                      border: 'none', background: 'transparent',
                                      color: 'rgba(0,0,0,0.35)', cursor: 'pointer',
                                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                      padding: 0, minHeight: 'auto',
                                      transition: 'background 140ms ease, color 140ms ease',
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.background = 'rgba(239, 68, 68, 0.12)'
                                      e.currentTarget.style.color = '#dc2626'
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.background = 'transparent'
                                      e.currentTarget.style.color = 'rgba(0,0,0,0.35)'
                                    }}
                                  >
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                                      <path d="M18 6L6 18M6 6l12 12" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                            ))}

                            {/* Add custom task — only when active */}
                            {isActive && (
                              <form
                                onSubmit={(e) => {
                                  e.preventDefault()
                                  const input = e.currentTarget.elements.namedItem('newTask') as HTMLInputElement
                                  addChecklistTask(s.id, input.value)
                                  input.value = ''
                                }}
                                style={{ display: 'flex', gap: 6, marginTop: 8 }}
                              >
                                <input
                                  name="newTask"
                                  placeholder="+ Add custom task..."
                                  style={{
                                    flex: 1, padding: '8px 12px', borderRadius: 8,
                                    border: '1px solid var(--border)', fontSize: 13, background: '#fff',
                                  }}
                                />
                                <button
                                  type="submit"
                                  style={{
                                    padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)',
                                    background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 'auto',
                                  }}
                                >Add</button>
                              </form>
                            )}
                          </div>
                        )}

                        {/* Notes */}
                        {s.notes && (
                          <div style={{ marginBottom: 12 }}>
                            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Notes</p>
                            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{s.notes}</p>
                          </div>
                        )}

                        {/* Parts ordered during this stage */}
                        {stagePartsOrdered.length > 0 && (
                          <div style={{ marginBottom: 12 }}>
                            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Parts Ordered ({stagePartsOrdered.length})</p>
                            {stagePartsOrdered.map((p) => (
                              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <p style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</p>
                                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                    {p.requestedBy?.name || 'Unknown'} · {fmtDate(p.createdAt)}
                                    {p.tracking && ` · 📦 ${p.tracking}`}
                                  </p>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                                  <V2PartStatus value={p.status} />
                                  {p.price && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{money(parseFloat(p.price))}</span>}
                                </div>
                              </div>
                            ))}
                            <a href={`/parts?vehicleId=${vehicle.id}`} style={{ display: 'inline-block', marginTop: 8, fontSize: 12, color: 'var(--text-secondary)', textDecoration: 'underline' }}>
                              Manage parts →
                            </a>
                          </div>
                        )}

                        {/* Empty state inside expand */}
                        {(!s.checklist || s.checklist.length === 0) && !s.notes && stagePartsOrdered.length === 0 && (
                          <p style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>No checklist, notes, or parts recorded for this stage.</p>
                        )}

                        {/* Active-stage actions */}
                        {isActive && (() => {
                          const allDone = totalCount > 0 && checkedCount === totalCount
                          return (
                            <div style={{ display: 'flex', gap: 8, paddingTop: 12, borderTop: '1px solid var(--border)', flexWrap: 'wrap', alignItems: 'center' }}>
                              {s.status === 'blocked' ? (
                                <button onClick={() => unblockStage(s.id)} disabled={busy} style={v2Btn('primary')}>Unblock</button>
                              ) : (
                                <>
                                  {/* Advance Stage — primary when all done */}
                                  <button
                                    onClick={() => advanceStage(s.id)}
                                    disabled={busy || !allDone}
                                    style={{
                                      padding: '10px 18px', borderRadius: 8, border: 'none',
                                      background: allDone ? '#dffd6e' : '#e5e5e5',
                                      color: allDone ? '#1a1a1a' : '#999',
                                      fontSize: 14, fontWeight: 700,
                                      cursor: allDone && !busy ? 'pointer' : 'not-allowed',
                                      minHeight: 'auto',
                                    }}
                                    title={allDone ? 'Advance to next stage' : 'Complete all checklist items first'}
                                  >
                                    Advance Stage →
                                  </button>
                                  <button onClick={() => completeStage(s.id)} disabled={busy} style={v2Btn('ghost')}>✓ Complete</button>
                                  <button onClick={() => blockStage(s.id)} disabled={busy} style={v2Btn('ghost')}>Block</button>
                                </>
                              )}
                              <a
                                href={`/vehicles?focus=${vehicle.id}`}
                                style={{ ...v2Btn('ghost'), textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
                              >
                                Open in Recon Board →
                              </a>
                            </div>
                          )
                        })()}
                      </div>
                    )}
                  </div>
                )
                  })}
                </div>
              ) : (
                <p style={{ color: 'rgba(0,0,0,0.5)', fontSize: 13, fontStyle: 'italic' }}>
                  This vehicle has no recon history yet. {vehicle.status === 'inventory_only' && '(Inventory-only — never started recon.)'}
                </p>
              )}
            </GlassCard>
        )
      })()}
      {/* ═══ MARKETING TAB ═══ */}
      {activeTab === 'marketing' && <ChannelSyndicationCard />}

      {/* ═══ MEDIA TAB ═══ */}
      {activeTab === 'media' && (
        <MediaStudio
          vehicleId={vehicle.id}
          media={media}
          onChange={refreshMedia}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
        />
      )}

      {/* ═══ FILES TAB ═══ */}
      {activeTab === 'files' && (
        <FilesVault
          vehicleId={vehicle.id}
          media={media}
          onChange={refreshMedia}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
        />
      )}

      {/* ═══ LOGS TAB ═══ */}
      {activeTab === 'logs' && (() => {
        const prominent = activity.filter(e => !NOISY_ACTIONS.has(e.action))
        const shown = prominent.slice(0, 50)
        const hiddenCount = activity.length - prominent.length
        return (
          <GlassCard>
            <GlassEyebrow
              label="Activity Log"
              subtitle={prominent.length === 0
                ? hiddenCount > 0
                  ? `${hiddenCount} minor edit${hiddenCount === 1 ? '' : 's'} hidden`
                  : 'No activity yet'
                : `${prominent.length} significant event${prominent.length === 1 ? '' : 's'}${hiddenCount > 0 ? ` · ${hiddenCount} minor edit${hiddenCount === 1 ? '' : 's'} hidden` : ''}`}
            />
            {shown.length === 0 ? (
              <p style={{ color: 'rgba(0,0,0,0.5)', fontSize: 13, fontStyle: 'italic' }}>
                Nothing significant logged yet. Stage transitions, cost adds, media uploads, and price changes show up here.
              </p>
            ) : shown.map((e, i) => {
              const desc = describeEvent(e, vehicle.stages || [])
              return (
                <div key={e.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                  padding: '12px 0',
                  borderBottom: i < shown.length - 1 ? '1px solid rgba(0,0,0,0.06)' : 'none',
                  gap: 12,
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0 }}>
                    <span style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                      padding: '3px 7px', borderRadius: 4,
                      background: 'rgba(0,0,0,0.06)', color: 'rgba(0,0,0,0.55)',
                      marginTop: 2, flexShrink: 0,
                    }}>{e.entityType}</span>
                    <div style={{ minWidth: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#1d1d1f' }}>{desc.title}</span>
                      {desc.meta && (
                        <p style={{ fontSize: 12, color: 'rgba(0,0,0,0.55)', marginTop: 3, fontWeight: 500 }}>
                          {desc.meta}
                        </p>
                      )}
                      <p style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)', marginTop: 3 }}>
                        by {e.actor?.name || 'system'}
                      </p>
                    </div>
                  </div>
                  <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.4)', flexShrink: 0 }}>{fmtDateTime(e.createdAt)}</span>
                </div>
              )
            })}
          </GlassCard>
        )
      })()}

      {/* ═══ EDIT MODAL ═══ */}
      {showEdit && (
        <EditVehicleModal
          vehicle={vehicle}
          onClose={() => setShowEdit(false)}
          onSaved={async () => {
            await refreshVehicle()
            setShowEdit(false)
          }}
        />
      )}

      {/* ═══ ADD COST MODAL ═══ */}
      {showAddCost && (
        <AddCostModal
          vehicleId={vehicle.id}
          onClose={() => setShowAddCost(false)}
          onSaved={async () => {
            await refreshCostAdds()
            setShowAddCost(false)
          }}
        />
      )}

      {/* ═══ SET FLOORING MODAL ═══ */}
      {showSetFlooring && (
        <SetFlooringModal
          vehicle={vehicle}
          onClose={() => setShowSetFlooring(false)}
          onSaved={async () => {
            await refreshVehicle()
            setShowSetFlooring(false)
          }}
        />
      )}
    </div>
  )
}

// ─── Set Flooring Modal ─────────────────────────────────────────────

function SetFlooringModal({ vehicle, onClose, onSaved }: { vehicle: Vehicle; onClose: () => void; onSaved: () => void }) {
  const [lender, setLender] = useState(vehicle.floorLender || 'Mikalyzed LLC')
  const [principal, setPrincipal] = useState(vehicle.floorPrincipal?.toString() || vehicle.vehicleCost?.toString() || '')
  const [dailyRate, setDailyRate] = useState(vehicle.floorDailyRate?.toString() || '0.025')
  const [advanceDate, setAdvanceDate] = useState(
    vehicle.floorAdvanceDate
      ? new Date(vehicle.floorAdvanceDate).toISOString().slice(0, 10)
      : vehicle.dateInStock
        ? new Date(vehicle.dateInStock).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10)
  )
  const [status, setStatus] = useState(vehicle.floorStatus || 'active')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    const p = parseFloat(principal)
    const r = parseFloat(dailyRate)
    if (!Number.isFinite(p) || p <= 0) { setErr('Principal must be a positive number'); return }
    if (!Number.isFinite(r) || r <= 0) { setErr('Daily rate must be a positive percent (e.g. 0.025)'); return }
    setSaving(true); setErr(null)
    try {
      const res = await fetch(`/api/vehicles/${vehicle.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          floorLender: lender.trim() || null,
          floorPrincipal: p,
          floorDailyRate: r,
          floorAdvanceDate: advanceDate || null,
          floorStatus: status,
        }),
      })
      if (!res.ok) {
        const txt = await res.text()
        setErr(`Save failed (${res.status}): ${txt.slice(0, 120)}`)
        setSaving(false); return
      }
      onSaved()
    } catch (e) {
      setErr(`Save failed: ${e instanceof Error ? e.message : String(e)}`)
      setSaving(false)
    }
  }

  async function clearFlooring() {
    if (!confirm('Remove flooring from this vehicle?')) return
    setSaving(true); setErr(null)
    await fetch(`/api/vehicles/${vehicle.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        floorLender: null, floorPrincipal: null, floorDailyRate: null, floorAdvanceDate: null, floorStatus: null,
      }),
    })
    onSaved()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 24, maxWidth: 500, width: '100%', boxShadow: '0 24px 48px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>{vehicle.floorPrincipal ? 'Edit Flooring' : 'Set Flooring'}</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>Daily interest accrues on top of vehicle cost</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: 'var(--text-muted)', minHeight: 'auto' }}>×</button>
        </div>

        <div style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Lender</p>
          <input value={lender} onChange={(e) => setLender(e.target.value)} placeholder="e.g. NextGear Capital, Floorplan Xpress"
            style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14 }} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Principal ($)</p>
            <input type="number" step="100" min="0" value={principal} onChange={(e) => setPrincipal(e.target.value)} placeholder="0"
              style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14 }} />
          </div>
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Daily Rate (%)</p>
            <input type="number" step="0.001" min="0" value={dailyRate} onChange={(e) => setDailyRate(e.target.value)} placeholder="0.025"
              style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14 }} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Advance Date</p>
            <input type="date" value={advanceDate} onChange={(e) => setAdvanceDate(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14 }} />
          </div>
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Status</p>
            <select value={status} onChange={(e) => setStatus(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, background: '#fff' }}>
              <option value="pending">Pending</option>
              <option value="active">Active</option>
              <option value="paid_off">Paid Off</option>
            </select>
          </div>
        </div>

        {err && <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{err}</p>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
          <div>
            {vehicle.floorPrincipal && (
              <button onClick={clearFlooring} disabled={saving} style={{ ...v2Btn('ghost'), color: '#ef4444' }}>Remove flooring</button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} disabled={saving} style={v2Btn('ghost')}>Cancel</button>
            <button onClick={save} disabled={saving} style={v2Btn('primary')}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Add Cost Modal ─────────────────────────────────────────────────

function AddCostModal({ vehicleId, onClose, onSaved }: { vehicleId: string; onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useState<string>('recon')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [vendor, setVendor] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    const num = parseFloat(amount)
    if (!Number.isFinite(num) || num <= 0) {
      setErr('Amount must be a positive number')
      return
    }
    setSaving(true)
    setErr(null)
    try {
      const r = await fetch('/api/cost-adds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleId,
          kind,
          amount: num,
          description: description.trim() || undefined,
          vendor: vendor.trim() || undefined,
        }),
      })
      if (!r.ok) {
        const txt = await r.text()
        setErr(`Save failed (${r.status}): ${txt.slice(0, 100)}`)
        setSaving(false)
        return
      }
      onSaved()
    } catch (e) {
      setErr(`Save failed: ${e instanceof Error ? e.message : String(e)}`)
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 24, maxWidth: 480, width: '100%', boxShadow: '0 24px 48px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>Add Cost</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>Itemized cost that rolls into true cost</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: 'var(--text-muted)', minHeight: 'auto' }}>×</button>
        </div>

        <div style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Category</p>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, background: '#fff' }}
          >
            {Object.entries(COST_KIND_LABELS).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Amount ($)</p>
          <input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            autoFocus
            style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14 }}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Description</p>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. New radiator, ball joints, etc."
            style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14 }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Vendor (optional)</p>
          <input
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            placeholder="Vendor or supplier name"
            style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14 }}
          />
        </div>

        {err && <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{err}</p>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={saving} style={v2Btn('ghost')}>Cancel</button>
          <button onClick={save} disabled={saving || !amount} style={v2Btn('primary')}>
            {saving ? 'Saving…' : 'Add Cost'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Edit Modal ─────────────────────────────────────────────────────

function EditVehicleModal({ vehicle, onClose, onSaved }: { vehicle: Vehicle; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    stockNumber: vehicle.stockNumber,
    vin: vehicle.vin || '',
    year: vehicle.year?.toString() || '',
    make: vehicle.make,
    model: vehicle.model,
    color: vehicle.color || '',
    trim: vehicle.trim || '',
    notes: vehicle.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setErr(null)
    try {
      const r = await fetch(`/api/vehicles/${vehicle.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stockNumber: form.stockNumber,
          vin: form.vin || null,
          year: form.year ? parseInt(form.year) : null,
          make: form.make,
          model: form.model,
          color: form.color || null,
          trim: form.trim || null,
          notes: form.notes || null,
        }),
      })
      if (!r.ok) {
        const txt = await r.text()
        setErr(`Save failed (${r.status}): ${txt.slice(0, 100)}`)
        setSaving(false)
        return
      }
      onSaved()
    } catch (e) {
      setErr(`Save failed: ${e instanceof Error ? e.message : String(e)}`)
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 24, maxWidth: 560, width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 48px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>Edit Vehicle</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>Admin only · changes save immediately</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: 'var(--text-muted)', minHeight: 'auto' }}>×</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <Field label="Stock #" value={form.stockNumber} onChange={(v) => setForm({ ...form, stockNumber: v })} />
          <Field label="VIN" value={form.vin} onChange={(v) => setForm({ ...form, vin: v })} mono />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr', gap: 12, marginBottom: 12 }}>
          <Field label="Year" type="number" value={form.year} onChange={(v) => setForm({ ...form, year: v })} />
          <Field label="Make" value={form.make} onChange={(v) => setForm({ ...form, make: v })} />
          <Field label="Model" value={form.model} onChange={(v) => setForm({ ...form, model: v })} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <Field label="Color" value={form.color} onChange={(v) => setForm({ ...form, color: v })} />
          <Field label="Trim" value={form.trim} onChange={(v) => setForm({ ...form, trim: v })} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Notes</p>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={4}
            style={{ width: '100%', padding: 10, border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', resize: 'vertical' }}
          />
        </div>

        {err && <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{err}</p>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={saving} style={v2Btn('ghost')}>Cancel</button>
          <button onClick={save} disabled={saving || !form.stockNumber || !form.make || !form.model} style={v2Btn('primary')}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', mono }: { label: string; value: string; onChange: (v: string) => void; type?: string; mono?: boolean }) {
  return (
    <div>
      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</p>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, fontFamily: mono ? 'ui-monospace, monospace' : 'inherit' }}
      />
    </div>
  )
}

// ─── UI primitives ──────────────────────────────────────────────────

function V2StageStatus({ value, active }: { value: string; active: boolean }) {
  const colors: Record<string, { bg: string; color: string }> = {
    pending: { bg: '#eff6ff', color: '#2563eb' },
    in_progress: { bg: '#fef3c7', color: '#92400e' },
    blocked: { bg: '#fee2e2', color: '#991b1b' },
    awaiting_parts: { bg: '#f3e8ff', color: '#7c3aed' },
    done: { bg: '#dcfce7', color: '#15803d' },
    skipped: { bg: '#f0f0ec', color: '#525252' },
  }
  const c = colors[value] || { bg: '#f0f0ec', color: 'var(--text-muted)' }
  return (
    <span style={{
      fontSize: 11, padding: '3px 8px',
      background: active ? c.bg : '#f0f0ec',
      color: active ? c.color : 'var(--text-muted)',
      borderRadius: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em',
    }}>{value.replace(/_/g, ' ')}</span>
  )
}

function V2PartStatus({ value }: { value: string }) {
  const colors: Record<string, { bg: string; color: string }> = {
    requested: { bg: '#eff6ff', color: '#2563eb' },
    ready_to_order: { bg: '#fef3c7', color: '#92400e' },
    ordered: { bg: '#f3e8ff', color: '#7c3aed' },
    received: { bg: '#dcfce7', color: '#15803d' },
    installed: { bg: '#dcfce7', color: '#15803d' },
    canceled: { bg: '#fee2e2', color: '#991b1b' },
  }
  const c = colors[value] || { bg: '#f0f0ec', color: 'var(--text-muted)' }
  return (
    <span style={{
      fontSize: 10, padding: '2px 6px',
      background: c.bg, color: c.color,
      borderRadius: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em',
    }}>{value.replace(/_/g, ' ')}</span>
  )
}

// ─── Glassmorphic primitives ────────────────────────────────────────

function PillButton({
  children, onClick, variant = 'ghost', disabled,
}: {
  children: React.ReactNode
  onClick?: () => void
  variant?: 'primary' | 'ghost'
  disabled?: boolean
}) {
  const [hovered, setHovered] = useState(false)
  const [pressed, setPressed] = useState(false)

  const base: React.CSSProperties = {
    padding: '8px 18px',
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: '-0.005em',
    cursor: disabled ? 'not-allowed' : 'pointer',
    border: 'none',
    minHeight: 'auto',
    transition: 'transform 180ms cubic-bezier(0.25, 0.46, 0.45, 0.94), background 180ms ease, box-shadow 180ms ease',
    transform: pressed ? 'scale(0.97)' : hovered ? 'translateY(-1px)' : 'translateY(0)',
    opacity: disabled ? 0.4 : 1,
  }

  const variantStyles: React.CSSProperties =
    variant === 'primary'
      ? {
          background: hovered ? '#0a0a0a' : '#1d1d1f',
          color: '#fff',
          boxShadow: hovered
            ? '0 6px 16px -4px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.1)'
            : '0 2px 6px -2px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.08)',
        }
      : {
          background: hovered ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.5)',
          color: '#1d1d1f',
          boxShadow: hovered
            ? '0 4px 12px -4px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.6), inset 0 0 0 1px rgba(255,255,255,0.4)'
            : '0 1px 3px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.6), inset 0 0 0 1px rgba(255,255,255,0.4)',
          backdropFilter: 'blur(12px) saturate(180%)',
          WebkitBackdropFilter: 'blur(12px) saturate(180%)',
        }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPressed(false) }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{ ...base, ...variantStyles }}
    >
      {children}
    </button>
  )
}

function SatinCapsule({
  children, dotColor, mono,
}: {
  children: React.ReactNode
  dotColor?: string
  mono?: boolean
}) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '6px 12px',
      fontSize: 12,
      fontWeight: 500,
      color: 'rgba(0, 0, 0, 0.72)',
      fontFamily: mono ? 'ui-monospace, SFMono-Regular, monospace' : undefined,
      background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.85) 0%, rgba(255, 255, 255, 0.55) 100%)',
      borderRadius: 999,
      backdropFilter: 'blur(14px) saturate(180%)',
      WebkitBackdropFilter: 'blur(14px) saturate(180%)',
      border: '1px solid rgba(255, 255, 255, 0.5)',
      boxShadow: [
        '0 2px 6px -2px rgba(0, 0, 0, 0.08)',
        'inset 0 1px 0 rgba(255, 255, 255, 0.9)',
        'inset 0 -1px 0 rgba(0, 0, 0, 0.03)',
      ].join(', '),
      letterSpacing: '-0.005em',
    }}>
      {dotColor && (
        <span style={{
          width: 7, height: 7, borderRadius: '50%',
          background: dotColor.toLowerCase(),
          boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.08), inset 0 1px 1px rgba(255, 255, 255, 0.4)',
          flexShrink: 0,
        }} />
      )}
      {children}
    </span>
  )
}

function GlassMetric({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: 'positive' | 'negative' }) {
  const valueColor = accent === 'positive' ? '#06a55a' : accent === 'negative' ? '#dc2626' : '#0a0a0a'
  return (
    <div style={{
      padding: '14px 16px',
      background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.7) 0%, rgba(255, 255, 255, 0.4) 100%)',
      backdropFilter: 'blur(20px) saturate(180%)',
      WebkitBackdropFilter: 'blur(20px) saturate(180%)',
      borderRadius: 16,
      border: '1px solid rgba(255, 255, 255, 0.5)',
      boxShadow: [
        '0 4px 16px -4px rgba(31, 38, 135, 0.08)',
        'inset 0 1px 0 rgba(255, 255, 255, 0.85)',
        'inset 0 0 0 0.5px rgba(255, 255, 255, 0.4)',
      ].join(', '),
    }}>
      <p style={{
        fontSize: 10, fontWeight: 700, color: 'rgba(0, 0, 0, 0.45)',
        textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6,
      }}>{label}</p>
      <p style={{
        fontSize: 20, fontWeight: 700, color: valueColor,
        letterSpacing: '-0.02em', lineHeight: 1.1,
      }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: 'rgba(0, 0, 0, 0.45)', marginTop: 4, fontWeight: 500 }}>{sub}</p>}
    </div>
  )
}

// Price Info — full-width section card with 3 prominent metrics:
// Asking Price · Est. Profit · Water  (Water = cost minus asking when underwater)
// ─── Glass section primitives ───────────────────────────────────────

function GlassCard({ children, padding = 22 }: { children: React.ReactNode; padding?: number }) {
  return (
    <div style={{
      background: 'rgba(255, 255, 255, 0.55)',
      backdropFilter: 'blur(20px) saturate(180%)',
      WebkitBackdropFilter: 'blur(20px) saturate(180%)',
      borderRadius: 20,
      border: '1px solid rgba(255, 255, 255, 0.5)',
      padding,
      boxShadow: [
        '0 8px 28px -10px rgba(31, 38, 135, 0.12)',
        '0 1px 3px rgba(0, 0, 0, 0.03)',
        'inset 0 1px 0 rgba(255, 255, 255, 0.75)',
        'inset 0 0 0 0.5px rgba(255, 255, 255, 0.35)',
      ].join(', '),
    }}>
      {children}
    </div>
  )
}

function GlassEyebrow({ label, subtitle, action }: { label: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
      <div>
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.45)', marginBottom: subtitle ? 4 : 0 }}>{label}</p>
        {subtitle && <p style={{ fontSize: 12, color: 'rgba(0,0,0,0.5)', fontWeight: 500 }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

// Cost Tracking — merged Price Info + Cost Adds + True Cost
// ─── Price & Cost card — compact 2-col grid, inline underline fields, perf ribbon ─

function PriceAndCostCard({
  vehicle, costAdds, isAdmin, currentUserId, busy,
  onSavePartial, onAddCost, onDeleteCostAdd,
}: {
  vehicle: Vehicle
  costAdds: CostAdd[]
  isAdmin: boolean
  currentUserId: string | null
  busy: boolean
  onSavePartial: (patch: Record<string, unknown>) => Promise<void>
  onAddCost: () => void
  onDeleteCostAdd: (id: string) => void
}) {
  const [tab, setTab] = useState<'retail' | 'wholesale'>('retail')

  // Local-only fields (no schema yet — preserved across this session)
  const [specialPrice, setSpecialPrice] = useState(0)
  const [minDown, setMinDown] = useState(0)
  const [minDeposit, setMinDeposit] = useState(0)
  const [packs, setPacks] = useState(0)

  // Persisted fields (committed via onSavePartial)
  const askingPrice = vehicle.askingPrice ?? 0
  const vehicleCost = vehicle.vehicleCost ?? 0
  const purchaseDateStr = vehicle.dateInStock
    ? new Date(vehicle.dateInStock).toISOString().slice(0, 10)
    : ''

  const costAddsTotal = costAdds.reduce((s, c) => s + c.amountCents, 0) / 100
  const costTotal = vehicleCost + costAddsTotal + packs
  const vehiclePrice = askingPrice - specialPrice
  const potentialProfit = Math.max(0, vehiclePrice - costTotal)
  const water = Math.max(0, costTotal - vehiclePrice)

  return (
    <GlassCard padding={22}>
      {/* Header: eyebrow + active-calc subtitle + Retail/Wholesale toggle */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 18, gap: 14, flexWrap: 'wrap',
      }}>
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.45)', marginBottom: 3 }}>Price &amp; Cost</p>
          <p style={{ fontSize: 12, color: 'rgba(0,0,0,0.5)', fontWeight: 500 }}>
            True cost {money(costTotal)} · {costAdds.length} cost add{costAdds.length === 1 ? '' : 's'}
          </p>
        </div>
        <SegmentedToggle
          options={[
            { id: 'retail',    label: 'Retail' },
            { id: 'wholesale', label: 'Wholesale', disabled: true },
          ]}
          active={tab}
          onChange={(id) => setTab(id as 'retail' | 'wholesale')}
        />
      </div>

      {/* ─── Stacked body: Price Info above Cost Info — each in its own glass sub-panel ─── */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}>
        {/* Price Info sub-panel */}
        <SubPanel>
          <SectionLabel>Price Info</SectionLabel>
          <FieldGrid>
            <InlineField
              label="Asking Price"
              value={askingPrice}
              onCommit={(v) => onSavePartial({ askingPrice: v })}
            />
            <InlineField
              label="Special Price"
              value={specialPrice}
              onChange={setSpecialPrice}
              locked
            />
            <InlineField
              label="Min. Down"
              value={minDown}
              onChange={setMinDown}
              locked
            />
            <InlineField
              label="Min. Deposit"
              value={minDeposit}
              onChange={setMinDeposit}
              locked
            />
          </FieldGrid>
        </SubPanel>

        {/* Cost Info sub-panel */}
        <SubPanel>
          <SectionLabel>Cost Info</SectionLabel>
          <FieldGrid>
            <InlineField
              label="Purchase Date"
              type="date"
              stringValue={purchaseDateStr}
              onCommitString={(v) => onSavePartial({ dateInStock: v || null })}
            />
            <InlineField
              label="Vehicle Cost"
              value={vehicleCost}
              onCommit={(v) => onSavePartial({ vehicleCost: v })}
            />
            <InlineField
              label="Cost Adds"
              value={costAddsTotal}
              readonly
              accent
              trailing={
                <button
                  onClick={(e) => { e.stopPropagation(); onAddCost() }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#0071e3', fontSize: 11, fontWeight: 600,
                    padding: 0, minHeight: 'auto',
                    letterSpacing: '-0.005em',
                  }}
                >+ Add</button>
              }
            />
            <InlineField label="Packs"      value={packs}      onChange={setPacks}      accent />
          </FieldGrid>

          {/* Total — sits inside the Cost Info sub-panel; whitespace separates, no rules */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            paddingTop: 18, marginTop: 4,
          }}>
            <span style={{
              fontSize: 11, fontWeight: 700, letterSpacing: '0.12em',
              textTransform: 'uppercase', color: 'rgba(0,0,0,0.55)',
            }}>Total</span>
            <span style={{
              fontSize: 17, fontWeight: 800, letterSpacing: '-0.015em',
              color: '#0a0a0a', fontVariantNumeric: 'tabular-nums',
            }}>{money(costTotal)}</span>
          </div>
        </SubPanel>
      </div>

      {/* Itemized cost adds (only when present) — compact tinted strip */}
      {costAdds.length > 0 && (
        <div style={{
          marginTop: 16, padding: '10px 12px',
          background: 'rgba(0, 113, 227, 0.04)',
          borderRadius: 10,
          border: '1px solid rgba(0, 113, 227, 0.1)',
        }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.5)', marginBottom: 6 }}>
            Cost adds breakdown
          </p>
          {costAdds.map((c, i) => {
            const canDelete = isAdmin || c.addedBy?.id === currentUserId
            return (
              <div key={c.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 0', gap: 10,
                borderBottom: i < costAdds.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                    <span style={{
                      fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
                      padding: '2px 6px', background: 'rgba(0,0,0,0.06)',
                      color: 'rgba(0,0,0,0.62)', borderRadius: 4,
                    }}>{COST_KIND_LABELS[c.kind] || c.kind}</span>
                    {c.description && <span style={{ fontSize: 12, fontWeight: 600, color: '#1d1d1f' }}>{c.description}</span>}
                  </div>
                  <p style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)', marginTop: 2 }}>
                    {fmtDate(c.addedAt)}
                    {c.vendor && ` · ${c.vendor}`}
                    {c.addedBy && ` · ${c.addedBy.name}`}
                  </p>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#1d1d1f', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                  {money(c.amountCents / 100)}
                </span>
                {canDelete && (
                  <button
                    onClick={() => onDeleteCostAdd(c.id)}
                    disabled={busy}
                    title="Delete"
                    style={{ background: 'none', border: 'none', fontSize: 14, cursor: 'pointer', color: 'rgba(0,0,0,0.35)', padding: '2px 6px', minHeight: 'auto' }}
                  >×</button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ─── Performance Ribbon — tightly integrated footer with soft translucent dividers ─── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1px 1fr 1px 1fr',
        alignItems: 'center',
        marginTop: 16, paddingTop: 14,
      }}>
        <RibbonStat label="Vehicle Price"    value={money(vehiclePrice)}    color="#0a0a0a" />
        <SoftDivider />
        <RibbonStat label="Potential Profit" value={money(potentialProfit)} color="#06a55a" />
        <SoftDivider />
        <RibbonStat label="Water"            value={money(water)}           color={water > 0 ? '#dc2626' : 'rgba(0,0,0,0.3)'} />
      </div>
    </GlassCard>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h4 style={{
      fontSize: 14, fontWeight: 700, letterSpacing: '-0.012em',
      color: '#0a0a0a',
      lineHeight: 1,
      marginBottom: 16,
    }}>{children}</h4>
  )
}

// Subtly tinted glass sub-panel — softer than the parent card so sections cluster
// visually without needing horizontal rules.
function SubPanel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: '16px 18px',
      background: 'rgba(255, 255, 255, 0.45)',
      backdropFilter: 'blur(20px) saturate(180%)',
      WebkitBackdropFilter: 'blur(20px) saturate(180%)',
      borderRadius: 12,
      border: '1px solid rgba(255, 255, 255, 0.55)',
      boxShadow: [
        '0 2px 8px -4px rgba(31, 38, 135, 0.06)',
        'inset 0 1px 0 rgba(255, 255, 255, 0.7)',
        'inset 0 0 0 0.5px rgba(255, 255, 255, 0.4)',
      ].join(', '),
    }}>
      {children}
    </div>
  )
}

// 2-col field grid with generous vertical breathing room — no dividers, just whitespace.
function FieldGrid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      columnGap: 28,
      rowGap: 16,
    }}>
      {children}
    </div>
  )
}

function SegmentedToggle({
  options, active, onChange,
}: {
  options: { id: string; label: string; disabled?: boolean }[]
  active: string
  onChange: (id: string) => void
}) {
  const activeIdx = Math.max(0, options.findIndex(o => o.id === active))
  return (
    <div style={{
      position: 'relative', display: 'flex', padding: 3,
      background: 'rgba(0,0,0,0.05)',
      borderRadius: 999,
      border: '1px solid rgba(0,0,0,0.06)',
    }}>
      <div aria-hidden style={{
        position: 'absolute',
        top: 3, bottom: 3, left: 3,
        width: `calc((100% - 6px) / ${options.length})`,
        transform: `translateX(${activeIdx * 100}%)`,
        background: '#ffffff',
        borderRadius: 999,
        boxShadow: '0 2px 6px -2px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.9)',
        transition: 'transform 320ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        pointerEvents: 'none',
        zIndex: 0,
      }} />
      {options.map(o => (
        <button
          key={o.id}
          onClick={() => !o.disabled && onChange(o.id)}
          disabled={o.disabled}
          style={{
            position: 'relative', zIndex: 1,
            padding: '5px 14px',
            background: 'transparent', border: 'none',
            fontSize: 12, fontWeight: 600, letterSpacing: '-0.005em',
            color: o.id === active ? '#1d1d1f' : 'rgba(0,0,0,0.5)',
            cursor: o.disabled ? 'not-allowed' : 'pointer',
            opacity: o.disabled ? 0.4 : 1,
            minHeight: 'auto',
            transition: 'color 200ms ease',
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// Borderless inline field: label LEFT (muted gray) + value RIGHT (bold, integrated text).
// No frame, no underline. The VALUE alone shows a soft translucent capsule on hover
// to telegraph "click me to edit inline".
function InlineField({
  label, value, stringValue, onChange, onCommit, onCommitString,
  type = 'money', locked, readonly, accent, placeholderEmpty, trailing,
}: {
  label: string
  value?: number
  stringValue?: string
  onChange?: (v: number) => void
  onCommit?: (v: number) => void | Promise<void>
  onCommitString?: (v: string) => void | Promise<void>
  type?: 'money' | 'date'
  locked?: boolean
  readonly?: boolean
  accent?: boolean
  placeholderEmpty?: boolean
  trailing?: React.ReactNode
}) {
  const isReadonly = !!(locked || readonly)
  const isEditable = !isReadonly || !!onChange
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [hover, setHover] = useState(false)

  function startEdit() {
    if (!isEditable) return
    if (type === 'date') setDraft(stringValue ?? '')
    else setDraft(value && value > 0 ? String(value) : '')
    setEditing(true)
  }

  async function commit() {
    setEditing(false)
    if (type === 'date') {
      if (onCommitString) {
        setSaving(true)
        try { await onCommitString(draft) } finally { setSaving(false) }
      }
      return
    }
    const n = draft === '' ? 0 : parseFloat(draft)
    if (!Number.isFinite(n)) return
    if (onCommit) {
      setSaving(true)
      try { await onCommit(n) } finally { setSaving(false) }
    } else if (onChange) {
      onChange(n)
    }
  }

  const display = type === 'date'
    ? (stringValue
        ? new Date(stringValue + 'T00:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' })
        : '—')
    : (placeholderEmpty
        ? '—'
        : `$${(value ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`)

  const valueColor = accent ? '#0071e3'
    : (placeholderEmpty && !value ? 'rgba(0,0,0,0.3)' : '#0a0a0a')

  const lineColor = rowLineColor(editing, hover, isEditable)

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        gap: 10,
        opacity: saving ? 0.55 : 1,
        paddingBottom: 7,
        borderBottom: `1px solid ${lineColor}`,
        transition: 'border-color 180ms ease',
      }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        fontSize: 11, fontWeight: 500,
        color: 'rgba(0,0,0,0.5)',
        letterSpacing: '-0.005em',
        whiteSpace: 'nowrap',
        overflow: 'hidden', textOverflow: 'ellipsis',
        minWidth: 0,
      }}>
        {label}
        {locked && <span aria-hidden style={{ fontSize: 11, color: 'rgba(0,0,0,0.28)', lineHeight: 1 }}>⋮</span>}
      </span>

      <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8, flexShrink: 0 }}>
        {trailing}
        {editing ? (
          <input
            type={type === 'date' ? 'date' : 'text'}
            inputMode={type === 'date' ? undefined : 'decimal'}
            value={draft}
            autoFocus
            size={type === 'date' ? undefined : Math.max(3, draft.length || 1)}
            onChange={(e) => {
              if (type === 'date') setDraft(e.target.value)
              else setDraft(e.target.value.replace(/[^0-9.]/g, ''))
            }}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') setEditing(false)
            }}
            style={{
              border: 'none', outline: 'none',
              background: 'transparent',
              padding: '1px 0',
              margin: 0,
              fontSize: 14, fontWeight: 700, letterSpacing: '-0.005em',
              color: valueColor,
              textAlign: 'right',
              fontVariantNumeric: 'tabular-nums',
              width: 'auto',
              boxSizing: 'content-box',
            }}
          />
        ) : (
          <button
            onClick={startEdit}
            disabled={!isEditable}
            style={{
              background: 'transparent',
              border: 'none',
              padding: '1px 0',
              margin: 0,
              fontSize: 14, fontWeight: 700, letterSpacing: '-0.005em',
              color: valueColor,
              fontVariantNumeric: 'tabular-nums',
              cursor: isEditable ? 'pointer' : 'default',
              minHeight: 'auto',
            }}
          >
            {display}
          </button>
        )}
      </div>
    </div>
  )
}

// Compact horizontal performance ribbon stat — used 3-up at the card base.
function RibbonStat({ label, value, color }: {
  label: string
  value: string
  color: string
}) {
  return (
    <div style={{
      padding: '4px 18px',
      display: 'flex', flexDirection: 'column', gap: 3,
    }}>
      <p style={{
        fontSize: 9, fontWeight: 700, letterSpacing: '0.14em',
        textTransform: 'uppercase', color: 'rgba(0,0,0,0.45)',
      }}>{label}</p>
      <p style={{
        fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em',
        color, fontVariantNumeric: 'tabular-nums',
        lineHeight: 1.1,
      }}>{value}</p>
    </div>
  )
}

// Soft translucent vertical divider — fades at top and bottom for the polished look.
function SoftDivider() {
  return (
    <div aria-hidden style={{
      width: 1, height: 32,
      background: 'linear-gradient(to bottom, transparent, rgba(0,0,0,0.12) 25%, rgba(0,0,0,0.12) 75%, transparent)',
      justifySelf: 'center',
    }} />
  )
}

// Logistics Hub — merged Title & Location + Source + Floorplan
function LogisticsHubCard({
  vehicle, flooring, canSeeMoney, isAdmin, onEditFlooring,
}: {
  vehicle: Vehicle
  flooring: ReturnType<typeof computeFlooring>
  canSeeMoney: boolean
  isAdmin: boolean
  onEditFlooring: () => void
}) {
  const rows: { label: string; value: string }[] = [
    { label: 'Title', value: vehicle.titleStatus || '—' },
    { label: 'Location', value: vehicle.location || '—' },
    { label: 'Inventory', value: vehicle.inventoryStatus || '—' },
    { label: 'Purchase Type', value: vehicle.purchaseType || '—' },
  ]
  if (vehicle.purchasedFrom) rows.push({ label: 'Source', value: vehicle.purchasedFrom })
  if (vehicle.dateInStock) rows.push({ label: 'Date In', value: fmtDate(vehicle.dateInStock) })
  if (vehicle.consignmentCommissionPct !== null) rows.push({ label: 'Consign %', value: `${vehicle.consignmentCommissionPct}%` })

  return (
    <GlassCard>
      <GlassEyebrow label="Logistics" subtitle="Title · Location · Floorplan" />

      <div style={{ borderRadius: 12, overflow: 'hidden' }}>
        {rows.map((r, i) => (
          <div key={r.label} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            padding: '10px 12px',
            background: i % 2 === 0 ? 'rgba(0,0,0,0.025)' : 'transparent',
            gap: 12,
          }}>
            <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.55)', fontWeight: 500 }}>{r.label}</span>
            <span style={{ fontSize: 13, color: '#1d1d1f', fontWeight: 600, textAlign: 'right' }}>{r.value}</span>
          </div>
        ))}
      </div>

      {canSeeMoney && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(0,0,0,0.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(0,0,0,0.5)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Floorplan</span>
            {isAdmin && (
              <button onClick={onEditFlooring} style={{ background: 'none', border: 'none', color: '#0071e3', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0, minHeight: 'auto' }}>
                {flooring ? 'Edit' : '+ Set'}
              </button>
            )}
          </div>
          {flooring ? (
            <div style={{ borderRadius: 12, overflow: 'hidden' }}>
              {[
                { label: 'Lender', value: flooring.lender },
                { label: 'Principal', value: money(flooring.principal) },
                { label: 'Rate', value: `${flooring.dailyRate}% / day` },
                { label: 'Cost / Day', value: money(flooring.costPerDay), accent: '#dc2626' },
                { label: 'Accrued', value: `${money(flooring.accruedInterest)} · ${flooring.daysHeld}d` },
                { label: 'Payoff', value: money(flooring.payoff), accent: '#dc2626' },
              ].map((r, i) => (
                <div key={r.label} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                  padding: '10px 12px',
                  background: i % 2 === 0 ? 'rgba(0,0,0,0.025)' : 'transparent',
                  gap: 12,
                }}>
                  <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.55)', fontWeight: 500 }}>{r.label}</span>
                  <span style={{ fontSize: 13, color: r.accent || '#1d1d1f', fontWeight: 600, textAlign: 'right' }}>{r.value}</span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 12, color: 'rgba(0,0,0,0.5)', fontStyle: 'italic' }}>
              {vehicle.purchaseType === 'CONSIGNMENT' ? 'Consignment — not floored.' : 'Not on a floorplan.'}
            </p>
          )}
        </div>
      )}
    </GlassCard>
  )
}

// Premium CARFAX button card — glow on hover
function CarfaxCard({ vin }: { vin: string }) {
  const [hovered, setHovered] = useState(false)
  return (
    <a
      href={`https://www.carfax.com/VehicleHistory/p/Report.cfx?partner=DVW_1&vin=${encodeURIComponent(vin)}`}
      target="_blank"
      rel="noreferrer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        textDecoration: 'none', gap: 16,
        padding: '18px 22px',
        background: 'rgba(255, 255, 255, 0.55)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderRadius: 20,
        border: '1px solid rgba(255, 255, 255, 0.5)',
        boxShadow: hovered
          ? [
              '0 14px 40px -10px rgba(31, 38, 135, 0.22)',
              '0 0 0 1px rgba(220, 38, 38, 0.22)',
              '0 0 36px -6px rgba(220, 38, 38, 0.28)',
              'inset 0 1px 0 rgba(255, 255, 255, 0.85)',
            ].join(', ')
          : [
              '0 8px 28px -10px rgba(31, 38, 135, 0.12)',
              '0 1px 3px rgba(0, 0, 0, 0.03)',
              'inset 0 1px 0 rgba(255, 255, 255, 0.75)',
              'inset 0 0 0 0.5px rgba(255, 255, 255, 0.35)',
            ].join(', '),
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'transform 220ms cubic-bezier(0.25, 0.46, 0.45, 0.94), box-shadow 220ms ease',
        cursor: 'pointer',
        color: '#1d1d1f',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#dc2626', marginBottom: 4 }}>CARFAX</p>
        <p style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', color: '#1d1d1f' }}>View Vehicle History</p>
        <p style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)', marginTop: 3, fontFamily: 'ui-monospace, SFMono-Regular, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{vin}</p>
      </div>
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        background: hovered ? 'linear-gradient(135deg, #dc2626, #991b1b)' : 'rgba(220, 38, 38, 0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: hovered ? '#fff' : '#dc2626',
        fontSize: 15, fontWeight: 700,
        flexShrink: 0,
        boxShadow: hovered ? '0 4px 12px -2px rgba(220, 38, 38, 0.4)' : 'none',
        transition: 'all 220ms ease',
      }}>→</div>
    </a>
  )
}

function PrintHubCard() {
  return (
    <GlassCard>
      <GlassEyebrow label="Print Hub" subtitle="Generate dealer documents" />
      <PrintRow label="Window Sticker" subtitle="Compliance + pricing layout" />
      <PrintRow label="Buyer's Guide" subtitle="FTC As-Is / Warranty" />
    </GlassCard>
  )
}

function PrintRow({ label, subtitle }: { label: string; subtitle: string }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={() => alert(`${label} — coming soon`)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: '100%', textAlign: 'left',
        padding: '12px 14px', marginBottom: 8,
        background: hovered ? 'rgba(0, 113, 227, 0.06)' : 'rgba(0,0,0,0.025)',
        border: hovered ? '1px solid rgba(0, 113, 227, 0.25)' : '1px solid rgba(0,0,0,0.05)',
        borderRadius: 12, cursor: 'pointer',
        minHeight: 'auto',
        transition: 'background 180ms ease, border-color 180ms ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{
          width: 28, height: 28, borderRadius: 8,
          background: 'rgba(255,255,255,0.7)',
          border: '1px solid rgba(0,0,0,0.06)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13,
        }} aria-hidden>⎙</span>
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#1d1d1f' }}>{label}</p>
          <p style={{ fontSize: 11, color: 'rgba(0,0,0,0.5)', marginTop: 2 }}>{subtitle}</p>
        </div>
      </div>
      <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.4)', flexShrink: 0 }}>↗</span>
    </button>
  )
}

function V2StatusPill({ value }: { value: string }) {
  const colors: Record<string, { bg: string; color: string }> = {
    in_stock: { bg: '#dffd6e', color: '#1a1a1a' },
    in_recon: { bg: '#fef3c7', color: '#92400e' },
    external_repair: { bg: '#fee2e2', color: '#991b1b' },
    sold: { bg: '#f0f0ec', color: '#525252' },
    inventory_only: { bg: '#fef3c7', color: '#92400e' },
    mechanic: { bg: '#fef3c7', color: '#92400e' },
    completed: { bg: '#f0f0ec', color: '#525252' },
  }
  const c = colors[value] || { bg: '#f0f0ec', color: 'var(--text-muted)' }
  return (
    <span style={{
      fontSize: 12, padding: '6px 14px',
      background: c.bg, color: c.color,
      borderRadius: 999, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
    }}>{value.replace(/_/g, ' ')}</span>
  )
}

function v2Btn(variant: 'primary' | 'ghost'): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: '8px 14px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    minHeight: 'auto',
  }
  if (variant === 'primary') return { ...base, background: '#1a1a1a', color: '#dffd6e', border: 'none' }
  return { ...base, background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)' }
}

// ─── Media & Marketing Studio ───────────────────────────────────────

type StudioCategory = {
  id: string
  label: string
  types: string[]
  accept: string
  defaultType: string
  variant: 'photo' | 'video' | 'doc'
}

const STUDIO_CATEGORIES: StudioCategory[] = [
  { id: 'exterior',      label: 'Exterior',      types: ['exterior'],                            accept: 'image/*', defaultType: 'exterior',         variant: 'photo' },
  { id: 'interior',      label: 'Interior',      types: ['interior'],                            accept: 'image/*', defaultType: 'interior',         variant: 'photo' },
  { id: 'undercarriage', label: 'Undercarriage', types: ['undercarriage'],                       accept: 'image/*', defaultType: 'undercarriage',    variant: 'photo' },
  { id: 'videos',        label: 'Videos',        types: ['walkaround_video', 'turntable_video'], accept: 'video/*', defaultType: 'walkaround_video', variant: 'video' },
]

function MediaStudio({
  vehicleId, media, onChange, currentUserId, isAdmin,
}: {
  vehicleId: string
  media: MediaAsset[]
  onChange: () => void | Promise<void>
  currentUserId: string | null
  isAdmin: boolean
}) {
  const [uploadingType, setUploadingType] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [err, setErr] = useState<string | null>(null)
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)

  const viewable = media.filter(m => m.type !== 'doc')

  async function uploadFile(file: File, type: string) {
    setErr(null)
    setUploadingType(type)
    setProgress(0)
    try {
      const presignRes = await fetch('/api/media/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicleId, filename: file.name, contentType: file.type }),
      })
      if (!presignRes.ok) throw new Error(`Presign failed (${presignRes.status})`)
      const { uploadUrl, r2Key } = await presignRes.json()

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100))
        })
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve()
          else reject(new Error(`R2 upload failed (${xhr.status})`))
        })
        xhr.addEventListener('error', () => reject(new Error('R2 network error')))
        xhr.open('PUT', uploadUrl)
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
        xhr.send(file)
      })

      const confirmRes = await fetch('/api/media/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleId, r2Key, type,
          contentType: file.type, sizeBytes: file.size, filename: file.name,
        }),
      })
      if (!confirmRes.ok) throw new Error(`Confirm failed (${confirmRes.status})`)

      await onChange()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setUploadingType(null)
      setProgress(0)
    }
  }

  async function handleFiles(files: FileList | null, type: string) {
    if (!files || files.length === 0) return
    for (const f of Array.from(files)) {
      await uploadFile(f, type)
    }
  }

  async function deleteAsset(id: string) {
    if (!confirm('Delete this media?')) return
    await fetch(`/api/media/${id}`, { method: 'DELETE' })
    await onChange()
  }

  return (
    <GlassCard padding={24}>
      <GlassEyebrow
        label="Visual Asset Studio"
        subtitle={media.length === 0
          ? 'Drop or click any tile to upload photos, videos, documents'
          : `${media.length} asset${media.length === 1 ? '' : 's'} across ${STUDIO_CATEGORIES.length} categories`}
      />

      {err && (
        <p style={{
          color: '#d70015', fontSize: 13, marginBottom: 14,
          padding: '8px 12px', background: 'rgba(255, 59, 48, 0.08)', borderRadius: 10,
          border: '1px solid rgba(255, 59, 48, 0.18)',
        }}>{err}</p>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: 16,
      }}>
        {STUDIO_CATEGORIES.map((cat) => {
          const items = media.filter(m => cat.types.includes(m.type))
          const isUploading = uploadingType === cat.defaultType
          return (
            <AssetTile
              key={cat.id}
              category={cat}
              items={items}
              isUploading={isUploading}
              uploadProgress={progress}
              onFiles={(files) => handleFiles(files, cat.defaultType)}
              onDelete={deleteAsset}
              onOpen={(asset) => {
                const idx = viewable.findIndex(v => v.id === asset.id)
                if (idx >= 0) setLightboxIdx(idx)
              }}
              currentUserId={currentUserId}
              isAdmin={isAdmin}
            />
          )
        })}
      </div>

      {lightboxIdx !== null && viewable[lightboxIdx] && (
        <MediaLightbox
          items={viewable}
          startIdx={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
          onChangeIdx={setLightboxIdx}
        />
      )}
    </GlassCard>
  )
}

function AssetTile({
  category, items, isUploading, uploadProgress, onFiles, onDelete, onOpen, currentUserId, isAdmin,
}: {
  category: StudioCategory
  items: MediaAsset[]
  isUploading: boolean
  uploadProgress: number
  onFiles: (files: FileList | null) => void
  onDelete: (id: string) => void
  onOpen: (asset: MediaAsset) => void
  currentUserId: string | null
  isAdmin: boolean
}) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [hovered, setHovered] = useState(false)
  const isEmpty = items.length === 0
  const hero = items[0]
  const isDoc = category.variant === 'doc'
  const canDeleteHero = !!hero && (isAdmin || hero.uploadedBy?.id === currentUserId)

  function onDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!isDragOver) setIsDragOver(true)
  }
  function onDragLeave(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFiles(e.dataTransfer.files)
    }
  }

  const overlay = hero
    ? 'linear-gradient(180deg, rgba(0,0,0,0) 50%, rgba(0,0,0,0.5) 100%)'
    : 'transparent'

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={!isEmpty && !isDoc ? () => onOpen(hero!) : undefined}
      style={{
        position: 'relative',
        aspectRatio: '1 / 1',
        borderRadius: 12,
        overflow: 'hidden',
        background: hero && category.variant !== 'doc' ? '#1d1d1f' : 'rgba(255, 255, 255, 0.5)',
        backdropFilter: hero && category.variant !== 'doc' ? undefined : 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: hero && category.variant !== 'doc' ? undefined : 'blur(20px) saturate(180%)',
        border: '1px solid rgba(255, 255, 255, 0.55)',
        boxShadow: hovered
          ? [
              '0 12px 32px -10px rgba(31, 38, 135, 0.22)',
              'inset 0 1px 0 rgba(255, 255, 255, 0.75)',
              'inset 0 0 0 0.5px rgba(255, 255, 255, 0.35)',
            ].join(', ')
          : [
              '0 4px 14px -6px rgba(31, 38, 135, 0.1)',
              'inset 0 1px 0 rgba(255, 255, 255, 0.7)',
              'inset 0 0 0 0.5px rgba(255, 255, 255, 0.3)',
            ].join(', '),
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'transform 240ms cubic-bezier(0.25, 0.46, 0.45, 0.94), box-shadow 240ms ease',
        cursor: isEmpty || isDoc ? 'default' : 'pointer',
      }}
    >
      {/* Hero media — fills edge-to-edge */}
      {hero && category.variant === 'photo' && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={hero.url}
          alt={hero.caption || category.label}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      )}
      {hero && category.variant === 'video' && (
        <video
          src={hero.url}
          muted
          playsInline
          preload="metadata"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block', background: '#000' }}
        />
      )}
      {hero && category.variant === 'doc' && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 8, padding: 20, textAlign: 'center',
          background: 'linear-gradient(145deg, rgba(255,255,255,0.85), rgba(255,255,255,0.5))',
        }}>
          <CategoryIcon variant={category.variant} size={42} muted />
          <span style={{
            fontSize: 12, fontWeight: 600, color: '#1d1d1f',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%',
          }}>{hero.filename || 'Document'}</span>
        </div>
      )}

      {/* Empty-state icon */}
      {isEmpty && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CategoryIcon variant={category.variant} size={44} muted />
        </div>
      )}

      {/* Bottom gradient overlay (only when hero present, for label legibility) */}
      <div style={{ position: 'absolute', inset: 0, background: overlay, pointerEvents: 'none' }} />

      {/* Top-left category label */}
      <div style={{ position: 'absolute', top: 12, left: 12, pointerEvents: 'none', zIndex: 2 }}>
        <p style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
          color: hero && category.variant !== 'doc' ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.55)',
          textShadow: hero && category.variant !== 'doc' ? '0 1px 2px rgba(0,0,0,0.4)' : 'none',
        }}>{category.label}</p>
      </div>

      {/* Multi-asset count badge */}
      {items.length > 1 && (
        <div style={{
          position: 'absolute', top: 10, right: 10,
          zIndex: 2,
          padding: '4px 10px', borderRadius: 999,
          background: 'rgba(0, 0, 0, 0.55)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          color: '#fff',
          fontSize: 11, fontWeight: 700, letterSpacing: '-0.005em',
          boxShadow: '0 2px 8px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.15)',
        }}>+{items.length - 1}</div>
      )}

      {/* Document hero — clickable to open in new tab */}
      {hero && isDoc && (
        <a
          href={hero.url}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          aria-label={`Open ${hero.filename || 'document'}`}
          style={{ position: 'absolute', inset: 0, zIndex: 3, display: 'block' }}
        />
      )}

      {/* Hover delete on hero */}
      {canDeleteHero && hovered && (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(hero!.id) }}
          title="Delete"
          style={{
            position: 'absolute', top: 10,
            right: items.length > 1 ? 60 : 10,
            zIndex: 4,
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(8px)',
            border: 'none', color: '#fff',
            fontSize: 13, lineHeight: 1,
            width: 26, height: 26, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', minHeight: 'auto',
          }}
        >×</button>
      )}

      {/* "+ Add" pill — bottom-right */}
      <label
        onClick={(e) => e.stopPropagation()}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.04)' }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
        style={{
          position: 'absolute', bottom: 10, right: 10,
          zIndex: 3,
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '6px 12px',
          background: 'rgba(255, 255, 255, 0.88)',
          backdropFilter: 'blur(14px) saturate(180%)',
          WebkitBackdropFilter: 'blur(14px) saturate(180%)',
          border: '1px solid rgba(255, 255, 255, 0.6)',
          color: '#1d1d1f',
          fontSize: 11, fontWeight: 600, letterSpacing: '-0.005em',
          borderRadius: 999,
          cursor: isUploading ? 'wait' : 'pointer',
          minHeight: 'auto',
          boxShadow: '0 4px 12px -2px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.9)',
          transition: 'transform 160ms ease',
        }}
      >
        {isUploading ? `${uploadProgress}%` : isEmpty ? '+ Add' : '+ More'}
        <input
          type="file"
          multiple
          accept={category.accept}
          disabled={isUploading}
          onChange={(e) => { onFiles(e.target.files); e.currentTarget.value = '' }}
          style={{ display: 'none' }}
        />
      </label>

      {/* Drag-over hint */}
      {isDragOver && (
        <div style={{
          position: 'absolute', inset: 0,
          zIndex: 5,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0, 113, 227, 0.12)',
          border: '2px dashed rgba(0, 113, 227, 0.65)',
          borderRadius: 12,
          pointerEvents: 'none',
        }}>
          <span style={{
            fontSize: 12, fontWeight: 700, color: '#0071e3',
            textTransform: 'uppercase', letterSpacing: '0.12em',
            background: 'rgba(255,255,255,0.92)', padding: '6px 14px', borderRadius: 999,
            boxShadow: '0 4px 12px rgba(0, 113, 227, 0.22)',
          }}>Drop to upload</span>
        </div>
      )}
    </div>
  )
}

function CategoryIcon({ variant, size = 44, muted = false }: { variant: 'photo' | 'video' | 'doc'; size?: number; muted?: boolean }) {
  const stroke = muted ? 'rgba(0,0,0,0.32)' : '#1d1d1f'
  const sw = 1.4

  if (variant === 'video') {
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <rect x="6" y="10" width="36" height="28" rx="4" stroke={stroke} strokeWidth={sw} />
        <path d="M21 19l8 5-8 5v-10z" fill={stroke} />
      </svg>
    )
  }
  if (variant === 'doc') {
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <path d="M12 6h18l8 8v28a2 2 0 0 1-2 2H12a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
        <path d="M30 6v8h8" stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
        <path d="M16 24h14M16 30h14M16 36h8" stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <rect x="6" y="10" width="36" height="28" rx="4" stroke={stroke} strokeWidth={sw} />
      <circle cx="17" cy="20" r="3" stroke={stroke} strokeWidth={sw} />
      <path d="M6 32l10-10 10 10 6-6 10 10" stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
    </svg>
  )
}

// ─── Channel Distribution (marketplace syndication) ─────────────────

type SyndicationChannel = {
  id: string
  name: string
  initials: string
  subtitle: string
}

const SYNDICATION_CHANNELS: SyndicationChannel[] = [
  { id: 'ebay',        name: 'eBay Motors',      initials: 'eB', subtitle: 'Auction + Buy It Now' },
  { id: 'hemmings',    name: 'Hemmings',         initials: 'Hm', subtitle: 'Classic + collector' },
  { id: 'carsforsale', name: 'CarsForSale',      initials: 'CF', subtitle: 'National retail' },
  { id: 'craigslist',  name: 'Craigslist',       initials: 'CL', subtitle: 'Local listings' },
  { id: 'mikalyzed',   name: 'Mikalyzed Retail', initials: 'Mk', subtitle: 'Dealer site' },
]

function ChannelSyndicationCard() {
  // UI-only state for demo. Persist via a ChannelListing model in a follow-up.
  const [enabled, setEnabled] = useState<Record<string, boolean>>({})

  function toggle(id: string) {
    setEnabled(cur => ({ ...cur, [id]: !cur[id] }))
  }

  const liveCount = Object.values(enabled).filter(Boolean).length

  return (
    <GlassCard padding={24}>
      <GlassEyebrow
        label="Channel Distribution"
        subtitle={liveCount > 0
          ? `Live on ${liveCount} of ${SYNDICATION_CHANNELS.length} marketplaces`
          : `Ready to syndicate to ${SYNDICATION_CHANNELS.length} marketplaces`}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {SYNDICATION_CHANNELS.map(ch => (
          <SyndicationRow
            key={ch.id}
            channel={ch}
            enabled={!!enabled[ch.id]}
            onToggle={() => toggle(ch.id)}
          />
        ))}
      </div>
    </GlassCard>
  )
}

function SyndicationRow({
  channel, enabled, onToggle,
}: {
  channel: SyndicationChannel
  enabled: boolean
  onToggle: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const status = enabled ? 'Live' : 'Ready'
  const statusColor = enabled ? '#06a55a' : 'rgba(0,0,0,0.4)'

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 16, padding: '14px 18px',
        background: hovered ? 'rgba(255, 255, 255, 0.68)' : 'rgba(255, 255, 255, 0.45)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderRadius: 14,
        border: '1px solid rgba(255, 255, 255, 0.55)',
        boxShadow: [
          '0 2px 8px -2px rgba(31, 38, 135, 0.07)',
          'inset 0 1px 0 rgba(255, 255, 255, 0.75)',
        ].join(', '),
        transition: 'background 180ms ease',
      }}
    >
      {/* Left: Logo + name + status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
        <ChannelLogo channel={channel} enabled={enabled} />
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#1d1d1f', letterSpacing: '-0.005em' }}>{channel.name}</p>
          <p style={{ fontSize: 11, color: 'rgba(0,0,0,0.5)', marginTop: 2, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              display: 'inline-block', width: 5, height: 5, borderRadius: '50%',
              background: statusColor,
              boxShadow: enabled ? '0 0 6px rgba(6, 165, 90, 0.7)' : 'none',
              flexShrink: 0,
            }} />
            <span style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, color: statusColor }}>{status}</span>
            <span style={{ color: 'rgba(0,0,0,0.4)' }}>· {channel.subtitle}</span>
          </p>
        </div>
      </div>

      {/* Right: Switch + settings gear */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <FluidSwitch checked={enabled} onChange={onToggle} />
        <button
          onClick={() => alert(`${channel.name} — pricing overrides & notes (coming soon)`)}
          aria-label={`${channel.name} settings`}
          style={{
            width: 28, height: 28, borderRadius: '50%',
            background: 'transparent', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'rgba(0,0,0,0.4)', minHeight: 'auto',
            transition: 'color 180ms ease, background 180ms ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(0,0,0,0.7)'; e.currentTarget.style.background = 'rgba(0,0,0,0.05)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(0,0,0,0.4)'; e.currentTarget.style.background = 'transparent' }}
        >
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
    </div>
  )
}

function ChannelLogo({ channel, enabled }: { channel: SyndicationChannel; enabled: boolean }) {
  return (
    <div style={{
      width: 38, height: 38, borderRadius: 10,
      background: enabled ? '#1d1d1f' : 'rgba(0, 0, 0, 0.05)',
      color: enabled ? '#fff' : 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 13, fontWeight: 800, letterSpacing: '-0.01em',
      flexShrink: 0,
      border: '1px solid rgba(0, 0, 0, 0.06)',
      boxShadow: enabled
        ? '0 2px 8px -2px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.12)'
        : 'inset 0 1px 0 rgba(255, 255, 255, 0.65)',
      transition: 'background 220ms ease, color 220ms ease, box-shadow 220ms ease',
    }}>
      {channel.initials}
    </div>
  )
}

function FluidSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        position: 'relative',
        width: 44, height: 26, borderRadius: 999,
        background: checked ? '#06a55a' : 'rgba(0, 0, 0, 0.18)',
        boxShadow: checked
          ? '0 0 0 1px rgba(6, 165, 90, 0.35), 0 0 14px rgba(6, 165, 90, 0.45), inset 0 1px 2px rgba(0,0,0,0.12)'
          : 'inset 0 1px 2px rgba(0,0,0,0.18)',
        border: 'none', cursor: 'pointer', padding: 0,
        transition: 'background 240ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 240ms ease',
        minHeight: 'auto',
        flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 2,
        left: checked ? 20 : 2,
        width: 22, height: 22, borderRadius: '50%',
        background: '#ffffff',
        boxShadow: '0 2px 4px rgba(0,0,0,0.22), 0 0 0 0.5px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.85)',
        transition: 'left 280ms cubic-bezier(0.34, 1.56, 0.64, 1)',
      }} />
    </button>
  )
}

// ─── Workspace Tab Navigation (fluid satin capsule) ─────────────────

type TabId = 'general' | 'recon' | 'marketing' | 'media' | 'files' | 'logs'
type TabDef = { id: TabId; label: string; badge?: string }

function TabNav({ tabs, activeId, onChange }: {
  tabs: TabDef[]
  activeId: TabId
  onChange: (id: TabId) => void
}) {
  const activeIdx = Math.max(0, tabs.findIndex(t => t.id === activeId))
  return (
    <div style={{
      position: 'relative',
      display: 'flex',
      padding: 4,
      marginBottom: 24,
      background: 'rgba(255, 255, 255, 0.5)',
      backdropFilter: 'blur(20px) saturate(180%)',
      WebkitBackdropFilter: 'blur(20px) saturate(180%)',
      borderRadius: 999,
      border: '1px solid rgba(255, 255, 255, 0.55)',
      boxShadow: [
        '0 4px 14px -4px rgba(31, 38, 135, 0.1)',
        'inset 0 1px 0 rgba(255, 255, 255, 0.75)',
        'inset 0 0 0 0.5px rgba(255, 255, 255, 0.35)',
      ].join(', '),
    }}>
      {/* Sliding satin indicator */}
      <div aria-hidden style={{
        position: 'absolute',
        top: 4, bottom: 4, left: 4,
        width: `calc((100% - 8px) / ${tabs.length})`,
        transform: `translateX(${activeIdx * 100}%)`,
        background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.72) 100%)',
        backdropFilter: 'blur(14px) saturate(180%)',
        WebkitBackdropFilter: 'blur(14px) saturate(180%)',
        borderRadius: 999,
        border: '1px solid rgba(255, 255, 255, 0.6)',
        boxShadow: [
          '0 4px 10px -2px rgba(0, 0, 0, 0.08)',
          'inset 0 1px 0 rgba(255, 255, 255, 0.92)',
          'inset 0 -1px 0 rgba(0, 0, 0, 0.03)',
        ].join(', '),
        transition: 'transform 380ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        pointerEvents: 'none',
        zIndex: 0,
      }} />

      {tabs.map(tab => {
        const isActive = tab.id === activeId
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            style={{
              flex: 1,
              position: 'relative',
              zIndex: 1,
              padding: '10px 14px',
              background: 'transparent',
              border: 'none',
              fontSize: 13,
              fontWeight: 600,
              color: isActive ? '#1d1d1f' : 'rgba(0, 0, 0, 0.55)',
              cursor: 'pointer',
              minHeight: 'auto',
              letterSpacing: '-0.005em',
              transition: 'color 200ms ease',
              whiteSpace: 'nowrap',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            {tab.label}
            {tab.badge && (
              <span style={{
                fontSize: 10, fontWeight: 700,
                padding: '1px 6px', borderRadius: 999,
                background: isActive ? 'rgba(0,0,0,0.08)' : 'rgba(0,0,0,0.06)',
                color: isActive ? '#1d1d1f' : 'rgba(0,0,0,0.5)',
                letterSpacing: '-0.005em',
                lineHeight: 1.5,
              }}>{tab.badge}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ─── Compact sub-tab nav for the Vehicle Info tab (fluid satin capsule) ────

type SubTabId = 'general' | 'build_title' | 'description' | 'purchase_info'

function SubTabNav({
  tabs, activeId, onChange,
}: {
  tabs: { id: SubTabId; label: string }[]
  activeId: SubTabId
  onChange: (id: SubTabId) => void
}) {
  const activeIdx = Math.max(0, tabs.findIndex(t => t.id === activeId))
  return (
    <div style={{
      position: 'relative',
      display: 'inline-flex',
      padding: 3,
      marginBottom: 18,
      background: 'rgba(255, 255, 255, 0.45)',
      backdropFilter: 'blur(16px) saturate(180%)',
      WebkitBackdropFilter: 'blur(16px) saturate(180%)',
      borderRadius: 999,
      border: '1px solid rgba(255, 255, 255, 0.5)',
      boxShadow: [
        '0 2px 8px -2px rgba(31, 38, 135, 0.08)',
        'inset 0 1px 0 rgba(255, 255, 255, 0.7)',
      ].join(', '),
    }}>
      {/* Sliding indicator */}
      <div aria-hidden style={{
        position: 'absolute',
        top: 3, bottom: 3, left: 3,
        width: `calc((100% - 6px) / ${tabs.length})`,
        transform: `translateX(${activeIdx * 100}%)`,
        background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.72) 100%)',
        borderRadius: 999,
        border: '1px solid rgba(255, 255, 255, 0.6)',
        boxShadow: '0 2px 6px -2px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.9)',
        transition: 'transform 320ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        pointerEvents: 'none',
        zIndex: 0,
      }} />

      {tabs.map(tab => {
        const isActive = tab.id === activeId
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            style={{
              position: 'relative', zIndex: 1,
              padding: '7px 16px',
              background: 'transparent', border: 'none',
              fontSize: 12, fontWeight: 600, letterSpacing: '-0.005em',
              color: isActive ? '#1d1d1f' : 'rgba(0,0,0,0.55)',
              cursor: 'pointer', minHeight: 'auto',
              transition: 'color 200ms ease',
              whiteSpace: 'nowrap',
            }}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

// ─── Marketing-copy description editor ─────────────────────────────

function DescriptionEditor({
  value, vehicle, onSave,
}: {
  value: string
  vehicle: Vehicle
  onSave: (text: string) => Promise<void>
}) {
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [polishing, setPolishing] = useState(false)
  // Snapshot of the user's text right before an AI polish — enables undo.
  const [prePolish, setPrePolish] = useState<string | null>(null)

  // Sync if the underlying vehicle.vehicleInfo changes from elsewhere
  useEffect(() => { setDraft(value) }, [value])

  const dirty = draft !== (value || '')
  const canPolish = draft.trim().length >= 10 && !polishing

  async function save() {
    if (!dirty) return
    setSaving(true)
    setError(null)
    try {
      await onSave(draft)
      setSavedAt(new Date())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  async function polish() {
    if (!canPolish) return
    setPolishing(true)
    setError(null)
    const snapshot = draft
    try {
      const r = await fetch('/api/ai/polish-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: draft,
          vehicle: {
            year: vehicle.year,
            make: vehicle.make,
            model: vehicle.model,
            trim: vehicle.trim,
            mileage: vehicle.mileage,
            color: vehicle.color,
          },
        }),
      })
      const text = await r.text()
      const data = text ? JSON.parse(text) : {}
      if (!r.ok || !data.polished) {
        setError(data.error || `AI request failed (${r.status})`)
        return
      }
      setPrePolish(snapshot)
      setDraft(data.polished)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPolishing(false)
    }
  }

  function revertPolish() {
    if (prePolish === null) return
    setDraft(prePolish)
    setPrePolish(null)
  }

  const charCount = draft.length
  const wordCount = draft.trim() ? draft.trim().split(/\s+/).length : 0

  return (
    <GlassCard padding={28}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12, flexWrap: 'wrap', paddingLeft: 18, paddingRight: 18 }}>
        <h3 style={{
          fontSize: 17, fontWeight: 700, letterSpacing: '-0.015em',
          color: '#0a0a0a', lineHeight: 1,
        }}>Description</h3>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {dirty && !saving && (
            <span style={{ fontSize: 11, fontWeight: 600, color: '#b45309' }}>Unsaved changes</span>
          )}
          {!dirty && savedAt && !saving && (
            <span style={{ fontSize: 11, fontWeight: 600, color: '#06a55a' }}>
              Saved {savedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </span>
          )}
          {prePolish !== null && (
            <button
              onClick={revertPolish}
              style={{
                padding: '6px 14px', borderRadius: 999,
                background: 'rgba(255,255,255,0.5)',
                backdropFilter: 'blur(10px) saturate(180%)',
                border: '1px solid rgba(255,255,255,0.6)',
                color: 'rgba(0,0,0,0.7)',
                fontSize: 11, fontWeight: 600, letterSpacing: '-0.005em',
                cursor: 'pointer', minHeight: 'auto',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8)',
              }}
            >Restore original</button>
          )}
          <button
            onClick={polish}
            disabled={!canPolish}
            title={canPolish ? 'Rewrite as a polished marketing description' : 'Write a few notes first'}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '7px 16px', borderRadius: 999, border: 'none',
              background: canPolish
                ? 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)'
                : 'rgba(0,0,0,0.06)',
              color: canPolish ? '#fff' : 'rgba(0,0,0,0.4)',
              fontSize: 12, fontWeight: 700, letterSpacing: '-0.005em',
              cursor: canPolish ? 'pointer' : 'not-allowed',
              minHeight: 'auto',
              boxShadow: canPolish
                ? '0 4px 14px -4px rgba(124, 58, 237, 0.5), inset 0 1px 0 rgba(255,255,255,0.18)'
                : 'none',
              transition: 'transform 160ms ease, box-shadow 160ms ease',
            }}
          >
            <SparkleIcon spinning={polishing} />
            {polishing ? 'Polishing…' : 'Polish with AI'}
          </button>
          <button
            onClick={save}
            disabled={!dirty || saving}
            style={{
              padding: '7px 18px', borderRadius: 999, border: 'none',
              background: dirty && !saving ? '#1d1d1f' : 'rgba(0,0,0,0.08)',
              color: dirty && !saving ? '#dffd6e' : 'rgba(0,0,0,0.4)',
              fontSize: 12, fontWeight: 700, letterSpacing: '-0.005em',
              cursor: dirty && !saving ? 'pointer' : 'not-allowed',
              minHeight: 'auto',
              boxShadow: dirty && !saving ? '0 2px 8px -2px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.12)' : 'none',
              transition: 'transform 160ms ease',
            }}
          >{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>

      <textarea
        value={draft}
        onChange={(e) => { setDraft(e.target.value); if (prePolish !== null) setPrePolish(null) }}
        onBlur={() => { if (dirty) save() }}
        placeholder="Drop your notes about the vehicle here — condition, options, history, why it stands out. Then click Polish with AI to rewrite into clean marketing copy."
        rows={14}
        disabled={polishing}
        style={{
          width: '100%',
          padding: '16px 18px',
          background: 'rgba(255, 255, 255, 0.4)',
          backdropFilter: 'blur(14px) saturate(180%)',
          WebkitBackdropFilter: 'blur(14px) saturate(180%)',
          border: '1px solid rgba(255, 255, 255, 0.55)',
          borderRadius: 14,
          fontSize: 15, lineHeight: 1.7,
          fontFamily: 'inherit',
          color: 'rgba(0,0,0,0.82)',
          letterSpacing: '-0.005em',
          outline: 'none',
          resize: 'vertical',
          minHeight: 240,
          opacity: polishing ? 0.6 : 1,
          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.7)',
          transition: 'opacity 180ms ease',
        }}
      />

      {/* Footer: counts + autosave hint */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginTop: 10, gap: 12,
      }}>
        <p style={{ fontSize: 11, color: 'rgba(0,0,0,0.4)', fontWeight: 500 }}>
          {prePolish !== null
            ? 'AI rewrote your notes. Click Save to keep it or Restore original to undo.'
            : 'Auto-saves on blur'}
        </p>
        <p style={{
          fontSize: 11, color: 'rgba(0,0,0,0.45)', fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {wordCount} word{wordCount === 1 ? '' : 's'} · {charCount} char{charCount === 1 ? '' : 's'}
        </p>
      </div>

      {error && (
        <p style={{
          marginTop: 10, padding: '8px 12px',
          background: 'rgba(255, 59, 48, 0.08)',
          color: '#d70015', fontSize: 12,
          borderRadius: 8,
        }}>{error}</p>
      )}
    </GlassCard>
  )
}

// Sparkle icon for the AI polish button — spins while polishing.
function SparkleIcon({ spinning }: { spinning?: boolean }) {
  return (
    <svg
      width="13" height="13" viewBox="0 0 24 24" fill="currentColor"
      style={{
        flexShrink: 0,
        animation: spinning ? 'mm-spin 900ms linear infinite' : 'none',
      }}
    >
      <path d="M12 2l1.7 4.8L18 8.5l-4.3 1.7L12 15l-1.7-4.8L6 8.5l4.3-1.7L12 2z" />
      <path d="M19 14l.9 2.5L22 17.5l-2.1.9L19 21l-.9-2.6L16 17.5l2.1-1L19 14z" opacity="0.8" />
      <style>{`@keyframes mm-spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </svg>
  )
}

// ─── Title & Build Studio (Vehicle Info → Build / Title sub-tab) ──────

function TitleBuildStudio({
  vehicle, onSavePartial,
}: {
  vehicle: Vehicle
  isAdmin: boolean
  onSavePartial: (patch: Record<string, unknown>) => Promise<void>
}) {
  // Local-only build fields (no schema yet — visual scaffolding for the demo)
  const inferredCondition: 'new' | 'used' = (vehicle.mileage && vehicle.mileage > 200) ? 'used' : 'new'
  const [newUsed, setNewUsed] = useState<'new' | 'used'>(inferredCondition)
  const [bodyType, setBodyType] = useState('')
  const [engine, setEngine] = useState('')
  const [cylinder, setCylinder] = useState('')
  const [transmission, setTransmission] = useState('')
  const [driveTrain, setDriveTrain] = useState('')
  const [fuelType, setFuelType] = useState('')
  const [horsePower, setHorsePower] = useState('')
  const [doors, setDoors] = useState('')

  // VIN decode (NHTSA vPIC) — runs when user clicks the Auto pill on the VIN field
  const [decoding, setDecoding] = useState(false)
  const [decoded, setDecoded] = useState(false)
  const [decodeError, setDecodeError] = useState<string | null>(null)

  async function runVinDecode(vinValue: string) {
    const clean = vinValue.trim().toUpperCase()
    if (!clean || clean.length < 11) {
      setDecodeError('Enter a complete VIN before decoding')
      setTimeout(() => setDecodeError(null), 3500)
      return
    }
    setDecoding(true)
    setDecodeError(null)
    try {
      const r = await fetch(`/api/vehicles/decode-vin?vin=${encodeURIComponent(clean)}`)
      const text = await r.text()
      const data = text ? JSON.parse(text) : {}
      if (!r.ok || !data.decoded) {
        setDecodeError(data.error || `Decode failed (${r.status})`)
        setTimeout(() => setDecodeError(null), 4500)
        return
      }
      const d = data.decoded

      // Persist fields that live on the Vehicle record — only fill blanks, never
      // overwrite values the user typed manually.
      const patch: Record<string, unknown> = {}
      if (d.year && !vehicle.year)   patch.year  = d.year
      if (d.make && !vehicle.make)   patch.make  = d.make
      if (d.model && !vehicle.model) patch.model = d.model
      if (d.trim && !vehicle.trim)   patch.trim  = d.trim
      if (Object.keys(patch).length > 0) await onSavePartial(patch)

      // Local visual fields — fill the blanks the user hasn't touched.
      if (d.bodyType && !bodyType)         setBodyType(d.bodyType)
      if (d.engine && !engine)             setEngine(d.engine)
      if (d.cylinder && !cylinder)         setCylinder(String(d.cylinder))
      if (d.transmission && !transmission) setTransmission(d.transmission)
      if (d.driveTrain && !driveTrain)     setDriveTrain(d.driveTrain)
      if (d.fuelType && !fuelType)         setFuelType(d.fuelType)
      if (d.horsepower && !horsePower)     setHorsePower(String(d.horsepower))
      if (d.doors && !doors)               setDoors(String(d.doors))

      setDecoded(true)
    } catch (e) {
      setDecodeError(e instanceof Error ? e.message : String(e))
      setTimeout(() => setDecodeError(null), 4500)
    } finally {
      setDecoding(false)
    }
  }

  // Local-only title fields (no schema yet)
  const [rosTitle, setRosTitle] = useState('')
  const [titleState, setTitleState] = useState('')
  const [brand, setBrand] = useState('')
  const [titleReceiveDate, setTitleReceiveDate] = useState('')
  const [titleIssueDate, setTitleIssueDate] = useState('')
  const [titleOutDate, setTitleOutDate] = useState('')
  const [titleTransferredDate, setTitleTransferredDate] = useState('')
  const [titleAppNo, setTitleAppNo] = useState('')

  // Public-facing inventory URL — derived from stock # for now
  const liveUrl = `https://mikalyzed.com/inventory/${vehicle.stockNumber}`

  return (
    <GlassCard padding={24}>
      <div style={{ marginBottom: 18 }}>
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.45)', marginBottom: 3 }}>Title &amp; Build Studio</p>
        <p style={{ fontSize: 12, color: 'rgba(0,0,0,0.5)', fontWeight: 500 }}>
          Mechanical blueprint &middot; title registration &middot; public listing
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '40fr 60fr',
        gap: 16,
        alignItems: 'stretch',
      }}>

        {/* ─── COL 1: Vertical Mechanical Blueprint ─── */}
        <SubPanel>
          <SectionLabel>Mechanical Blueprint</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <BlueprintRow>
              <InlineTextField
                label="New / Used"
                value={newUsed}
                options={[{ id: 'new', label: 'New' }, { id: 'used', label: 'Used' }]}
                onChange={(v) => setNewUsed(v as 'new' | 'used')}
              />
            </BlueprintRow>
            <BlueprintRow>
              <VinField
                vin={vehicle.vin || ''}
                decoding={decoding}
                decoded={decoded}
                onDecode={() => runVinDecode(vehicle.vin || '')}
                onCommit={async (v) => {
                  await onSavePartial({ vin: v || null })
                  // Reset the "decoded" badge when the VIN itself changes
                  setDecoded(false)
                }}
              />
            </BlueprintRow>
            {decodeError && (
              <div style={{
                padding: '6px 10px',
                background: 'rgba(255, 59, 48, 0.08)',
                color: '#b42318',
                fontSize: 11, fontWeight: 600,
                borderRadius: 6,
                border: '1px solid rgba(255, 59, 48, 0.18)',
              }}>{decodeError}</div>
            )}
            <BlueprintRow>
              <InlineTextField
                label="Year"
                value={vehicle.year ? String(vehicle.year) : ''}
                numeric
                onCommit={(v) => onSavePartial({ year: v ? parseInt(v, 10) : null })}
              />
            </BlueprintRow>
            <BlueprintRow>
              <InlineTextField
                label="Make"
                value={vehicle.make || ''}
                onCommit={(v) => onSavePartial({ make: v })}
              />
            </BlueprintRow>
            <BlueprintRow>
              <InlineTextField
                label="Model"
                value={vehicle.model || ''}
                onCommit={(v) => onSavePartial({ model: v })}
              />
            </BlueprintRow>
            <BlueprintRow>
              <InlineTextField
                label="Trim"
                value={vehicle.trim || ''}
                onCommit={(v) => onSavePartial({ trim: v || null })}
              />
            </BlueprintRow>
            <BlueprintRow>
              <InlineTextField label="Body Type"    value={bodyType}    onChange={setBodyType} />
            </BlueprintRow>
            <BlueprintRow>
              <InlineTextField label="Engine"       value={engine}      onChange={setEngine} />
            </BlueprintRow>
            <BlueprintRow>
              <InlineTextField label="Cylinder"     value={cylinder}    onChange={setCylinder} numeric />
            </BlueprintRow>
            <BlueprintRow>
              <InlineTextField label="Transmission" value={transmission} onChange={setTransmission} />
            </BlueprintRow>
            <BlueprintRow>
              <InlineTextField label="Drive Train"  value={driveTrain}  onChange={setDriveTrain} />
            </BlueprintRow>
            <BlueprintRow>
              <InlineTextField label="Fuel Type"    value={fuelType}    onChange={setFuelType} />
            </BlueprintRow>
            <BlueprintRow>
              <InlineTextField label="Horse Power"  value={horsePower}  onChange={setHorsePower} numeric />
            </BlueprintRow>
            <BlueprintRow>
              <InlineTextField label="Door"         value={doors}       onChange={setDoors} numeric />
            </BlueprintRow>
          </div>
        </SubPanel>

        {/* ─── COL 2: Live Web + Title Registration + Compliance & Assets ─── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          <LiveLinkBanner url={liveUrl} />

          <SubPanel>
            <SectionLabel>Title Registration</SectionLabel>

            {/* Top: status fields — opened-up 2-col grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              columnGap: 32, rowGap: 14,
            }}>
              <InlineTextField label="ROS / Title"  value={rosTitle}    onChange={setRosTitle} />
              <InlineSelectField
                label="Title State"
                value={titleState}
                onChange={setTitleState}
                options={US_STATES}
                searchable
                placeholder="—"
              />
              <InlineSelectField
                label="Brand"
                value={brand}
                onChange={setBrand}
                options={BRAND_OPTIONS}
                searchable
                placeholder="—"
              />
              <InlineSelectField
                label="Title Status"
                value={vehicle.titleStatus || ''}
                onCommit={(v) => onSavePartial({ titleStatus: v || null })}
                options={TITLE_STATUS_OPTIONS}
                placeholder="—"
              />
            </div>

            <div style={{ height: 14 }} />

            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              columnGap: 32, rowGap: 14,
            }}>
              <InlineDateField label="Title Receive Date"     value={titleReceiveDate}     onChange={setTitleReceiveDate} />
              <InlineDateField label="Title Issue Date"       value={titleIssueDate}       onChange={setTitleIssueDate} />
              <InlineDateField label="Title Out Date"         value={titleOutDate}         onChange={setTitleOutDate} />
              <InlineDateField label="Title Transferred Date" value={titleTransferredDate} onChange={setTitleTransferredDate} />
            </div>

            <div style={{ height: 14 }} />

            <InlineTextField label="Title App. No." value={titleAppNo} onChange={setTitleAppNo} />
          </SubPanel>
        </div>
      </div>
    </GlassCard>
  )
}

// ─── Purchase Info Studio (Vehicle Info → Purchase Info sub-tab) ────────
// 60/40 asymmetric two-column layout:
//   LEFT (60%): operational financials — Purchase Info + How Did You Pay
//   RIGHT (40%): external legal entities — Lienholder + Previous Owner
// All four parent containers use GlassCard so they share the same translucent
// frosted surface; sub-content uses SubPanel + custom mini-helpers below.

const ACQUIRED_MILEAGE_STATUS_OPTIONS = [
  { value: 'actual',   label: 'Actual' },
  { value: 'not_actual', label: 'Not Actual' },
  { value: 'exceeds',  label: 'Exceeds Mechanical Limits' },
]

const PAYMENT_METHOD_OPTIONS = [
  { value: 'cash',    label: 'Cash' },
  { value: 'check',   label: 'Check' },
  { value: 'wire',    label: 'Wire' },
  { value: 'ach',     label: 'ACH' },
  { value: 'card',    label: 'Card' },
  { value: 'other',   label: 'Other' },
]

const PRINCIPAL_USE_OPTIONS = [
  { value: 'personal',   label: 'Personal' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'rental',     label: 'Rental' },
  { value: 'lease',      label: 'Lease' },
  { value: 'demo',       label: 'Demo' },
  { value: 'police',     label: 'Police' },
  { value: 'taxi',       label: 'Taxi' },
]

function PurchaseInfoStudio({
  vehicle, isAdmin, onSavePartial,
}: {
  vehicle: Vehicle
  isAdmin: boolean
  onSavePartial: (patch: Record<string, unknown>) => Promise<void>
}) {
  // Persisted fields from Vehicle (the ones we already have columns for)
  const vehicleCost = vehicle.vehicleCost ?? 0
  const purchaseDateStr = vehicle.dateInStock
    ? new Date(vehicle.dateInStock).toISOString().slice(0, 10)
    : ''
  const mileage = vehicle.mileage ?? 0

  // Local-only state for the Purchase Info fields that don't yet have columns.
  // Pending the persistence decision; the studio still saves to local state so
  // an admin can fill it out within a session and validate the layout.
  const [acquiredMileageStatus, setAcquiredMileageStatus] = useState('')
  const [readyToSell, setReadyToSell] = useState('')
  const [purchaseDetail, setPurchaseDetail] = useState('')

  // Card 2 — How Did You Pay
  const [howPaidMemo, setHowPaidMemo] = useState('')

  // Card 3 — Lienholder
  const [lienholderSearch, setLienholderSearch] = useState('')
  const [lienAccountNo, setLienAccountNo] = useState('')
  const [lienPayoffAmount, setLienPayoffAmount] = useState(0)
  const [lienDueDate, setLienDueDate] = useState('')
  const [lienPaymentMethod, setLienPaymentMethod] = useState('')
  const [lienPerDiem, setLienPerDiem] = useState(0)
  const [lienDatePaidOff, setLienDatePaidOff] = useState('')
  const [paidViaFlooring, setPaidViaFlooring] = useState(false)
  const [lienMemo, setLienMemo] = useState('')

  // Card 4 — Previous Owner
  const [prevOwnerName, setPrevOwnerName] = useState('')
  const [prevOwnerPhone, setPrevOwnerPhone] = useState('')
  const [prevOwnerAddress, setPrevOwnerAddress] = useState('')
  const [prevOwnerDealerLicense, setPrevOwnerDealerLicense] = useState('')
  const [prevOwnerPrincipalUse, setPrevOwnerPrincipalUse] = useState('')

  // Days in Inventory — computed from dateInStock so the admin doesn't
  // have to maintain it.  Defaults to '—' when no purchase date is set.
  const daysInInv = vehicle.dateInStock
    ? Math.max(0, Math.floor((Date.now() - new Date(vehicle.dateInStock).getTime()) / 86400000))
    : null

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '3fr 2fr',
      gap: 18,
      alignItems: 'start',
      minWidth: 0,
    }}>
      {/* ─── LEFT COLUMN (60%) ───────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
        {/* CARD 1 — Purchase Info */}
        <GlassCard padding={22}>
          <GlassEyebrow label="Purchase Info" />

          {/* Stack the two mini-grids vertically so each field gets the full
              card width — the prior side-by-side layout squeezed the values
              into the right rail of each SubPanel, making them feel cramped. */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            minWidth: 0,
          }}>
            {/* TOP — acquisition financials.  All AnchorRow* variants so the
                row chips match Previous Owner's visual weight. */}
            <div>
              <SectionLabel>Acquisition</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <AnchorRowDate
                  label="Purchase Date"
                  value={purchaseDateStr}
                  onChange={(v) => onSavePartial({ dateInStock: v || null })}
                />
                <AnchorRowMoney
                  label="Purchase Cost"
                  value={vehicleCost}
                  onCommit={(v) => onSavePartial({ vehicleCost: v })}
                />
                <AnchorRowMoney
                  label="Acquired Mileage In"
                  value={mileage}
                  onCommit={(v) => onSavePartial({ mileage: v })}
                  placeholderEmpty={!vehicle.mileage}
                />
                <AnchorRowSelect
                  label="Acquired Mileage Status"
                  value={acquiredMileageStatus}
                  onChange={setAcquiredMileageStatus}
                  options={ACQUIRED_MILEAGE_STATUS_OPTIONS}
                  placeholder="—"
                />
                <AnchorRowReadonly
                  label="Date in Stock"
                  value={purchaseDateStr ? new Date(purchaseDateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' }) : '—'}
                />
                <AnchorRowDate
                  label="Ready to Sell"
                  value={readyToSell}
                  onChange={setReadyToSell}
                />
                <AnchorRowReadonly
                  label="Days in Inventory"
                  value={daysInInv !== null ? `${daysInInv}d` : '—'}
                />
              </div>
            </div>

            {/* BOTTOM — Buyer & Source.  Contact details ride the same chip
                pattern so they match Previous Owner in size and density. */}
            <div>
              <SectionLabel>Buyer &amp; Source</SectionLabel>
              <ContactBadge name="Yoan Perez Gutierrez" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                <AnchorRow
                  label="Cell"
                  value="(305) 555-0142"
                  onChange={() => { /* placeholder until contact picker is wired */ }}
                  placeholder="—"
                />
                <AnchorRow
                  label="Email"
                  value="yoan.perez@example.com"
                  onChange={() => { /* placeholder until contact picker is wired */ }}
                  placeholder="—"
                />
                <AnchorRow
                  label="Address"
                  value="1234 Coral Way, Miami FL 33145"
                  onChange={() => { /* placeholder until contact picker is wired */ }}
                  placeholder="—"
                />
              </div>
              <div style={{ marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => { /* placeholder for contact selector */ }}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 12,
                    border: '1px dashed rgba(0, 0, 0, 0.14)',
                    background: 'rgba(255, 255, 255, 0.32)',
                    backdropFilter: 'blur(10px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(10px) saturate(180%)',
                    fontSize: 12, fontWeight: 600, color: 'rgba(0, 0, 0, 0.55)',
                    cursor: 'pointer',
                    transition: 'background 160ms ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.5)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.32)' }}
                >
                  Change contact…
                </button>
              </div>
            </div>
          </div>

          {/* Base — Purchase Detail textarea */}
          <div style={{ marginTop: 14 }}>
            <p style={{
              fontSize: 11, fontWeight: 600, letterSpacing: '-0.005em',
              color: 'rgba(0, 0, 0, 0.5)', marginBottom: 6,
            }}>Purchase Detail</p>
            <GlassTextArea
              value={purchaseDetail}
              onChange={setPurchaseDetail}
              placeholder="Auction lot, condition notes, contingencies, side agreements…"
              minRows={3}
            />
          </div>
        </GlassCard>

        {/* CARD 2 — How Did You Pay */}
        <GlassCard padding={22}>
          <GlassEyebrow
            label="How Did You Pay"
            action={
              <button
                type="button"
                style={{
                  padding: '6px 12px', borderRadius: 999,
                  border: '1px solid rgba(0, 113, 227, 0.2)',
                  background: 'rgba(255, 255, 255, 0.55)',
                  backdropFilter: 'blur(10px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(10px) saturate(180%)',
                  color: '#0071e3', fontSize: 11, fontWeight: 700,
                  letterSpacing: '-0.005em', cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  minHeight: 'auto',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)',
                }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                Add Payment Type
              </button>
            }
          />

          {/* Floating satin floorplan tile */}
          <FloorplanTile
            lenderName={vehicle.floorLender || 'Mikalyzed (in-house)'}
            payOffAmount={vehicle.floorPrincipal ?? 0}
            amountFloored={vehicle.floorPrincipal ?? 0}
            dailyRate={vehicle.floorDailyRate ?? 0}
            status={vehicle.floorStatus || 'pending'}
          />

          {/* Base — Memo textarea */}
          <div style={{ marginTop: 14 }}>
            <p style={{
              fontSize: 11, fontWeight: 600, letterSpacing: '-0.005em',
              color: 'rgba(0, 0, 0, 0.5)', marginBottom: 6,
            }}>Memo</p>
            <GlassTextArea
              value={howPaidMemo}
              onChange={setHowPaidMemo}
              placeholder="Payment splits, transaction IDs, deposit confirmations…"
              minRows={3}
            />
          </div>
        </GlassCard>
      </div>

      {/* ─── RIGHT COLUMN (40%) ──────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
        {/* CARD 3 — Lienholder */}
        <GlassCard padding={22}>
          <GlassEyebrow label="Lienholder" />

          {/* Inline search selector */}
          <div style={{ marginBottom: 12 }}>
            <input
              type="text"
              value={lienholderSearch}
              onChange={(e) => setLienholderSearch(e.target.value)}
              placeholder="Search lienholders…"
              style={{
                width: '100%', padding: '10px 14px',
                borderRadius: 12, border: 'none',
                background: 'rgba(255, 255, 255, 0.45)',
                backdropFilter: 'blur(15px) saturate(180%)',
                WebkitBackdropFilter: 'blur(15px) saturate(180%)',
                fontSize: 13, fontWeight: 500, color: '#0a0a0a',
                outline: 'none', boxSizing: 'border-box',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7), inset 0 0 0 1px rgba(255,255,255,0.4)',
              }}
            />
          </div>

          {/* AnchorRow chip stack so the lien tracking fields read the same as
              Previous Owner — full-width chips with translucent backgrounds,
              label-left / value-right. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <AnchorRow label="Lien Account No." value={lienAccountNo} onChange={setLienAccountNo} placeholder="—" />
            <AnchorRowMoney label="Payoff Amount" value={lienPayoffAmount} onChange={setLienPayoffAmount} />
            <AnchorRowDate label="Due Date" value={lienDueDate} onChange={setLienDueDate} />
            <AnchorRowSelect
              label="Payment Method"
              value={lienPaymentMethod}
              onChange={setLienPaymentMethod}
              options={PAYMENT_METHOD_OPTIONS}
              placeholder="—"
            />
            <AnchorRowMoney label="Per Diem" value={lienPerDiem} onChange={setLienPerDiem} />
            <AnchorRowDate label="Date Paid Off" value={lienDatePaidOff} onChange={setLienDatePaidOff} />
          </div>

          {/* Custom Paid Via Flooring toggle pill */}
          <div style={{ marginTop: 12 }}>
            <FlooringTogglePill
              checked={paidViaFlooring}
              onChange={setPaidViaFlooring}
              label="Paid Via Flooring"
            />
          </div>

          {/* Base — Memo textarea */}
          <div style={{ marginTop: 14 }}>
            <p style={{
              fontSize: 11, fontWeight: 600, letterSpacing: '-0.005em',
              color: 'rgba(0, 0, 0, 0.5)', marginBottom: 6,
            }}>Memo</p>
            <GlassTextArea
              value={lienMemo}
              onChange={setLienMemo}
              placeholder="Lien payoff context, communications, payoff letter ref…"
              minRows={3}
            />
          </div>
        </GlassCard>

        {/* CARD 4 — Previous Owner */}
        <GlassCard padding={22}>
          <GlassEyebrow label="Previous Owner" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <AnchorRow label="Owner Name" value={prevOwnerName} onChange={setPrevOwnerName} placeholder="—" />
            <AnchorRow label="Phone No." value={prevOwnerPhone} onChange={setPrevOwnerPhone} placeholder="—" />
            <AnchorRow label="Address" value={prevOwnerAddress} onChange={setPrevOwnerAddress} placeholder="—" />
            <AnchorRow label="Dealer License No." value={prevOwnerDealerLicense} onChange={setPrevOwnerDealerLicense} placeholder="—" />
            <AnchorRowSelect
              label="Principal Use of Vehicle"
              value={prevOwnerPrincipalUse}
              onChange={setPrevOwnerPrincipalUse}
              options={PRINCIPAL_USE_OPTIONS}
              placeholder="—"
            />
          </div>
        </GlassCard>
      </div>
    </div>
  )
}

// ─── Purchase Info mini-helpers ────────────────────────────────────────

// Translucent textarea — borderless, glass-tinted, no harsh rectangle.
function GlassTextArea({
  value, onChange, placeholder, minRows = 3,
}: { value: string; onChange: (v: string) => void; placeholder?: string; minRows?: number }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={minRows}
      style={{
        width: '100%',
        padding: '11px 14px',
        borderRadius: 12,
        border: 'none',
        background: 'rgba(255, 255, 255, 0.35)',
        backdropFilter: 'blur(15px) saturate(180%)',
        WebkitBackdropFilter: 'blur(15px) saturate(180%)',
        fontSize: 13, fontWeight: 500, color: '#0a0a0a',
        lineHeight: 1.55, fontFamily: 'inherit',
        outline: 'none', resize: 'vertical',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7), inset 0 0 0 0.5px rgba(255,255,255,0.4)',
        boxSizing: 'border-box',
      }}
    />
  )
}

// Floating contact badge — name in a softly tinted capsule, contact details below.
function ContactBadge({ name, cell, email, address }: {
  name: string; cell?: string; email?: string; address?: string
}) {
  return (
    <div>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '6px 12px',
        background: 'rgba(255, 255, 255, 0.55)',
        backdropFilter: 'blur(15px) saturate(180%)',
        WebkitBackdropFilter: 'blur(15px) saturate(180%)',
        border: '1px solid rgba(255, 255, 255, 0.6)',
        borderRadius: 999,
        boxShadow: [
          '0 4px 12px -4px rgba(31, 38, 135, 0.12)',
          'inset 0 1px 0 rgba(255, 255, 255, 0.8)',
        ].join(', '),
      }}>
        <span aria-hidden style={{
          width: 22, height: 22, borderRadius: '50%',
          background: 'linear-gradient(135deg, #1d1d1f 0%, #404040 100%)',
          color: '#dffd6e',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 800, letterSpacing: '-0.005em',
          flexShrink: 0,
        }}>{name.split(' ').map(p => p[0]).slice(0, 2).join('')}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#0a0a0a', letterSpacing: '-0.005em' }}>{name}</span>
      </div>
      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {cell && <ContactLine label="Cell" value={cell} />}
        {email && <ContactLine label="Email" value={email} />}
        {address && <ContactLine label="Address" value={address} />}
      </div>
    </div>
  )
}

function ContactLine({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 11 }}>
      <span style={{
        fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
        color: 'rgba(0, 0, 0, 0.4)', minWidth: 48,
      }}>{label}</span>
      <span style={{ fontWeight: 600, color: 'rgba(0, 0, 0, 0.78)' }}>{value}</span>
    </div>
  )
}

// Floorplan balance tile — independent floating satin dashboard inside the
// How Did You Pay card.  Big numbers, micro-action buttons.
function FloorplanTile({ lenderName, payOffAmount, amountFloored, dailyRate, status }: {
  lenderName: string
  payOffAmount: number
  amountFloored: number
  dailyRate: number
  status: string
}) {
  const fmtMoney = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
  const isPaidOff = status === 'paid_off'
  return (
    <div style={{
      padding: '16px 18px',
      borderRadius: 16,
      background: 'linear-gradient(135deg, rgba(255,255,255,0.62) 0%, rgba(245,245,245,0.42) 100%)',
      backdropFilter: 'blur(20px) saturate(180%)',
      WebkitBackdropFilter: 'blur(20px) saturate(180%)',
      border: '1px solid rgba(255, 255, 255, 0.55)',
      boxShadow: [
        '0 8px 24px -10px rgba(31, 38, 135, 0.18)',
        'inset 0 1px 0 rgba(255, 255, 255, 0.85)',
        'inset 0 0 0 0.5px rgba(255, 255, 255, 0.4)',
      ].join(', '),
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.45)' }}>Floorplan</p>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#0a0a0a', marginTop: 2, letterSpacing: '-0.01em' }}>{lenderName}</p>
        </div>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
          padding: '3px 9px', borderRadius: 999,
          background: isPaidOff ? 'rgba(34, 197, 94, 0.12)' : 'rgba(180, 83, 9, 0.12)',
          color: isPaidOff ? '#16a34a' : '#92400e',
          border: `1px solid ${isPaidOff ? 'rgba(34, 197, 94, 0.25)' : 'rgba(180, 83, 9, 0.25)'}`,
        }}>{status.replace(/_/g, ' ')}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div>
          <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.45)' }}>Pay Off Amount</p>
          <p style={{ fontSize: 22, fontWeight: 800, color: '#0a0a0a', marginTop: 2, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(payOffAmount)}</p>
        </div>
        <div>
          <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.45)' }}>Amount Floored</p>
          <p style={{ fontSize: 18, fontWeight: 700, color: 'rgba(0,0,0,0.72)', marginTop: 2, letterSpacing: '-0.015em', fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(amountFloored)}</p>
        </div>
      </div>

      {dailyRate > 0 && (
        <p style={{ fontSize: 11, color: 'rgba(0,0,0,0.55)', marginBottom: 10, fontWeight: 500 }}>
          Per-diem rate: {(dailyRate).toFixed(3)}% / day
        </p>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" style={{
          flex: 1, padding: '8px 0', borderRadius: 999, border: 'none',
          background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.95), rgba(37, 99, 235, 0.95))',
          color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: '-0.005em',
          cursor: 'pointer', boxShadow: '0 4px 14px -4px rgba(37, 99, 235, 0.4)',
        }}>Make Payment</button>
        <button type="button" style={{
          flex: 1, padding: '8px 0', borderRadius: 999, border: 'none',
          background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.95), rgba(22, 163, 74, 0.95))',
          color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: '-0.005em',
          cursor: 'pointer', boxShadow: '0 4px 14px -4px rgba(22, 163, 74, 0.4)',
        }}>Pay Off</button>
      </div>
    </div>
  )
}

// Custom Paid Via Flooring toggle pill — satin pill switch.
function FlooringTogglePill({ checked, onChange, label }: {
  checked: boolean; onChange: (v: boolean) => void; label: string
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 10,
        padding: '7px 14px 7px 8px',
        borderRadius: 999,
        background: checked ? 'linear-gradient(135deg, #1d1d1f 0%, #0a0a0a 100%)' : 'rgba(255, 255, 255, 0.5)',
        backdropFilter: 'blur(10px) saturate(180%)',
        WebkitBackdropFilter: 'blur(10px) saturate(180%)',
        border: `1px solid ${checked ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.55)'}`,
        boxShadow: checked
          ? '0 4px 14px -4px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.12)'
          : 'inset 0 1px 0 rgba(255,255,255,0.75)',
        cursor: 'pointer', minHeight: 'auto',
        transition: 'background 220ms ease',
      }}
    >
      <span style={{
        width: 18, height: 18, borderRadius: '50%',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: checked ? '#dffd6e' : 'rgba(0,0,0,0.06)',
        color: checked ? '#0a0a0a' : 'transparent',
        transition: 'background 220ms ease, color 220ms ease',
        flexShrink: 0,
      }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
      <span style={{
        fontSize: 11, fontWeight: 700, letterSpacing: '0.02em',
        color: checked ? '#fff' : 'rgba(0, 0, 0, 0.65)',
        transition: 'color 220ms ease',
      }}>{label}</span>
    </button>
  )
}

// Anchor row — borderless inline input with a translucent rounded background.
// Used in the Previous Owner card so each field reads as its own soft floating chip.
function AnchorRow({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string
}) {
  const [hover, setHover] = useState(false)
  const [focused, setFocused] = useState(false)
  return (
    <label
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        gap: 12,
        padding: '10px 14px',
        borderRadius: 12,
        background: focused
          ? 'rgba(255, 255, 255, 0.65)'
          : hover ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.32)',
        border: '1px solid rgba(255, 255, 255, 0.5)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)',
        cursor: 'text',
        transition: 'background 180ms ease',
      }}
    >
      <span style={labelStyle}>{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        style={{
          flex: 1, minWidth: 0, textAlign: 'right',
          background: 'transparent', border: 'none', outline: 'none',
          fontSize: 14, fontWeight: 700, color: '#0a0a0a',
          letterSpacing: '-0.005em', fontFamily: 'inherit',
        }}
      />
    </label>
  )
}

// Date variant of AnchorRow.  Click anywhere on the chip to open the native
// calendar (showPicker) — same UX as the new InlineDateField behavior.  User
// can also type digits to fill the date in.
function AnchorRowDate({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange?: (v: string) => void; placeholder?: string
}) {
  const [hover, setHover] = useState(false)
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const display = value
    ? new Date(value + 'T00:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' })
    : (placeholder || '—')
  function openPicker() {
    const el = inputRef.current
    if (!el) return
    el.focus()
    try { el.showPicker?.() } catch { /* not supported */ }
  }
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={openPicker}
      style={{
        position: 'relative',
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        gap: 12,
        padding: '10px 14px',
        borderRadius: 12,
        background: focused
          ? 'rgba(255, 255, 255, 0.65)'
          : hover ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.32)',
        border: '1px solid rgba(255, 255, 255, 0.5)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)',
        cursor: 'pointer',
        transition: 'background 180ms ease',
      }}
    >
      <span style={labelStyle}>{label}</span>
      <span style={{
        fontSize: 14, fontWeight: 700,
        color: value ? '#0a0a0a' : 'rgba(0,0,0,0.3)',
        letterSpacing: '-0.005em',
        display: 'inline-flex', alignItems: 'center', gap: 5,
      }}>
        <CalendarMicroIcon />
        {display}
      </span>
      {/* Hidden-but-focusable native date input layered on top.  Captures click + typing. */}
      <input
        ref={inputRef}
        type="date"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          position: 'absolute', inset: 0,
          opacity: 0, cursor: 'pointer',
          width: '100%', height: '100%',
        }}
      />
    </div>
  )
}

// Money variant of AnchorRow.  Display formats as $X,XXX; editing reveals a
// raw numeric input that auto-sizes to draft length, mirroring InlineField.
function AnchorRowMoney({ label, value, onChange, onCommit, placeholderEmpty }: {
  label: string; value: number
  onChange?: (v: number) => void
  onCommit?: (v: number) => void | Promise<void>
  placeholderEmpty?: boolean
}) {
  const isEditable = !!(onChange || onCommit)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [hover, setHover] = useState(false)
  const display = placeholderEmpty && !value
    ? '—'
    : `$${(value ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
  function startEdit() {
    if (!isEditable) return
    setDraft(value && value > 0 ? String(value) : '')
    setEditing(true)
  }
  async function commit() {
    setEditing(false)
    const n = draft === '' ? 0 : parseFloat(draft)
    if (!Number.isFinite(n)) return
    if (onCommit) {
      setSaving(true)
      try { await onCommit(n) } finally { setSaving(false) }
    } else if (onChange) {
      onChange(n)
    }
  }
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        gap: 12,
        padding: '10px 14px',
        borderRadius: 12,
        background: editing
          ? 'rgba(255, 255, 255, 0.65)'
          : hover ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.32)',
        border: '1px solid rgba(255, 255, 255, 0.5)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)',
        cursor: isEditable ? 'text' : 'default',
        transition: 'background 180ms ease',
        opacity: saving ? 0.55 : 1,
      }}
      onClick={() => { if (isEditable && !editing) startEdit() }}
    >
      <span style={labelStyle}>{label}</span>
      {editing ? (
        <input
          type="text"
          inputMode="decimal"
          value={draft}
          autoFocus
          size={Math.max(3, draft.length || 1)}
          onChange={(e) => setDraft(e.target.value.replace(/[^0-9.]/g, ''))}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
          style={{
            border: 'none', outline: 'none', background: 'transparent',
            fontSize: 14, fontWeight: 700, color: '#0a0a0a',
            textAlign: 'right', letterSpacing: '-0.005em',
            fontVariantNumeric: 'tabular-nums',
            padding: 0, width: 'auto', boxSizing: 'content-box',
          }}
        />
      ) : (
        <span style={{
          fontSize: 14, fontWeight: 700,
          color: placeholderEmpty && !value ? 'rgba(0,0,0,0.3)' : '#0a0a0a',
          letterSpacing: '-0.005em',
          fontVariantNumeric: 'tabular-nums',
        }}>{display}</span>
      )}
    </div>
  )
}

// Read-only display variant.  Used for computed values like Days in Inventory
// and locked values like Date in Stock (which mirrors the editable Purchase
// Date above it).
function AnchorRowReadonly({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
      gap: 12,
      padding: '10px 14px',
      borderRadius: 12,
      background: 'rgba(255, 255, 255, 0.22)',
      border: '1px solid rgba(255, 255, 255, 0.4)',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.55)',
    }}>
      <span style={labelStyle}>{label}</span>
      <span style={{
        fontSize: 14, fontWeight: 700, color: 'rgba(0, 0, 0, 0.6)',
        letterSpacing: '-0.005em',
        fontVariantNumeric: 'tabular-nums',
      }}>{value}</span>
    </div>
  )
}

// Same anchor-row shell but for a dropdown value.  Uses a popover pattern
// instead of an input to stay in the no-native-select rule.
function AnchorRowSelect({ label, value, onChange, options, placeholder }: {
  label: string; value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])
  const selected = options.find(o => o.value === value)
  return (
    <div
      ref={ref}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ position: 'relative' }}
    >
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
          gap: 12,
          padding: '10px 14px',
          borderRadius: 12,
          background: open
            ? 'rgba(255, 255, 255, 0.65)'
            : hover ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.32)',
          border: '1px solid rgba(255, 255, 255, 0.5)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)',
          cursor: 'pointer',
          transition: 'background 180ms ease',
          minHeight: 'auto',
        }}
      >
        <span style={labelStyle}>{label}</span>
        <span style={{
          fontSize: 14, fontWeight: 700, color: selected ? '#0a0a0a' : 'rgba(0,0,0,0.3)',
          letterSpacing: '-0.005em', display: 'inline-flex', alignItems: 'center', gap: 5,
        }}>
          {selected?.label || placeholder || '—'}
          <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" style={{ opacity: 0.5 }}>
            <path d="M3 5l3 3 3-3" />
          </svg>
        </span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 6,
          minWidth: 200, maxHeight: 240,
          borderRadius: 12,
          background: 'rgba(255, 255, 255, 0.78)',
          backdropFilter: 'blur(28px) saturate(180%)',
          WebkitBackdropFilter: 'blur(28px) saturate(180%)',
          border: '1px solid rgba(255, 255, 255, 0.55)',
          boxShadow: '0 20px 50px -12px rgba(31, 38, 135, 0.28), inset 0 1px 0 rgba(255,255,255,0.8)',
          overflow: 'hidden', overflowY: 'auto',
          padding: 4, zIndex: 100,
        }}>
          {options.map(o => {
            const isSelected = o.value === value
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => { onChange(o.value); setOpen(false) }}
                style={{
                  width: '100%', textAlign: 'left',
                  padding: '7px 10px', borderRadius: 8,
                  background: isSelected ? 'rgba(29, 29, 31, 0.08)' : 'transparent',
                  border: 'none',
                  fontSize: 13, fontWeight: isSelected ? 700 : 500,
                  color: '#0a0a0a', cursor: 'pointer', minHeight: 'auto',
                  transition: 'background 120ms ease',
                }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(0,0,0,0.045)' }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
              >
                {o.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Soft floating row container — translucent white over the SubPanel for vertical-stack fields.
function BlueprintRow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: '8px 12px',
      background: 'rgba(255, 255, 255, 0.15)',
      borderRadius: 6,
      border: '1px solid rgba(255, 255, 255, 0.3)',
      boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.45)',
    }}>
      {children}
    </div>
  )
}

// Borderless inline text field — label LEFT, value RIGHT, hover capsule on value.
// Mirrors InlineField but for plain text / numeric / option-pill variants.
function InlineTextField({
  label, value, onChange, onCommit, numeric, placeholder, trailing, options, fullWidth,
}: {
  label: string
  value: string
  onChange?: (v: string) => void
  onCommit?: (v: string) => void | Promise<void>
  numeric?: boolean
  placeholder?: string
  trailing?: React.ReactNode
  options?: { id: string; label: string }[]
  fullWidth?: boolean
}) {
  const isEditable = !!(onChange || onCommit)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [hover, setHover] = useState(false)

  function startEdit() {
    if (!isEditable || options) return
    setDraft(value || '')
    setEditing(true)
  }

  async function commit() {
    setEditing(false)
    const cleaned = numeric ? draft.replace(/[^0-9.]/g, '') : draft
    if (cleaned === (value || '')) return
    if (onCommit) {
      setSaving(true)
      try { await onCommit(cleaned) } finally { setSaving(false) }
    } else if (onChange) {
      onChange(cleaned)
    }
  }

  const lineColor = rowLineColor(editing, hover, isEditable)

  const isPlaceholder = !value
  const display = value || (placeholder ?? '—')

  // Option-pill variant (e.g. New / Used)
  if (options) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        gridColumn: fullWidth ? '1 / -1' : undefined,
      }}>
        <span style={labelStyle}>{label}</span>
        <div style={{
          display: 'inline-flex', gap: 2, padding: 2,
          background: 'rgba(0,0,0,0.04)',
          borderRadius: 999,
          border: '1px solid rgba(0,0,0,0.06)',
        }}>
          {options.map(o => (
            <button
              key={o.id}
              onClick={() => onChange?.(o.id)}
              style={{
                padding: '3px 11px', borderRadius: 999, border: 'none',
                background: o.id === value ? '#ffffff' : 'transparent',
                boxShadow: o.id === value ? '0 1px 2px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.9)' : 'none',
                color: o.id === value ? '#1d1d1f' : 'rgba(0,0,0,0.55)',
                fontSize: 11, fontWeight: 600, letterSpacing: '-0.005em',
                cursor: 'pointer', minHeight: 'auto',
                transition: 'background 200ms ease, color 200ms ease',
              }}
            >{o.label}</button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        gap: 10,
        opacity: saving ? 0.55 : 1,
        gridColumn: fullWidth ? '1 / -1' : undefined,
        minWidth: 0,
        paddingBottom: 7,
        borderBottom: `1px solid ${lineColor}`,
        transition: 'border-color 180ms ease',
      }}>
      <span style={labelStyle}>{label}</span>

      <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8, flexShrink: 0, minWidth: 0 }}>
        {trailing}
        {editing ? (
          <input
            type="text"
            inputMode={numeric ? 'decimal' : 'text'}
            value={draft}
            autoFocus
            size={Math.max(3, draft.length || 1)}
            onChange={(e) => setDraft(numeric ? e.target.value.replace(/[^0-9.]/g, '') : e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') setEditing(false)
            }}
            style={textInputStyle('transparent', false)}
          />
        ) : (
          <button
            onClick={startEdit}
            disabled={!isEditable}
            style={{
              ...valueButtonStyle('transparent', isPlaceholder, isEditable),
              maxWidth: 220,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >{display}</button>
        )}
      </div>
    </div>
  )
}

// US states + DC + Puerto Rico — 52 entries, two-letter codes + full names.
// Used by the Title State dropdown.  Listing here (rather than a shared lib) so
// changes stay local to the title-registration UI for now.
const US_STATES: { value: string; label: string; sub: string }[] = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'],
  ['CA', 'California'], ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'],
  ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'], ['ID', 'Idaho'],
  ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'],
  ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'], ['MD', 'Maryland'],
  ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'],
  ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'],
  ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'], ['NY', 'New York'],
  ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'],
  ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'],
  ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'],
  ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'], ['WV', 'West Virginia'],
  ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
  ['DC', 'District of Columbia'],
  ['PR', 'Puerto Rico'],
].map(([code, name]) => ({ value: code, label: code, sub: name }))

const BRAND_OPTIONS: { value: string; label: string }[] = [
  'Salvage', 'Junk', 'Totaled', 'Lemon', 'Flood', 'Rebuilt',
  'Water Damage', 'Storm Damage', 'Crash Test Vehicle', 'TMU', 'Clean',
  'Police', 'Taxi', 'Hail Damage', 'Fire Damage', 'Vandalism',
  'Stripped', 'Collision', 'Grey Market', 'Recycled',
  'Commercial Vehicle', 'Municipal Vehicle',
].map(v => ({ value: v, label: v }))

const TITLE_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'Received', label: 'Received' },
  { value: 'Not received', label: 'Not received' },
]

// Custom inline dropdown — popover with optional type-ahead filter.
// Matches the InlineTextField visual language (label-left, value-right, hover
// row underline) so the title registration panel reads as one consistent stack.
// Uses a glass popover instead of the native <select> per the project UI standard.
function InlineSelectField({
  label, value, options, onCommit, onChange, placeholder, searchable, fullWidth,
}: {
  label: string
  value: string
  options: { value: string; label: string; sub?: string }[]
  onCommit?: (v: string) => void | Promise<void>
  onChange?: (v: string) => void
  placeholder?: string
  searchable?: boolean
  fullWidth?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [hover, setHover] = useState(false)
  const [saving, setSaving] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') { setOpen(false); setSearch('') } }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  const selected = options.find(o => o.value === value)
  // Preserve legacy values that aren't in the option list — surface them as-is
  // in the trigger so existing data isn't visually lost when the user opens the
  // dropdown.  Picking a new value commits the canonical option.
  const display = selected?.label || value || placeholder || '—'
  const isPlaceholder = !value

  const q = search.trim().toLowerCase()
  const filtered = searchable && q
    ? options.filter(o =>
        o.label.toLowerCase().includes(q) ||
        o.value.toLowerCase().includes(q) ||
        (o.sub?.toLowerCase().includes(q) ?? false))
    : options

  async function pick(v: string) {
    setOpen(false)
    setSearch('')
    if (v === value) return
    if (onCommit) {
      setSaving(true)
      try { await onCommit(v) } finally { setSaving(false) }
    } else if (onChange) {
      onChange(v)
    }
  }

  const lineColor = rowLineColor(open, hover, true)

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        gap: 10,
        opacity: saving ? 0.55 : 1,
        gridColumn: fullWidth ? '1 / -1' : undefined,
        minWidth: 0,
        paddingBottom: 7,
        borderBottom: `1px solid ${lineColor}`,
        transition: 'border-color 180ms ease',
        position: 'relative',
      }}>
      <span style={labelStyle}>{label}</span>
      <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, flexShrink: 0, minWidth: 0 }}>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          style={{
            ...valueButtonStyle('transparent', isPlaceholder, true),
            display: 'inline-flex', alignItems: 'center', gap: 5,
            maxWidth: 220,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {display}
          <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5, marginLeft: 2 }}>
            <path d="M3 5l3 3 3-3" />
          </svg>
        </button>
      </div>

      {open && (
        <div style={{
          position: 'absolute',
          top: '100%', right: 0, marginTop: 6,
          minWidth: 220, maxWidth: 320,
          maxHeight: 280,
          borderRadius: 14,
          background: 'rgba(255, 255, 255, 0.78)',
          backdropFilter: 'blur(28px) saturate(180%)',
          WebkitBackdropFilter: 'blur(28px) saturate(180%)',
          border: '1px solid rgba(255, 255, 255, 0.55)',
          boxShadow: [
            '0 20px 50px -12px rgba(31, 38, 135, 0.28)',
            '0 4px 12px -4px rgba(0, 0, 0, 0.12)',
            'inset 0 1px 0 rgba(255, 255, 255, 0.85)',
          ].join(', '),
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          zIndex: 100,
        }}>
          {searchable && (
            <div style={{ padding: '8px 10px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Type to filter…"
                style={{
                  width: '100%', padding: '6px 10px', borderRadius: 8,
                  border: '1px solid rgba(0,0,0,0.08)', fontSize: 12,
                  background: 'rgba(255,255,255,0.7)', outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          )}
          <div style={{ overflowY: 'auto', flex: 1, padding: 4 }}>
            {filtered.length === 0 ? (
              <p style={{ fontSize: 12, color: 'rgba(0,0,0,0.5)', textAlign: 'center', padding: 16, margin: 0 }}>No match</p>
            ) : (
              filtered.map(opt => {
                const isSelected = opt.value === value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => pick(opt.value)}
                    style={{
                      width: '100%', textAlign: 'left',
                      padding: '7px 10px', borderRadius: 8,
                      background: isSelected ? 'rgba(29, 29, 31, 0.08)' : 'transparent',
                      border: 'none',
                      fontSize: 13,
                      fontWeight: isSelected ? 700 : 500,
                      color: '#0a0a0a',
                      cursor: 'pointer',
                      minHeight: 'auto',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      gap: 10,
                      transition: 'background 120ms ease',
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(0, 0, 0, 0.045)' }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                      <span style={{ fontWeight: 700, fontSize: 12, color: isSelected ? '#0a0a0a' : 'rgba(0,0,0,0.7)' }}>{opt.label}</span>
                      {opt.sub && <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opt.sub}</span>}
                    </span>
                    {isSelected && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0a0a0a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Borderless inline date field with a micro calendar glyph next to the value.
function InlineDateField({
  label, value, onChange,
}: {
  label: string
  value: string
  onChange?: (v: string) => void
}) {
  const isEditable = !!onChange
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [hover, setHover] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  function startEdit() {
    if (!isEditable) return
    setDraft(value || '')
    setEditing(true)
    // Open the native calendar immediately on click instead of waiting for the
    // user to click the small calendar glyph inside the input.  The
    // requestAnimationFrame preserves the user-activation gesture so the
    // browser's showPicker() security check passes.  Typing still works
    // normally if the user prefers entering digits directly.
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (!el) return
      el.focus()
      try { el.showPicker?.() } catch { /* not supported on this browser */ }
    })
  }

  function commit() {
    setEditing(false)
    if (draft !== (value || '') && onChange) onChange(draft)
  }

  const display = value
    ? new Date(value + 'T00:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' })
    : '—'

  const lineColor = rowLineColor(editing, hover, isEditable)

  const isPlaceholder = !value

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        gap: 10, minWidth: 0,
        paddingBottom: 7,
        borderBottom: `1px solid ${lineColor}`,
        transition: 'border-color 180ms ease',
      }}>
      <span style={labelStyle}>{label}</span>
      <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8, flexShrink: 0 }}>
        {editing ? (
          <input
            ref={inputRef}
            type="date"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
            style={textInputStyle('transparent', false)}
          />
        ) : (
          <button
            onClick={startEdit}
            disabled={!isEditable}
            style={valueButtonStyle('transparent', isPlaceholder, isEditable)}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <CalendarMicroIcon />
              {display}
            </span>
          </button>
        )}
      </div>
    </div>
  )
}

// VIN-specific inline field: label left + Auto toggle, value, copy icon all right-aligned.
function VinField({
  vin, decoding, decoded, onDecode, onCommit,
}: {
  vin: string
  decoding: boolean
  decoded: boolean
  onDecode: () => void
  onCommit: (v: string) => void | Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [hover, setHover] = useState(false)
  const [copied, setCopied] = useState(false)

  function startEdit() {
    setDraft(vin)
    setEditing(true)
  }

  async function commit() {
    setEditing(false)
    const v = draft.trim().toUpperCase()
    if (v !== vin) await onCommit(v)
  }

  async function copyVin(e: React.MouseEvent) {
    e.stopPropagation()
    if (!vin) return
    try {
      await navigator.clipboard.writeText(vin)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch { /* clipboard not available */ }
  }

  const lineColor = rowLineColor(editing, hover, true)

  const display = vin || '—'
  const isPlaceholder = !vin

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        gap: 10, minWidth: 0,
        paddingBottom: 7,
        borderBottom: `1px solid ${lineColor}`,
        transition: 'border-color 180ms ease',
      }}>
      <span style={labelStyle}>VIN</span>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, flexShrink: 0, minWidth: 0 }}>
        {/* Auto-decode action pill — runs NHTSA vPIC decode on click */}
        <button
          onClick={(e) => { e.stopPropagation(); onDecode() }}
          disabled={decoding || !vin}
          title={
            decoding ? 'Decoding VIN…'
              : !vin ? 'Enter a VIN first'
              : decoded ? 'Decoded — click to re-run' : 'Auto-decode VIN to fill build fields'
          }
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            padding: '2px 7px', borderRadius: 999,
            background: decoded || decoding ? '#1d1d1f' : 'rgba(0,0,0,0.05)',
            border: '1px solid rgba(0,0,0,0.06)',
            color: decoded || decoding ? '#dffd6e' : 'rgba(0,0,0,0.5)',
            fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
            cursor: decoding ? 'wait' : (!vin ? 'not-allowed' : 'pointer'),
            opacity: !vin ? 0.5 : 1,
            minHeight: 'auto',
            transition: 'background 200ms ease, color 200ms ease',
          }}
        >
          {decoding ? <SparkleIcon spinning /> : decoded ? <CheckMicroIcon /> : null}
          {decoding ? 'Decoding' : 'Auto'}
        </button>

        {/* VIN value / inline editor */}
        {editing ? (
          <input
            type="text"
            value={draft}
            autoFocus
            size={Math.max(3, draft.length || 1)}
            maxLength={17}
            onChange={(e) => setDraft(e.target.value.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/gi, ''))}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') setEditing(false)
            }}
            style={{
              ...textInputStyle('transparent', true),
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              letterSpacing: '0.02em',
            }}
          />
        ) : (
          <button
            onClick={startEdit}
            style={{
              ...valueButtonStyle('transparent', isPlaceholder, true),
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              letterSpacing: '0.02em',
              maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >{display}</button>
        )}

        {/* Copy icon */}
        <button
          onClick={copyVin}
          disabled={!vin}
          title={copied ? 'Copied' : 'Copy VIN'}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 20, height: 20, borderRadius: 6,
            background: copied ? 'rgba(6,165,90,0.12)' : 'transparent',
            border: 'none', cursor: vin ? 'pointer' : 'default',
            color: copied ? '#06a55a' : 'rgba(0,0,0,0.4)',
            opacity: vin ? 1 : 0.3,
            minHeight: 'auto',
            transition: 'background 160ms ease, color 160ms ease',
          }}
          onMouseEnter={(e) => { if (vin && !copied) e.currentTarget.style.color = 'rgba(0,0,0,0.7)' }}
          onMouseLeave={(e) => { if (!copied) e.currentTarget.style.color = 'rgba(0,0,0,0.4)' }}
        >
          {copied ? <CheckMicroIcon /> : <CopyMicroIcon />}
        </button>
      </div>
    </div>
  )
}

// Live-listing banner — left URL, right "View Website" pill with arrow.
function LiveLinkBanner({ url }: { url: string }) {
  const [hovered, setHovered] = useState(false)
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        gap: 14, padding: '14px 16px',
        background: hovered ? 'rgba(255, 255, 255, 0.6)' : 'rgba(255, 255, 255, 0.45)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderRadius: 14,
        border: '1px solid rgba(255, 255, 255, 0.55)',
        boxShadow: hovered
          ? '0 10px 30px -10px rgba(31, 38, 135, 0.18), inset 0 1px 0 rgba(255,255,255,0.85)'
          : '0 4px 14px -6px rgba(31, 38, 135, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.7)',
        textDecoration: 'none', color: 'inherit',
        transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
        transition: 'transform 220ms cubic-bezier(0.25, 0.46, 0.45, 0.94), box-shadow 220ms ease, background 220ms ease',
        minWidth: 0,
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.14em',
          textTransform: 'uppercase', color: 'rgba(0,0,0,0.5)',
          marginBottom: 4,
          display: 'inline-flex', alignItems: 'center', gap: 5,
        }}>
          <span aria-hidden style={{
            width: 6, height: 6, borderRadius: '50%',
            background: '#06a55a',
            boxShadow: '0 0 6px rgba(6,165,90,0.6)',
          }} />
          Live on Web
        </p>
        <p style={{
          fontSize: 12, fontWeight: 500,
          color: 'rgba(0,0,0,0.65)',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          letterSpacing: '-0.005em',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{url}</p>
      </div>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '7px 14px', borderRadius: 999,
        background: '#1d1d1f',
        color: '#dffd6e',
        fontSize: 11, fontWeight: 700, letterSpacing: '-0.005em',
        whiteSpace: 'nowrap', flexShrink: 0,
        boxShadow: hovered
          ? '0 4px 12px -2px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.15)'
          : '0 2px 6px -2px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.1)',
        transition: 'box-shadow 220ms ease',
      }}>
        View Website
        <ArrowMicroIcon />
      </span>
    </a>
  )
}

// ─── Studio styling helpers ────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 500,
  color: 'rgba(0,0,0,0.5)',
  letterSpacing: '-0.005em',
  whiteSpace: 'nowrap',
  overflow: 'hidden', textOverflow: 'ellipsis',
  minWidth: 0,
}

// Row-level baseline: a hairline that runs the full width of the row (label + value)
// so the value visually connects to its label across the gap.  Always faintly visible
// at rest, darkens on hover (editable rows only), solidifies further while editing.
// The value button/input itself carries no border — the row line is the single
// connecting element.
function rowLineColor(editing: boolean, hover: boolean, isEditable: boolean): string {
  if (editing) return 'rgba(0, 0, 0, 0.42)'
  if (hover && isEditable) return 'rgba(0, 0, 0, 0.16)'
  return 'rgba(0, 0, 0, 0.07)'
}

function valueButtonStyle(_underline: string, isPlaceholder: boolean, isEditable: boolean): React.CSSProperties {
  return {
    background: 'transparent',
    border: 'none',
    padding: '1px 0',
    margin: 0,
    borderRadius: 0,
    fontSize: 14, fontWeight: 700, letterSpacing: '-0.005em',
    color: isPlaceholder ? 'rgba(0,0,0,0.3)' : '#0a0a0a',
    fontVariantNumeric: 'tabular-nums',
    cursor: isEditable ? 'pointer' : 'default',
    minHeight: 'auto',
  }
}

function textInputStyle(_underline: string, mono: boolean): React.CSSProperties {
  return {
    border: 'none', outline: 'none',
    background: 'transparent',
    padding: '1px 0',
    margin: 0,
    borderRadius: 0,
    fontSize: 14, fontWeight: 700, letterSpacing: '-0.005em',
    color: '#0a0a0a',
    textAlign: 'right',
    fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : 'inherit',
    fontVariantNumeric: 'tabular-nums',
    width: 'auto',
    boxSizing: 'content-box',
  }
}

// ─── Studio micro-icons ────────────────────────────────────────────

function CalendarMicroIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.45 }}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  )
}

function CopyMicroIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function CheckMicroIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function ArrowMicroIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  )
}

// ─── Files Vault (internal document storage) ────────────────────────

const FILE_CATEGORIES = [
  'Signed Contract',
  'Purchase Receipt',
  'Title Paperwork',
  'Other',
] as const

function FilesVault({ vehicleId, media, onChange, currentUserId, isAdmin }: {
  vehicleId: string
  media: MediaAsset[]
  onChange: () => void | Promise<void>
  currentUserId: string | null
  isAdmin: boolean
}) {
  const [category, setCategory] = useState<string>(FILE_CATEGORIES[0])
  const [isUploading, setIsUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [err, setErr] = useState<string | null>(null)

  const files = media.filter(m => m.type === 'doc')

  async function uploadFile(file: File) {
    setErr(null)
    setIsUploading(true)
    setProgress(0)
    try {
      const presignRes = await fetch('/api/media/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicleId, filename: file.name, contentType: file.type }),
      })
      if (!presignRes.ok) throw new Error(`Presign failed (${presignRes.status})`)
      const { uploadUrl, r2Key } = await presignRes.json()

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100))
        })
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve()
          else reject(new Error(`R2 upload failed (${xhr.status})`))
        })
        xhr.addEventListener('error', () => reject(new Error('R2 network error')))
        xhr.open('PUT', uploadUrl)
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
        xhr.send(file)
      })

      const confirmRes = await fetch('/api/media/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleId, r2Key, type: 'doc',
          contentType: file.type, sizeBytes: file.size, filename: file.name,
          caption: category,
        }),
      })
      if (!confirmRes.ok) throw new Error(`Confirm failed (${confirmRes.status})`)
      await onChange()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setIsUploading(false)
      setProgress(0)
    }
  }

  async function handleFiles(filesList: FileList | null) {
    if (!filesList || filesList.length === 0) return
    for (const f of Array.from(filesList)) {
      await uploadFile(f)
    }
  }

  async function deleteFile(id: string) {
    if (!confirm('Delete this file from the vault?')) return
    await fetch(`/api/media/${id}`, { method: 'DELETE' })
    await onChange()
  }

  return (
    <GlassCard padding={24}>
      <GlassEyebrow
        label="Files Vault"
        subtitle={files.length === 0
          ? 'Internal documents — hidden from public inventory'
          : `${files.length} internal document${files.length === 1 ? '' : 's'} · hidden from public inventory`}
      />

      <FilesTable
        files={files}
        onDelete={deleteFile}
        isAdmin={isAdmin}
        currentUserId={currentUserId}
      />

      <FileDropzone
        category={category}
        onCategoryChange={setCategory}
        onFiles={handleFiles}
        isUploading={isUploading}
        progress={progress}
        err={err}
      />
    </GlassCard>
  )
}

function FilesTable({ files, onDelete, isAdmin, currentUserId }: {
  files: MediaAsset[]
  onDelete: (id: string) => void
  isAdmin: boolean
  currentUserId: string | null
}) {
  if (files.length === 0) {
    return (
      <div style={{
        padding: '22px 16px', marginBottom: 22,
        borderRadius: 12,
        background: 'rgba(0,0,0,0.025)',
        color: 'rgba(0,0,0,0.5)', fontSize: 13, fontStyle: 'italic',
        textAlign: 'center',
      }}>
        No files in the vault yet. Drop one below to get started.
      </div>
    )
  }

  const cols = 'minmax(0, 2.2fr) minmax(0, 1.2fr) minmax(0, 1.2fr) minmax(0, 1fr) 32px'

  return (
    <div style={{ marginBottom: 22 }}>
      {/* Header */}
      <div style={{
        display: 'grid', gridTemplateColumns: cols, gap: 14,
        padding: '10px 14px', marginBottom: 4,
      }}>
        {['File Name', 'Category', 'Uploaded By', 'Date Uploaded'].map((label) => (
          <span key={label} style={{
            fontSize: 10, fontWeight: 700,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            color: 'rgba(0,0,0,0.45)',
          }}>{label}</span>
        ))}
        <span />
      </div>

      {/* Rows */}
      <div style={{ borderRadius: 12, overflow: 'hidden' }}>
        {files.map((f, i) => (
          <FileRow
            key={f.id}
            file={f}
            alt={i % 2 === 1}
            canDelete={isAdmin || f.uploadedBy?.id === currentUserId}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  )
}

function FileRow({ file, alt, canDelete, onDelete }: {
  file: MediaAsset
  alt: boolean
  canDelete: boolean
  onDelete: (id: string) => void
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 2.2fr) minmax(0, 1.2fr) minmax(0, 1.2fr) minmax(0, 1fr) 32px',
        gap: 14,
        padding: '14px',
        background: hovered
          ? 'rgba(0, 113, 227, 0.04)'
          : alt ? 'rgba(0,0,0,0.025)' : 'transparent',
        alignItems: 'center',
        transition: 'background 160ms ease',
      }}
    >
      <a
        href={file.url}
        target="_blank"
        rel="noreferrer"
        title={file.filename || 'Open file'}
        style={{
          fontSize: 13, fontWeight: 600,
          color: '#1d1d1f', textDecoration: 'none',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {file.filename || 'Unnamed file'}
      </a>
      <span style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
        padding: '3px 8px', borderRadius: 999,
        background: 'rgba(0,0,0,0.06)', color: 'rgba(0,0,0,0.62)',
        justifySelf: 'start',
      }}>
        {file.caption || 'Other'}
      </span>
      <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {file.uploadedBy?.name || 'Unknown'}
      </span>
      <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.6)' }}>
        {fmtDate(file.uploadedAt)}
      </span>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        {canDelete && (
          <button
            onClick={() => onDelete(file.id)}
            aria-label="Delete file"
            title="Delete"
            style={{
              width: 24, height: 24, borderRadius: 6,
              background: hovered ? 'rgba(220, 38, 38, 0.1)' : 'transparent',
              border: 'none', cursor: 'pointer',
              color: hovered ? '#dc2626' : 'rgba(0,0,0,0)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              minHeight: 'auto',
              transition: 'background 160ms ease, color 160ms ease',
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}

function FileDropzone({ category, onCategoryChange, onFiles, isUploading, progress, err }: {
  category: string
  onCategoryChange: (c: string) => void
  onFiles: (files: FileList | null) => void
  isUploading: boolean
  progress: number
  err: string | null
}) {
  const [isDragOver, setIsDragOver] = useState(false)

  function onDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!isDragOver) setIsDragOver(true)
  }
  function onDragLeave(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFiles(e.dataTransfer.files)
    }
  }

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{
        position: 'relative',
        padding: '36px 24px',
        background: isDragOver
          ? 'rgba(0, 113, 227, 0.07)'
          : 'rgba(255, 255, 255, 0.45)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderRadius: 16,
        border: isDragOver
          ? '1.5px dashed rgba(0, 113, 227, 0.65)'
          : '1.5px dashed rgba(0, 0, 0, 0.18)',
        boxShadow: [
          '0 4px 16px -6px rgba(31, 38, 135, 0.08)',
          'inset 0 1px 0 rgba(255, 255, 255, 0.75)',
        ].join(', '),
        textAlign: 'center',
        transition: 'background 200ms ease, border-color 200ms ease',
      }}
    >
      <CloudUploadIcon />

      <p style={{
        fontSize: 16, fontWeight: 700, color: '#1d1d1f',
        letterSpacing: '-0.01em', marginTop: 14,
      }}>
        Drop your business files here, or{' '}
        <label style={{
          color: '#0071e3', cursor: isUploading ? 'wait' : 'pointer',
          textDecoration: 'underline', textUnderlineOffset: 3,
        }}>
          Browse
          <input
            type="file"
            multiple
            disabled={isUploading}
            onChange={(e) => { onFiles(e.target.files); e.currentTarget.value = '' }}
            style={{ display: 'none' }}
          />
        </label>
      </p>

      <div style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, color: 'rgba(0,0,0,0.5)',
          textTransform: 'uppercase', letterSpacing: '0.1em',
        }}>Category</span>
        <select
          value={category}
          onChange={(e) => onCategoryChange(e.target.value)}
          style={{
            padding: '6px 32px 6px 12px',
            borderRadius: 999,
            border: '1px solid rgba(0,0,0,0.12)',
            background: 'rgba(255,255,255,0.85)',
            fontSize: 12, fontWeight: 600, color: '#1d1d1f',
            cursor: 'pointer',
            appearance: 'none',
            WebkitAppearance: 'none',
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6' fill='none'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%231d1d1f' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 10px center',
          }}
        >
          {FILE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <p style={{
        marginTop: 16, fontSize: 11, color: 'rgba(0,0,0,0.45)',
        fontWeight: 500, letterSpacing: '-0.005em',
      }}>
        Supported: PDF, DOC, DOCX, XLS, XLSX, JPG, PNG · Max 25MB per file
      </p>
      <p style={{
        marginTop: 4, fontSize: 11, color: 'rgba(0,0,0,0.45)',
        fontWeight: 500, fontStyle: 'italic',
      }}>
        Internal storage only — strictly hidden from public inventory pages.
      </p>

      {isUploading && (
        <div style={{
          marginTop: 16, padding: '8px 14px', borderRadius: 999,
          background: 'rgba(0, 113, 227, 0.08)',
          color: '#0071e3', fontSize: 12, fontWeight: 600,
          display: 'inline-flex', alignItems: 'center', gap: 8,
        }}>
          Uploading… {progress}%
        </div>
      )}
      {err && (
        <p style={{
          marginTop: 16, color: '#d70015', fontSize: 12,
          padding: '6px 12px', background: 'rgba(255, 59, 48, 0.08)',
          borderRadius: 8, display: 'inline-block',
        }}>{err}</p>
      )}
    </div>
  )
}

function CloudUploadIcon() {
  return (
    <div style={{
      display: 'inline-flex', padding: 14, borderRadius: '50%',
      background: 'rgba(0,113,227,0.06)',
      boxShadow: 'inset 0 0 0 1px rgba(0,113,227,0.1)',
    }}>
      <svg width="32" height="32" viewBox="0 0 48 48" fill="none" stroke="#0071e3" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 38a8 8 0 0 1-1-15.9 12 12 0 0 1 22-7.2 9 9 0 0 1 4 17.1" />
        <path d="M24 26v14" />
        <path d="M18 32l6-6 6 6" />
      </svg>
    </div>
  )
}

// Full-screen lightbox with arrow-key navigation
function MediaLightbox({
  items, startIdx, onClose, onChangeIdx,
}: {
  items: MediaAsset[]
  startIdx: number
  onClose: () => void
  onChangeIdx: (idx: number) => void
}) {
  const current = items[startIdx]
  const hasPrev = startIdx > 0
  const hasNext = startIdx < items.length - 1

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && hasPrev) onChangeIdx(startIdx - 1)
      if (e.key === 'ArrowRight' && hasNext) onChangeIdx(startIdx + 1)
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [startIdx, hasPrev, hasNext, onClose, onChangeIdx])

  if (!current) return null

  const isVideo = isVideoType(current.type)
  const label = MEDIA_TYPE_LABELS[current.type] || current.type

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.92)',
        backdropFilter: 'blur(40px)',
        zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 40,
        animation: 'fadeIn 200ms ease',
      }}
    >
      {/* Top bar */}
      <div style={{
        position: 'absolute', top: 20, left: 20, right: 20,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        color: '#fff', pointerEvents: 'none',
      }}>
        <div style={{ pointerEvents: 'auto' }}>
          <p style={{
            fontSize: 11, fontWeight: 700, letterSpacing: '0.12em',
            textTransform: 'uppercase', opacity: 0.6, marginBottom: 2,
          }}>{label}</p>
          <p style={{ fontSize: 14, fontWeight: 500 }}>
            {startIdx + 1} of {items.length}
          </p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onClose() }}
          style={{
            background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff',
            width: 36, height: 36, borderRadius: '50%',
            fontSize: 18, lineHeight: 1, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(20px)', pointerEvents: 'auto',
            minHeight: 'auto',
          }}
        >×</button>
      </div>

      {/* Previous */}
      {hasPrev && (
        <button
          onClick={(e) => { e.stopPropagation(); onChangeIdx(startIdx - 1) }}
          style={{
            position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)',
            background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff',
            width: 48, height: 48, borderRadius: '50%',
            fontSize: 22, lineHeight: 1, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(20px)', minHeight: 'auto',
          }}
        >‹</button>
      )}

      {/* Next */}
      {hasNext && (
        <button
          onClick={(e) => { e.stopPropagation(); onChangeIdx(startIdx + 1) }}
          style={{
            position: 'absolute', right: 20, top: '50%', transform: 'translateY(-50%)',
            background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff',
            width: 48, height: 48, borderRadius: '50%',
            fontSize: 22, lineHeight: 1, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(20px)', minHeight: 'auto',
          }}
        >›</button>
      )}

      {/* Image / Video */}
      <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: '90vw', maxHeight: '85vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {isVideo ? (
          <video
            src={current.url}
            controls
            autoPlay
            style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: 8 }}
          />
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={current.url}
            alt={current.caption || ''}
            style={{ maxWidth: '100%', maxHeight: '85vh', objectFit: 'contain', borderRadius: 8 }}
          />
        )}
      </div>

      {/* Caption */}
      {current.caption && (
        <div style={{
          position: 'absolute', bottom: 30, left: '50%', transform: 'translateX(-50%)',
          color: '#fff', fontSize: 14, textAlign: 'center', pointerEvents: 'none',
          padding: '8px 16px', background: 'rgba(0,0,0,0.5)', borderRadius: 8,
          backdropFilter: 'blur(20px)', maxWidth: '80vw',
        }}>{current.caption}</div>
      )}
    </div>
  )
}
