'use client'

import { useEffect, useState } from 'react'
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
  currentAssignee?: { id: string; name: string } | null
}

type ActivityEvent = {
  id: string
  entityType: string
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
  const [activeSection, setActiveSection] = useState<'all' | 'inventory' | 'recon' | 'media' | 'activity'>('all')
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
  const profit = vehicle.askingPrice !== null && vehicle.vehicleCost !== null ? vehicle.askingPrice - vehicle.vehicleCost : null
  const margin = profit !== null && vehicle.askingPrice && vehicle.askingPrice > 0 ? (profit / vehicle.askingPrice) * 100 : null
  const flooring = computeFlooring(vehicle)

  const totalCostAddsCents = costAdds.reduce((s, c) => s + c.amountCents, 0)
  const totalCostAdds = totalCostAddsCents / 100
  const trueCost = (vehicle.vehicleCost || 0) + totalCostAdds

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
          {/* Left: photo box */}
          {(() => {
            const heroPhoto = media.find((m) => !isVideoType(m.type) && m.type !== 'doc')
            return heroPhoto ? (
              <button
                type="button"
                onClick={() => setActiveSection('media')}
                title="View all media"
                style={{
                  aspectRatio: '4/3',
                  background: 'transparent',
                  borderRadius: 16,
                  overflow: 'hidden',
                  border: '1px solid rgba(255, 255, 255, 0.4)',
                  padding: 0,
                  cursor: 'pointer',
                  minHeight: 'auto',
                  boxShadow: '0 8px 24px -8px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.5)',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={heroPhoto.url} alt={heroPhoto.caption || ''} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setActiveSection('media')}
                title="Upload photos"
                style={{
                  aspectRatio: '4/3',
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
                  minHeight: 'auto',
                  boxShadow: [
                    '0 8px 24px -8px rgba(0, 0, 0, 0.35)',
                    'inset 0 1px 0 rgba(255, 255, 255, 0.08)',
                    'inset 0 -1px 0 rgba(0, 0, 0, 0.3)',
                  ].join(', '),
                  transition: 'transform 250ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                <GlassMetric label="Vehicle Cost" value={money(vehicle.vehicleCost)} />
                <GlassMetric label="Asking" value={money(vehicle.askingPrice)} />
                <GlassSpread cost={vehicle.vehicleCost} asking={vehicle.askingPrice} />
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

      {/* ═══ Filter chips ═══ */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, overflowX: 'auto' }}>
        {(['all', 'inventory', 'recon', 'media', 'activity'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setActiveSection(s)}
            style={{
              padding: '8px 16px',
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              border: '1px solid var(--border)',
              background: activeSection === s ? '#1a1a1a' : '#ffffff',
              color: activeSection === s ? '#dffd6e' : 'var(--text-secondary)',
              textTransform: 'capitalize',
              whiteSpace: 'nowrap',
              minHeight: 'auto',
            }}
          >
            {s === 'recon' && vehicle.stages && vehicle.stages.length > 0
              ? `Recon (${vehicle.stages.length})`
              : s === 'media' && media.length > 0
                ? `Media (${media.length})`
                : s}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, alignItems: 'start' }}>

        {/* Cost Adds (money — gated to admin / sales_manager) */}
        {canSeeMoney && (activeSection === 'all' || activeSection === 'inventory') && (
          <div style={{
            background: '#ffffff', border: '1px solid var(--border)',
            borderRadius: 16, padding: 20, boxShadow: 'var(--shadow-sm)', gridColumn: '1 / -1',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em' }}>Cost Adds</h3>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {costAdds.length === 0 ? 'No cost adds yet — track recon parts, transport, packs, etc.' : `${costAdds.length} item${costAdds.length === 1 ? '' : 's'} · rolls into true cost`}
                </p>
              </div>
              <button onClick={() => setShowAddCost(true)} style={v2Btn('primary')}>+ Add Cost</button>
            </div>

            {costAdds.length > 0 && (
              <>
                {costAdds.map((c) => {
                  const canDelete = isAdmin || c.addedBy?.id === currentUserId
                  return (
                    <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)', gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 2 }}>
                          <span style={{
                            fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
                            padding: '2px 6px', background: '#f0f0ec', color: 'var(--text-secondary)', borderRadius: 4,
                          }}>{COST_KIND_LABELS[c.kind] || c.kind}</span>
                          {c.description && <span style={{ fontSize: 13, fontWeight: 600 }}>{c.description}</span>}
                        </div>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {fmtDate(c.addedAt)}
                          {c.vendor && ` · ${c.vendor}`}
                          {c.addedBy && ` · added by ${c.addedBy.name}`}
                        </p>
                      </div>
                      <span style={{ fontSize: 14, fontWeight: 700, flexShrink: 0 }}>{money(c.amountCents / 100)}</span>
                      {canDelete && (
                        <button
                          onClick={() => deleteCostAdd(c.id)}
                          disabled={busy}
                          style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: 'var(--text-muted)', padding: '4px 8px', minHeight: 'auto' }}
                          title="Delete"
                        >×</button>
                      )}
                    </div>
                  )
                })}
              </>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0 4px', borderTop: '2px solid #1a1a1a', marginTop: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>True cost (vehicle + adds)</span>
              <span style={{ fontSize: 16, fontWeight: 800 }}>{money(trueCost)}</span>
            </div>
          </div>
        )}

        {/* Flooring (money — gated to admin / sales_manager) */}
        {canSeeMoney && (activeSection === 'all' || activeSection === 'inventory') && (
          <div style={{
            background: '#ffffff', border: '1px solid var(--border)',
            borderRadius: 16, padding: 20, boxShadow: 'var(--shadow-sm)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em' }}>Flooring</h3>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {flooring ? `${flooring.lender} · ${flooring.dailyRate}%/day` : 'No flooring on this vehicle'}
                </p>
              </div>
              {isAdmin && (
                <button onClick={() => setShowSetFlooring(true)} style={v2Btn(flooring ? 'ghost' : 'primary')}>
                  {flooring ? 'Edit' : '+ Set Flooring'}
                </button>
              )}
            </div>
            {flooring ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <V2StatMini label="Principal" value={money(flooring.principal)} />
                  <V2StatMini label="Accrued" value={money(flooring.accruedInterest)} sub={`${flooring.daysHeld}d held`} />
                  <V2StatMini label="Cost/Day" value={money(flooring.costPerDay)} accent="negative" />
                  <V2StatMini label="Payoff Today" value={money(flooring.payoff)} accent="negative" />
                </div>
                {vehicle.floorAdvanceDate && (
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12 }}>
                    Advanced {fmtDate(vehicle.floorAdvanceDate)} · status: {flooring.status}
                  </p>
                )}
              </>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                {vehicle.purchaseType === 'CONSIGNMENT'
                  ? 'Consignment vehicles are not floored.'
                  : isAdmin
                    ? 'Click "Set Flooring" if this vehicle is on a floorplan.'
                    : 'Not on a floorplan.'}
              </p>
            )}
          </div>
        )}

        {/* Title & Location */}
        {(activeSection === 'all' || activeSection === 'inventory') && (
          <V2Card title="Title & Location">
            <V2Row label="Title Status" value={vehicle.titleStatus || '—'} />
            <V2Row label="Location" value={vehicle.location || '—'} />
            <V2Row label="Inventory Status" value={vehicle.inventoryStatus || '—'} />
            <V2Row label="Purchase Type" value={vehicle.purchaseType || '—'} />
          </V2Card>
        )}

        {/* Source */}
        {(activeSection === 'all' || activeSection === 'inventory') && (vehicle.purchasedFrom || vehicle.dateInStock) && (
          <V2Card title="Source">
            <V2Row label="Purchased From" value={vehicle.purchasedFrom || '—'} />
            <V2Row label="Date in Stock" value={fmtDate(vehicle.dateInStock)} />
            {vehicle.consignmentCommissionPct !== null && (
              <V2Row label="Consignment %" value={`${vehicle.consignmentCommissionPct}%`} />
            )}
          </V2Card>
        )}

        {/* Description */}
        {(activeSection === 'all' || activeSection === 'inventory') && vehicle.vehicleInfo && (
          <V2Card title="Description" wide>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{vehicle.vehicleInfo}</p>
          </V2Card>
        )}

        {/* ═══ RECON — expandable stages ═══ */}
        {(activeSection === 'all' || activeSection === 'recon') && (
          <V2Card
            title="Recon History"
            subtitle={vehicle.stages && vehicle.stages.length > 0 ? `${vehicle.stages.length} stage${vehicle.stages.length === 1 ? '' : 's'} · current: ${vehicle.status}` : 'No recon stages yet'}
            wide
          >
            {vehicle.stages && vehicle.stages.length > 0 ? (
              vehicle.stages.map((s) => {
                const isActive = s.status !== 'done' && s.status !== 'skipped' && !s.completedAt
                const isExpanded = expandedStageId === s.id
                const checkedCount = s.checklist?.filter(c => c.done).length || 0
                const totalCount = s.checklist?.length || 0
                const stagePartsOrdered = parts.filter(p => p.sourceStageId === s.id)

                return (
                  <div key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    {/* Stage header — clickable */}
                    <button
                      onClick={() => setExpandedStageId(isExpanded ? null : s.id)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        gap: 12,
                        alignItems: 'center',
                        padding: '14px 0',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        textAlign: 'left',
                        minHeight: 'auto',
                      }}
                    >
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%',
                        background: isActive ? '#1a1a1a' : (s.status === 'done' ? '#dffd6e' : 'var(--border)'),
                        color: isActive ? '#dffd6e' : (s.status === 'done' ? '#1a1a1a' : 'var(--text-muted)'),
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 700, flexShrink: 0,
                      }}>
                        {s.status === 'done' || s.completedAt ? '✓' : isActive ? '▶' : '·'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                          <span style={{ fontSize: 15, fontWeight: 700, textTransform: 'capitalize' }}>
                            {STAGE_LABEL[s.stage] || s.stage}
                            {s.scopeName && <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 6, fontWeight: 500 }}>· {s.scopeName}</span>}
                          </span>
                          <V2StageStatus value={s.status} active={isActive} />
                        </div>
                        <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 12, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                          {s.assignee && <span>👤 {s.assignee.name}</span>}
                          <span>📅 {fmtDate(s.startedAt)}{s.completedAt ? ` → ${fmtDate(s.completedAt)}` : ''}</span>
                          {totalCount > 0 && <span>☑ {checkedCount}/{totalCount}</span>}
                          {stagePartsOrdered.length > 0 && <span>🔧 {stagePartsOrdered.length} part{stagePartsOrdered.length === 1 ? '' : 's'}</span>}
                          {s.estimatedHours && <span>⏱ {s.estimatedHours}h</span>}
                        </div>
                      </div>
                      <span style={{ fontSize: 14, color: 'var(--text-muted)', flexShrink: 0 }}>
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
              })
            ) : (
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                This vehicle has no recon stages yet. {vehicle.status === 'inventory_only' && '(Inventory-only — never started recon.)'}
              </p>
            )}
          </V2Card>
        )}

        {/* ═══ MEDIA ═══ */}
        {(activeSection === 'all' || activeSection === 'media') && (
          <MediaCard
            vehicleId={vehicle.id}
            media={media}
            onChange={refreshMedia}
            currentUserId={currentUserId}
            isAdmin={isAdmin}
          />
        )}

        {/* Activity */}
        {(activeSection === 'all' || activeSection === 'activity') && (
          <V2Card title="Activity" subtitle={`${activity.length} events`} wide>
            {activity.slice(0, 15).map((e) => (
              <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{e.action.replace(/_/g, ' ')}</span>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {e.entityType} · {e.actor?.name || 'system'}
                  </p>
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{fmtDateTime(e.createdAt)}</span>
              </div>
            ))}
            {activity.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No activity yet.</p>}
          </V2Card>
        )}

        {/* Notes */}
        {vehicle.notes && (activeSection === 'all') && (
          <V2Card title="Notes" wide>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, fontStyle: 'italic' }}>{vehicle.notes}</p>
          </V2Card>
        )}
      </div>

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

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: 'positive' | 'negative' }) {
  const valueColor = accent === 'positive' ? '#16a34a' : accent === 'negative' ? '#ef4444' : 'var(--text-primary)'
  return (
    <div style={{ background: '#f8f8f5', borderRadius: 12, padding: '12px 14px' }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 20, fontWeight: 800, color: valueColor, letterSpacing: '-0.02em' }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</p>}
    </div>
  )
}

