'use client'

import { useEffect, useState, useCallback, useRef, Fragment } from 'react'
import ScheduleView from './ScheduleView'
import PlanView from './PlanView'
import OrderPartModal from '@/components/OrderPartModal'
import AddPartModal from '@/components/AddPartModal'
import AddPartInline from '@/components/AddPartInline'
import { fieldsForItem } from '@/lib/checklist-fields'

type ChecklistItem = {
  item: string; done: boolean; note: string
  type?: string
  data?: Record<string, unknown>
  fields?: { key: string; label: string }[]
  addedByMechanic?: boolean
  approved?: 'pending' | 'approved' | 'declined'
  estimatedHours?: number | null
  sourceItem?: string
  sourceSubField?: string
  // Per-task hand-off: when set, this task belongs to a specific mechanic
  // (vs the car's default owner). Name cached for display without a join.
  assigneeId?: string | null
  assigneeName?: string | null
}

// Status pills can store either a plain string (legacy) or { status, note } (new)
function getPillStatus(v: unknown): string | undefined {
  if (!v) return undefined
  if (typeof v === 'string') return v
  if (typeof v === 'object' && v && 'status' in v) return (v as { status?: string }).status
  return undefined
}
function getPillNote(v: unknown): string {
  if (v && typeof v === 'object' && 'note' in v) return (v as { note?: string }).note || ''
  return ''
}
const ISSUE_STATUSES = new Set(['issue', 'yes'])
function sentenceCase(s: string | null | undefined): string {
  if (!s) return ''
  const trimmed = s.trim()
  if (!trimmed) return ''
  const lower = trimmed.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}
type ReturnQueueEntry = { stage: string; fromStage?: string; reason?: string }

function ReturnBadge({ returnQueue }: { returnQueue?: ReturnQueueEntry[] }) {
  if (!returnQueue || returnQueue.length === 0) return null
  // Skip stale entries pointing at the mechanic stage (vehicle is already here).
  const next = returnQueue.find(r => r.stage !== 'mechanic')
  if (!next) return null
  const label = next.stage.charAt(0).toUpperCase() + next.stage.slice(1)
  return (
    <span title={next.reason || `Returns to ${label}`} style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100,
      background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d',
      display: 'inline-flex', alignItems: 'center', gap: 4,
    }}>
      Returns to {label}
    </span>
  )
}

type JobCard = {
  id: string
  vehicle: { id: string; stockNumber: string; year: number | null; make: string; model: string; color: string | null; returnQueue?: ReturnQueueEntry[] }
  scopeName?: string | null
  assignee: { id: string; name: string } | null
  // Everyone with tasks on this car (default owner + per-task hand-offs).
  assignees?: { id: string; name: string }[]
  // Per-mechanic timers on a shared car.
  timers?: { userId: string | null; name: string | null; elapsedSeconds: number; running: boolean; timerStartedAt: string | null; done: boolean; autoPaused: boolean; pauseReason: string | null; pauseDetail: string | null; pausedAt: string | null }[]
  myElapsedSeconds?: number
  myTimerRunning?: boolean
  status: string
  estimatedHours: number | null
  checklist: ChecklistItem[]
  priority: number
  elapsedSeconds: number
  timerRunning: boolean
  timerStartedAt: string | null
  autoPaused: boolean
  pauseReason: string | null
  pauseDetail: string | null
  pausedAt: string | null
  awaitingParts: boolean
  awaitingPartsName: string | null
  awaitingPartsDate: string | null
  awaitingPartsTracking: string | null
  completedAt: string | null
  startedAt: string | null
  partsLabel: string | null
}

type DayBucket = { day: string; jobs: JobCard[] }

type BoardData = {
  active: JobCard[]; paused: JobCard[]; queued: JobCard[]; completedToday: JobCard[]
  workedToday: JobCard[]; pausedNotToday: JobCard[]; awaitingParts: JobCard[]; today: JobCard[]; remainingDays: DayBucket[]
  weeklyEstimatedHours: number; weeklyWorkedHours: number; remainingHoursThisWeek: number; hoursLeftToday: number
  isWorkHours: boolean
  mechanics?: { id: string; name: string; workedTodayHours: number; workedWeekHours: number }[]
  currentUserId?: string
  currentUserRole?: string
}

// Initials for an assignee chip, e.g. "Mike Rowe" → "MR", "Carlos" → "CA"
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// Deterministic chip color per userId so a mechanic reads the same everywhere.
const CHIP_COLORS = ['#2563eb', '#db2777', '#16a34a', '#d97706', '#7c3aed', '#0891b2']
function chipColor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return CHIP_COLORS[h % CHIP_COLORS.length]
}

