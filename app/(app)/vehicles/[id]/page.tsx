'use client'

import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useRouter } from 'next/navigation'
import { AddCustomerModal } from '@/components/AddCustomerModal'
import {
  SectionCard, SectionCardLabel, FieldStack, FieldRow, FieldBackplate,
  PremiumField, PremiumPillButton, formatPhone,
} from '@/components/customer-form-ui'

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
  purchaseSource: string | null
  purchasedFrom: string | null
  purchasedFromVendorId: string | null
  purchasedFromContactId: string | null
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
  partnerId: string | null
  partner: { id: string; companyName: string } | null
  receiptUrl: string | null
  paymentMethod: string | null
  memo: string | null
  addedAt: string
  addedBy: { id: string; name: string } | null
}

// Partner categories — fixed list mirrors the DealerCenter screen. Values are
// canonical snake_case used in the DB; labels are what the user sees.
const PARTNER_CATEGORIES: { value: string; label: string }[] = [
  { value: 'dealer_or_wholesaler', label: 'Dealer or Wholesaler' },
  { value: 'flooring',             label: 'Flooring' },
  { value: 'insurance',            label: 'Insurance' },
  { value: 'lender',               label: 'Lender' },
  { value: 'lienholder',           label: 'Lienholder' },
  { value: 'service_or_warranty',  label: 'Service or Warranty' },
  { value: 'repo',                 label: 'Repo' },
  { value: 'vendor',               label: 'Vendor' },
  { value: 'rebate_vendor',        label: 'Rebate Vendor' },
  { value: 'tax_and_fee',          label: 'Tax and Fee' },
]

