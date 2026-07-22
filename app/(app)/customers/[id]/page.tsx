'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
// Shared customer-creation modal — single source of truth lives next
// to the vehicle Purchase Info flow that already used it.  Importing
// here means both pages stay in lockstep instead of drifting via
// duplicate quick-add forms.
import { AddCustomerModal } from '@/components/AddCustomerModal'

// ─── Types ────────────────────────────────────────────────────────────

type VehicleSummary = {
  id: string
  stockNumber: string
  year: number | null
  make: string | null
  model: string | null
  color?: string | null
  askingPrice?: number | null
  status?: string | null
  location?: string | null
  mileage?: number | null
  vehicleInfo?: string | null
}

type VehicleInterest = {
  id: string
  vehicleId: string | null
  make: string | null
  model: string | null
  yearMin: number | null
  yearMax: number | null
  priceMax: number | null
  createdAt: string
  vehicle: VehicleSummary | null
}

type Opportunity = {
  id: string
  pipeline: { id: string; name: string; color: string }
  stage: { id: string; name: string; type: string }
  assignee: { id: string; name: string } | null
  vehicle: { id: string; stockNumber: string; year: number; make: string; model: string; status: string | null } | null
  wonAt: string | null
  lostAt: string | null
  value: number | null
  createdAt: string
}

type Customer = {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  secondaryPhone: string | null
  homePhone: string | null
  workPhone: string | null
  contactType: string
  customerStatus: string | null
  dateOfBirth: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  gender: string | null
  ssn: string | null
  idType: string | null
  idState: string | null
  idNo: string | null
  idIssuedDate: string | null
  idExpirationDate: string | null
  leadType: string | null
  leadSource: string | null
  inquiryType: string | null
  cashDown: number | null
  salesRepId: string | null
  isInShowroom: boolean
  employerName: string | null
  employerPhone: string | null
  employerAddress: string | null
  employerYears: number | null
  employerMonthlyIncome: number | null
  referrerName: string | null
  referrerPhone: string | null
  referrerEmail: string | null
  referrerAddress: string | null
  referrerContactId: string | null
  coBuyerContactId: string | null
  coBuyerRelationship: string | null
  tags: string[]
  notes: string | null
  createdAt: string
  createdBy: { id: string; name: string } | null
  vehicleInterests: VehicleInterest[]
  opportunities: Opportunity[]
}

type CoBuyer = {
  id: string
  firstName: string
  lastName: string
  phone: string | null
  homePhone: string | null
  workPhone: string | null
  email: string | null
  leadType: string | null
  leadSource: string | null
  inquiryType: string | null
} | null

type ProfilePayload = {
  contact: Customer
  salesRep: { id: string; name: string } | null
  coBuyer: CoBuyer
  purchasedVehicles: Array<{
    id: string; stockNumber: string; year: number; make: string; model: string
    wonAt: string | null; value: number | null
  }>
}

// ─── Pipeline stages (DealerCenter parity) ────────────────────────────

const PIPELINE_STAGES = [
  'New',
  'Contact Attempt',
  'Contacted',
  'Appt. Scheduled',
  'Working Deal',
  'Missed Appt.',
  'Visit Followup',
  'Sold',
  'Lost',
] as const

type PipelineStage = typeof PIPELINE_STAGES[number]

function derivePipelineStage(c: Customer): PipelineStage | null {
  if (c.opportunities.some(o => o.wonAt)) return 'Sold'
  if (c.opportunities.length > 0 && c.opportunities.every(o => o.lostAt)) return 'Lost'
  const active = c.opportunities.find(o => !o.wonAt && !o.lostAt)
  if (active) {
    const match = PIPELINE_STAGES.find(s => s.toLowerCase() === active.stage.name.toLowerCase())
    if (match) return match
  }
  if (c.customerStatus) {
    const match = PIPELINE_STAGES.find(s => s.toLowerCase() === c.customerStatus!.toLowerCase())
    if (match) return match
  }
  return null
}

// ─── Style helpers ────────────────────────────────────────────────────

function formatPhone(raw: string | null) {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  if (digits.length === 11 && digits.startsWith('1')) return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  return raw
}

function typeBadge(type: string) {
  switch (type) {
    case 'customer': return { label: 'Customer', bg: '#dcfce7', fg: '#15803d' }
    case 'vendor':   return { label: 'Vendor',   bg: '#fef3c7', fg: '#a16207' }
    default:         return { label: 'Lead',     bg: '#dbeafe', fg: '#1e40af' }
  }
}

// Shared premium elevation: an ultra-fine inner highlight (white) reads as a
// glass rim, while a wide soft drop-shadow lets cards stack elegantly over the
// gradient background. A near-invisible dark ring keeps the edge legible on
// light areas where the white highlight alone would vanish.
const premiumElevation = {
  border: '1px solid rgba(255, 255, 255, 0.6)',
  boxShadow:
    '0 10px 40px rgba(0, 0, 0, 0.03), 0 1px 2px rgba(15, 23, 42, 0.03), 0 0 0 1px rgba(15, 23, 42, 0.04)',
} as const

const sectionCardStyle: React.CSSProperties = {
  background: '#ffffff',
  borderRadius: 14,
  padding: 20,
  ...premiumElevation,
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: '#475569',
  letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16,
}

// ─── Page ─────────────────────────────────────────────────────────────