// Who a task belongs to:
//  - explicit per-task assignee wins,
//  - a mechanic-ADDED task belongs to NO ONE until an admin assigns it,
//  - an original task inherits the car's owner.
// Returns null when the task needs admin assignment (added + unassigned).
function taskOwner(
  item: ChecklistItem,
  carOwner: { id: string; name: string } | null,
): { id: string; name: string } | null {
  if (item.assigneeId) return { id: item.assigneeId, name: item.assigneeName || '?' }
  if (item.addedByMechanic) return null
  return carOwner
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

function formatHours(seconds: number): string {
  return (seconds / 3600).toFixed(1) + 'h'
}

export default function MechanicBoard() {
  const [data, setData] = useState<BoardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedJob, setSelectedJob] = useState<JobCard | null>(null)
  const [modalChecklist, setModalChecklist] = useState<ChecklistItem[]>([])
  const [expandedTaskIdx, setExpandedTaskIdx] = useState<number | null>(null)
  const [followupDrafts, setFollowupDrafts] = useState<Record<number, string>>({})
  const [followupHourDrafts, setFollowupHourDrafts] = useState<Record<number, string>>({})
  // Per sub-item draft for "add as task" inline form (key = `${parentIdx}-${subKey}`)
  const [issueTaskDrafts, setIssueTaskDrafts] = useState<Record<string, string | undefined>>({})
  const [issueTaskHourDrafts, setIssueTaskHourDrafts] = useState<Record<string, string>>({})

  const addIssueTask = async (parentIdx: number, subKey: string, label: string) => {
    if (!selectedJob) return
    const key = `${parentIdx}-${subKey}`
    const name = (issueTaskDrafts[key] || label).trim()
    if (!name) return
    const hoursRaw = parseFloat(issueTaskHourDrafts[key] || '')
    const hours = isFinite(hoursRaw) && hoursRaw > 0 ? hoursRaw : null
    const sourceItem = modalChecklist[parentIdx]?.item
    const updated = [...modalChecklist, {
      item: name,
      done: false,
      note: '',
      addedByMechanic: true,
      approved: 'pending' as const,
      estimatedHours: hours,
      sourceItem,  // remember which inspection item this task was added from
      sourceSubField: label,  // and which sub-field within it (for sub-field issue path)
    }]
    setModalChecklist(updated)
    setIssueTaskDrafts(prev => ({ ...prev, [key]: undefined }))
    setIssueTaskHourDrafts(prev => ({ ...prev, [key]: '' }))
    setSaving(true)
    try {
      await fetch(`/api/stages/${selectedJob.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checklist: updated }),
      })
    } catch { /* ignore */ }
    setSaving(false)
  }
  const [saving, setSaving] = useState(false)
  const [acting, setActing] = useState(false)
  const [showPauseModal, setShowPauseModal] = useState(false)
  const [pauseType, setPauseType] = useState<'waiting_on_parts' | 'lunch' | 'other' | null>(null)
  const [pauseNote, setPauseNote] = useState('')
  const [partName, setPartName] = useState('')
  const [expectedDate, setExpectedDate] = useState('')
  const [trackingNumber, setTrackingNumber] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [showAllQueued, setShowAllQueued] = useState(false)
  const [showRemainingWeek, setShowRemainingWeek] = useState(false)
  const [viewMode, setViewMode] = useState<'board' | 'schedule' | 'plan'>('board')
  const [tick, setTick] = useState(0)
  const [timeExtJob, setTimeExtJob] = useState<JobCard | null>(null)
  const [timeExtHours, setTimeExtHours] = useState('')
  const [timeExtNote, setTimeExtNote] = useState('')
  const [timeExtSubmitting, setTimeExtSubmitting] = useState(false)
  // When set, opens AddPartModal pre-filled with the name. Also remembers source for inline confirmation.
  const [addPartFromTask, setAddPartFromTask] = useState<{ name: string; sourceItem: string; sourceSubField?: string } | null>(null)
  // Inline "Add part" drafts keyed by item index (simple sections) or `${parentIdx}-${subKey}` (sub-field issues)
  const [partDrafts, setPartDrafts] = useState<Record<string, string>>({})
  // Item indices where mechanic tried to mark complete but some sub-fields were empty.
  // Triggers a red ! next to each empty sub-field label.
  const [completionAttempts, setCompletionAttempts] = useState<Set<number>>(new Set())
  // Modal for collecting estimated hours when adding any task. Drives both simple-section and sub-field paths.
  type EstimateModal =
    | { kind: 'simple'; itemIdx: number; taskName: string }
    | { kind: 'subfield'; parentIdx: number; subKey: string; label: string; taskName: string }
  const [estimateModal, setEstimateModal] = useState<EstimateModal | null>(null)
  const [estimateHoursInput, setEstimateHoursInput] = useState('')
  // Cache of parts created during this session so we can show "added from here" inline confirmation.
  // Each entry: { name, sourceItem, sourceSubField? }
  const [sessionAddedParts, setSessionAddedParts] = useState<{ id: string; name: string; sourceItem: string; sourceSubField?: string }[]>([])
  const [addTaskJob, setAddTaskJob] = useState<JobCard | null>(null)
  const [addTaskItems, setAddTaskItems] = useState<{ name: string; hours: string; note: string }[]>([{ name: '', hours: '', note: '' }])
  const [addTaskSubmitting, setAddTaskSubmitting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<JobCard | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [externalModal, setExternalModal] = useState<JobCard | null>(null)
  const [mechParts, setMechParts] = useState<any[]>([])
  const [mechPartsUrlId, setMechPartsUrlId] = useState<string | null>(null)
  const [mechPartsUrlInput, setMechPartsUrlInput] = useState('')
  const [mechPartsSaving, setMechPartsSaving] = useState(false)
  const [mechOrderModal, setMechOrderModal] = useState<{ id: string; name: string } | null>(null)
  const [externalSubmitting, setExternalSubmitting] = useState(false)
  // Which mechanic's lane is shown. 'all' = everyone (main board). Mechanics
  // default to their own lane once data arrives (see effect below).
  const [mechFilter, setMechFilter] = useState<string>('all')
  const mechFilterInitRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchData = useCallback(() => {
    fetch('/api/mechanic-board').then(r => r.json()).then(d => {
      setData(d)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchData()
    fetch('/api/auth/me').then(r => r.json()).then(d => {
      if (d.user?.role === 'admin') setIsAdmin(true)
    }).catch(() => {})
  }, [fetchData])

  // Default a mechanic to their own lane; admins stay on "All".
  useEffect(() => {
    if (mechFilterInitRef.current || !data) return
    mechFilterInitRef.current = true
    if (data.currentUserRole && data.currentUserRole !== 'admin' && data.currentUserId
        && (data.mechanics || []).some(m => m.id === data.currentUserId)) {
      setMechFilter(data.currentUserId)
    }
  }, [data])

  useEffect(() => {
    timerRef.current = setInterval(() => setTick(t => t + 1), 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  useEffect(() => {
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [fetchData])

  const doAction = async (action: string, stageId: string, extra?: Record<string, unknown>) => {
    setActing(true)
    try {
      await fetch('/api/mechanic-board', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, stageId, ...extra }),
      })
      fetchData()
      if (action === 'complete' || action === 'start') setSelectedJob(null)
    } catch { /* ignore */ }
    setActing(false)
  }

  // Modal handlers: when mechanic clicks "Add task", we open estimateModal first to collect hours,
  // then trigger the appropriate add* helper with the entered hours.
  const openSimpleEstimateModal = (itemIdx: number) => {
    const taskName = (followupDrafts[itemIdx] || '').trim()
    if (!taskName) return
    setEstimateModal({ kind: 'simple', itemIdx, taskName })
    setEstimateHoursInput('')
  }
  const openSubFieldEstimateModal = (parentIdx: number, subKey: string, label: string) => {
    const key = `${parentIdx}-${subKey}`
    const draft = issueTaskDrafts[key]
    const subNote = (() => {
      const data = (modalChecklist[parentIdx]?.data || {}) as Record<string, unknown>
      const v = data[subKey]
      if (v && typeof v === 'object' && 'note' in v) return String((v as { note?: string }).note || '').trim()
      return ''
    })()
    const taskName = (draft !== undefined ? draft : subNote).trim()
    if (!taskName) return
    setEstimateModal({ kind: 'subfield', parentIdx, subKey, label, taskName })
    setEstimateHoursInput('')
  }
  const confirmEstimate = async () => {
    if (!estimateModal) return
    const hours = parseFloat(estimateHoursInput)
    if (!isFinite(hours) || hours <= 0) return
    if (estimateModal.kind === 'simple') {
      // Stash the hours into the draft so addFollowupTask picks it up
      setFollowupHourDrafts(prev => ({ ...prev, [estimateModal.itemIdx]: String(hours) }))
      // We need to wait for state to flush, so just inline the create logic here
      const sourceItem = modalChecklist[estimateModal.itemIdx]?.item
      const updated = [...modalChecklist, {
        item: estimateModal.taskName,
        done: false,
        note: '',
        addedByMechanic: true,
        approved: 'pending' as const,
        estimatedHours: hours,
        sourceItem,
      }]
      setModalChecklist(updated)
      setFollowupDrafts(prev => ({ ...prev, [estimateModal.itemIdx]: '' }))
      setFollowupHourDrafts(prev => ({ ...prev, [estimateModal.itemIdx]: '' }))
      setSaving(true)
      try {
        await fetch(`/api/stages/${selectedJob!.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ checklist: updated }),
        })
      } catch { /* ignore */ }
      setSaving(false)
    } else {
      const key = `${estimateModal.parentIdx}-${estimateModal.subKey}`
      const parentItem = modalChecklist[estimateModal.parentIdx]?.item
      const updated = [...modalChecklist, {
        item: estimateModal.taskName,
        done: false,
        note: '',
        addedByMechanic: true,
        approved: 'pending' as const,
        estimatedHours: hours,
        sourceItem: parentItem,
        sourceSubField: estimateModal.label,
      }]
      setModalChecklist(updated)
      setIssueTaskDrafts(prev => ({ ...prev, [key]: undefined }))
      setIssueTaskHourDrafts(prev => ({ ...prev, [key]: '' }))
      setSaving(true)
      try {
        await fetch(`/api/stages/${selectedJob!.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ checklist: updated }),
        })
      } catch { /* ignore */ }
      setSaving(false)
    }
    setEstimateModal(null)
    setEstimateHoursInput('')
  }

  const addFollowupTask = async (sourceIdx: number) => {
    if (!selectedJob) return
    const name = (followupDrafts[sourceIdx] || '').trim()
    const hours = parseFloat(followupHourDrafts[sourceIdx] || '')
    if (!name || !(hours > 0)) return
    const sourceItem = modalChecklist[sourceIdx]?.item
    const updated = [...modalChecklist, {
      item: name,
      done: false,
      note: '',
      addedByMechanic: true,
      approved: 'pending' as const,
      estimatedHours: hours,
      sourceItem,  // remember which inspection item this task was added from
    }]
    setModalChecklist(updated)
    setFollowupDrafts(prev => ({ ...prev, [sourceIdx]: '' }))
    setFollowupHourDrafts(prev => ({ ...prev, [sourceIdx]: '' }))
    setSaving(true)
    try {
      await fetch(`/api/stages/${selectedJob.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checklist: updated }),
      })
    } catch { /* ignore */ }
    setSaving(false)
  }

  const declineFollowupTask = async (index: number) => {
    if (!selectedJob) return
    const updated = modalChecklist.filter((_, idx) => idx !== index)
    setModalChecklist(updated)
    setSaving(true)
    try {
      await fetch(`/api/stages/${selectedJob.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checklist: updated }),
      })
    } catch { /* ignore */ }
    setSaving(false)
  }

  const updateChecklistItem = async (index: number, patch: Partial<ChecklistItem>) => {
    if (!selectedJob) return
    const updated = [...modalChecklist]
    updated[index] = { ...updated[index], ...patch }
    setModalChecklist(updated)
    setSaving(true)
    try {
      await fetch(`/api/stages/${selectedJob.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checklist: updated }),
      })
    } catch { /* ignore */ }
    setSaving(false)
  }

  const structuredProgress = (item: ChecklistItem): { filled: number; total: number } | null => {
    const d = (item.data || {}) as Record<string, unknown>
    if (item.type === 'tirePsi') {
      const keys = ['fl', 'fr', 'rl', 'rr']
      return { filled: keys.filter(k => typeof d[k] === 'number').length, total: keys.length }
    }
    if (item.type === 'brakePads') {
      const keys = ['frontMm', 'rearMm']
      return { filled: keys.filter(k => typeof d[k] === 'number').length, total: keys.length }
    }
    if (item.type === 'fluids') {
      const keys = ['powerSteering', 'brake', 'engineOil', 'transmission', 'antifreeze']
      return { filled: keys.filter(k => !!getPillStatus(d[k])).length, total: keys.length }
    }
    if (item.type === 'engineCheck') {
      const keys = ['sparkPlug', 'coil', 'distributorCap', 'sparkPlugWires']
      return { filled: keys.filter(k => !!getPillStatus(d[k])).length, total: keys.length }
    }
    if (item.type === 'electrical') {
      const keys = ['regularBeam', 'highBeam', 'fogLights', 'radio', 'top', 'brakeLights', 'reverseLights', 'turnSignals']
      return { filled: keys.filter(k => !!getPillStatus(d[k])).length, total: keys.length }
    }
    if (item.type === 'steeringCheck') {
      return { filled: getPillStatus(d.play) ? 1 : 0, total: 1 }
    }
    if (item.type === 'suspensionCheck') {
      const keys = ['shaking', 'noises']
      return { filled: keys.filter(k => !!getPillStatus(d[k])).length, total: keys.length }
    }
    return null
  }

  // Small red ! pip shown next to empty sub-field labels after a failed completion attempt.
  const WarnPip = () => (
    <span
      title="Fill this in before marking the task complete"
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 14, height: 14, borderRadius: '50%',
        background: '#dc2626', color: '#fff',
        fontSize: 10, fontWeight: 700,
        marginLeft: 6, lineHeight: 1,
      }}
    >!</span>
  )

  // Whether a specific sub-field within an item is empty. Used for the red ! warnings.
  const isSubFieldEmpty = (item: ChecklistItem, key: string): boolean => {
    const d = (item.data || {}) as Record<string, unknown>
    if (item.type === 'tirePsi' || item.type === 'brakePads') {
      return typeof d[key] !== 'number'
    }
    return !getPillStatus(d[key])
  }

  const isStructuredComplete = (item: ChecklistItem): boolean => {
    const d = (item.data || {}) as Record<string, unknown>
    if (item.type === 'tirePsi') {
      return ['fl', 'fr', 'rl', 'rr'].every(k => typeof d[k] === 'number')
    }
    if (item.type === 'brakePads') {
      return ['frontMm', 'rearMm'].every(k => typeof d[k] === 'number')
    }
    if (item.type === 'fluids') {
      return ['powerSteering', 'brake', 'engineOil', 'transmission', 'antifreeze'].every(k => !!getPillStatus(d[k]))
    }
    if (item.type === 'engineCheck') {
      return ['sparkPlug', 'coil', 'distributorCap', 'sparkPlugWires'].every(k => !!getPillStatus(d[k]))
    }
    if (item.type === 'electrical') {
      // top is optional (only some vehicles have one)
      return ['regularBeam', 'highBeam', 'fogLights', 'radio', 'brakeLights', 'reverseLights', 'turnSignals'].every(k => !!getPillStatus(d[k]))
    }
    if (item.type === 'steeringCheck') {
      return !!getPillStatus(d.play)
    }
    if (item.type === 'suspensionCheck') {
      return !!getPillStatus(d.shaking) && !!getPillStatus(d.noises)
    }
    return true
  }

  const toggleChecklist = async (index: number) => {
    if (!selectedJob) return
    const target = modalChecklist[index]
    // Block check-on if mechanic-added task isn't approved (+ assigned) yet
    if (!target.done && target.addedByMechanic && target.approved !== 'approved') {
      setExpandedTaskIdx(index)
      return
    }
    // A mechanic can only check off tasks that belong to THEM (their explicit
    // assignment, or an original task on a car they own). Admins can check any.
    if (!isAdmin && !target.done) {
      const owner = taskOwner(target, selectedJob.assignee)
      if (!owner || owner.id !== data?.currentUserId) {
        setExpandedTaskIdx(index)
        return
      }
    }
    // Block check-on if structured fields aren't filled — mark for red ! highlights
    if (!target.done && !isStructuredComplete(target)) {
      setExpandedTaskIdx(index)
      setCompletionAttempts(prev => {
        const next = new Set(prev)
        next.add(index)
        return next
      })
      return
    }
    // Successful toggle clears any prior warning state for this item
    if (completionAttempts.has(index)) {
      setCompletionAttempts(prev => {
        const next = new Set(prev)
        next.delete(index)
        return next
      })
    }
    const updated = [...modalChecklist]
    updated[index] = { ...updated[index], done: !updated[index].done }
    setModalChecklist(updated)
    setSaving(true)
    try {
      await fetch(`/api/stages/${selectedJob.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checklist: updated }),
      })
    } catch { /* ignore */ }
    setSaving(false)
  }

  const openJob = (job: JobCard) => {
    setSelectedJob(job)
    setModalChecklist(JSON.parse(JSON.stringify(job.checklist || [])))
    setShowPauseModal(false)
    setPauseType(null)
    setPauseNote('')
    setPartName('')
    setExpectedDate('')
    setTrackingNumber('')
    // Load parts for this vehicle
    fetch(`/api/parts?vehicleId=${job.vehicle.id}`).then(r => r.json()).then(d => setMechParts(d.parts || [])).catch(() => setMechParts([]))
  }

  const closeModal = () => { setSelectedJob(null); setShowPauseModal(false) }

  const submitPause = () => {
    if (!selectedJob || !pauseType) return
    const extra: Record<string, unknown> = { pauseReason: pauseType }
    if (pauseType === 'other') extra.pauseDetail = pauseNote
    if (pauseType === 'lunch') extra.pauseDetail = null
    if (pauseType === 'waiting_on_parts') {
      extra.partName = partName
      extra.expectedDate = expectedDate || undefined
      extra.trackingNumber = trackingNumber || undefined
    }
    doAction('pause', selectedJob.id, extra)
    setShowPauseModal(false)
    setSelectedJob(null)
  }

  const getLiveElapsed = (job: JobCard): number => {
    void tick
    if (job.timerRunning && job.timerStartedAt) {
      const extra = Math.floor((Date.now() - new Date(job.timerStartedAt).getTime()) / 1000)
      return job.elapsedSeconds + extra
    }
    return job.elapsedSeconds
  }

  // Live seconds for one mechanic's timer entry on a shared car.
  const getLiveEntry = (t: { elapsedSeconds: number; running: boolean; timerStartedAt: string | null }): number => {
    void tick
    if (t.running && t.timerStartedAt) {
      return t.elapsedSeconds + Math.floor((Date.now() - new Date(t.timerStartedAt).getTime()) / 1000)
    }
    return t.elapsedSeconds
  }

  const getJobColorKey = (job: JobCard): string => {
    if (job.awaitingParts) return 'awaiting_parts'
    if (job.autoPaused) return 'auto_paused'
    if (job.timerRunning) {
      const est = (job.estimatedHours || 2) * 3600
      if (getLiveElapsed(job) > est) return 'overdue'
      return 'active'
    }
    if (job.status === 'done') return 'completed'
    if (job.status === 'pending') return 'queued'
    if (job.pauseReason) return 'paused'
    return 'paused'
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'transparent' }} />
      </div>
    )
  }
  if (!data) return <p style={{ textAlign: 'center', padding: 40 }}>Failed to load</p>

  const doneCount = modalChecklist.filter(c => c.done).length
  // Board-level aliases — inside the checklist map `data` is shadowed by the
  // item's own `data` field, so grab what the per-task assign control needs here.
  const boardMechanics = data.mechanics || []
  const boardCurrentUserId = data.currentUserId

  // Efficiency
  const effPct = data.weeklyEstimatedHours > 0 ? Math.round((data.weeklyWorkedHours / data.weeklyEstimatedHours) * 100) : 0
  const effLabel = effPct >= 90 && effPct <= 110 ? 'On Track' : effPct > 110 ? 'Over Estimate' : 'Under Estimate'
  const effColor = effPct >= 90 && effPct <= 110 ? '#22c55e' : effPct > 110 ? '#ef4444' : '#f59e0b'

  // "Worked Today" follows the lane filter: All = whole team's total today,
  // a specific mechanic = just that mechanic's total today (across all their cars).
  const mechList = data.mechanics || []
  // Non-admins are HARD-LOCKED to their own lane regardless of the (hidden) chip
  // state — they only ever see their own to-do list.
  const activeFilter = isAdmin ? mechFilter : (data.currentUserId || mechFilter)
  const workedTodayFiltered = activeFilter === 'all'
    ? Math.round(mechList.reduce((s, m) => s + m.workedTodayHours, 0) * 10) / 10
    : (mechList.find(m => m.id === activeFilter)?.workedTodayHours ?? 0)
  const workedTodayLabel = activeFilter === 'all'
    ? 'Worked Today'
    : `${(mechList.find(m => m.id === activeFilter)?.name || '').split(' ')[0]} Today`

  const COLORS: Record<string, { bg: string; border: string; badge: string; text: string }> = {
    active: { bg: '#eff6ff', border: '#3b82f6', badge: '#3b82f6', text: '#1e40af' },
    queued: { bg: '#f9fafb', border: '#e2e5ea', badge: '#94a3b8', text: '#64748b' },
    paused: { bg: '#fff7ed', border: '#f59e0b', badge: '#f59e0b', text: '#92400e' },
    auto_paused: { bg: '#faf5ff', border: '#a855f7', badge: '#a855f7', text: '#6b21a8' },
    awaiting_parts: { bg: '#fff7ed', border: '#f59e0b', badge: '#f59e0b', text: '#92400e' },
    completed: { bg: '#f0fdf4', border: '#22c55e', badge: '#22c55e', text: '#166534' },
    overdue: { bg: '#fef2f2', border: '#ef4444', badge: '#ef4444', text: '#991b1b' },
  }

  // Lane filter: 'all' shows every car; a mechanic id shows only cars they have
  // tasks on (default owner or a handed-off task).
  const jobAssignees = (job: JobCard) =>
    (job.assignees && job.assignees.length ? job.assignees : (job.assignee ? [job.assignee] : []))
  const jobMatchesFilter = (job: JobCard) =>
    activeFilter === 'all' || jobAssignees(job).some(a => a.id === activeFilter)
  const visible = (jobs: JobCard[]) => jobs.filter(jobMatchesFilter)

  // Filter each section once per render (not repeatedly inline) and drive the
  // stat boxes + empty state off the SAME filtered lists so counts, sections,
  // and the "all clear" message all agree with the active lane filter.
  const vActive = visible(data.active)
  const vQueued = visible(data.queued)
  const vPaused = visible(data.paused)
  const vAwaiting = visible(data.awaitingParts)
  const vCompletedToday = visible(data.completedToday)

  const renderCard = (job: JobCard, showActions = true) => {
    const colorKey = getJobColorKey(job)
    const colors = COLORS[colorKey]
    const v = job.vehicle
    const desc = `${v.year ?? ''} ${v.make} ${v.model}`.trim()
    const elapsed = getLiveElapsed(job)
    const estSeconds = (job.estimatedHours || 2) * 3600
    const progress = Math.min(elapsed / estSeconds, 1)
    const isOver = elapsed > estSeconds && job.status !== 'done'
    const tasksDone = (job.checklist as ChecklistItem[]).filter(c => c.done).length
    const tasksTotal = (job.checklist as ChecklistItem[]).length
    // Timer control is per-mechanic: if I work this car, my buttons reflect MY
    // timer; otherwise (admin/observer) fall back to the car's aggregate state.
    const iAmOnCar = !!data.currentUserId && (job.assignees || []).some(a => a.id === data.currentUserId)
    const myRunning = iAmOnCar ? !!job.myTimerRunning : job.timerRunning
    const isShared = (job.assignees?.length || 0) > 1
    // "My part" on a shared car = tasks I own (explicit to me, or original tasks
    // on a car I own). Finishing it stops MY clock but leaves co-workers running.
    const myEntry = (job.timers || []).find(t => t.userId === data.currentUserId)
    const myPartDone = !!myEntry?.done
    // "My tasks" via the shared ownership rule — added-but-unassigned tasks
    // belong to no one (they need admin), so they never count against a mechanic.
    const myChecklist = (job.checklist as ChecklistItem[]).filter(c => {
      if (c.approved === 'declined') return false
      const owner = taskOwner(c, job.assignee)
      return !!owner && owner.id === data.currentUserId
    })
    const myTasksAllDone = myChecklist.length === 0 || myChecklist.every(c => c.done)

    return (
      <div key={job.id} onClick={() => openJob(job)} style={{
        background: colors.bg,
        border: job.scopeName === 'Sold Delivery' ? '2px solid #f59e0b' : `1px solid ${colors.border}`,
        borderLeft: job.scopeName === 'Sold Delivery' ? '4px solid #f59e0b' : `4px solid ${colors.border}`,
        borderRadius: 14, padding: '16px 18px', cursor: 'pointer', transition: 'box-shadow 0.15s',
        height: '100%', display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <p style={{ fontSize: 15, fontWeight: 700 }}>#{v.stockNumber}</p>
              {job.scopeName === 'Sold Delivery' && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100,
                  background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d',
                  textTransform: 'uppercase', letterSpacing: '0.04em',
                }}>Sold</span>
              )}
              {job.scopeName === 'New Inventory' && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100,
                  background: '#dbeafe', color: '#1d4ed8', border: '1px solid #bfdbfe',
                  textTransform: 'uppercase', letterSpacing: '0.04em',
                }}>New Inventory</span>
              )}
              <ReturnBadge returnQueue={v.returnQueue} />
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{desc}{v.color ? ` · ${v.color}` : ''}</p>
            {(job.assignees && job.assignees.length > 0) && (
              <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                {job.assignees.map(a => (
                  <span key={a.id} style={{
                    display: 'flex', alignItems: 'center', gap: 5, padding: '2px 9px 2px 2px',
                    borderRadius: 100, background: '#f1f3f5',
                  }}>
                    <span style={{
                      width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                      background: chipColor(a.id), color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 8, fontWeight: 800,
                    }}>{initialsOf(a.name)}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>{a.name.split(' ')[0]}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {job.timerRunning && <Badge text="Active" color={colors.badge} />}
            {job.autoPaused && <Badge text="Auto Paused" color="#a855f7" />}
            {job.awaitingParts && <Badge text="Parts" color="#f59e0b" />}
            {!job.timerRunning && job.pauseReason && !job.awaitingParts && !job.autoPaused && job.pauseReason === 'Lunch' && <Badge text="Lunch" color="#8b5cf6" />}
            {!job.timerRunning && job.pauseReason && !job.awaitingParts && !job.autoPaused && job.pauseReason !== 'Lunch' && <Badge text="Paused" color="#f59e0b" />}
            {job.status === 'pending' && <Badge text="Queued" color="#94a3b8" />}
            {job.status === 'done' && <Badge text="Done" color="#22c55e" />}
            {isOver && <Badge text="Overdue" color="#ef4444" />}
          </div>
        </div>

        {/* Parts status */}
        {job.partsLabel && (
          <div style={{
            marginTop: 8, padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, textAlign: 'center',
            background: job.partsLabel.includes('found') ? '#fef2f2' : job.partsLabel.includes('approval') ? '#fef9c3' : job.partsLabel.includes('ordered') ? '#fefce8' : '#eff6ff',
            color: job.partsLabel.includes('found') ? '#ef4444' : job.partsLabel.includes('approval') ? '#a16207' : job.partsLabel.includes('ordered') ? '#eab308' : '#2563eb',
          }}>
            {job.partsLabel}
          </div>
        )}

        {/* Timer row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, gap: 12 }}>
          <div style={{ fontSize: 13 }}>
            <span style={{ fontWeight: 700, color: isOver ? '#ef4444' : colors.text, fontVariantNumeric: 'tabular-nums' }}>
              {formatHours(elapsed)}
            </span>
            <span style={{ color: 'var(--text-muted)' }}> / {job.estimatedHours || 2}h est.{(job.timers || []).filter(t => t.userId).length > 1 ? ' combined' : ''}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {tasksTotal > 0 && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{tasksDone}/{tasksTotal} tasks</span>
            )}
            {job.timerRunning && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#3b82f6', animation: 'pulse 2s infinite' }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#3b82f6', fontVariantNumeric: 'tabular-nums' }}>{formatTime(elapsed)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Per-mechanic breakdown lives in the detail modal (tap the card) so the
            board stays scannable — the card shows just the combined total + who's on it. */}

        {/* Progress bar */}
        <div style={{ marginTop: 8, height: 5, background: '#e2e5ea', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 3, transition: 'width 0.5s',
            width: `${Math.min(progress * 100, 100)}%`,
            background: isOver ? '#ef4444' : progress >= 0.8 ? '#f59e0b' : colors.badge,
          }} />
        </div>

        {/* Pause info */}
        {job.pauseReason && !job.timerRunning && !job.autoPaused && (
          <p style={{ fontSize: 11, fontWeight: 600, color: job.pauseReason === 'Lunch' ? '#7c3aed' : colors.text, marginTop: 8 }}>
            {job.pauseReason === 'Lunch' ? '🍽️ On Lunch' : job.pauseReason}{job.pauseDetail ? `: ${sentenceCase(job.pauseDetail)}` : ''}
            {job.awaitingPartsName && ` — ${sentenceCase(job.awaitingPartsName)}`}
          </p>
        )}
        {job.autoPaused && (
          <p style={{ fontSize: 11, fontWeight: 600, color: '#a855f7', marginTop: 8 }}>Auto Paused — Outside Working Hours</p>
        )}
        {(job.pauseReason || job.awaitingParts || job.autoPaused) && !job.timerRunning && job.pausedAt && (() => {
          const mins = Math.floor((Date.now() - new Date(job.pausedAt).getTime()) / 60000)
          const label = mins < 1 ? 'just now' : mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`
          return (
            <p style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{label}</p>
          )
        })()}

        {/* Request More Time — when overdue */}
        {isOver && !showActions && (
          <button
            onClick={(e) => { e.stopPropagation(); setTimeExtJob(job) }}
            style={{
              marginTop: 10, width: '100%', padding: '8px 0', borderRadius: 8,
              background: 'transparent', border: '1px solid #ef4444', color: '#ef4444',
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Request More Time
          </button>
        )}

        {/* Quick actions — mechanics only act on cars they're assigned to; admins
            keep full control (override/fix). Unassigned cars must be assigned by
            an admin first, so a mechanic sees no Start until it's theirs. */}
        {showActions && (isAdmin || iAmOnCar) && (
          <div className="mech-actions" style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 12, flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
            {myPartDone ? (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                borderRadius: 10, background: '#f0fdf4', border: '1px solid #bbf7d0',
                color: '#166534', fontSize: 13, fontWeight: 700,
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                Your part done
              </span>
            ) : (
              <>
                {job.status === 'pending' && !myRunning && (
                  <ActionBtn label="Start" color="#3b82f6" disabled={acting || !data.isWorkHours} onClick={() => doAction('start', job.id)} />
                )}
                {myRunning && (
                  <>
                    <ActionBtn label="Pause" color="#f59e0b" disabled={acting} onClick={() => { openJob(job); setShowPauseModal(true) }} />
                    <ActionBtn
                      label={isShared && tasksDone < tasksTotal ? 'Finish My Part' : 'Complete'}
                      color="#22c55e"
                      disabled={acting || (isShared && !myTasksAllDone)}
                      title={isShared && !myTasksAllDone ? 'Finish your own tasks first' : undefined}
                      onClick={() => doAction('complete', job.id)}
                    />
                  </>
                )}
                {!myRunning && job.status === 'in_progress' && (
                  <ActionBtn label={iAmOnCar ? 'Resume' : 'Start'} color="#3b82f6" disabled={acting || !data.isWorkHours} onClick={() => doAction(iAmOnCar ? 'resume' : 'start', job.id)} />
                )}
              </>
            )}
            {job.status === 'in_progress' && (
              <ActionBtn label="Add Task" color="#8b5cf6" disabled={acting} onClick={() => setAddTaskJob(job)} />
            )}
            {isOver && (
              <ActionBtn className="mech-action-full" label="Request More Time" color="#ef4444" disabled={acting} onClick={() => setTimeExtJob(job)} />
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        .msch-header { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; flex-wrap: wrap; }
        .msch-title { font-size: 24px; font-weight: 700; letter-spacing: -0.02em; margin: 0; }
        .msch-owh { margin-left: auto; }
        .msch-tabs { display: flex; background: #f1f3f5; border-radius: 10px; padding: 3px; }
        @media (max-width: 767px) {
          .msch-header {
            display: grid;
            grid-template-columns: 1fr auto;
            column-gap: 12px;
            row-gap: 12px;
            align-items: center;
          }
          .msch-title { grid-row: 1; grid-column: 1; }
          .msch-owh { grid-row: 1; grid-column: 2; margin-left: 0; justify-self: end; }
          .msch-tabs { grid-row: 2; grid-column: 1 / -1; justify-self: end; }
          /* When OWH isn't present, tabs still go on row 2 right side */
          .msch-header.no-owh .msch-tabs { grid-row: 1; grid-column: 2; }
          /* Quick actions: buttons share the row evenly; Request More Time wraps to its own row */
          .mech-actions { gap: 6px !important; }
          .mech-actions > button { flex: 1 1 0; min-width: 0; padding: 8px 10px !important; font-size: 13px !important; min-height: 36px; }
          .mech-actions > button.mech-action-full { flex: 1 0 100%; }
        }
      `}</style>

      {/* Header */}
      <div className={`msch-header ${data.isWorkHours ? 'no-owh' : ''}`}>
        <h1 className="msch-title">
          {isAdmin ? 'Mechanic Schedule' : 'My Schedule'}
        </h1>
        {!data.isWorkHours && (
          <span className="msch-owh">
            <Badge text="Outside Working Hours" color="#a855f7" />
          </span>
        )}
        {isAdmin && (<div className="msch-tabs">
            <button
              onClick={() => setViewMode('board')}
              style={{
                padding: '6px 14px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.15s',
                background: viewMode === 'board' ? '#fff' : 'transparent',
                color: viewMode === 'board' ? '#1a1a1a' : '#94a3b8',
                boxShadow: viewMode === 'board' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              Board
            </button>
            <button
              onClick={() => setViewMode('schedule')}
              style={{
                padding: '6px 14px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.15s',
                background: viewMode === 'schedule' ? '#fff' : 'transparent',
                color: viewMode === 'schedule' ? '#1a1a1a' : '#94a3b8',
                boxShadow: viewMode === 'schedule' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              Schedule
            </button>
            {isAdmin && (
              <button
                onClick={() => setViewMode('plan')}
                style={{
                  padding: '6px 14px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', transition: 'all 0.15s',
                  background: viewMode === 'plan' ? '#fff' : 'transparent',
                  color: viewMode === 'plan' ? '#4f46e5' : '#94a3b8',
                  boxShadow: viewMode === 'plan' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}
              >
                Plan
              </button>
            )}
        </div>)}
      </div>

      {/* Mechanic lane filter — ADMIN ONLY. A mechanic is locked to their own
          lane (mechFilter defaults to their id) and never sees All/other lanes. */}
      {isAdmin && viewMode !== 'plan' && (data.mechanics?.length || 0) >= 2 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
          {[{ id: 'all', name: 'All' }, ...(data.mechanics || [])].map(m => {
            const active = mechFilter === m.id
            const isAll = m.id === 'all'
            const mech = !isAll ? (data.mechanics || []).find(x => x.id === m.id) : null
            return (
              <button
                key={m.id}
                onClick={() => setMechFilter(m.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '7px 14px', borderRadius: 100,
                  border: active ? '1.5px solid #1a1a1a' : '1px solid var(--border)',
                  background: active ? '#1a1a1a' : '#fff',
                  color: active ? '#fff' : 'var(--text-secondary)',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                {!isAll && (
                  <span style={{
                    width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                    background: chipColor(m.id), color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 9, fontWeight: 800, letterSpacing: '0.02em',
                  }}>{initialsOf(m.name)}</span>
                )}
                {m.name}
                {mech != null && (
                  <span style={{ fontWeight: 400, opacity: 0.7, fontSize: 12 }}>
                    · {mech.workedTodayHours}h
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Selected mechanic's own worked-time summary (also a mechanic's own header) */}
      {viewMode !== 'plan' && activeFilter !== 'all' && (() => {
        const mech = (data.mechanics || []).find(m => m.id === activeFilter)
        if (!mech) return null
        return (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
            marginBottom: 20, padding: '12px 16px', borderRadius: 12,
            background: '#f8fafc', border: '1px solid var(--border)',
          }}>
            <span style={{
              width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
              background: chipColor(mech.id), color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 800,
            }}>{initialsOf(mech.name)}</span>
            <span style={{ fontSize: 15, fontWeight: 700 }}>{mech.name}</span>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Worked today <b style={{ color: 'var(--text-primary)' }}>{mech.workedTodayHours}h</b>
            </span>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              This week <b style={{ color: 'var(--text-primary)' }}>{mech.workedWeekHours}h</b>
            </span>
          </div>
        )
      })()}

      {viewMode === 'plan' ? (
        <PlanView />
      ) : viewMode === 'schedule' ? (
        <ScheduleView />
      ) : (<>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 24 }}>
        <StatBox value={vActive.length} label="Active" color="#3b82f6" />
        <StatBox value={vQueued.length} label="Queued" color="#94a3b8" />
        <StatBox value={vPaused.length} label="Paused" color="#f59e0b" />
        <StatBox value={vCompletedToday.length} label="Done Today" color="#22c55e" />
        {mechList.length > 0 && (
          <div className="pipeline-chip">
            <p className="pipeline-chip-value" style={{ fontSize: 18 }}>{workedTodayFiltered}h</p>
            <p className="pipeline-chip-label">{workedTodayLabel}</p>
          </div>
        )}
        <div className="pipeline-chip">
          <p className="pipeline-chip-value" style={{ fontSize: 18 }}>{data.weeklyEstimatedHours}h</p>
          <p className="pipeline-chip-label">Est. This Week</p>
        </div>
        <div className="pipeline-chip" style={{ position: 'relative' }}>
          <p className="pipeline-chip-value" style={{ fontSize: 18 }}>{data.weeklyWorkedHours}h</p>
          <p className="pipeline-chip-label">Worked This Week</p>
          {data.weeklyEstimatedHours > 0 && (
            <span className="desktop-only" style={{ fontSize: 10, fontWeight: 700, color: effColor, marginTop: 2 }}>
              {effPct}% — {effLabel}
            </span>
          )}
        </div>
      </div>

      {/* Working Today */}
      {(() => {
        const seen = new Set<string>()
        const todayCars = [...visible(data.workedToday), ...visible(data.completedToday)]
          .filter(j => { if (seen.has(j.id)) return false; seen.add(j.id); return true })
        if (todayCars.length === 0) return null
        return (
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 4, height: 20, borderRadius: 2, background: '#16a34a' }} />
                <h2 style={{ fontSize: 16, fontWeight: 700 }}>Working Today</h2>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{todayCars.length} vehicles</span>
              </div>
            </div>
            <div style={{
              display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8,
              WebkitOverflowScrolling: 'touch',
            }}>
              {todayCars.map((job, i) => <WeekCard key={job.id} job={job} index={i} getLiveElapsed={getLiveElapsed} openJob={openJob} />)}
            </div>
          </div>
        )
      })()}

      {/* Remaining This Week — collapsed by default, broken down by day */}
      {data.remainingDays.length > 0 && (() => {
        const totalRemaining = data.remainingDays.reduce((sum, d) => sum + d.jobs.length, 0)
        return (
          <div style={{ marginBottom: 24 }}>
            <button
              onClick={() => setShowRemainingWeek(prev => !prev)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '10px 14px', borderRadius: 12, border: '1px solid #e2e5ea',
                background: '#f9fafb', cursor: 'pointer', marginBottom: showRemainingWeek ? 16 : 0,
              }}
            >
              <div style={{ width: 4, height: 20, borderRadius: 2, background: '#94a3b8' }} />
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)' }}>Remaining This Week</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{totalRemaining} vehicles</span>
              <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
                {showRemainingWeek ? 'Hide' : 'Show'}
              </span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text-muted)', transform: showRemainingWeek ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {showRemainingWeek && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {data.remainingDays.map((bucket) => {
                  const dayHours = bucket.jobs.reduce((sum, j) => sum + (j.estimatedHours || 2), 0)
                  return (
                    <div key={bucket.day}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)' }}>{bucket.day}</span>
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{bucket.jobs.length} vehicles</span>
                        </div>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{dayHours}h est.</span>
                      </div>
                      <div style={{
                        display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4,
                        WebkitOverflowScrolling: 'touch',
                      }}>
                        {bucket.jobs.map((job, i) => <WeekCard key={job.id} job={job} index={i} getLiveElapsed={getLiveElapsed} openJob={openJob} />)}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })()}

      {/* Active Jobs */}
      {vActive.length > 0 && (
        <Section title="Active Jobs" count={vActive.length} color="#3b82f6">
          <CardGrid>{vActive.map(j => renderCard(j))}</CardGrid>
        </Section>
      )}

      {/* Queue */}
      {vQueued.length > 0 && (
        <Section title="Queue" count={vQueued.length} color="#94a3b8">
          <CardGrid>{(showAllQueued ? vQueued : vQueued.slice(0, 6)).map(j => renderCard(j))}</CardGrid>
          {vQueued.length > 6 && (
            <button onClick={() => setShowAllQueued(prev => !prev)} style={{
              marginTop: 12, padding: '10px 20px', borderRadius: 10, border: '1px solid #d1d5db',
              background: '#f9fafb', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#64748b', width: '100%',
            }}>
              {showAllQueued ? 'Show Less' : `Show ${vQueued.length - 6} More`}
            </button>
          )}
        </Section>
      )}

      {/* Waiting for Parts */}
      {vAwaiting.length > 0 && (
        <Section title="Waiting for Parts" count={vAwaiting.length} color="#eab308">
          <CardGrid>{vAwaiting.map(j => renderCard(j))}</CardGrid>
        </Section>
      )}

      {/* On Lunch */}
      {vPaused.filter(j => !j.awaitingParts && j.pauseReason === 'Lunch').length > 0 && (
        <Section title="🍽️ On Lunch" count={vPaused.filter(j => !j.awaitingParts && j.pauseReason === 'Lunch').length} color="#8b5cf6">
          <CardGrid>{vPaused.filter(j => !j.awaitingParts && j.pauseReason === 'Lunch').map(j => renderCard(j))}</CardGrid>
        </Section>
      )}

      {/* Completed Today */}
      {vCompletedToday.length > 0 && (
        <Section title="Completed Today" count={vCompletedToday.length} color="#22c55e">
          <CardGrid>
            {vCompletedToday.map(j => {
              const v = j.vehicle
              return (
                <div key={j.id} style={{
                  background: '#f0fdf4', border: '1px solid #bbf7d0', borderLeft: '4px solid #22c55e',
                  borderRadius: 14, padding: '16px 18px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <p style={{ fontSize: 15, fontWeight: 700 }}>#{v.stockNumber}</p>
                      <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                        {`${v.year ?? ''} ${v.make} ${v.model}`.trim()}{v.color ? ` · ${v.color}` : ''}
                      </p>
                    </div>
                    <Badge text="Done" color="#22c55e" />
                  </div>
                  <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 12, color: '#166534' }}>
                    {j.completedAt && <span>Completed {new Date(j.completedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>}
                    <span style={{ fontWeight: 700 }}>Total: {formatHours(j.elapsedSeconds)}</span>
                  </div>
                </div>
              )
            })}
          </CardGrid>
        </Section>
      )}

      {vActive.length === 0 && vQueued.length === 0 && vPaused.length === 0 && vCompletedToday.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          {activeFilter === 'all' ? 'No mechanic jobs. All clear.' : (isAdmin ? 'No jobs for this mechanic.' : "You're all caught up — nothing assigned to you right now.")}
        </div>
      )}

      </>)}

      {/* Job Detail Modal */}
      {selectedJob && (
        <div onClick={closeModal} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: 20, width: '100%', maxWidth: 720,
            maxHeight: '92vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 25px 60px rgba(0,0,0,0.2)',
          }}>
            {showPauseModal ? (
              <div style={{ padding: 24 }}>
                <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Pause Reason</h3>
                {!pauseType ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <button onClick={() => setPauseType('waiting_on_parts')} style={pauseOptionStyle}>Waiting on Parts</button>
                    <button onClick={() => setPauseType('lunch')} style={pauseOptionStyle}>🍽️ Lunch</button>
                    <button onClick={() => setPauseType('other')} style={pauseOptionStyle}>Other</button>
                    <button onClick={() => setShowPauseModal(false)} style={{ ...pauseOptionStyle, color: '#999', borderColor: '#e5e5e5' }}>Cancel</button>
                  </div>
                ) : pauseType === 'waiting_on_parts' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <Field label="What part was ordered? *">
                      <input value={partName} onChange={e => setPartName(e.target.value)} style={inputStyle} placeholder="e.g. Brake pads" />
                    </Field>
                    <Field label="Expected arrival date">
                      <input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} style={inputStyle} />
                    </Field>
                    <Field label="Tracking number">
                      <input value={trackingNumber} onChange={e => setTrackingNumber(e.target.value)} style={inputStyle} placeholder="Optional" />
                    </Field>
                    <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                      <FooterBtn label="Back" color="#999" onClick={() => setPauseType(null)} />
                      <FooterBtn label="Pause Job" color="#f59e0b" disabled={!partName.trim()} onClick={submitPause} />
                    </div>
                  </div>
                ) : pauseType === 'lunch' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', padding: '10px 0' }}>
                    <p style={{ fontSize: 40, marginBottom: 4 }}>🍽️</p>
                    <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Going on lunch break</p>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Timer will be paused until you resume.</p>
                    <div style={{ display: 'flex', gap: 10, marginTop: 8, width: '100%' }}>
                      <FooterBtn label="Back" color="#999" onClick={() => setPauseType(null)} />
                      <FooterBtn label="Pause for Lunch" color="#f59e0b" onClick={submitPause} />
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <Field label="Explain why *">
                      <textarea value={pauseNote} onChange={e => setPauseNote(e.target.value)} style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} placeholder="Why are you pausing?" />
                    </Field>
                    <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                      <FooterBtn label="Back" color="#999" onClick={() => setPauseType(null)} />
                      <FooterBtn label="Pause Job" color="#f59e0b" disabled={!pauseNote.trim()} onClick={submitPause} />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Modal header */}
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e5e5' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <p style={{ fontSize: 18, fontWeight: 700 }}>#{selectedJob.vehicle.stockNumber}</p>
                        {selectedJob.scopeName === 'New Inventory' && (
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100,
                            background: '#dbeafe', color: '#1d4ed8', border: '1px solid #bfdbfe',
                            textTransform: 'uppercase', letterSpacing: '0.04em',
                          }}>New Inventory</span>
                        )}
                        {selectedJob.scopeName === 'Sold Delivery' && (
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100,
                            background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d',
                            textTransform: 'uppercase', letterSpacing: '0.04em',
                          }}>Sold Delivery</span>
                        )}
                      </div>
                      <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                        {`${selectedJob.vehicle.year ?? ''} ${selectedJob.vehicle.make} ${selectedJob.vehicle.model}`.trim()}
                        {selectedJob.vehicle.color ? ` · ${selectedJob.vehicle.color}` : ''}
                      </p>
                    </div>
                    <button onClick={closeModal} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-muted)', padding: '0 4px' }}>&times;</button>
                  </div>

                  {/* Timer block */}
                  <div style={{
                    marginTop: 16, padding: '14px 16px', borderRadius: 12,
                    background: selectedJob.timerRunning ? '#eff6ff' : '#f9fafb',
                    border: `1px solid ${selectedJob.timerRunning ? '#3b82f6' : '#e2e5ea'}`,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <div>
                      <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Labor Time</p>
                      <p style={{ fontSize: 26, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: selectedJob.timerRunning ? '#3b82f6' : 'var(--text-primary)', lineHeight: 1.2 }}>
                        {formatTime(getLiveElapsed(selectedJob))}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Estimated</p>
                      <p style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-muted)', lineHeight: 1.2 }}>{selectedJob.estimatedHours || 2}h</p>
                    </div>
                  </div>

                  {/* Time by mechanic — only when more than one worked this car. The
                      Labor Time above is the combined total; this breaks it out. */}
                  {(selectedJob.timers || []).filter(t => t.userId).length > 1 && (
                    <div style={{ marginTop: 12, padding: '12px 16px', borderRadius: 12, background: '#f9fafb', border: '1px solid #e2e5ea' }}>
                      <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Time by mechanic</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {(selectedJob.timers || []).filter(t => t.userId).map(t => {
                          const secs = getLiveEntry(t)
                          return (
                            <div key={t.userId} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                              <span style={{
                                width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                                background: chipColor(t.userId!), color: '#fff',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 10, fontWeight: 800,
                              }}>{initialsOf(t.name || '?')}</span>
                              <span style={{ fontSize: 14, fontWeight: 600 }}>{(t.name || '').split(' ')[0]}</span>
                              {t.running && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: '#3b82f6' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3b82f6', animation: 'pulse 2s infinite' }} />Working</span>}
                              {t.done && <span style={{ fontSize: 11, fontWeight: 700, color: '#16a34a' }}>✓ Done</span>}
                              <span style={{
                                marginLeft: 'auto', fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                                color: t.done ? '#16a34a' : t.running ? '#3b82f6' : 'var(--text-primary)',
                              }}>{formatTime(secs)}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Checklist */}
                <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px' }}>
                  {(() => {
                    const isInspection = modalChecklist.some(it => !!it.type)
                    const inspectionItems = modalChecklist.filter(it => !it.addedByMechanic)
                    const followupItems = modalChecklist.filter(it => !!it.addedByMechanic)
                    const inspectionDone = inspectionItems.filter(it => it.done).length
                    const followupDone = followupItems.filter(it => it.done).length
                    return (
                      <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: 'var(--text-secondary)' }}>
                        {isInspection ? 'Inspection Tasks' : 'Tasks'} ({inspectionDone}/{inspectionItems.length})
                        {isInspection && followupItems.length === 0 && (
                          <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8 }}>
                            ({doneCount}/{modalChecklist.length} total)
                          </span>
                        )}
                        {saving && <span style={{ fontWeight: 400, fontSize: 11, marginLeft: 8, color: 'var(--text-muted)' }}>Saving...</span>}
                      </p>
                    )
                  })()}
                  {modalChecklist.length === 0 ? (
                    <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No tasks assigned</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {modalChecklist.map((item, i) => {
                        // Hide declined follow-ups so they're effectively removed
                        if (item.approved === 'declined') return null
                        const isExpanded = expandedTaskIdx === i
                        const hasStructured = item.type === 'tirePsi' || item.type === 'brakePads' || item.type === 'fluids' || item.type === 'engineCheck' || item.type === 'electrical' || item.type === 'steeringCheck' || item.type === 'suspensionCheck'
                        const data = (item.data || {}) as any
                        const visiblePrev = modalChecklist.slice(0, i).reverse().find(x => x.approved !== 'declined')
                        const isFirstFollowup = item.addedByMechanic && (!visiblePrev || !visiblePrev.addedByMechanic)
                        const followupTotal = modalChecklist.filter(x => x.addedByMechanic && x.approved !== 'declined').length
                        const followupDone = modalChecklist.filter(x => x.addedByMechanic && x.done && x.approved !== 'declined').length
                        // Detect if this is the last visible inspection item (next item is undefined or a follow-up)
                        const visibleNext = modalChecklist.slice(i + 1).find(x => x.approved !== 'declined')
                        const isLastInspectionItem = !item.addedByMechanic && (!visibleNext || visibleNext.addedByMechanic)
                        const isNewInventory = selectedJob.scopeName === 'New Inventory'
                        return (
                          <Fragment key={i}>
                            {isFirstFollowup && (
                              <p style={{ fontSize: 13, fontWeight: 700, marginTop: 12, marginBottom: 4, color: 'var(--text-secondary)' }}>
                                Tasks ({followupDone}/{followupTotal})
                              </p>
                            )}
                          <div style={{
                            background: item.done ? '#f0fdf4' : '#f9fafb', borderRadius: 10,
                            border: '1px solid', borderColor: item.done ? '#bbf7d0' : '#e2e5ea',
                            overflow: 'hidden',
                          }}>
                            <div style={{
                              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                            }}>
                              <div
                                onClick={() => toggleChecklist(i)}
                                style={{
                                  width: 22, height: 22, borderRadius: 6, border: '2px solid',
                                  borderColor: item.done ? '#22c55e' : '#d1d5db',
                                  background: item.done ? '#22c55e' : '#fff',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                  cursor: 'pointer',
                                }}
                              >
                                {item.done && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                              </div>
                              <div
                                onClick={() => setExpandedTaskIdx(isExpanded ? null : i)}
                                style={{
                                  flex: 1, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                                }}
                              >
                                <span style={{ flex: 1, fontSize: 14, color: item.done ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: item.done ? 'line-through' : 'none' }}>
                                  {item.item}
                                  {(() => {
                                    const prog = structuredProgress(item)
                                    if (!prog) return null
                                    const isFull = prog.filled === prog.total
                                    return (
                                      <span style={{
                                        marginLeft: 8, fontSize: 11, fontWeight: 700,
                                        padding: '2px 8px', borderRadius: 100,
                                        background: isFull ? '#dcfce7' : '#fef3c7',
                                        color: isFull ? '#16a34a' : '#92400e',
                                        border: `1px solid ${isFull ? '#bbf7d0' : '#fcd34d'}`,
                                      }}>{prog.filled}/{prog.total}</span>
                                    )
                                  })()}
                                  {hasStructured && !isExpanded && item.note && (
                                    <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>· {item.note}</span>
                                  )}
                                </span>
                                {item.addedByMechanic && (
                                  <span style={{
                                    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100,
                                    background: item.approved === 'approved' ? '#dcfce7' : '#fef3c7',
                                    color: item.approved === 'approved' ? '#16a34a' : '#92400e',
                                    border: `1px solid ${item.approved === 'approved' ? '#bbf7d0' : '#fcd34d'}`,
                                    textTransform: 'uppercase', letterSpacing: '0.04em',
                                  }}>
                                    {item.approved === 'approved' ? 'Approved' : 'Requested'}
                                  </span>
                                )}
                                {(() => {
                                  const owner = taskOwner(item, selectedJob.assignee)
                                  if (owner) return (
                                    <span title={owner.name} style={{
                                      width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                                      background: chipColor(owner.id), color: '#fff',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      fontSize: 8, fontWeight: 800,
                                    }}>{initialsOf(owner.name)}</span>
                                  )
                                  // added task not yet assigned → needs admin
                                  return (
                                    <span style={{
                                      fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 100,
                                      background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca',
                                      textTransform: 'uppercase', letterSpacing: '0.03em', whiteSpace: 'nowrap',
                                    }}>Needs assign</span>
                                  )
                                })()}
                                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{isExpanded ? '▾' : '▸'}</span>
                              </div>
                            </div>

                            {isExpanded && (
                              <div style={{ padding: '0 12px 12px 46px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {/* Per-task hand-off: give this single task to a specific mechanic.
                                    Hidden for not-yet-approved added tasks — those use the
                                    Approve & assign control below (one action). */}
                                {boardMechanics.length >= 2 && !(item.addedByMechanic && item.approved !== 'approved') && (isAdmin || (!!boardCurrentUserId && (selectedJob.assignees || []).some(a => a.id === boardCurrentUserId))) && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Assign to:</span>
                                    {boardMechanics.map(m => {
                                      const active = item.assigneeId === m.id
                                      return (
                                        <button
                                          key={m.id}
                                          onClick={() => updateChecklistItem(i, { assigneeId: m.id, assigneeName: m.name })}
                                          style={{
                                            display: 'flex', alignItems: 'center', gap: 6,
                                            padding: '4px 10px 4px 4px', borderRadius: 100,
                                            border: active ? '1.5px solid #1a1a1a' : '1px solid var(--border)',
                                            background: active ? '#1a1a1a' : '#fff',
                                            color: active ? '#fff' : 'var(--text-secondary)',
                                            fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                          }}
                                        >
                                          <span style={{
                                            width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                                            background: chipColor(m.id), color: '#fff',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: 8, fontWeight: 800,
                                          }}>{initialsOf(m.name)}</span>
                                          {m.name.split(' ')[0]}
                                        </button>
                                      )
                                    })}
                                    {item.assigneeId && (
                                      <button
                                        onClick={() => updateChecklistItem(i, { assigneeId: null, assigneeName: null })}
                                        style={{ padding: '4px 10px', borderRadius: 100, border: '1px solid var(--border)', background: '#fff', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                                      >
                                        Unassign
                                      </button>
                                    )}
                                  </div>
                                )}
                                {item.addedByMechanic && item.approved === 'pending' && (
                                  <div style={{ padding: '8px 10px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6 }}>
                                    {isAdmin ? (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        <span style={{ fontSize: 12, color: '#92400e', fontWeight: 600 }}>Approve &amp; assign this task:</span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                          {boardMechanics.map(m => (
                                            <button
                                              key={m.id}
                                              onClick={() => updateChecklistItem(i, { approved: 'approved', assigneeId: m.id, assigneeName: m.name })}
                                              style={{
                                                display: 'flex', alignItems: 'center', gap: 6,
                                                padding: '4px 10px 4px 4px', borderRadius: 100,
                                                border: '1px solid #16a34a', background: '#f0fdf4', color: '#166534',
                                                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                              }}
                                            >
                                              <span style={{
                                                width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                                                background: chipColor(m.id), color: '#fff',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: 8, fontWeight: 800,
                                              }}>{initialsOf(m.name)}</span>
                                              {m.name.split(' ')[0]}
                                            </button>
                                          ))}
                                          {boardMechanics.length === 0 && (
                                            <button onClick={() => updateChecklistItem(i, { approved: 'approved' })} style={{ padding: '4px 10px', borderRadius: 100, border: '1px solid #16a34a', background: '#f0fdf4', color: '#16a34a', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>✓ Approve</button>
                                          )}
                                          <button onClick={() => declineFollowupTask(i)} style={{ padding: '4px 10px', borderRadius: 100, border: '1px solid #ef4444', background: '#fef2f2', color: '#ef4444', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>✗ Decline</button>
                                        </div>
                                      </div>
                                    ) : (
                                      <span style={{ fontSize: 12, color: '#92400e' }}>Waiting on admin to approve &amp; assign before this can be worked on.</span>
                                    )}
                                  </div>
                                )}

                                {item.type === 'tirePsi' && (
                                  <div>
                                    <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Tire pressure (PSI)</p>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                      {fieldsForItem(item).map(({ key, label }) => (
                                        <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                          <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                            {label}
                                            {completionAttempts.has(i) && isSubFieldEmpty(item, key) && <WarnPip />}
                                          </label>
                                          <input
                                            type="number" min="0" step="0.5" inputMode="decimal"
                                            value={data[key] ?? ''}
                                            onChange={(e) => {
                                              const next = { ...data, [key]: e.target.value === '' ? undefined : Number(e.target.value) }
                                              updateChecklistItem(i, { data: next })
                                            }}
                                            placeholder="32"
                                            style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14 }}
                                          />
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {item.type === 'brakePads' && (
                                  <div>
                                    <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Brake pad thickness (mm)</p>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                      {fieldsForItem(item).map(({ key, label }) => (
                                        <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                          <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                            {label}
                                            {completionAttempts.has(i) && isSubFieldEmpty(item, key) && <WarnPip />}
                                          </label>
                                          <input
                                            type="number" min="0" step="0.5" inputMode="decimal"
                                            value={data[key] ?? ''}
                                            onChange={(e) => {
                                              const next = { ...data, [key]: e.target.value === '' ? undefined : Number(e.target.value) }
                                              updateChecklistItem(i, { data: next })
                                            }}
                                            placeholder="8"
                                            style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14 }}
                                          />
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {item.type === 'fluids' && (
                                  <div>
                                    <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Fluids check</p>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                      {fieldsForItem(item).map(({ key, label }) => {
                                        const status = getPillStatus(data[key])
                                        const subNote = getPillNote(data[key])
                                        return (
                                          <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                              <span style={{ fontSize: 13, flex: 1, display: 'inline-flex', alignItems: 'center' }}>
                                                {label}
                                                {completionAttempts.has(i) && isSubFieldEmpty(item, key) && <WarnPip />}
                                              </span>
                                              <div style={{ display: 'flex', gap: 4 }}>
                                                {(['ok', 'topped', 'issue'] as const).map(opt => {
                                                  const active = status === opt
                                                  const colors = opt === 'ok' ? { bg: '#dcfce7', fg: '#16a34a', border: '#bbf7d0' }
                                                    : opt === 'topped' ? { bg: '#dbeafe', fg: '#2563eb', border: '#bfdbfe' }
                                                    : { bg: '#fee2e2', fg: '#dc2626', border: '#fecaca' }
                                                  const labels = { ok: 'OK', topped: 'Topped', issue: 'Issue' }
                                                  return (
                                                    <button key={opt} type="button" onClick={() => {
                                                      const next = { ...data, [key]: active ? undefined : { status: opt, note: subNote } }
                                                      updateChecklistItem(i, { data: next })
                                                    }} style={{
                                                      padding: '4px 10px', borderRadius: 6,
                                                      border: '1px solid', borderColor: active ? colors.border : 'var(--border)',
                                                      background: active ? colors.bg : '#fff', color: active ? colors.fg : 'var(--text-muted)',
                                                      fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                                    }}>{labels[opt]}</button>
                                                  )
                                                })}
                                              </div>
                                            </div>
                                            {status && ISSUE_STATUSES.has(status) && (() => {
                                              const taskKey = `${i}-${key}`
                                              const taskDraftValue = issueTaskDrafts[taskKey]
                                              const inputValue = taskDraftValue !== undefined ? taskDraftValue : subNote
                                              const canAddTask = (inputValue || '').trim().length > 0
                                              const partDraftKey = `sub-${taskKey}`
                                              const partName = partDrafts[partDraftKey] || ''
                                              const canAddPart = partName.trim().length > 0
                                              const parentItemName = modalChecklist[i]?.item || ''
                                              const addedTasksHere = modalChecklist.filter(t => t.addedByMechanic && (t as any).sourceSubField === label && (t as any).sourceItem === parentItemName)
                                              const addedPartsHere = sessionAddedParts.filter(p => p.sourceSubField === label && p.sourceItem === parentItemName)
                                              const persistIssueNote = (val: string) => {
                                                if (val === subNote) return
                                                const next = { ...data, [key]: { status, note: val } }
                                                updateChecklistItem(i, { data: next })
                                              }
                                              const openPartModal = () => {
                                                setAddPartFromTask({ name: partName, sourceItem: parentItemName, sourceSubField: label })
                                                setPartDrafts(prev => ({ ...prev, [partDraftKey]: '' }))
                                              }
                                              return (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 10 }}>
                                                  {/* Issue / task input + Add task button — slim, one row */}
                                                  <div>
                                                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                                                      What&apos;s the issue?
                                                    </label>
                                                    <div style={{ display: 'flex', gap: 6 }}>
                                                      <input
                                                        type="text"
                                                        value={inputValue}
                                                        onChange={(e) => setIssueTaskDrafts(prev => ({ ...prev, [taskKey]: e.target.value }))}
                                                        onBlur={(e) => persistIssueNote(e.target.value)}
                                                        onKeyDown={(e) => { if (e.key === 'Enter' && canAddTask) { e.preventDefault(); persistIssueNote(inputValue); openSubFieldEstimateModal(i, key, label) } }}
                                                        placeholder={`What's the issue with ${label.toLowerCase()}?`}
                                                        style={{ flex: 1, padding: '5px 8px', borderRadius: 6, border: '1px dashed #fca5a5', fontSize: 12, background: '#fef2f2' }}
                                                      />
                                                      <button
                                                        type="button"
                                                        onClick={() => { persistIssueNote(inputValue); openSubFieldEstimateModal(i, key, label) }}
                                                        disabled={!canAddTask || saving}
                                                        style={{
                                                          padding: '4px 12px', borderRadius: 6, border: 'none',
                                                          background: '#dc2626', color: '#fff', fontSize: 12, fontWeight: 600,
                                                          cursor: 'pointer', opacity: !canAddTask || saving ? 0.5 : 1,
                                                          whiteSpace: 'nowrap', minHeight: 0, lineHeight: 1.2,
                                                        }}
                                                      >Add task</button>
                                                    </div>
                                                  </div>
                                                  {/* Add a part — slim form; click opens modal pre-filled */}
                                                  <div>
                                                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                                                      Add a part
                                                    </label>
                                                    <div style={{ display: 'flex', gap: 6 }}>
                                                      <input
                                                        type="text"
                                                        value={partName}
                                                        onChange={(e) => setPartDrafts(prev => ({ ...prev, [partDraftKey]: e.target.value }))}
                                                        onKeyDown={(e) => { if (e.key === 'Enter' && canAddPart) { e.preventDefault(); openPartModal() } }}
                                                        placeholder={`e.g. ${label}`}
                                                        style={{ flex: 1, padding: '5px 8px', borderRadius: 6, border: '1px dashed #93c5fd', fontSize: 12, background: '#f0f9ff' }}
                                                      />
                                                      <button
                                                        type="button"
                                                        onClick={openPartModal}
                                                        disabled={!canAddPart || saving}
                                                        style={{
                                                          padding: '4px 12px', borderRadius: 6, border: 'none',
                                                          background: '#1d4ed8', color: '#fff', fontSize: 12, fontWeight: 600,
                                                          cursor: 'pointer', opacity: !canAddPart || saving ? 0.5 : 1,
                                                          whiteSpace: 'nowrap', minHeight: 0, lineHeight: 1.2,
                                                        }}
                                                      >Add part</button>
                                                    </div>
                                                  </div>
                                                  {/* Inline confirmation — tasks added from this sub-field */}
                                                  {addedTasksHere.length > 0 && (
                                                    <div style={{ padding: '6px 8px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6 }}>
                                                      <p style={{ fontSize: 10, fontWeight: 700, color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 4px' }}>
                                                        Tasks added ({addedTasksHere.length})
                                                      </p>
                                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                                        {addedTasksHere.map((t, idx) => (
                                                          <div key={idx} style={{ fontSize: 11, color: '#991b1b', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                            <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#dc2626' }} />
                                                            <span>{t.item}</span>
                                                          </div>
                                                        ))}
                                                      </div>
                                                    </div>
                                                  )}
                                                  {/* Inline confirmation — parts added from this sub-field */}
                                                  {addedPartsHere.length > 0 && (
                                                    <div style={{ padding: '6px 8px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6 }}>
                                                      <p style={{ fontSize: 10, fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 4px' }}>
                                                        Parts added ({addedPartsHere.length})
                                                      </p>
                                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                                        {addedPartsHere.map((p, idx) => (
                                                          <div key={idx} style={{ fontSize: 11, color: '#1d4ed8', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                            <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#2563eb' }} />
                                                            <span>{p.name}</span>
                                                          </div>
                                                        ))}
                                                      </div>
                                                    </div>
                                                  )}
                                                </div>
                                              )
                                            })()}
                                          </div>
                                        )
                                      })}
                                    </div>
                                  </div>
                                )}

                                {(item.type === 'engineCheck' || item.type === 'electrical') && (
                                  <div>
                                    <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                                      {item.type === 'engineCheck' ? 'Engine components' : 'Electrical systems'}
                                    </p>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                      {fieldsForItem(item).map(({ key, label }) => {
                                        const status = getPillStatus(data[key])
                                        const subNote = getPillNote(data[key])
                                        return (
                                          <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                              <span style={{ fontSize: 13, flex: 1, display: 'inline-flex', alignItems: 'center' }}>
                                                {label}
                                                {completionAttempts.has(i) && isSubFieldEmpty(item, key) && <WarnPip />}
                                              </span>
                                              <div style={{ display: 'flex', gap: 4 }}>
                                                {(['ok', 'issue'] as const).map(opt => {
                                                  const active = status === opt
                                                  const colors = opt === 'ok'
                                                    ? { bg: '#dcfce7', fg: '#16a34a', border: '#bbf7d0' }
                                                    : { bg: '#fee2e2', fg: '#dc2626', border: '#fecaca' }
                                                  const labels = { ok: 'OK', issue: 'Issue' }
                                                  return (
                                                    <button key={opt} type="button" onClick={() => {
                                                      const next = { ...data, [key]: active ? undefined : { status: opt, note: subNote } }
                                                      updateChecklistItem(i, { data: next })
                                                    }} style={{
                                                      padding: '4px 10px', borderRadius: 6,
                                                      border: '1px solid', borderColor: active ? colors.border : 'var(--border)',
                                                      background: active ? colors.bg : '#fff', color: active ? colors.fg : 'var(--text-muted)',
                                                      fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                                    }}>{labels[opt]}</button>
                                                  )
                                                })}
                                              </div>
                                            </div>
                                            {status && ISSUE_STATUSES.has(status) && (() => {
                                              const taskKey = `${i}-${key}`
                                              const taskDraftValue = issueTaskDrafts[taskKey]
                                              const inputValue = taskDraftValue !== undefined ? taskDraftValue : subNote
                                              const canAddTask = (inputValue || '').trim().length > 0
                                              const partDraftKey = `sub-${taskKey}`
                                              const partName = partDrafts[partDraftKey] || ''
                                              const canAddPart = partName.trim().length > 0
                                              const parentItemName = modalChecklist[i]?.item || ''
                                              const addedTasksHere = modalChecklist.filter(t => t.addedByMechanic && (t as any).sourceSubField === label && (t as any).sourceItem === parentItemName)
                                              const addedPartsHere = sessionAddedParts.filter(p => p.sourceSubField === label && p.sourceItem === parentItemName)
                                              const persistIssueNote = (val: string) => {
                                                if (val === subNote) return
                                                const next = { ...data, [key]: { status, note: val } }
                                                updateChecklistItem(i, { data: next })
                                              }
                                              const openPartModal = () => {
                                                setAddPartFromTask({ name: partName, sourceItem: parentItemName, sourceSubField: label })
                                                setPartDrafts(prev => ({ ...prev, [partDraftKey]: '' }))
                                              }
                                              return (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 10 }}>
                                                  {/* Issue / task input + Add task button — slim, one row */}
                                                  <div>
                                                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                                                      What&apos;s the issue?
                                                    </label>
                                                    <div style={{ display: 'flex', gap: 6 }}>
                                                      <input
                                                        type="text"
                                                        value={inputValue}
                                                        onChange={(e) => setIssueTaskDrafts(prev => ({ ...prev, [taskKey]: e.target.value }))}
                                                        onBlur={(e) => persistIssueNote(e.target.value)}
                                                        onKeyDown={(e) => { if (e.key === 'Enter' && canAddTask) { e.preventDefault(); persistIssueNote(inputValue); openSubFieldEstimateModal(i, key, label) } }}
                                                        placeholder={`What's the issue with ${label.toLowerCase()}?`}
                                                        style={{ flex: 1, padding: '5px 8px', borderRadius: 6, border: '1px dashed #fca5a5', fontSize: 12, background: '#fef2f2' }}
                                                      />
                                                      <button
                                                        type="button"
                                                        onClick={() => { persistIssueNote(inputValue); openSubFieldEstimateModal(i, key, label) }}
                                                        disabled={!canAddTask || saving}
                                                        style={{
                                                          padding: '4px 12px', borderRadius: 6, border: 'none',
                                                          background: '#dc2626', color: '#fff', fontSize: 12, fontWeight: 600,
                                                          cursor: 'pointer', opacity: !canAddTask || saving ? 0.5 : 1,
                                                          whiteSpace: 'nowrap', minHeight: 0, lineHeight: 1.2,
                                                        }}
                                                      >Add task</button>
                                                    </div>
                                                  </div>
                                                  {/* Add a part — slim form; click opens modal pre-filled */}
                                                  <div>
                                                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                                                      Add a part
                                                    </label>
                                                    <div style={{ display: 'flex', gap: 6 }}>
                                                      <input
                                                        type="text"
                                                        value={partName}
                                                        onChange={(e) => setPartDrafts(prev => ({ ...prev, [partDraftKey]: e.target.value }))}
                                                        onKeyDown={(e) => { if (e.key === 'Enter' && canAddPart) { e.preventDefault(); openPartModal() } }}
                                                        placeholder={`e.g. ${label}`}
                                                        style={{ flex: 1, padding: '5px 8px', borderRadius: 6, border: '1px dashed #93c5fd', fontSize: 12, background: '#f0f9ff' }}
                                                      />
                                                      <button
                                                        type="button"
                                                        onClick={openPartModal}
                                                        disabled={!canAddPart || saving}
                                                        style={{
                                                          padding: '4px 12px', borderRadius: 6, border: 'none',
                                                          background: '#1d4ed8', color: '#fff', fontSize: 12, fontWeight: 600,
                                                          cursor: 'pointer', opacity: !canAddPart || saving ? 0.5 : 1,
                                                          whiteSpace: 'nowrap', minHeight: 0, lineHeight: 1.2,
                                                        }}
                                                      >Add part</button>
                                                    </div>
                                                  </div>
                                                  {/* Inline confirmation — tasks added from this sub-field */}
                                                  {addedTasksHere.length > 0 && (
                                                    <div style={{ padding: '6px 8px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6 }}>
                                                      <p style={{ fontSize: 10, fontWeight: 700, color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 4px' }}>
                                                        Tasks added ({addedTasksHere.length})
                                                      </p>
                                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                                        {addedTasksHere.map((t, idx) => (
                                                          <div key={idx} style={{ fontSize: 11, color: '#991b1b', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                            <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#dc2626' }} />
                                                            <span>{t.item}</span>
                                                          </div>
                                                        ))}
                                                      </div>
                                                    </div>
                                                  )}
                                                  {/* Inline confirmation — parts added from this sub-field */}
                                                  {addedPartsHere.length > 0 && (
                                                    <div style={{ padding: '6px 8px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6 }}>
                                                      <p style={{ fontSize: 10, fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 4px' }}>
                                                        Parts added ({addedPartsHere.length})
                                                      </p>
                                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                                        {addedPartsHere.map((p, idx) => (
                                                          <div key={idx} style={{ fontSize: 11, color: '#1d4ed8', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                            <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#2563eb' }} />
                                                            <span>{p.name}</span>
                                                          </div>
                                                        ))}
                                                      </div>
                                                    </div>
                                                  )}
                                                </div>
                                              )
                                            })()}
                                          </div>
                                        )
                                      })}
                                    </div>
                                  </div>
                                )}

                                {(item.type === 'steeringCheck' || item.type === 'suspensionCheck') && (
                                  <div>
                                    <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                                      {item.type === 'steeringCheck' ? 'Steering' : 'Suspension'}
                                    </p>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                      {fieldsForItem(item).map(({ key, label }) => {
                                        const status = getPillStatus(data[key])
                                        const subNote = getPillNote(data[key])
                                        return (
                                          <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                              <span style={{ fontSize: 13, flex: 1, display: 'inline-flex', alignItems: 'center' }}>
                                                {label}
                                                {completionAttempts.has(i) && isSubFieldEmpty(item, key) && <WarnPip />}
                                              </span>
                                              <div style={{ display: 'flex', gap: 4 }}>
                                                {(['no', 'yes'] as const).map(opt => {
                                                  const active = status === opt
                                                  const colors = opt === 'no'
                                                    ? { bg: '#dcfce7', fg: '#16a34a', border: '#bbf7d0' }
                                                    : { bg: '#fee2e2', fg: '#dc2626', border: '#fecaca' }
                                                  const labels = { no: 'No', yes: 'Yes' }
                                                  return (
                                                    <button key={opt} type="button" onClick={() => {
                                                      const next = { ...data, [key]: active ? undefined : { status: opt, note: subNote } }
                                                      updateChecklistItem(i, { data: next })
                                                    }} style={{
                                                      padding: '4px 10px', borderRadius: 6,
                                                      border: '1px solid', borderColor: active ? colors.border : 'var(--border)',
                                                      background: active ? colors.bg : '#fff', color: active ? colors.fg : 'var(--text-muted)',
                                                      fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                                    }}>{labels[opt]}</button>
                                                  )
                                                })}
                                              </div>
                                            </div>
                                            {status && ISSUE_STATUSES.has(status) && (() => {
                                              const taskKey = `${i}-${key}`
                                              const taskDraftValue = issueTaskDrafts[taskKey]
                                              const inputValue = taskDraftValue !== undefined ? taskDraftValue : subNote
                                              const canAddTask = (inputValue || '').trim().length > 0
                                              const partDraftKey = `sub-${taskKey}`
                                              const partName = partDrafts[partDraftKey] || ''
                                              const canAddPart = partName.trim().length > 0
                                              const parentItemName = modalChecklist[i]?.item || ''
                                              const addedTasksHere = modalChecklist.filter(t => t.addedByMechanic && (t as any).sourceSubField === label && (t as any).sourceItem === parentItemName)
                                              const addedPartsHere = sessionAddedParts.filter(p => p.sourceSubField === label && p.sourceItem === parentItemName)
                                              const persistIssueNote = (val: string) => {
                                                if (val === subNote) return
                                                const next = { ...data, [key]: { status, note: val } }
                                                updateChecklistItem(i, { data: next })
                                              }
                                              const openPartModal = () => {
                                                setAddPartFromTask({ name: partName, sourceItem: parentItemName, sourceSubField: label })
                                                setPartDrafts(prev => ({ ...prev, [partDraftKey]: '' }))
                                              }
                                              return (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 10 }}>
                                                  {/* Issue / task input + Add task button — slim, one row */}
                                                  <div>
                                                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                                                      What&apos;s the issue?
                                                    </label>
                                                    <div style={{ display: 'flex', gap: 6 }}>
                                                      <input
                                                        type="text"
                                                        value={inputValue}
                                                        onChange={(e) => setIssueTaskDrafts(prev => ({ ...prev, [taskKey]: e.target.value }))}
                                                        onBlur={(e) => persistIssueNote(e.target.value)}
                                                        onKeyDown={(e) => { if (e.key === 'Enter' && canAddTask) { e.preventDefault(); persistIssueNote(inputValue); openSubFieldEstimateModal(i, key, label) } }}
                                                        placeholder={`What's the issue with ${label.toLowerCase()}?`}
                                                        style={{ flex: 1, padding: '5px 8px', borderRadius: 6, border: '1px dashed #fca5a5', fontSize: 12, background: '#fef2f2' }}
                                                      />
                                                      <button
                                                        type="button"
                                                        onClick={() => { persistIssueNote(inputValue); openSubFieldEstimateModal(i, key, label) }}
                                                        disabled={!canAddTask || saving}
                                                        style={{
                                                          padding: '4px 12px', borderRadius: 6, border: 'none',
                                                          background: '#dc2626', color: '#fff', fontSize: 12, fontWeight: 600,
                                                          cursor: 'pointer', opacity: !canAddTask || saving ? 0.5 : 1,
                                                          whiteSpace: 'nowrap', minHeight: 0, lineHeight: 1.2,
                                                        }}
                                                      >Add task</button>
                                                    </div>
                                                  </div>
                                                  {/* Add a part — slim form; click opens modal pre-filled */}
                                                  <div>
                                                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                                                      Add a part
                                                    </label>
                                                    <div style={{ display: 'flex', gap: 6 }}>
                                                      <input
                                                        type="text"
                                                        value={partName}
                                                        onChange={(e) => setPartDrafts(prev => ({ ...prev, [partDraftKey]: e.target.value }))}
                                                        onKeyDown={(e) => { if (e.key === 'Enter' && canAddPart) { e.preventDefault(); openPartModal() } }}
                                                        placeholder={`e.g. ${label}`}
                                                        style={{ flex: 1, padding: '5px 8px', borderRadius: 6, border: '1px dashed #93c5fd', fontSize: 12, background: '#f0f9ff' }}
                                                      />
                                                      <button
                                                        type="button"
                                                        onClick={openPartModal}
                                                        disabled={!canAddPart || saving}
                                                        style={{
                                                          padding: '4px 12px', borderRadius: 6, border: 'none',
                                                          background: '#1d4ed8', color: '#fff', fontSize: 12, fontWeight: 600,
                                                          cursor: 'pointer', opacity: !canAddPart || saving ? 0.5 : 1,
                                                          whiteSpace: 'nowrap', minHeight: 0, lineHeight: 1.2,
                                                        }}
                                                      >Add part</button>
                                                    </div>
                                                  </div>
                                                  {/* Inline confirmation — tasks added from this sub-field */}
                                                  {addedTasksHere.length > 0 && (
                                                    <div style={{ padding: '6px 8px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6 }}>
                                                      <p style={{ fontSize: 10, fontWeight: 700, color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 4px' }}>
                                                        Tasks added ({addedTasksHere.length})
                                                      </p>
                                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                                        {addedTasksHere.map((t, idx) => (
                                                          <div key={idx} style={{ fontSize: 11, color: '#991b1b', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                            <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#dc2626' }} />
                                                            <span>{t.item}</span>
                                                          </div>
                                                        ))}
                                                      </div>
                                                    </div>
                                                  )}
                                                  {/* Inline confirmation — parts added from this sub-field */}
                                                  {addedPartsHere.length > 0 && (
                                                    <div style={{ padding: '6px 8px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6 }}>
                                                      <p style={{ fontSize: 10, fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 4px' }}>
                                                        Parts added ({addedPartsHere.length})
                                                      </p>
                                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                                        {addedPartsHere.map((p, idx) => (
                                                          <div key={idx} style={{ fontSize: 11, color: '#1d4ed8', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                            <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#2563eb' }} />
                                                            <span>{p.name}</span>
                                                          </div>
                                                        ))}
                                                      </div>
                                                    </div>
                                                  )}
                                                </div>
                                              )
                                            })()}
                                          </div>
                                        )
                                      })}
                                    </div>
                                  </div>
                                )}

                                {/* Subtle divider between inspection fields and the wrap-up section */}
                                <div style={{
                                  display: 'flex', flexDirection: 'column', gap: 10,
                                  marginTop: 4, paddingTop: 12, borderTop: '1px solid #ececec',
                                }}>
                                  {/* "+ Add task" — only on regular items, sent to admin for approval */}
                                  {!item.addedByMechanic && (() => {
                                    const taskName = followupDrafts[i] || ''
                                    const canAdd = taskName.trim().length > 0
                                    // Tasks added from THIS item (inline confirmation so user doesn't have to scroll)
                                    const addedHere = modalChecklist.filter(c => c.addedByMechanic && (c as any).sourceItem === item.item)
                                    return (
                                      <div>
                                        <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                                          Add task (sent for admin approval)
                                        </label>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                          <input
                                            type="text"
                                            value={taskName}
                                            onChange={(e) => setFollowupDrafts(prev => ({ ...prev, [i]: e.target.value }))}
                                            onKeyDown={(e) => { if (e.key === 'Enter' && canAdd) { e.preventDefault(); openSimpleEstimateModal(i) } }}
                                            placeholder="e.g. Replace front brake pads"
                                            style={{ flex: 1, padding: '5px 8px', borderRadius: 6, border: '1px dashed var(--border)', fontSize: 12, background: '#fafafa' }}
                                          />
                                          <button
                                            type="button"
                                            onClick={() => openSimpleEstimateModal(i)}
                                            disabled={!canAdd || saving}
                                            style={{
                                              padding: '4px 12px', borderRadius: 6, border: 'none',
                                              background: '#1a1a1a', color: '#dffd6e', fontSize: 12, fontWeight: 600,
                                              cursor: 'pointer', opacity: !canAdd || saving ? 0.5 : 1,
                                              minHeight: 0, lineHeight: 1.2,
                                            }}
                                          >Add task</button>
                                        </div>
                                        {/* "Add a part" — slim form; click opens the part modal with name pre-filled */}
                                        {(() => {
                                          const partDraftKey = `item-${i}`
                                          const partName = partDrafts[partDraftKey] || ''
                                          const canAddPart = partName.trim().length > 0
                                          const openPartModal = () => {
                                            setAddPartFromTask({ name: partName, sourceItem: item.item })
                                            setPartDrafts(prev => ({ ...prev, [partDraftKey]: '' }))
                                          }
                                          return (
                                            <div style={{ marginTop: 8 }}>
                                              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                                                Add a part
                                              </label>
                                              <div style={{ display: 'flex', gap: 6 }}>
                                                <input
                                                  type="text"
                                                  value={partName}
                                                  onChange={(e) => setPartDrafts(prev => ({ ...prev, [partDraftKey]: e.target.value }))}
                                                  onKeyDown={(e) => { if (e.key === 'Enter' && canAddPart) { e.preventDefault(); openPartModal() } }}
                                                  placeholder="e.g. Brake pad set"
                                                  style={{ flex: 1, padding: '5px 8px', borderRadius: 6, border: '1px dashed #93c5fd', fontSize: 12, background: '#f0f9ff' }}
                                                />
                                                <button
                                                  type="button"
                                                  onClick={openPartModal}
                                                  disabled={!canAddPart || saving}
                                                  style={{
                                                    padding: '4px 12px', borderRadius: 6, border: 'none',
                                                    background: '#1d4ed8', color: '#fff', fontSize: 12, fontWeight: 600,
                                                    cursor: 'pointer', opacity: !canAddPart || saving ? 0.5 : 1,
                                                    whiteSpace: 'nowrap', minHeight: 0, lineHeight: 1.2,
                                                  }}
                                                >Add part</button>
                                              </div>
                                            </div>
                                          )
                                        })()}
                                        {/* Inline confirmation: tasks added from this item appear right here */}
                                        {addedHere.length > 0 && (
                                          <div style={{ marginTop: 8, padding: '8px 10px', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 6 }}>
                                            <p style={{ fontSize: 10, fontWeight: 700, color: '#5b21b6', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 4px' }}>
                                              Added from this task ({addedHere.length})
                                            </p>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                              {addedHere.map((t, idx) => (
                                                <div key={idx} style={{ fontSize: 12, color: '#5b21b6', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                  <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#7c3aed' }} />
                                                  <span>{t.item}</span>
                                                  {t.estimatedHours != null && (
                                                    <span style={{ color: '#7c3aed', fontWeight: 600 }}>· {t.estimatedHours}h</span>
                                                  )}
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                        {/* Inline confirmation: parts added from this item */}
                                        {(() => {
                                          const addedPartsHere = sessionAddedParts.filter(p => p.sourceItem === item.item && !p.sourceSubField)
                                          if (addedPartsHere.length === 0) return null
                                          return (
                                            <div style={{ marginTop: 8, padding: '8px 10px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6 }}>
                                              <p style={{ fontSize: 10, fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 4px' }}>
                                                Parts added from this task ({addedPartsHere.length})
                                              </p>
                                              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                                {addedPartsHere.map((p, idx) => (
                                                  <div key={idx} style={{ fontSize: 12, color: '#1d4ed8', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#2563eb' }} />
                                                    <span>{p.name}</span>
                                                  </div>
                                                ))}
                                              </div>
                                            </div>
                                          )
                                        })()}
                                      </div>
                                    )
                                  })()}

                                  {/* Generic note for every task */}
                                  <div>
                                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Additional notes</label>
                                    <textarea
                                      rows={2}
                                      defaultValue={item.note || ''}
                                      onBlur={(e) => {
                                        if (e.target.value !== (item.note || '')) updateChecklistItem(i, { note: e.target.value })
                                      }}
                                      placeholder="Add details..."
                                      style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, resize: 'vertical' }}
                                    />
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                          {isLastInspectionItem && isNewInventory && (() => {
                            const allDone = modalChecklist.filter(x => !x.addedByMechanic).every(x => x.done)
                            return (
                              <button
                                type="button"
                                disabled={!allDone || saving}
                                onClick={async () => {
                                  if (!confirm('Complete inspection? A report will be emailed and the vehicle will move to admin routing.')) return
                                  setSaving(true)
                                  try {
                                    const res = await fetch(`/api/stages/${selectedJob.id}/complete-inspection`, { method: 'POST' })
                                    if (!res.ok) {
                                      const err = await res.json()
                                      alert(err.message || err.error || 'Could not complete inspection')
                                      setSaving(false)
                                      return
                                    }
                                    setSelectedJob(null)
                                    fetchData()
                                  } catch {
                                    setSaving(false)
                                  }
                                }}
                                style={{
                                  width: '100%', marginTop: 4, padding: '12px 16px',
                                  borderRadius: 10, border: 'none',
                                  background: allDone ? '#16a34a' : '#e2e5ea',
                                  color: allDone ? '#fff' : '#999',
                                  fontSize: 14, fontWeight: 700,
                                  cursor: allDone && !saving ? 'pointer' : 'not-allowed',
                                  opacity: saving ? 0.5 : 1,
                                }}
                                title={!allDone ? 'Finish all inspection tasks first' : ''}
                              >
                                {saving ? 'Sending report...' : 'Complete Inspection'}
                              </button>
                            )
                          })()}
                          </Fragment>
                        )
                      })}
                    </div>
                  )}

                </div>

                {/* Admin: inline + Add Task — appends to the current stage's
                    checklist directly (no admin-approval round-trip). */}
                {isAdmin && (
                  <div style={{ padding: '0 24px 14px' }}>
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault()
                        const input = e.currentTarget.elements.namedItem('newTask') as HTMLInputElement
                        const trimmed = input.value.trim()
                        if (!trimmed) return
                        const updated = [...modalChecklist, { item: trimmed, done: false, note: '' }]
                        setModalChecklist(updated)
                        input.value = ''
                        try {
                          await fetch(`/api/stages/${selectedJob.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ checklist: updated }),
                          })
                        } catch { /* ignore */ }
                      }}
                      style={{ display: 'flex', gap: 8 }}
                    >
                      <input
                        name="newTask"
                        placeholder="+ Add task..."
                        style={{
                          flex: 1, padding: '9px 12px', borderRadius: 10,
                          border: '1px solid #e5e5e5', fontSize: 13, background: '#fff',
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
                  </div>
                )}

                {/* Parts Section */}
                <div style={{ padding: '0 24px 16px' }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
                    Parts {mechParts.length > 0 ? `(${mechParts.length})` : ''}
                  </p>
                  {mechParts.filter(p => p.status !== 'received').map(part => {
                    const sLabels: Record<string,string> = { requested: 'Requested', sourced: 'Pending Approval', ready_to_order: 'Ready to Order', ordered: 'Ordered' }
                    const sColors: Record<string,{bg:string;color:string}> = { requested: {bg:'#fef2f2',color:'#ef4444'}, sourced: {bg:'#fef9c3',color:'#a16207'}, ready_to_order: {bg:'#eff6ff',color:'#2563eb'}, ordered: {bg:'#fefce8',color:'#eab308'} }
                    const sc = sColors[part.status] || sColors.requested
                    return (
                      <div key={part.id} style={{ padding: '8px 10px', marginBottom: 6, borderRadius: 8, background: '#f8f9fa', border: '1px solid #e5e7eb' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 12, fontWeight: 600 }}>{part.name}</span>
                              <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 5px', borderRadius: 3, background: sc.bg, color: sc.color }}>{sLabels[part.status]}</span>
                            </div>
                            {part.url && <a href={part.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#2563eb', textDecoration: 'none', wordBreak: 'break-all' }}>{part.url.length > 40 ? part.url.slice(0, 40) + '...' : part.url}</a>}
                          </div>
                          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                            {part.status === 'requested' && !part.url && (
                              <button onClick={() => { setMechPartsUrlId(part.id); setMechPartsUrlInput('') }} style={{ padding: '3px 6px', borderRadius: 4, border: '1px solid #2563eb', background: '#eff6ff', color: '#2563eb', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>Add Link</button>
                            )}
                            {part.status === 'sourced' && isAdmin && (
                              <>
                                <button onClick={async () => { setMechPartsSaving(true); await fetch(`/api/parts/${part.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'ready_to_order' }) }); setMechPartsSaving(false); fetch(`/api/parts?vehicleId=${selectedJob.vehicle.id}`).then(r => r.json()).then(d => setMechParts(d.parts || [])) }} style={{ padding: '3px 6px', borderRadius: 4, border: '1px solid #16a34a', background: '#f0fdf4', color: '#16a34a', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>✓</button>
                                <button onClick={async () => { setMechPartsSaving(true); await fetch(`/api/parts/${part.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'requested', url: null }) }); setMechPartsSaving(false); fetch(`/api/parts?vehicleId=${selectedJob.vehicle.id}`).then(r => r.json()).then(d => setMechParts(d.parts || [])) }} style={{ padding: '3px 6px', borderRadius: 4, border: '1px solid #ef4444', background: '#fef2f2', color: '#ef4444', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>✗</button>
                              </>
                            )}
                            {part.status === 'ready_to_order' && isAdmin && (
                              <button onClick={() => setMechOrderModal({ id: part.id, name: part.name })} style={{ padding: '3px 6px', borderRadius: 4, border: '1px solid #eab308', background: '#fefce8', color: '#a16207', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>Order</button>
                            )}
                            {part.status === 'ordered' && isAdmin && (
                              <button onClick={async () => { setMechPartsSaving(true); await fetch(`/api/parts/${part.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'received' }) }); setMechPartsSaving(false); fetch(`/api/parts?vehicleId=${selectedJob.vehicle.id}`).then(r => r.json()).then(d => setMechParts(d.parts || [])) }} style={{ padding: '3px 6px', borderRadius: 4, border: '1px solid #16a34a', background: '#f0fdf4', color: '#16a34a', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>Received</button>
                            )}
                            {isAdmin && (
                              <button onClick={async () => { if (!confirm('Delete this part?')) return; setMechPartsSaving(true); await fetch(`/api/parts/${part.id}`, { method: 'DELETE' }); setMechPartsSaving(false); fetch(`/api/parts?vehicleId=${selectedJob.vehicle.id}`).then(r => r.json()).then(d => setMechParts(d.parts || [])) }} style={{ padding: '3px 5px', borderRadius: 4, border: '1px solid #fca5a5', background: '#fef2f2', color: '#ef4444', fontSize: 10, cursor: 'pointer', lineHeight: 1 }} title="Delete">🗑</button>
                            )}
                          </div>
                        </div>
                        {mechPartsUrlId === part.id && (
                          <div style={{ display: 'flex', gap: 5, marginTop: 6 }}>
                            <input type="url" value={mechPartsUrlInput} onChange={e => setMechPartsUrlInput(e.target.value)} placeholder="Paste link..." autoFocus
                              onKeyDown={async e => { if (e.key === 'Enter' && mechPartsUrlInput.trim()) { e.preventDefault(); setMechPartsSaving(true); await fetch(`/api/parts/${part.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: mechPartsUrlInput }) }); setMechPartsUrlId(null); setMechPartsUrlInput(''); setMechPartsSaving(false); fetch(`/api/parts?vehicleId=${selectedJob.vehicle.id}`).then(r => r.json()).then(d => setMechParts(d.parts || [])) } }}
                              style={{ flex: 1, padding: '5px 7px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11 }} />
                            <button onClick={() => setMechPartsUrlId(null)} style={{ padding: '5px 7px', borderRadius: 4, border: '1px solid var(--border)', background: '#fff', fontSize: 10, cursor: 'pointer' }}>Cancel</button>
                            <button onClick={async () => { if (!mechPartsUrlInput.trim()) return; setMechPartsSaving(true); await fetch(`/api/parts/${part.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: mechPartsUrlInput }) }); setMechPartsUrlId(null); setMechPartsUrlInput(''); setMechPartsSaving(false); fetch(`/api/parts?vehicleId=${selectedJob.vehicle.id}`).then(r => r.json()).then(d => setMechParts(d.parts || [])) }}
                              disabled={mechPartsSaving || !mechPartsUrlInput.trim()} style={{ padding: '5px 7px', borderRadius: 4, border: 'none', background: '#1a1a1a', color: '#dffd6e', fontSize: 10, fontWeight: 600, cursor: 'pointer', opacity: mechPartsSaving || !mechPartsUrlInput.trim() ? 0.5 : 1 }}>Submit</button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {mechParts.filter(p => p.status !== 'received').length === 0 && (
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '6px 0' }}>No pending parts</p>
                  )}

                  {/* Inline add — type a name, press Add, optional link + assignee
                      appear, Save commits. Replaces the old toggle/inline form. */}
                  {isAdmin && (
                    <div style={{ marginTop: 8 }}>
                      <AddPartInline
                        vehicleId={selectedJob.vehicle.id}
                        onAdded={() => {
                          fetch(`/api/parts?vehicleId=${selectedJob.vehicle.id}`)
                            .then(r => r.json())
                            .then(d => setMechParts(d.parts || []))
                            .catch(() => {})
                        }}
                      />
                    </div>
                  )}
                </div>

                {/* Footer actions */}
                <div style={{ padding: '12px 24px 20px', borderTop: '1px solid #e5e5e5', display: 'flex', gap: 10 }}>
                  {selectedJob.status === 'pending' && (
                    <FooterBtn label={data.isWorkHours ? 'Start Job' : 'Outside Work Hours'} color="#3b82f6" disabled={acting || !data.isWorkHours} onClick={() => doAction('start', selectedJob.id)} full />
                  )}
                  {selectedJob.timerRunning && (
                    <>
                      <FooterBtn label="Pause" color="#f59e0b" disabled={acting} onClick={() => setShowPauseModal(true)} />
                      <FooterBtn label="Complete" color="#22c55e" disabled={acting} onClick={() => doAction('complete', selectedJob.id)} />
                    </>
                  )}
                  {!selectedJob.timerRunning && selectedJob.status === 'in_progress' && (
                    <FooterBtn label={data.isWorkHours ? 'Resume Job' : 'Outside Work Hours'} color="#3b82f6" disabled={acting || !data.isWorkHours} onClick={() => doAction('resume', selectedJob.id)} full />
                  )}
                </div>

                {/* Admin actions */}
                {isAdmin && (
                  <div style={{ padding: '0 24px 16px', display: 'flex', gap: 10 }}>
                    <button
                      onClick={() => { setExternalModal(selectedJob); closeModal() }}
                      style={{
                        flex: 1, padding: '10px 0', borderRadius: 10,
                        border: '1px solid #f59e0b', background: '#fffbeb',
                        fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#b45309',
                      }}
                    >
                      Send to External Repair
                    </button>
                    <button
                      onClick={() => { setDeleteConfirm(selectedJob); closeModal() }}
                      style={{
                        flex: 1, padding: '10px 0', borderRadius: 10,
                        border: '1px solid #fca5a5', background: '#fef2f2',
                        fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#dc2626',
                      }}
                    >
                      Delete Vehicle
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Time Extension Request Modal */}
      {timeExtJob && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }} onClick={() => { setTimeExtJob(null); setTimeExtHours(''); setTimeExtNote('') }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 400,
            boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
          }}>
            <p style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Request More Time</p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
              #{timeExtJob.vehicle.stockNumber} — {`${timeExtJob.vehicle.year ?? ''} ${timeExtJob.vehicle.make} ${timeExtJob.vehicle.model}`.trim()}
            </p>

            <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: 'block' }}>Additional hours needed</label>
            <input
              type="number" step="0.5" min="0.5"
              value={timeExtHours} onChange={e => setTimeExtHours(e.target.value)}
              placeholder="e.g. 2"
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e2e5ea',
                fontSize: 14, background: '#f9fafb', outline: 'none', marginBottom: 12,
              }}
            />

            <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: 'block' }}>Reason (optional)</label>
            <input
              type="text" value={timeExtNote} onChange={e => setTimeExtNote(e.target.value)}
              placeholder="e.g. Found additional rust underneath"
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e2e5ea',
                fontSize: 14, background: '#f9fafb', outline: 'none', marginBottom: 20,
              }}
            />

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => { setTimeExtJob(null); setTimeExtHours(''); setTimeExtNote('') }}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 10, border: '1px solid #e2e5ea',
                  background: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: 'var(--text-secondary)',
                }}
              >Cancel</button>
              <button
                disabled={!timeExtHours || timeExtSubmitting}
                onClick={async () => {
                  setTimeExtSubmitting(true)
                  try {
                    await fetch('/api/task-approvals', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        vehicleStageId: timeExtJob.id,
                        taskName: `Time extension: +${timeExtHours}h${timeExtNote ? ` — ${timeExtNote}` : ''}`,
                        additionalHours: parseFloat(timeExtHours),
                      }),
                    })
                    setTimeExtJob(null); setTimeExtHours(''); setTimeExtNote('')
                  } catch { /* ignore */ }
                  setTimeExtSubmitting(false)
                }}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
                  background: !timeExtHours ? '#e2e5ea' : '#ef4444', color: '#fff',
                  fontSize: 14, fontWeight: 700, cursor: timeExtHours ? 'pointer' : 'default',
                  opacity: timeExtSubmitting ? 0.6 : 1,
                }}
              >{timeExtSubmitting ? 'Sending...' : 'Send Request'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Task Modal */}
      {addTaskJob && (() => {
        const validTasks = addTaskItems.filter(t => t.name.trim() && t.hours)
        const totalHours = validTasks.reduce((sum, t) => sum + parseFloat(t.hours || '0'), 0)
        const updateItem = (idx: number, field: string, val: string) => {
          const updated = [...addTaskItems]
          updated[idx] = { ...updated[idx], [field]: val }
          setAddTaskItems(updated)
        }
        const removeItem = (idx: number) => {
          if (addTaskItems.length <= 1) return
          setAddTaskItems(addTaskItems.filter((_, i) => i !== idx))
        }
        const resetModal = () => { setAddTaskJob(null); setAddTaskItems([{ name: '', hours: '', note: '' }]) }

        return (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }} onClick={resetModal}>
            <div onClick={e => e.stopPropagation()} style={{
              background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 440,
              boxShadow: '0 20px 60px rgba(0,0,0,0.15)', maxHeight: '85vh', overflowY: 'auto',
            }}>
              <p style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Add Tasks</p>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
                #{addTaskJob.vehicle.stockNumber} — {`${addTaskJob.vehicle.year ?? ''} ${addTaskJob.vehicle.make} ${addTaskJob.vehicle.model}`.trim()}
              </p>

              {addTaskItems.map((item, idx) => (
                <div key={idx} style={{
                  background: '#f9fafb', borderRadius: 12, padding: '14px 14px 10px', marginBottom: 10,
                  border: '1px solid #e8e8e8', position: 'relative',
                }}>
                  {addTaskItems.length > 1 && (
                    <button onClick={() => removeItem(idx)} style={{
                      position: 'absolute', top: 8, right: 8, background: 'none', border: 'none',
                      cursor: 'pointer', color: '#ccc', padding: 4,
                    }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                  )}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Task</label>
                      <input
                        type="text" value={item.name} onChange={e => updateItem(idx, 'name', e.target.value)}
                        placeholder="e.g. Replace brake pads"
                        autoFocus={idx === 0}
                        style={{
                          width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e5ea',
                          fontSize: 13, outline: 'none', boxSizing: 'border-box',
                        }}
                      />
                    </div>
                    <div style={{ width: 80, flexShrink: 0 }}>
                      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Hours</label>
                      <input
                        type="number" step="0.5" min="0.5" value={item.hours}
                        onChange={e => updateItem(idx, 'hours', e.target.value)}
                        placeholder="1.5"
                        style={{
                          width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e5ea',
                          fontSize: 13, outline: 'none', boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Note (optional)</label>
                    <input
                      type="text" value={item.note} onChange={e => updateItem(idx, 'note', e.target.value)}
                      placeholder="Additional details..."
                      style={{
                        width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e5ea',
                        fontSize: 13, outline: 'none', boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </div>
              ))}

              {/* Add another task */}
              <button
                onClick={() => setAddTaskItems([...addTaskItems, { name: '', hours: '', note: '' }])}
                style={{
                  width: '100%', padding: '10px 0', borderRadius: 10, border: '1px dashed #d1d5db',
                  background: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  color: '#8b5cf6', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                Add another task
              </button>

              {/* Summary */}
              {validTasks.length > 0 && (
                <div style={{
                  background: '#faf5ff', borderRadius: 10, padding: '10px 14px', marginBottom: 16,
                  border: '1px solid #e9d5ff', display: 'flex', justifyContent: 'space-between',
                  fontSize: 13, fontWeight: 600,
                }}>
                  <span>{validTasks.length} task{validTasks.length !== 1 ? 's' : ''}</span>
                  <span style={{ color: '#8b5cf6' }}>+{totalHours}h total</span>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={resetModal} style={{
                  flex: 1, padding: '10px 0', borderRadius: 10, border: '1px solid #e2e5ea',
                  background: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: 'var(--text-secondary)',
                }}>Cancel</button>
                <button
                  disabled={validTasks.length === 0 || addTaskSubmitting}
                  onClick={async () => {
                    setAddTaskSubmitting(true)
                    try {
                      const taskList = validTasks.map(t => ({
                        name: t.name.trim(),
                        hours: parseFloat(t.hours),
                        note: t.note.trim() || null,
                      }))
                      await fetch('/api/task-approvals', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          vehicleStageId: addTaskJob.id,
                          taskName: taskList.length === 1 ? taskList[0].name : `${taskList.length} new tasks`,
                          additionalHours: totalHours,
                          tasks: taskList,
                        }),
                      })
                      resetModal()
                      fetchData()
                    } catch { /* ignore */ }
                    setAddTaskSubmitting(false)
                  }}
                  style={{
                    flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
                    background: validTasks.length === 0 ? '#e2e5ea' : '#8b5cf6', color: '#fff',
                    fontSize: 14, fontWeight: 700, cursor: validTasks.length > 0 ? 'pointer' : 'default',
                    opacity: addTaskSubmitting ? 0.6 : 1,
                  }}
                >{addTaskSubmitting ? 'Sending...' : 'Submit for Approval'}</button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }} onClick={() => setDeleteConfirm(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 400,
            boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
          }}>
            <p style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, color: '#dc2626' }}>Delete Vehicle</p>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 8 }}>
              Are you sure you want to delete <strong>#{deleteConfirm.vehicle.stockNumber}</strong> — {`${deleteConfirm.vehicle.year ?? ''} ${deleteConfirm.vehicle.make} ${deleteConfirm.vehicle.model}`.trim()}?
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
                    await fetch(`/api/vehicles/${deleteConfirm.vehicle.id}`, { method: 'DELETE' })
                    setDeleteConfirm(null)
                    fetchData()
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
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }} onClick={() => setExternalModal(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 480,
            boxShadow: '0 20px 60px rgba(0,0,0,0.15)', maxHeight: '90vh', overflowY: 'auto',
          }}>
            <p style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Send to External Repair</p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
              #{externalModal.vehicle.stockNumber} — {`${externalModal.vehicle.year ?? ''} ${externalModal.vehicle.make} ${externalModal.vehicle.model}`.trim()}
              {externalModal.vehicle.color ? ` · ${externalModal.vehicle.color}` : ''}
            </p>

            <form onSubmit={async (e) => {
              e.preventDefault()
              setExternalSubmitting(true)
              const form = new FormData(e.currentTarget)
              try {
                // 1. Create external repair record
                const res = await fetch('/api/external', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    stockNumber: externalModal.vehicle.stockNumber,
                    year: externalModal.vehicle.year,
                    make: externalModal.vehicle.make,
                    model: externalModal.vehicle.model,
                    color: externalModal.vehicle.color || null,
                    shopName: form.get('shopName'),
                    shopPhone: form.get('shopPhone') || null,
                    repairDescription: form.get('repairDescription'),
                    estimatedDays: form.get('estimatedDays') ? Number(form.get('estimatedDays')) : null,
                    sentDate: form.get('sentDate'),
                    notes: form.get('notes') || null,
                  }),
                })
                if (res.ok) {
                  // 2. Mark mechanic stage as done (without advancing to next recon stage)
                  await fetch(`/api/stages/${externalModal.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'done' }),
                  })
                  // 3. Set vehicle status to 'external' so it's removed from boards
                  await fetch(`/api/vehicles/${externalModal.vehicle.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'external' }),
                  })
                  setExternalModal(null)
                  fetchData()
                }
              } catch { /* ignore */ }
              setExternalSubmitting(false)
            }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Shop Name *</label>
                  <input name="shopName" required style={inputStyle} placeholder="Joe's Auto Body" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Shop Phone</label>
                  <input name="shopPhone" type="tel" style={inputStyle} placeholder="(305) 555-1234" />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>What&apos;s Being Done *</label>
                <textarea name="repairDescription" required style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }} placeholder="Paint front bumper, fix dent on driver door..." />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Date Sent *</label>
                  <input name="sentDate" type="date" required style={inputStyle} defaultValue={new Date().toISOString().split('T')[0]} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Estimated Days</label>
                  <input name="estimatedDays" type="number" style={inputStyle} placeholder="e.g. 5" />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Notes</label>
                <textarea name="notes" style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} placeholder="Any additional notes..." />
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button type="button" onClick={() => setExternalModal(null)} style={{
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
      {mechOrderModal && selectedJob && (
        <OrderPartModal partId={mechOrderModal.id} partName={mechOrderModal.name} onClose={() => setMechOrderModal(null)} onComplete={() => {
          fetch(`/api/parts?vehicleId=${selectedJob.vehicle.id}`).then(r => r.json()).then(d => setMechParts(d.parts || []))
        }} />
      )}
      {estimateModal && (
        <div
          onClick={() => setEstimateModal(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 2000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 14, padding: 20, width: '100%', maxWidth: 360,
              boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
            }}
          >
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px' }}>Estimated time</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 14px' }}>
              How long do you think this will take?
            </p>
            <p style={{ fontSize: 13, fontWeight: 600, background: '#f9fafb', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', margin: '0 0 12px' }}>
              {estimateModal.taskName}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <input
                type="number" step="0.5" min="0" autoFocus
                value={estimateHoursInput}
                onChange={(e) => setEstimateHoursInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && parseFloat(estimateHoursInput) > 0) { e.preventDefault(); confirmEstimate() } }}
                placeholder="e.g. 2"
                style={{ flex: 1, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 14 }}
              />
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>hours</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => setEstimateModal(null)}
                style={{
                  flex: 1, padding: '8px 0', borderRadius: 8, border: '1px solid var(--border)',
                  background: '#fff', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  minHeight: 0,
                }}
              >Cancel</button>
              <button
                type="button"
                onClick={confirmEstimate}
                disabled={!(parseFloat(estimateHoursInput) > 0) || saving}
                style={{
                  flex: 1, padding: '8px 0', borderRadius: 8, border: 'none',
                  background: '#1a1a1a', color: '#dffd6e', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  opacity: !(parseFloat(estimateHoursInput) > 0) || saving ? 0.5 : 1, minHeight: 0,
                }}
              >Add task</button>
            </div>
          </div>
        </div>
      )}
      {addPartFromTask && selectedJob && (
        <AddPartModal
          stockNumber={selectedJob.vehicle.stockNumber}
          vehicleDesc={`${selectedJob.vehicle.year ?? ''} ${selectedJob.vehicle.make} ${selectedJob.vehicle.model}`.trim()}
          defaultName={addPartFromTask.name}
          sourceItem={addPartFromTask.sourceItem}
          sourceSubField={addPartFromTask.sourceSubField}
          onClose={() => setAddPartFromTask(null)}
          onAdded={() => {
            // Track for the inline confirmation under the originating task/sub-field
            setSessionAddedParts(prev => [...prev, {
              id: `local-${Date.now()}`,
              name: addPartFromTask.name,
              sourceItem: addPartFromTask.sourceItem,
              sourceSubField: addPartFromTask.sourceSubField,
            }])
            fetch(`/api/parts?vehicleId=${selectedJob.vehicle.id}`).then(r => r.json()).then(d => setMechParts(d.parts || []))
          }}
        />
      )}
    </div>
  )
}

// Sub-components
function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 100,
      background: color + '15', color, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap',
    }}>{text}</span>
  )
}

function StatBox({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="pipeline-chip">
      <p className="pipeline-chip-value" style={{ color }}>{value}</p>
      <p className="pipeline-chip-label">{label}</p>
    </div>
  )
}

function Section({ title, count, color, children }: { title: string; count: number; color: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{ width: 4, height: 20, borderRadius: 2, background: color }} />
        <h2 style={{ fontSize: 16, fontWeight: 700 }}>{title}</h2>
        <span style={{
          fontSize: 12, fontWeight: 700, background: color + '18', color,
          padding: '2px 10px', borderRadius: 100, minWidth: 24, textAlign: 'center',
        }}>{count}</span>
      </div>
      {children}
    </div>
  )
}

function CardGrid({ children }: { children: React.ReactNode }) {
  // gridAutoRows: 1fr + stretch → every card in the grid is the same height
  // (as tall as the tallest), instead of each sizing to its own content.
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gridAutoRows: '1fr', alignItems: 'stretch', gap: 12 }}>{children}</div>
}