type PartnerSummary = {
  id: string
  companyName: string
  companyAlias: string | null
  phone: string | null
  contactName: string | null
  contactEmail: string | null
  categories: string[]
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
  const [showCostAddsList, setShowCostAddsList] = useState(false)
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

  // Scroll-paused backdrop-filter — toggles `data-scrolling="1"` on <html>
  // while the user scrolls. The CSS in globals.css swaps --glass-blur to 0px
  // during that time so GlassCard / SubPanel skip the expensive blur pass
  // on every scroll frame. Restored ~140ms after scroll idle.
  useEffect(() => {
    let raf: number | null = null
    let idleTimer: ReturnType<typeof setTimeout> | null = null
    function onScroll() {
      if (raf) return
      raf = requestAnimationFrame(() => {
        document.documentElement.dataset.scrolling = '1'
        raf = null
      })
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = setTimeout(() => {
        delete document.documentElement.dataset.scrolling
      }, 140)
    }
    window.addEventListener('scroll', onScroll, { passive: true, capture: true })
    return () => {
      window.removeEventListener('scroll', onScroll, { capture: true })
      if (raf) cancelAnimationFrame(raf)
      if (idleTimer) clearTimeout(idleTimer)
      delete document.documentElement.dataset.scrolling
    }
  }, [])

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
          background: 'rgba(255, 255, 255, 0.66)',
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
              // Purchase Info holds money + lien data — admin / sales_manager only.
              ...(canSeeMoney ? [{ id: 'purchase_info' as const, label: 'Purchase Info' }] : []),
              { id: 'description',   label: 'Description' },
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
                    onManageCosts={() => setShowCostAddsList(true)}
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

                <VehicleInspectionCard
                  stages={vehicle.stages || []}
                  onOpenInRecon={(stageId) => {
                    setActiveTab('recon')
                    setExpandedStageId(stageId)
                  }}
                />
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
                  onSavePartial={async (patch) => {
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

      {/* ═══ COST ADDS LIST / MANAGER MODAL ═══ */}
      {showCostAddsList && (
        <CostAddsListModal
          vehicle={vehicle}
          costAdds={costAdds}
          isAdmin={isAdmin}
          currentUserId={currentUserId}
          busy={busy}
          onClose={() => setShowCostAddsList(false)}
          onRefresh={refreshCostAdds}
          onDelete={async (id) => {
            await deleteCostAdd(id)
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

// ─── Cost Adds List / Manager Modal ─────────────────────────────────
// Wide spreadsheet-style manager: existing cost adds at the top (read-only),
// pending new rows appended via "+ Add New" and committed in one Save click.
// Columns mirror the dealer's familiar layout: Description, Category, Cost,
// Payment Method, Vendor, Date Added, Memo (+ delete).
//
// Existing rows show a small × delete affordance per feedback_destructive_action_protection
// (planned: move to a less-prominent overflow menu in a follow-up).
//
// Cost-adds shape feeds the future Journal Entries tab + QuickBooks sync (Phase 7).

type CostAddDraft = {
  id: string // local-only key for React + remove
  description: string
  kind: string // one of COST_KIND_LABELS keys
  amount: string // free-form input, parsed at save
  paymentMethod: string // '' or one of PAYMENT_METHOD_OPTIONS values
  vendor: string // legacy free-text fallback when no partnerId picked
  partnerId: string | null // when set, vendor cell renders the partner's companyName
  partnerName: string // mirror of the picked partner's companyName for instant display without re-fetch
  addedAt: string // YYYY-MM-DD
  memo: string
}

function makeEmptyCostAddDraft(): CostAddDraft {
  return {
    id: `draft-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`,
    description: '',
    kind: '', // empty so user picks from the Category combobox
    amount: '',
    paymentMethod: '',
    vendor: '',
    partnerId: null,
    partnerName: '',
    addedAt: new Date().toISOString().slice(0, 10),
    memo: '',
  }
}

// Single grid column template shared by header row + every data/draft row so
// the columns line up exactly without any per-row recalculation.
const COST_ROW_COLUMNS = '1.4fr 1.2fr 0.8fr 1fr 1.4fr 1fr 1.6fr 32px'

function CostAddsListModal({
  vehicle, costAdds, isAdmin, currentUserId, busy,
  onClose, onRefresh, onDelete,
}: {
  vehicle: Vehicle
  costAdds: CostAdd[]
  isAdmin: boolean
  currentUserId: string | null
  busy: boolean
  onClose: () => void
  onRefresh: () => Promise<void> | void
  onDelete: (id: string) => void | Promise<void>
}) {
  const [drafts, setDrafts] = useState<CostAddDraft[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [descriptionOptions, setDescriptionOptions] = useState<string[]>([])
  const [categoryOptions, setCategoryOptions] = useState<string[]>([])
  // When the user opens AddPartnerModal from a Vendor cell, we track WHICH
  // draft triggered it so the saved partner can be attached back to that row.
  const [addPartnerState, setAddPartnerState] = useState<{ draftId: string; initialName: string } | null>(null)

  // Lock body scroll while the modal is open so the page behind doesn't move
  // when the user scrolls inside the modal. Restores on unmount.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Load the dealership-wide quick-pick lists for Description AND Category.
  // Both share the same admin-managed pattern; users can free-type anything,
  // admin can add to the list inline.
  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch('/api/cost-add-descriptions').then(r => r.json()).catch(() => null),
      fetch('/api/cost-add-categories').then(r => r.json()).catch(() => null),
    ]).then(([descRes, catRes]) => {
      if (cancelled) return
      const descNames = Array.isArray(descRes?.descriptions)
        ? descRes.descriptions.map((x: { name: string }) => x.name)
        : []
      const catNames = Array.isArray(catRes?.categories)
        ? catRes.categories.map((x: { name: string }) => x.name)
        : []
      setDescriptionOptions(descNames)
      setCategoryOptions(catNames)
    })
    return () => { cancelled = true }
  }, [])

  function makeAddOption(
    endpoint: string,
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    payloadKey: 'description' | 'category',
  ) {
    return async (name: string): Promise<boolean> => {
      const trimmed = name.trim()
      if (!trimmed) return false
      try {
        const r = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: trimmed }),
        })
        if (!r.ok) return false
        const data = await r.json()
        const created = data?.[payloadKey]?.name
        if (created) {
          setter((prev) => prev.includes(created)
            ? prev
            : [...prev, created].sort((a, b) => a.localeCompare(b)))
        }
        return true
      } catch {
        return false
      }
    }
  }
  const addDescriptionOption = makeAddOption('/api/cost-add-descriptions', setDescriptionOptions, 'description')
  const addCategoryOption = makeAddOption('/api/cost-add-categories', setCategoryOptions, 'category')

  const total = costAdds.reduce((s, c) => s + c.amountCents, 0) / 100

  function addDraft() {
    setDrafts(prev => [...prev, makeEmptyCostAddDraft()])
  }
  function updateDraft(id: string, patch: Partial<CostAddDraft>) {
    setDrafts(prev => prev.map(d => d.id === id ? { ...d, ...patch } : d))
  }
  function removeDraft(id: string) {
    setDrafts(prev => prev.filter(d => d.id !== id))
  }

  function tryClose() {
    if (drafts.length > 0) {
      const ok = confirm(`You have ${drafts.length} unsaved row${drafts.length > 1 ? 's' : ''}. Discard them?`)
      if (!ok) return
    }
    onClose()
  }

  async function save() {
    setSaveError(null)
    // Front-end validation: both Cost (>0) and Category (non-empty) are
    // required per row. We surface the first issue rather than POSTing and
    // letting the API return a raw error string.
    const validDrafts: { d: CostAddDraft; amount: number }[] = []
    let firstError: string | null = null
    drafts.forEach((d, i) => {
      const amount = parseFloat(d.amount)
      if (!Number.isFinite(amount) || amount <= 0) {
        if (!firstError) firstError = `Row ${i + 1}: cost must be a positive number`
        return
      }
      if (!d.kind.trim()) {
        if (!firstError) firstError = `Row ${i + 1}: pick or type a Category`
        return
      }
      validDrafts.push({ d, amount })
    })
    if (validDrafts.length === 0) {
      setSaveError(firstError ?? 'Add at least one row with a positive cost amount.')
      return
    }
    setSaving(true)
    try {
      for (const { d, amount } of validDrafts) {
        const r = await fetch('/api/cost-adds', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vehicleId: vehicle.id,
            kind: d.kind,
            amount,
            description: d.description.trim() || undefined,
            // partnerId is the new canonical link to a Partner; vendor stays
            // as a legacy free-text fallback for any rows where the user
            // typed a name without picking a partner record.
            partnerId: d.partnerId ?? undefined,
            vendor: !d.partnerId ? (d.vendor.trim() || undefined) : undefined,
            paymentMethod: d.paymentMethod.trim() || undefined,
            memo: d.memo.trim() || undefined,
            addedAt: d.addedAt ? new Date(d.addedAt + 'T12:00:00').toISOString() : undefined,
          }),
        })
        if (!r.ok) {
          const txt = await r.text()
          throw new Error(`Save failed (${r.status}): ${txt.slice(0, 140)}`)
        }
      }
      await onRefresh()
      setDrafts([])
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
      onClick={tryClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 14, width: 'min(96vw, 1400px)',
          maxHeight: 'calc(100vh - 32px)', display: 'flex', flexDirection: 'column',
          boxShadow: '0 24px 48px rgba(0,0,0,0.22)',
          // Force the modal into its own GPU compositor layer so scrolling
          // inside it doesn't trigger repaints of the blurred glass cards on
          // the page behind. Combined with `contain` below, this drops scroll
          // jank dramatically on pages with heavy backdrop-filter usage.
          transform: 'translateZ(0)',
          contain: 'layout paint style',
        }}
      >
        {/* Header — title + Add New on the left, totals + close on the right.
            Single row keeps the modal compact and puts the primary action
            visually anchored to the title it belongs to. */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '16px 24px', borderBottom: '1px solid rgba(0,0,0,0.06)',
          gap: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>Cost Adds</h2>
            <button
              type="button"
              onClick={addDraft}
              style={{
                padding: '7px 14px', borderRadius: 8,
                border: '1px solid rgba(0,0,0,0.14)', background: '#fff',
                fontSize: 13, fontWeight: 600, color: '#1d1d1f',
                cursor: 'pointer', minHeight: 'auto',
              }}
            >+ Add New</button>
          </div>
          <button
            onClick={tryClose}
            style={{
              background: 'none', border: 'none', fontSize: 24, cursor: 'pointer',
              color: 'rgba(0,0,0,0.4)', minHeight: 'auto', padding: 0, lineHeight: 1,
            }}
          >×</button>
        </div>

        {/* Column headers */}
        <div style={{
          display: 'grid', gridTemplateColumns: COST_ROW_COLUMNS,
          gap: 12, padding: '12px 24px',
          fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.08em', color: 'rgba(0,0,0,0.55)',
          borderBottom: '1px solid rgba(0,0,0,0.08)',
        }}>
          <div>Description</div>
          <div>Category</div>
          <div>Cost</div>
          <div>Payment Method</div>
          <div>Vendor</div>
          <div>Date Added</div>
          <div>Memo</div>
          <div></div>
        </div>

        {/* Body (existing + drafts) — minHeight guarantees the Description
            combobox dropdown has vertical room to expand even when only a
            single draft row exists. overflowY:auto kicks in once there are
            enough rows that the modal needs scrolling. overflow:visible on
            the inner container (handled by removing paint containment) lets
            the absolutely-positioned dropdown extend beyond row height when
            it opens below an input near the bottom. */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '4px 24px 12px',
          minHeight: 420,
          // overscrollBehavior prevents scroll chaining (the gesture from
          // bouncing the page behind once you hit the modal's edge).
          // contain:layout/style isolates layout + CSS counter scopes for perf;
          // we intentionally drop contain:paint so the combobox popover isn't
          // clipped when it grows beyond its input row.
          overscrollBehavior: 'contain',
          contain: 'layout style',
          transform: 'translateZ(0)',
        }}>
          {costAdds.length === 0 && drafts.length === 0 ? (
            <div style={{
              padding: '50px 20px', textAlign: 'center', color: 'rgba(0,0,0,0.45)', fontSize: 13,
            }}>
              <p style={{ fontSize: 28, marginBottom: 10, opacity: 0.35 }}>＄</p>
              <p style={{ fontWeight: 600, color: 'rgba(0,0,0,0.55)' }}>No cost adds yet</p>
              <p style={{ marginTop: 4 }}>Click <strong>Add New</strong> above to start adding one or more.</p>
            </div>
          ) : (
            <>
              {/* Existing cost adds — read-only */}
              {costAdds.map((c) => {
                const canDelete = isAdmin || c.addedBy?.id === currentUserId
                return (
                  <div key={c.id} style={{
                    display: 'grid', gridTemplateColumns: COST_ROW_COLUMNS,
                    gap: 12, alignItems: 'center', padding: '10px 0',
                    borderBottom: '1px solid rgba(0,0,0,0.05)',
                    fontSize: 13, color: '#1d1d1f',
                  }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                         title={c.description ?? ''}>
                      {c.description || <span style={{ color: 'rgba(0,0,0,0.35)' }}>—</span>}
                    </div>
                    <div style={{ color: 'rgba(0,0,0,0.7)' }}>{COST_KIND_LABELS[c.kind] || c.kind}</div>
                    <div style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{money(c.amountCents / 100)}</div>
                    <div style={{ color: 'rgba(0,0,0,0.7)' }}>
                      {c.paymentMethod
                        ? (PAYMENT_METHOD_OPTIONS.find(p => p.value === c.paymentMethod)?.label ?? c.paymentMethod)
                        : <span style={{ color: 'rgba(0,0,0,0.35)' }}>—</span>}
                    </div>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                         title={c.partner?.companyName ?? c.vendor ?? ''}>
                      {c.partner?.companyName ?? c.vendor ?? <span style={{ color: 'rgba(0,0,0,0.35)' }}>—</span>}
                    </div>
                    <div style={{ color: 'rgba(0,0,0,0.7)', fontVariantNumeric: 'tabular-nums' }}>{fmtDate(c.addedAt)}</div>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'rgba(0,0,0,0.65)' }}
                         title={c.memo ?? ''}>
                      {c.memo || <span style={{ color: 'rgba(0,0,0,0.35)' }}>—</span>}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      {canDelete && (
                        <button
                          onClick={() => onDelete(c.id)}
                          disabled={busy}
                          title="Delete this cost add"
                          style={{
                            background: 'none', border: 'none', fontSize: 15, cursor: 'pointer',
                            color: 'rgba(0,0,0,0.3)', padding: '4px 6px', minHeight: 'auto',
                          }}
                        >🗑</button>
                      )}
                    </div>
                  </div>
                )
              })}

              {/* Pending drafts — editable */}
              {drafts.map((d) => (
                <div key={d.id} style={{
                  display: 'grid', gridTemplateColumns: COST_ROW_COLUMNS,
                  gap: 12, alignItems: 'center', padding: '8px 0',
                  borderBottom: '1px solid rgba(0,0,0,0.05)',
                  background: 'rgba(0, 113, 227, 0.03)',
                }}>
                  <CreatableCombobox
                    value={d.description}
                    options={descriptionOptions}
                    isAdmin={isAdmin}
                    onChange={(v) => updateDraft(d.id, { description: v })}
                    onAddOption={addDescriptionOption}
                  />
                  <CreatableCombobox
                    value={d.kind}
                    options={categoryOptions}
                    isAdmin={isAdmin}
                    placeholder="Category"
                    onChange={(v) => updateDraft(d.id, { kind: v })}
                    onAddOption={addCategoryOption}
                  />
                  <input
                    type="number" step="0.01" min="0"
                    value={d.amount}
                    onChange={(e) => updateDraft(d.id, { amount: e.target.value })}
                    placeholder="$0.00"
                    style={{ ...cellInputStyle, fontVariantNumeric: 'tabular-nums' }}
                  />
                  <CreatableCombobox
                    value={PAYMENT_METHOD_OPTIONS.find(p => p.value === d.paymentMethod)?.label ?? d.paymentMethod}
                    options={PAYMENT_METHOD_OPTIONS.map(p => p.label)}
                    isAdmin={isAdmin}
                    allowCreate={false}
                    placeholder="Payment Method"
                    onChange={(newLabel) => {
                      // Translate the user-visible label back into the canonical
                      // value we store in cost_adds.payment_method so reports +
                      // QuickBooks sync see consistent normalized strings.
                      const option = PAYMENT_METHOD_OPTIONS.find(p => p.label === newLabel)
                      updateDraft(d.id, { paymentMethod: option?.value ?? newLabel })
                    }}
                    onAddOption={async () => false}
                  />
                  <VendorPicker
                    value={d.partnerId ? d.partnerName : d.vendor}
                    isAdmin={isAdmin}
                    onChange={(text) => updateDraft(d.id, { vendor: text, partnerId: null, partnerName: '' })}
                    onPickPartner={(p) => updateDraft(d.id, { partnerId: p.id, partnerName: p.companyName, vendor: p.companyName })}
                    onRequestAddNew={(typedName) => setAddPartnerState({ draftId: d.id, initialName: typedName })}
                  />
                  <input
                    type="date"
                    value={d.addedAt}
                    onChange={(e) => updateDraft(d.id, { addedAt: e.target.value })}
                    style={cellInputStyle}
                  />
                  <input
                    value={d.memo}
                    onChange={(e) => updateDraft(d.id, { memo: e.target.value })}
                    placeholder="Notes"
                    style={cellInputStyle}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => removeDraft(d.id)}
                      title="Discard this row"
                      style={{
                        background: 'none', border: 'none', fontSize: 15, cursor: 'pointer',
                        color: 'rgba(0,0,0,0.3)', padding: '4px 6px', minHeight: 'auto',
                      }}
                    >×</button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Footer — 3-column: unsaved status (left), totals (center), actions (right) */}
        <div style={{
          display: 'grid', alignItems: 'center',
          gridTemplateColumns: '1fr auto 1fr',
          padding: '14px 24px', borderTop: '1px solid rgba(0,0,0,0.06)',
          background: 'rgba(0,0,0,0.02)', gap: 16,
        }}>
          <p style={{ fontSize: 12, color: saveError ? '#dc2626' : 'rgba(0,0,0,0.5)' }}>
            {saveError ?? (drafts.length > 0
              ? `${drafts.length} unsaved row${drafts.length > 1 ? 's' : ''}`
              : 'No unsaved changes')}
          </p>
          <div style={{ textAlign: 'center' }}>
            <p style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
              textTransform: 'uppercase', color: 'rgba(0,0,0,0.5)',
              lineHeight: 1,
            }}>Total · {costAdds.length} {costAdds.length === 1 ? 'entry' : 'entries'}</p>
            <p style={{
              fontSize: 17, fontWeight: 800, color: '#0a0a0a',
              letterSpacing: '-0.015em', fontVariantNumeric: 'tabular-nums',
              marginTop: 3, lineHeight: 1,
            }}>{money(total)}</p>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={tryClose} disabled={saving} style={v2Btn('ghost')}>Close</button>
            <button onClick={save} disabled={saving || drafts.length === 0} style={v2Btn('primary')}>
              {saving ? 'Saving…' : `Save${drafts.length > 0 ? ` (${drafts.length})` : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>

    {/* Layered Add-Partner modal — opens when the user clicks "+ Add New Partner"
        in a Vendor cell. On save the new partner is attached to the originating
        draft row so the user is back to filling out the cost add with the
        partner pre-selected. */}
    {addPartnerState && (
      <AddPartnerModal
        initialCompanyName={addPartnerState.initialName}
        initialCategories={['vendor']}
        onClose={() => setAddPartnerState(null)}
        onSaved={(partner) => {
          const targetId = addPartnerState.draftId
          setDrafts(prev => prev.map(d => d.id === targetId
            ? { ...d, partnerId: partner.id, partnerName: partner.companyName, vendor: partner.companyName }
            : d))
          setAddPartnerState(null)
        }}
      />
    )}
    </>
  )
}

const cellInputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', border: '1px solid rgba(0,0,0,0.12)',
  borderRadius: 7, fontSize: 13, background: '#fff', color: '#1d1d1f',
  minHeight: 'auto', boxSizing: 'border-box',
}

/**
 * Reusable combobox — type freely, click to see a dealership-wide quick-pick list,
 * admin can add a new option inline. Used for Description AND Category columns
 * in the Cost Adds modal (each backed by its own dropdown options table).
 *
 * Click chevron / focus → popover opens with options filtered by current text.
 * Click an option → input fills with that name.
 * Type a value not in the list → bottom of popover shows "+ Add '<value>' to list"
 *   IF current user is admin. Non-admins just keep their typed value as free text
 *   — the underlying cost add still saves fine, it just doesn't enrich the
 *   organization-wide quick-pick list.
 */
function CreatableCombobox({
  value, options, isAdmin, placeholder, allowCreate = true, onChange, onAddOption,
}: {
  value: string
  options: string[]
  isAdmin: boolean
  placeholder?: string
  /** When false, the "+ Add 'X' to list" affordance never appears regardless
   *  of admin status. Use for fixed lists like Payment Method where the set
   *  of valid values is closed. Defaults to true. */
  allowCreate?: boolean
  onChange: (v: string) => void
  onAddOption: (name: string) => Promise<boolean>
}) {
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function handleDown(e: MouseEvent) {
      if (!wrapperRef.current) return
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleDown)
    return () => document.removeEventListener('mousedown', handleDown)
  }, [open])

  const trimmedValue = value.trim()
  const filtered = trimmedValue
    ? options.filter(o => o.toLowerCase().includes(trimmedValue.toLowerCase()))
    : options
  const exactMatch = options.some(o => o.toLowerCase() === trimmedValue.toLowerCase())
  const canAdd = allowCreate && isAdmin && trimmedValue.length > 0 && !exactMatch

  async function handleAdd() {
    if (!canAdd || adding) return
    setAdding(true)
    try {
      await onAddOption(trimmedValue)
    } finally {
      setAdding(false)
    }
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder={placeholder ?? '—'}
          style={{ ...cellInputStyle, paddingRight: 26 }}
        />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Open description list"
          style={{
            position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '4px 6px', minHeight: 'auto',
            color: 'rgba(0,0,0,0.45)', fontSize: 10, lineHeight: 1,
          }}
        >▾</button>
      </div>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: '#fff', borderRadius: 8,
          border: '1px solid rgba(0,0,0,0.1)',
          boxShadow: '0 12px 28px rgba(0,0,0,0.12)',
          zIndex: 50,
          maxHeight: 240, overflowY: 'auto',
          fontSize: 13,
        }}>
          {filtered.length === 0 && !canAdd && (
            <div style={{ padding: '10px 12px', color: 'rgba(0,0,0,0.45)' }}>
              {trimmedValue ? 'No matches' : 'No options yet'}
            </div>
          )}
          {filtered.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => { onChange(o); setOpen(false) }}
              style={{
                display: 'flex', width: '100%', textAlign: 'left',
                padding: '8px 12px', background: 'none', border: 'none',
                cursor: 'pointer', color: '#1d1d1f', fontSize: 13,
                minHeight: 'auto',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,113,227,0.06)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >{o}</button>
          ))}
          {canAdd && (
            <button
              type="button"
              onClick={handleAdd}
              disabled={adding}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                width: '100%', textAlign: 'left',
                padding: '10px 12px', background: 'rgba(0,113,227,0.06)',
                border: 'none', borderTop: filtered.length > 0 ? '1px solid rgba(0,0,0,0.06)' : 'none',
                cursor: 'pointer', color: '#0071e3', fontWeight: 600,
                fontSize: 12,
                minHeight: 'auto',
              }}
            >
              {adding ? `Adding "${trimmedValue}"…` : `+ Add "${trimmedValue}" to list`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Vendor Picker ──────────────────────────────────────────────────
// Type-ahead combobox specifically for the Vendor column on Cost Adds. Searches
// Partners filtered to category='vendor'. If no match exists, admins see a
// "+ Add New Partner" affordance that opens AddPartnerModal with the typed
// company name pre-filled and the Vendor category pre-checked.
function VendorPicker({
  isAdmin, onPickPartner, onRequestAddNew, value, onChange,
}: {
  isAdmin: boolean
  onPickPartner: (partner: { id: string; companyName: string }) => void
  onRequestAddNew: (typedName: string) => void
  /** Controlled mode (Cost Adds row needs the typed text to land in a draft).
   *  Leave undefined for uncontrolled mode — used by the Purchase Info
   *  picker where typing only filters the dropdown, never commits. */
  value?: string
  onChange?: (text: string) => void
}) {
  // Picker supports both controlled (parent passes value+onChange) and
  // uncontrolled (picker owns the typing state).  Purchase Info uses
  // uncontrolled because its parent's onChange was a no-op — the input
  // appeared read-only to the user.
  const isControlled = value !== undefined && onChange !== undefined
  const [internalQuery, setInternalQuery] = useState('')
  const query = isControlled ? value! : internalQuery
  const setQuery = (v: string) => {
    if (isControlled) onChange!(v)
    else setInternalQuery(v)
  }
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<PartnerSummary[]>([])
  const [loading, setLoading] = useState(false)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const lastQueryRef = useRef('')

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleDown(e: MouseEvent) {
      if (!wrapperRef.current) return
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleDown)
    return () => document.removeEventListener('mousedown', handleDown)
  }, [open])

  // Debounced search: refetch ~200ms after the query stops changing.
  useEffect(() => {
    if (!open) return
    lastQueryRef.current = query
    const t = setTimeout(async () => {
      if (lastQueryRef.current !== query) return
      setLoading(true)
      try {
        const params = new URLSearchParams({ category: 'vendor', take: '25' })
        if (query.trim()) params.set('search', query.trim())
        const r = await fetch(`/api/partners?${params}`)
        const d = await r.json()
        setResults(Array.isArray(d?.partners) ? d.partners : [])
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 200)
    return () => clearTimeout(t)
  }, [query, open])

  const trimmed = query.trim()
  const exactMatch = results.some(p => p.companyName.toLowerCase() === trimmed.toLowerCase())
  const canAddNew = isAdmin && trimmed.length > 0 && !exactMatch

  return (
    <div ref={wrapperRef} style={{ position: 'relative', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Search vendors…"
          style={{ ...cellInputStyle, paddingRight: 26 }}
        />
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          aria-label="Open vendor list"
          style={{
            position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '4px 6px', minHeight: 'auto',
            color: 'rgba(0,0,0,0.45)', fontSize: 10, lineHeight: 1,
          }}
        >▾</button>
      </div>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: '#fff', borderRadius: 8,
          border: '1px solid rgba(0,0,0,0.1)',
          boxShadow: '0 12px 28px rgba(0,0,0,0.12)',
          zIndex: 50,
          maxHeight: 280, overflowY: 'auto',
          fontSize: 13, minWidth: 240,
        }}>
          {loading && results.length === 0 && (
            <div style={{ padding: '10px 12px', color: 'rgba(0,0,0,0.45)' }}>Searching…</div>
          )}
          {!loading && results.length === 0 && !canAddNew && (
            <div style={{ padding: '10px 12px', color: 'rgba(0,0,0,0.45)' }}>
              {trimmed ? `No vendor matching "${trimmed}"` : 'No vendors yet'}
            </div>
          )}
          {results.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => { onPickPartner({ id: p.id, companyName: p.companyName }); setOpen(false) }}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                gap: 2, width: '100%', textAlign: 'left',
                padding: '8px 12px', background: 'none', border: 'none',
                cursor: 'pointer', color: '#1d1d1f', minHeight: 'auto',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,113,227,0.06)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              <span style={{ fontWeight: 600 }}>{p.companyName}</span>
              {(p.phone || p.contactName) && (
                <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.5)' }}>
                  {[p.contactName, p.phone].filter(Boolean).join(' · ')}
                </span>
              )}
            </button>
          ))}
          {canAddNew && (
            <button
              type="button"
              onClick={() => { onRequestAddNew(trimmed); setOpen(false) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                width: '100%', textAlign: 'left',
                padding: '10px 12px', background: 'rgba(0,113,227,0.06)',
                border: 'none', borderTop: results.length > 0 ? '1px solid rgba(0,0,0,0.06)' : 'none',
                cursor: 'pointer', color: '#0071e3', fontWeight: 600, fontSize: 12,
                minHeight: 'auto',
              }}
            >+ Add new partner "{trimmed}"</button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Add Partner Modal ──────────────────────────────────────────────
// Matches the DealerCenter "Add New Partner" surface: category checkboxes on
// top, General Info / Contact Info / Shipping Info three-column grid below.
// Pre-checks the originating category (e.g. "Vendor" when opened from a Cost
// Adds vendor cell) and pre-fills the Company Name with whatever text the
// user typed before clicking + Add new partner.
function AddPartnerModal({
  initialCompanyName, initialCategories, onClose, onSaved,
}: {
  initialCompanyName: string
  initialCategories: string[]
  onClose: () => void
  onSaved: (partner: { id: string; companyName: string }) => void
}) {
  // Lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const [categories, setCategories] = useState<Set<string>>(() => new Set(initialCategories))
  const [companyName, setCompanyName] = useState(initialCompanyName)
  const [companyAlias, setCompanyAlias] = useState('')
  const [dealerNo, setDealerNo] = useState('')
  const [phone, setPhone] = useState('')
  const [phoneAlternative, setPhoneAlternative] = useState('')
  const [licenseNo, setLicenseNo] = useState('')
  const [ein, setEin] = useState('')
  const [salesTaxLicense, setSalesTaxLicense] = useState('')
  const [lienCode, setLienCode] = useState('')

  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactCell, setContactCell] = useState('')
  const [contactAddress, setContactAddress] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactLossPayeeAddress, setContactLossPayeeAddress] = useState('')
  const [contactAlias, setContactAlias] = useState('')

  const [shippingName, setShippingName] = useState('')
  const [shippingBusinessPhone, setShippingBusinessPhone] = useState('')
  const [shippingAddress, setShippingAddress] = useState('')

  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function toggleCategory(v: string) {
    setCategories(prev => {
      const next = new Set(prev)
      if (next.has(v)) next.delete(v)
      else next.add(v)
      return next
    })
  }

  async function save() {
    setErr(null)
    if (!companyName.trim()) { setErr('Company Name is required'); return }
    setSaving(true)
    try {
      const r = await fetch('/api/partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: companyName.trim(),
          categories: Array.from(categories),
          companyAlias, dealerNo, phone, phoneAlternative, licenseNo, ein,
          salesTaxLicense, lienCode,
          contactName, contactPhone, contactCell, contactAddress, contactEmail,
          contactLossPayeeAddress, contactAlias,
          shippingName, shippingBusinessPhone, shippingAddress,
        }),
      })
      if (!r.ok) {
        const txt = await r.text()
        setErr(`Save failed (${r.status}): ${txt.slice(0, 160)}`)
        setSaving(false)
        return
      }
      const data = await r.json()
      const created = data?.partner
      if (!created?.id) {
        setErr('Save returned no partner record')
        setSaving(false)
        return
      }
      onSaved({ id: created.id, companyName: created.companyName })
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }

  // Render via portal at document.body so the modal escapes any transformed
  // ancestor.
  return createPortal((
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 110,
        background: 'rgba(15, 23, 42, 0.32)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          // Mesh-gradient backdrop matching the vehicle detail page hero:
          // soft pink/purple/cyan/blue radial blobs layered over an off-white
          // base at ~85% opacity. Same blob palette as the hero on
          // /vehicles/[id] so the modal reads as part of that page.
          background: [
            'radial-gradient(at 18% 24%, hsla(220, 90%, 72%, 0.22) 0px, transparent 55%)',
            'radial-gradient(at 82% 8%, hsla(280, 80%, 68%, 0.20) 0px, transparent 55%)',
            'radial-gradient(at 72% 76%, hsla(190, 70%, 78%, 0.16) 0px, transparent 50%)',
            'radial-gradient(at 4% 96%, hsla(340, 75%, 72%, 0.18) 0px, transparent 55%)',
            'radial-gradient(at 50% 50%, hsla(40, 80%, 80%, 0.10) 0px, transparent 50%)',
            'rgba(248, 248, 246, 0.85)',
          ].join(', '),
          backdropFilter: 'blur(20px) saturate(160%)',
          WebkitBackdropFilter: 'blur(20px) saturate(160%)',
          borderRadius: 22,
          border: '1px solid rgba(255, 255, 255, 0.7)',
          width: 'min(92vw, 1240px)',
          maxHeight: 'calc(100vh - 40px)',
          display: 'flex', flexDirection: 'column',
          boxShadow: [
            '0 30px 80px -20px rgba(15, 23, 42, 0.45)',
            '0 12px 32px -10px rgba(15, 23, 42, 0.18)',
            'inset 0 1px 0 rgba(255, 255, 255, 0.9)',
            'inset 0 0 0 0.5px rgba(255, 255, 255, 0.5)',
          ].join(', '),
          transform: 'translateZ(0)', contain: 'layout style',
          overflow: 'hidden',
        }}
      >
        {/* Header — no divider line, glass continues edge-to-edge */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '14px 28px 18px',
        }}>
          <h2 style={{
            fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em',
            color: '#0a0a0a', lineHeight: 1, margin: 0,
          }}>Add New Partner</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.55)',
              border: '1px solid rgba(255, 255, 255, 0.6)',
              boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.85), 0 1px 2px rgba(15, 23, 42, 0.06)',
              fontSize: 18, cursor: 'pointer', color: 'rgba(0,0,0,0.55)',
              minHeight: 'auto', padding: 0, lineHeight: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >×</button>
        </div>

        {/* Scrollable body — Category card on top (full width), three section
            cards side-by-side below. Each section card is its own
            glassmorphic surface; fields inside use label-above + bold-value
            on a faint white backplate for the Apple-style data entry feel. */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '0 24px 20px',
          overscrollBehavior: 'contain',
        }}>
          {/* ── Category card ── */}
          <SectionCard>
            <SectionCardLabel>Category</SectionCardLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {PARTNER_CATEGORIES.map(c => (
                <SatinTagChip
                  key={c.value}
                  label={c.label}
                  selected={categories.has(c.value)}
                  onToggle={() => toggleCategory(c.value)}
                />
              ))}
            </div>
          </SectionCard>

          {/* ── Three section cards side-by-side ── */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
            gap: 16, alignItems: 'start',
          }}>
            {/* General Info */}
            <SectionCard>
              <SectionCardLabel>General Info</SectionCardLabel>
              <FieldStack>
                <FieldBackplate>
                  <PremiumField label="Company Name" value={companyName} onChange={setCompanyName} required />
                </FieldBackplate>
                <FieldBackplate>
                  <PremiumField label="Company Name Alias" value={companyAlias} onChange={setCompanyAlias} />
                </FieldBackplate>
                <FieldBackplate>
                  <PremiumField label="Dealer No" value={dealerNo} onChange={setDealerNo} />
                </FieldBackplate>
                <FieldRow cols={[1, 1]}>
                  <FieldBackplate>
                    <PremiumField label="Phone" value={phone} onChange={(v) => setPhone(formatPhone(v))} />
                  </FieldBackplate>
                  <FieldBackplate>
                    <PremiumField label="Phone Alt" value={phoneAlternative} onChange={(v) => setPhoneAlternative(formatPhone(v))} />
                  </FieldBackplate>
                </FieldRow>
                <FieldRow cols={[1, 1]}>
                  <FieldBackplate>
                    <PremiumField label="License No" value={licenseNo} onChange={setLicenseNo} />
                  </FieldBackplate>
                  <FieldBackplate>
                    <PremiumField label="EIN / Federal ID" value={ein} onChange={setEin} />
                  </FieldBackplate>
                </FieldRow>
                <FieldRow cols={[1, 1]}>
                  <FieldBackplate>
                    <PremiumField label="Sales Tax License" value={salesTaxLicense} onChange={setSalesTaxLicense} />
                  </FieldBackplate>
                  <FieldBackplate>
                    <PremiumField label="Lien Code" value={lienCode} onChange={setLienCode} />
                  </FieldBackplate>
                </FieldRow>
              </FieldStack>
            </SectionCard>

            {/* Contact Info */}
            <SectionCard>
              <SectionCardLabel>Contact Info</SectionCardLabel>
              <FieldStack>
                <FieldBackplate>
                  <PremiumField label="Name" value={contactName} onChange={setContactName} />
                </FieldBackplate>
                <FieldRow cols={[1, 1]}>
                  <FieldBackplate>
                    <PremiumField label="Phone" value={contactPhone} onChange={(v) => setContactPhone(formatPhone(v))} />
                  </FieldBackplate>
                  <FieldBackplate>
                    <PremiumField label="Cell" value={contactCell} onChange={(v) => setContactCell(formatPhone(v))} />
                  </FieldBackplate>
                </FieldRow>
                <FieldBackplate>
                  <PremiumField label="Address" value={contactAddress} onChange={setContactAddress} placeholder="Street, City, State, ZIP" />
                </FieldBackplate>
                <FieldBackplate>
                  <PremiumField label="Email" value={contactEmail} onChange={setContactEmail} placeholder="name@example.com" />
                </FieldBackplate>
                <FieldBackplate>
                  <PremiumField label="Loss Payee Address" value={contactLossPayeeAddress} onChange={setContactLossPayeeAddress} placeholder="Street, City, State, ZIP" />
                </FieldBackplate>
                <FieldBackplate>
                  <PremiumField label="Alias" value={contactAlias} onChange={setContactAlias} />
                </FieldBackplate>
              </FieldStack>
            </SectionCard>

            {/* Shipping Info */}
            <SectionCard>
              <SectionCardLabel>Shipping Info</SectionCardLabel>
              <FieldStack>
                <FieldRow cols={[1, 1]}>
                  <FieldBackplate>
                    <PremiumField label="Name" value={shippingName} onChange={setShippingName} />
                  </FieldBackplate>
                  <FieldBackplate>
                    <PremiumField label="Business Phone" value={shippingBusinessPhone} onChange={(v) => setShippingBusinessPhone(formatPhone(v))} />
                  </FieldBackplate>
                </FieldRow>
                <FieldBackplate>
                  <PremiumField label="Address" value={shippingAddress} onChange={setShippingAddress} placeholder="Street, City, State, ZIP" />
                </FieldBackplate>
              </FieldStack>
            </SectionCard>
          </div>
        </div>

        {/* Footer — floating glass strip, no harsh divider */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 28px 18px', gap: 12,
          background: 'linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.55) 100%)',
        }}>
          <p style={{ fontSize: 12, fontWeight: 500, color: err ? '#dc2626' : 'rgba(0,0,0,0.5)', letterSpacing: '-0.005em' }}>
            {err ?? `${categories.size} categor${categories.size === 1 ? 'y' : 'ies'} selected`}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button
              onClick={onClose}
              disabled={saving}
              style={{
                background: 'none', border: 'none',
                padding: '8px 4px', fontSize: 13, fontWeight: 600,
                color: 'rgba(0,0,0,0.55)', cursor: 'pointer', minHeight: 'auto',
                letterSpacing: '-0.005em',
                opacity: saving ? 0.5 : 1,
              }}
            >Cancel</button>
            <PremiumPillButton
              label={saving ? 'Saving…' : 'Save Partner'}
              onClick={save}
              disabled={saving || !companyName.trim()}
            />
          </div>
        </div>
      </div>
    </div>
  ), document.body)
}

// ─── Premium components for AddPartnerModal ─────────────────────────
// SectionCard, SectionCardLabel, FieldStack, FieldRow, FieldBackplate,
// PremiumField, PremiumFieldSelect, PremiumFieldDate, PremiumPillButton and
// formatPhone now live in components/customer-form-ui.tsx (shared with
// AddCustomerModal, which was extracted to components/AddCustomerModal.tsx
// because Next.js forbids non-page exports from a page.tsx route file).

// Card shown when the vehicle's Source is locked to a Partner (vendor) or
// Contact (customer). Fetches the full record by id and surfaces the
// phone / email / address inline below the name so the user doesn't have to
// click through to the partner / contact detail page to see it.
function AttachedSourceCard({
  kind, partnerId, contactId, fallbackName,
}: {
  kind: 'vendor' | 'customer'
  partnerId: string | null
  contactId: string | null
  fallbackName: string
}) {
  const [detail, setDetail] = useState<{
    name: string
    phone: string | null
    email: string | null
    address: string | null
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        if (kind === 'vendor' && partnerId) {
          const r = await fetch(`/api/partners/${partnerId}`)
          if (!r.ok) return
          const d = await r.json()
          const p = d?.partner
          if (cancelled || !p) return
          setDetail({
            name: p.companyName ?? fallbackName,
            phone: p.contactCell || p.contactPhone || p.phone || null,
            email: p.contactEmail || null,
            address: p.contactAddress || p.shippingAddress || null,
          })
        } else if (kind === 'customer' && contactId) {
          const r = await fetch(`/api/contacts/${contactId}`)
          if (!r.ok) return
          const c = await r.json()
          if (cancelled || !c?.id) return
          const name = [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || fallbackName
          const address = [c.address, c.city, c.state, c.zip].filter(Boolean).join(', ')
          setDetail({
            name,
            phone: c.phone || c.homePhone || null,
            email: c.email || null,
            address: address || null,
          })
        }
      } catch { /* swallow */ }
    }
    void load()
    return () => { cancelled = true }
  }, [kind, partnerId, contactId, fallbackName])

  const name = detail?.name ?? fallbackName

  return (
    <div style={{
      padding: '10px 14px',
      background: 'rgba(0, 113, 227, 0.05)',
      border: '1px solid rgba(0, 113, 227, 0.18)',
      borderRadius: 10,
    }}>
      <p style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: 'rgba(0,0,0,0.5)',
      }}>Attached {kind}</p>
      {kind === 'customer' && contactId ? (
        <a
          href={`/contacts/${contactId}`}
          target="_blank"
          rel="noopener noreferrer"
          title="Open customer profile (new tab)"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 14, fontWeight: 700, color: '#0a0a0a',
            marginTop: 2, textDecoration: 'none',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            maxWidth: '100%',
            transition: 'color 140ms ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#0071e3' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#0a0a0a' }}
        >
          {name}
          <span style={{ fontSize: 11, color: '#0071e3', flexShrink: 0 }}>↗</span>
        </a>
      ) : (
        <p style={{
          fontSize: 14, fontWeight: 700, color: '#0a0a0a',
          marginTop: 2,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{name}</p>
      )}

      {detail && (detail.phone || detail.email || detail.address) && (
        <div style={{
          marginTop: 12,
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          {detail.phone && (
            <AttachedRow label="Phone" value={formatPhone(detail.phone)} />
          )}
          {detail.email && (
            <AttachedRow label="Email" value={detail.email} />
          )}
          {detail.address && (
            <AttachedRow label="Address" value={detail.address} />
          )}
        </div>
      )}
    </div>
  )
}

// Single row inside AttachedSourceCard — chip-style backplate with label LEFT
// and value RIGHT, matched to the chip rows on the Source/Purchase Info card
// so it reads as one of "our" rows rather than a floating definition list.
function AttachedRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '8px 12px',
      background: 'rgba(255, 255, 255, 0.55)',
      border: '1px solid rgba(255, 255, 255, 0.65)',
      borderRadius: 10,
      boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.85), 0 1px 2px rgba(15, 23, 42, 0.04)',
    }}>
      <span style={{
        fontSize: 12, fontWeight: 600,
        color: 'rgba(15, 23, 42, 0.55)',
        letterSpacing: '-0.005em',
        flexShrink: 0, width: 56,
        lineHeight: 1,
      }}>{label}</span>
      <span style={{
        fontSize: 13.5, fontWeight: 700, color: '#0a0a0a',
        letterSpacing: '-0.005em', lineHeight: 1,
        flex: 1, minWidth: 0,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        fontVariantNumeric: 'tabular-nums',
      }}>{value}</span>
    </div>
  )
}

// SalesRepPicker, CollapsibleSectionToggle, CollapsibleStubInline and
// InterestedVehiclePicker now live in components/customer-form-ui.tsx (see
// note above) — they were only used by AddCustomerModal.

function SatinTagChip({
  label, selected, onToggle,
}: { label: string; selected: boolean; onToggle: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      type="button"
      onClick={onToggle}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '8px 16px', borderRadius: 999,
        fontSize: 12.5, fontWeight: 600, letterSpacing: '-0.005em',
        cursor: 'pointer', minHeight: 'auto', userSelect: 'none',
        transition: 'background 200ms ease, color 200ms ease, transform 200ms ease, box-shadow 200ms ease, border-color 200ms ease',
        transform: hover && !selected ? 'translateY(-0.5px)' : 'none',
        ...(selected
          ? {
              // Dark satin capsule when selected: deep gradient, subtle glow,
              // crisp top highlight to mimic satin sheen.
              background: 'linear-gradient(180deg, #2a2a2c 0%, #18181b 100%)',
              color: '#fafafa',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              boxShadow: [
                '0 4px 14px -4px rgba(15, 23, 42, 0.35)',
                '0 0 0 1px rgba(10, 132, 255, 0.18)',
                'inset 0 1px 0 rgba(255, 255, 255, 0.18)',
              ].join(', '),
            }
          : {
              // Translucent floating tag — soft white blur, dark text.
              background: hover ? 'rgba(255, 255, 255, 0.72)' : 'rgba(255, 255, 255, 0.5)',
              color: '#1d1d1f',
              border: '1px solid rgba(255, 255, 255, 0.65)',
              boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.85), 0 1px 2px rgba(15, 23, 42, 0.05)',
            }),
      }}
    >{label}</button>
  )
}

function GlassFieldGroup({ children }: { children: React.ReactNode }) {
  // Faint translucent row backplate that visually groups related fields.
  return (
    <div style={{
      background: 'rgba(255, 255, 255, 0.32)',
      borderRadius: 12,
      border: '1px solid rgba(255, 255, 255, 0.55)',
      boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.7), 0 1px 2px rgba(15, 23, 42, 0.04)',
      padding: '6px 14px',
      marginBottom: 10,
    }}>{children}</div>
  )
}

function GlassField({
  label, value, onChange, placeholder, required,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  required?: boolean
}) {
  const [focused, setFocused] = useState(false)
  return (
    <label style={{
      display: 'block', padding: '8px 0',
      borderBottom: '1px solid rgba(15, 23, 42, 0.06)',
    }}>
      <span style={{
        display: 'block', fontSize: 10.5, fontWeight: 600,
        color: 'rgba(15, 23, 42, 0.5)',
        letterSpacing: '0.06em', textTransform: 'uppercase',
        marginBottom: 3,
      }}>
        {label}{required && <span style={{ color: '#dc2626', marginLeft: 2 }}>*</span>}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: '100%', padding: '2px 0',
          border: 'none', outline: 'none', background: 'transparent',
          fontSize: 14, fontWeight: 700, color: '#0a0a0a',
          letterSpacing: '-0.005em',
          boxShadow: focused ? 'inset 0 -2px 0 -1px #0071e3' : 'none',
          transition: 'box-shadow 160ms ease',
        }}
      />
    </label>
  )
}

// PremiumPillButton now lives in components/customer-form-ui.tsx (see note
// above).

// ─── V2 chip-row form helpers (Build/Title aesthetic) ───────────────
// Same visual language as the InlineTextField chip rows on Build/Title and
// Title Registration sub-tabs. Each field is a glass chip: label on the
// left, always-editable input on the right, translucent fill, inset highlight
// at top edge, soft drop shadow, subtle dark border. Focus = blue ring.

function PartnerSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{
      fontSize: 10.5, fontWeight: 700, color: 'rgba(0,0,0,0.5)',
      marginBottom: 12, letterSpacing: '0.14em',
      textTransform: 'uppercase',
    }}>{children}</h3>
  )
}

function PartnerRow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${React.Children.count(children)}, 1fr)`,
      gap: 8, marginBottom: 8,
    }}>{children}</div>
  )
}

