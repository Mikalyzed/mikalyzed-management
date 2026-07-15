'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import VehicleCard from '@/components/VehicleCard'
import KanbanScrollbar from '@/components/KanbanScrollbar'
import { STAGE_LABELS } from '@/lib/constants'
import OrderPartModal from '@/components/OrderPartModal'
import AddPartInline from '@/components/AddPartInline'
import VendorSearch, { VendorResult } from '@/components/VendorSearch'
import RichTypeReadout from '@/components/RichTypeReadout'
import { summarizeReview, extractIssueFixTasks } from '@/lib/inspection-issues'

type ChecklistItem = {
  item: string; done: boolean; note: string
  type?: string
  data?: Record<string, unknown>
  fields?: { key: string; label: string }[]
  addedByMechanic?: boolean
  approved?: string
  estimatedHours?: number
  // Per-task hand-off to a specific mechanic (mirrors the mechanic board).
  assigneeId?: string | null
  assigneeName?: string | null
}

// Initials + deterministic color for an assignee chip (mirror of the mechanic board).
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
const CHIP_COLORS = ['#2563eb', '#db2777', '#16a34a', '#d97706', '#7c3aed', '#0891b2']
function chipColor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return CHIP_COLORS[h % CHIP_COLORS.length]
}
// Effective owner of a task: explicit assignee → them; added-but-unassigned →
// none (needs admin); otherwise inherits the car's owner.
function taskOwner(
  item: ChecklistItem,
  carOwner: { id: string; name: string } | null | undefined,
): { id: string; name: string } | null {
  if (item.assigneeId) return { id: item.assigneeId, name: item.assigneeName || '?' }
  if (item.addedByMechanic) return null
  return carOwner ?? null
}

type VehicleWithStage = {
  id: string
  stockNumber: string
  year: number | null
  make: string
  model: string
  color: string | null
  status: string
  currentStageId: string | null
  currentAssignee: { id: string; name: string } | null
  lastCompletedStage?: string | null
  lastCompleted?: {
    id: string
    stage: string
    completedAt: string | null
    checklist: {
      item: string; done: boolean; note?: string
      addedByMechanic?: boolean
      approved?: string
      estimatedHours?: number
      type?: string
      data?: Record<string, unknown>
      fields?: { key: string; label: string }[]
    }[]
    scopeName: string | null
    assignee: { id: string; name: string } | null
  } | null
  inventoryStatus?: string | null
  pendingInstalls?: { id: string; name: string; sourceItem?: string | null; sourceSubField?: string | null }[]
  partsInPipeline?: { id: string; name: string; status: string; sourceItem?: string | null; sourceSubField?: string | null }[]
  returnQueue?: { stage: string; fromStage?: string; reason?: string }[]
  routeHistory?: { stage: string; status: string; completedAt: string | null; scopeName: string | null }[]
  stages: Array<{
    id?: string
    status: string
    startedAt: string
    totalBlockedSeconds: number
    priority: number
    estimatedHours: number | null
    checklist?: ChecklistItem[]
    assignee?: { id: string; name: string } | null
    awaitingParts?: boolean
    awaitingPartsName?: string | null
    pauseReason?: string | null
    pauseDetail?: string | null
    timerStartedAt?: string | null
    autoPaused?: boolean
  }>
}

type ModalData = {
  vehicle: {
    id: string
    stockNumber: string
    year: number | null
    make: string
    model: string
    color: string | null
    status: string
    currentStageId: string | null
    currentAssignee: { id: string; name: string } | null
    stages: Array<{
      id: string
      stage: string
      status: string
      startedAt: string
      totalBlockedSeconds: number
      checklist: ChecklistItem[]
      assignee: { id: string; name: string } | null
      awaitingParts?: boolean
      autoPaused?: boolean
      timerStartedAt?: string | null
      pauseReason?: string | null
    }>
  }
}

const COLUMNS = ['mechanic', 'detailing', 'content', 'publish', 'completed'] as const

// Per-stage identity colour. Each pipeline gets its own hue — a glowing header
// dot, an accent underline, and a faintly tinted lane — so columns read apart
// instantly instead of sitting in identical grey boxes.
const STAGE_HUE: Record<string, { dot: string; tint: string; tintHover: string; border: string }> = {
  mechanic:  { dot: '#6366f1', tint: 'rgba(99,102,241,0.055)',  tintHover: 'rgba(99,102,241,0.11)',  border: 'rgba(99,102,241,0.20)' },
  detailing: { dot: '#0d9488', tint: 'rgba(13,148,136,0.055)',  tintHover: 'rgba(13,148,136,0.11)',  border: 'rgba(13,148,136,0.20)' },
  content:   { dot: '#8b5cf6', tint: 'rgba(139,92,246,0.055)',  tintHover: 'rgba(139,92,246,0.11)',  border: 'rgba(139,92,246,0.20)' },
  publish:   { dot: '#16a34a', tint: 'rgba(22,163,74,0.055)',   tintHover: 'rgba(22,163,74,0.11)',   border: 'rgba(22,163,74,0.20)' },
  completed: { dot: '#9a9a96', tint: 'rgba(154,154,150,0.05)',  tintHover: 'rgba(154,154,150,0.09)', border: 'rgba(154,154,150,0.22)' },
}

function partActionBtn(color: string, bg: string): React.CSSProperties {
  return {
    flex: 1, minHeight: 0,
    padding: '7px 10px', borderRadius: 8,
    border: `1px solid ${color}`, background: bg, color,
    fontSize: 12, fontWeight: 600, cursor: 'pointer',
    whiteSpace: 'nowrap',
  }
}