function V2Chip({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return (
    <span style={{
      fontSize: 12,
      padding: '4px 10px',
      background: '#f0f0ec',
      color: 'var(--text-secondary)',
      borderRadius: 999,
      fontWeight: 500,
      fontFamily: mono ? 'ui-monospace, monospace' : undefined,
    }}>{children}</span>
  )
}

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

// Spread tile with three micro-metrics: Price · Est. Profit · Water
function GlassSpread({ cost, asking }: { cost: number | null; asking: number | null }) {
  const m = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
  const price = asking
  const estProfit = asking !== null && cost !== null ? Math.max(0, asking - cost) : null
  const water = asking !== null && cost !== null ? Math.max(0, cost - asking) : null

  const MicroMetric = ({ label, value, color }: { label: string; value: string; color: string }) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <p style={{
        fontSize: 9, fontWeight: 700, color: 'rgba(0,0,0,0.42)',
        textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3,
        whiteSpace: 'nowrap',
      }}>{label}</p>
      <p style={{
        fontSize: 13, fontWeight: 700, color,
        letterSpacing: '-0.015em', lineHeight: 1.15,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{value}</p>
    </div>
  )

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
        textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10,
      }}>Spread</p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <MicroMetric
          label="Price"
          value={price !== null ? m(price) : '—'}
          color="#0a0a0a"
        />
        <div style={{ width: 1, alignSelf: 'stretch', background: 'rgba(0,0,0,0.06)' }} />
        <MicroMetric
          label="Est. Profit"
          value={estProfit !== null ? m(estProfit) : '—'}
          color="#06a55a"
        />
        <div style={{ width: 1, alignSelf: 'stretch', background: 'rgba(0,0,0,0.06)' }} />
        <MicroMetric
          label="Water"
          value={water !== null ? m(water) : '—'}
          color="#dc2626"
        />
      </div>
    </div>
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

function V2Card({ title, subtitle, children, action, wide }: { title: string; subtitle?: string; children: React.ReactNode; action?: string; wide?: boolean }) {
  return (
    <div style={{
      background: '#ffffff',
      border: '1px solid var(--border)',
      borderRadius: 16,
      padding: 20,
      boxShadow: 'var(--shadow-sm)',
      gridColumn: wide ? '1 / -1' : undefined,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em' }}>{title}</h3>
          {subtitle && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{subtitle}</p>}
        </div>
        {action && <button style={v2Btn('ghost')}>{action}</button>}
      </div>
      {children}
    </div>
  )
}

function V2Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '8px 0', borderBottom: '1px solid var(--border)', gap: 12 }}>
      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 600, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

function V2StatMini({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: 'positive' | 'negative' }) {
  const valueColor = accent === 'positive' ? '#16a34a' : accent === 'negative' ? '#ef4444' : 'var(--text-primary)'
  return (
    <div style={{ background: '#f8f8f5', borderRadius: 10, padding: '10px 12px' }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>{label}</p>
      <p style={{ fontSize: 16, fontWeight: 700, color: valueColor }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{sub}</p>}
    </div>
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

// ─── Media Card (sectioned by type) ──────────────────────────────────

const MEDIA_TYPE_ORDER = ['exterior', 'interior', 'undercarriage', 'walkaround_video', 'turntable_video', 'doc', 'other'] as const


function MediaCard({
  vehicleId,
  media,
  onChange,
  currentUserId,
  isAdmin,
}: {
  vehicleId: string
  media: MediaAsset[]
  onChange: () => void
  currentUserId: string | null
  isAdmin: boolean
}) {
  const [uploadingType, setUploadingType] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [err, setErr] = useState<string | null>(null)
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)

  // Flat list of viewable items (photos + videos) in display order, for lightbox nav
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
    <div style={{
      background: '#ffffff',
      borderRadius: 20,
      padding: '24px 24px 8px',
      gridColumn: '1 / -1',
      border: '1px solid rgba(0,0,0,0.05)',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      <div style={{ marginBottom: 8 }}>
        <h3 style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em', color: '#1d1d1f' }}>Media</h3>
        <p style={{ fontSize: 13, color: '#86868b', marginTop: 4, fontWeight: 400 }}>
          {media.length === 0 ? 'Drop photos and videos into any section below' : `${media.length} item${media.length === 1 ? '' : 's'}`}
        </p>
      </div>

      {err && (
        <p style={{
          color: '#d70015', fontSize: 13, marginTop: 12, marginBottom: 4,
          padding: '8px 12px', background: '#fff1f0', borderRadius: 8,
        }}>{err}</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {MEDIA_TYPE_ORDER.map((type) => {
          const items = media.filter(m => m.type === type)
          const isUploading = uploadingType === type
          const acceptType = type === 'doc' ? '' : type.endsWith('_video') ? 'video/*' : 'image/*'

          return (
            <MediaSection
              key={type}
              type={type}
              items={items}
              isUploading={isUploading}
              uploadProgress={progress}
              acceptType={acceptType}
              onFiles={(files) => handleFiles(files, type)}
              onDelete={deleteAsset}
              onOpenLightbox={(asset) => {
                const idx = viewable.findIndex(v => v.id === asset.id)
                if (idx >= 0) setLightboxIdx(idx)
              }}
              currentUserId={currentUserId}
              isAdmin={isAdmin}
            />
          )
        })}
      </div>

      {/* Lightbox */}
      {lightboxIdx !== null && viewable[lightboxIdx] && (
        <MediaLightbox
          items={viewable}
          startIdx={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
          onChangeIdx={setLightboxIdx}
        />
      )}
    </div>
  )
}

function MediaSection({
  type, items, isUploading, uploadProgress, acceptType, onFiles, onDelete, onOpenLightbox, currentUserId, isAdmin,
}: {
  type: string
  items: MediaAsset[]
  isUploading: boolean
  uploadProgress: number
  acceptType: string
  onFiles: (files: FileList | null) => void
  onDelete: (id: string) => void
  onOpenLightbox: (asset: MediaAsset) => void
  currentUserId: string | null
  isAdmin: boolean
}) {
  const isEmpty = items.length === 0
  const isVideoSection = isVideoType(type)
  const isDocSection = type === 'doc'
  const label = MEDIA_TYPE_LABELS[type] || type
  const [isDragOver, setIsDragOver] = useState(false)

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!isDragOver) setIsDragOver(true)
  }
  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFiles(e.dataTransfer.files)
    }
  }

  // EMPTY: minimal one-line — Apple Finder style
  if (isEmpty) {
    return (
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 0', gap: 10, flexWrap: 'wrap',
          borderBottom: '1px solid rgba(0,0,0,0.06)',
          background: isDragOver ? 'rgba(0,122,255,0.05)' : 'transparent',
          transition: 'background 200ms ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 500, color: '#1d1d1f' }}>{label}</span>
          <span style={{ fontSize: 13, color: '#86868b', fontWeight: 400 }}>
            {isDragOver ? 'Drop to upload' : 'Empty'}
          </span>
        </div>
        <label style={{
          padding: '4px 0', fontSize: 13, fontWeight: 500,
          color: '#0071e3', background: 'transparent', border: 'none',
          cursor: isUploading ? 'wait' : 'pointer', minHeight: 'auto',
          transition: 'opacity 150ms ease',
        }}>
          {isUploading ? `Uploading ${uploadProgress}%` : 'Add'}
          <input
            type="file"
            multiple
            accept={acceptType}
            disabled={isUploading}
            onChange={(e) => onFiles(e.target.files)}
            style={{ display: 'none' }}
          />
        </label>
      </div>
    )
  }

  // POPULATED: full section with gallery
  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        padding: '20px 0',
        borderBottom: '1px solid rgba(0,0,0,0.06)',
        background: isDragOver ? 'rgba(0,122,255,0.05)' : 'transparent',
        transition: 'background 200ms ease',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        marginBottom: 14, gap: 10, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#1d1d1f', letterSpacing: '-0.01em' }}>{label}</span>
          <span style={{ fontSize: 13, color: '#86868b', fontWeight: 400 }}>
            {isDragOver ? 'Drop to add' : `${items.length} ${isVideoSection ? 'video' : isDocSection ? 'document' : 'photo'}${items.length === 1 ? '' : 's'}`}
          </span>
        </div>
        <label style={{
          padding: '4px 0', fontSize: 13, fontWeight: 500,
          color: '#0071e3', background: 'transparent', border: 'none',
          cursor: isUploading ? 'wait' : 'pointer', minHeight: 'auto',
        }}>
          {isUploading ? `Uploading ${uploadProgress}%` : 'Add'}
          <input
            type="file"
            multiple
            accept={acceptType}
            disabled={isUploading}
            onChange={(e) => onFiles(e.target.files)}
            style={{ display: 'none' }}
          />
        </label>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: 14,
      }}>
        {items.map((m) => {
          const canDelete = isAdmin || m.uploadedBy?.id === currentUserId
          return (
            <MediaThumb
              key={m.id}
              asset={m}
              isVideo={isVideoSection}
              isDoc={isDocSection}
              canDelete={canDelete}
              onDelete={onDelete}
              onClick={() => !isDocSection && onOpenLightbox(m)}
            />
          )
        })}
      </div>
    </div>
  )
}

