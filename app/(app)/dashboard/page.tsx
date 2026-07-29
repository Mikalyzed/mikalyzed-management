'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import RouteVehicleModal from '@/components/RouteVehicleModal'
import PartDetailModal from '@/components/PartDetailModal'
import ExternalRepairModal from '@/components/ExternalRepairModal'
import BoughtPartModal from '@/components/BoughtPartModal'
import ConfirmDialog, { type ConfirmState } from '@/components/ConfirmDialog'
import { CALENDAR_TYPE_LABELS, CALENDAR_TYPE_COLORS } from '@/lib/calendar'
import ReconTaskCard from '@/components/ReconTaskCard'

type FleetFinancials = {
  activeVehicleCount: number
  totalInventoryCost: number
  totalAskingPrice: number
  potentialGrossProfit: number
  vehiclesWithCost: number
  vehiclesWithPrice: number
  totalCostAdds: number
  flooringPrincipal: number
  flooringAccrued: number
  flooringExposure: number
  activeFlooredCount: number
  agingBuckets: { '0-30': number; '31-60': number; '61-90': number; '90+': number; unknown: number }
}

type DashboardData = {
  user: { name: string; role: string; id: string }
  newForYou?: {
    since: string
    previewFor?: string | null
    tasks: Array<{ id: string; title: string; description: string | null; priority: number; stock: string | null; createdAt: string }>
    parts: Array<{ id: string; name: string; status: string; stock: string; vehicle: string; createdAt: string }>
  } | null
  watchlistCount?: number | null
  coordinator?: {
    sourceQueue: Array<{ partId: string; part: string; stock: string; vehicle: string; ageDays: number }>
    externalOut: Array<{ externalId: string; stock: string; vehicle: string; shop: string; status: string; expectedBack: string | null; overdueDays: number; toInstall: number }>
    watchlist: Array<{ severity: string; stock: string | null; vehicle: string | null; where: string | null; issue: string; detail: string }>
  } | null
  attention?: {
    routing: Array<{ id: string; stock: string; vehicle: string }>
    installs: Array<{ stageId: string; item: string; stock: string; vehicle: string }>
    installsTotal: number
    delivered: Array<{ id: string; name: string; stock: string; vehicle: string }>
    approvals: Array<{ id: string; name: string; url: string | null; stock: string; vehicle: string }>
    overdue: Array<{ id: string; stock: string; vehicle: string; shop: string; overdueDays: number }>
    stuck: Array<{ id: string; name: string; stock: string; vehicle: string; ageDays: number }>
    stranded: Array<{ id: string; name: string; stock: string; vehicleId: string; vehicle: string; sold: boolean }>
    mechanics: Array<{ id: string; name: string }>
  } | null
  overview?: {
    inventory: { active: number; inStock: number; inRecon: number; external: number }
    deals: { draft: number; inContract: number; funded30: number } | null
    parts: { requested: number; approval: number; readyToOrder: number; ordered: number }
    external: { open: number; overdue: number; notSent: number }
  } | null
  pipeline: { mechanic: number; detailing: number; content: number; publish: number; completed: number; externalRepairs: number; partsPending: number }
  myTasks: number
  recentVehicles: Array<{
    id: string; stockNumber: string; year: number | null; make: string; model: string; status: string; color: string | null
  }>
  myReconTasks: Array<{
    id: string; stage: string; status: string; priority: number
    checklist: any[]
    activeSeconds: number
    timerStartedAt: string | null
    pauseReason: string | null
    pauseDetail: string | null
    startedAt: string | null
    estimatedHours: number | null
    vehicle: { id: string; stockNumber: string; year: number | null; make: string; model: string; color?: string | null }
  }>
  myEventTasks: Array<{
    id: string; title: string; status: string; priority: string; dueDate: string | null
    section: { name: string; event: { id: string; name: string; date: string } }
  }>
  myCalendarItems: Array<{
    id: string; title: string; type: string; date: string; location: string | null; status: string
    vehicle: { id: string; stockNumber: string; make: string; model: string } | null
    event: { id: string; name: string } | null
  }>
  myBoardTasks: Array<{
    id: string; title: string; category: string; status: string; priority: number; dueDate: string | null
  }>
  myParts: Array<{
    id: string; name: string; status: string; url: string | null
    vehicle: { id: string; stockNumber: string; year: number | null; make: string; model: string; color?: string | null }
  }>
  pendingApprovals: Array<{
    id: string; taskName: string; additionalHours: number | null; status: string; createdAt: string
    tasks: Array<{ name: string; hours: number; note: string | null }> | null
    vehicleStage: {
      id: string; stage: string
      vehicle: { id: string; stockNumber: string; year: number | null; make: string; model: string; color?: string | null }
    }
    requestedBy: { id: string; name: string }
  }>
  upcomingEvents: Array<{
    id: string; name: string; date: string; status: string
    owner: { id: string; name: string }
    progress: number; totalTasks: number; completedTasks: number
  }>
  inspectionRequests: Array<{
    vehicleId: string; stageId: string
    stockNumber: string; year: number | null; make: string; model: string
    requests: { index: number; item: string; estimatedHours: number | null }[]
  }>
}

const STAGE_LABELS: Record<string, string> = {
  mechanic: 'Mechanic', detailing: 'Detailing', content: 'Content', publish: 'Publish', completed: 'Done',
}