function ActionBtn({ label, color, disabled, onClick, className, title }: { label: string; color: string; disabled?: boolean; onClick: () => void; className?: string; title?: string }) {
  return (
    <button onClick={onClick} disabled={disabled} className={className} title={title} style={{
      padding: '8px 16px', borderRadius: 10, border: 'none',
      background: disabled ? '#e5e5e5' : color, color: disabled ? '#999' : '#fff',
      fontSize: 13, fontWeight: 700, cursor: disabled ? 'default' : 'pointer',
    }}>{label}</button>
  )
}

function FooterBtn({ label, color, disabled, onClick, full }: { label: string; color: string; disabled?: boolean; onClick: () => void; full?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      flex: 1, padding: '14px 0', borderRadius: 12, border: 'none',
      background: disabled ? '#e5e5e5' : color, color: disabled ? '#999' : '#fff',
      fontSize: 15, fontWeight: 700, cursor: disabled ? 'default' : 'pointer', textAlign: 'center',
      ...(full ? { width: '100%' } : {}),
    }}>{label}</button>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: 'block' }}>{label}</label>
      {children}
    </div>
  )
}

const pauseOptionStyle: React.CSSProperties = {
  padding: '14px 20px', borderRadius: 12, border: '1px solid #d1d5db',
  background: '#f9fafb', fontSize: 15, fontWeight: 600, cursor: 'pointer',
  textAlign: 'left', color: '#1a1a1a',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e2e5ea',
  fontSize: 14, background: '#f9fafb', outline: 'none',
}