// Pill-shaped chip row matching the Acquisition column on the Purchase Info
// card: very rounded, soft translucent fill, barely-visible border, inset
// highlight at the top edge, label LEFT (muted weight 600), value RIGHT
// (bold black). Hover lift on the whole chip; blue focus ring on input.
function chipFieldStyle(focused: boolean, hover: boolean): React.CSSProperties {
  const bg = focused
    ? 'rgba(255, 255, 255, 0.86)'
    : hover
      ? 'rgba(255, 255, 255, 0.72)'
      : 'rgba(255, 255, 255, 0.46)'
  return {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 12, minWidth: 0,
    padding: '11px 18px',
    borderRadius: 14,
    border: focused
      ? '1px solid rgba(10, 132, 255, 0.45)'
      : '1px solid rgba(255, 255, 255, 0.6)',
    background: bg,
    boxShadow: focused
      ? '0 0 0 3px rgba(10, 132, 255, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 1px 2px rgba(31, 38, 135, 0.05)'
      : 'inset 0 1px 0 rgba(255, 255, 255, 0.9), inset 0 0 0 0.5px rgba(255, 255, 255, 0.45), 0 1px 2px rgba(31, 38, 135, 0.04)',
    transform: hover && !focused ? 'translateY(-0.5px)' : 'none',
    transition: 'background 180ms ease, border-color 160ms ease, box-shadow 160ms ease, transform 180ms ease',
    cursor: 'text',
  }
}