// ─── Domain overview — the whole operation counted, one glance ───
// Recon-board KPI anatomy: eyebrow, hero number + unit, hairline divider,
// dot-coded rows with right-aligned tabular numbers.
function OverviewGrid({ o }: { o: NonNullable<DashboardData['overview']> }) {
  type Row = { n: number; label: string; href: string; dot: string; hot?: boolean }
  const cards: Array<{ title: string; href: string; hero: number; unit: string; rows: Row[] }> = [
    {
      title: 'Inventory', href: '/inventory',
      hero: o.inventory.active, unit: o.inventory.active === 1 ? 'Vehicle' : 'Vehicles',
      rows: [
        { n: o.inventory.inStock, label: 'In Stock', href: '/inventory', dot: '#16a34a' },
        { n: o.inventory.inRecon, label: 'In Recon', href: '/vehicles', dot: '#f59e0b' },
        { n: o.inventory.external, label: 'At External Repair', href: '/external', dot: '#3b82f6' },
      ],
    },
    ...(o.deals ? [{
      title: 'Deals', href: '/deals',
      hero: o.deals.draft + o.deals.inContract, unit: o.deals.draft + o.deals.inContract === 1 ? 'Active Deal' : 'Active Deals',
      rows: [
        { n: o.deals.draft, label: 'In Worksheet', href: '/deals', dot: '#9a9a96' },
        { n: o.deals.inContract, label: 'In Contract', href: '/deals', dot: '#3b82f6' },
        { n: o.deals.funded30, label: 'Funded (Last 30)', href: '/deals', dot: '#16a34a' },
      ],
    }] : []),
    {
      title: 'Parts', href: '/parts',
      hero: o.parts.requested + o.parts.approval + o.parts.readyToOrder + o.parts.ordered,
      unit: 'In the Pipeline',
      rows: [
        { n: o.parts.requested, label: 'Requested', href: '/parts', dot: '#f59e0b' },
        { n: o.parts.approval, label: 'Pending Approval', href: '/parts', dot: '#9333ea' },
        { n: o.parts.readyToOrder, label: 'Ready to Order', href: '/parts', dot: '#2563eb' },
        { n: o.parts.ordered, label: 'Ordered', href: '/parts', dot: '#16a34a' },
      ],
    },
    {
      title: 'External Repairs', href: '/external',
      hero: o.external.open, unit: o.external.open === 1 ? 'Car at a Shop' : 'Cars at Shops',
      rows: [
        { n: o.external.overdue, label: 'Past Return Date', href: '/external', dot: '#dc2626', hot: true },
        { n: o.external.notSent, label: 'Created, Not Sent', href: '/external', dot: '#9a9a96' },
      ],
    },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(235px, 1fr))', gap: 14, marginBottom: 24 }}>
      <style>{`
        .dash-ov-card { transition: box-shadow 0.16s ease, border-color 0.16s ease; }
        .dash-ov-card:hover { border-color: var(--border-light, #f0f0ec); box-shadow: 0 2px 4px rgba(24,24,27,0.05), 0 8px 20px -10px rgba(24,24,27,0.14); }
        .dash-ov-row { border-radius: 8px; transition: background 0.12s ease; }
        .dash-ov-row:hover { background: var(--bg-card-hover, #fafaf8); }
        .dash-ov-open { opacity: 0; transition: opacity 0.15s ease; }
        .dash-ov-card:hover .dash-ov-open { opacity: 1; }
      `}</style>
      {cards.map(c => (
        <div key={c.title} className="dash-ov-card" style={{
          background: 'var(--bg-card, #fff)', border: '1px solid var(--border)', borderRadius: 14,
          boxShadow: '0 1px 2px rgba(24,24,27,.04), 0 4px 12px -8px rgba(24,24,27,.12)',
          padding: '15px 17px',
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>
              {c.title}
            </div>
            <Link href={c.href} className="dash-ov-open" style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)', textDecoration: 'none', minHeight: 0, whiteSpace: 'nowrap' }}>
              Open ›
            </Link>
          </div>
          <Link href={c.href} style={{ textDecoration: 'none', color: 'var(--text-primary)', minHeight: 0 }}>
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                {c.hero}
              </span>
              <span style={{ fontSize: 13, fontWeight: 550, color: 'var(--text-secondary)', letterSpacing: '-0.01em' }}>{c.unit}</span>
            </div>
          </Link>
          <div style={{ height: 1, background: 'var(--border-light, #f0f0ec)', margin: '12px 0 2px' }} />
          {c.rows.map((r, ri) => (
            <Link key={r.label} href={r.href} className="dash-ov-row" style={{
              display: 'flex', alignItems: 'center', gap: 9, padding: '8px 6px',
              fontSize: 12.5, textDecoration: 'none', color: 'var(--text-primary)', minHeight: 0,
              borderTop: ri > 0 ? '1px solid var(--border-light, #f0f0ec)' : 'none',
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: r.dot, flexShrink: 0, opacity: r.n > 0 ? 1 : 0.35 }} />
              <span style={{ flex: 1, fontWeight: 500, color: r.n > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>{r.label}</span>
              <span style={{
                fontWeight: 700, fontVariantNumeric: 'tabular-nums', fontSize: 13,
                color: r.hot && r.n > 0 ? '#dc2626' : r.n > 0 ? 'var(--text-primary)' : 'var(--text-muted)',
              }}>{r.n}</span>
            </Link>
          ))}
        </div>
      ))}
    </div>
  )
}

// /dashboard?view=coordinator lets an admin see Lenny's board; Lenny gets it by role.
function dashboardUrl() {
  const wantView = typeof window !== 'undefined' && window.location.search.includes('view=coordinator')
  return wantView ? '/api/dashboard?view=coordinator' : '/api/dashboard'
}

// ─── New For You — nothing is ever assigned silently. Everything added since
// the user's last "Got it" waits here, at the very top, until acknowledged. ───
function NewForYouCard({ n, onAcknowledge }: {
  n: NonNullable<DashboardData['newForYou']>
  onAcknowledge: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const count = n.tasks.length + n.parts.length
  if (count === 0) return null
  const isPreview = !!n.previewFor
  const sinceLabel = new Date(n.since).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const timeOf = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const stockChip: React.CSSProperties = {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: 10.5, fontWeight: 600, color: 'var(--text-secondary)',
    background: 'var(--bg-card, #fff)', border: '1px solid var(--border)',
    padding: '1px 6px', borderRadius: 6, whiteSpace: 'nowrap', flexShrink: 0,
  }
  return (
    <div className="card" style={{ marginBottom: 24, padding: 22, borderLeft: '3px solid #2563eb' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>
            New For You
          </div>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: '2px 0 0' }}>
            {count} new since {sinceLabel}
          </h2>
          {isPreview && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '3px 0 0' }}>
              What {n.previewFor} sees at the top of his dashboard — waiting for him to acknowledge.
            </p>
          )}
        </div>
        {!isPreview && <button
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              await fetch('/api/dashboard/seen', { method: 'POST' })
              await onAcknowledge()
            } finally { setBusy(false) }
          }}
          style={{
            border: 'none', background: '#1a1a1a', color: '#fff', borderRadius: 10,
            padding: '8px 16px', fontSize: 13, fontWeight: 650, cursor: 'pointer', minHeight: 0,
            opacity: busy ? 0.6 : 1, whiteSpace: 'nowrap',
          }}
        >✓ Got It</button>}
      </div>
      {n.tasks.map(t => (
        <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 0', borderTop: '1px solid var(--border-light, #f0f0ec)' }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: '#1d4ed8', background: '#eaf0fe', border: '1px solid #bfd3fc', padding: '2px 8px', borderRadius: 100, whiteSpace: 'nowrap', flexShrink: 0, marginTop: 1 }}>Task</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexWrap: 'wrap' }}>
              {t.stock && <span style={stockChip}>#{t.stock}</span>}
              <span style={{ fontWeight: 600, fontSize: 13 }}>{t.title}</span>
              {t.priority > 0 && <span style={{ fontSize: 10.5, fontWeight: 700, color: '#b91c1c', whiteSpace: 'nowrap' }}>High priority</span>}
            </div>
            {t.description && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '3px 0 0', lineHeight: 1.45 }}>{t.description}</p>
            )}
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{timeOf(t.createdAt)}</span>
        </div>
      ))}
      {n.parts.map(pt => (
        <div key={pt.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 0', borderTop: '1px solid var(--border-light, #f0f0ec)' }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: '#92400e', background: '#fdf3e7', border: '1px solid #fcd34d', padding: '2px 8px', borderRadius: 100, whiteSpace: 'nowrap', flexShrink: 0, marginTop: 1 }}>Part</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexWrap: 'wrap' }}>
              <span style={stockChip}>#{pt.stock}</span>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{pt.name}</span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '3px 0 0' }}>{pt.vehicle} — find it in your Source Queue below</p>
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{timeOf(pt.createdAt)}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Shop Coordinator Board — Lenny's whole loop on one page ───
function CoordinatorBoard({ c, tasks, onChanged }: {
  c: NonNullable<DashboardData['coordinator']>
  tasks: DashboardData['myBoardTasks']
  onChanged: () => Promise<void>
}) {
  const [linkFor, setLinkFor] = useState<string | null>(null)
  const [linkInput, setLinkInput] = useState('')
  const [boughtPart, setBoughtPart] = useState<{ id: string; name: string } | null>(null)
  const [externalActionId, setExternalActionId] = useState<string | null>(null)
  const [assignTab, setAssignTab] = useState<'all' | 'tasks' | 'parts'>('all')
  const [busy, setBusy] = useState(false)

  const eyebrow: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)',
  }
  const stockChip: React.CSSProperties = {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: 10.5, fontWeight: 600, color: 'var(--text-secondary)',
    background: 'var(--bg-primary, #f8f8f6)', border: '1px solid var(--border)',
    padding: '1px 6px', borderRadius: 6, whiteSpace: 'nowrap', flexShrink: 0,
  }
  const miniBtn: React.CSSProperties = {
    border: '1px solid var(--border)', background: 'var(--bg-card, #fff)', borderRadius: 8,
    padding: '4px 11px', fontSize: 12, fontWeight: 600, cursor: 'pointer', minHeight: 0,
    whiteSpace: 'nowrap', color: 'var(--text-primary)',
  }
  const itemRow: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0',
    fontSize: 12.5, borderBottom: '1px solid var(--border-light, #f0f0ec)',
  }

  const submitLink = async (partId: string) => {
    if (!linkInput.trim()) return
    setBusy(true)
    try {
      await fetch(`/api/parts/${partId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: linkInput.trim(), status: 'sourced' }),
      })
      setLinkFor(null); setLinkInput('')
      await onChanged()
    } finally { setBusy(false) }
  }

  return (
    <>
      {/* ── Assignments — his tasks + parts to source, tabbed ── */}
      <div className="card" style={{ marginBottom: 24, padding: 22 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Assignments</h2>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '2px 0 0' }}>
              {(tasks || []).length + c.sourceQueue.length === 0
                ? 'All caught up ✓'
                : [
                    (tasks || []).length ? `${(tasks || []).length} task${(tasks || []).length === 1 ? '' : 's'}` : null,
                    c.sourceQueue.length ? `${c.sourceQueue.length} part${c.sourceQueue.length === 1 ? '' : 's'} to source` : null,
                  ].filter(Boolean).join(' · ')}
            </p>
          </div>
          <Link href="/parts" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textDecoration: 'none', minHeight: 'auto' }}>Parts page →</Link>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, overflowX: 'auto' }}>
          {([
            { key: 'all', label: 'All', n: (tasks || []).length + c.sourceQueue.length },
            { key: 'tasks', label: 'Tasks', n: (tasks || []).length },
            { key: 'parts', label: 'Parts', n: c.sourceQueue.length },
          ] as const).map(t => {
            const on = assignTab === t.key
            return (
              <button
                key={t.key}
                onClick={() => setAssignTab(t.key)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  border: on ? '1px solid #1a1a1a' : '1px solid var(--border)',
                  background: on ? '#1a1a1a' : 'var(--bg-card, #fff)',
                  color: on ? '#fff' : 'var(--text-secondary)',
                  borderRadius: 100, padding: '6px 14px', fontSize: 12.5, fontWeight: 600,
                  cursor: 'pointer', minHeight: 0, whiteSpace: 'nowrap',
                }}
              >
                {t.label}
                <span style={{
                  fontSize: 10.5, fontWeight: 700, padding: '1px 7px', borderRadius: 100, fontVariantNumeric: 'tabular-nums',
                  background: on ? 'rgba(255,255,255,0.18)' : 'var(--bg-primary, #f8f8f6)',
                  color: on ? '#fff' : 'var(--text-muted)',
                }}>{t.n}</span>
              </button>
            )
          })}
        </div>

        {(tasks || []).length + c.sourceQueue.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>No open tasks and every requested part has been sourced. ✓</p>
        )}

        {assignTab === 'all' && (tasks || []).length > 0 && (
          <div style={{ ...eyebrow, margin: '2px 0 8px' }}>Tasks</div>
        )}
        {assignTab !== 'parts' && (tasks || []).map(t => (
          <div key={t.id} style={{
            background: 'var(--bg-primary, #f8f8f6)', border: '1px solid var(--border-light, #f0f0ec)',
            borderRadius: 12, padding: '11px 14px', marginBottom: 8,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 100, whiteSpace: 'nowrap',
                  background: '#eaf0fe', color: '#1d4ed8', border: '1px solid #bfd3fc',
                }}>Task</span>
                {t.priority > 0 && (
                  <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 100, whiteSpace: 'nowrap', background: '#fdecef', color: '#b91c1c', border: '1px solid #fecaca' }}>
                    {t.priority === 2 ? 'Urgent' : 'High'}
                  </span>
                )}
                {t.dueDate && (
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    due {new Date(t.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                )}
              </div>
              <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.45, marginTop: 5 }}>{t.title}</div>
            </div>
            <button
              style={{ ...miniBtn, background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', fontWeight: 650, flexShrink: 0 }}
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  await fetch(`/api/board-tasks/${t.id}`, {
                    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'done' }),
                  })
                  await onChanged()
                } finally { setBusy(false) }
              }}
            >✓ Done</button>
          </div>
        ))}

        {assignTab === 'all' && c.sourceQueue.length > 0 && (
          <div style={{ ...eyebrow, margin: '10px 0 8px' }}>Parts to Source</div>
        )}
        {assignTab !== 'tasks' && c.sourceQueue.map(pt => (
          <div key={pt.partId} style={{
            background: 'var(--bg-primary, #f8f8f6)', border: '1px solid var(--border-light, #f0f0ec)',
            borderRadius: 12, padding: '11px 14px', marginBottom: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{
                fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 100, whiteSpace: 'nowrap',
                background: '#fdf3e7', color: '#92400e', border: '1px solid #fcd34d',
              }}>Source</span>
              <span style={stockChip}>#{pt.stock}</span>
              {pt.ageDays > 7 && <span style={{ fontSize: 10.5, fontWeight: 650, color: '#b45309', whiteSpace: 'nowrap' }}>{pt.ageDays}d waiting</span>}
            </div>
            <div style={{ fontWeight: 600, fontSize: 13, marginTop: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pt.vehicle}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pt.part}</div>
            {linkFor === pt.partId ? (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 9 }}>
                <input
                  autoFocus value={linkInput} onChange={e => setLinkInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') submitLink(pt.partId) }}
                  placeholder="Paste the link…"
                  style={{ flex: 1, minWidth: 0, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12.5, background: '#fff' }}
                />
                <button style={{ ...miniBtn, background: '#eaf0fe', color: '#1d4ed8', border: '1px solid #bfd3fc', fontWeight: 650 }} disabled={busy || !linkInput.trim()} onClick={() => submitLink(pt.partId)}>Save</button>
                <button style={miniBtn} disabled={busy} onClick={() => { setLinkFor(null); setLinkInput('') }}>✗</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, marginTop: 9 }}>
                <button
                  style={{ ...miniBtn, flex: 1, justifyContent: 'center', display: 'inline-flex', padding: '5px 0', background: '#eaf0fe', color: '#1d4ed8', border: '1px solid #bfd3fc', fontWeight: 650 }}
                  disabled={busy} onClick={() => { setLinkFor(pt.partId); setLinkInput('') }}
                >+ Link</button>
                <button
                  style={{ ...miniBtn, flex: 1, justifyContent: 'center', display: 'inline-flex', padding: '5px 0', background: '#fdf3e7', color: '#92400e', border: '1px solid #fcd34d', fontWeight: 650 }}
                  disabled={busy} onClick={() => setBoughtPart({ id: pt.partId, name: pt.part })}
                >In Store</button>
              </div>
            )}
          </div>
        ))}

        {boughtPart && (
          <BoughtPartModal
            part={boughtPart}
            onClose={() => setBoughtPart(null)}
            onDone={async () => { setBoughtPart(null); await onChanged() }}
          />
        )}
      </div>

      {/* ── Waiting on External ── */}
      {c.externalOut.length > 0 && (
        <div className="card" style={{ marginBottom: 24, padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={eyebrow}>Waiting on External · {c.externalOut.length}</div>
            <Link href="/external" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textDecoration: 'none', minHeight: 'auto' }}>External page →</Link>
          </div>
          {c.externalOut.map(e => (
            <div
              key={e.externalId}
              role="button"
              onClick={() => setExternalActionId(e.externalId)}
              style={{ ...itemRow, cursor: 'pointer' }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={stockChip}>#{e.stock}</span>
                <div style={{ fontWeight: 600, fontSize: 13, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.vehicle}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  At {e.shop}
                  {e.expectedBack ? ` · back ${e.expectedBack}` : ''}
                  {e.overdueDays > 0 && <span style={{ color: '#b91c1c', fontWeight: 650 }}> · {e.overdueDays}d overdue</span>}
                  {e.toInstall > 0 && <span style={{ color: '#1d4ed8', fontWeight: 650 }}> · {e.toInstall} part{e.toInstall === 1 ? '' : 's'} to install on return</span>}
                </div>
              </div>
              {e.status === 'ready' && (
                <span style={{ fontSize: 10.5, fontWeight: 650, color: '#16a34a', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '2px 8px', borderRadius: 100, whiteSpace: 'nowrap' }}>Ready for pickup</span>
              )}
              <span aria-hidden style={{ color: 'var(--text-muted)', fontSize: 13, flexShrink: 0 }}>›</span>
            </div>
          ))}
          {externalActionId && (
            <ExternalRepairModal
              externalId={externalActionId}
              onClose={() => setExternalActionId(null)}
              onChanged={onChanged}
            />
          )}
        </div>
      )}

    </>
  )
}

// The car-first lead block every Attention item uses: stock chip + vehicle
// name on top, the actual task/part underneath. Clickable when there's a
// detail modal to open.
function CarLead({ stock, vehicle, detail, sold, onOpen }: {
  stock: string
  vehicle: string
  detail: React.ReactNode
  sold?: boolean
  onOpen?: () => void
}) {
  return (
    <div
      onClick={onOpen}
      role={onOpen ? 'button' : undefined}
      style={{ flex: '1 1 220px', minWidth: 0, cursor: onOpen ? 'pointer' : 'default' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          fontSize: 10.5, fontWeight: 600, color: 'var(--text-secondary)',
          background: 'var(--bg-card, #fff)', border: '1px solid var(--border)',
          padding: '1px 6px', borderRadius: 6, whiteSpace: 'nowrap', flexShrink: 0,
        }}>#{stock}</span>
        {sold && <span style={{ fontSize: 10.5, fontWeight: 650, color: '#b91c1c', background: '#fdecef', border: '1px solid #fecaca', padding: '1px 7px', borderRadius: 100, whiteSpace: 'nowrap', flexShrink: 0 }}>Sold</span>}
      </div>
      {/* The car is the headline — full width, never squeezed by buttons */}
      <div style={{ fontWeight: 600, fontSize: 13, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {vehicle}
      </div>
      <div style={{
        fontSize: 12, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.45,
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>
        {detail}
      </div>
    </div>
  )
}

// ─── Attention Center — everything waiting on an admin decision ───
// Rows expand to the actual items; each executes right here (assign, receive,
// approve, push a date) — routing deep-links into the recon board with the
// routing modal already open.
function AttentionCard({ a, isAdmin, role, onAction }: {
  a: NonNullable<DashboardData['attention']>
  isAdmin: boolean
  role: string
  onAction: () => Promise<void>
}) {
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [assignFor, setAssignFor] = useState<string | null>(null) // stageId|item key
  // Fixed coords for the assign popover — the row container clips overflow,
  // so an absolutely-positioned dropdown would render underneath it.
  const [assignPos, setAssignPos] = useState<{ top: number; right: number } | null>(null)
  const [routeVehicleId, setRouteVehicleId] = useState<string | null>(null)
  const [detailPartId, setDetailPartId] = useState<string | null>(null)
  const [externalModalId, setExternalModalId] = useState<string | null>(null)
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const flash = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(t => (t === msg ? null : t)), 6000)
  }

  const act = async (fn: () => Promise<Response>) => {
    setBusy(true)
    try {
      await fn()
      await onAction()
    } finally {
      setBusy(false)
      setAssignFor(null)
    }
  }

  /** Stranded part → mechanic. The server decides what's possible; the two
   *  ask-first cases (car in recon elsewhere, car at external) come back as
   *  409s and turn into a question / explanation here. */
  const sendToMechanic = async (vehicleId: string, vehicleLabel: string, partIds: string[]) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/vehicles/${vehicleId}/send-to-mechanic`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partIds }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) {
        await onAction()
        flash(d.mode === 'created'
          ? `${vehicleLabel} is now in the Mechanic lane on the recon board with ${d.count} install task${d.count === 1 ? '' : 's'} — assign it under "Arrived parts — assign the install".`
          : `${d.count} install task${d.count === 1 ? '' : 's'} added to ${vehicleLabel}'s mechanic checklist — assign under "Arrived parts — assign the install".`)
        return
      }
      if (d.code === 'in_recon') {
        setConfirmState({
          title: `Car is in recon at ${d.stage}`,
          message: `${vehicleLabel} is mid-stage. Open routing to move it to mechanic? The install tasks pre-fill.`,
          confirmLabel: 'Open Routing',
          onConfirm: () => setRouteVehicleId(vehicleId),
        })
      } else if (d.code === 'external') {
        setConfirmState({
          title: `Car is at ${d.shop}`,
          message: `${vehicleLabel}${d.expectedBack ? ` is expected back ${d.expectedBack}.` : ' is out at the shop.'} The install is queued — it surfaces automatically in routing when the car returns.`,
          hideCancel: true,
        })
      } else {
        flash(d.error || 'Could not send to mechanic.')
      }
    } finally {
      setBusy(false)
    }
  }

  const rows: Array<{ key: string; n: number; area: string; label: string; crit?: boolean }> = [
    { key: 'routing', n: a.routing.length, area: 'Recon Board', label: 'Cars waiting to be routed' },
    { key: 'installs', n: a.installsTotal, area: 'Recon Board', label: 'Arrived parts — assign the install' },
    { key: 'delivered', n: a.delivered.length, area: 'Parts', label: 'Carrier says delivered — confirm received', crit: true },
    { key: 'approvals', n: a.approvals.length, area: 'Parts', label: 'Sourced parts awaiting approval' },
    { key: 'stuck', n: a.stuck.length, area: 'Parts', label: 'Stuck in requested 7+ days' },
    { key: 'stranded', n: (a.stranded ?? []).length, area: 'Parts', label: 'Part here — car not in recon, no install plan', crit: true },
    { key: 'overdue', n: a.overdue.length, area: 'External', label: 'Repairs past their return date', crit: true },
  ].filter(r => r.n > 0)

  const itemRow: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
    padding: '8px 14px',
    fontSize: 12.5, borderTop: '1px solid var(--border-light, #f0f0ec)',
    background: 'var(--bg-card, #fff)',
  }
  const miniBtn: React.CSSProperties = {
    border: '1px solid var(--border)', background: 'var(--bg-card, #fff)', borderRadius: 8,
    padding: '4px 11px', fontSize: 12, fontWeight: 600, cursor: 'pointer', minHeight: 0,
    whiteSpace: 'nowrap', color: 'var(--text-primary)',
  }
  const stockChip: React.CSSProperties = {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: 10.5, fontWeight: 600, color: 'var(--text-secondary)',
    background: 'var(--bg-primary, #f8f8f6)', border: '1px solid var(--border)',
    padding: '1px 6px', borderRadius: 6, whiteSpace: 'nowrap', flexShrink: 0,
  }

  return (
    <div className="card" style={{ marginBottom: 24, padding: 22, borderLeft: rows.length ? '3px solid #d97706' : '3px solid #16a34a' }}>
      <style>{`
        @media (max-width: 640px) {
          .att-mech-btn { width: 100%; justify-content: center; display: inline-flex; margin-top: 2px; padding: 7px 0 !important; font-size: 12px !important; }
          .att-hide-mobile { display: none !important; }
        }
        @media (min-width: 641px) {
          .att-mobile-only { display: none !important; }
        }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: rows.length ? 8 : 0 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>Attention</div>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: '2px 0 0' }}>
            {rows.length ? `Waiting on you — ${rows.reduce((s, r) => s + r.n, 0)} items` : 'All clear'}
          </h2>
        </div>
      </div>
      {rows.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '6px 0 0' }}>Nothing pending — routing, parts, and externals are all handled. ✓</p>
      )}
      {rows.map((r) => (
        <div key={r.key} style={{
          background: 'var(--bg-primary, #f8f8f6)',
          border: '1px solid var(--border-light, #f0f0ec)',
          borderRadius: 12, marginBottom: 8, overflow: 'hidden',
        }}>
          <button
            onClick={() => setOpen(open === r.key ? null : r.key)}
            aria-expanded={open === r.key}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', width: '100%',
              textAlign: 'left',
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-primary)', fontSize: 13.5, minHeight: 0,
            }}
          >
            <span style={{
              minWidth: 26, height: 22, padding: '0 7px', borderRadius: 100,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
              background: r.crit ? 'rgba(185,28,28,0.10)' : 'rgba(180,83,9,0.10)',
              color: r.crit ? '#b91c1c' : '#b45309',
            }}>{r.n}</span>
            <span style={{ flex: 1, minWidth: 0, letterSpacing: '-0.005em' }}>
              <span style={{ fontWeight: 700 }}>{r.area}:</span>{' '}
              <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{r.label}</span>
            </span>
            <span aria-hidden style={{ color: 'var(--text-muted)', fontSize: 11, transform: open === r.key ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease' }}>▸</span>
          </button>

          {open === r.key && r.key === 'routing' && a.routing.map(v => (
            <div key={v.id} style={itemRow}>
              <CarLead stock={v.stock} vehicle={v.vehicle} detail="Finished its stage — waiting to be routed" />
              <button
                className="att-mech-btn"
                style={{ ...miniBtn, background: '#eaf0fe', color: '#1d4ed8', border: '1px solid #bfd3fc', fontWeight: 650 }}
                disabled={busy}
                onClick={() => setRouteVehicleId(v.id)}
              >Route →</button>
            </div>
          ))}

          {open === r.key && r.key === 'installs' && a.installs.map(it => {
            const k = `${it.stageId}|${it.item}`
            return (
              <div key={k} style={{ ...itemRow, position: 'relative', flexWrap: 'wrap' }}>
                <CarLead stock={it.stock} vehicle={it.vehicle} detail={it.item} />
                <button
                  style={miniBtn} disabled={busy}
                  onClick={(e) => {
                    if (assignFor === k) { setAssignFor(null); return }
                    const r = e.currentTarget.getBoundingClientRect()
                    // Clamp so the list never runs off the bottom of the screen
                    const estHeight = Math.min(a.mechanics.length, 5) * 37 + 8
                    setAssignPos({
                      top: Math.min(r.bottom + 4, window.innerHeight - estHeight - 12),
                      right: Math.max(8, window.innerWidth - r.right),
                    })
                    setAssignFor(k)
                  }}
                >
                  Assign ▾
                </button>
                {assignFor === k && assignPos && (
                  <span style={{
                    position: 'fixed', right: assignPos.right, top: assignPos.top, zIndex: 1200, minWidth: 160,
                    maxHeight: 200, overflowY: 'auto',
                    background: 'var(--bg-card, #fff)', border: '1px solid var(--border)', borderRadius: 10,
                    boxShadow: '0 8px 24px rgba(24,24,27,0.16)', display: 'block',
                  }}>
                    {a.mechanics.map(m => (
                      <button
                        key={m.id}
                        disabled={busy}
                        onClick={() => act(() => fetch(`/api/stages/${it.stageId}/assign-task`, {
                          method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ assigneeId: m.id, item: it.item }),
                        }))}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 12, background: 'var(--bg-card, #fff)', border: 'none', borderBottom: '1px solid var(--border-light, #f0f0ec)', cursor: 'pointer', minHeight: 0, color: 'var(--text-primary)' }}
                      >{m.name}</button>
                    ))}
                  </span>
                )}
              </div>
            )
          })}

          {open === r.key && r.key === 'delivered' && a.delivered.map(p => (
            <div key={p.id} style={itemRow}>
              <CarLead stock={p.stock} vehicle={p.vehicle} detail={`${p.name} — carrier says delivered`} onOpen={() => setDetailPartId(p.id)} />
              <button
                style={{ ...miniBtn, color: '#16a34a' }} disabled={busy}
                onClick={() => act(() => fetch(`/api/parts/${p.id}`, {
                  method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ status: 'received' }),
                }))}
              >✓ Received</button>
            </div>
          ))}

          {open === r.key && r.key === 'approvals' && a.approvals.map(p => (
            <div key={p.id} style={itemRow}>
              <CarLead
                stock={p.stock} vehicle={p.vehicle}
                detail={<>{p.name}{p.url && <a href={p.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ marginLeft: 8, color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}>View link ↗</a>}</>}
                onOpen={() => setDetailPartId(p.id)}
              />
              <button
                style={{ ...miniBtn, color: '#16a34a' }} disabled={busy}
                onClick={() => act(() => fetch(`/api/parts/${p.id}`, {
                  method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ status: 'ready_to_order' }),
                }))}
              >✓ Approve</button>
              <button
                style={{ ...miniBtn, color: '#b91c1c' }} disabled={busy}
                onClick={() => act(() => fetch(`/api/parts/${p.id}`, {
                  method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ status: 'requested', url: null }),
                }))}
              >✗</button>
            </div>
          ))}

          {open === r.key && r.key === 'overdue' && a.overdue.map(e => (
            <div key={e.id} style={itemRow}>
              <CarLead
                stock={e.stock} vehicle={e.vehicle}
                detail={<span style={{ color: '#b91c1c', fontWeight: 600 }}>{e.overdueDays}d late at {e.shop}</span>}
                onOpen={() => setExternalModalId(e.id)}
              />
              <button
                style={{ ...miniBtn, width: '100%', justifyContent: 'center', display: 'inline-flex', padding: '5px 0', background: '#eaf0fe', color: '#1d4ed8', border: '1px solid #bfd3fc', fontWeight: 650 }}
                disabled={busy} onClick={() => setExternalModalId(e.id)}
              >Open ›</button>
            </div>
          ))}

          {open === r.key && r.key === 'stranded' && (() => {
            // One block per car — a car with several stranded parts reads as
            // one problem with N parts, not N separate rows.
            const byStock = new Map<string, typeof a.stranded>()
            for (const p of a.stranded ?? []) {
              if (!byStock.has(p.stock)) byStock.set(p.stock, [])
              byStock.get(p.stock)!.push(p)
            }
            return Array.from(byStock.values()).map(group => {
              const v = group[0]
              if (group.length === 1) return (
                <div key={v.id} style={itemRow}>
                  <CarLead
                    stock={v.stock} vehicle={v.vehicle}
                    sold={v.sold}
                    detail={v.name}
                    onOpen={() => setDetailPartId(v.id)}
                  />
                  <button
                    className="att-mech-btn"
                    style={{ ...miniBtn, background: '#eaf0fe', color: '#1d4ed8', border: '1px solid #bfd3fc', fontWeight: 650 }} disabled={busy}
                    onClick={() => sendToMechanic(v.vehicleId, v.vehicle, [v.id])}
                  >→ Add Vehicle to Recon</button>
                </div>
              )
              return (
                <div key={v.stock}>
                  <div style={{ ...itemRow, paddingBottom: 4 }}>
                    <CarLead stock={v.stock} vehicle={v.vehicle} sold={v.sold} detail={`${group.length} parts arrived — no install plan`} />
                    <button
                      className="att-mech-btn att-hide-mobile"
                      style={{ ...miniBtn, background: '#eaf0fe', color: '#1d4ed8', border: '1px solid #bfd3fc', fontWeight: 650 }} disabled={busy}
                      onClick={() => sendToMechanic(v.vehicleId, v.vehicle, group.map(g => g.id))}
                    >→ Add Vehicle to Recon</button>
                  </div>
                  {group.map(p => (
                    <div key={p.id} style={{ ...itemRow, flexWrap: 'nowrap', borderTop: 'none', paddingTop: 3, paddingBottom: 6, paddingLeft: 26 }}>
                      <span style={{
                        flex: 1, minWidth: 0, fontWeight: 500, fontSize: 12.5, lineHeight: 1.4,
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                      }}>{p.name}</span>
                      <button style={miniBtn} disabled={busy} onClick={() => setDetailPartId(p.id)}>Open ›</button>
                    </div>
                  ))}
                  <div className="att-mobile-only" style={{ padding: '0 14px 10px' }}>
                    <button
                      className="att-mech-btn"
                      style={{ ...miniBtn, background: '#eaf0fe', color: '#1d4ed8', border: '1px solid #bfd3fc', fontWeight: 650 }} disabled={busy}
                      onClick={() => sendToMechanic(v.vehicleId, v.vehicle, group.map(g => g.id))}
                    >→ Add Vehicle to Recon</button>
                  </div>
                </div>
              )
            })
          })()}

          {open === r.key && r.key === 'stuck' && a.stuck.map(p => (
            <div key={p.id} style={itemRow}>
              <CarLead
                stock={p.stock} vehicle={p.vehicle}
                detail={<>{p.name} <span style={{ color: '#b45309', fontWeight: 600 }}>· {p.ageDays}d in requested</span></>}
                onOpen={() => setDetailPartId(p.id)}
              />
              <button style={miniBtn} disabled={busy} onClick={() => setDetailPartId(p.id)}>Open ›</button>
            </div>
          ))}
        </div>
      ))}

      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
      {toast && (
        <div role="status" style={{
          position: 'fixed', left: '50%', bottom: 28, transform: 'translateX(-50%)', zIndex: 1400,
          maxWidth: 'min(560px, calc(100vw - 32px))',
          background: '#1a1a1a', color: '#fff', borderRadius: 12, padding: '12px 18px',
          fontSize: 13, fontWeight: 500, lineHeight: 1.45,
          boxShadow: '0 8px 24px rgba(24,24,27,0.28)',
        }}>
          {toast}
        </div>
      )}

      {detailPartId && (
        <PartDetailModal
          partId={detailPartId}
          isAdmin={isAdmin}
          role={role}
          onClose={() => setDetailPartId(null)}
          onChanged={onAction}
        />
      )}
      {externalModalId && (
        <ExternalRepairModal
          externalId={externalModalId}
          onClose={() => setExternalModalId(null)}
          onChanged={onAction}
        />
      )}

      {/* The real routing modal, natively — instant, no iframe */}
      {routeVehicleId && (
        <RouteVehicleModal
          vehicleId={routeVehicleId}
          onClose={() => setRouteVehicleId(null)}
          onRouted={async () => {
            setRouteVehicleId(null)
            await onAction()
          }}
        />
      )}
    </div>
  )
}

// ─── My Assignments Component ───
function MyAssignments({ data, refresh }: { data: DashboardData; refresh: () => void }) {
  const hasRecon = data.myReconTasks.length > 0
  const hasEvents = data.myEventTasks.length > 0
  const hasCalendar = data.myCalendarItems.length > 0
  const hasBoardTasks = (data.myBoardTasks || []).length > 0
  const hasParts = (data.myParts || []).length > 0

  // Count how many categories have items
  const categories = [hasRecon, hasEvents, hasCalendar, hasBoardTasks, hasParts].filter(Boolean).length
  const showTabs = categories > 1

  const [filter, setFilter] = useState<'all' | 'recon' | 'events' | 'calendar' | 'tasks' | 'parts'>('all')

  const tabs: { key: typeof filter; label: string; count: number }[] = []
  tabs.push({ key: 'all', label: 'All', count: data.myReconTasks.length + data.myEventTasks.length + data.myCalendarItems.length + (data.myBoardTasks || []).length + (data.myParts || []).length })
  if (hasRecon) tabs.push({ key: 'recon', label: 'Recon', count: data.myReconTasks.length })
  if (hasParts) tabs.push({ key: 'parts', label: 'Parts', count: (data.myParts || []).length })
  if (hasBoardTasks) tabs.push({ key: 'tasks', label: 'Tasks', count: (data.myBoardTasks || []).length })
  if (hasEvents) tabs.push({ key: 'events', label: 'Events', count: data.myEventTasks.length })
  if (hasCalendar) tabs.push({ key: 'calendar', label: 'Calendar', count: data.myCalendarItems.length })

  const showRecon = filter === 'all' || filter === 'recon'
  const showEvents = filter === 'all' || filter === 'events'
  const showCalendar = filter === 'all' || filter === 'calendar'
  const showParts = filter === 'all' || filter === 'parts'

  const [linkingPartId, setLinkingPartId] = useState<string | null>(null)
  const [partLinkInput, setPartLinkInput] = useState('')
  const [savingPartLink, setSavingPartLink] = useState(false)

  async function submitPartLink(partId: string) {
    if (!partLinkInput.trim()) return
    setSavingPartLink(true)
    await fetch(`/api/parts/${partId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: partLinkInput.trim() }),
    })
    setLinkingPartId(null); setPartLinkInput(''); setSavingPartLink(false)
    // Refresh dashboard so the part disappears from the list (status moves to sourced)
    if (typeof window !== 'undefined') window.location.reload()
  }

  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>My Assignments</h2>
      </div>

      {/* Filter tabs — only show if multiple categories */}
      {showTabs && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto', paddingBottom: 2 }}>
          {tabs.map(tab => (
            <button key={tab.key} onClick={() => setFilter(tab.key)} style={{
              padding: '7px 14px',
              borderRadius: 8,
              border: '1px solid',
              borderColor: filter === tab.key ? '#1a1a1a' : 'var(--border)',
              background: filter === tab.key ? '#1a1a1a' : '#fff',
              color: filter === tab.key ? '#dffd6e' : 'var(--text-secondary)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              minHeight: 34,
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}>
              {tab.label}
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '1px 7px',
                borderRadius: 6,
                background: filter === tab.key ? 'rgba(223,253,110,0.2)' : '#f0f0ec',
                color: filter === tab.key ? '#dffd6e' : 'var(--text-muted)',
              }}>{tab.count}</span>
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* ── Parts to Source ── */}
        {showParts && hasParts && (
          <>
            {filter === 'all' && categories > 1 && (
              <div className="section-label" style={{ marginTop: 4 }}>Parts to Source</div>
            )}
            {data.myParts.map(part => (
              <div key={part.id} className="card" style={{ padding: '14px 20px', borderLeft: '4px solid #ef4444' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <Link
                    href={`/parts#part-${part.id}`}
                    style={{ flex: 1, minWidth: 0, textDecoration: 'none', color: 'inherit' }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{part.name}</div>
                    <div
                      title={`${part.vehicle.year ?? ''} ${part.vehicle.make} ${part.vehicle.model}`.trim()}
                      style={{
                        fontSize: 12, color: 'var(--text-muted)', marginTop: 2,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}
                    >
                      {part.vehicle.year} {part.vehicle.make} {part.vehicle.model}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                      #{part.vehicle.stockNumber}
                      {part.vehicle.color && <span style={{ marginLeft: 8 }}>{part.vehicle.color}</span>}
                    </div>
                  </Link>
                  {linkingPartId !== part.id && (
                    <button
                      onClick={(e) => { e.preventDefault(); setLinkingPartId(part.id); setPartLinkInput('') }}
                      style={{
                        padding: '6px 12px', borderRadius: 6, border: '1px solid #2563eb',
                        background: '#eff6ff', color: '#2563eb', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      Add Link
                    </button>
                  )}
                </div>
                {linkingPartId === part.id && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <input
                      type="url"
                      value={partLinkInput}
                      onChange={(e) => setPartLinkInput(e.target.value)}
                      placeholder="Paste part link..."
                      autoFocus
                      onKeyDown={(e) => { if (e.key === 'Enter' && partLinkInput.trim()) { e.preventDefault(); submitPartLink(part.id) } }}
                      style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13 }}
                    />
                    <button
                      onClick={() => { setLinkingPartId(null); setPartLinkInput('') }}
                      style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid var(--border)', background: '#fff', fontSize: 12, cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => submitPartLink(part.id)}
                      disabled={!partLinkInput.trim() || savingPartLink}
                      style={{
                        padding: '8px 14px', borderRadius: 6, border: 'none',
                        background: '#1a1a1a', color: '#dffd6e', fontSize: 12, fontWeight: 600,
                        cursor: 'pointer', opacity: !partLinkInput.trim() || savingPartLink ? 0.5 : 1,
                      }}
                    >
                      {savingPartLink ? 'Saving...' : 'Submit'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </>
        )}

        {/* ── Recon Section ── */}
        {showRecon && hasRecon && (
          <>
            {filter === 'all' && categories > 1 && (
              <div className="section-label" style={{ marginTop: 4 }}>Recon Board</div>
            )}
            {data.myReconTasks.map(task => (
              <ReconTaskCard key={task.id} task={task as any} onChange={refresh} />
            ))}
          </>
        )}

        {/* ── Events Section ── */}
        {showEvents && hasEvents && (
          <>
            {filter === 'all' && categories > 1 && (
              <div className="section-label" style={{ marginTop: 12 }}>Events</div>
            )}
            {data.myEventTasks.map(task => {
              const isOverdue = task.dueDate && new Date(task.dueDate) < new Date()
              return (
                <Link key={task.id} href={`/events/${task.section.event.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div className="card" style={{
                    padding: '14px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    borderLeft: `4px solid ${isOverdue ? '#ef4444' : '#65a30d'}`,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{task.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                        {task.section.event.name} — {task.section.name}
                        {task.dueDate && (
                          <span style={{ color: isOverdue ? '#ef4444' : undefined, marginLeft: 8 }}>
                            Due {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            {isOverdue && ' (overdue)'}
                          </span>
                        )}
                      </div>
                    </div>
                    {task.priority !== 'normal' && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                        color: task.priority === 'urgent' ? '#ef4444' : task.priority === 'high' ? '#f59e0b' : 'var(--text-muted)',
                      }}>{task.priority}</span>
                    )}
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, background: 'rgba(101, 163, 13, 0.1)', color: '#65a30d' }}>
                      Event
                    </span>
                  </div>
                </Link>
              )
            })}
          </>
        )}

        {/* ── Calendar Section ── */}
        {showCalendar && hasCalendar && (
          <>
            {filter === 'all' && categories > 1 && (
              <div className="section-label" style={{ marginTop: 12 }}>Calendar</div>
            )}
            {data.myCalendarItems.map(item => {
              const typeColor = CALENDAR_TYPE_COLORS[item.type as keyof typeof CALENDAR_TYPE_COLORS] || '#6b7280'
              const typeLabel = CALENDAR_TYPE_LABELS[item.type as keyof typeof CALENDAR_TYPE_LABELS] || item.type
              const itemDate = new Date(item.date)
              const isToday = new Date().toDateString() === itemDate.toDateString()
              return (
                <Link key={item.id} href={`/calendar/${item.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div className="card" style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14, borderLeft: `4px solid ${typeColor}` }}>
                    <div style={{ minWidth: 50, textAlign: 'center' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: isToday ? '#1a1a1a' : 'var(--text-secondary)' }}>
                        {isToday ? 'Today' : itemDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {itemDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{item.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                        {item.location && <span>{item.location} · </span>}
                        {item.vehicle && <span>{item.vehicle.make} {item.vehicle.model} · </span>}
                        {typeLabel}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, background: `${typeColor}15`, color: typeColor }}>
                      {typeLabel}
                    </span>
                  </div>
                </Link>
              )
            })}
          </>
        )}

        {/* Board Tasks */}
        {(filter === 'all' || filter === 'tasks') && hasBoardTasks && (
          <>
            {filter === 'all' && categories > 1 && (
              <div className="section-label" style={{ marginTop: 12 }}>Tasks</div>
            )}
            {(data.myBoardTasks || []).map(task => {
              const catColors: Record<string, string> = { content: '#8b5cf6', marketing: '#3b82f6', admin: '#64748b', operations: '#f59e0b' }
              const catLabels: Record<string, string> = { content: 'Content', marketing: 'Marketing', admin: 'Admin', operations: 'Operations' }
              const color = catColors[task.category] || '#888'
              return (
                <Link key={task.id} href="/task-board" style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div className="card" style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14, borderLeft: `4px solid ${color}` }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{task.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                        {catLabels[task.category] || task.category}
                        {task.dueDate && ` · Due ${new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                      </div>
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6,
                      background: task.priority === 2 ? '#fef2f2' : task.priority === 1 ? '#fffbeb' : `${color}15`,
                      color: task.priority === 2 ? '#ef4444' : task.priority === 1 ? '#f59e0b' : color,
                    }}>
                      {task.priority === 2 ? 'Urgent' : task.priority === 1 ? 'High' : catLabels[task.category] || 'Task'}
                    </span>
                  </div>
                </Link>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Add Button Dropdown ───
function AddButton() {
  const [open, setOpen] = useState(false)

  const actions = [
    { href: '/leads/new', label: 'New Lead' },
    { href: '/vehicles/new', label: 'Add Vehicle' },
    { href: '/calendar/new', label: 'Calendar Item' },
    { href: '/events/new', label: 'New Event' },
    { href: '/transport/new', label: 'Transport Request' },
    { href: '/external', label: 'External Repair' },
  ]

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: 38, height: 38, borderRadius: 10,
          background: '#1a1a1a', color: '#dffd6e',
          border: 'none', cursor: 'pointer',
          fontSize: 20, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          minHeight: 'auto',
          transition: 'transform 0.2s',
          transform: open ? 'rotate(45deg)' : 'none',
        }}
      >+</button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 50 }} />
          <div style={{
            position: 'absolute', top: 44, right: 0, zIndex: 51,
            background: '#fff', border: '1px solid var(--border)',
            borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
            padding: '6px', minWidth: 200,
          }}>
            {actions.map(a => (
              <Link key={a.href} href={a.href} onClick={() => setOpen(false)} style={{
                display: 'block', padding: '10px 14px', borderRadius: 8,
                fontSize: 14, fontWeight: 500, color: 'var(--text-primary)',
                textDecoration: 'none', minHeight: 'auto',
                transition: 'background 0.1s',
              }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-primary)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                {a.label}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Main Dashboard ───
// Suspense wrapper: useSearchParams (coordinator view toggle) requires it
// for static prerendering in Next 15.
export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <DashboardInner />
    </Suspense>
  )
}

function DashboardInner() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [financials, setFinancials] = useState<FleetFinancials | null>(null)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [expandedApproval, setExpandedApproval] = useState<string | null>(null)
  const [adjustedHours, setAdjustedHours] = useState<Record<string, number>>({})
  // Refetch when ?view=coordinator toggles — a query-only nav doesn't remount the page
  const searchParams = useSearchParams()
  const coordinatorView = searchParams.get('view') === 'coordinator'

  useEffect(() => {
    // Tolerant parse: a mid-restart or errored server returns an empty body —
    // keep the spinner (and log) rather than crashing the page.
    fetch(dashboardUrl())
      .then(async r => {
        if (!r.ok) throw new Error(`dashboard ${r.status}`)
        const txt = await r.text()
        return txt ? (JSON.parse(txt) as DashboardData) : null
      })
      .then(d => { if (d) setData(d) })
      .catch(console.error)
    fetch('/api/dashboard/financials')
      .then(async (r) => {
        if (!r.ok) return null
        const txt = await r.text()
        if (!txt) return null
        try { return JSON.parse(txt) } catch { return null }
      })
      .then((d) => d && setFinancials(d))
      .catch(() => {})
  }, [coordinatorView])

  if (!data) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ width: 24, height: 24, border: '2px solid #e0e0e0', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      </div>
    )
  }

  // Admin visiting ?view=coordinator gets the BOARD, not their dashboard with
  // extra cards buried below — a distinct page so the nav click visibly lands.
  const coordinatorFocus = coordinatorView && data.user.role === 'admin'
  if (coordinatorFocus) {
    const refreshBoard = async () => {
      const fresh = await fetch(dashboardUrl()).then(r => r.json()).catch(() => null)
      if (fresh) setData(fresh)
    }
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>Boards</div>
            <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', margin: '2px 0 0' }}>Shop Coordinator Board</h1>
          </div>
          <Link href="/dashboard" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textDecoration: 'none', minHeight: 'auto' }}>← My Dashboard</Link>
        </div>
        {data.newForYou && <NewForYouCard n={data.newForYou} onAcknowledge={refreshBoard} />}
        {data.attention && (
          <AttentionCard a={data.attention} isAdmin={true} role={data.user.role} onAction={refreshBoard} />
        )}
        {data.coordinator ? (
          <CoordinatorBoard c={data.coordinator} tasks={data.myBoardTasks || []} onChanged={refreshBoard} />
        ) : (
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading board…</p>
        )}
      </div>
    )
  }

  async function handleApproval(id: string, status: 'approved' | 'rejected') {
    setApprovingId(id)
    const body: Record<string, unknown> = { status }
    if (status === 'approved' && adjustedHours[id] !== undefined) {
      body.adjustedHours = adjustedHours[id]
    }
    await fetch(`/api/task-approvals/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    // Refresh
    const fresh = await fetch('/api/dashboard').then(r => r.json())
    setData(fresh)
    setApprovingId(null)
  }

  const isAdmin = data.user.role === 'admin'
  const hasAssignments = data.myReconTasks.length > 0 || data.myEventTasks.length > 0 || data.myCalendarItems.length > 0 || (data.myBoardTasks || []).length > 0 || (data.myParts || []).length > 0

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>Dashboard</h1>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 4 }}>Welcome back, {data.user.name}.</p>
        </div>
        {isAdmin && <AddButton />}
      </div>

      {/* ═══ Fleet Financials (admin + sales_manager only) ═══ */}
      {data.newForYou && <NewForYouCard n={data.newForYou} onAcknowledge={async () => {
        const fresh = await fetch(dashboardUrl()).then(r => r.json()).catch(() => null)
        if (fresh) setData(fresh)
      }} />}

      {data.attention && <AttentionCard a={data.attention} isAdmin={isAdmin} role={data.user.role} onAction={async () => {
        const fresh = await fetch(dashboardUrl()).then(r => r.json()).catch(() => null)
        if (fresh) setData(fresh)
      }} />}

      {data.overview && !coordinatorFocus && <OverviewGrid o={data.overview} />}

      {typeof data.watchlistCount === 'number' && data.watchlistCount > 0 && (
        <Link href="/watchlist" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
          <div className="card" style={{ marginBottom: 24, padding: '16px 22px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
            <span style={{
              minWidth: 26, height: 22, padding: '0 7px', borderRadius: 100,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
              background: 'rgba(180,83,9,0.10)', color: '#b45309',
            }}>{data.watchlistCount}</span>
            <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700 }}>Issues Detected</span>
            <span style={{ fontSize: 13, fontWeight: 650, color: '#1d4ed8' }}>Open ›</span>
          </div>
        </Link>
      )}


      {data.coordinator && <CoordinatorBoard c={data.coordinator} tasks={data.myBoardTasks || []} onChanged={async () => {
        const fresh = await fetch(dashboardUrl()).then(r => r.json()).catch(() => null)
        if (fresh) setData(fresh)
      }} />}

      {(isAdmin || data.user.role === 'sales_manager') && financials && <FleetFinancialsWidget f={financials} />}

      {/* ═══ Recon Pipeline ═══ */}
      {isAdmin && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700 }}>Recon Pipeline</h2>
            <Link href="/vehicles" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textDecoration: 'none', minHeight: 'auto' }}>View all →</Link>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {(['mechanic', 'detailing', 'content', 'publish'] as const).map(stage => (
              <div key={stage} className="pipeline-chip" style={{ flex: '1 1 100px' }}>
                <p className="pipeline-chip-value">{data.pipeline[stage]}</p>
                <p className="pipeline-chip-label">{STAGE_LABELS[stage]}</p>
              </div>
            ))}
            <div style={{ width: 1, height: 40, background: 'var(--border)', flexShrink: 0 }} />
            <Link href="/external" style={{ flex: '1 1 100px', textDecoration: 'none', color: 'inherit' }}>
              <div className="pipeline-chip">
                <p className="pipeline-chip-value" style={{ color: data.pipeline.externalRepairs > 0 ? '#e67e22' : 'var(--text-muted)' }}>
                  {data.pipeline.externalRepairs}
                </p>
                <p className="pipeline-chip-label">External</p>
              </div>
            </Link>
            <Link href="/parts" style={{ flex: '1 1 100px', textDecoration: 'none', color: 'inherit' }}>
              <div className="pipeline-chip">
                <p className="pipeline-chip-value" style={{ color: data.pipeline.partsPending > 0 ? '#dc2626' : 'var(--text-muted)' }}>
                  {data.pipeline.partsPending}
                </p>
                <p className="pipeline-chip-label">Parts Pending</p>
              </div>
            </Link>
          </div>
        </div>
      )}

      {/* ═══ My Assignments — between pipeline and approvals so personal items aren't buried ═══ */}
      {hasAssignments && data.user.role !== 'shop_coordinator' && <MyAssignments data={data} refresh={async () => {
        const fresh = await fetch('/api/dashboard').then(r => r.json())
        setData(fresh)
      }} />}

      {!hasAssignments && !isAdmin && data.user.role !== 'shop_coordinator' && (
        <div className="card" style={{ textAlign: 'center', padding: 40, marginBottom: 32, color: 'var(--text-muted)' }}>
          No assignments right now. You're all caught up.
        </div>
      )}

      {/* ═══ New Vehicle Inspection Requests ═══ */}
      {isAdmin && (data.inspectionRequests || []).length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700 }}>
              New Vehicle Inspection Requests
              <span style={{
                fontSize: 12, fontWeight: 700, marginLeft: 10, padding: '3px 10px',
                borderRadius: 6, background: '#dbeafe', color: '#1d4ed8',
              }}>
                {data.inspectionRequests.reduce((sum, r) => sum + r.requests.length, 0)}
              </span>
            </h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {data.inspectionRequests.map(group => (
              <div key={group.stageId} className="card" style={{ padding: '16px 20px', borderLeft: '4px solid #2563eb' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Stock #{group.stockNumber}
                    </p>
                    <p style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>
                      {group.year} {group.make} {group.model}
                    </p>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                      {group.requests.length} task{group.requests.length === 1 ? '' : 's'} requested · est{' '}
                      {group.requests.reduce((sum, r) => sum + (r.estimatedHours || 0), 0)}h total
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={async () => {
                        await fetch(`/api/stages/${group.stageId}/inspection-requests`, {
                          method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'approveAll' }),
                        })
                        const fresh = await fetch('/api/dashboard').then(r => r.json())
                        setData(fresh)
                      }}
                      style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #16a34a', background: '#f0fdf4', color: '#16a34a', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                    >Approve all</button>
                    <button
                      onClick={async () => {
                        if (!confirm(`Decline all ${group.requests.length} requested task(s) for #${group.stockNumber}?`)) return
                        await fetch(`/api/stages/${group.stageId}/inspection-requests`, {
                          method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'declineAll' }),
                        })
                        const fresh = await fetch('/api/dashboard').then(r => r.json())
                        setData(fresh)
                      }}
                      style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #ef4444', background: '#fef2f2', color: '#ef4444', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                    >Decline all</button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {group.requests.map(req => (
                    <div key={req.index} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                      padding: '8px 12px', borderRadius: 8, background: '#fffbeb', border: '1px solid #fde68a',
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{req.item}</span>
                        {req.estimatedHours != null && (
                          <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: '#92400e', background: '#fef3c7', padding: '2px 8px', borderRadius: 100, border: '1px solid #fcd34d' }}>
                            {req.estimatedHours}h
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button
                          onClick={async () => {
                            await fetch(`/api/stages/${group.stageId}/inspection-requests`, {
                              method: 'POST', headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ action: 'approve', index: req.index }),
                            })
                            const fresh = await fetch('/api/dashboard').then(r => r.json())
                            setData(fresh)
                          }}
                          style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #16a34a', background: '#f0fdf4', color: '#16a34a', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                        >✓ Approve</button>
                        <button
                          onClick={async () => {
                            await fetch(`/api/stages/${group.stageId}/inspection-requests`, {
                              method: 'POST', headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ action: 'decline', index: req.index }),
                            })
                            const fresh = await fetch('/api/dashboard').then(r => r.json())
                            setData(fresh)
                          }}
                          style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #ef4444', background: '#fef2f2', color: '#ef4444', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                        >✗ Decline</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ Pending Approvals ═══ */}
      {isAdmin && (data.pendingApprovals || []).length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700 }}>
              Pending Approvals
              <span style={{
                fontSize: 12, fontWeight: 700, marginLeft: 10, padding: '3px 10px',
                borderRadius: 6, background: '#f59e0b20', color: '#f59e0b',
              }}>{data.pendingApprovals.length}</span>
            </h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.pendingApprovals.map(a => {
              const v = a.vehicleStage.vehicle
              const desc = `${v.year ?? ''} ${v.make} ${v.model}`.trim()
              const hasTasks = a.tasks && Array.isArray(a.tasks) && a.tasks.length > 0
              const isExpanded = expandedApproval === a.id
              const isTimeExt = a.taskName.startsWith('Time extension:')
              const requestedHrs = a.additionalHours || 0
              const currentHrs = adjustedHours[a.id] ?? requestedHrs
              const timeSince = (() => {
                const mins = Math.floor((Date.now() - new Date(a.createdAt).getTime()) / 60000)
                if (mins < 60) return `${mins}m ago`
                const hrs = Math.floor(mins / 60)
                if (hrs < 24) return `${hrs}h ago`
                return `${Math.floor(hrs / 24)}d ago`
              })()
              return (
                <div key={a.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  {/* Collapsed summary — click to expand */}
                  <div
                    onClick={() => {
                      const next = isExpanded ? null : a.id
                      setExpandedApproval(next)
                      if (next && adjustedHours[a.id] === undefined) {
                        setAdjustedHours(prev => ({ ...prev, [a.id]: requestedHrs }))
                      }
                    }}
                    style={{
                      padding: '14px 20px', cursor: 'pointer',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {isTimeExt ? 'Time Extension Request' : a.taskName}
                        </span>
                        {requestedHrs > 0 && (
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                            background: '#8b5cf620', color: '#8b5cf6', whiteSpace: 'nowrap',
                          }}>+{requestedHrs}h</span>
                        )}
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                        #{v.stockNumber} {desc} — {a.requestedBy.name} — {timeSince}
                      </p>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{
                      flexShrink: 0, transition: 'transform 0.2s',
                      transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    }}>
                      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div style={{ padding: '0 20px 16px', borderTop: '1px solid #f0f0f0' }}>
                      {/* Request details */}
                      <div style={{ padding: '12px 0 8px' }}>
                        <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>Request Details</p>
                        <div style={{ background: '#f9fafb', borderRadius: 10, padding: '12px 14px', border: '1px solid #f0f0f0' }}>
                          <p style={{ fontSize: 13, fontWeight: 600 }}>{a.taskName}</p>
                          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                            Stage: {STAGE_LABELS[a.vehicleStage.stage] || a.vehicleStage.stage}
                          </p>
                        </div>
                      </div>

                      {/* Task breakdown if multi-task */}
                      {hasTasks && (
                        <div style={{ marginBottom: 8 }}>
                          <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>Tasks</p>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {(a.tasks as Array<{ name: string; hours: number; note: string | null }>).map((t, i) => (
                              <div key={i} style={{
                                background: '#f9fafb', borderRadius: 10, padding: '10px 14px',
                                border: '1px solid #f0f0f0',
                              }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ fontSize: 13, fontWeight: 600 }}>{t.name}</span>
                                  <span style={{ fontSize: 12, fontWeight: 700, color: '#8b5cf6' }}>+{t.hours}h</span>
                                </div>
                                {t.note && (
                                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0', fontStyle: 'italic' }}>{t.note}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Editable hours */}
                      {requestedHrs > 0 && (
                        <div style={{ marginBottom: 12, marginTop: 4 }}>
                          <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>Hours to Add</p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <button
                              onClick={(e) => { e.stopPropagation(); setAdjustedHours(prev => ({ ...prev, [a.id]: Math.max(0.5, (prev[a.id] ?? requestedHrs) - 0.5) })) }}
                              style={{
                                width: 36, height: 36, borderRadius: 10, border: '1px solid #e0e0e0',
                                background: '#fff', fontSize: 18, fontWeight: 700, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}
                            >-</button>
                            <span style={{
                              fontSize: 20, fontWeight: 700, minWidth: 50, textAlign: 'center',
                              color: currentHrs !== requestedHrs ? '#8b5cf6' : 'var(--text-primary)',
                            }}>{currentHrs}h</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); setAdjustedHours(prev => ({ ...prev, [a.id]: (prev[a.id] ?? requestedHrs) + 0.5 })) }}
                              style={{
                                width: 36, height: 36, borderRadius: 10, border: '1px solid #e0e0e0',
                                background: '#fff', fontSize: 18, fontWeight: 700, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}
                            >+</button>
                            {currentHrs !== requestedHrs && (
                              <span style={{ fontSize: 11, color: '#8b5cf6', fontWeight: 600 }}>
                                (requested {requestedHrs}h)
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Action buttons */}
                      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                        <button
                          onClick={() => handleApproval(a.id, 'approved')}
                          disabled={approvingId === a.id}
                          style={{
                            flex: 1, padding: '12px 0', borderRadius: 10, border: 'none',
                            background: '#dffd6e', color: '#1a1a1a', fontWeight: 700, fontSize: 14,
                            cursor: 'pointer', opacity: approvingId === a.id ? 0.5 : 1,
                          }}
                        >Approve{currentHrs !== requestedHrs ? ` (${currentHrs}h)` : ''}</button>
                        <button
                          onClick={() => handleApproval(a.id, 'rejected')}
                          disabled={approvingId === a.id}
                          style={{
                            flex: 1, padding: '12px 0', borderRadius: 10,
                            border: '1px solid #ef4444', background: '#fff',
                            color: '#ef4444', fontWeight: 700, fontSize: 14,
                            cursor: 'pointer', opacity: approvingId === a.id ? 0.5 : 1,
                          }}
                        >Reject</button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ═══ Upcoming Events (admin) ═══ */}
      {isAdmin && data.upcomingEvents.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700 }}>Upcoming Events</h2>
            <Link href="/events" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textDecoration: 'none', minHeight: 'auto' }}>View all →</Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.upcomingEvents.map(event => {
              const daysUntil = Math.ceil((new Date(event.date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
              const healthColor = event.totalTasks === 0 ? 'var(--text-muted)' : event.progress === 100 ? '#16a34a' : daysUntil <= 3 && event.progress < 50 ? '#ef4444' : '#1a1a1a'
              return (
                <Link key={event.id} href={`/events/${event.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div className="card" style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>{event.name}</div>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {daysUntil <= 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : `${daysUntil} days`}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ flex: 1, height: 5, background: '#f0f0ec', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${event.progress}%`, height: '100%', background: healthColor, borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: healthColor }}>{event.progress}%</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{event.completedTasks}/{event.totalTasks}</span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* ═══ Upcoming Calendar (admin) ═══ */}
      {isAdmin && data.myCalendarItems.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700 }}>Upcoming Schedule</h2>
            <Link href="/calendar" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textDecoration: 'none', minHeight: 'auto' }}>View all →</Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.myCalendarItems.slice(0, 5).map(item => {
              const typeColor = CALENDAR_TYPE_COLORS[item.type as keyof typeof CALENDAR_TYPE_COLORS] || '#6b7280'
              const typeLabel = CALENDAR_TYPE_LABELS[item.type as keyof typeof CALENDAR_TYPE_LABELS] || item.type
              const itemDate = new Date(item.date)
              const isToday = new Date().toDateString() === itemDate.toDateString()
              return (
                <Link key={item.id} href={`/calendar/${item.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div className="card" style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14, borderLeft: `4px solid ${typeColor}` }}>
                    <div style={{ minWidth: 50, textAlign: 'center' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: isToday ? '#1a1a1a' : 'var(--text-secondary)' }}>
                        {isToday ? 'Today' : itemDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {itemDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{item.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                        {item.location && <span>{item.location} · </span>}
                        {typeLabel}
                      </div>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Fleet Financials Widget ────────────────────────────────────────

function FleetFinancialsWidget({ f }: { f: FleetFinancials }) {
  const m = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
  const totalAging = f.agingBuckets['0-30'] + f.agingBuckets['31-60'] + f.agingBuckets['61-90'] + f.agingBuckets['90+']

  const StatBlock = ({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: 'positive' | 'negative' | 'warning' }) => {
    const colors = {
      positive: '#16a34a',
      negative: '#ef4444',
      warning: '#d97706',
    }
    const valueColor = accent ? colors[accent] : 'var(--text-primary)'
    return (
      <div style={{ background: '#f8f8f5', borderRadius: 12, padding: '14px 16px', flex: 1, minWidth: 140 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</p>
        <p style={{ fontSize: 22, fontWeight: 800, color: valueColor, letterSpacing: '-0.02em', lineHeight: 1.1 }}>{value}</p>
        {sub && <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{sub}</p>}
      </div>
    )
  }

  return (
    <div style={{
      background: '#ffffff',
      border: '1px solid var(--border)',
      borderRadius: 20,
      padding: 20,
      marginBottom: 32,
      boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em' }}>Fleet Financials</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
            Across {f.activeVehicleCount} active vehicles · live
          </p>
        </div>
      </div>

      {/* Money stats */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <StatBlock
          label="Inventory Cost"
          value={m(f.totalInventoryCost)}
          sub={`${f.vehiclesWithCost} of ${f.activeVehicleCount} priced`}
        />
        <StatBlock
          label="Total Asking"
          value={m(f.totalAskingPrice)}
          sub={`${f.vehiclesWithPrice} of ${f.activeVehicleCount} priced`}
        />
        <StatBlock
          label="Potential Gross"
          value={m(f.potentialGrossProfit)}
          accent={f.potentialGrossProfit >= 0 ? 'positive' : 'negative'}
          sub="asking − cost across fleet"
        />
        <StatBlock
          label="Cost Adds Total"
          value={m(f.totalCostAdds)}
          accent="warning"
          sub="recon, parts, transport, etc."
        />
      </div>

      {/* Flooring + Aging */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Flooring */}
        <div style={{ background: '#f8f8f5', borderRadius: 12, padding: '14px 16px' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
            Flooring Exposure · {f.activeFlooredCount} active line{f.activeFlooredCount === 1 ? '' : 's'}
          </p>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <p style={{ fontSize: 24, fontWeight: 800, color: f.flooringExposure > 0 ? '#ef4444' : 'var(--text-muted)', letterSpacing: '-0.02em' }}>
              {m(f.flooringExposure)}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)' }}>
            <span>Principal: <strong style={{ color: 'var(--text-primary)' }}>{m(f.flooringPrincipal)}</strong></span>
            <span>Accrued: <strong style={{ color: 'var(--text-primary)' }}>{m(f.flooringAccrued)}</strong></span>
          </div>
        </div>

        {/* Aging buckets */}
        <div style={{ background: '#f8f8f5', borderRadius: 12, padding: '14px 16px' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
            Aging · {totalAging} vehicles with stock dates
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            {([
              ['0-30', '#dcfce7', '#16a34a', 'Fresh'],
              ['31-60', '#fef3c7', '#b45309', 'Aging'],
              ['61-90', '#fed7aa', '#c2410c', 'Stale'],
              ['90+', '#fee2e2', '#991b1b', 'Old'],
            ] as const).map(([key, bg, fg, label]) => (
              <div key={key} style={{ background: bg, borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                <p style={{ fontSize: 18, fontWeight: 800, color: fg, lineHeight: 1 }}>{f.agingBuckets[key as keyof typeof f.agingBuckets]}</p>
                <p style={{ fontSize: 10, fontWeight: 700, color: fg, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{key} · {label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