// Single thumbnail with hover lift + click-to-open
function MediaThumb({
  asset, isVideo, isDoc, canDelete, onDelete, onClick,
}: {
  asset: MediaAsset
  isVideo: boolean
  isDoc: boolean
  canDelete: boolean
  onDelete: (id: string) => void
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        borderRadius: 12,
        overflow: 'hidden',
        background: '#f5f5f7',
        cursor: isDoc ? 'default' : 'pointer',
        transform: hovered && !isDoc ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: hovered && !isDoc
          ? '0 8px 24px rgba(0,0,0,0.12)'
          : '0 1px 3px rgba(0,0,0,0.05)',
        transition: 'transform 250ms cubic-bezier(0.25, 0.46, 0.45, 0.94), box-shadow 250ms ease',
      }}
      onClick={isVideo ? undefined : onClick}
    >
      {isVideo ? (
        <video
          src={asset.url}
          controls
          style={{
            width: '100%', aspectRatio: '4/3', objectFit: 'cover',
            display: 'block', background: '#000',
          }}
        />
      ) : isDoc ? (
        <a
          href={asset.url}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            aspectRatio: '4/3', background: '#f5f5f7',
            color: '#1d1d1f', textDecoration: 'none', gap: 6,
            flexDirection: 'column', padding: 12, textAlign: 'center',
          }}
        >
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: '#86868b',
          }}>Document</span>
          <span style={{
            fontSize: 13, fontWeight: 500,
            overflow: 'hidden', textOverflow: 'ellipsis',
            whiteSpace: 'nowrap', maxWidth: '100%',
          }}>{asset.filename || 'Open'}</span>
        </a>
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={asset.url}
          alt={asset.caption || ''}
          style={{
            width: '100%', aspectRatio: '4/3', objectFit: 'cover',
            display: 'block',
          }}
        />
      )}

      {canDelete && (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(asset.id) }}
          style={{
            position: 'absolute', top: 8, right: 8,
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(8px)',
            border: 'none', color: '#fff',
            fontSize: 13, lineHeight: 1,
            width: 24, height: 24, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', minHeight: 'auto',
            opacity: hovered ? 1 : 0,
            transition: 'opacity 200ms ease',
          }}
          title="Delete"
        >×</button>
      )}
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