export default function VehiclesPage() {
  const router = useRouter()
  const [vehicles, setVehicles] = useState<VehicleWithStage[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [dragInfo, setDragInfo] = useState<{ vehicleId: string; column: string } | null>(null)
  const [liveOrder, setLiveOrder] = useState<Record<string, string[]>>({})
  const columnRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const dragGhostRef = useRef<HTMLDivElement | null>(null)
  const originalOrderRef = useRef<Record<string, string[]>>({})
  const kanbanRef = useRef<HTMLDivElement | null>(null)
  const [search, setSearch] = useState('')
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null)
  const [modalData, setModalData] = useState<ModalData | null>(null)
  const [modalChecklist, setModalChecklist] = useState<ChecklistItem[]>([])
  const [modalSaving, setModalSaving] = useState(false)
  const [modalLoading, setModalLoading] = useState(false)
  const [modalParts, setModalParts] = useState<any[]>([])
  const [modalTab, setModalTab] = useState<'tasks' | 'parts'>('tasks')
  const [advancing, setAdvancing] = useState(false)
  const [teamMembers, setTeamMembers] = useState<{ id: string; name: string }[]>([])
  const [assigningUser, setAssigningUser] = useState(false)
  const [hoverColumn, setHoverColumn] = useState<string | null>(null)
  const [routingVehicle, setRoutingVehicle] = useState<VehicleWithStage | null>(null)
  // Maps task name → part id, so we know which routingTasks correspond to "Install [part]"
  // entries and can stamp those parts' installTaskCreatedAt on confirm.
  const [routingInstallMap, setRoutingInstallMap] = useState<Record<string, string>>({})
  const [expandedRoutingId, setExpandedRoutingId] = useState<string | null>(null)
  const [routingNext, setRoutingNext] = useState<string>('detailing')
  const [routingReason, setRoutingReason] = useState('')
  const [routingTasks, setRoutingTasks] = useState<string[]>([])
  const [routingCarry, setRoutingCarry] = useState<Set<number>>(new Set())
  const [routingNewTask, setRoutingNewTask] = useState('')
  const [routingEstHours, setRoutingEstHours] = useState('')
  const [routingAssigneeId, setRoutingAssigneeId] = useState('')
  const [routingScopeName, setRoutingScopeName] = useState('')
  const [mechanics, setMechanics] = useState<{ id: string; name: string }[]>([])
  const [routingSoldDelivery, setRoutingSoldDelivery] = useState(false)
  const [routingSaving, setRoutingSaving] = useState(false)
  // Pre-made checklist templates for the target stage (e.g. "New Vehicle
  // Inspection", "Sold Vehicle Inspection"). Fetched when the routing modal is
  // open, per selected stage. Admin can check any on to drop its items into the
  // task list below.
  type RoutingTemplate = { id: string; name: string; isDefault: boolean; items: { item: string; type?: string; fields?: unknown }[] }
  const [routingTemplates, setRoutingTemplates] = useState<RoutingTemplate[]>([])
  const [routingSelectedTemplateIds, setRoutingSelectedTemplateIds] = useState<string[]>([])
  const [moveModal, setMoveModal] = useState<{
    vehicleId: string
    fromStage: string
    toStage: string
    tasks: { item: string; selected: boolean; type?: string; fields?: { key: string; label: string }[] }[]
    assigneeId: string | null
    teamMembers: { id: string; name: string }[]
    returnAfterComplete: boolean
    saving: boolean
    templates: { id: string; name: string; isDefault: boolean; items: { item: string; type?: string; fields?: { key: string; label: string }[] }[] }[]
    selectedTemplateId: string
  } | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; stockNumber: string; desc: string } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [externalModal, setExternalModal] = useState<{ vehicleId: string; stockNumber: string; year: number | null; make: string; model: string; color: string | null; stageId: string | null } | null>(null)
  const [externalSubmitting, setExternalSubmitting] = useState(false)
  const [externalPending, setExternalPending] = useState(false)
  const [externalVendor, setExternalVendor] = useState<VendorResult | null>(null)
  const [externalAtDealership, setExternalAtDealership] = useState(false)
  const [skipping, setSkipping] = useState(false)
  const mouseDownPos = useRef<{ x: number; y: number } | null>(null)
  const didDrag = useRef(false)
  useEffect(() => {
    fetch('/api/vehicles')
      .then((r) => r.json())
      .then((data) => setVehicles(data.vehicles || []))
      .catch(console.error)
      .finally(() => setLoading(false))

    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((data) => {
        if (data.user?.role === 'admin') setIsAdmin(true)
        if (data.user?.id) setUserId(data.user.id)
      })
      .catch(() => {})

    fetch('/api/users')
      .then((r) => r.json())
      .then((data) => setTeamMembers((data.users || []).map((u: { id: string; name: string }) => ({ id: u.id, name: u.name }))))
      .catch(() => {})

    fetch('/api/users?role=mechanic')
      .then((r) => r.json())
      .then((data) => setMechanics((data.users || []).map((u: { id: string; name: string }) => ({ id: u.id, name: u.name }))))
      .catch(() => {})

    const ghost = document.createElement('div')
    ghost.style.position = 'fixed'
    ghost.style.top = '-9999px'
    ghost.style.left = '-9999px'
    ghost.style.pointerEvents = 'none'
    document.body.appendChild(ghost)
    dragGhostRef.current = ghost
    return () => { document.body.removeChild(ghost) }
  }, [])

  // Load checklist templates for the routing modal's target stage. Refires when
  // the admin switches the destination (Mechanic / Detailing / …). Selection is
  // reset on every stage change — the stage-switch handler strips the old
  // template's items from the task list so nothing lingers.
  useEffect(() => {
    if (!routingVehicle || routingNext === 'completed') {
      setRoutingTemplates([])
      setRoutingSelectedTemplateIds([])
      return
    }
    let cancelled = false
    fetch(`/api/checklist-templates?stage=${routingNext}`)
      .then(async r => {
        if (!r.ok) return { templates: [] }
        const text = await r.text()
        if (!text) return { templates: [] }
        try { return JSON.parse(text) } catch { return { templates: [] } }
      })
      .then(d => { if (!cancelled) setRoutingTemplates((d.templates || []) as RoutingTemplate[]) })
      .catch(() => { if (!cancelled) setRoutingTemplates([]) })
    return () => { cancelled = true }
  }, [routingVehicle, routingNext])

  // Toggle a template: add/remove its items in the task list and reflect the
  // selection in the scope label (so the stage reads e.g. "New Vehicle Inspection").
  function toggleRoutingTemplate(tpl: RoutingTemplate) {
    const items = tpl.items.map(it => it.item)
    const isOn = routingSelectedTemplateIds.includes(tpl.id)
    const nextIds = isOn
      ? routingSelectedTemplateIds.filter(id => id !== tpl.id)
      : [...routingSelectedTemplateIds, tpl.id]
    setRoutingSelectedTemplateIds(nextIds)
    setRoutingTasks(prev => isOn
      ? prev.filter(x => !items.includes(x))
      : [...prev, ...items.filter(x => !prev.includes(x))])
    const names = routingTemplates.filter(t => nextIds.includes(t.id)).map(t => t.name)
    setRoutingScopeName(names.join(' + '))
  }

  const getColumnVehicles = useCallback(
    (col: string) => {
      const q = search.toLowerCase().trim()
      const colVehicles = vehicles.filter((v) => {
        if (v.status !== col) return false
        if (!q) return true
        const desc = `${v.year || ''} ${v.make} ${v.model} ${v.stockNumber} ${v.color || ''}`.toLowerCase()
        return desc.includes(q)
      })
      if (dragInfo && liveOrder[col]) {
        // Return vehicles in the live reordered order
        return liveOrder[col]
          .map(id => colVehicles.find(v => v.id === id))
          .filter(Boolean) as VehicleWithStage[]
      }
      return colVehicles
    },
    [vehicles, dragInfo, liveOrder, search]
  )

  const handleDragStart = useCallback((e: React.DragEvent, vehicleId: string, column: string) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', vehicleId)

    // Custom drag image
    const cardEl = (e.currentTarget as HTMLElement).querySelector('.vehicle-card-inner') as HTMLElement
    if (cardEl && dragGhostRef.current) {
      const clone = cardEl.cloneNode(true) as HTMLElement
      clone.style.width = `${cardEl.offsetWidth}px`
      clone.style.background = '#ffffff'
      clone.style.borderRadius = '16px'
      clone.style.border = '2px solid #dffd6e'
      clone.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)'
      clone.style.padding = '16px'
      clone.style.opacity = '0.95'
      dragGhostRef.current.innerHTML = ''
      dragGhostRef.current.appendChild(clone)
      e.dataTransfer.setDragImage(clone, cardEl.offsetWidth / 2, 30)
    }

    // Store original order for this column
    const colVehicles = vehicles.filter(v => v.status === column)
    const ids = colVehicles.map(v => v.id)
    originalOrderRef.current = { [column]: ids }
    setLiveOrder({ [column]: ids })
    setDragInfo({ vehicleId, column })
  }, [vehicles])

  const handleDragOver = useCallback(
    (e: React.DragEvent, column: string) => {
      if (!dragInfo) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'

      // Cross-column hover highlight
      if (dragInfo.column !== column) {
        setHoverColumn(column)
        return
      }

      setHoverColumn(null)

      const container = columnRefs.current[column]
      if (!container) return

      const cards = Array.from(container.querySelectorAll('[data-vehicle-id]')) as HTMLElement[]
      const y = e.clientY
      let hoverIdx = cards.length

      for (let i = 0; i < cards.length; i++) {
        const rect = cards[i].getBoundingClientRect()
        if (y < rect.top + rect.height / 2) {
          hoverIdx = i
          break
        }
      }

      // Reorder the live list
      setLiveOrder(prev => {
        const currentOrder = prev[column] || originalOrderRef.current[column] || []
        const dragIdx = currentOrder.indexOf(dragInfo.vehicleId)
        if (dragIdx === -1) return prev

        // Calculate target index
        let targetIdx = hoverIdx
        if (targetIdx > dragIdx) targetIdx = Math.min(targetIdx, currentOrder.length - 1)
        if (targetIdx === dragIdx) return prev

        const newOrder = [...currentOrder]
        newOrder.splice(dragIdx, 1)
        newOrder.splice(targetIdx, 0, dragInfo.vehicleId)
        return { [column]: newOrder }
      })
    },
    [dragInfo]
  )

  const handleDrop = useCallback(
    async (e: React.DragEvent, column: string) => {
      e.preventDefault()
      setHoverColumn(null)

      if (!dragInfo) {
        setDragInfo(null)
        setLiveOrder({})
        return
      }

      // Cross-column drop → open move modal
      if (dragInfo.column !== column && column !== 'completed') {
        const vehicleId = dragInfo.vehicleId
        const fromStage = dragInfo.column
        setDragInfo(null)
        setLiveOrder({})

        // Fetch stage config defaults + team members
        try {
          const [configRes, teamRes, tmplRes] = await Promise.all([
            fetch('/api/settings/stages'),
            fetch('/api/users'),
            fetch(`/api/checklist-templates?stage=${column}`),
          ])
          const configData = await configRes.json()
          const teamData = await teamRes.json()
          const tmplData = await tmplRes.json().catch(() => ({ templates: [] }))
          const stageConfig = configData.stages?.find((s: { stage: string }) => s.stage === column)
          const defaultAssignee: string | null = stageConfig?.defaultAssigneeId || null
          const templates = (tmplData.templates || []) as { id: string; name: string; isDefault: boolean; items: { item: string; type?: string; fields?: { key: string; label: string }[] }[] }[]
          const defaultTpl = templates.find(t => t.isDefault)

          // Auto-select default template's items
          const initialTasks = defaultTpl
            ? defaultTpl.items.map(it => ({
                item: it.item, selected: true,
                ...(it.type ? { type: it.type } : {}),
                ...(it.fields ? { fields: it.fields } : {}),
              }))
            : []

          setMoveModal({
            vehicleId,
            fromStage,
            toStage: column,
            tasks: initialTasks,
            assigneeId: defaultAssignee,
            teamMembers: (teamData.users || []).map((u: { id: string; name: string }) => ({ id: u.id, name: u.name })),
            returnAfterComplete: false,
            saving: false,
            templates,
            selectedTemplateId: defaultTpl?.id || '',
          })
        } catch {
          // Fallback — just open with empty tasks
          setMoveModal({
            vehicleId,
            fromStage,
            toStage: column,
            tasks: [],
            assigneeId: null,
            teamMembers: [],
            returnAfterComplete: false,
            saving: false,
            templates: [],
            selectedTemplateId: '',
          })
        }
        return
      }

      // Cross-column drop to completed
      if (dragInfo.column !== column && column === 'completed') {
        const vehicleId = dragInfo.vehicleId
        setDragInfo(null)
        setLiveOrder({})
        try {
          await fetch(`/api/vehicles/${vehicleId}/move-stage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetStage: 'completed' }),
          })
          const res = await fetch('/api/vehicles')
          const data = await res.json()
          setVehicles(data.vehicles || [])
        } catch { /* ignore */ }
        return
      }

      // Same-column reorder
      const orderedIds = liveOrder[column] || []
      
      setVehicles((prev) => {
        const others = prev.filter((v) => v.status !== column)
        const colVehicles = prev.filter((v) => v.status === column)
        const reordered = orderedIds
          .map(id => colVehicles.find(v => v.id === id))
          .filter(Boolean)
          .map((v, i) => ({
            ...v!,
            stages: v!.stages.map((s, si) => (si === 0 ? { ...s, priority: i } : s)),
          }))
        return [...others, ...reordered]
      })

      setDragInfo(null)
      setLiveOrder({})

      if (orderedIds.length > 0) {
        await fetch('/api/stages/reorder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stage: column, orderedIds }),
        })
      }
    },
    [dragInfo, liveOrder]
  )

  const handleDragEnd = useCallback(() => {
    setDragInfo(null)
    setLiveOrder({})
    setHoverColumn(null)
    didDrag.current = true
  }, [])

  const openModal = useCallback(async (vehicleId: string) => {
    setSelectedVehicleId(vehicleId)
    setModalLoading(true)
    setModalData(null)
    setModalParts([])
    setModalTab('tasks')
    try {
      const [vehicleRes, partsRes] = await Promise.all([
        fetch(`/api/vehicles/${vehicleId}`),
        fetch(`/api/parts?vehicleId=${vehicleId}`)
      ])
      const data = await vehicleRes.json()
      const partsData = await partsRes.json()
      setModalData(data)
      setModalParts(partsData.parts || [])
      const currentStage = data.vehicle?.stages?.find(
        (s: { id: string }) => s.id === data.vehicle.currentStageId
      )
      setModalChecklist(currentStage?.checklist ? JSON.parse(JSON.stringify(currentStage.checklist)) : [])
    } catch { /* ignore */ }
    setModalLoading(false)
  }, [])

  const closeModal = useCallback(() => {
    setSelectedVehicleId(null)
    setModalData(null)
    setModalChecklist([])
    setModalParts([])
  }, [])

  const getCurrentStage = useCallback(() => {
    if (!modalData) return null
    return modalData.vehicle.stages.find(s => s.id === modalData.vehicle.currentStageId) || null
  }, [modalData])

  const toggleChecklistItem = useCallback(async (index: number) => {
    const stage = getCurrentStage()
    if (!stage) return
    const updated = [...modalChecklist]
    updated[index] = { ...updated[index], done: !updated[index].done }
    setModalChecklist(updated)
    setModalSaving(true)
    try {
      await fetch(`/api/stages/${stage.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checklist: updated }),
      })
    } catch { /* ignore */ }
    setModalSaving(false)
  }, [modalChecklist, getCurrentStage])

  // Hand a single task to a specific mechanic (or clear it) — mirrors the
  // mechanic board's per-task assignment, writing assigneeId/assigneeName onto
  // the checklist item.
  const assignChecklistItem = useCallback(async (index: number, mechId: string | null) => {
    const stage = getCurrentStage()
    if (!stage) return
    const mech = mechId ? mechanics.find(m => m.id === mechId) : null
    const updated = [...modalChecklist]
    updated[index] = { ...updated[index], assigneeId: mechId, assigneeName: mech?.name ?? null }
    setModalChecklist(updated)
    setModalSaving(true)
    try {
      await fetch(`/api/stages/${stage.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checklist: updated }),
      })
    } catch { /* ignore */ }
    setModalSaving(false)
  }, [modalChecklist, getCurrentStage, mechanics])

  const addChecklistItem = useCallback(async (taskText: string) => {
    const trimmed = taskText.trim()
    if (!trimmed) return
    const stage = getCurrentStage()
    if (!stage) return
    const updated = [...modalChecklist, { item: trimmed, done: false, note: '' }]
    setModalChecklist(updated)
    setModalSaving(true)
    try {
      await fetch(`/api/stages/${stage.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checklist: updated }),
      })
    } catch { /* ignore */ }
    setModalSaving(false)
  }, [modalChecklist, getCurrentStage])

  const removeChecklistItem = useCallback(async (index: number) => {
    const stage = getCurrentStage()
    if (!stage) return
    const updated = modalChecklist.filter((_, i) => i !== index)
    setModalChecklist(updated)
    setModalSaving(true)
    try {
      await fetch(`/api/stages/${stage.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checklist: updated }),
      })
    } catch { /* ignore */ }
    setModalSaving(false)
  }, [modalChecklist, getCurrentStage])

  const handleAdvanceStage = useCallback(async () => {
    const stage = getCurrentStage()
    if (!stage) return
    setAdvancing(true)
    try {
      await fetch(`/api/stages/${stage.id}/advance`, { method: 'POST' })
      closeModal()
      // Refresh vehicles
      const res = await fetch('/api/vehicles')
      const data = await res.json()
      setVehicles(data.vehicles || [])
    } catch { /* ignore */ }
    setAdvancing(false)
  }, [getCurrentStage, closeModal])

  const handleMoveConfirm = useCallback(async () => {
    if (!moveModal) return
    setMoveModal(prev => prev ? { ...prev, saving: true } : null)
    try {
      // Build custom checklist from selected tasks (preserving structured types/fields)
      const checklist = moveModal.tasks
        .filter(t => t.selected)
        .map(t => ({
          item: t.item, done: false, note: '',
          ...(t.type ? { type: t.type } : {}),
          ...(t.fields ? { fields: t.fields } : {}),
        }))

      await fetch(`/api/vehicles/${moveModal.vehicleId}/move-stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetStage: moveModal.toStage,
          checklist: checklist.length > 0 ? checklist : undefined,
          assigneeId: moveModal.assigneeId,
          skipCurrent: true,
          returnAfterComplete: moveModal.returnAfterComplete,
        }),
      })
      setMoveModal(null)
      const res = await fetch('/api/vehicles')
      const data = await res.json()
      setVehicles(data.vehicles || [])
    } catch { /* ignore */ }
    setMoveModal(prev => prev ? { ...prev, saving: false } : null)
  }, [moveModal])

  const handleCardMouseDown = useCallback((e: React.MouseEvent) => {
    mouseDownPos.current = { x: e.clientX, y: e.clientY }
    didDrag.current = false
  }, [])

  const handleCardClick = useCallback((e: React.MouseEvent, vehicleId: string) => {
    if (didDrag.current) return
    if (mouseDownPos.current) {
      const dx = Math.abs(e.clientX - mouseDownPos.current.x)
      const dy = Math.abs(e.clientY - mouseDownPos.current.y)
      if (dx > 5 || dy > 5) return
    }
    openModal(vehicleId)
  }, [openModal])

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: '60vh' }}>
        <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  function getTimeInStage(v: VehicleWithStage): string {
    const stage = v.stages[0]
    if (!stage) return ''
    const elapsed = (Date.now() - new Date(stage.startedAt).getTime()) / 1000 - stage.totalBlockedSeconds
    const hours = Math.floor(elapsed / 3600)
    if (hours < 1) return `${Math.floor(elapsed / 60)}m`
    if (hours < 24) return `${hours}h`
    return `${Math.floor(hours / 24)}d ${hours % 24}h`
  }

  // ─── KPI summary (computed live from the loaded vehicles, no extra fetch) ───
  const ACTIVE_STAGES = ['mechanic', 'detailing', 'content', 'publish']
  const reconVehicles = vehicles.filter(v => ACTIVE_STAGES.includes(v.status))
  const kpiInRecon = reconVehicles.length
  const kpiUnassigned = reconVehicles.filter(v => !v.currentAssignee).length
  const kpiNeedsAttention = reconVehicles.filter(v => {
    const s = v.stages[0]
    const paused = !!(s && s.status === 'in_progress' && !s.timerStartedAt && s.pauseReason)
    const awaitingParts = !!(s && s.awaitingParts)
    const parts = !!(v as { partsLabel?: string }).partsLabel
    const hasReturn = !!(v.returnQueue && v.returnQueue.some(r => r.stage !== v.status))
    return paused || awaitingParts || parts || hasReturn
  }).length
  const kpiPendingRouting = vehicles.filter(v => v.status === 'awaiting_routing').length
  const kpiAvgSec = (() => {
    const times = reconVehicles.map(v => {
      const s = v.stages[0]
      if (!s) return 0
      return (Date.now() - new Date(s.startedAt).getTime()) / 1000 - s.totalBlockedSeconds
    }).filter(t => t > 0)
    return times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0
  })()
  const fmtDuration = (sec: number): string => {
    if (sec <= 0) return '—'
    const h = Math.floor(sec / 3600)
    if (h < 1) return `${Math.max(1, Math.floor(sec / 60))}m`
    if (h < 24) return `${h}h`
    return `${Math.floor(h / 24)}d ${h % 24}h`
  }

  return (
    <div>
      {/* Clean solid canvas just for the recon board — sits over the app-wide
          glass mesh (z-index:-1) so a data-dense board reads calm and white
          cards keep their contrast instead of floating on coloured haze. */}
      <div aria-hidden style={{ position: 'fixed', inset: 0, background: 'var(--board-canvas)', zIndex: -1, pointerEvents: 'none' }} />
      <div className="page-header recon-page-header" style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>Recon Board</h1>
        <div className="recon-controls" style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minWidth: 0 }}>
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search vehicles..."
            className="recon-search"
            style={{ flex: 1, minWidth: 0, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14 }}
          />
          <Link href="/vehicles/new" className="btn btn-primary gap-2 recon-add-btn">
            <span style={{ fontSize: '18px', lineHeight: 1 }}>+</span>
            <span className="hidden sm:inline">Add Vehicle</span>
          </Link>
        </div>
      </div>

      {/* KPI summary strip */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(158px, 1fr))',
        gap: 12, marginBottom: 24,
      }}>
        {[
          { label: 'In recon', value: String(kpiInRecon), unit: kpiInRecon === 1 ? 'vehicle' : 'vehicles', trend: kpiPendingRouting > 0 ? `${kpiPendingRouting} pending routing` : 'all routed', dot: kpiPendingRouting > 0 ? '#f59e0b' : '#16a34a' },
          { label: 'Needs attention', value: String(kpiNeedsAttention), unit: '', trend: kpiNeedsAttention > 0 ? 'parts, paused & returns' : 'nothing flagged', dot: kpiNeedsAttention > 0 ? '#e11d48' : '#16a34a' },
          { label: 'Unassigned', value: String(kpiUnassigned), unit: '', trend: kpiUnassigned > 0 ? 'waiting on a tech' : 'all assigned', dot: kpiUnassigned > 0 ? '#f59e0b' : '#16a34a' },
          { label: 'Avg time in stage', value: fmtDuration(kpiAvgSec), unit: '', trend: 'across active stages', dot: '#9a9a96' },
        ].map((k, i) => (
          <div key={i} style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14,
            padding: '15px 17px', boxShadow: '0 1px 2px rgba(24,24,27,.04), 0 4px 12px -8px rgba(24,24,27,.12)',
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>
              {k.label}
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em', marginTop: 7, fontVariantNumeric: 'tabular-nums', display: 'flex', alignItems: 'baseline', gap: 6, lineHeight: 1.1 }}>
              {k.value}
              {k.unit && <span style={{ fontSize: 13, fontWeight: 550, color: 'var(--text-secondary)', letterSpacing: '-0.01em' }}>{k.unit}</span>}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 5, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: k.dot, flexShrink: 0 }} />
              {k.trend}
            </div>
          </div>
        ))}
      </div>

      {/* Pending Routing — admin only */}
      {isAdmin && vehicles.some(v => v.status === 'awaiting_routing') && (
        <div style={{
          position: 'relative', overflow: 'hidden',
          background: 'linear-gradient(180deg, #fffdf6, var(--bg-card) 64%)',
          border: '1px solid var(--border)',
          borderRadius: 16, padding: '18px 20px', marginBottom: 24,
          boxShadow: '0 1px 2px rgba(24,24,27,.04), 0 6px 16px -6px rgba(24,24,27,.10)',
        }}>
          <div aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: '#f59e0b' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 14 }}>
            <span style={{
              width: 28, height: 28, borderRadius: 8, flexShrink: 0,
              background: '#f59e0b', color: '#fff', display: 'grid', placeItems: 'center',
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12h4l2 3h6l2-3h4" /><path d="M5 12V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6" />
              </svg>
            </span>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-primary)' }}>
                Pending Routing
              </p>
              <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 1 }}>
                {(() => { const n = vehicles.filter(v => v.status === 'awaiting_routing').length; return `${n} ${n === 1 ? 'vehicle' : 'vehicles'} finished a stage and need their next assignment` })()}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {vehicles.filter(v => v.status === 'awaiting_routing').map(v => {
              const expanded = expandedRoutingId === v.id
              const last = v.lastCompleted
              const doneCount = last?.checklist?.filter(c => c.done).length ?? 0
              const totalCount = last?.checklist?.length ?? 0
              const review = last?.checklist ? summarizeReview(last.checklist as any) : { issueCount: 0, addedTaskCount: 0, hasAnything: false }
              const pendingInstalls = v.pendingInstalls || []
              const partsInPipeline = v.partsInPipeline || []
              const reviewChips: { label: string; fg: string; bg: string; dot: string }[] = []
              if (review.issueCount > 0) reviewChips.push({ label: `${review.issueCount} issue${review.issueCount === 1 ? '' : 's'}`, fg: '#b91c1c', bg: '#fdecef', dot: '#e11d48' })
              if (review.addedTaskCount > 0) reviewChips.push({ label: `${review.addedTaskCount} added task${review.addedTaskCount === 1 ? '' : 's'}`, fg: '#6d28d9', bg: '#f1edfd', dot: '#8b5cf6' })
              if (pendingInstalls.length > 0) reviewChips.push({ label: `${pendingInstalls.length} part${pendingInstalls.length === 1 ? '' : 's'} to install`, fg: '#1d4ed8', bg: '#eaf0fe', dot: '#2563eb' })
              if (partsInPipeline.length > 0) reviewChips.push({ label: `${partsInPipeline.length} part${partsInPipeline.length === 1 ? '' : 's'} in pipeline`, fg: '#b45309', bg: '#fdf3e7', dot: '#f59e0b' })
              const allTasksDone = totalCount > 0 && doneCount >= totalCount
              const showDonePill = !!v.lastCompletedStage && totalCount > 0
              const routingSub: string[] = []
              if (!showDonePill) routingSub.push(v.lastCompletedStage ? `Completed ${STAGE_LABELS[v.lastCompletedStage as keyof typeof STAGE_LABELS] || v.lastCompletedStage}` : 'Awaiting next stage assignment')
              if (last?.scopeName) routingSub.push(last.scopeName)
              if (last?.assignee) routingSub.push(last.assignee.name)
              return (
                <div key={v.id} className="routing-card" style={{
                  background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden',
                  boxShadow: '0 1px 2px rgba(24,24,27,.04)',
                }}>
                  <div
                    className="routing-row"
                    onClick={() => setExpandedRoutingId(expanded ? null : v.id)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                      padding: '13px 15px', cursor: 'pointer',
                    }}
                  >
                    <div className="routing-info" style={{ display: 'flex', alignItems: 'center', gap: 11, flex: 1, minWidth: 0 }}>
                      <span style={{
                        fontSize: 11, color: 'var(--text-muted)', flexShrink: 0, lineHeight: 1,
                        transition: 'transform .18s ease', transform: expanded ? 'rotate(90deg)' : 'none',
                      }}>▸</span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p title={`${v.year ?? ''} ${v.make} ${v.model}`.trim()} style={{
                          fontSize: 13.5, fontWeight: 640, letterSpacing: '-0.015em', color: 'var(--text-primary)',
                          lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {v.year} {v.make} {v.model}
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 8, flexWrap: 'wrap' }}>
                          <span style={{
                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                            fontSize: 10.5, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '-0.01em',
                            background: 'var(--bg-primary)', border: '1px solid var(--border)',
                            padding: '2px 7px', borderRadius: 6, whiteSpace: 'nowrap',
                          }}>#{v.stockNumber}</span>
                          {showDonePill && (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 5,
                              fontSize: 10.5, fontWeight: 650, padding: '2px 8px', borderRadius: 100, whiteSpace: 'nowrap',
                              color: allTasksDone ? '#16a34a' : 'var(--text-secondary)',
                              background: allTasksDone ? '#edfaf0' : 'var(--bg-primary)',
                              border: allTasksDone ? 'none' : '1px solid var(--border)',
                            }}>
                              {allTasksDone && <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#16a34a', flexShrink: 0 }} />}
                              {STAGE_LABELS[v.lastCompletedStage as keyof typeof STAGE_LABELS] || v.lastCompletedStage} · {doneCount}/{totalCount}
                            </span>
                          )}
                        </div>
                        {routingSub.length > 0 && (
                          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 5 }}>
                            {routingSub.join(' · ')}
                          </p>
                        )}
                        {reviewChips.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                            {reviewChips.map((c, ci) => (
                              <span key={ci} style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                fontSize: 10.5, fontWeight: 650, padding: '3px 9px', borderRadius: 100,
                                background: c.bg, color: c.fg, letterSpacing: '-0.005em',
                              }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.dot, flexShrink: 0 }} />
                                {c.label}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      className="routing-route-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        setRoutingVehicle(v)
                        const checklist = (v.lastCompleted?.checklist || []) as any[]
                        const fixes = extractIssueFixTasks(checklist)
                        const installs = v.pendingInstalls || []
                        const shouldGoToMechanic = fixes.length > 0 || installs.length > 0
                        // Pre-select mechanic if there's anything to fix or install; otherwise default to detailing
                        setRoutingNext(shouldGoToMechanic ? 'mechanic' : 'detailing')
                        setRoutingReason('')
                        // Pre-fill the new checklist with Fix tasks + Install tasks
                        const prefilledTasks = [
                          ...fixes.map(f => f.item),
                          ...installs.map(p => `Install: ${p.name}`),
                        ]
                        setRoutingTasks(prefilledTasks)
                        // Track which task names correspond to which part IDs so we can stamp them on confirm
                        const installMap: Record<string, string> = {}
                        for (const p of installs) installMap[`Install: ${p.name}`] = p.id
                        setRoutingInstallMap(installMap)
                        // Pre-check all (still-actionable) added tasks for carryover
                        const addedTasks = checklist
                          .map((t, i) => ({ t, i }))
                          .filter(({ t }) => t.addedByMechanic && t.approved !== 'declined')
                        setRoutingCarry(new Set(addedTasks.map(({ i }) => i)))
                        setRoutingNewTask('')
                        setRoutingEstHours('')
                        setRoutingAssigneeId('')
                        setRoutingScopeName('')
                        setRoutingSoldDelivery(false)
                        setRoutingSelectedTemplateIds([])
                      }}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
                        padding: '9px 15px', borderRadius: 10, border: 'none',
                        background: '#1a1a1a', color: '#dffd6e', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      Route
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                    </button>
                  </div>
                  {expanded && last?.checklist && last.checklist.length > 0 && (() => {
                    const inspectionItems = last.checklist.filter(t => !t.addedByMechanic)
                    const addedTasks = last.checklist.filter(t => t.addedByMechanic && t.approved !== 'declined')
                    // Group parts (in pipeline + pending install) by sourceItem for inline display
                    const allParts = [
                      ...(v.pendingInstalls || []).map(p => ({ ...p, status: 'received' })),
                      ...(v.partsInPipeline || []),
                    ]
                    const partsByItem: Record<string, typeof allParts> = {}
                    for (const p of allParts) {
                      if (!p.sourceItem) continue
                      if (!partsByItem[p.sourceItem]) partsByItem[p.sourceItem] = []
                      partsByItem[p.sourceItem].push(p)
                    }
                    // Tasks added by mechanic, grouped by sourceItem
                    const tasksByItem: Record<string, typeof addedTasks> = {}
                    for (const t of addedTasks) {
                      const src = (t as any).sourceItem
                      if (!src) continue
                      if (!tasksByItem[src]) tasksByItem[src] = []
                      tasksByItem[src].push(t)
                    }
                    const PART_LABELS: Record<string, string> = {
                      requested: 'Requested', sourced: 'Pending approval', ready_to_order: 'Ready to order',
                      ordered: 'Ordered', received: 'Received',
                    }
                    const renderRow = (t: typeof last.checklist[number], i: number) => {
                      const inlineParts = partsByItem[t.item] || []
                      const inlineTasks = tasksByItem[t.item] || []
                      return (
                      <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 0, fontSize: 13 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{
                            width: 14, height: 14, borderRadius: 4, flexShrink: 0,
                            border: t.done ? 'none' : '1.5px solid #d4d4d4',
                            background: t.done ? '#16a34a' : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#fff', fontSize: 10, fontWeight: 700,
                          }}>
                            {t.done ? '✓' : ''}
                          </span>
                          <span style={{
                            flex: 1,
                            color: t.done ? 'var(--text-muted)' : 'var(--text-primary)',
                            textDecoration: t.done ? 'line-through' : 'none',
                          }}>{t.item}</span>
                          {t.estimatedHours != null && (
                            <span style={{
                              fontSize: 11, fontWeight: 700, padding: '1px 8px', borderRadius: 100,
                              background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d',
                            }}>{t.estimatedHours}h</span>
                          )}
                        </div>
                        {t.type && t.data && Object.keys(t.data).length > 0 && (
                          <div style={{ paddingLeft: 22 }}>
                            <RichTypeReadout item={t} />
                          </div>
                        )}
                        {/* Inline tasks added from this inspection item */}
                        {inlineTasks.map((it, ii) => (
                          <div key={`it-${ii}`} style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 22, marginTop: 4, fontSize: 12 }}>
                            <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#7c3aed', flexShrink: 0 }} />
                            <span style={{ flex: 1, color: '#5b21b6' }}>
                              {it.item}
                              {(it as any).sourceSubField && <span style={{ color: '#9ca3af' }}> · {(it as any).sourceSubField}</span>}
                            </span>
                            <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 3, background: '#ede9fe', color: '#5b21b6', textTransform: 'uppercase' }}>Task</span>
                          </div>
                        ))}
                        {/* Inline parts added from this inspection item */}
                        {inlineParts.map((p, pi) => (
                          <div key={`pp-${pi}`} style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 22, marginTop: 4, fontSize: 12 }}>
                            <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#2563eb', flexShrink: 0 }} />
                            <span style={{ flex: 1, color: '#1d4ed8' }}>
                              {p.name}
                              {p.sourceSubField && <span style={{ color: '#9ca3af' }}> · {p.sourceSubField}</span>}
                            </span>
                            <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 3, background: '#dbeafe', color: '#1d4ed8', textTransform: 'uppercase' }}>Part · {PART_LABELS[p.status] || p.status}</span>
                          </div>
                        ))}
                      </div>
                      )
                    }
                    return (
                      <div style={{ borderTop: '1px solid var(--border-light)', background: 'var(--bg-primary)', padding: '12px 16px 14px 40px' }}>
                        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                          {last.scopeName === 'New Inventory' ? 'Inspection' : `Tasks from ${STAGE_LABELS[last.stage as keyof typeof STAGE_LABELS] || last.stage}`}
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {inspectionItems.map((t, i) => renderRow(t, i))}
                        </div>
                        {addedTasks.length > 0 && (
                          <>
                            <p style={{ fontSize: 11, fontWeight: 700, color: '#5b21b6', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 14, marginBottom: 8 }}>
                              Tasks added by mechanic ({addedTasks.length})
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {addedTasks.map((t, i) => {
                                const approval = (t.approved || 'pending').toLowerCase()
                                const TASK_LABELS: Record<string, string> = { pending: 'Pending approval', approved: 'Approved', declined: 'Declined' }
                                const colors = approval === 'approved'
                                  ? { bg: '#dcfce7', fg: '#15803d', border: '#bbf7d0' }
                                  : approval === 'declined'
                                  ? { bg: '#fee2e2', fg: '#991b1b', border: '#fca5a5' }
                                  : { bg: '#ede9fe', fg: '#5b21b6', border: '#c4b5fd' }
                                return (
                                  <div key={`added-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#7c3aed', flexShrink: 0 }} />
                                    <span style={{ flex: 1, color: 'var(--text-primary)' }}>
                                      {t.item}
                                      {t.estimatedHours != null && (
                                        <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>· {t.estimatedHours}h</span>
                                      )}
                                    </span>
                                    <span style={{
                                      fontSize: 10, fontWeight: 700, padding: '1px 8px', borderRadius: 4,
                                      background: colors.bg, color: colors.fg, border: `1px solid ${colors.border}`,
                                      textTransform: 'uppercase', letterSpacing: '0.04em',
                                    }}>{TASK_LABELS[approval] || approval}</span>
                                  </div>
                                )
                              })}
                            </div>
                          </>
                        )}
                        {(() => {
                          const allParts = [...(v.pendingInstalls || []).map(p => ({ id: p.id, name: p.name, status: 'received' as string })), ...(v.partsInPipeline || [])]
                          if (allParts.length === 0) return null
                          const PART_LABELS: Record<string, string> = {
                            requested: 'Requested', sourced: 'Pending approval', ready_to_order: 'Ready to order',
                            ordered: 'Ordered', received: 'Received',
                          }
                          return (
                            <>
                              <p style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 14, marginBottom: 8 }}>
                                Parts requested ({allParts.length})
                              </p>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {allParts.map((p, i) => (
                                  <div key={`part-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#2563eb', flexShrink: 0 }} />
                                    <span style={{ flex: 1, color: 'var(--text-primary)' }}>{p.name}</span>
                                    <span style={{
                                      fontSize: 10, fontWeight: 700, padding: '1px 8px', borderRadius: 4,
                                      background: p.status === 'received' ? '#dcfce7' : '#fef3c7',
                                      color: p.status === 'received' ? '#15803d' : '#92400e',
                                      border: `1px solid ${p.status === 'received' ? '#bbf7d0' : '#fde68a'}`,
                                      textTransform: 'uppercase', letterSpacing: '0.04em',
                                    }}>{PART_LABELS[p.status] || p.status}</span>
                                  </div>
                                ))}
                              </div>
                            </>
                          )
                        })()}
                      </div>
                    )
                  })()}
                  {expanded && (!last?.checklist || last.checklist.length === 0) && (
                    <div style={{ borderTop: '1px solid var(--border-light)', background: 'var(--bg-primary)', padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)' }}>
                      No tasks recorded for this stage.
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="kanban-board" ref={kanbanRef} style={{ marginTop: 8 }}>
        {COLUMNS.map((col) => {
          const colVehicles = getColumnVehicles(col)
          const hue = STAGE_HUE[col] || STAGE_HUE.completed
          return (
            <div key={col} className="kanban-column">
              <div className="kanban-column-header" style={{ marginBottom: 8 }}>
                <span className="kanban-col-dot" style={{
                  background: hue.dot,
                  boxShadow: `0 0 0 3px ${hue.dot}22, 0 0 9px ${hue.dot}88`,
                }} />
                <span className="kanban-column-title">
                  {STAGE_LABELS[col as keyof typeof STAGE_LABELS]}
                </span>
                <span className="kanban-column-count">{colVehicles.length}</span>
              </div>
              <div aria-hidden style={{
                height: 2, borderRadius: 2, marginBottom: 10,
                background: `linear-gradient(90deg, ${hue.dot} 0%, ${hue.dot}55 32%, transparent 92%)`,
              }} />
              <div
                className="flex flex-col gap-2"
                ref={(el) => { columnRefs.current[col] = el }}
                onDragOver={(e) => handleDragOver(e, col)}
                onDrop={(e) => handleDrop(e, col)}
                onDragLeave={() => { if (hoverColumn === col) setHoverColumn(null) }}
                style={{
                  minHeight: '120px',
                  borderRadius: '12px',
                  padding: '2px',
                  transition: 'background 0.2s, border-color 0.2s, box-shadow 0.2s',
                  background: hoverColumn === col ? 'rgba(223, 253, 110, 0.14)' : 'transparent',
                  border: hoverColumn === col ? '1px solid #cfe85a' : '1px solid transparent',
                  boxShadow: hoverColumn === col ? 'inset 0 0 0 1px #dffd6e' : 'none',
                }}
              >
                {colVehicles.map((v) => {
                  const isDragging = dragInfo?.vehicleId === v.id

                  return (
                    <div
                      key={v.id}
                      data-vehicle-id={v.id}
                      draggable={isAdmin}
                      onDragStart={(e) => handleDragStart(e, v.id, col)}
                      onDragEnd={handleDragEnd}
                      style={{
                        display: 'flex',
                        alignItems: 'stretch',
                        opacity: isDragging ? 0.3 : 1,
                        transform: isDragging ? 'scale(0.97)' : 'none',
                        transition: 'all 0.2s ease',
                        cursor: isAdmin ? 'grab' : undefined,
                      }}
                    >
                      <div
                        style={{ flex: 1, minWidth: 0 }}
                        className="vehicle-card-inner"
                        onMouseDown={handleCardMouseDown}
                        onClick={(e) => {
                          if (didDrag.current) return
                          if (mouseDownPos.current) {
                            const dx = Math.abs(e.clientX - mouseDownPos.current.x)
                            const dy = Math.abs(e.clientY - mouseDownPos.current.y)
                            if (dx > 5 || dy > 5) return
                          }
                          if (v.status === 'completed') {
                            router.push(`/vehicles/${v.id}?tab=history`)
                          } else {
                            handleCardClick(e, v.id)
                          }
                        }}
                      >
                        <VehicleCard
                          id={v.id}
                          stockNumber={v.stockNumber}
                          year={v.year}
                          make={v.make}
                          model={v.model}
                          color={v.color}
                          status={v.status}
                          stageStatus={v.stages[0]?.status}
                          stageDetail={
                            v.stages[0]?.awaitingParts ? 'awaiting_parts'
                            // auto_paused only triggers in mechanic (outside-of-work-hours auto pause).
                            // Other stages should never show auto_paused.
                            : (v.status === 'mechanic' && v.stages[0]?.autoPaused) ? 'auto_paused'
                            : (v.stages[0]?.status === 'in_progress' && !v.stages[0]?.timerStartedAt && v.stages[0]?.pauseReason) ? 'paused'
                            : undefined
                          }
                          assigneeName={v.currentAssignee?.name}
                          timeInStage={getTimeInStage(v)}
                          partsLabel={(v as any).partsLabel}
                          returnQueue={v.returnQueue}
                          stageScope={(v.stages[0] as any)?.scopeName || null}
                          checklistDone={(v.stages[0]?.checklist || []).filter(c => c.done).length}
                          checklistTotal={(v.stages[0]?.checklist || []).length}
                          progressLabel={(v.stages[0] as any)?.scopeName || STAGE_LABELS[v.status as keyof typeof STAGE_LABELS] || null}
                          pauseReason={(() => {
                            const s = v.stages[0]
                            if (!s || s.status !== 'in_progress' || s.timerStartedAt) return null
                            const reason = s.pauseReason
                            if (!reason) return null
                            const detail = s.pauseDetail?.trim()
                            // 'other' = use freeform note only
                            if (reason.toLowerCase() === 'other') return detail || null
                            // Friendly labels for known reasons
                            const friendly = reason.toLowerCase() === 'lunch' ? 'Lunch'
                              : reason.toLowerCase() === 'waiting_on_parts' ? 'Waiting on parts'
                              : reason
                            return detail ? `${friendly}: ${detail}` : friendly
                          })()}
                        />
                      </div>
                    </div>
                  )
                })}
                {colVehicles.length === 0 && !dragInfo && (
                  <div className="text-center py-10 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed var(--border)' }}>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Empty</p>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <KanbanScrollbar boardRef={kanbanRef} />

      {/* Routing Modal */}
      {routingVehicle && (
        <div
          onClick={() => !routingSaving && setRoutingVehicle(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Route Vehicle
            </p>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginTop: 4, marginBottom: 4 }}>
              #{routingVehicle.stockNumber} — {routingVehicle.year} {routingVehicle.make} {routingVehicle.model}
            </h2>
            {routingVehicle.lastCompletedStage && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                Just completed: <strong>{STAGE_LABELS[routingVehicle.lastCompletedStage as keyof typeof STAGE_LABELS] || routingVehicle.lastCompletedStage}</strong>
              </p>
            )}

            {/* Route history — chronological trail of stages already completed */}
            {routingVehicle.routeHistory && routingVehicle.routeHistory.length > 0 && (
              <div style={{
                background: '#f9fafb', border: '1px solid var(--border)', borderRadius: 10,
                padding: '10px 12px', marginBottom: 16,
              }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                  Route so far
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, fontSize: 12 }}>
                  {routingVehicle.routeHistory.map((h, i) => (
                    <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        padding: '3px 9px', borderRadius: 100, fontWeight: 600,
                        background: h.status === 'skipped' ? '#f3f4f6' : '#dbeafe',
                        color: h.status === 'skipped' ? '#6b7280' : '#1d4ed8',
                        textDecoration: h.status === 'skipped' ? 'line-through' : 'none',
                      }}>
                        {STAGE_LABELS[h.stage as keyof typeof STAGE_LABELS] || h.stage}
                        {h.scopeName ? ` · ${h.scopeName}` : ''}
                      </span>
                      {i < routingVehicle.routeHistory!.length - 1 && (
                        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>›</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Smart review banner: shows what was flagged + suggests mechanic when needed */}
            {(() => {
              const fixes = extractIssueFixTasks((routingVehicle.lastCompleted?.checklist || []) as any)
              const installs = routingVehicle.pendingInstalls || []
              const reviewSummary = summarizeReview((routingVehicle.lastCompleted?.checklist || []) as any)
              if (fixes.length === 0 && installs.length === 0 && reviewSummary.addedTaskCount === 0) return null
              return (
                <div style={{
                  background: '#fffbeb', border: '1px solid #fcd34d', borderLeft: '4px solid #f59e0b',
                  borderRadius: 10, padding: '12px 14px', marginBottom: 16,
                }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                    Needs review
                  </p>
                  <ul style={{ fontSize: 13, color: '#78350f', margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
                    {fixes.length > 0 && (
                      <li><strong>{fixes.length} issue{fixes.length === 1 ? '' : 's'}</strong> flagged by mechanic — pre-filled as Fix tasks below</li>
                    )}
                    {installs.length > 0 && (
                      <li><strong>{installs.length} part{installs.length === 1 ? '' : 's'}</strong> received and ready to install — pre-filled as Install tasks below</li>
                    )}
                    {reviewSummary.addedTaskCount > 0 && (
                      <li><strong>{reviewSummary.addedTaskCount} task{reviewSummary.addedTaskCount === 1 ? '' : 's'}</strong> added by mechanic — review the carry-forward checkboxes below</li>
                    )}
                  </ul>
                  {(fixes.length > 0 || installs.length > 0) && (
                    <p style={{ fontSize: 12, color: '#92400e', marginTop: 8, marginBottom: 0 }}>
                      <strong>Suggested:</strong> route to Mechanic (you can override below).
                    </p>
                  )}
                </div>
              )
            })()}

            {(() => {
              const addedTasks = (routingVehicle.lastCompleted?.checklist || [])
                .filter(t => t.addedByMechanic && t.approved !== 'declined')
              if (addedTasks.length === 0) return null
              const allChecked = addedTasks.every((_, i) => routingCarry.has(i))
              const toggleAll = () => {
                if (allChecked) setRoutingCarry(new Set())
                else setRoutingCarry(new Set(addedTasks.map((_, i) => i)))
              }
              const toggleOne = (i: number) => {
                const next = new Set(routingCarry)
                if (next.has(i)) next.delete(i); else next.add(i)
                setRoutingCarry(next)
              }
              return (
                <div style={{
                  background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10,
                  padding: '10px 12px', marginBottom: 16,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Tasks added during inspection ({addedTasks.length})
                    </p>
                    <button
                      type="button"
                      onClick={toggleAll}
                      style={{ background: 'none', border: 'none', fontSize: 11, fontWeight: 700, color: '#1d4ed8', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.04em' }}
                    >
                      {allChecked ? 'Uncheck all' : 'Check all'}
                    </button>
                  </div>
                  <p style={{ fontSize: 11, color: '#1e3a8a', marginBottom: 8 }}>
                    Checked tasks will be added to the next stage&apos;s checklist.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {addedTasks.map((t, i) => {
                      const checked = routingCarry.has(i)
                      return (
                        <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleOne(i)}
                            style={{ width: 14, height: 14, flexShrink: 0, cursor: 'pointer', accentColor: '#1d4ed8' }}
                          />
                          <span style={{ flex: 1, color: 'var(--text-primary)' }}>{t.item}</span>
                          {t.estimatedHours != null && (
                            <span style={{
                              fontSize: 11, fontWeight: 700, padding: '1px 8px', borderRadius: 100,
                              background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d',
                            }}>{t.estimatedHours}h</span>
                          )}
                        </label>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Send to:</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
              {[
                { v: 'mechanic', label: 'Mechanic' },
                { v: 'detailing', label: 'Detailing' },
                { v: 'content', label: 'Content' },
                { v: 'publish', label: 'Publish' },
                { v: 'completed', label: 'Complete' },
              ].map(opt => {
                const active = routingNext === opt.v
                return (
                  <button
                    key={opt.v}
                    onClick={() => {
                      // Fix/Install tasks are mechanic-only work — strip them when
                      // routing anywhere else so they don't leak into a detailing /
                      // content / publish stage as bogus checklist items. Re-add
                      // them if the user switches back to mechanic.
                      const fixes = routingVehicle
                        ? extractIssueFixTasks((routingVehicle.lastCompleted?.checklist || []) as any).map(f => f.item)
                        : []
                      const installs = Object.keys(routingInstallMap)
                      // Template items belong to the stage they were picked for —
                      // drop them when switching stages (templates reload per stage).
                      const tplItems = routingTemplates
                        .filter(t => routingSelectedTemplateIds.includes(t.id))
                        .flatMap(t => t.items.map(i => i.item))
                      const autoSet = new Set<string>([...fixes, ...installs, ...tplItems])
                      const userTasks = routingTasks.filter(t => !autoSet.has(t))
                      const next = opt.v === 'mechanic'
                        ? [...fixes, ...installs, ...userTasks]
                        : userTasks
                      setRoutingTasks(next)
                      setRoutingSelectedTemplateIds([])
                      setRoutingScopeName('')
                      setRoutingNext(opt.v)
                    }}
                    style={{
                      padding: '10px 14px', borderRadius: 10,
                      border: active ? '2px solid #1a1a1a' : '1px solid var(--border)',
                      background: active ? '#fafaf8' : '#fff',
                      fontSize: 14, fontWeight: 600, cursor: 'pointer',
                      color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                    }}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>

            {routingNext === 'detailing' && (
              <label style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                borderRadius: 10, marginBottom: 14, cursor: 'pointer',
                border: routingSoldDelivery ? '2px solid #1a1a1a' : '1px solid var(--border)',
                background: routingSoldDelivery ? '#fafaf8' : '#fff',
              }}>
                <input
                  type="checkbox"
                  checked={routingSoldDelivery}
                  onChange={e => setRoutingSoldDelivery(e.target.checked)}
                  style={{ width: 18, height: 18 }}
                />
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600 }}>Sold — delivery prep</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    Adds delivery checklist (floor mats, gift box, air freshener, full clean)
                  </p>
                </div>
              </label>
            )}

            {routingNext !== 'completed' && (
              <>
                {routingTemplates.length > 0 && (
                  <>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      Checklists
                      <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6 }}>
                        (adds the template&apos;s items to the task list)
                      </span>
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                      {routingTemplates.map(tpl => {
                        const active = routingSelectedTemplateIds.includes(tpl.id)
                        return (
                          <label
                            key={tpl.id}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                              borderRadius: 10, cursor: 'pointer',
                              border: active ? '2px solid #1a1a1a' : '1px solid var(--border)',
                              background: active ? '#fafaf8' : '#fff',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={active}
                              onChange={() => toggleRoutingTemplate(tpl)}
                              style={{ width: 18, height: 18 }}
                            />
                            <div style={{ minWidth: 0 }}>
                              <p style={{ fontSize: 14, fontWeight: 600 }}>
                                {tpl.name}
                                {tpl.isDefault && (
                                  <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6, fontSize: 12 }}>
                                    (default)
                                  </span>
                                )}
                              </p>
                              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                                {tpl.items.length} item{tpl.items.length === 1 ? '' : 's'}
                              </p>
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  </>
                )}
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Tasks for {routingNext}
                  <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6 }}>
                    (leave empty to use default checklist)
                  </span>
                </p>
                <div style={{ display: 'flex', gap: 8, marginBottom: routingTasks.length > 0 ? 8 : 12 }}>
                  <input
                    value={routingNewTask}
                    onChange={e => setRoutingNewTask(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        const t = routingNewTask.trim()
                        if (t) { setRoutingTasks([...routingTasks, t]); setRoutingNewTask('') }
                      }
                    }}
                    placeholder="Add a task..."
                    style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const t = routingNewTask.trim()
                      if (t) { setRoutingTasks([...routingTasks, t]); setRoutingNewTask('') }
                    }}
                    style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Add
                  </button>
                </div>
                {routingTasks.length > 0 && (
                  <div style={{ border: '1px solid var(--border)', borderRadius: 8, marginBottom: 12, overflow: 'hidden' }}>
                    {routingTasks.map((t, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '8px 12px', fontSize: 13,
                        borderBottom: i < routingTasks.length - 1 ? '1px solid var(--border)' : 'none',
                      }}>
                        <span>{t}</span>
                        <button
                          type="button"
                          onClick={() => setRoutingTasks(routingTasks.filter((_, j) => j !== i))}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16 }}
                        >×</button>
                      </div>
                    ))}
                  </div>
                )}

                {routingNext === 'mechanic' && (
                  <>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Estimated hours (optional)</p>
                    <input
                      type="number" step="0.5" min="0"
                      value={routingEstHours}
                      onChange={e => setRoutingEstHours(e.target.value)}
                      placeholder="e.g. 4"
                      style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, marginBottom: 12 }}
                    />

                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Assign mechanic (optional)</p>
                    <div style={{ display: 'grid', gridTemplateColumns: mechanics.length > 1 ? '1fr 1fr' : '1fr', gap: 8, marginBottom: 12 }}>
                      {mechanics.map(m => {
                        const active = routingAssigneeId === m.id
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => setRoutingAssigneeId(active ? '' : m.id)}
                            style={{
                              padding: '10px 14px', borderRadius: 10,
                              border: active ? '2px solid #1a1a1a' : '1px solid var(--border)',
                              background: active ? '#fafaf8' : '#fff',
                              fontSize: 14, fontWeight: 600, cursor: 'pointer',
                              color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                            }}
                          >
                            {m.name}
                          </button>
                        )
                      })}
                      {mechanics.length === 0 && (
                        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No users with the mechanic role yet.</p>
                      )}
                    </div>

                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      Scope label (optional)
                      <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6 }}>
                        e.g. Engine, Brakes — helps when two mechanics split one car
                      </span>
                    </p>
                    <input
                      value={routingScopeName}
                      onChange={e => setRoutingScopeName(e.target.value)}
                      placeholder="e.g. Engine work"
                      style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, marginBottom: 12 }}
                    />
                  </>
                )}
              </>
            )}

            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Reason (optional)</p>
            <textarea
              value={routingReason}
              onChange={e => setRoutingReason(e.target.value)}
              rows={2}
              placeholder="e.g. Quick fix, no detailing needed"
              style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, marginBottom: 16, resize: 'vertical' }}
            />

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setRoutingVehicle(null)}
                disabled={routingSaving}
                style={{ flex: 1, padding: 12, borderRadius: 10, border: '1px solid var(--border)', background: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                disabled={routingSaving}
                onClick={async () => {
                  if (!routingVehicle) return
                  setRoutingSaving(true)
                  const fullChecklist = (routingVehicle.lastCompleted?.checklist || [])
                  // Compute carried added tasks by ORIGINAL index against the full checklist (Set keys are full-checklist indices)
                  const carriedNames: string[] = []
                  fullChecklist.forEach((t, i) => {
                    if (t.addedByMechanic && t.approved !== 'declined' && routingCarry.has(i)) {
                      carriedNames.push(t.item)
                    }
                  })
                  const mergedTasks = [...carriedNames, ...routingTasks]
                  // Enrich task names that came from a selected template with their
                  // type/fields so structured items (tire PSI, brake pads, fluids…)
                  // stay rich in the new stage instead of collapsing to plain checkboxes.
                  const richByName = new Map<string, { type?: string; fields?: unknown }>()
                  for (const tpl of routingTemplates) {
                    if (!routingSelectedTemplateIds.includes(tpl.id)) continue
                    for (const it of tpl.items) {
                      if (it.type || it.fields != null) {
                        richByName.set(it.item, {
                          ...(it.type ? { type: it.type } : {}),
                          ...(it.fields != null ? { fields: it.fields } : {}),
                        })
                      }
                    }
                  }
                  const tasksPayload = mergedTasks.map(name => {
                    const rich = richByName.get(name)
                    return rich ? { item: name, ...rich } : name
                  })
                  // Which install part IDs are still in the task list (admin may have un-checked some)
                  const installPartIds = routingTasks
                    .map(t => routingInstallMap[t])
                    .filter((id): id is string => !!id)
                  // Indices of addedByMechanic tasks the admin approved (kept in carry); others get auto-declined
                  const approvedAddedIndices: number[] = []
                  fullChecklist.forEach((t, i) => {
                    if (t.addedByMechanic && t.approved !== 'declined' && routingCarry.has(i)) {
                      approvedAddedIndices.push(i)
                    }
                  })
                  await fetch(`/api/vehicles/${routingVehicle.id}/route-stage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      nextStage: routingNext,
                      reason: routingReason || null,
                      tasks: tasksPayload,
                      estimatedHours: routingEstHours || null,
                      assigneeId: routingNext === 'mechanic' ? (routingAssigneeId || null) : null,
                      scopeName: routingNext === 'mechanic' ? (routingScopeName.trim() || null) : null,
                      soldDelivery: routingNext === 'detailing' ? routingSoldDelivery : false,
                      installPartIds,
                      previousStageId: routingVehicle.lastCompleted?.id || null,
                      approvedAddedIndices,
                    }),
                  })
                  const res = await fetch('/api/vehicles')
                  const data = await res.json()
                  setVehicles(data.vehicles || [])
                  setRoutingSaving(false)
                  setRoutingVehicle(null)
                }}
                style={{
                  flex: 1, padding: 12, borderRadius: 10, border: 'none',
                  background: '#1a1a1a', color: '#dffd6e', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  opacity: routingSaving ? 0.5 : 1,
                }}
              >
                {routingSaving ? 'Routing...' : 'Confirm Route'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vehicle Detail Modal */}
      {selectedVehicleId && (
        <div className="mm-backdrop" onClick={closeModal}>
          <div
            onClick={e => e.stopPropagation()}
            className="mm-panel"
            style={{ maxWidth: 600 }}
          >
            {modalLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 20px' }}>
                <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'transparent' }} />
              </div>
            ) : modalData?.vehicle ? (() => {
              const v = modalData.vehicle
              const currentStage = getCurrentStage()
              const stageHue = currentStage ? (STAGE_HUE[currentStage.stage]?.dot ?? '#9a9a96') : '#9a9a96'
              const vehicleDesc = `${v.year ?? ''} ${v.make} ${v.model}`.trim()
              const doneCount = modalChecklist.filter(c => c.done).length
              const allDone = modalChecklist.length > 0 && modalChecklist.every(c => c.done)
              const canAdvance = currentStage && (isAdmin || (userId && currentStage.assignee?.id === userId))
              const elapsed = currentStage ? (Date.now() - new Date(currentStage.startedAt).getTime()) / 1000 - currentStage.totalBlockedSeconds : 0
              const hours = Math.floor(elapsed / 3600)
              const timeStr = hours < 1 ? `${Math.floor(elapsed / 60)}m` : hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d ${hours % 24}h`

              return (
                <>
                  {/* Stage accent — ties the modal to its pipeline colour */}
                  <div aria-hidden style={{ height: 3, flexShrink: 0, background: `linear-gradient(90deg, ${stageHue}, ${stageHue}66 55%, transparent)` }} />
                  <div style={{ flex: 1, overflow: 'auto', padding: '22px 24px 0' }}>
                  {/* Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 18 }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.25 }}>
                        {vehicleDesc}
                      </p>
                      <div style={{ display: 'flex', gap: 7, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                          fontSize: 10.5, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '-0.01em',
                          background: 'var(--bg-primary)', border: '1px solid var(--border)', padding: '2px 7px', borderRadius: 6,
                        }}>#{v.stockNumber}</span>
                        {v.color && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{v.color}</span>}
                        {currentStage && (() => {
                          // Match the card top-right badge logic so the modal shows the same display state.
                          const displayStatus =
                            currentStage.awaitingParts ? 'awaiting parts'
                            : (currentStage.stage === 'mechanic' && currentStage.autoPaused) ? 'auto paused'
                            : (currentStage.status === 'in_progress' && !currentStage.timerStartedAt && currentStage.pauseReason) ? 'paused'
                            : currentStage.status.replace('_', ' ')
                          return (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 6,
                              fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 100,
                              background: '#dffd6e40', color: '#4a5300', letterSpacing: '-0.005em',
                            }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#b9d94a' }} />
                              {STAGE_LABELS[currentStage.stage as keyof typeof STAGE_LABELS] || currentStage.stage}
                              {currentStage.status !== 'done' ? ` · ${displayStatus}` : ''}
                            </span>
                          )
                        })()}
                      </div>
                      <Link
                        href={`/vehicles/${v.id}`}
                        style={{ fontSize: 12, fontWeight: 500, color: '#2563eb', textDecoration: 'none', marginTop: 8, display: 'inline-block' }}
                      >
                        View full details →
                      </Link>
                    </div>
                    <button className="mm-close" onClick={closeModal} aria-label="Close">&times;</button>
                  </div>

                  {/* Stat tiles */}
                  <div style={{ display: 'grid', gridTemplateColumns: currentStage ? '1fr 1fr' : '1fr', gap: 10, marginBottom: 16 }}>
                    <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 12px' }}>
                      <p className="mm-label" style={{ marginBottom: 6 }}>Assigned to</p>
                      {isAdmin ? (
                        <select
                          value={currentStage?.assignee?.id || ''}
                          disabled={assigningUser}
                          onChange={async (e) => {
                            const newId = e.target.value || null
                            if (!currentStage?.id) return
                            setAssigningUser(true)
                            try {
                              await fetch(`/api/stages/${currentStage.id}`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ assigneeId: newId }),
                              })
                              // Refresh modal + board
                              openModal(v.id)
                              const res = await fetch('/api/vehicles')
                              const d = await res.json()
                              setVehicles(d.vehicles || [])
                            } catch { /* ignore */ }
                            setAssigningUser(false)
                          }}
                          style={{
                            width: '100%', padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)',
                            fontSize: 13.5, fontWeight: 600, background: 'var(--bg-card)', cursor: 'pointer',
                            color: currentStage?.assignee ? 'var(--text-primary)' : '#d97706',
                          }}
                        >
                          <option value="">Unassigned</option>
                          {teamMembers.map(m => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                          ))}
                        </select>
                      ) : (
                        <p style={{ fontSize: 13.5, fontWeight: 600, color: currentStage?.assignee ? 'var(--text-primary)' : '#d97706' }}>
                          {currentStage?.assignee?.name || 'Unassigned'}
                        </p>
                      )}
                    </div>
                    {currentStage && (
                      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 12px' }}>
                        <p className="mm-label" style={{ marginBottom: 6 }}>Time in stage</p>
                        <p style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{timeStr}</p>
                      </div>
                    )}
                  </div>

                  {/* Progress */}
                  {modalChecklist.length > 0 && (
                    <div style={{ marginBottom: 18 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Checklist progress</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{doneCount}/{modalChecklist.length}</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 100, background: 'var(--border-light)', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', borderRadius: 100,
                          background: allDone ? '#16a34a' : 'var(--text-primary)',
                          width: `${(doneCount / modalChecklist.length) * 100}%`,
                          transition: 'width 0.25s',
                        }} />
                      </div>
                    </div>
                  )}

                  {/* Tabs: Tasks / Parts */}
                  <div className="mm-tabs">
                    <button className={modalTab === 'tasks' ? 'active' : ''} onClick={() => setModalTab('tasks')}>
                      Tasks <span className="cnt">{modalChecklist.length}</span>
                    </button>
                    <button className={modalTab === 'parts' ? 'active' : ''} onClick={() => setModalTab('parts')}>
                      Parts <span className="cnt">{modalParts.length}</span>
                    </button>
                  </div>

                  {/* Checklist */}
                  <div style={{ display: modalTab === 'tasks' ? 'block' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <p className="mm-label">Tasks</p>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                        {doneCount}/{modalChecklist.length}{modalSaving ? ' · Saving…' : ''}
                      </span>
                    </div>
                    {modalChecklist.length === 0 ? (
                      <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No checklist items</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {modalChecklist.map((item, i) => (
                          <div
                            key={i}
                            onClick={() => toggleChecklistItem(i)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 11, padding: '9px 11px',
                              background: item.done ? '#f2fbf5' : 'var(--bg-card)', borderRadius: 10,
                              cursor: 'pointer', border: '1px solid', borderColor: item.done ? '#c7ecd3' : 'var(--border)',
                              transition: 'all 0.15s',
                            }}
                          >
                            <div style={{
                              width: 20, height: 20, borderRadius: 6, border: '2px solid',
                              borderColor: item.done ? '#16a34a' : '#d1d5db',
                              background: item.done ? '#16a34a' : 'transparent',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              flexShrink: 0, transition: 'all 0.15s',
                            }}>
                              {item.done && (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              )}
                            </div>
                            <span style={{
                              flex: 1, minWidth: 0,
                              fontSize: 14, color: item.done ? 'var(--text-muted)' : 'var(--text-primary)',
                              textDecoration: item.done ? 'line-through' : 'none',
                            }}>
                              {item.item}
                            </span>
                            {/* Effective-owner chip on EVERY task so it's never ambiguous who's on it.
                                Explicit assignee → them; original task → car owner; added+unassigned → needs admin. */}
                            {currentStage?.stage === 'mechanic' && (() => {
                              const owner = taskOwner(item, currentStage?.assignee)
                              if (owner) return (
                                <span title={owner.name} style={{
                                  flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5,
                                  padding: '2px 8px 2px 2px', borderRadius: 100, background: 'var(--bg-subtle, #f1f3f5)',
                                }}>
                                  <span style={{
                                    width: 18, height: 18, borderRadius: '50%', background: chipColor(owner.id), color: '#fff',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800,
                                  }}>{initialsOf(owner.name)}</span>
                                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>{owner.name.split(' ')[0]}</span>
                                </span>
                              )
                              return (
                                <span style={{
                                  flexShrink: 0, fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 100,
                                  background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca',
                                  textTransform: 'uppercase', letterSpacing: '0.03em', whiteSpace: 'nowrap',
                                }}>Needs assign</span>
                              )
                            })()}
                            {/* Admin: hand this single task to a mechanic (mechanic stage only) */}
                            {isAdmin && currentStage?.stage === 'mechanic' && mechanics.length > 0 && (
                              <select
                                value={item.assigneeId || ''}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => { e.stopPropagation(); assignChecklistItem(i, e.target.value || null) }}
                                style={{
                                  flexShrink: 0, maxWidth: 128, padding: '4px 6px', borderRadius: 8,
                                  border: '1px solid #e5e5e5', fontSize: 12, background: '#fff',
                                  color: item.assigneeId ? 'var(--text-primary)' : 'var(--text-muted)', cursor: 'pointer',
                                }}
                              >
                                <option value="">Assign…</option>
                                {mechanics.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                              </select>
                            )}
                            {/* Admin remove — small × on the right of each item */}
                            {isAdmin && (
                              <button
                                type="button"
                                title="Remove this task"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  if (confirm(`Remove "${item.item}" from this checklist?`)) {
                                    removeChecklistItem(i)
                                  }
                                }}
                                style={{
                                  flexShrink: 0,
                                  width: 24, height: 24, borderRadius: 6,
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
                      </div>
                    )}

                    {/* Admin: + Add Task — inline form right under the checklist. */}
                    {isAdmin && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault()
                          const input = e.currentTarget.elements.namedItem('newTask') as HTMLInputElement
                          if (!input.value.trim()) return
                          addChecklistItem(input.value)
                          input.value = ''
                        }}
                        style={{ display: 'flex', gap: 8, marginTop: 10 }}
                      >
                        <input
                          name="newTask"
                          placeholder="+ Add task..."
                          style={{
                            flex: 1, padding: '9px 12px', borderRadius: 10,
                            border: '1px solid var(--border)', fontSize: 13, background: 'var(--bg-card)',
                            outline: 'none',
                          }}
                        />
                        <button
                          type="submit"
                          style={{
                            padding: '9px 16px', borderRadius: 10, border: 'none',
                            background: '#1a1a1a', color: '#dffd6e',
                            fontSize: 13, fontWeight: 700, cursor: 'pointer',
                            whiteSpace: 'nowrap', minHeight: 'auto',
                          }}
                        >Add</button>
                      </form>
                    )}
                  </div>

                  {/* Parts Section — Full Interactive */}
                  <div style={{ display: modalTab === 'parts' ? 'block' : 'none' }}>
                  <ModalPartsSection vehicleId={v.id} parts={modalParts} isAdmin={isAdmin} onPartsChange={() => {
                    fetch(`/api/parts?vehicleId=${v.id}`).then(r => r.json()).then(d => setModalParts(d.parts || [])).catch(() => {})
                    // Refresh vehicles list too for card labels
                    fetch('/api/vehicles').then(r => r.json()).then(d => setVehicles(d.vehicles || [])).catch(() => {})
                  }} />
                  </div>

                  {/* Breathing room before the sticky footer so the parts area
                      doesn't crash into the action buttons below. */}
                  <div style={{ height: 24 }} />

                  </div>
                  {/* Advance Stage Button — sticky footer */}
                  <div style={{ padding: '16px 24px 22px', borderTop: '1px solid var(--border)', background: 'var(--bg-card)', flexShrink: 0 }}>
                    <button
                      onClick={handleAdvanceStage}
                      disabled={!allDone || advancing}
                      style={{
                        width: '100%', padding: '13px 0', borderRadius: 12,
                        border: allDone ? 'none' : '1px solid var(--border)',
                        background: allDone ? '#dffd6e' : 'var(--bg-primary)',
                        color: allDone ? '#1a1a1a' : 'var(--text-muted)',
                        fontSize: 14.5, fontWeight: 700, letterSpacing: '-0.01em',
                        cursor: !allDone || advancing ? 'default' : 'pointer',
                        opacity: advancing ? 0.6 : 1,
                        boxShadow: allDone ? '0 1px 2px rgba(24,24,27,.06), 0 8px 18px -8px rgba(185,217,74,.6)' : 'none',
                        transition: 'all 0.15s',
                      }}
                    >
                      {advancing ? 'Advancing…' : allDone ? 'Advance Stage' : 'Complete all tasks to advance'}
                    </button>

                    {/* Admin actions */}
                    {isAdmin && currentStage && (() => {
                      const SKIP_STAGES = ['mechanic', 'detailing', 'content', 'publish', 'completed'] as const
                      const currentIdx = SKIP_STAGES.indexOf(currentStage.stage as typeof SKIP_STAGES[number])
                      const laterStages = SKIP_STAGES.slice(currentIdx + 1)
                      // Only show skip if there's a stage to skip to beyond the next one
                      const hasSkipTargets = laterStages.length > 1

                      return (
                        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {hasSkipTargets && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <select
                                  id="skip-stage-select"
                                  defaultValue=""
                                  disabled={skipping}
                                  style={{
                                    flex: 1, padding: '10px 12px', borderRadius: 10, border: '1px solid #c084fc',
                                    fontSize: 13, fontWeight: 600, background: '#faf5ff', color: '#7c3aed',
                                    cursor: 'pointer', outline: 'none',
                                  }}
                                >
                                  <option value="" disabled>Skip to stage...</option>
                                  {laterStages.map(s => (
                                    <option key={s} value={s}>
                                      {STAGE_LABELS[s as keyof typeof STAGE_LABELS]}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  onClick={() => {
                                    const sel = document.getElementById('skip-stage-select') as HTMLSelectElement
                                    const target = sel.value
                                    if (!target) return
                                    setMoveModal({
                                      vehicleId: v.id,
                                      fromStage: currentStage?.stage || 'mechanic',
                                      toStage: target,
                                      tasks: [],
                                      assigneeId: null,
                                      teamMembers: teamMembers,
                                      returnAfterComplete: false,
                                      saving: false,
                                      templates: [],
                                      selectedTemplateId: '',
                                    })
                                    closeModal()
                                  }}
                                  style={{
                                    padding: '10px 18px', borderRadius: 10, border: 'none',
                                    background: '#7c3aed', color: '#fff',
                                    fontSize: 13, fontWeight: 700, cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  Skip
                                </button>
                              </div>
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: 10 }}>
                            <button
                              onClick={() => {
                                setExternalModal({
                                  vehicleId: v.id,
                                  stockNumber: v.stockNumber,
                                  year: v.year,
                                  make: v.make,
                                  model: v.model,
                                  color: v.color,
                                  stageId: currentStage?.id || null,
                                })
                                closeModal()
                              }}
                              style={{
                                flex: 1, padding: '10px 0', borderRadius: 10,
                                border: '1px solid #f59e0b', background: '#fffbeb',
                                fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#b45309',
                              }}
                            >
                              Send to External Repair
                            </button>
                            <button
                              onClick={() => {
                                setDeleteConfirm({
                                  id: v.id,
                                  stockNumber: v.stockNumber,
                                  desc: vehicleDesc,
                                })
                                closeModal()
                              }}
                              style={{
                                flex: 1, padding: '10px 0', borderRadius: 10,
                                border: '1px solid #fca5a5', background: '#fef2f2',
                                fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#dc2626',
                              }}
                            >
                              Delete Vehicle
                            </button>
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                </>
              )
            })() : (
              <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>Vehicle not found</p>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1200,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }} onClick={() => setDeleteConfirm(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 400,
            boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
          }}>
            <p style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, color: '#dc2626' }}>Delete Vehicle</p>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 8 }}>
              Are you sure you want to delete <strong>#{deleteConfirm.stockNumber}</strong> — {deleteConfirm.desc}?
            </p>
            <p style={{ fontSize: 13, color: '#dc2626', marginBottom: 20, padding: '10px 14px', background: '#fef2f2', borderRadius: 10, border: '1px solid #fecaca' }}>
              This will permanently remove the vehicle and all its stage history. This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setDeleteConfirm(null)}
                style={{
                  flex: 1, padding: '12px 0', borderRadius: 10, border: '1px solid #e2e5ea',
                  background: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: 'var(--text-secondary)',
                }}
              >Cancel</button>
              <button
                disabled={deleting}
                onClick={async () => {
                  setDeleting(true)
                  try {
                    await fetch(`/api/vehicles/${deleteConfirm.id}`, { method: 'DELETE' })
                    setDeleteConfirm(null)
                    const res = await fetch('/api/vehicles')
                    const data = await res.json()
                    setVehicles(data.vehicles || [])
                  } catch { /* ignore */ }
                  setDeleting(false)
                }}
                style={{
                  flex: 1, padding: '12px 0', borderRadius: 10, border: 'none',
                  background: deleting ? '#e5e5e5' : '#dc2626', color: '#fff',
                  fontSize: 14, fontWeight: 700, cursor: deleting ? 'default' : 'pointer',
                  opacity: deleting ? 0.6 : 1,
                }}
              >{deleting ? 'Deleting...' : 'Delete Vehicle'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Send to External Repair Modal */}
      {externalModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1200,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }} onClick={() => { setExternalModal(null); setExternalPending(false); setExternalVendor(null); setExternalAtDealership(false) }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 480,
            boxShadow: '0 20px 60px rgba(0,0,0,0.15)', maxHeight: '90vh', overflowY: 'auto',
          }}>
            <p style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Send to External Repair</p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
              #{externalModal.stockNumber} — {`${externalModal.year ?? ''} ${externalModal.make} ${externalModal.model}`.trim()}
              {externalModal.color ? ` · ${externalModal.color}` : ''}
            </p>

            <form onSubmit={async (e) => {
              e.preventDefault()
              setExternalSubmitting(true)
              const form = new FormData(e.currentTarget)
              if (!externalVendor) { setExternalSubmitting(false); return }
              try {
                const res = await fetch('/api/external', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    stockNumber: externalModal.stockNumber,
                    year: externalModal.year,
                    make: externalModal.make,
                    model: externalModal.model,
                    color: externalModal.color || null,
                    vendorId: externalVendor.id,
                    shopName: externalVendor.name,
                    shopPhone: externalVendor.phone,
                    atDealership: externalAtDealership,
                    repairDescription: form.get('repairDescription'),
                    estimatedDays: externalPending ? null : (form.get('estimatedDays') ? Number(form.get('estimatedDays')) : null),
                    sentDate: externalPending ? null : form.get('sentDate'),
                    notes: form.get('notes') || null,
                    status: externalPending ? 'pending' : 'sent',
                  }),
                })
                if (res.ok) {
                  // Mark current stage as done and move vehicle off the board
                  if (externalModal.stageId) {
                    await fetch(`/api/stages/${externalModal.stageId}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ status: 'done' }),
                    })
                  }
                  // Set vehicle status to 'external' so it's removed from recon board
                  await fetch(`/api/vehicles/${externalModal.vehicleId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'external' }),
                  })
                  setExternalModal(null); setExternalPending(false); setExternalVendor(null); setExternalAtDealership(false);
                  const vRes = await fetch('/api/vehicles')
                  const vData = await vRes.json()
                  setVehicles(vData.vehicles || [])
                }
              } catch { /* ignore */ }
              setExternalSubmitting(false)
            }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Vendor *</label>
                <VendorSearch
                  onSelect={v => setExternalVendor(v)}
                  placeholder="Search vendors or type to add new..."
                />
                {externalVendor && (
                  <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>
                      <strong>{externalVendor.name}</strong>
                      {externalVendor.phone && <span style={{ marginLeft: 8, color: 'var(--text-muted)' }}>· {externalVendor.phone}</span>}
                    </span>
                    <button type="button" onClick={() => setExternalVendor(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#16a34a', fontSize: 13, fontWeight: 600 }}>Clear</button>
                  </div>
                )}
              </div>
              <label style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', borderRadius: 10,
                background: externalAtDealership ? '#dbeafe' : '#f9fafb',
                border: `1px solid ${externalAtDealership ? '#93c5fd' : '#e2e5ea'}`,
                cursor: 'pointer', fontSize: 14,
              }}>
                <input
                  type="checkbox"
                  checked={externalAtDealership}
                  onChange={e => setExternalAtDealership(e.target.checked)}
                  style={{ width: 18, height: 18, cursor: 'pointer' }}
                />
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Vendor working at our dealership</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    Vehicle stays on-site — vendor comes to us.
                  </div>
                </div>
              </label>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>What&apos;s Being Done *</label>
                <textarea name="repairDescription" required style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e2e5ea', fontSize: 14, background: '#f9fafb', outline: 'none', minHeight: 70, resize: 'vertical' }} placeholder="Paint front bumper, fix dent on driver door..." />
              </div>
              <label style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', borderRadius: 10,
                background: externalPending ? '#fef3c7' : '#f9fafb',
                border: `1px solid ${externalPending ? '#fcd34d' : '#e2e5ea'}`,
                cursor: 'pointer', fontSize: 14,
              }}>
                <input
                  type="checkbox"
                  checked={externalPending}
                  onChange={e => setExternalPending(e.target.checked)}
                  style={{ width: 18, height: 18, cursor: 'pointer' }}
                />
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Not scheduled yet</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    Track this vehicle as pending — fill in the date and estimated days later.
                  </div>
                </div>
              </label>
              {!externalPending && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Date Sent *</label>
                    <input name="sentDate" type="date" required={!externalPending} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e2e5ea', fontSize: 14, background: '#f9fafb', outline: 'none' }} defaultValue={new Date().toISOString().split('T')[0]} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Estimated Days</label>
                    <input name="estimatedDays" type="number" style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e2e5ea', fontSize: 14, background: '#f9fafb', outline: 'none' }} placeholder="e.g. 5" />
                  </div>
                </div>
              )}
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Notes</label>
                <textarea name="notes" style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e2e5ea', fontSize: 14, background: '#f9fafb', outline: 'none', minHeight: 60, resize: 'vertical' }} placeholder="Any additional notes..." />
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button type="button" onClick={() => { setExternalModal(null); setExternalPending(false); setExternalVendor(null); setExternalAtDealership(false) }} style={{
                  flex: 1, padding: '12px 0', borderRadius: 10, border: '1px solid #e2e5ea',
                  background: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: 'var(--text-secondary)',
                }}>Cancel</button>
                <button type="submit" disabled={externalSubmitting} style={{
                  flex: 1, padding: '12px 0', borderRadius: 10, border: 'none',
                  background: externalSubmitting ? '#e5e5e5' : '#f59e0b', color: '#fff',
                  fontSize: 14, fontWeight: 700, cursor: externalSubmitting ? 'default' : 'pointer',
                  opacity: externalSubmitting ? 0.6 : 1,
                }}>{externalSubmitting ? 'Sending...' : 'Send to External'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Move Stage Modal */}
      {moveModal && (
        <div
          onClick={() => !moveModal.saving && setMoveModal(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1100, padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 20, width: '100%', maxWidth: 440,
              maxHeight: '80vh', overflow: 'auto', padding: 24,
              boxShadow: '0 25px 60px rgba(0,0,0,0.2)',
            }}
          >
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
              Move to {STAGE_LABELS[moveModal.toStage as keyof typeof STAGE_LABELS]}
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
              Select tasks and assignee for this stage
            </p>

            {/* Template picker */}
            {moveModal.templates.length > 0 && (
              <>
                <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block' }}>
                  Checklist Template
                </label>
                <select
                  value={moveModal.selectedTemplateId}
                  onChange={(e) => {
                    const tplId = e.target.value
                    setMoveModal(prev => {
                      if (!prev) return null
                      const tpl = prev.templates.find(t => t.id === tplId)
                      const tasks = tpl
                        ? tpl.items.map(it => ({
                            item: it.item, selected: true,
                            ...(it.type ? { type: it.type } : {}),
                            ...(it.fields ? { fields: it.fields } : {}),
                          }))
                        : []
                      return { ...prev, selectedTemplateId: tplId, tasks }
                    })
                  }}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e5e5e5',
                    fontSize: 14, marginBottom: 20, background: '#f8f8f6',
                  }}
                >
                  <option value="">— Start blank (no template) —</option>
                  {moveModal.templates.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name}{t.isDefault ? ' (default)' : ''} — {t.items.length} item{t.items.length === 1 ? '' : 's'}
                    </option>
                  ))}
                </select>
              </>
            )}

            {/* Assignee */}
            <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block' }}>Assignee</label>
            <select
              value={moveModal.assigneeId || ''}
              onChange={(e) => setMoveModal(prev => prev ? { ...prev, assigneeId: e.target.value || null } : null)}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e5e5e5',
                fontSize: 14, marginBottom: 20, background: '#f8f8f6',
              }}
            >
              <option value="">Unassigned</option>
              {moveModal.teamMembers.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>

            {/* Tasks */}
            <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: 'block' }}>
              Tasks ({moveModal.tasks.filter(t => t.selected).length})
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
              {moveModal.tasks.map((task, i) => (
                <div
                  key={i}
                  onClick={() => {
                    setMoveModal(prev => {
                      if (!prev) return null
                      const tasks = [...prev.tasks]
                      tasks[i] = { ...tasks[i], selected: !tasks[i].selected }
                      return { ...prev, tasks }
                    })
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                    background: task.selected ? '#f0fdf4' : '#f8f8f6', borderRadius: 10,
                    cursor: 'pointer', border: '1px solid', borderColor: task.selected ? '#bbf7d0' : '#e5e5e5',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{
                    width: 22, height: 22, borderRadius: 6, border: '2px solid',
                    borderColor: task.selected ? '#22c55e' : '#d1d5db',
                    background: task.selected ? '#22c55e' : '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, transition: 'all 0.15s',
                  }}>
                    {task.selected && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                  <span style={{ fontSize: 14 }}>{task.item}</span>
                </div>
              ))}
            </div>

            {/* Add custom task */}
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const input = (e.currentTarget.elements.namedItem('newTask') as HTMLInputElement)
                const val = input.value.trim()
                if (!val) return
                setMoveModal(prev => {
                  if (!prev) return null
                  return { ...prev, tasks: [...prev.tasks, { item: val, selected: true }] }
                })
                input.value = ''
              }}
              style={{ display: 'flex', gap: 8, marginBottom: 20 }}
            >
              <input
                name="newTask"
                placeholder="Add custom task..."
                style={{
                  flex: 1, padding: '10px 12px', borderRadius: 10, border: '1px solid #e5e5e5',
                  fontSize: 14, background: '#f8f8f6', outline: 'none',
                }}
              />
              <button
                type="submit"
                style={{
                  padding: '10px 16px', borderRadius: 10, border: 'none',
                  background: '#1a1a1a', color: '#fff', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                Add
              </button>
            </form>

            {/* Return after complete option (for skipping) */}
            {moveModal.fromStage !== moveModal.toStage && (
              <div style={{ 
                marginBottom: 20, 
                padding: '16px', 
                background: '#f8f9fa', 
                borderRadius: 12, 
                border: '1px solid #e5e7eb' 
              }}>
                <label style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  cursor: 'pointer',
                  fontSize: 14
                }}>
                  <input
                    type="checkbox"
                    checked={moveModal.returnAfterComplete}
                    onChange={(e) => setMoveModal(prev => prev ? { ...prev, returnAfterComplete: e.target.checked } : null)}
                    style={{ width: 18, height: 18, marginTop: 2, cursor: 'pointer' }}
                  />
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>
                      Return to {STAGE_LABELS[moveModal.fromStage as keyof typeof STAGE_LABELS]} after {STAGE_LABELS[moveModal.toStage as keyof typeof STAGE_LABELS]} completes?
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                      {moveModal.tasks.filter(t => t.selected).length > 0 
                        ? `${moveModal.tasks.filter(t => t.selected).length} selected tasks will carry over`
                        : 'No tasks to carry over'
                      }
                    </div>
                  </div>
                </label>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setMoveModal(null)}
                disabled={moveModal.saving}
                style={{
                  flex: 1, padding: '12px 0', borderRadius: 12, border: '1px solid #e5e5e5',
                  background: '#fff', color: '#555', fontSize: 14, fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleMoveConfirm}
                disabled={moveModal.saving}
                style={{
                  flex: 1, padding: '12px 0', borderRadius: 12, border: 'none',
                  background: '#dffd6e', color: '#1a1a1a', fontSize: 14, fontWeight: 700,
                  cursor: moveModal.saving ? 'default' : 'pointer',
                  opacity: moveModal.saving ? 0.6 : 1,
                }}
              >
                {moveModal.saving ? 'Moving...' : 'Move Vehicle'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Inline parts management for modals (recon board + mechanic schedule)
function ModalPartsSection({ vehicleId, parts, isAdmin, onPartsChange }: {
  vehicleId: string; parts: any[]; isAdmin: boolean; onPartsChange: () => void
}) {
  const [addingUrlId, setAddingUrlId] = useState<string | null>(null)
  const [urlInput, setUrlInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [orderModalPart, setOrderModalPart] = useState<{ id: string; name: string } | null>(null)
  const [users, setUsers] = useState<{ id: string; name: string }[]>([])

  // Used by the per-part "assign to find" dropdown on rows that are still
  // in `requested` state.  Loaded once when the section first mounts.
  useEffect(() => {
    fetch('/api/users').then(r => r.json()).then((d) => {
      setUsers((d.users || d).filter((u: { isActive?: boolean }) => u.isActive !== false).map((u: { id: string; name: string }) => ({ id: u.id, name: u.name })))
    }).catch(() => {})
  }, [])

  const statusLabels: Record<string, string> = {
    requested: 'Requested', sourced: 'Pending Approval', ready_to_order: 'Ready to Order',
    ordered: 'Ordered', received: 'Received'
  }
  const statusColors: Record<string, { bg: string; color: string; border: string }> = {
    requested: { bg: '#fef2f2', color: '#ef4444', border: '#fecaca' },
    sourced: { bg: '#fef9c3', color: '#a16207', border: '#fde047' },
    ready_to_order: { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
    ordered: { bg: '#fefce8', color: '#eab308', border: '#fde047' },
    received: { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' }
  }

  async function submitUrl(partId: string) {
    if (!urlInput.trim()) return
    setSaving(true)
    await fetch(`/api/parts/${partId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: urlInput })
    })
    setAddingUrlId(null); setUrlInput(''); setSaving(false); onPartsChange()
  }

  async function updatePart(partId: string, updates: Record<string, unknown>) {
    setSaving(true)
    await fetch(`/api/parts/${partId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    })
    setSaving(false); onPartsChange()
  }

  return (
    <div style={{ marginTop: 20 }}>
      <h4 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 10px' }}>
        Parts {parts.length > 0 ? `(${parts.length})` : ''}
      </h4>

      {parts.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>No parts requested</p>
      )}

      {parts.map(part => {
        const ss = statusColors[part.status] || statusColors.requested
        const hasActions =
          (part.status === 'requested' && !part.url) ||
          (part.status === 'sourced' && isAdmin) ||
          (part.status === 'ready_to_order' && isAdmin) ||
          (part.status === 'ordered' && isAdmin) ||
          ['sourced', 'ready_to_order', 'ordered', 'received'].includes(part.status) ||
          isAdmin
        return (
          <div key={part.id} style={{
            padding: '12px 14px', marginBottom: 10, borderRadius: 10,
            background: '#f8f9fa', border: '1px solid #e5e7eb',
            display: 'flex', flexDirection: 'column', gap: 4,
          }}>
            {/* Top row: name + status */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.35 }}>{part.name}</span>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 999,
                background: ss.bg, color: ss.color, border: `1px solid ${ss.border}`,
                textTransform: 'uppercase', letterSpacing: '0.04em',
                whiteSpace: 'nowrap', flexShrink: 0,
              }}>
                {statusLabels[part.status]}
              </span>
            </div>

            {/* Link */}
            {part.url && (
              <a href={part.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#2563eb', textDecoration: 'none', wordBreak: 'break-all' }}>
                {part.url.length > 60 ? part.url.slice(0, 60) + '...' : part.url}
              </a>
            )}

            {/* Assignee */}
            <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
              {part.status === 'requested' ? (
                <select
                  value={part.assignedTo?.id || ''}
                  onChange={e => updatePart(part.id, { assignedToId: e.target.value || null })}
                  style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 11, background: '#fff' }}
                >
                  <option value="">Unassigned (admin)</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              ) : (
                <span>{part.assignedTo ? `Assigned to ${part.assignedTo.name}` : 'Unassigned'}</span>
              )}
            </div>

            {/* Bottom row: action buttons (primary actions stretch, trash icon stays small on the right) */}
            {hasActions && (
              <div style={{
                display: 'flex', gap: 6, alignItems: 'center',
                marginTop: 4, paddingTop: 8, borderTop: '1px solid #e5e7eb',
              }}>
                {part.status === 'requested' && !part.url && (
                  <button onClick={() => { setAddingUrlId(part.id); setUrlInput('') }} style={partActionBtn('#2563eb', '#eff6ff')}>Add Link</button>
                )}
                {part.status === 'sourced' && isAdmin && (
                  <>
                    <button onClick={() => updatePart(part.id, { status: 'ready_to_order' })} disabled={saving} style={partActionBtn('#16a34a', '#f0fdf4')}>✓ Approve</button>
                    <button onClick={() => updatePart(part.id, { status: 'requested', url: null })} disabled={saving} style={partActionBtn('#ef4444', '#fef2f2')}>✗ Decline</button>
                  </>
                )}
                {part.status === 'ready_to_order' && isAdmin && (
                  <button onClick={() => setOrderModalPart({ id: part.id, name: part.name })} style={partActionBtn('#a16207', '#fefce8')}>Mark Ordered</button>
                )}
                {part.status === 'ordered' && isAdmin && (
                  <button onClick={() => updatePart(part.id, { status: 'received' })} disabled={saving} style={partActionBtn('#16a34a', '#f0fdf4')}>Mark Received</button>
                )}
                {['sourced', 'ready_to_order', 'ordered', 'received'].includes(part.status) && (
                  <button
                    onClick={async () => {
                      if (!confirm('Mark as wrong part and reset to Requested? The link will be cleared.')) return
                      await updatePart(part.id, { status: 'requested', url: null, tracking: null, expectedDelivery: null, orderImage: null })
                    }}
                    disabled={saving}
                    style={partActionBtn('#b45309', '#fffbeb')}
                  >
                    Wrong Part
                  </button>
                )}
                {isAdmin && (
                  <button
                    onClick={async () => { if (!confirm('Delete this part?')) return; setSaving(true); await fetch(`/api/parts/${part.id}`, { method: 'DELETE' }); setSaving(false); onPartsChange() }}
                    disabled={saving}
                    title="Delete part"
                    style={{
                      width: 32, height: 32, padding: 0, flexShrink: 0,
                      borderRadius: 8, border: '1px solid var(--border)',
                      background: '#fff', color: 'var(--text-muted)', cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
                      <path d="M10 11v6M14 11v6" />
                      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                    </svg>
                  </button>
                )}
              </div>
            )}
            {addingUrlId === part.id && (
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <input type="url" value={urlInput} onChange={e => setUrlInput(e.target.value)} placeholder="Paste link..." autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submitUrl(part.id) } }}
                  style={{ flex: 1, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 5, fontSize: 12 }} />
                <button onClick={() => setAddingUrlId(null)} style={{ padding: '6px 8px', borderRadius: 5, border: '1px solid var(--border)', background: '#fff', fontSize: 11, cursor: 'pointer' }}>Cancel</button>
                <button onClick={() => submitUrl(part.id)} disabled={saving || !urlInput.trim()} style={{ padding: '6px 8px', borderRadius: 5, border: 'none', background: '#1a1a1a', color: '#dffd6e', fontSize: 11, fontWeight: 600, cursor: 'pointer', opacity: saving || !urlInput.trim() ? 0.5 : 1 }}>Submit</button>
              </div>
            )}
          </div>
        )
      })}

      {/* Admin-only inline add (replaces the old "+ Add Part" / expanded form).
          Type a name, press Add, optional link + assignee appear, Save commits. */}
      {isAdmin && (
        <div style={{ marginTop: 10 }}>
          <AddPartInline vehicleId={vehicleId} onAdded={onPartsChange} />
        </div>
      )}

      {orderModalPart && (
        <OrderPartModal partId={orderModalPart.id} partName={orderModalPart.name} onClose={() => setOrderModalPart(null)} onComplete={onPartsChange} />
      )}
    </div>
  )
}
