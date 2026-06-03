'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

// ─── Types ─────────────────────────────────────────────────────────

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
  // inventory absorbed
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
}

type ActivityEvent = {
  id: string
  entityType: string
  action: string
  createdAt: string
  details: Record<string, unknown> | null
  actor: { name: string } | null
}

// ─── Helpers ───────────────────────────────────────────────────────

const money = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—')

const daysAgo = (s: string | null): number | null => {
  if (!s) return null
  const ms = Date.now() - new Date(s).getTime()
  if (!Number.isFinite(ms) || ms < 0) return null
  return Math.floor(ms / 86400000)
}

// MOCK demo flooring math (placeholder until real flooring model lands)
const demoFlooring = (cost: number | null, days: number | null) => {
  if (cost === null || days === null) return null
  const dailyRate = 0.00025 // 0.025% daily — placeholder
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

// ─── Main ──────────────────────────────────────────────────────────

export default function VehicleDetailV1() {
  const { id } = useParams()
  const router = useRouter()
  const [vehicle, setVehicle] = useState<Vehicle | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'inventory' | 'recon' | 'parts' | 'history' | 'activity'>('inventory')
  const [activity, setActivity] = useState<ActivityEvent[]>([])

  useEffect(() => {
    fetch(`/api/vehicles/${id}`)
      .then(async (r) => {
        if (!r.ok) return null
        const txt = await r.text()
        if (!txt) return null
        try { return JSON.parse(txt) } catch { return null }
      })
      .then((d) => setVehicle(d?.vehicle || null))
      .catch(() => setVehicle(null))
      .finally(() => setLoading(false))
    fetch(`/api/vehicles/${id}/activity`)
      .then(async (r) => {
        if (!r.ok) return null
        const txt = await r.text()
        if (!txt) return null
        try { return JSON.parse(txt) } catch { return null }
      })
      .then((d) => setActivity(d?.events || []))
      .catch(() => {})
  }, [id])

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
  if (!vehicle) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--danger)' }}>Vehicle not found</div>

  const days = daysAgo(vehicle.dateInStock)
  const profit = vehicle.askingPrice !== null && vehicle.vehicleCost !== null ? vehicle.askingPrice - vehicle.vehicleCost : null
  const margin = profit !== null && vehicle.askingPrice && vehicle.askingPrice > 0 ? (profit / vehicle.askingPrice) * 100 : null
  const flooring = demoFlooring(vehicle.vehicleCost, days)

  // ─── Demo "Cost Adds" (placeholder; real CostAdd model lands in next commit) ───
  const demoCostAdds = [
    { date: '2026-04-12', description: 'Recon parts', vendor: 'In-house', amount: 450 },
    { date: '2026-04-13', description: 'Transport from auction', vendor: 'Auction Logistics', amount: 200 },
    { date: '2026-04-14', description: 'Detail', vendor: 'Detailer', amount: 150 },
  ]
  const totalCostAdds = demoCostAdds.reduce((s, c) => s + c.amount, 0)
  const trueCost = (vehicle.vehicleCost || 0) + totalCostAdds

  return (
    <div style={{
      display: 'flex',
      gap: 20,
      maxWidth: '1600px',
      margin: '0 auto',
      padding: '16px 20px',
      alignItems: 'flex-start',
    }}>
      {/* ═══ Sidebar ═══ */}
      <aside style={{
        width: 320,
        flexShrink: 0,
        background: '#ffffff',
        border: '1px solid var(--border)',
        borderRadius: 20,
        padding: 20,
        position: 'sticky',
        top: 16,
      }}>
        {/* Photo placeholder */}
        <div style={{
          aspectRatio: '4/3',
          background: 'linear-gradient(135deg, #f0f0ec, #e8e8e4)',
          borderRadius: 12,
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-muted)',
          fontSize: 13,
          fontWeight: 500,
        }}>
          Photo · upload Phase 3
        </div>

        {/* Quick stats */}
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
            STOCK #{vehicle.stockNumber}
          </p>
          <h1 style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.2, marginBottom: 6 }}>
            {vehicle.year} {vehicle.make} {vehicle.model}
          </h1>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {vehicle.color && <Pill>{vehicle.color}</Pill>}
            {vehicle.trim && <Pill>{vehicle.trim}</Pill>}
          </div>
        </div>

        {/* Status block */}
        <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
          <div style={{ marginBottom: 8 }}>
            <SidebarLabel>Recon</SidebarLabel>
            <StatusBadge value={vehicle.status} type="recon" />
          </div>
          <div>
            <SidebarLabel>Inventory</SidebarLabel>
            <StatusBadge value={vehicle.inventoryStatus} type="inventory" />
          </div>
        </div>

        {/* Identity */}
        <SidebarSection>
          <SidebarField label="VIN" value={vehicle.vin || '—'} mono />
          <SidebarField label="Stock #" value={vehicle.stockNumber} mono />
          <SidebarField label="Color" value={vehicle.color || '—'} />
          <SidebarField label="Mileage" value={vehicle.mileage !== null ? `${vehicle.mileage.toLocaleString()} mi` : '—'} />
          <SidebarField label="Location" value={vehicle.location || '—'} />
        </SidebarSection>

        {/* Dates */}
        <SidebarSection title="Dates">
          <SidebarField label="In Stock" value={fmtDate(vehicle.dateInStock)} />
          {days !== null && <SidebarField label="Days Held" value={`${days}d`} />}
          {vehicle.completedAt && <SidebarField label="Recon Done" value={fmtDate(vehicle.completedAt)} />}
        </SidebarSection>

        {/* Source */}
        {(vehicle.purchaseType || vehicle.purchasedFrom) && (
          <SidebarSection title="Source">
            {vehicle.purchaseType && <SidebarField label="Type" value={vehicle.purchaseType} />}
            {vehicle.purchasedFrom && <SidebarField label="From" value={vehicle.purchasedFrom} />}
          </SidebarSection>
        )}

        {/* Notes */}
        {vehicle.notes && (
          <SidebarSection title="Notes">
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{vehicle.notes}</p>
          </SidebarSection>
        )}
      </aside>

      {/* ═══ Main area ═══ */}
      <main style={{ flex: 1, minWidth: 0 }}>
        {/* Header bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <button onClick={() => router.back()} style={{ color: 'var(--text-muted)', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', minHeight: 'auto' }}>
            ← Back
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={btnStyle('secondary')}>Edit</button>
            <button style={btnStyle('primary')}>Mark Sold</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 24, overflowX: 'auto' }}>
          {(['inventory', 'recon', 'parts', 'history', 'activity'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              style={{
                padding: '12px 18px',
                border: 'none',
                background: activeTab === t ? '#ffffff' : 'transparent',
                color: activeTab === t ? 'var(--text-primary)' : 'var(--text-muted)',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                borderBottom: activeTab === t ? '2px solid #1a1a1a' : '2px solid transparent',
                textTransform: 'capitalize',
                minHeight: 'auto',
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Content */}
        {activeTab === 'inventory' && (
          <>
            {/* Two-column: Money + Title */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <Card title="Money">
                <FieldRow label="Vehicle Cost" value={money(vehicle.vehicleCost)} />
                <FieldRow label="Asking Price" value={money(vehicle.askingPrice)} />
                <FieldRow
                  label="Spread"
                  value={
                    profit !== null ? (
                      <span style={{ color: profit >= 0 ? '#16a34a' : '#ef4444', fontWeight: 700 }}>
                        {money(profit)} {margin !== null && <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>({margin.toFixed(1)}%)</span>}
                      </span>
                    ) : '—'
                  }
                />
                <FieldRow label="Purchase Type" value={vehicle.purchaseType || '—'} />
              </Card>
              <Card title="Title & Location">
                <FieldRow label="Title Status" value={vehicle.titleStatus || '—'} />
                <FieldRow label="Location" value={vehicle.location || '—'} />
                <FieldRow label="Inventory Status" value={vehicle.inventoryStatus || '—'} />
              </Card>
            </div>

            {/* Cost Adds */}
            <Card
              title="Cost Adds"
              headerAction={<button style={btnStyle('outline')}>+ Add Cost</button>}
              footer={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>True cost (vehicle + adds)</span>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{money(trueCost)}</span>
                </div>
              }
            >
              {demoCostAdds.map((c, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 140px 80px', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtDate(c.date)}</span>
                  <span style={{ fontSize: 13 }}>{c.description}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.vendor}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, textAlign: 'right' }}>{money(c.amount)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>Total cost adds</span>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{money(totalCostAdds)}</span>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 6 }}>
                Demo data — real CostAdd backend lands next.
              </p>
            </Card>

            {/* Flooring */}
            <Card title="Flooring" subtitle={flooring ? `${flooring.lender} · ${flooring.dailyRate}%/day` : 'No flooring data'}>
              {flooring ? (
                <>
                  <FieldRow label="Principal" value={money(flooring.principal)} />
                  <FieldRow label="Accrued Interest" value={`${money(flooring.accruedInterest)} (${flooring.daysHeld} days)`} />
                  <FieldRow label="Cost to Keep" value={`${money(flooring.costPerDay)}/day`} />
                  <FieldRow label="Payoff Today" value={<span style={{ fontWeight: 700 }}>{money(flooring.payoff)}</span>} />
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 6 }}>
                    Demo flooring math — real Flooring model lands next. Rate hardcoded at 0.025% daily.
                  </p>
                </>
              ) : (
                <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Not financed.</p>
              )}
            </Card>

            {/* Description */}
            {vehicle.vehicleInfo && (
              <Card title="Description">
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{vehicle.vehicleInfo}</p>
              </Card>
            )}
          </>
        )}

        {activeTab === 'activity' && (
          <Card title={`Activity · ${activity.length} events`}>
            {activity.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No activity yet.</p>
            ) : (
              activity.slice(0, 30).map((e) => (
                <div key={e.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{e.action.replace(/_/g, ' ')}</span>
                      <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{e.entityType}</span>
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>{fmtDate(e.createdAt)}</span>
                  </div>
                  {e.actor && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>by {e.actor.name}</p>}
                </div>
              ))
            )}
          </Card>
        )}

        {(activeTab === 'recon' || activeTab === 'parts' || activeTab === 'history') && (
          <Card title={`${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} (preview)`}>
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              The {activeTab} tab will use the existing recon UI from the current detail page. Layout choice here is about Inventory + tabs shell only.
            </p>
          </Card>
        )}
      </main>
    </div>
  )
}