const chipFieldLabelStyle: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, color: 'rgba(0,0,0,0.55)',
  letterSpacing: '-0.005em',
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  flexShrink: 0, minWidth: 0, maxWidth: '50%',
}

const chipFieldInputStyle: React.CSSProperties = {
  flex: 1, minWidth: 0, textAlign: 'right',
  border: 'none', outline: 'none', background: 'transparent',
  fontSize: 14, fontWeight: 700, color: '#0a0a0a',
  padding: 0, margin: 0,
  fontVariantNumeric: 'tabular-nums',
  letterSpacing: '-0.005em',
}

function PartnerField({
  label, value, onChange, placeholder, required,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  required?: boolean
}) {
  const [focused, setFocused] = useState(false)
  const [hover, setHover] = useState(false)
  return (
    <label
      style={{ display: 'block', marginBottom: 8 }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={chipFieldStyle(focused, hover)}>
        <span style={chipFieldLabelStyle}>
          {label}{required && <span style={{ color: '#dc2626', marginLeft: 2 }}>*</span>}
        </span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? '—'}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={chipFieldInputStyle}
        />
      </div>
    </label>
  )
}

// GENDER_OPTIONS, ID_TYPE_OPTIONS, LEAD_TYPE_OPTIONS, LEAD_SOURCE_OPTIONS
// and CUSTOMER_STATUS_OPTIONS now live in components/customer-form-ui.tsx
// (see note above) — they were only used by AddCustomerModal.

// Subset of Contact returned from /api/contacts for the picker dropdown.
type ContactSummary = {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
}

// ─── Customer Picker ────────────────────────────────────────────────
// Mirror of VendorPicker but searches the Contact table filtered to
// contactType='customer'. "+ Add new customer" opens AddCustomerModal which
// captures the full DealerCenter-equivalent Buyer Info on save.
function CustomerPicker({
  onPickContact, onRequestAddNew, value, onChange,
}: {
  onPickContact: (contact: { id: string; firstName: string; lastName: string }) => void
  onRequestAddNew: (typedName: string) => void
  /** See VendorPicker — same controlled/uncontrolled dual mode. */
  value?: string
  onChange?: (text: string) => void
}) {
  const isControlled = value !== undefined && onChange !== undefined
  const [internalQuery, setInternalQuery] = useState('')
  const query = isControlled ? value! : internalQuery
  const setQuery = (v: string) => {
    if (isControlled) onChange!(v)
    else setInternalQuery(v)
  }
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<ContactSummary[]>([])
  const [loading, setLoading] = useState(false)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const lastQueryRef = useRef('')

  useEffect(() => {
    if (!open) return
    function handleDown(e: MouseEvent) {
      if (!wrapperRef.current) return
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleDown)
    return () => document.removeEventListener('mousedown', handleDown)
  }, [open])

  useEffect(() => {
    if (!open) return
    lastQueryRef.current = query
    const t = setTimeout(async () => {
      if (lastQueryRef.current !== query) return
      setLoading(true)
      try {
        const params = new URLSearchParams({ contactType: 'customer', limit: '25' })
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

  return (
    <div ref={wrapperRef} style={{ position: 'relative', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Search customers…"
          style={{ ...cellInputStyle, paddingRight: 26 }}
        />
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          aria-label="Open customer list"
          style={{
            position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '4px 6px', minHeight: 'auto',
            color: 'rgba(0,0,0,0.45)', fontSize: 10, lineHeight: 1,
          }}
        >▾</button>
      </div>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: '#fff', borderRadius: 8,
          border: '1px solid rgba(0,0,0,0.1)',
          boxShadow: '0 12px 28px rgba(0,0,0,0.12)',
          zIndex: 50,
          maxHeight: 280, overflowY: 'auto',
          fontSize: 13, minWidth: 240,
        }}>
          {loading && results.length === 0 && (
            <div style={{ padding: '10px 12px', color: 'rgba(0,0,0,0.45)' }}>Searching…</div>
          )}
          {!loading && results.length === 0 && !canAddNew && (
            <div style={{ padding: '10px 12px', color: 'rgba(0,0,0,0.45)' }}>
              {trimmed ? `No customer matching "${trimmed}"` : 'No customers yet'}
            </div>
          )}
          {results.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => { onPickContact({ id: c.id, firstName: c.firstName, lastName: c.lastName }); setOpen(false) }}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                gap: 2, width: '100%', textAlign: 'left',
                padding: '8px 12px', background: 'none', border: 'none',
                cursor: 'pointer', color: '#1d1d1f', minHeight: 'auto',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,113,227,0.06)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              <span style={{ fontWeight: 600 }}>{c.firstName} {c.lastName}</span>
              {(c.phone || c.email) && (
                <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.5)' }}>
                  {[c.phone, c.email].filter(Boolean).join(' · ')}
                </span>
              )}
            </button>
          ))}
          {canAddNew && (
            <button
              type="button"
              onClick={() => { onRequestAddNew(trimmed); setOpen(false) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                width: '100%', textAlign: 'left',
                padding: '10px 12px', background: 'rgba(0,113,227,0.06)',
                border: 'none', borderTop: results.length > 0 ? '1px solid rgba(0,0,0,0.06)' : 'none',
                cursor: 'pointer', color: '#0071e3', fontWeight: 600, fontSize: 12,
                minHeight: 'auto',
              }}
            >+ Add new customer "{trimmed}"</button>
          )}
        </div>
      )}
    </div>
  )
}

// AddCustomerModal was extracted to components/AddCustomerModal.tsx —
// Next.js forbids a page.tsx route file from exporting anything besides the
// default page component, so it can no longer live here.

function PartnerFieldSelect({
  label, value, onChange, options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  const [focused, setFocused] = useState(false)
  const [hover, setHover] = useState(false)
  return (
    <label
      style={{ display: 'block', marginBottom: 8 }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={chipFieldStyle(focused, hover)}>
        <span style={chipFieldLabelStyle}>{label}</span>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{ ...chipFieldInputStyle, appearance: 'none', cursor: 'pointer' }}
        >
          <option value="">—</option>
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
    </label>
  )
}

function PartnerFieldDate({
  label, value, onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
  const [focused, setFocused] = useState(false)
  const [hover, setHover] = useState(false)
  return (
    <label
      style={{ display: 'block', marginBottom: 8 }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={chipFieldStyle(focused, hover)}>
        <span style={chipFieldLabelStyle}>{label}</span>
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={chipFieldInputStyle}
        />
      </div>
    </label>
  )
}

function CollapsibleSection({
  label, open, onToggle, children,
}: { label: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          background: 'none', border: '1px solid rgba(0,0,0,0.14)',
          borderRadius: 8, padding: '8px 14px',
          fontSize: 13, fontWeight: 600, color: '#1d1d1f',
          cursor: 'pointer', minHeight: 'auto',
        }}
      >{label}{open ? ' ▾' : ''}</button>
      {open && (
        <div style={{ marginTop: 12, padding: '14px 0' }}>{children}</div>
      )}
    </div>
  )
}

function CollapsibleStub({ label }: { label: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <button
        type="button"
        disabled
        title="Coming with sales pipeline"
        style={{
          background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.10)',
          borderRadius: 8, padding: '8px 14px',
          fontSize: 13, fontWeight: 600, color: 'rgba(0,0,0,0.4)',
          cursor: 'not-allowed', minHeight: 'auto',
        }}
      >{label} <span style={{ fontSize: 11, opacity: 0.7 }}>· coming with sales pipeline</span></button>
    </div>
  )
}

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
  // Original glass look restored. Backdrop-filter blur IS expensive (no
  // way around that — it's how frosted glass works). But we push each card
  // to its own GPU layer via translateZ(0) + will-change, so the blur is
  // computed once per card and CACHED as a texture instead of recomputed on
  // every scroll frame. `contain: paint` isolates the work so off-screen
  // cards don't paint at all.
  return (
    <div style={{
      background: 'rgba(255, 255, 255, 0.55)',
      backdropFilter: 'blur(var(--glass-blur, 20px)) saturate(var(--glass-saturate, 180%))',
      WebkitBackdropFilter: 'blur(var(--glass-blur, 20px)) saturate(var(--glass-saturate, 180%))',
      borderRadius: 20,
      border: '1px solid rgba(255, 255, 255, 0.5)',
      padding,
      boxShadow: [
        '0 8px 28px -10px rgba(31, 38, 135, 0.12)',
        '0 1px 3px rgba(0, 0, 0, 0.03)',
        'inset 0 1px 0 rgba(255, 255, 255, 0.75)',
        'inset 0 0 0 0.5px rgba(255, 255, 255, 0.35)',
      ].join(', '),
      transform: 'translateZ(0)',
      willChange: 'transform',
      contain: 'layout style paint',
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
  onSavePartial, onManageCosts, onDeleteCostAdd,
}: {
  vehicle: Vehicle
  costAdds: CostAdd[]
  isAdmin: boolean
  currentUserId: string | null
  busy: boolean
  onSavePartial: (patch: Record<string, unknown>) => Promise<void>
  onManageCosts: () => void
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
              onRowClick={onManageCosts}
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
      fontSize: 14, fontWeight: 800, letterSpacing: '-0.014em',
      color: '#0a0a0a',
      lineHeight: 1,
      marginBottom: 16,
    }}>{children}</h4>
  )
}