export default function CustomerProfilePage() {
  const params = useParams()
  const router = useRouter()
  const id = Array.isArray(params.id) ? params.id[0] : (params.id as string)

  const [data, setData] = useState<ProfilePayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [buyerTab, setBuyerTab] = useState<'buyer' | 'cobuyer' | 'referrer'>('buyer')
  const [saving, setSaving] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  // Sales-rep picker options — anyone with role in ('sales', 'sales_manager').
  // Right now that's just Andrej (sales_manager); list grows automatically
  // as reps are added to the team.
  const [salesRepOptions, setSalesRepOptions] = useState<SelectOption[]>([])
  // Desktop gets the DealerCenter-style left buyer column; below 1024px the
  // page keeps its original stacked layout untouched. Defaults false — the
  // layout only renders after the data fetch resolves, well past hydration,
  // so there's no server/client mismatch to worry about.
  const [isDesktop, setIsDesktop] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const onChange = () => setIsDesktop(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // One-shot fetch on mount.  Cheap (a few rows), so no caching layer needed
  // — invalidating the cache when a user is added would be the only reason.
  useEffect(() => {
    fetch('/api/users?roles=sales,sales_manager')
      .then(r => r.json())
      .then(d => {
        const users = (d.users || []) as Array<{ id: string; name: string }>
        setSalesRepOptions(users.map(u => ({ label: u.name, value: u.id })))
      })
      .catch(() => { /* silent — picker just shows the existing salesRepName */ })
  }, [])

  const load = useCallback(() => {
    setLoading(true)
    fetch(`/api/customers/${id}`).then(r => r.json()).then(d => {
      setData(d)
      setLoading(false)
    })
  }, [id])

  // Silent refetch — updates the data in place without the full-page
  // "Loading…" flash, so adding/removing a vehicle feels instant.
  const refresh = useCallback(async () => {
    const d = await fetch(`/api/customers/${id}`).then(r => r.json())
    setData(d)
  }, [id])

  useEffect(() => { load() }, [load])

  const addInterest = useCallback(async (vehicleId: string) => {
    await fetch(`/api/customers/${id}/interests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vehicleId }),
    })
    await refresh()
  }, [id, refresh])

  const removeInterest = useCallback(async (interestId: string) => {
    await fetch(`/api/customers/${id}/interests?interestId=${interestId}`, { method: 'DELETE' })
    await refresh()
  }, [id, refresh])

  const commitField = useCallback(async (field: string, value: string | null) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/customers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      if (res.ok) {
        // Silent refresh — no full-page "Loading…" flash on every save
        // (detaching a co-buyer, blurring a field, etc.).
        await refresh()
      }
    } finally {
      setSaving(false)
    }
  }, [id, refresh])

  // Multi-field variant — used when editing Buyer Name, which has to
  // split into firstName + lastName under the hood as a single PATCH so
  // we don't trigger two sequential refetches.
  const commitFields = useCallback(async (patch: Record<string, unknown>) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/customers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (res.ok) {
        await refresh()
      }
    } finally {
      setSaving(false)
    }
  }, [id, refresh])

  // Buyer Name handler — splits "First Last" into the underlying name
  // fields.  Everything past the first whitespace becomes the last name
  // (handles middle names without losing them).
  const saveBuyerName = useCallback((full: string | null) => {
    if (!full) return
    const trimmed = full.trim()
    if (!trimmed) return
    const idx = trimmed.indexOf(' ')
    const firstName = idx === -1 ? trimmed : trimmed.slice(0, idx)
    const lastName = idx === -1 ? '' : trimmed.slice(idx + 1).trim()
    return commitFields({ firstName, lastName })
  }, [commitFields])

  if (loading || !data) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
  }

  const { contact, salesRep, coBuyer, purchasedVehicles } = data
  const fullName = `${contact.firstName} ${contact.lastName}`
  const badge = typeBadge(contact.contactType)
  const pipelineStage = derivePipelineStage(contact)
  const daysOld = Math.floor((Date.now() - new Date(contact.createdAt).getTime()) / 86400000)
  const activeOppCount = contact.opportunities.filter(o => !o.wonAt && !o.lostAt).length

  // ─── Shared building blocks — rendered once, placed differently by the
  //     desktop (DealerCenter-style left column) vs. stacked layouts. ───

  const buyerPanel = (
    <div style={{
      ...sectionCardStyle,
      ...(isDesktop
        // Sticky so buyer info stays pinned while the activity feed scrolls.
        // Desktop (≥768px) uses the fixed left sidebar — no top bar — so a
        // small offset matching the main-content padding is all it needs.
        ? { position: 'sticky' as const, top: 16, alignSelf: 'start' as const }
        : {}),
    }}>
      <BuyerTabStrip active={buyerTab} onChange={setBuyerTab} />
      {buyerTab === 'buyer' && (
        <BuyerForm
          contact={contact}
          salesRepName={salesRep?.name || null}
          salesRepOptions={salesRepOptions}
          onSave={commitField}
          onSaveName={saveBuyerName}
        />
      )}
      {buyerTab === 'cobuyer' && (
        <CoBuyerPicker
          coBuyer={coBuyer}
          relationship={contact.coBuyerRelationship}
          onAttach={(id) => commitField('coBuyerContactId', id)}
          onDetach={() => commitField('coBuyerContactId', null)}
          onRelationship={(v) => commitField('coBuyerRelationship', v)}
        />
      )}
      {buyerTab === 'referrer' && (
        <ReferrerForm
          contact={contact}
          onSave={commitField}
        />
      )}
    </div>
  )

  // Vehicles rail — on desktop it sits to the right of the Lead workspace;
  // stacked layout keeps it beside the buyer card as before. The "+ Add"
  // tile flex-grows so the column never reads as an empty void.
  const vehiclesRail = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ ...sectionCardStyle, flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={sectionTitleStyle}>Interested Vehicles ({contact.vehicleInterests.length})</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
          {contact.vehicleInterests.map(vi => (
            <InterestCard key={vi.id} interest={vi} onRemove={() => removeInterest(vi.id)} />
          ))}
          <AddInterestTile
            empty={contact.vehicleInterests.length === 0}
            onClick={() => setPickerOpen(true)}
          />
        </div>
      </div>

      {purchasedVehicles.length > 0 && (
        <div style={sectionCardStyle}>
          <div style={sectionTitleStyle}>Purchased ({purchasedVehicles.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {purchasedVehicles.map(pv => (
              <Link key={pv.id} href={`/vehicles/${pv.id}`} style={{
                display: 'block', padding: '10px 12px', borderRadius: 8,
                background: '#f0fdf4', border: '1px solid #bbf7d0',
                textDecoration: 'none',
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#0a0a0a' }}>
                  {pv.year} {pv.make} {pv.model}
                </div>
                <div style={{ fontSize: 10, color: '#15803d', marginTop: 2 }}>
                  Stock #{pv.stockNumber}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  const chevron = <ChevronPipeline current={pipelineStage} />
  const compliance = <ComplianceRow />
  const statusGrid = (
    <StatusInfoGrid
      daysOld={daysOld}
      activeOpps={activeOppCount}
      interestedCount={contact.vehicleInterests.length}
      purchasedCount={purchasedVehicles.length}
    />
  )

  return (
    <div style={{ maxWidth: 1480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ─── 1. Header: back + name + actions ─── */}
      <ProfileHeader
        fullName={fullName}
        badge={badge}
        stage={pipelineStage}
        daysOld={daysOld}
        createdByName={contact.createdBy?.name}
        saving={saving}
        onBack={() => router.push('/customers')}
      />

      {isDesktop ? (
        /* ─── Desktop: DealerCenter-style split — persistent buyer column on
               the left, everything else (pipeline, compliance, status, lead
               workspace + vehicles rail) flows in the main column. ─── */
        <div style={{ display: 'grid', gridTemplateColumns: '300px minmax(0, 1fr)', gap: 14, alignItems: 'start' }}>
          {buyerPanel}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
            {chevron}
            {compliance}
            {statusGrid}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 14, alignItems: 'start' }}>
              <LeadWorkspace contactId={contact.id} />
              {vehiclesRail}
            </div>
          </div>
        </div>
      ) : (
        /* ─── Stacked (narrow / mobile): original layout, untouched. ─── */
        <>
          {chevron}
          {compliance}
          {statusGrid}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr minmax(300px, 360px)', gap: 14, alignItems: 'stretch' }}>
            {buyerPanel}
            {vehiclesRail}
          </div>
          <LeadWorkspace contactId={contact.id} />
        </>
      )}

      {pickerOpen && (
        <VehiclePicker
          existingVehicleIds={contact.vehicleInterests.map(vi => vi.vehicleId).filter(Boolean) as string[]}
          onClose={() => setPickerOpen(false)}
          onPick={async (vehicleId) => { await addInterest(vehicleId); setPickerOpen(false) }}
        />
      )}
    </div>
  )
}

// ─── Header ───────────────────────────────────────────────────────────

function ProfileHeader({
  fullName, badge, stage, daysOld, createdByName, saving, onBack,
}: {
  fullName: string
  badge: { label: string; bg: string; fg: string }
  stage: PipelineStage | null
  daysOld: number
  createdByName?: string | null
  saving: boolean
  onBack: () => void
}) {
  const statusPill = stage ? stagePillColors(stage) : null

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 16, flexWrap: 'wrap',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button
          onClick={onBack}
          style={{
            padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(15,23,42,0.10)',
            background: '#ffffff', cursor: 'pointer', fontSize: 13, color: '#475569', fontWeight: 600,
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
          Customers
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0a0a0a', letterSpacing: '-0.01em' }}>{fullName}</h1>
          {statusPill && (
            <span style={{
              fontSize: 10.5, fontWeight: 700, padding: '4px 10px', borderRadius: 999,
              background: statusPill.bg, color: statusPill.fg,
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>{stage}</span>
          )}
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
            background: badge.bg, color: badge.fg, textTransform: 'uppercase', letterSpacing: '0.04em',
          }}>{badge.label}</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 4 }}>
          {daysOld === 0 ? 'Added today' : `Added ${daysOld}d ago`}
          {createdByName && <> · by {createdByName}</>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {saving && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Saving…</span>}
        <HeaderAction label="Check-In" />
        <HeaderAction label="Start Desk" />
        <HeaderAction label="Start Deal" primary />
      </div>
    </div>
  )
}

function HeaderAction({ label, primary }: { label: string; primary?: boolean }) {
  return (
    <button style={{
      padding: '8px 14px', borderRadius: 8,
      border: primary ? 'none' : '1px solid rgba(15,23,42,0.10)',
      background: primary ? '#1a1a1a' : '#fff',
      color: primary ? '#dffd6e' : '#475569',
      fontSize: 13, fontWeight: 600, cursor: 'pointer',
    }}>{label}</button>
  )
}

function stagePillColors(stage: PipelineStage): { bg: string; fg: string } {
  const lc = stage.toLowerCase()
  if (lc === 'sold') return { bg: '#dcfce7', fg: '#15803d' }
  if (lc === 'lost') return { bg: '#fee2e2', fg: '#991b1b' }
  if (lc.includes('working') || lc.includes('appt')) return { bg: '#fef3c7', fg: '#a16207' }
  if (lc.includes('contact')) return { bg: '#dbeafe', fg: '#1e40af' }
  if (lc === 'new') return { bg: '#ede9fe', fg: '#6d28d9' }
  return { bg: '#f1f5f9', fg: '#475569' }
}

// ─── Chevron pipeline ─────────────────────────────────────────────────

function ChevronPipeline({ current }: { current: PipelineStage | null }) {
  const stages = PIPELINE_STAGES
  const currentIdx = current ? stages.indexOf(current) : -1

  return (
    <div style={{
      background: '#ffffff',
      borderRadius: 14,
      padding: 8,
      display: 'flex', alignItems: 'stretch', gap: 0,
      ...premiumElevation,
    }}>
      {stages.map((stage, i) => {
        const isCurrent = stage === current
        const isPast = currentIdx > i
        const isLost = stage === 'Lost'
        const isFirst = i === 0
        const isLast = i === stages.length - 1
        return (
          <ChevronStage
            key={stage}
            label={stage}
            isCurrent={isCurrent}
            isPast={isPast}
            isLost={isLost}
            isFirst={isFirst}
            isLast={isLast}
          />
        )
      })}
    </div>
  )
}

function ChevronStage({
  label, isCurrent, isPast, isLost, isFirst, isLast,
}: {
  label: string
  isCurrent: boolean
  isPast: boolean
  isLost: boolean
  isFirst: boolean
  isLast: boolean
}) {
  // Visual states:
  //  • Current  → luminous near-white glass, dark text, lifted + glowing.
  //  • Past      → soft green tint, confident but receded.
  //  • Future    → semi-transparent with a fine hairline (drop-shadow outline).
  //  • Lost      → faint red when not the active step.
  // clip-path strips box-shadow/border along the arrow edge, so elevation and
  // the hairline are both done with filter: drop-shadow(), which traces the
  // clipped silhouette instead of the bounding box.
  let bg = 'rgba(255,255,255,0.45)'
  let fg = '#94a3b8'
  let fontWeight = 700
  let filter = 'drop-shadow(0 0 0.6px rgba(15,23,42,0.16))'
  let transform = 'translateY(0) scale(1)'
  let zIndex = 1

  if (isCurrent) {
    fg = isLost ? '#991b1b' : '#0f172a'
    bg = isLost
      ? 'linear-gradient(180deg, #ffffff 0%, #fef4f4 100%)'
      : 'linear-gradient(180deg, #ffffff 0%, #f3fbf6 100%)'
    fontWeight = 800
    filter = isLost
      ? 'drop-shadow(0 6px 14px rgba(220,38,38,0.22))'
      : 'drop-shadow(0 6px 14px rgba(16,185,129,0.28))'
    transform = 'translateY(-1px) scale(1.045)'
    zIndex = 5
  } else if (isPast) {
    bg = 'linear-gradient(180deg, #ecfdf3 0%, #dcfce7 100%)'
    fg = '#15803d'
    filter = 'drop-shadow(0 0 0.6px rgba(21,128,61,0.18))'
  } else if (isLost) {
    bg = 'rgba(254,242,242,0.7)'
    fg = '#b91c1c'
    filter = 'drop-shadow(0 0 0.6px rgba(185,28,28,0.18))'
  }

  // Chevron arrow geometry — 12px tip, overlap via negative margin
  // so each stage flows into the next without a visible gap.
  const NOTCH = 12
  const clipPath = isFirst
    ? `polygon(0 0, calc(100% - ${NOTCH}px) 0, 100% 50%, calc(100% - ${NOTCH}px) 100%, 0 100%)`
    : isLast
      ? `polygon(0 0, 100% 0, 100% 100%, 0 100%, ${NOTCH}px 50%)`
      : `polygon(0 0, calc(100% - ${NOTCH}px) 0, 100% 50%, calc(100% - ${NOTCH}px) 100%, 0 100%, ${NOTCH}px 50%)`

  return (
    <div style={{
      flex: 1, minWidth: 72,
      height: 36,
      background: bg, color: fg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 10.5, fontWeight, textAlign: 'center',
      letterSpacing: isCurrent ? '0.01em' : '0.005em',
      padding: isFirst ? `0 ${NOTCH + 4}px 0 12px` : `0 ${NOTCH + 4}px 0 ${NOTCH + 8}px`,
      clipPath,
      filter,
      transform,
      transformOrigin: 'center',
      zIndex,
      position: 'relative',
      marginLeft: isFirst ? 0 : -NOTCH,
      transition: 'transform 160ms cubic-bezier(0.22,1,0.36,1), filter 160ms ease, color 140ms ease',
    }}>
      {label}
    </div>
  )
}

// ─── Compliance circles row ───────────────────────────────────────────

const COMPLIANCE_CHECKS = [
  'Credit Report', 'Pre-Qual', 'ID Verification', 'OFAC', 'Adverse Action', 'CSDEN', 'Privacy Notice',
] as const

function ComplianceRow() {
  return (
    // Slim strip — every check is still a placeholder (N/A), so it gets one
    // quiet line instead of a full-height row of dead space. Grows back into
    // real status circles when compliance features land.
    <div style={{
      background: '#ffffff',
      borderRadius: 14,
      padding: '9px 18px',
      display: 'flex', justifyContent: 'space-around', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      ...premiumElevation,
    }}>
      {COMPLIANCE_CHECKS.map(check => (
        <div key={check} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            width: 18, height: 18, borderRadius: '50%',
            background: '#f1f5f9', color: '#94a3b8',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 7.5, fontWeight: 700, letterSpacing: '0.04em',
          }}>N/A</span>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: '#64748b' }}>{check}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Status info grid ─────────────────────────────────────────────────

function StatusInfoGrid({
  daysOld, activeOpps, interestedCount, purchasedCount,
}: {
  daysOld: number
  activeOpps: number
  interestedCount: number
  purchasedCount: number
}) {
  return (
    // 12 cells arranged to land as a clean 6×2 in the desktop main column
    // (minmax tuned so auto-fit resolves to 6 there): appointments / tasks /
    // deposit / age on the top row, deal counts + activity trail on the
    // bottom — no ragged orphan row.
    <div style={{
      background: '#ffffff',
      borderRadius: 14,
      padding: '14px 20px',
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(128px, 1fr))',
      gap: '14px 18px',
      ...premiumElevation,
    }}>
      <StatusInfoRow label="Next Appt." value="Not Scheduled" />
      <StatusInfoRow label="Last Appt." value="None" />
      <StatusInfoRow label="Overdue Tasks" value="None" />
      <StatusInfoRow label="Pending Tasks" value="None" />
      <StatusInfoRow label="Deposit" value="" action={{ label: '+ Take Deposit', onClick: () => {} }} />
      <StatusInfoRow label="Days Old" value={String(daysOld)} strong />
      <StatusInfoRow label="Active Deals" value={String(activeOpps)} strong />
      <StatusInfoRow label="Interested" value={String(interestedCount)} strong />
      <StatusInfoRow label="Purchased" value={String(purchasedCount)} strong />
      <StatusInfoRow label="Last Contacted" value="—" muted />
      <StatusInfoRow label="Last Contact Attempt" value="—" muted />
      <StatusInfoRow label="Days Since Activity" value="—" muted />
    </div>
  )
}

/**
 * One metric cell. The label is small / all-caps / muted; the value is larger,
 * heavier and solid-dark so it pulls the eye when scanning the grid. `muted`
 * dims placeholder values (the "—" cells); `strong` is the default emphatic
 * value treatment; `action` renders an inline text button beneath the value.
 */
function StatusInfoRow({
  label, value, muted, strong, action,
}: {
  label: string
  value: string
  muted?: boolean
  strong?: boolean
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</span>
      {action ? (
        // The action button sits in the value's place — no placeholder dash.
        <button
          onClick={action.onClick}
          style={{
            // minHeight 0 beats the global `button { min-height }` tap-target
            // rule, which otherwise inflates this button and knocks it out of
            // line with the neighboring metric values.
            alignSelf: 'flex-start', padding: 0, border: 'none', minHeight: 0,
            background: 'none', cursor: 'pointer',
            fontSize: 13.5, lineHeight: 1.1, fontWeight: 700, color: '#15803d',
            letterSpacing: '-0.01em', whiteSpace: 'nowrap',
            transition: 'opacity 120ms ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.65' }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
        >
          {action.label}
        </button>
      ) : (
        <span style={{
          fontSize: 13.5,
          lineHeight: 1.1,
          color: muted ? '#cbd5e1' : strong ? '#0a0a0a' : '#1e293b',
          fontWeight: muted ? 500 : 700,
          letterSpacing: '-0.01em',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{value}</span>
      )}
    </div>
  )
}

// ─── Buyer / Co-Buyer / Referrer tab strip ────────────────────────────

function BuyerTabStrip({
  active, onChange,
}: {
  active: 'buyer' | 'cobuyer' | 'referrer'
  onChange: (t: 'buyer' | 'cobuyer' | 'referrer') => void
}) {
  const tabs: { key: 'buyer' | 'cobuyer' | 'referrer'; label: string }[] = [
    { key: 'buyer', label: 'Buyer' },
    { key: 'cobuyer', label: 'Co-Buyer' },
    { key: 'referrer', label: 'Referrer' },
  ]
  return (
    // Single row — three equal-width segments spanning the panel, so the
    // strip stays one line even in the narrow desktop buyer column.
    <div style={{
      display: 'flex', gap: 4, padding: 4, background: '#f3f4f6',
      borderRadius: 10, marginBottom: 18,
    }}>
      {tabs.map(t => {
        const isActive = active === t.key
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            style={{
              flex: 1, minWidth: 0,
              padding: '7px 6px', borderRadius: 7, border: 'none',
              background: isActive ? '#fff' : 'transparent',
              color: isActive ? '#0a0a0a' : '#64748b',
              fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
              boxShadow: isActive ? '0 1px 2px rgba(15,23,42,0.06)' : 'none',
              transition: 'background 120ms ease',
            }}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

function EmptyTabState({ text }: { text: string }) {
  return (
    <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
      {text}
    </div>
  )
}

// ─── Buyer form (3-column grid) ───────────────────────────────────────

// Static option lists — same string for label and value (we store the
// label verbatim, no separate id lookup needed).
const asPick = (s: string) => ({ label: s, value: s })

const LEAD_TYPE_OPTIONS = ['Internet', 'Phone', 'Walk-in'].map(asPick)

const LEAD_SOURCE_OPTIONS = [
  'Auto Trader',
  'Hemmings',
  'eBay',
  'Website',
  'Classic.com',
  'Walk-in',
].map(asPick)

// Auto-populated when a lead lands from a specific website form.  Can also
// be set manually if the rep knows what the prospect is calling about.
const INQUIRY_TYPE_OPTIONS = [
  'Sell us your car',
  'Vehicle storage',
  'Reserved vehicle',
  'Make offer',
  'Apply for financing',
  'Contact us',
].map(asPick)

function BuyerForm({
  contact, salesRepName, salesRepOptions, onSave, onSaveName,
}: {
  contact: Customer
  salesRepName: string | null
  /** {label: rep name, value: rep userId} — fetched from /api/users on mount. */
  salesRepOptions: SelectOption[]
  onSave: (field: string, value: string | null) => void
  onSaveName: (full: string | null) => void
}) {
  return (
    <Grid3>
      <EditableRow
        label="Buyer Name"
        value={`${contact.firstName} ${contact.lastName}`.trim()}
        onSave={onSaveName}
      />
      <EditableRow label="Email" value={contact.email} onSave={(v) => onSave('email', v)} comm="email" />
      <SelectRow
        label="Sales Rep"
        value={contact.salesRepId}
        options={salesRepOptions}
        // displayValue keeps the rep's name showing while the user list
        // is still being fetched (their UUID would briefly leak otherwise).
        displayValue={salesRepName}
        onSave={(v) => onSave('salesRepId', v)}
      />

      <EditableRow label="Cell Phone" value={contact.phone} onSave={(v) => onSave('phone', v)} format="phone" comm="phone" />
      <SelectRow
        label="Lead Type"
        value={contact.leadType}
        options={LEAD_TYPE_OPTIONS}
        onSave={(v) => onSave('leadType', v)}
      />
      <SelectRow
        label="Lead Source"
        value={contact.leadSource}
        options={LEAD_SOURCE_OPTIONS}
        allowOther
        onSave={(v) => onSave('leadSource', v)}
      />

      <EditableRow label="Home Phone" value={contact.homePhone} onSave={(v) => onSave('homePhone', v)} format="phone" comm="phone" />
      <EditableRow label="Work Phone" value={contact.workPhone} onSave={(v) => onSave('workPhone', v)} format="phone" comm="phone" />
      <SelectRow
        label="Inquiry Type"
        value={contact.inquiryType}
        options={INQUIRY_TYPE_OPTIONS}
        onSave={(v) => onSave('inquiryType', v)}
      />
    </Grid3>
  )
}

function ReferrerForm({ contact, onSave }: { contact: Customer; onSave: (f: string, v: string | null) => void }) {
  return (
    // Single column — one field per row, matching the narrow buyer-panel
    // rhythm (was a 2×2 grid when this form lived in a wide card).
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr',
      gap: 10,
      alignItems: 'start',
    }}>
      <EditableRow label="Referrer Name" value={contact.referrerName} onSave={(v) => onSave('referrerName', v)} />
      <EditableRow label="Phone Number" value={contact.referrerPhone} onSave={(v) => onSave('referrerPhone', v)} format="phone" comm="phone" />
      <EditableRow label="Email" value={contact.referrerEmail} onSave={(v) => onSave('referrerEmail', v)} comm="email" />
      <EditableRow label="Address" value={contact.referrerAddress} onSave={(v) => onSave('referrerAddress', v)} />
    </div>
  )
}

// ─── Grid helper ──────────────────────────────────────────────────────

function Grid3({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'grid',
      // Auto-fit so the pill grid packs more columns when a section runs
      // full-width and fewer in the narrower Buyer column — fields stay an
      // even, comfortable width instead of stretching.
      gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
      gap: '10px 12px',
      alignItems: 'start',
    }}>
      {children}
    </div>
  )
}

// ─── EditableRow — label-on-top "bubble" you click into ──────────────
//
// Mirrors the Purchase Info tab on the vehicle detail page: a muted label
// stacked above a rounded pill you click straight into. The input is always
// live (commits on blur), with a hover lift and a blue focus ring. The vehicle
// page floats these over a frosted GlassCard; here the section cards are solid
// white, so the fill is a faint grey that brightens on hover/focus (a
// translucent-white fill would vanish on white).

function EditableRow({ label, value, onSave, format, readOnly, comm }: {
  label: string
  value: string | null
  onSave: (v: string | null) => void
  format?: 'phone'
  readOnly?: boolean
  /** Renders contactability indicators next to the value. */
  comm?: 'phone' | 'email'
}) {
  const [focused, setFocused] = useState(false)
  const [hover, setHover] = useState(false)
  const [draft, setDraft] = useState(value || '')

  useEffect(() => { setDraft(value || '') }, [value])

  const isEmpty = !draft
  // Show a formatted phone when the field is at rest; reveal the raw digits
  // while focused so editing isn't fighting the formatting.
  const shown = focused
    ? draft
    : (format === 'phone' ? (formatPhone(draft) || draft) : draft)

  function commit() {
    setFocused(false)
    const trimmed = draft.trim()
    const newVal = trimmed.length > 0 ? trimmed : null
    if (newVal !== value) onSave(newVal)
  }

  const bg = readOnly
    ? 'rgba(15,23,42,0.015)'
    : (focused || hover)
      ? '#ffffff'
      : '#f7f8fa'
  const border = focused
    ? '1px solid rgba(10,132,255,0.45)'
    : readOnly
      ? '1px solid rgba(15,23,42,0.05)'
      : hover
        ? '1px solid rgba(15,23,42,0.12)'
        : '1px solid rgba(15,23,42,0.06)'
  const boxShadow = focused
    ? '0 0 0 3px rgba(10,132,255,0.12), inset 0 1px 0 rgba(255,255,255,0.9), 0 1px 2px rgba(15,23,42,0.05)'
    : hover && !readOnly
      ? 'inset 0 1px 0 rgba(255,255,255,0.9), 0 1px 3px rgba(15,23,42,0.06)'
      : 'inset 0 1px 0 rgba(255,255,255,0.9)'

  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
      <span style={{
        fontSize: 11, fontWeight: 600, color: 'rgba(15,23,42,0.5)',
        letterSpacing: '0.01em', paddingLeft: 2,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{label}</span>

      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, minWidth: 0,
          // Locked height (not minHeight) so every pill is the SAME size,
          // regardless of content — input vs button vs icons can't stretch it.
          height: 38, boxSizing: 'border-box',
          padding: '0 12px',
          borderRadius: 11,
          background: bg, border, boxShadow,
          transform: hover && !focused && !readOnly ? 'translateY(-0.5px)' : 'none',
          transition: 'background 160ms ease, border-color 150ms ease, box-shadow 150ms ease, transform 160ms ease',
          cursor: readOnly ? 'default' : 'text',
        }}
      >
        {readOnly ? (
          <span style={{
            flex: 1, minWidth: 0,
            fontSize: 13, fontWeight: 600,
            color: isEmpty ? '#cbd5e1' : '#0a0a0a',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{isEmpty ? '—' : shown}</span>
        ) : (
          <input
            value={shown}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={commit}
            // Placeholder doubles as the click-to-edit hint — reads far
            // better than a wall of "—" dashes on a sparse record.
            placeholder={`Add ${label.toLowerCase()}…`}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.currentTarget.blur() }
              if (e.key === 'Escape') { setDraft(value || ''); e.currentTarget.blur() }
            }}
            style={{
              flex: 1, minWidth: 0,
              border: 'none', outline: 'none', background: 'transparent',
              fontSize: 13, fontWeight: 600, color: '#0a0a0a',
              letterSpacing: '-0.005em', padding: 0, margin: 0,
            }}
          />
        )}
        {comm && value && <CommActions kind={comm} />}
      </div>
    </label>
  )
}

// ─── SelectRow — picker variant of EditableRow ───────────────────────
//
// Mirrors EditableRow's bubble look (label on top, rounded pill body) but
// the body is a button that opens a custom dropdown panel.  Optional
// `allowOther` exposes an "Other…" item that flips the row into text-input
// mode so the user can type a free-form value when the predefined options
// don't fit.

type SelectOption = { label: string; value: string }

function SelectRow({
  label, value, options, allowOther, onSave, displayValue,
}: {
  label: string
  /** The stored value (id, slug, free text — whatever). */
  value: string | null
  /** Pickable items. Label is shown to the user, value is what gets saved. */
  options: SelectOption[]
  allowOther?: boolean
  onSave: (v: string | null) => void
  /** Fallback label when `value` isn't in `options` yet (e.g. async-loaded
   *  list still in flight; shows the rep's name instead of their UUID). */
  displayValue?: string | null
}) {
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState(false)
  // A value not in the options list (and allowOther) means the user typed
  // something custom — render the text-input branch by default so the row
  // doesn't flicker back to the dropdown on each render.
  const isCustom = value != null && allowOther && !options.some(o => o.value === value)
  const [otherMode, setOtherMode] = useState(isCustom)
  const [draft, setDraft] = useState(value || '')
  const ref = useRef<HTMLDivElement | null>(null)

  // What the closed-state pill shows: matched option's label, or the
  // upstream display fallback (e.g. salesRep.name from the GET payload).
  const selectedLabel = options.find(o => o.value === value)?.label ?? displayValue ?? value ?? null

  useEffect(() => { setDraft(value || ''); setOtherMode(isCustom) }, [value, isCustom])

  // Close dropdown on outside click.
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  function commitOther() {
    const trimmed = draft.trim()
    const newVal = trimmed.length > 0 ? trimmed : null
    if (newVal !== value) onSave(newVal)
  }

  const focused = open
  const isEmpty = !value
  const bg = (focused || hover) ? '#ffffff' : '#f7f8fa'
  const border = focused
    ? '1px solid rgba(10,132,255,0.45)'
    : hover
      ? '1px solid rgba(15,23,42,0.12)'
      : '1px solid rgba(15,23,42,0.06)'
  const boxShadow = focused
    ? '0 0 0 3px rgba(10,132,255,0.12), inset 0 1px 0 rgba(255,255,255,0.9), 0 1px 2px rgba(15,23,42,0.05)'
    : hover
      ? 'inset 0 1px 0 rgba(255,255,255,0.9), 0 1px 3px rgba(15,23,42,0.06)'
      : 'inset 0 1px 0 rgba(255,255,255,0.9)'

  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0, position: 'relative' }}>
      <span style={{
        fontSize: 11, fontWeight: 600, color: 'rgba(15,23,42,0.5)',
        letterSpacing: '0.01em', paddingLeft: 2,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{label}</span>

      <div
        ref={ref}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          // Match EditableRow exactly so input fields and dropdowns share
          // the same height, padding, and gap — visual rhythm depends on it.
          display: 'flex', alignItems: 'center', gap: 8, minWidth: 0,
          height: 38, boxSizing: 'border-box',
          padding: '0 12px',
          borderRadius: 11,
          background: bg, border, boxShadow,
          position: 'relative',
          transform: hover && !focused ? 'translateY(-0.5px)' : 'none',
          transition: 'background 160ms ease, border-color 150ms ease, box-shadow 150ms ease, transform 160ms ease',
        }}
      >
        {otherMode ? (
          <>
            <input
              autoFocus={otherMode && !value}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitOther}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.currentTarget.blur() }
                if (e.key === 'Escape') { setDraft(value || ''); setOtherMode(isCustom); e.currentTarget.blur() }
              }}
              placeholder="Type a source…"
              style={{
                flex: 1, minWidth: 0,
                border: 'none', outline: 'none', background: 'transparent',
                fontSize: 13, fontWeight: 600, color: '#0a0a0a',
                letterSpacing: '-0.005em', padding: 0, margin: 0,
              }}
            />
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); setOtherMode(false); setOpen(true) }}
              title="Pick from list"
              style={{
                flexShrink: 0, padding: '4px 8px', borderRadius: 6,
                border: 'none', background: 'transparent', color: '#94a3b8',
                fontSize: 10, fontWeight: 700, cursor: 'pointer',
                textTransform: 'uppercase', letterSpacing: '0.04em',
              }}
            >List</button>
          </>
        ) : (
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); setOpen(o => !o) }}
            style={{
              flex: 1, minWidth: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
              padding: 0, border: 'none', background: 'transparent', cursor: 'pointer',
            }}
          >
            <span style={{
              flex: 1, textAlign: 'left',
              fontSize: 13, fontWeight: 600,
              color: isEmpty ? '#cbd5e1' : '#0a0a0a',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{selectedLabel || 'Select…'}</span>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="#94a3b8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M3 5l3 3 3-3" />
            </svg>
          </button>
        )}

        {open && !otherMode && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
            zIndex: 50,
            background: '#ffffff',
            border: '1px solid rgba(15, 23, 42, 0.08)',
            borderRadius: 12,
            boxShadow: [
              '0 20px 50px -12px rgba(15, 23, 42, 0.25)',
              '0 8px 16px -4px rgba(15, 23, 42, 0.12)',
              'inset 0 1px 0 rgba(255, 255, 255, 0.95)',
            ].join(', '),
            padding: 4, maxHeight: 220, overflowY: 'auto',
          }}>
            {options.map(opt => {
              const isSelected = opt.value === value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault(); e.stopPropagation()
                    setOpen(false); setOtherMode(false)
                    if (opt.value !== value) onSave(opt.value)
                  }}
                  style={{
                    width: '100%', textAlign: 'left',
                    padding: '8px 10px', borderRadius: 8,
                    background: isSelected ? 'rgba(29, 29, 31, 0.08)' : 'transparent',
                    border: 'none',
                    fontSize: 13, fontWeight: isSelected ? 700 : 500,
                    color: '#0a0a0a', cursor: 'pointer',
                    transition: 'background 120ms ease',
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(0,0,0,0.045)' }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                >
                  {opt.label}
                </button>
              )
            })}
            {allowOther && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault(); e.stopPropagation()
                  setOpen(false); setOtherMode(true); setDraft('')
                }}
                style={{
                  width: '100%', textAlign: 'left',
                  padding: '8px 10px', borderRadius: 8,
                  background: 'transparent', border: 'none',
                  fontSize: 13, fontWeight: 500, color: '#64748b', cursor: 'pointer',
                  marginTop: 4, borderTop: '1px solid rgba(15,23,42,0.06)',
                  transition: 'background 120ms ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.045)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                Other…
              </button>
            )}
          </div>
        )}
      </div>
    </label>
  )
}

/**
 * Contactability indicators (not action buttons). Phones show whether the
 * person can receive texts and calls; email shows deliverability. They only
 * signal "OK to contact" for now — once Twilio reports opt-outs / blocked
 * numbers these flip to a blocked state. Passive by design: no click action.
 */
function CommActions({ kind }: { kind: 'phone' | 'email' }) {
  // TODO(twilio): drive `ok` from real opt-out / deliverability status.
  const items = kind === 'phone'
    ? [
        { ok: true, title: 'Can receive texts', icon: ICON_SMS },
        { ok: true, title: 'Can receive calls', icon: ICON_PHONE },
      ]
    : [{ ok: true, title: 'Email reachable', icon: ICON_MAIL }]

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
      onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
    >
      {items.map((it, i) => (
        <span
          key={i}
          title={it.title}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 21, height: 21, borderRadius: 6,
            color: it.ok ? '#16a34a' : '#dc2626',
            background: it.ok ? 'rgba(34,197,94,0.12)' : 'rgba(220,38,38,0.12)',
          }}
        >
          {it.icon}
        </span>
      ))}
    </div>
  )
}

const ICON_SMS = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </svg>
)

const ICON_PHONE = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
)

const ICON_MAIL = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-10 6L2 7" />
  </svg>
)

// ─── Add-interest tile ────────────────────────────────────────────────
// A dashed call-to-action that flex-grows to fill the sidebar's leftover
// height. When the list is empty it carries the whole "no vehicles yet"
// message; otherwise it's a slim add row beneath the existing cards.

function AddInterestTile({ empty, onClick }: { empty: boolean; onClick: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        flex: 1, minHeight: empty ? 120 : 56,
        width: '100%',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
        borderRadius: 12,
        border: `1.5px dashed ${hover ? 'rgba(16,185,129,0.5)' : 'rgba(15,23,42,0.14)'}`,
        background: hover ? 'rgba(16,185,129,0.04)' : 'transparent',
        color: hover ? '#15803d' : '#94a3b8',
        cursor: 'pointer',
        transition: 'background 140ms ease, border-color 140ms ease, color 140ms ease',
      }}
    >
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 26, height: 26, borderRadius: '50%',
        border: `1.5px solid ${hover ? 'rgba(16,185,129,0.5)' : 'rgba(15,23,42,0.16)'}`,
        transition: 'border-color 140ms ease',
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </span>
      <span style={{ fontSize: 12, fontWeight: 600 }}>
        {empty ? 'Add vehicle of interest' : 'Add another'}
      </span>
    </button>
  )
}

// ─── Interested vehicle sidebar card ──────────────────────────────────

function InterestCard({ interest, onRemove }: { interest: VehicleInterest; onRemove: () => void }) {
  const v = interest.vehicle
  const isSold = v?.status === 'sold'

  const inner = !v ? (
    <div style={{
      padding: '12px 34px 12px 14px', borderRadius: 10, background: '#f8fafc',
      border: '1px solid rgba(15,23,42,0.06)',
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#0a0a0a' }}>
        {interest.make || interest.model
          ? `${interest.make || ''} ${interest.model || ''}`.trim()
          : 'General interest'}
      </div>
      {interest.priceMax && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
          Up to ${interest.priceMax.toLocaleString()}
        </div>
      )}
    </div>
  ) : (
    <Link href={`/vehicles/${v.id}`} style={{
      display: 'block', padding: '12px 34px 12px 14px', borderRadius: 10,
      background: isSold ? '#fef2f2' : '#ffffff',
      border: isSold ? '1px solid #fecaca' : '1px solid rgba(15,23,42,0.08)',
      textDecoration: 'none',
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#0a0a0a' }}>
        {v.year} {v.make} {v.model}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
        Stock #{v.stockNumber}
      </div>
      {v.askingPrice && (
        <div style={{ fontSize: 14, fontWeight: 700, color: '#0a0a0a', marginTop: 8 }}>
          ${v.askingPrice.toLocaleString()}
        </div>
      )}
      {isSold && (
        <div style={{
          marginTop: 8, fontSize: 10, fontWeight: 700, color: '#991b1b',
          textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>Already sold</div>
      )}
    </Link>
  )

  // Remove (×) sits above the card so it never nests inside the Link.
  return (
    <div style={{ position: 'relative' }}>
      {inner}
      <button
        title="Remove vehicle of interest"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove() }}
        style={{
          position: 'absolute', top: 8, right: 8,
          width: 22, height: 22, borderRadius: 6,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          border: 'none', background: 'transparent', cursor: 'pointer',
          color: '#94a3b8', transition: 'background 120ms ease, color 120ms ease',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(220,38,38,0.10)'; e.currentTarget.style.color = '#dc2626' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94a3b8' }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

// ─── Vehicle picker modal ─────────────────────────────────────────────
// Searches live inventory (/api/inventory) and attaches the chosen car as a
// vehicle of interest. Debounced search, keyboard-dismissable, frosted
// backdrop to match the boutique sheet styling.

type PickerVehicle = {
  id: string
  stockNumber: string
  year: number | null
  make: string | null
  model: string | null
  color?: string | null
  askingPrice?: number | null
  status?: string | null
  heroUrl?: string | null
}

function VehiclePicker({
  existingVehicleIds, onClose, onPick,
}: {
  existingVehicleIds: string[]
  onClose: () => void
  onPick: (vehicleId: string) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PickerVehicle[]>([])
  const [loading, setLoading] = useState(true)

  // Debounced inventory search — refetches 250ms after typing stops.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const t = setTimeout(() => {
      const qs = new URLSearchParams({ limit: '24' })
      if (query.trim()) qs.set('search', query.trim())
      fetch(`/api/inventory?${qs.toString()}`)
        .then(r => r.json())
        .then(d => { if (!cancelled) { setResults(d.vehicles || []); setLoading(false) } })
        .catch(() => { if (!cancelled) setLoading(false) })
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [query])

  // Dismiss on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(15,23,42,0.40)',
        backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '10vh 16px 16px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560, maxHeight: '76vh',
          display: 'flex', flexDirection: 'column',
          background: '#ffffff', borderRadius: 18,
          border: '1px solid rgba(255,255,255,0.6)',
          boxShadow: '0 24px 70px rgba(15,23,42,0.28)',
          overflow: 'hidden',
        }}
      >
        {/* Search header */}
        <div style={{ padding: 16, borderBottom: '1px solid rgba(15,23,42,0.07)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0a0a0a' }}>Add vehicle of interest</div>
            <button
              onClick={onClose}
              style={{
                width: 26, height: 26, borderRadius: 7, border: 'none', cursor: 'pointer',
                background: 'rgba(15,23,42,0.05)', color: '#64748b',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search stock #, VIN, make, model…"
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '10px 14px', borderRadius: 11,
              border: '1px solid rgba(15,23,42,0.12)', background: '#f7f8fa',
              fontSize: 13, fontWeight: 500, color: '#0a0a0a', outline: 'none',
            }}
          />
        </div>

        {/* Results */}
        <div style={{ overflowY: 'auto', padding: 8 }}>
          {loading ? (
            <div style={{ padding: 28, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Searching…</div>
          ) : results.length === 0 ? (
            <div style={{ padding: 28, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No vehicles found.</div>
          ) : (
            results.map(v => {
              const already = existingVehicleIds.includes(v.id)
              return (
                <button
                  key={v.id}
                  disabled={already}
                  onClick={() => !already && onPick(v.id)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                    padding: 8, borderRadius: 11, border: 'none', textAlign: 'left',
                    background: 'transparent', cursor: already ? 'default' : 'pointer',
                    opacity: already ? 0.5 : 1,
                    transition: 'background 120ms ease',
                  }}
                  onMouseEnter={(e) => { if (!already) e.currentTarget.style.background = '#f3f4f6' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  <div style={{
                    width: 64, height: 44, borderRadius: 8, flexShrink: 0,
                    background: v.heroUrl ? `center/cover no-repeat url(${v.heroUrl})` : '#eef1f4',
                    border: '1px solid rgba(15,23,42,0.06)',
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0a0a0a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {[v.year, v.make, v.model].filter(Boolean).join(' ') || 'Vehicle'}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                      Stock #{v.stockNumber}{v.color ? ` · ${v.color}` : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    {v.askingPrice != null && (
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#0a0a0a' }}>${v.askingPrice.toLocaleString()}</div>
                    )}
                    {already && <div style={{ fontSize: 10, fontWeight: 700, color: '#15803d', marginTop: 2 }}>ADDED</div>}
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Co-Buyer picker ──────────────────────────────────────────────────
//
// Two states:
//   1. coBuyer attached → show their card with a Detach button.
//   2. nothing attached → show a single search input that fans out to
//      /api/contacts; matches drop into an inline list, and an "Add new"
//      affordance pops a quick-create mini-modal when no match is found.
//
// The full-fledged AddCustomerModal used by the inventory Purchase Info
// captures ~30 fields; for a co-buyer the bare essentials (name + phone
// + email) are enough up-front.  The rep can flesh the rest out by
// clicking through to that contact's profile after the attach.

type ContactSearchHit = {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
}

// ─── Lead workspace — DealerCenter-style activity console ────────────
//
// Top-tabs + action bar + activity feed.  Mirrors the Lead tab in
// DealerCenter so a rep can drive the whole deal from one surface.
//
// Most tabs and action buttons are visual stubs for now — they'll be
// wired up as each feature lands (Credit App integration, Twilio
// dispatch, etc.).  The Activity feed is the only live data path.

const LEAD_TABS = [
  'Lead', 'Credit App', 'Pre-Qual', 'Vehicle', 'Deals',
  'Files', 'Compliance', 'Duplicates', 'Journal Entries', 'Logs',
] as const
type LeadTab = typeof LEAD_TABS[number]

const ACTIVITY_FILTERS = [
  'All', 'Notes', 'Appt', 'Phone', 'SMS', 'Email', 'Tasks', 'Chat', 'Other',
] as const
type ActivityFilter = typeof ACTIVITY_FILTERS[number]

// Action bar = lead's primary tools.  Each gets an icon so the row reads
// as a toolbar at a glance instead of a wall of text pills.
const LEAD_ACTIONS: Array<{ label: string; icon: React.ReactNode }> = [
  {
    label: 'Phone Call',
    icon: (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>),
  },
  {
    label: 'Send SMS',
    icon: (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>),
  },
  {
    label: 'Send Email',
    icon: (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 5L2 7" /></svg>),
  },
  {
    label: 'Schedule Appt',
    icon: (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>),
  },
  {
    label: 'Add Task',
    icon: (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>),
  },
  {
    label: 'Add Note',
    icon: (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" /></svg>),
  },
]

function LeadWorkspace({ contactId: _contactId }: { contactId: string }) {
  const [tab, setTab] = useState<LeadTab>('Lead')
  const [filter, setFilter] = useState<ActivityFilter>('All')
  const [search, setSearch] = useState('')

  // TODO: load real activity rows for the contact and apply `filter`+`search`.
  const activities: Array<{ id: string; kind: ActivityFilter; title: string; sub?: string; byline?: string }> = []
  const visible = activities.filter(a =>
    (filter === 'All' || a.kind === filter)
    && (!search || a.title.toLowerCase().includes(search.toLowerCase()) || (a.sub ?? '').toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div style={sectionCardStyle}>
      {/* ─── Top tabs (Lead / Credit App / …) — pill-rail matching the
              Buyer / Co-Buyer / Referrer tabs above so the page reads as
              one consistent design system.  Spans the full width with
              each tab taking an equal share. ─── */}
      <div style={{
        // Wraps into two rows in the narrower desktop main column (the
        // vehicles rail now sits beside this card) — tabs keep their full
        // labels instead of ellipsizing, mirroring DealerCenter.
        display: 'flex', flexWrap: 'wrap', gap: 2, padding: 4,
        background: '#f3f4f6', borderRadius: 12,
        marginBottom: 18,
      }}>
        {LEAD_TABS.map(t => {
          const active = t === tab
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: '1 0 auto',
                padding: '7px 14px', borderRadius: 8, border: 'none',
                background: active ? '#ffffff' : 'transparent',
                color: active ? '#0a0a0a' : '#64748b',
                fontSize: 12.5, fontWeight: active ? 700 : 600,
                cursor: 'pointer', whiteSpace: 'nowrap',
                boxShadow: active ? '0 1px 2px rgba(15,23,42,0.06)' : 'none',
                transition: 'background 120ms ease',
                letterSpacing: '-0.005em',
                overflow: 'hidden', textOverflow: 'ellipsis',
              }}
            >{t}</button>
          )
        })}
      </div>

      {tab === 'Lead' && (
        <>
          {/* Action toolbar — icon + label, equal-width row. */}
          <div style={{
            display: 'grid',
            // auto-fit instead of one fixed row — the workspace card is
            // narrower now (vehicles rail beside it), so the pills pack
            // 3-up / 6-up depending on available width without squishing.
            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            gap: 8,
            marginBottom: 20,
          }}>
            {LEAD_ACTIONS.map(a => (
              <ActionButton key={a.label} label={a.label} icon={a.icon} />
            ))}
          </div>

          {/* Activity heading + count, with a search field tucked to the right
              of the row so we don't stack three control bars on top of each
              other.  Filter, refresh and pagination icons are dropped — the
              chip rail IS the filter, and there's nothing to paginate until
              real activity lands. */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 12, marginBottom: 14, flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <h3 style={{
                fontSize: 14, fontWeight: 700, color: '#0a0a0a',
                letterSpacing: '-0.005em',
              }}>Activity</h3>
              <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>{visible.length}</span>
            </div>
            <div style={{
              flex: '0 1 280px',
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '0 12px',
              background: '#f7f8fa',
              border: '1px solid rgba(15, 23, 42, 0.06)',
              borderRadius: 999,
              height: 32, boxSizing: 'border-box',
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search"
                style={{
                  flex: 1, minWidth: 0,
                  border: 'none', outline: 'none', background: 'transparent',
                  fontSize: 12.5, color: '#0a0a0a',
                }}
              />
            </div>
          </div>

          {/* Filter chip rail — single source of truth for filtering. */}
          <div style={{
            display: 'flex', gap: 8, marginBottom: 14,
            overflowX: 'auto', paddingBottom: 2,
          }}>
            {ACTIVITY_FILTERS.map(f => {
              const active = f === filter
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  style={{
                    flexShrink: 0,
                    padding: '6px 14px', borderRadius: 999,
                    border: active ? '1px solid #1a1a1a' : '1px solid rgba(15, 23, 42, 0.12)',
                    background: active ? '#1a1a1a' : '#ffffff',
                    color: active ? '#dffd6e' : '#475569',
                    fontSize: 12.5, fontWeight: 600,
                    cursor: 'pointer', whiteSpace: 'nowrap',
                    transition: 'background 140ms ease, color 140ms ease, border-color 140ms ease',
                  }}
                >{f}</button>
              )
            })}
          </div>

          {/* Activity list */}
          {visible.length === 0 ? (
            <div style={{
              padding: '32px 20px', textAlign: 'center',
              color: '#94a3b8', fontSize: 12.5,
              fontStyle: 'italic',
            }}>
              {search
                ? `No activity matches “${search}”.`
                : filter !== 'All'
                  ? `No ${filter.toLowerCase()} activity yet.`
                  : 'No activity yet.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {visible.map(a => (
                <div key={a.id} style={{
                  border: '1px solid rgba(15, 23, 42, 0.06)',
                  borderRadius: 12, padding: '14px 16px',
                  background: '#ffffff',
                  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.03)',
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0a0a0a', marginBottom: 6 }}>{a.title}</div>
                  {a.sub && <div style={{ fontSize: 12, color: '#475569', marginBottom: 4 }}>{a.sub}</div>}
                  {a.byline && <div style={{ fontSize: 11, color: '#94a3b8' }}>{a.byline}</div>}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab !== 'Lead' && (
        <div style={{
          padding: '40px 20px', textAlign: 'center',
          color: '#94a3b8', fontSize: 13,
          background: '#f7f8fa', borderRadius: 12,
          border: '1px solid rgba(15, 23, 42, 0.06)',
        }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#475569', marginBottom: 4 }}>{tab}</div>
          Coming soon.
        </div>
      )}
    </div>
  )
}

// Soft secondary action button — compact icon+label pill, white surface,
// slate border, hover lift.  Equal-width when laid out in a grid; a single
// glance-high row instead of the old tall icon-over-label tiles.
function ActionButton({ label, icon }: { label: string; icon?: React.ReactNode }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        gap: 7,
        padding: '9px 10px',
        borderRadius: 10,
        border: '1px solid rgba(15, 23, 42, 0.08)',
        background: hover ? '#f8fafc' : '#ffffff',
        color: hover ? '#0a0a0a' : '#475569',
        fontSize: 12.5, fontWeight: 600,
        cursor: 'pointer', whiteSpace: 'nowrap',
        boxShadow: hover
          ? '0 6px 14px -6px rgba(15, 23, 42, 0.10), inset 0 1px 0 rgba(255,255,255,0.95)'
          : '0 1px 2px rgba(15, 23, 42, 0.04), inset 0 1px 0 rgba(255,255,255,0.95)',
        transform: hover ? 'translateY(-1px)' : 'none',
        transition: 'background 140ms ease, color 140ms ease, box-shadow 180ms ease, transform 180ms ease',
      }}
    >
      {icon && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 24, height: 24, borderRadius: 7, flexShrink: 0,
          background: hover ? '#1a1a1a' : '#f1f5f9',
          color: hover ? '#dffd6e' : '#64748b',
          transition: 'background 160ms ease, color 160ms ease',
        }}>{icon}</span>
      )}
      <span style={{ letterSpacing: '-0.005em', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
    </button>
  )
}

// Relationship of co-buyer → buyer. Stored on the BUYER's record — it
// describes this pairing, not the co-buyer as a person.
const RELATIONSHIP_OPTIONS = [
  'Spouse', 'Partner', 'Parent', 'Child', 'Sibling', 'Relative', 'Friend', 'Business Partner',
].map(asPick)

function CoBuyerPicker({
  coBuyer, relationship, onAttach, onDetach, onRelationship,
}: {
  coBuyer: CoBuyer
  relationship: string | null
  onAttach: (contactId: string) => void
  onDetach: () => void
  /** Saves to the BUYER's record (coBuyerRelationship). */
  onRelationship: (v: string | null) => void
}) {
  if (coBuyer) {
    // Attached co-buyer. Only Relationship is editable here — it belongs to
    // the buyer's record. The co-buyer's own details are shown read-only;
    // they're edited on the co-buyer's profile (header links through).
    const initials = `${coBuyer.firstName.charAt(0)}${coBuyer.lastName.charAt(0)}`.toUpperCase()
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Identity header — links to the co-buyer's own profile. */}
        <div style={{
          position: 'relative',
          padding: '12px 14px',
          background: 'linear-gradient(180deg, #ffffff 0%, #fafbfc 100%)',
          border: '1px solid rgba(15,23,42,0.08)',
          borderRadius: 12,
          boxShadow: '0 1px 3px rgba(15,23,42,0.05), inset 0 1px 0 rgba(255,255,255,0.9)',
        }}>
          <button
            title="Detach co-buyer"
            onClick={onDetach}
            style={{
              position: 'absolute', top: 8, right: 8,
              width: 24, height: 24, minHeight: 0, borderRadius: 7,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              border: 'none', background: 'transparent', cursor: 'pointer', padding: 0,
              color: '#b6bfcc', transition: 'background 120ms ease, color 120ms ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(220,38,38,0.10)'; e.currentTarget.style.color = '#dc2626' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#b6bfcc' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 11, paddingRight: 24 }}>
            <div style={{
              width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
              background: '#1a1a1a', color: '#dffd6e',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, letterSpacing: '0.02em',
            }}>{initials}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              {/* minHeight: 0 overrides the global `a { min-height: 44px }`
                  tap-target rule, which otherwise inflates this link and
                  blows the card layout apart. */}
              <Link
                href={`/customers/${coBuyer.id}`}
                title="Open co-buyer profile"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5, maxWidth: '100%',
                  minHeight: 0,
                  fontSize: 13.5, fontWeight: 700, color: '#0a0a0a', letterSpacing: '-0.005em',
                  textDecoration: 'none',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#2563eb' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#0a0a0a' }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {coBuyer.firstName} {coBuyer.lastName}
                </span>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.45 }}>
                  <path d="M7 17 17 7M9 7h8v8" />
                </svg>
              </Link>
              <div style={{
                fontSize: 9.5, fontWeight: 700, color: '#94a3b8',
                textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 1,
              }}>Co-Buyer{relationship ? ` · ${relationship}` : ''}</div>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10, alignItems: 'start' }}>
          {/* The one editable field — a property of THIS buyer's pairing. */}
          <SelectRow
            label="Relationship"
            value={relationship}
            options={RELATIONSHIP_OPTIONS}
            allowOther
            onSave={onRelationship}
          />

          {/* Read-only mirror of the co-buyer's own record. */}
          <EditableRow label="Cell Phone" value={coBuyer.phone} onSave={() => {}} format="phone" comm="phone" readOnly />
          <EditableRow label="Home Phone" value={coBuyer.homePhone} onSave={() => {}} format="phone" readOnly />
          <EditableRow label="Work Phone" value={coBuyer.workPhone} onSave={() => {}} format="phone" readOnly />
          <EditableRow label="Email" value={coBuyer.email} onSave={() => {}} comm="email" readOnly />
          <EditableRow label="Lead Type" value={coBuyer.leadType} onSave={() => {}} readOnly />
          <EditableRow label="Lead Source" value={coBuyer.leadSource} onSave={() => {}} readOnly />
          <EditableRow label="Inquiry Type" value={coBuyer.inquiryType} onSave={() => {}} readOnly />
        </div>

        <Link
          href={`/customers/${coBuyer.id}`}
          style={{
            minHeight: 0, alignSelf: 'center',
            fontSize: 11.5, fontWeight: 600, color: '#94a3b8', textDecoration: 'none',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#2563eb' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#94a3b8' }}
        >
          Edit these details on their profile →
        </Link>
      </div>
    )
  }
  return <CoBuyerSearch onAttach={onAttach} />
}

function CoBuyerSearch({ onAttach }: { onAttach: (contactId: string) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ContactSearchHit[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [addModal, setAddModal] = useState<{ first: string; last: string } | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const lastQ = useRef('')

  // Close dropdown on outside click.
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  // Debounced fetch — 200ms felt right for the inventory picker, keep
  // parity here.  No fetch fires until the user actually types.
  useEffect(() => {
    if (!open) return
    lastQ.current = query
    const t = setTimeout(async () => {
      if (lastQ.current !== query) return
      setLoading(true)
      try {
        const params = new URLSearchParams({ limit: '25' })
        if (query.trim()) params.set('search', query.trim())
        const r = await fetch(`/api/contacts?${params}`)
        const d = await r.json()
        setResults(Array.isArray(d?.contacts) ? d.contacts : [])
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 200)
    return () => clearTimeout(t)
  }, [query, open])

  const trimmed = query.trim()
  const exactMatch = results.some(c => `${c.firstName} ${c.lastName}`.toLowerCase() === trimmed.toLowerCase())
  const canAddNew = trimmed.length > 0 && !exactMatch

  function openAddModal() {
    const parts = trimmed.split(/\s+/)
    setAddModal({ first: parts[0] ?? '', last: parts.slice(1).join(' ') })
  }

  return (
    <>
      <div ref={wrapRef} style={{ position: 'relative', maxWidth: 480 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '0 6px 0 14px',
          background: '#ffffff',
          border: '1px solid rgba(15,23,42,0.10)',
          borderRadius: 11,
          height: 42, boxSizing: 'border-box',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9)',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setOpen(true)}
            placeholder="Search customers by name, phone, or email…"
            style={{
              flex: 1, minWidth: 0,
              border: 'none', outline: 'none', background: 'transparent',
              fontSize: 14, color: '#0a0a0a',
            }}
          />
          <button
            type="button"
            onClick={openAddModal}
            disabled={!canAddNew}
            title={canAddNew ? `Add new customer${trimmed ? ` "${trimmed}"` : ''}` : 'Type a name to add a new customer'}
            style={{
              // Locked square so borderRadius reads as a true circle.  flex
              // parents can stretch children if min-width / flex-basis aren't
              // pinned — guarding on all axes prevents the oval shape.
              flexShrink: 0, flexGrow: 0, flexBasis: 30,
              width: 30, height: 30,
              minWidth: 30, minHeight: 30,
              maxWidth: 30, maxHeight: 30,
              borderRadius: 15,
              border: 'none', padding: 0,
              boxSizing: 'border-box', lineHeight: 1,
              background: canAddNew ? '#1a1a1a' : 'transparent',
              color: canAddNew ? '#dffd6e' : '#cbd5e1',
              cursor: canAddNew ? 'pointer' : 'not-allowed',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 160ms ease, color 160ms ease, transform 160ms ease',
              transform: canAddNew ? 'scale(1)' : 'scale(0.92)',
            }}
            onMouseEnter={(e) => { if (canAddNew) e.currentTarget.style.background = '#0a0a0a' }}
            onMouseLeave={(e) => { if (canAddNew) e.currentTarget.style.background = '#1a1a1a' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>

        {open && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
            zIndex: 50,
            background: '#ffffff',
            border: '1px solid rgba(15, 23, 42, 0.08)',
            borderRadius: 12,
            boxShadow: [
              '0 20px 50px -12px rgba(15, 23, 42, 0.25)',
              '0 8px 16px -4px rgba(15, 23, 42, 0.12)',
              'inset 0 1px 0 rgba(255, 255, 255, 0.95)',
            ].join(', '),
            maxHeight: 320, overflowY: 'auto', padding: 4,
          }}>
            {loading && results.length === 0 ? (
              <div style={{ padding: 14, fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>Searching…</div>
            ) : results.length === 0 && trimmed ? (
              <div style={{ padding: 14, fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
                No matches. Press <strong style={{ color: '#475569' }}>+</strong> to add a new customer.
              </div>
            ) : results.length === 0 ? (
              <div style={{ padding: 14, fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>Start typing to search…</div>
            ) : (
              results.map(hit => (
                <button
                  key={hit.id}
                  type="button"
                  onClick={() => {
                    onAttach(hit.id)
                    setOpen(false); setQuery('')
                  }}
                  style={{
                    width: '100%', textAlign: 'left',
                    padding: '10px 12px', borderRadius: 8,
                    background: 'transparent', border: 'none',
                    cursor: 'pointer',
                    transition: 'background 120ms ease',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.045)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0a0a0a' }}>
                    {hit.firstName} {hit.lastName}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, display: 'flex', gap: 10 }}>
                    {hit.phone && <span>{formatPhone(hit.phone)}</span>}
                    {hit.email && <span>{hit.email.toLowerCase()}</span>}
                    {!hit.phone && !hit.email && <span>—</span>}
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {addModal && (
        <AddCustomerModal
          initialFirstName={addModal.first}
          initialLastName={addModal.last}
          onClose={() => setAddModal(null)}
          onSaved={(contact) => {
            setAddModal(null)
            onAttach(contact.id)
            setQuery('')
          }}
        />
      )}
    </>
  )
}