// ─── UI primitives ──────────────────────────────────────────────────

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 11,
      padding: '3px 8px',
      background: '#f0f0ec',
      color: 'var(--text-secondary)',
      borderRadius: 6,
      fontWeight: 500,
    }}>{children}</span>
  )
}

function SidebarLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
      {children}
    </p>
  )
}

function StatusBadge({ value, type }: { value: string | null; type: 'recon' | 'inventory' }) {
  if (!value) return <Pill>—</Pill>
  const colors: Record<string, { bg: string; color: string }> = {
    mechanic: { bg: '#fef3c7', color: '#92400e' },
    detailing: { bg: '#dbeafe', color: '#1e40af' },
    content: { bg: '#e0e7ff', color: '#3730a3' },
    publish: { bg: '#d1fae5', color: '#065f46' },
    completed: { bg: '#f0f0ec', color: '#525252' },
    inventory_only: { bg: '#fef3c7', color: '#92400e' },
    external: { bg: '#fee2e2', color: '#991b1b' },
    in_stock: { bg: '#d1fae5', color: '#065f46' },
    in_recon: { bg: '#fef3c7', color: '#92400e' },
    sold: { bg: '#f0f0ec', color: '#525252' },
    external_repair: { bg: '#fee2e2', color: '#991b1b' },
  }
  const c = colors[value] || { bg: '#f0f0ec', color: 'var(--text-muted)' }
  return (
    <span style={{
      fontSize: 12,
      padding: '4px 10px',
      background: c.bg,
      color: c.color,
      borderRadius: 8,
      fontWeight: 600,
      display: 'inline-block',
    }}>
      {value.replace(/_/g, ' ')}
    </span>
  )
}