// Subtly tinted glass sub-panel — softer than the parent card so sections cluster
// visually without needing horizontal rules.
function SubPanel({ children }: { children: React.ReactNode }) {
  // Original glass restored with GPU-layer hints. See GlassCard comment.
  return (
    <div style={{
      padding: '16px 18px',
      background: 'rgba(255, 255, 255, 0.45)',
      backdropFilter: 'blur(var(--glass-blur, 20px)) saturate(var(--glass-saturate, 180%))',
      WebkitBackdropFilter: 'blur(var(--glass-blur, 20px)) saturate(var(--glass-saturate, 180%))',
      borderRadius: 12,
      border: '1px solid rgba(255, 255, 255, 0.55)',
      boxShadow: [
        '0 2px 8px -4px rgba(31, 38, 135, 0.06)',
        'inset 0 1px 0 rgba(255, 255, 255, 0.7)',
        'inset 0 0 0 0.5px rgba(255, 255, 255, 0.4)',
      ].join(', '),
      transform: 'translateZ(0)',
      willChange: 'transform',
      contain: 'layout style paint',
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
  type = 'money', locked, readonly, accent, placeholderEmpty, trailing, onRowClick,
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
  /** When set, makes the row itself clickable (cursor + hover lift) and triggers
   *  this handler on click instead of opening the edit input. Used for drill-in
   *  patterns like Cost Adds → click the row to open the manager modal. */
  onRowClick?: () => void
}) {
  const isReadonly = !!(locked || readonly)
  const isEditable = !isReadonly || !!onChange
  const isClickable = isEditable || !!onRowClick
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

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => {
        if (onRowClick) { onRowClick(); return }
        if (isEditable && !editing) startEdit()
      }}
      style={{
        ...chipBoxStyle(editing, hover, isClickable),
        opacity: saving ? 0.55 : 1,
      }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        ...labelStyle,
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
  vehicle, flooring, canSeeMoney, isAdmin, onEditFlooring, onSavePartial,
}: {
  vehicle: Vehicle
  flooring: ReturnType<typeof computeFlooring>
  canSeeMoney: boolean
  isAdmin: boolean
  onEditFlooring: () => void
  onSavePartial: (patch: Record<string, unknown>) => Promise<void>
}) {
  // Read-only rows (everything except Inventory + Purchase Type which are now
  // editable dropdowns below so the card can change inventory state without
  // round-tripping to Purchase Info).
  const readOnlyRows: { label: string; value: string }[] = [
    { label: 'Title', value: vehicle.titleStatus || '—' },
    { label: 'Location', value: vehicle.location || '—' },
  ]
  if (vehicle.purchasedFrom) readOnlyRows.push({ label: 'Source', value: vehicle.purchasedFrom })
  if (vehicle.dateInStock) readOnlyRows.push({ label: 'Date In', value: fmtDate(vehicle.dateInStock) })
  if (vehicle.consignmentCommissionPct !== null) readOnlyRows.push({ label: 'Consign %', value: `${vehicle.consignmentCommissionPct}%` })

  return (
    <GlassCard>
      <GlassEyebrow label="Logistics" subtitle="Title · Location · Floorplan" />

      {/* Mix of read-only chip rows and editable AnchorRowSelect dropdowns —
          read-only typography matches AnchorRowSelect exactly (14/700/#0a0a0a)
          so the whole stack reads as one cohesive surface. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {readOnlyRows.map((r) => (
          <div key={r.label} style={chipBoxStyle(false, false, false)}>
            <span style={labelStyle}>{r.label}</span>
            <span style={{
              fontSize: 14, fontWeight: 700, color: '#0a0a0a',
              letterSpacing: '-0.005em',
              textAlign: 'right',
              minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{r.value}</span>
          </div>
        ))}
        <AnchorRowSelect
          label="Inventory"
          value={vehicle.inventoryStatus ?? ''}
          onChange={(v) => onSavePartial({ inventoryStatus: v || null })}
          options={[
            { value: 'in_stock',         label: 'In Stock' },
            { value: 'in_recon',         label: 'In Recon' },
            { value: 'external_repair',  label: 'External Repair' },
            { value: 'sold',             label: 'Sold' },
            { value: 'removed',          label: 'Removed' },
          ]}
          placeholder="—"
        />
        <AnchorRowSelect
          label="Purchase Type"
          value={vehicle.purchaseType ?? ''}
          onChange={(v) => onSavePartial({ purchaseType: v || null })}
          options={[
            { value: 'PURCHASED',   label: 'Purchased' },
            { value: 'TRADE_IN',    label: 'Trade-In' },
            { value: 'CONSIGNMENT', label: 'Consignment' },
            { value: 'FLOORING',    label: 'Flooring' },
          ]}
          placeholder="—"
        />
      </div>

      {canSeeMoney && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(0,0,0,0.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(0,0,0,0.5)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Floorplan</span>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <FloorplanActivatedPill active={!!flooring} />
              {isAdmin && (
                <button onClick={onEditFlooring} style={{ background: 'none', border: 'none', color: '#0071e3', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0, minHeight: 'auto' }}>
                  {flooring ? 'Edit' : '+ Set'}
                </button>
              )}
            </div>
          </div>
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
        background: 'rgba(255, 255, 255, 0.66)',
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

// Read-only reference card for the vehicle's most recent mechanic-stage
// inspection (e.g. "New Vehicle Inspection").  Lives on the General Info
// sub-tab so the technician's findings are visible without having to dig
// through the Recon timeline.
function VehicleInspectionCard({
  stages, onOpenInRecon,
}: {
  stages: ReconStage[]
  onOpenInRecon: (stageId: string) => void
}) {
  const inspection = (() => {
    const mechanics = (stages || []).filter(s => s.stage === 'mechanic')
    if (mechanics.length === 0) return null
    return mechanics.slice().sort((a, b) => {
      const at = a.startedAt ? new Date(a.startedAt).getTime() : 0
      const bt = b.startedAt ? new Date(b.startedAt).getTime() : 0
      return bt - at
    })[0]
  })()

  if (!inspection) return null

  const checklist = inspection.checklist || []
  const doneCount = checklist.filter(c => c.done).length
  const totalCount = checklist.length
  const isActive = inspection.status !== 'done' && inspection.status !== 'skipped' && !inspection.completedAt

  return (
    <GlassCard>
      <GlassEyebrow
        label="Vehicle Inspection"
        subtitle={inspection.scopeName || 'Mechanical work'}
        action={
          <button
            onClick={() => onOpenInRecon(inspection.id)}
            style={{
              background: 'none', border: 'none', color: '#0071e3',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
              padding: 0, minHeight: 'auto',
            }}
          >
            Open in Recon ↗
          </button>
        }
      />

      <div style={{ display: 'flex', gap: 14, alignItems: 'center', fontSize: 12, color: 'rgba(0,0,0,0.55)', flexWrap: 'wrap', marginBottom: 14, fontWeight: 500 }}>
        <V2StageStatus value={inspection.status} active={isActive} />
        {inspection.assignee && <span>{inspection.assignee.name}</span>}
        <span>{fmtDate(inspection.startedAt)}{inspection.completedAt ? ` → ${fmtDate(inspection.completedAt)}` : ''}</span>
        {totalCount > 0 && <span>{doneCount}/{totalCount} tasks</span>}
      </div>

      {checklist.length > 0 ? (
        <div>
          {checklist.map((item, i) => (
            <div key={i} style={{
              display: 'flex', gap: 10, alignItems: 'flex-start',
              padding: '8px 10px',
              background: item.done ? '#f0fdf4' : 'transparent',
              border: item.done ? '1px solid #bbf7d0' : '1px solid rgba(0,0,0,0.06)',
              borderRadius: 8, marginBottom: 4,
            }}>
              <span style={{
                display: 'inline-flex', width: 18, height: 18, borderRadius: 4,
                background: item.done ? '#22c55e' : 'transparent',
                border: `2px solid ${item.done ? '#22c55e' : 'rgba(0,0,0,0.2)'}`,
                alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
              }}>
                {item.done && <span style={{ color: '#fff', fontSize: 12, fontWeight: 700, lineHeight: 1 }}>✓</span>}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 13, color: item.done ? 'rgba(0,0,0,0.55)' : '#1d1d1f', textDecoration: item.done ? 'line-through' : 'none' }}>
                  {item.item}
                </span>
                {item.note && (
                  <p style={{ fontSize: 12, color: 'rgba(0,0,0,0.55)', marginTop: 2, fontStyle: 'italic' }}>↳ {item.note}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.5)', fontStyle: 'italic', margin: 0 }}>No checklist on this stage yet.</p>
      )}

      {inspection.notes && (
        <div style={{
          marginTop: 12, padding: '10px 12px',
          background: 'rgba(0,0,0,0.025)', borderRadius: 10,
          fontSize: 12, color: 'rgba(0,0,0,0.65)', fontStyle: 'italic', lineHeight: 1.5,
        }}>
          ↳ {inspection.notes}
        </div>
      )}
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
  { id: 'engine',        label: 'Engine',        types: ['engine'],                              accept: 'image/*', defaultType: 'engine',           variant: 'photo' },
  { id: 'undercarriage', label: 'Undercarriage', types: ['undercarriage'],                       accept: 'image/*', defaultType: 'undercarriage',    variant: 'photo' },
  { id: 'videos',        label: 'Videos',        types: ['walkaround_video', 'turntable_video'], accept: 'video/*', defaultType: 'walkaround_video', variant: 'video' },
]

// Sections a photo can be placed into (used by the Unsorted strip + Manage mode).
const PHOTO_SECTION_OPTS = [
  { value: 'exterior', label: 'Exterior' },
  { value: 'interior', label: 'Interior' },
  { value: 'engine', label: 'Engine' },
  { value: 'undercarriage', label: 'Undercarriage' },
]
const PHOTO_TYPES = ['exterior', 'interior', 'engine', 'undercarriage', 'unsorted']

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
  const [manage, setManage] = useState(false)
  const [aiStatus, setAiStatus] = useState<string | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [galleryStart, setGalleryStart] = useState<string | null>(null)
  const [galleryOpen, setGalleryOpen] = useState(false)

  const viewable = media.filter(m => m.type !== 'doc')
  const unsortedItems = media.filter(m => m.type === 'unsorted')
  const photoItems = media.filter(m => PHOTO_TYPES.includes(m.type))

  // Core upload: presign -> PUT to R2 -> confirm. No global UI state / refetch,
  // so it can be run many-at-once. onProgress optional (single-tile path uses it).
  async function uploadOne(file: File, type: string, onProgress?: (pct: number) => void) {
    const presignRes = await fetch('/api/media/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vehicleId, filename: file.name, contentType: file.type }),
    })
    if (!presignRes.ok) throw new Error(`Presign failed (${presignRes.status})`)
    const { uploadUrl, r2Key } = await presignRes.json()

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      if (onProgress) xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
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
  }

  // Single-tile upload path (per category "+ Add").
  async function uploadFile(file: File, type: string) {
    setErr(null)
    setUploadingType(type)
    setProgress(0)
    try {
      await uploadOne(file, type, setProgress)
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

  // Bulk drop: upload everything as 'unsorted', then let AI file it.
  // Takes a real File[] (not a live FileList) — the caller must copy before
  // resetting the input, or the list empties out from under us.
  async function bulkUploadAndSort(files: File[]) {
    if (!files || files.length === 0) return
    setErr(null)
    setAiBusy(true)
    const total = files.length
    let done = 0
    let firstErr: string | null = null
    setAiStatus(`Uploading 0/${total}…`)

    // Upload several photos at once instead of one-by-one, and refresh only
    // once at the end (not after every file) — the big speedup.
    const CONCURRENCY = 5
    let idx = 0
    async function worker() {
      while (idx < files.length) {
        const my = idx++
        try {
          await uploadOne(files[my], 'unsorted')
        } catch (e) {
          if (!firstErr) firstErr = e instanceof Error ? e.message : String(e)
        }
        done++
        setAiStatus(`Uploading ${done}/${total}…`)
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker))
    await onChange()

    if (firstErr) setErr(`Some photos didn't upload: ${firstErr}`)
    await runAiSort()
  }

  async function runAiSort() {
    setErr(null)
    setAiBusy(true)
    setAiStatus('Sorting with AI…')
    try {
      const res = await fetch('/api/media/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicleId, scope: 'unsorted' }),
      })
      if (!res.ok) throw new Error(`AI sort failed (${res.status})`)
      const data = await res.json()
      await onChange()
      setAiStatus(
        (data.unsure ?? 0) > 0
          ? `Sorted ${data.classified} · ${data.unsure} left for you to place`
          : `Sorted ${data.classified} photo${data.classified === 1 ? '' : 's'} ✓`,
      )
      setTimeout(() => setAiStatus(null), 5000)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setAiStatus(null)
    } finally {
      setAiBusy(false)
    }
  }

  async function setSection(id: string, type: string) {
    await fetch(`/api/media/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type }),
    })
    await onChange()
  }

  const pillStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '8px 14px', borderRadius: 999,
    background: 'rgba(255, 255, 255, 0.66)',
    border: '1px solid rgba(255, 255, 255, 0.6)',
    color: '#1d1d1f', fontSize: 12, fontWeight: 600, letterSpacing: '-0.005em',
    cursor: 'pointer', minHeight: 'auto',
    boxShadow: '0 4px 12px -2px rgba(0, 0, 0, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.9)',
  }

  return (
    <GlassCard padding={24}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <GlassEyebrow
          label="Visual Asset Studio"
          subtitle={media.length === 0
            ? 'Upload all your shots at once — AI sorts them into sections'
            : `${media.length} asset${media.length === 1 ? '' : 's'}${unsortedItems.length ? ` · ${unsortedItems.length} to sort` : ''}`}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {aiStatus && (
            <span style={{ fontSize: 12, fontWeight: 600, color: '#1d1d1f', opacity: 0.72 }}>{aiStatus}</span>
          )}
          <label style={{ ...pillStyle, cursor: aiBusy ? 'wait' : 'pointer', opacity: aiBusy ? 0.6 : 1 }}>
            ✨ Upload &amp; AI-Sort
            <input
              type="file" accept="image/*" multiple hidden disabled={aiBusy}
              onChange={(e) => { const f = e.target.files ? Array.from(e.target.files) : []; e.currentTarget.value = ''; bulkUploadAndSort(f) }}
            />
          </label>
          {viewable.length > 0 && (
            <button type="button" onClick={() => { setGalleryStart('all'); setGalleryOpen(true) }} style={pillStyle}>
              View all
            </button>
          )}
          {photoItems.length > 0 && (
            <button type="button" onClick={() => setManage(m => !m)} style={pillStyle}>
              {manage ? 'Done' : 'Manage'}
            </button>
          )}
        </div>
      </div>

      {err && (
        <p style={{
          color: '#d70015', fontSize: 13, margin: '14px 0 0',
          padding: '8px 12px', background: 'rgba(255, 59, 48, 0.08)', borderRadius: 10,
          border: '1px solid rgba(255, 59, 48, 0.18)',
        }}>{err}</p>
      )}

      {unsortedItems.length > 0 && (
        <div style={{
          marginTop: 16, padding: 14, borderRadius: 14,
          background: 'rgba(255, 214, 10, 0.10)',
          border: '1px solid rgba(255, 214, 10, 0.35)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#1d1d1f' }}>
              {unsortedItems.length} photo{unsortedItems.length === 1 ? '' : 's'} to sort
            </p>
            <button type="button" onClick={runAiSort} disabled={aiBusy}
              style={{ ...pillStyle, opacity: aiBusy ? 0.6 : 1, cursor: aiBusy ? 'wait' : 'pointer' }}>
              ✨ Sort with AI
            </button>
          </div>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
            {unsortedItems.map((item) => (
              <div key={item.id} style={{ width: 130, flex: '0 0 auto' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.url} alt={item.filename || 'unsorted'}
                  style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 10, display: 'block', background: '#1d1d1f' }} />
                <select
                  defaultValue=""
                  onChange={(e) => { if (e.target.value) setSection(item.id, e.target.value) }}
                  style={{ marginTop: 6, width: '100%', fontSize: 12, padding: '5px 8px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.15)', background: '#fff', color: '#1d1d1f' }}
                >
                  <option value="">Place in…</option>
                  {PHOTO_SECTION_OPTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {manage ? (
        <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
          {photoItems.map((item) => (
            <div key={item.id} style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.08)', background: '#fff' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.url} alt={item.filename || 'photo'}
                style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', display: 'block', background: '#1d1d1f' }} />
              <div style={{ padding: 8, display: 'flex', gap: 6, alignItems: 'center' }}>
                <select
                  value={PHOTO_SECTION_OPTS.some(s => s.value === item.type) ? item.type : ''}
                  onChange={(e) => { if (e.target.value) setSection(item.id, e.target.value) }}
                  style={{ flex: 1, fontSize: 12, padding: '5px 6px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.15)', background: '#fff', color: '#1d1d1f' }}
                >
                  {!PHOTO_SECTION_OPTS.some(s => s.value === item.type) && <option value="">Unsorted</option>}
                  {PHOTO_SECTION_OPTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                {(isAdmin || item.uploadedBy?.id === currentUserId) && (
                  <button type="button" onClick={() => deleteAsset(item.id)} title="Delete"
                    style={{ border: 'none', background: 'rgba(255,59,48,0.1)', color: '#d70015', width: 28, height: 28, borderRadius: 8, cursor: 'pointer', fontSize: 14, minHeight: 'auto' }}>×</button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{
          marginTop: 16,
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
                  const cat = STUDIO_CATEGORIES.find(c => c.types.includes(asset.type))
                  setGalleryStart(cat ? cat.id : 'all')
                  setGalleryOpen(true)
                }}
                currentUserId={currentUserId}
                isAdmin={isAdmin}
              />
            )
          })}
        </div>
      )}

      {lightboxIdx !== null && viewable[lightboxIdx] && (
        <MediaLightbox
          items={viewable}
          startIdx={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
          onChangeIdx={setLightboxIdx}
        />
      )}

      {galleryOpen && (
        <MediaGalleryModal
          media={viewable}
          vehicleId={vehicleId}
          initialSection={galleryStart}
          onClose={() => setGalleryOpen(false)}
          onChange={onChange}
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
          background: 'rgba(255, 255, 255, 0.66)',
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
      background: 'rgba(255, 255, 255, 0.66)',
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
      background: 'rgba(255, 255, 255, 0.66)',
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
//   LEFT (60%): Purchase Info (acquisition + buyer/source)
//   RIGHT (40%): Lienholder + How Did You Pay
// All three parent containers use GlassCard so they share the same translucent
// frosted surface; sub-content uses SubPanel + custom mini-helpers below.

const ACQUIRED_MILEAGE_STATUS_OPTIONS = [
  { value: 'actual',   label: 'Actual' },
  { value: 'not_actual', label: 'Not Actual' },
  { value: 'exceeds',  label: 'Exceeds Mechanical Limits' },
]

// Fixed payment-method list (not user-editable). Values are canonical
// snake_case-ish for storage; labels are what the user sees.
const PAYMENT_METHOD_OPTIONS = [
  { value: 'cash',               label: 'Cash' },
  { value: 'check',              label: 'Check' },
  { value: 'visa',               label: 'Visa' },
  { value: 'master_card',        label: 'Master Card' },
  { value: 'discover',           label: 'Discover' },
  { value: 'american_express',   label: 'American Express' },
  { value: 'other_credit_card',  label: 'Other Credit Card' },
  { value: 'debit_card',         label: 'Debit Card' },
  { value: 'money_order',        label: 'Money Order' },
  { value: 'voucher',            label: 'Voucher' },
  { value: 'paypal',             label: 'PayPal' },
  { value: 'venmo',              label: 'Venmo' },
  { value: 'zelle',              label: 'Zelle' },
  { value: 'cashiers_check',     label: "Cashier's Check" },
  { value: 'wire_transfer',      label: 'Wire Transfer' },
  { value: 'ach',                label: 'ACH' },
  { value: 'cash_app',           label: 'Cash App' },
  { value: 'apple_pay',          label: 'Apple Pay' },
  { value: 'google_pay',         label: 'Google Pay' },
  { value: 'trade_in_payoff',    label: 'Trade-In Payoff' },
  { value: 'other',              label: 'Other' },
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
  // Source section — pick whether the vehicle came from a business (Vendor →
  // Partner table) or an individual (Customer → Contact table, not yet wired).
  // Default to vendor since the picker on that side is already functional.
  const [sourceType, setSourceType] = useState<'vendor' | 'customer'>('vendor')
  const [addSourcePartnerName, setAddSourcePartnerName] = useState<string | null>(null)
  // Customer-side picker state — when populated, AddCustomerModal opens with
  // first / last pre-filled from whatever was typed into the CustomerPicker.
  const [addSourceCustomerName, setAddSourceCustomerName] = useState<{ first: string; last: string } | null>(null)

  // Card 2 — How Did You Pay
  // One payment type per vehicle — either Consignment or Flooring.  Each
  // carries its own field set; a single shared Memo captures cross-cutting
  // notes (splits, reference IDs, paydown history).
  type PaymentTypeKind = 'consignment' | 'flooring'
  type PaymentTypeEntry = {
    id: string
    kind: PaymentTypeKind
    // Consignment fields
    amount: number
    paidDate: string
    // Flooring fields — kept on the same row so a single payment record
    // covers both shapes.  Unused fields stay at their defaults.
    flooringCompany: string
    amountFloored: number
    dateFloored: string
    interestRate: number   // annual %, e.g. 10 means 10.0%
    dayBasis: '365' | '360' | 'actual'
  }
  const [paymentTypes, setPaymentTypes] = useState<PaymentTypeEntry[]>([])
  const [paymentPickerOpen, setPaymentPickerOpen] = useState(false)
  const paymentPickerRef = useRef<HTMLDivElement | null>(null)
  const [howPaidMemo, setHowPaidMemo] = useState('')

  useEffect(() => {
    if (!paymentPickerOpen) return
    function onClick(e: MouseEvent) {
      if (!paymentPickerRef.current?.contains(e.target as Node)) setPaymentPickerOpen(false)
    }
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') setPaymentPickerOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [paymentPickerOpen])

  const paymentTypeMax = 1
  const paymentMaxReached = paymentTypes.length >= paymentTypeMax
  const hasPaymentType = (k: PaymentTypeKind) => paymentTypes.some(p => p.kind === k)

  function addPaymentType(kind: PaymentTypeKind) {
    if (paymentMaxReached || hasPaymentType(kind)) return
    setPaymentTypes(prev => [...prev, {
      id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      kind,
      amount: 0,
      paidDate: '',
      flooringCompany: '',
      amountFloored: 0,
      dateFloored: '',
      interestRate: 0,
      dayBasis: '365',
    }])
    setPaymentPickerOpen(false)
  }
  function updatePaymentType(id: string, patch: Partial<PaymentTypeEntry>) {
    setPaymentTypes(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p))
  }
  function removePaymentType(id: string) {
    setPaymentTypes(prev => prev.filter(p => p.id !== id))
  }

  // Card 3 — Lienholder
  const [lienholderSearch, setLienholderSearch] = useState('')
  const [lienAccountNo, setLienAccountNo] = useState('')
  const [lienPayoffAmount, setLienPayoffAmount] = useState(0)
  const [lienDueDate, setLienDueDate] = useState('')
  const [lienPaymentMethod, setLienPaymentMethod] = useState('')
  const [lienPerDiem, setLienPerDiem] = useState(0)
  const [lienDatePaidOff, setLienDatePaidOff] = useState('')
  const [lienMemo, setLienMemo] = useState('')

  // Days in Inventory — computed from dateInStock so the admin doesn't
  // have to maintain it.  Defaults to '—' when no purchase date is set.
  const daysInInv = vehicle.dateInStock
    ? Math.max(0, Math.floor((Date.now() - new Date(vehicle.dateInStock).getTime()) / 86400000))
    : null

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 18,
      minWidth: 0,
    }}>
      {/* ─── TOP ROW: Purchase Info (full width) ───────────────────── */}
      <div style={{ minWidth: 0 }}>
        {/* CARD 1 — Purchase Info */}
        <GlassCard padding={22}>
          <GlassEyebrow label="Purchase Info" />

          {/* Two-column layout inside the full-width card — Acquisition on
              the left, Buyer & Source on the right.  Each side holds its
              own chip stack so individual rows stay readable instead of
              spanning the entire card width. */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 24,
            minWidth: 0,
          }}>
            {/* LEFT — acquisition financials.  All AnchorRow* variants for
                visual consistency with the rest of the studio. */}
            <div>
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

            {/* RIGHT — Source: who the dealership got the vehicle from.
                Sub-type toggle picks Vendor (business → Partner table) vs
                Customer (individual → Contact table, future). Vendor picker
                is already wired through the Partner system shipped with the
                Cost Adds Vendor cell; "Add new" layers AddPartnerModal here
                too, so the same flow works in both surfaces. */}
            <div>
              {/* Acquisition channel — distinct from purchaseType (the legal/
                  financial structure). Source captures HOW/WHERE the dealership
                  got the vehicle so reports can slice by channel. */}
              <div style={{ marginBottom: 10 }}>
                <AnchorRowSelect
                  label="Source"
                  value={vehicle.purchaseSource ?? ''}
                  onChange={(v) => onSavePartial({ purchaseSource: v || null })}
                  options={[
                    { value: 'auction',       label: 'Auction' },
                    { value: 'consignment',   label: 'Consignment' },
                    { value: 'private_party', label: 'Private Party' },
                    { value: 'referral',      label: 'Referral' },
                    { value: 'repeat',        label: 'Repeat' },
                    { value: 'repo',          label: 'Repo' },
                    { value: 'trade_in',      label: 'Trade-In' },
                    { value: 'wholesale',     label: 'Wholesale' },
                    { value: 'other',         label: 'Other' },
                  ]}
                  placeholder="—"
                />
              </div>

              {/* Source lock — once a Partner or Contact is attached, the
                  Vendor/Customer toggle is locked. Switching freely would
                  silently clear the attached link, which is destructive. The
                  effective sourceType is derived from what's actually saved
                  (falls back to the local toggle when nothing is attached). */}
              {(() => {
                const hasVendor = !!vehicle.purchasedFromVendorId
                const hasContact = !!vehicle.purchasedFromContactId
                const attached = hasVendor || hasContact
                const effectiveType: 'vendor' | 'customer' =
                  hasVendor ? 'vendor' : hasContact ? 'customer' : sourceType

                async function clearSource() {
                  const label = effectiveType === 'vendor' ? 'vendor' : 'customer'
                  const ok = confirm(
                    `This will clear the attached ${label} (${vehicle.purchasedFrom ?? 'current source'}). ` +
                    `You can pick a different ${label} or switch types after. Continue?`
                  )
                  if (!ok) return
                  await onSavePartial({
                    purchasedFrom: null,
                    purchasedFromVendorId: null,
                    purchasedFromContactId: null,
                  })
                }

                return (
                  <>
                    {/* Toggle */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      marginBottom: 12, flexWrap: 'wrap',
                    }}>
                      <div style={{
                        display: 'inline-flex', padding: 3, gap: 2,
                        background: 'rgba(0,0,0,0.05)', borderRadius: 999,
                        opacity: attached ? 0.7 : 1,
                      }}>
                        {(['vendor', 'customer'] as const).map((t) => {
                          const active = effectiveType === t
                          const locked = attached && !active
                          return (
                            <button
                              key={t}
                              type="button"
                              disabled={locked}
                              onClick={() => !attached && setSourceType(t)}
                              title={locked ? 'Clear the current source to switch types' : undefined}
                              style={{
                                padding: '5px 14px', borderRadius: 999, border: 'none',
                                background: active ? '#fff' : 'transparent',
                                boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.9)' : 'none',
                                color: active ? '#1d1d1f' : 'rgba(0,0,0,0.5)',
                                fontSize: 12, fontWeight: 600, letterSpacing: '-0.005em',
                                cursor: locked ? 'not-allowed' : attached ? 'default' : 'pointer',
                                minHeight: 'auto',
                                textTransform: 'capitalize',
                                transition: 'background 180ms ease, color 180ms ease',
                              }}
                            >
                              {t}{active && attached ? ' 🔒' : ''}
                            </button>
                          )
                        })}
                      </div>
                      {attached && (
                        <button
                          type="button"
                          onClick={() => { void clearSource() }}
                          style={{
                            background: 'none', border: 'none', padding: 0,
                            color: '#0071e3', fontSize: 11, fontWeight: 600,
                            cursor: 'pointer', minHeight: 'auto',
                          }}
                        >Change source</button>
                      )}
                    </div>

                    {/* Picker — locked to whichever type is attached, else
                        follows the local toggle. When attached, the picker is
                        replaced by a static display so accidental retypes can't
                        overwrite the saved link. */}
                    {attached ? (
                      <AttachedSourceCard
                        kind={effectiveType}
                        partnerId={hasVendor ? vehicle.purchasedFromVendorId : null}
                        contactId={hasContact ? vehicle.purchasedFromContactId : null}
                        fallbackName={vehicle.purchasedFrom ?? '—'}
                      />
                    ) : effectiveType === 'vendor' ? (
                      <VendorPicker
                        isAdmin={isAdmin}
                        onPickPartner={(p) => {
                          void onSavePartial({
                            purchasedFrom: p.companyName,
                            purchasedFromVendorId: p.id,
                            purchasedFromContactId: null,
                          })
                        }}
                        onRequestAddNew={(typedName) => setAddSourcePartnerName(typedName)}
                      />
                    ) : (
                      <CustomerPicker
                        onPickContact={(c) => {
                          const displayName = `${c.firstName} ${c.lastName}`.trim()
                          void onSavePartial({
                            purchasedFrom: displayName,
                            purchasedFromContactId: c.id,
                            purchasedFromVendorId: null,
                          })
                        }}
                        onRequestAddNew={(typedName) => {
                          const parts = typedName.trim().split(/\s+/)
                          const first = parts[0] ?? ''
                          const last = parts.slice(1).join(' ')
                          setAddSourceCustomerName({ first, last })
                        }}
                      />
                    )}
                  </>
                )
              })()}

              {/* AddPartnerModal layered for the Source vendor picker */}
              {isAdmin && addSourcePartnerName !== null && (
                <AddPartnerModal
                  initialCompanyName={addSourcePartnerName}
                  initialCategories={['vendor']}
                  onClose={() => setAddSourcePartnerName(null)}
                  onSaved={(partner) => {
                    void onSavePartial({ purchasedFrom: partner.companyName, purchasedFromVendorId: partner.id })
                    setAddSourcePartnerName(null)
                  }}
                />
              )}

              {/* AddCustomerModal layered for the Source customer picker */}
              {addSourceCustomerName !== null && (
                <AddCustomerModal
                  initialFirstName={addSourceCustomerName.first}
                  initialLastName={addSourceCustomerName.last}
                  onClose={() => setAddSourceCustomerName(null)}
                  onSaved={(contact) => {
                    const displayName = `${contact.firstName} ${contact.lastName}`.trim()
                    void onSavePartial({
                      purchasedFrom: displayName,
                      purchasedFromContactId: contact.id,
                      purchasedFromVendorId: null,
                    })
                    setAddSourceCustomerName(null)
                  }}
                />
              )}
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

      </div>

      {/* ─── BOTTOM ROW: Lienholder + How Did You Pay (50/50) ────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 18,
        alignItems: 'start',
        minWidth: 0,
      }}>
        {/* CARD 2 — Lienholder */}
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
                background: 'rgba(255, 255, 255, 0.66)',
                fontSize: 13, fontWeight: 500, color: '#0a0a0a',
                outline: 'none', boxSizing: 'border-box',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7), inset 0 0 0 1px rgba(255,255,255,0.4)',
              }}
            />
          </div>

          {/* AnchorRow chip stack — full-width translucent chips,
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

        {/* CARD 3 — How Did You Pay */}
        <GlassCard padding={22}>
          <GlassEyebrow
            label="How Did You Pay"
            action={
              <div ref={paymentPickerRef} style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => { if (!paymentMaxReached) setPaymentPickerOpen(o => !o) }}
                  disabled={paymentMaxReached}
                  style={{
                    padding: '6px 12px', borderRadius: 999,
                    border: '1px solid rgba(0, 113, 227, 0.2)',
                    background: 'rgba(255, 255, 255, 0.66)',
                    color: '#0071e3', fontSize: 11, fontWeight: 700,
                    letterSpacing: '-0.005em',
                    cursor: paymentMaxReached ? 'not-allowed' : 'pointer',
                    opacity: paymentMaxReached ? 0.5 : 1,
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    minHeight: 'auto',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)',
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                  Add Payment Type
                </button>
                {paymentPickerOpen && (
                  <div style={{
                    position: 'absolute', top: '100%', right: 0, marginTop: 6,
                    minWidth: 180,
                    borderRadius: 12,
                    background: 'rgba(255, 255, 255, 0.82)',
                    border: '1px solid rgba(255, 255, 255, 0.55)',
                    boxShadow: '0 20px 50px -12px rgba(31, 38, 135, 0.28), 0 4px 12px -4px rgba(0, 0, 0, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.85)',
                    overflow: 'hidden',
                    padding: 4,
                    zIndex: 100,
                  }}>
                    {(['consignment', 'flooring'] as const).map(kind => {
                      const taken = hasPaymentType(kind)
                      return (
                        <button
                          key={kind}
                          type="button"
                          disabled={taken}
                          onClick={() => addPaymentType(kind)}
                          style={{
                            width: '100%', textAlign: 'left',
                            padding: '8px 12px', borderRadius: 8,
                            background: 'transparent', border: 'none',
                            fontSize: 13, fontWeight: 600,
                            color: taken ? 'rgba(0,0,0,0.3)' : '#0a0a0a',
                            cursor: taken ? 'not-allowed' : 'pointer',
                            minHeight: 'auto',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            transition: 'background 120ms ease',
                            textTransform: 'capitalize',
                          }}
                          onMouseEnter={e => { if (!taken) e.currentTarget.style.background = 'rgba(0,0,0,0.045)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                        >
                          {kind}
                          {taken && <span style={{ fontSize: 10, color: 'rgba(0,0,0,0.4)', fontWeight: 700, letterSpacing: '0.04em' }}>ADDED</span>}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            }
          />

          {/* Selected payment types — stacked sub-cards */}
          {paymentTypes.length === 0 ? (
            <div style={{
              padding: '20px 16px',
              borderRadius: 12,
              background: 'rgba(255, 255, 255, 0.32)',
              border: '1px dashed rgba(0, 0, 0, 0.12)',
              fontSize: 12, fontWeight: 600,
              color: 'rgba(0, 0, 0, 0.45)',
              textAlign: 'center',
              letterSpacing: '-0.005em',
            }}>
              No payment type added yet
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {paymentTypes.map(p => (
                <PaymentTypeCard
                  key={p.id}
                  entry={p}
                  onChange={(patch) => updatePaymentType(p.id, patch)}
                  onRemove={() => removePaymentType(p.id)}
                />
              ))}
            </div>
          )}

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
    </div>
  )
}

// ─── Purchase Info mini-helpers ────────────────────────────────────────

// Per-payment-type sub-card.  Renders the kind name + remove button up top,
// then a kind-specific field set underneath as AnchorRow* chips so the
// styling matches the rest of the studio.
//
// Consignment → Amount + Paid Date
// Flooring    → Company, Amount Floored, Date Floored, Interest, Day Basis
//               plus a live "Accrued So Far" tile computed from the inputs.
type PaymentEntry = {
  id: string
  kind: 'consignment' | 'flooring'
  amount: number
  paidDate: string
  flooringCompany: string
  amountFloored: number
  dateFloored: string
  interestRate: number
  dayBasis: '365' | '360' | 'actual'
}
function PaymentTypeCard({
  entry, onChange, onRemove,
}: {
  entry: PaymentEntry
  onChange: (patch: Partial<PaymentEntry>) => void
  onRemove: () => void
}) {
  const { kind } = entry

  return (
    <div style={{
      padding: 14,
      borderRadius: 14,
      background: 'rgba(255, 255, 255, 0.66)',
      border: '1px solid rgba(255, 255, 255, 0.55)',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.85), 0 1px 2px rgba(31, 38, 135, 0.04)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 10,
      }}>
        <p style={{
          fontSize: 13, fontWeight: 700, color: '#0a0a0a',
          letterSpacing: '-0.005em', margin: 0,
          textTransform: 'capitalize',
        }}>{kind}</p>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${kind} payment`}
          style={{
            width: 22, height: 22, borderRadius: 999,
            border: 'none',
            background: 'rgba(0, 0, 0, 0.04)',
            color: 'rgba(0, 0, 0, 0.55)',
            cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            minHeight: 'auto', padding: 0,
            transition: 'background 160ms ease, color 160ms ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 59, 48, 0.12)'; e.currentTarget.style.color = '#b42318' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0, 0, 0, 0.04)'; e.currentTarget.style.color = 'rgba(0, 0, 0, 0.55)' }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {kind === 'consignment' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <AnchorRowMoney
            label="Amount"
            value={entry.amount}
            onChange={(v) => onChange({ amount: v })}
            placeholderEmpty={!entry.amount}
          />
          <AnchorRowDate
            label="Paid Date"
            value={entry.paidDate}
            onChange={(v) => onChange({ paidDate: v })}
          />
        </div>
      )}

      {kind === 'flooring' && (
        <FlooringPanel entry={entry} onChange={onChange} />
      )}
    </div>
  )
}

// Pulled out so all the flooring-specific state + math lives in one place,
// keeping PaymentTypeCard skinny.
function FlooringPanel({
  entry, onChange,
}: {
  entry: PaymentEntry
  onChange: (patch: Partial<PaymentEntry>) => void
}) {
  const accrual = computeFlooringAccrual(entry)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <FlooringCompanyRow
        value={entry.flooringCompany}
        onChange={(v) => onChange({ flooringCompany: v })}
      />
      <AnchorRowMoney
        label="Amount Floored"
        value={entry.amountFloored}
        onChange={(v) => onChange({ amountFloored: v })}
        placeholderEmpty={!entry.amountFloored}
      />
      <AnchorRowDate
        label="Date Floored"
        value={entry.dateFloored}
        onChange={(v) => onChange({ dateFloored: v })}
      />
      <AnchorRowPercent
        label="Interest"
        value={entry.interestRate}
        onChange={(v) => onChange({ interestRate: v })}
      />
      <AnchorRowSelect
        label="Day Basis"
        value={entry.dayBasis}
        onChange={(v) => onChange({ dayBasis: v as PaymentEntry['dayBasis'] })}
        options={[
          { value: '365', label: '365' },
          { value: '360', label: '360' },
          { value: 'actual', label: 'Actual' },
        ]}
      />

      {/* Live accrual readout — only meaningful once amount + date are filled */}
      <AccruedTile accrual={accrual} active={entry.amountFloored > 0 && !!entry.dateFloored} />
    </div>
  )
}

// Compact text-search chip for the Flooring Company picker.  Real contact
// search is wired in Pass 2; for now it's a text input with a search icon
// so the layout matches the upload reference.
function FlooringCompanyRow({
  value, onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const [hover, setHover] = useState(false)
  const [focused, setFocused] = useState(false)
  return (
    <label
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...chipBoxStyle(focused, hover, true),
        cursor: 'text',
      }}
    >
      <span style={labelStyle}>Flooring Company</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0, justifyContent: 'flex-end' }}>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Search company…"
          style={{
            flex: 1, minWidth: 0, textAlign: 'right',
            background: 'transparent', border: 'none', outline: 'none',
            fontSize: 14, fontWeight: 700, color: '#0a0a0a',
            letterSpacing: '-0.005em', fontFamily: 'inherit',
          }}
        />
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </span>
    </label>
  )
}

// Percent variant of AnchorRow* — click chip to edit, shows "X%" when idle.
function AnchorRowPercent({ label, value, onChange }: {
  label: string; value: number; onChange: (v: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [hover, setHover] = useState(false)
  function startEdit() {
    setDraft(value && value > 0 ? String(value) : '')
    setEditing(true)
  }
  function commit() {
    setEditing(false)
    const n = draft === '' ? 0 : parseFloat(draft)
    if (!Number.isFinite(n)) return
    onChange(n)
  }
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...chipBoxStyle(editing, hover, true),
        cursor: 'text',
      }}
      onClick={() => { if (!editing) startEdit() }}
    >
      <span style={labelStyle}>{label}</span>
      {editing ? (
        <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 2 }}>
          <input
            type="text"
            inputMode="decimal"
            value={draft}
            autoFocus
            size={Math.max(2, draft.length || 1)}
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
          <span style={{ fontSize: 14, fontWeight: 700, color: '#0a0a0a' }}>%</span>
        </span>
      ) : (
        <span style={{
          fontSize: 14, fontWeight: 700,
          color: value > 0 ? '#0a0a0a' : 'rgba(0,0,0,0.3)',
          letterSpacing: '-0.005em',
          fontVariantNumeric: 'tabular-nums',
        }}>{value > 0 ? `${value}%` : '—'}</span>
      )}
    </div>
  )
}

// Live-computed flooring accrual.  Pure function so it can be reused in
// other surfaces (Cost Info tile, top-of-page summary) without re-rendering
// the whole FlooringPanel.
type FlooringAccrual = {
  daysElapsed: number
  dailyInterest: number
  accruedTotal: number
}
function computeFlooringAccrual(entry: Pick<PaymentEntry, 'amountFloored' | 'dateFloored' | 'interestRate' | 'dayBasis'>): FlooringAccrual {
  const empty: FlooringAccrual = { daysElapsed: 0, dailyInterest: 0, accruedTotal: 0 }
  if (!entry.amountFloored || !entry.dateFloored || !entry.interestRate) return empty
  const advance = new Date(entry.dateFloored + 'T00:00:00')
  if (Number.isNaN(advance.getTime())) return empty
  const daysElapsed = Math.max(0, Math.floor((Date.now() - advance.getTime()) / 86400000))
  // 'actual' treats the year as 365 — the practical effect of the 'actual/365'
  // basis convention.  Switching to 366 in leap years would be more correct
  // but the per-day delta is negligible for floor-plan tracking.
  const basisDays = entry.dayBasis === '360' ? 360 : 365
  const dailyInterest = (entry.amountFloored * (entry.interestRate / 100)) / basisDays
  return {
    daysElapsed,
    dailyInterest,
    accruedTotal: dailyInterest * daysElapsed,
  }
}

// "Accrued So Far" readout — shows total + per-day burn rate.  Idle state
// (no inputs yet) renders a soft empty placeholder so the card doesn't jump
// when the admin starts typing.
function AccruedTile({ accrual, active }: { accrual: FlooringAccrual; active: boolean }) {
  return (
    <div style={{
      marginTop: 6,
      padding: '10px 14px',
      borderRadius: 12,
      background: active ? 'linear-gradient(135deg, rgba(10, 132, 255, 0.10) 0%, rgba(10, 132, 255, 0.04) 100%)' : 'rgba(0,0,0,0.025)',
      border: active ? '1px solid rgba(10, 132, 255, 0.18)' : '1px dashed rgba(0,0,0,0.10)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <span style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
          color: active ? 'rgba(10, 132, 255, 0.85)' : 'rgba(0, 0, 0, 0.4)',
        }}>Accrued So Far</span>
        <span style={{
          fontSize: 18, fontWeight: 800,
          color: active ? '#0a0a0a' : 'rgba(0,0,0,0.3)',
          letterSpacing: '-0.01em',
          fontVariantNumeric: 'tabular-nums',
        }}>
          ${accrual.accruedTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, gap: 12 }}>
        <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.5)', fontWeight: 600 }}>
          {accrual.daysElapsed} day{accrual.daysElapsed === 1 ? '' : 's'} elapsed
        </span>
        <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.55)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
          ${accrual.dailyInterest.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/day
        </span>
      </div>
    </div>
  )
}

// Translucent textarea — borderless, glass-tinted, with hover + focus states
// that match chipBoxStyle so it sits in the same visual language as every other
// field on the page.
function GlassTextArea({
  value, onChange, placeholder, minRows = 3,
}: { value: string; onChange: (v: string) => void; placeholder?: string; minRows?: number }) {
  const [hover, setHover] = useState(false)
  const [focused, setFocused] = useState(false)

  const bg = focused
    ? 'rgba(255, 255, 255, 0.55)'
    : hover
      ? 'rgba(255, 255, 255, 0.45)'
      : 'rgba(255, 255, 255, 0.35)'

  const focusGlow = focused
    ? ', 0 0 0 3px rgba(10, 132, 255, 0.18), 0 6px 18px -8px rgba(10, 132, 255, 0.35)'
    : ''

  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      placeholder={placeholder}
      rows={minRows}
      style={{
        width: '100%',
        padding: '11px 14px',
        borderRadius: 12,
        border: focused ? '1px solid rgba(10, 132, 255, 0.55)' : '1px solid transparent',
        background: bg,
        fontSize: 13, fontWeight: 500, color: '#0a0a0a',
        lineHeight: 1.55, fontFamily: 'inherit',
        outline: 'none', resize: 'vertical',
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.7), inset 0 0 0 0.5px rgba(255,255,255,0.4)${focusGlow}`,
        boxSizing: 'border-box',
        transition: 'background 180ms ease, box-shadow 180ms ease, border-color 180ms ease',
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
        background: 'rgba(255, 255, 255, 0.66)',
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

// Simple pill that says "Activated" (with a green dot) when the vehicle has
// floorplan data, and "Not active" (dimmed) otherwise.  Used inside the
// Logistics Hub card — admins prefer a quick at-a-glance status there;
// the detailed floorplan numbers live in Purchase Info → How Did You Pay.
function FloorplanActivatedPill({ active }: { active: boolean }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 10px',
      borderRadius: 999,
      background: active ? 'rgba(52, 199, 89, 0.12)' : 'rgba(0, 0, 0, 0.04)',
      border: active ? '1px solid rgba(52, 199, 89, 0.25)' : '1px solid rgba(0, 0, 0, 0.08)',
      fontSize: 11, fontWeight: 700, letterSpacing: '-0.005em',
      color: active ? '#1f7a3a' : 'rgba(0,0,0,0.45)',
      minHeight: 'auto',
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: active ? '#34c759' : 'rgba(0,0,0,0.25)',
        boxShadow: active ? '0 0 0 3px rgba(52, 199, 89, 0.18)' : 'none',
      }} />
      {active ? 'Activated' : 'Not active'}
    </span>
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

// Anchor row — borderless inline input with a translucent rounded background.
// Each field reads as its own soft floating chip with hover + focus states.
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
        ...chipBoxStyle(focused, hover, true),
        cursor: 'text',
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
        ...chipBoxStyle(focused, hover, true),
        position: 'relative',
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
        ...chipBoxStyle(editing, hover, isEditable),
        cursor: isEditable ? 'text' : 'default',
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
    <div style={chipBoxStyle(false, false, false)}>
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
          ...chipBoxStyle(open, hover, true),
          width: '100%',
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
          minWidth: 220,
          // Keep the dropdown inside the parent card — small enough that the
          // scroll kicks in for >~4 options instead of the panel ballooning
          // past the card edge.  Parent GlassCard has `contain: paint`, so
          // anything spilling past the card bottom would be clipped, not
          // scrollable.
          maxHeight: 160,
          borderRadius: 12,
          background: '#ffffff',
          border: '1px solid rgba(15, 23, 42, 0.08)',
          boxShadow: [
            '0 20px 50px -12px rgba(15, 23, 42, 0.25)',
            '0 8px 16px -4px rgba(15, 23, 42, 0.12)',
            'inset 0 1px 0 rgba(255, 255, 255, 0.95)',
          ].join(', '),
          overflowY: 'auto',
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
// Pass-through wrapper now that InlineTextField provides its own chip
// styling.  Kept as a component so the TitleBuildStudio JSX doesn't need
// to be rewritten — and so callers can adjust spacing in one place later.
function BlueprintRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>
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
      onClick={() => { if (isEditable && !editing) startEdit() }}
      style={{
        ...chipBoxStyle(editing, hover, isEditable),
        opacity: saving ? 0.55 : 1,
        gridColumn: fullWidth ? '1 / -1' : undefined,
        minWidth: 0,
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

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => setOpen(o => !o)}
      style={{
        ...chipBoxStyle(open, hover, true),
        opacity: saving ? 0.55 : 1,
        gridColumn: fullWidth ? '1 / -1' : undefined,
        minWidth: 0,
        position: 'relative',
      }}>
      <span style={labelStyle}>{label}</span>
      <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, flexShrink: 0, minWidth: 0 }}>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setOpen(o => !o) }}
          style={{
            ...valueButtonStyle('transparent', isPlaceholder, true),
            background: 'transparent', border: 'none', padding: 0,
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

  const isPlaceholder = !value

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => { if (isEditable && !editing) startEdit() }}
      style={{
        ...chipBoxStyle(editing, hover, isEditable),
        minWidth: 0,
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
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontSize: 14, fontWeight: 700,
            color: isPlaceholder ? 'rgba(0,0,0,0.3)' : '#0a0a0a',
            letterSpacing: '-0.005em',
          }}>
            <CalendarMicroIcon />
            {display}
          </span>
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
  fontSize: 11, fontWeight: 700,
  color: 'rgba(0,0,0,0.55)',
  letterSpacing: '-0.005em',
  whiteSpace: 'nowrap',
  overflow: 'hidden', textOverflow: 'ellipsis',
  minWidth: 0,
}

// Legacy hairline-underline helper, still referenced by some older inline
// fields not converted yet.  Kept so the file compiles; new fields use the
// chip style below.
function rowLineColor(editing: boolean, hover: boolean, isEditable: boolean): string {
  if (editing) return 'rgba(0, 0, 0, 0.42)'
  if (hover && isEditable) return 'rgba(0, 0, 0, 0.16)'
  return 'rgba(0, 0, 0, 0.07)'
}

// Chip-style row container — translucent rounded background, label-left /
// value-right.  Shared by InlineField, InlineTextField, InlineSelectField,
// InlineDateField so the General Info + Build / Title surfaces render with
// the same AnchorRow visual language used in Purchase Info.
//
// Three visual states (so the user always knows which field they're in):
//   • idle       — soft translucent fill
//   • hover      — brighter fill + thin tint ring
//   • focused    — bright fill + soft blue focus glow ring
function chipBoxStyle(editing: boolean, hover: boolean, isEditable: boolean): React.CSSProperties {
  const bg = editing
    ? 'rgba(255, 255, 255, 0.86)'
    : hover && isEditable
      ? 'rgba(255, 255, 255, 0.72)'
      : isEditable
        ? 'rgba(255, 255, 255, 0.46)'
        : 'rgba(255, 255, 255, 0.32)'

  const border = editing
    ? '1px solid rgba(10, 132, 255, 0.55)'
    : hover && isEditable
      ? '1px solid rgba(0, 0, 0, 0.10)'
      : '1px solid rgba(255, 255, 255, 0.65)'

  const baseShadow = [
    '0 1px 2px rgba(31, 38, 135, 0.04)',
    'inset 0 1px 0 rgba(255,255,255,0.85)',
    'inset 0 0 0 0.5px rgba(255, 255, 255, 0.45)',
  ]
  const focusGlow = editing
    ? [
        '0 0 0 3px rgba(10, 132, 255, 0.18)',
        '0 6px 18px -8px rgba(10, 132, 255, 0.35)',
      ]
    : hover && isEditable
      ? ['0 4px 12px -6px rgba(0, 0, 0, 0.10)']
      : []

  return {
    display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
    gap: 12,
    padding: '10px 14px',
    borderRadius: 12,
    background: bg,
    border,
    boxShadow: [...baseShadow, ...focusGlow].join(', '),
    cursor: isEditable ? 'pointer' : 'default',
    transform: hover && isEditable && !editing ? 'translateY(-0.5px)' : 'none',
    transition: 'background 180ms ease, box-shadow 180ms ease, border-color 180ms ease, transform 180ms ease',
  }
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
// Full gallery: photos by section, tabs to switch, click to zoom (full-res).
// View mode = masonry full-aspect thumbnails (smooth). Reorder mode = drag grid
// that saves sortOrder (the order photos syndicate to the website in).
function MediaGalleryModal({
  media, vehicleId, initialSection, onClose, onChange,
}: {
  media: MediaAsset[]
  vehicleId: string
  initialSection: string | null
  onClose: () => void
  onChange: () => void | Promise<void>
}) {
  const [order, setOrder] = useState<string[]>(media.map(m => m.id))
  const [reorder, setReorder] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [zoom, setZoom] = useState<{ items: MediaAsset[]; idx: number } | null>(null)

  // Re-sync local order whenever the parent media list changes (after a save refetch).
  useEffect(() => { setOrder(media.map(m => m.id)) }, [media])

  const byId = new Map(media.map(a => [a.id, a]))
  const ordered = order.map(id => byId.get(id)).filter(Boolean) as MediaAsset[]

  const groups = STUDIO_CATEGORIES
    .map(cat => ({ cat, items: ordered.filter(m => cat.types.includes(m.type)) }))
    .filter(g => g.items.length > 0)

  const [active, setActive] = useState<string>(
    initialSection && STUDIO_CATEGORIES.some(c => c.id === initialSection) ? initialSection : 'all',
  )

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { if (zoom) setZoom(null); else onClose() }
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKey) }
  }, [zoom, onClose])

  async function persist(newOrder: string[]) {
    setSaving(true)
    try {
      await fetch('/api/media/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicleId, orderedIds: newOrder }),
      })
      await onChange()
    } finally {
      setSaving(false)
    }
  }

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) { setDragId(null); return }
    const arr = order.filter(id => id !== dragId)
    const ti = arr.indexOf(targetId)
    arr.splice(ti < 0 ? arr.length : ti, 0, dragId)
    setOrder(arr)
    setDragId(null)
    persist(arr)
  }

  const tabs = [{ id: 'all', label: `All (${media.length})` },
    ...groups.map(g => ({ id: g.cat.id, label: `${g.cat.label} (${g.items.length})` }))]
  const visibleGroups = active === 'all' ? groups : groups.filter(g => g.cat.id === active)

  const cover: React.CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }
  const pill = (on: boolean): React.CSSProperties => ({
    padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer', minHeight: 'auto',
    border: `1px solid ${on ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.22)'}`,
    background: on ? '#fff' : 'transparent', color: on ? '#000' : 'rgba(255,255,255,0.82)',
  })

  return createPortal((
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.94)', zIndex: 900, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <p style={{ color: '#fff', fontSize: 15, fontWeight: 700, flex: '0 0 auto' }}>Photos</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: 1 }}>
          {tabs.map(t => (
            <button key={t.id} type="button" onClick={() => setActive(t.id)} style={pill(active === t.id)}>{t.label}</button>
          ))}
        </div>
        {saving && <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: 600 }}>Saving order…</span>}
        <button type="button" onClick={() => setReorder(r => !r)} style={pill(reorder)}>
          {reorder ? 'Done' : 'Reorder'}
        </button>
        <button type="button" onClick={onClose} aria-label="Close" style={{
          border: 'none', background: 'rgba(255,255,255,0.12)', color: '#fff',
          width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', fontSize: 15, minHeight: 'auto', flex: '0 0 auto',
        }}>✕</button>
      </div>

      {reorder && (
        <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, padding: '10px 24px 0' }}>
          Drag photos to set the order they appear in on the website. Saves automatically.
        </p>
      )}

      <div style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', padding: '18px 24px 60px' }}>
        {visibleGroups.map(g => (
          <div key={g.cat.id} style={{ marginBottom: 30 }}>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 12 }}>
              {g.cat.label} · {g.items.length}
            </p>
            {reorder ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
                {g.items.map((m, i) => (
                  <div
                    key={m.id}
                    draggable
                    onDragStart={() => setDragId(m.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleDrop(m.id)}
                    onDragEnd={() => setDragId(null)}
                    style={{
                      position: 'relative', aspectRatio: '4 / 3', borderRadius: 10, overflow: 'hidden',
                      background: '#111', cursor: 'grab', opacity: dragId === m.id ? 0.35 : 1,
                      outline: '1px solid rgba(255,255,255,0.14)',
                    }}
                  >
                    {isVideoType(m.type)
                      ? <video src={m.url} muted playsInline preload="metadata" style={cover} />
                      : /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={`/api/media/thumb?id=${m.id}&w=400`} alt={m.caption || g.cat.label} loading="lazy" decoding="async" style={cover} />}
                    <span style={{
                      position: 'absolute', top: 6, left: 6, zIndex: 2, minWidth: 20, height: 20, padding: '0 6px',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 11, fontWeight: 700, borderRadius: 999,
                    }}>{i + 1}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ columnWidth: 260, columnGap: 12 }}>
                {g.items.map((m, i) => (
                  <div key={m.id} onClick={() => setZoom({ items: g.items, idx: i })}
                    style={{ breakInside: 'avoid', marginBottom: 12, cursor: 'zoom-in', borderRadius: 10, overflow: 'hidden', background: '#111' }}>
                    {isVideoType(m.type)
                      ? <video src={m.url} muted playsInline preload="metadata" style={{ width: '100%', display: 'block' }} />
                      : /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={`/api/media/thumb?id=${m.id}&w=600`} alt={m.caption || g.cat.label} loading="lazy" decoding="async" style={{ width: '100%', display: 'block' }} />}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {zoom && (
        <MediaLightbox
          items={zoom.items}
          startIdx={zoom.idx}
          onClose={() => setZoom(null)}
          onChangeIdx={(idx) => setZoom(z => (z ? { ...z, idx } : z))}
        />
      )}
    </div>
  ), document.body)
}

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
        }}>{current.caption}</div>
      )}
    </div>
  )
}