function WeekCard({ job, index, getLiveElapsed, openJob, muted }: {
  job: JobCard; index: number; getLiveElapsed: (j: JobCard) => number; openJob: (j: JobCard) => void; muted?: boolean
}) {
  const v = job.vehicle
  const elapsed = getLiveElapsed(job)
  const est = job.estimatedHours || 2
  const isOver = elapsed > est * 3600
  const isActive = job.timerRunning
  const isPaused = !job.timerRunning && job.status === 'in_progress' && !job.awaitingParts
  const isAwaiting = job.awaitingParts
  const isDone = job.status === 'done'

  // Determine card colors based on status
  const cardBg = muted ? '#f4f4f5' : isDone ? '#f0fdf4' : isAwaiting ? '#fefce8' : isActive ? '#eff6ff' : isPaused ? '#fff7ed' : '#f9fafb'
  const cardBorder = muted ? '#e2e5ea' : isDone ? '#22c55e' : isAwaiting ? '#eab308' : isActive ? '#3b82f6' : isPaused ? '#f59e0b' : '#e2e5ea'
  const topBorder = muted ? '#d1d5db' : isDone ? '#22c55e' : isAwaiting ? '#eab308' : isActive ? '#3b82f6' : isPaused ? '#f59e0b' : isOver ? '#ef4444' : '#d1d5db'

  return (
    <div onClick={() => openJob(job)} style={{
      minWidth: 180, maxWidth: 220, padding: '12px 14px',
      background: cardBg,
      border: `1px solid ${cardBorder}`,
      borderRadius: 12, cursor: 'pointer', flexShrink: 0,
      borderTop: `3px solid ${topBorder}`,
      opacity: muted ? 0.7 : 1,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>#{index + 1}</span>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {isOver && !isDone && <Badge text="Overdue" color="#ef4444" />}
          {isActive && <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#3b82f6', animation: 'pulse 2s infinite' }} />}
          {isActive && <Badge text="Active" color="#3b82f6" />}
          {isPaused && job.pauseReason === 'Lunch' && <Badge text="Lunch" color="#8b5cf6" />}
          {isPaused && job.pauseReason !== 'Lunch' && <Badge text="Paused" color="#f59e0b" />}
          {isAwaiting && <Badge text="Awaiting Parts" color="#eab308" />}
          {isDone && <Badge text="Completed" color="#22c55e" />}
          {!isActive && !isPaused && !isAwaiting && !isDone && job.status === 'pending' && <Badge text="Queued" color="#94a3b8" />}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2, flexWrap: 'wrap' }}>
        <p style={{ fontSize: 13, fontWeight: 700 }}>#{v.stockNumber}</p>
        <ReturnBadge returnQueue={v.returnQueue} />
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {`${v.year ?? ''} ${v.make} ${v.model}`.trim()}
      </p>
      {isPaused && job.pauseReason && (
        <p style={{ fontSize: 10, color: '#b45309', marginBottom: 4, fontStyle: 'italic' }}>
          {job.pauseReason === 'Lunch' ? '🍽️ On Lunch' : job.pauseReason === 'waiting_on_parts' ? `Parts: ${sentenceCase(job.awaitingPartsName) || 'Pending'}` : sentenceCase(job.pauseDetail) || 'Paused'}
        </p>
      )}
      {isAwaiting && job.awaitingPartsName && (
        <p style={{ fontSize: 10, color: '#a16207', marginBottom: 4, fontStyle: 'italic' }}>
          Parts: {job.awaitingPartsName}
        </p>
      )}
      {(isPaused || isAwaiting) && job.pausedAt && (() => {
        const mins = Math.floor((Date.now() - new Date(job.pausedAt).getTime()) / 60000)
        const label = mins < 1 ? 'Just now' : mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ${mins % 60}m ago`
        return <p style={{ fontSize: 10, color: '#6b7280', marginBottom: 4 }}>Paused {label}</p>
      })()}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
        <span style={{ fontWeight: 700, color: isOver && !isDone ? '#ef4444' : 'var(--text-secondary)' }}>{formatHours(elapsed)}</span>
        <span>{est}h est.</span>
      </div>
      <div style={{ marginTop: 6, height: 3, background: '#e2e5ea', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 2,
          width: `${Math.min((elapsed / (est * 3600)) * 100, 100)}%`,
          background: isDone ? '#22c55e' : isOver ? '#ef4444' : isActive ? '#3b82f6' : '#94a3b8',
        }} />
      </div>
    </div>
  )
}
