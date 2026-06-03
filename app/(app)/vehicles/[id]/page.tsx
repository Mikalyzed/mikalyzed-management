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

const demoFlooring = (cost: number | null, days: number | null) => {
  if (cost === null || days === null) return null
  const dailyRate = 0.00025
  const accrued = Math.round(cost * dailyRate * days * 100) / 100
  return {
    lender: 'NextGear (placeholder)',
    dailyRate: 0.025,
    principal: cost,
    daysHeld: days,
    accruedInterest: accrued,
    costPerDay: Math.round(cost * dailyRate * 100) / 100,
    payoff: Math.round((cost + accrued) * 100) / 100,
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
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState<'all' | 'inventory' | 'recon' | 'activity'>('all')
  const [expandedStageId, setExpandedStageId] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
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

  useEffect(() => {
    Promise.all([refreshVehicle(), refreshParts(), refreshActivity()]).finally(() => setLoading(false))

    const cookies = document.cookie.split(';').reduce((acc, c) => {
      const [k, v] = c.trim().split('=')
      acc[k] = v
      return acc
    }, {} as Record<string, string>)
    if (cookies.mm_user_role === 'admin') setIsAdmin(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
  if (!vehicle) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--danger)' }}>Vehicle not found</div>

  const days = daysAgo(vehicle.dateInStock)
  const profit = vehicle.askingPrice !== null && vehicle.vehicleCost !== null ? vehicle.askingPrice - vehicle.vehicleCost : null
  const margin = profit !== null && vehicle.askingPrice && vehicle.askingPrice > 0 ? (profit / vehicle.askingPrice) * 100 : null
  const flooring = demoFlooring(vehicle.vehicleCost, days)

  const demoCostAdds = [
    { date: '2026-04-12', description: 'Recon parts', vendor: 'In-house', amount: 450 },
    { date: '2026-04-13', description: 'Transport from auction', vendor: 'Auction Logistics', amount: 200 },
    { date: '2026-04-14', description: 'Detail', vendor: 'Detailer', amount: 150 },
  ]
  const totalCostAdds = demoCostAdds.reduce((s, c) => s + c.amount, 0)
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

  return (
    <div style={{ maxWidth: '1500px', margin: '0 auto', padding: '16px 24px' }}>
      <button onClick={() => router.back()} style={{ color: 'var(--text-muted)', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', minHeight: 'auto', marginBottom: 16 }}>
        ← Inventory
      </button>

      {/* ═══ HERO ═══ */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '340px 1fr',
        gap: 24,
        marginBottom: 24,
        background: '#ffffff',
        borderRadius: 24,
        padding: 24,
        boxShadow: 'var(--shadow)',
        border: '1px solid var(--border)',
      }}>
        <div style={{
          aspectRatio: '4/3',
          background: 'linear-gradient(135deg, #1a1a1a, #404040)',
          borderRadius: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#dffd6e',
          fontSize: 14,
          fontWeight: 600,
        }}>
          Photo · Phase 3
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                STOCK #{vehicle.stockNumber}
              </p>
              <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1, marginBottom: 8 }}>
                {vehicle.year} {vehicle.make}
              </h1>
              <p style={{ fontSize: 18, color: 'var(--text-secondary)', fontWeight: 500 }}>
                {vehicle.model}{vehicle.trim && ` · ${vehicle.trim}`}
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
              <V2StatusPill value={vehicle.inventoryStatus || vehicle.status} />
              <div style={{ display: 'flex', gap: 6 }}>
                {isAdmin && <button onClick={() => setShowEdit(true)} style={v2Btn('ghost')}>Edit</button>}
                <button style={v2Btn('primary')}>Mark Sold</button>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            {vehicle.color && <V2Chip>● {vehicle.color}</V2Chip>}
            {vehicle.mileage !== null && <V2Chip>{vehicle.mileage.toLocaleString()} mi</V2Chip>}
            {vehicle.location && <V2Chip>📍 {vehicle.location}</V2Chip>}
            {vehicle.vin && <V2Chip mono>{vehicle.vin}</V2Chip>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <Stat label="Vehicle Cost" value={money(vehicle.vehicleCost)} />
            <Stat label="Asking" value={money(vehicle.askingPrice)} />
            <Stat
              label="Spread"
              value={profit !== null ? money(profit) : '—'}
              sub={margin !== null ? `${margin.toFixed(1)}%` : undefined}
              accent={profit !== null && profit >= 0 ? 'positive' : profit !== null ? 'negative' : undefined}
            />
            <Stat label="Days Held" value={days !== null ? `${days}` : '—'} sub={vehicle.dateInStock ? `since ${fmtDate(vehicle.dateInStock)}` : undefined} />
          </div>
        </div>
      </div>

      {/* ═══ Filter chips ═══ */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, overflowX: 'auto' }}>
        {(['all', 'inventory', 'recon', 'activity'] as const).map((s) => (
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
            {s === 'recon' && vehicle.stages && vehicle.stages.length > 0 ? `Recon (${vehicle.stages.length})` : s}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, alignItems: 'start' }}>

        {/* Cost Adds */}
        {(activeSection === 'all' || activeSection === 'inventory') && (
          <V2Card title="Cost Adds" subtitle="Itemized recon, parts, transport costs" action="+ Add" wide>
            {demoCostAdds.map((c, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600 }}>{c.description}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{fmtDate(c.date)} · {c.vendor}</p>
                </div>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{money(c.amount)}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0 4px', borderTop: '2px solid #1a1a1a', marginTop: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>True cost = vehicle + adds</span>
              <span style={{ fontSize: 16, fontWeight: 800 }}>{money(trueCost)}</span>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 8 }}>
              Demo data — CostAdd backend lands next.
            </p>
          </V2Card>
        )}

        {/* Flooring */}
        {(activeSection === 'all' || activeSection === 'inventory') && flooring && (
          <V2Card title="Flooring" subtitle={`${flooring.lender} · ${flooring.dailyRate}%/day`}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <V2StatMini label="Principal" value={money(flooring.principal)} />
              <V2StatMini label="Accrued" value={money(flooring.accruedInterest)} sub={`${flooring.daysHeld}d`} />
              <V2StatMini label="Cost/Day" value={`${money(flooring.costPerDay)}`} accent="negative" />
              <V2StatMini label="Payoff Today" value={money(flooring.payoff)} accent="negative" />
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 12 }}>
              Demo math — real Flooring model lands next.
            </p>
          </V2Card>
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
                        {/* Checklist */}
                        {s.checklist && s.checklist.length > 0 && (
                          <div style={{ marginBottom: 12 }}>
                            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Checklist</p>
                            {s.checklist.map((item, i) => (
                              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '4px 0' }}>
                                <span style={{
                                  display: 'inline-flex', width: 16, height: 16, borderRadius: 4,
                                  background: item.done ? '#1a1a1a' : 'transparent',
                                  border: `1px solid ${item.done ? '#1a1a1a' : 'var(--border)'}`,
                                  alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2,
                                }}>
                                  {item.done && <span style={{ color: '#dffd6e', fontSize: 11, fontWeight: 700 }}>✓</span>}
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
                        {isActive && (
                          <div style={{ display: 'flex', gap: 8, paddingTop: 12, borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
                            {s.status === 'blocked' ? (
                              <button onClick={() => unblockStage(s.id)} disabled={busy} style={v2Btn('primary')}>Unblock</button>
                            ) : (
                              <>
                                <button onClick={() => completeStage(s.id)} disabled={busy} style={v2Btn('primary')}>✓ Complete Stage</button>
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
                        )}
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