function SidebarSection({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
      {title && <SidebarLabel>{title}</SidebarLabel>}
      {children}
    </div>
  )
}

function SidebarField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '4px 0', gap: 12 }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, fontFamily: mono ? 'ui-monospace, monospace' : undefined, textAlign: 'right', wordBreak: 'break-all' }}>{value}</span>
    </div>
  )
}

function Card({ title, subtitle, children, headerAction, footer }: { title: string; subtitle?: string; children: React.ReactNode; headerAction?: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div style={{
      background: '#ffffff',
      border: '1px solid var(--border)',
      borderRadius: 16,
      padding: '16px 20px',
      marginBottom: 16,
      boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</p>
          {subtitle && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{subtitle}</p>}
        </div>
        {headerAction}
      </div>
      <div>{children}</div>
      {footer}
    </div>
  )
}

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '8px 0', borderBottom: '1px solid var(--border)', gap: 12 }}>
      <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 600, textAlign: 'right', wordBreak: 'break-word' }}>{value}</span>
    </div>
  )
}

function btnStyle(variant: 'primary' | 'secondary' | 'outline'): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: '8px 14px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    minHeight: 'auto',
  }
  if (variant === 'primary') return { ...base, background: '#1a1a1a', color: '#dffd6e', border: 'none' }
  if (variant === 'secondary') return { ...base, background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)' }
  return { ...base, background: '#ffffff', color: 'var(--text-secondary)', border: '1px solid var(--border)' }
}
