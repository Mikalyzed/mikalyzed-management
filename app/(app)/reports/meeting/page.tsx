'use client'

/**
 * Morning Meeting board — the live, actionable version of the Inventory
 * Status Report. Admin runs the daily meeting from this one page:
 *  - every recon car expands to its stage tasks, notes, and inbound parts
 *  - external repairs with overdue flags
 *  - admin follow-ups (Tasks board, category "admin") pinned on top and on
 *    each car until done
 *  - per-car actions: smart input (AI-routed, confirm before commit) plus
 *    quick add for recon task / follow-up / part request / send external
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// ── types (mirror /api/reports/vehicle-status + /api/board-tasks) ──────

type StageTask = { idx: number; item: string; done: boolean; note: string | null; assignee: string | null }
type InboundPart = { partId: string; name: string; status: string; eta: string | null }
type ReconRow = {
  stock: string; vehicle: string; vehicleId: string; stageId: string | null
  year: number | null; make: string; model: string
  stage: string | null; stageStatus: string | null; assignee: string | null
  awaitingParts: boolean; awaitingPartsName: string | null; paused: boolean
  scheduledDate: string | null; daysInStock: number | null; openParts: number
  tasks: StageTask[]; stageNotes: string | null; partsInbound: InboundPart[]
}
type ExternalRow = {
  externalId: string
  stock: string; vehicle: string; vehicleId: string | null
  shop: string; work: string; status: string; atDealership: boolean; partOnly: boolean
  sent: string | null; expectedBack: string | null; overdueDays: number
  createdAgoDays: number; notes: string | null
  followUps: Array<{ date: string | null; note: string }>
  partsInbound: InboundPart[]
}
type BottleneckFix =
  | { kind: 'external_return_date'; externalId: string }
  | { kind: 'external_mark_sent'; externalId: string }
  | { kind: 'clear_awaiting_parts'; stageId: string }
  | { kind: 'part_status'; partId: string }
  | { kind: 'reschedule_stage'; stageId: string }
  | { kind: 'install_tasks'; vehicleId: string; canCreate: boolean; parts: Array<{ id: string; name: string }> }
type Bottleneck = {
  severity: 'crit' | 'warn'
  stock: string | null
  vehicle: string | null
  where: string | null
  issue: string
  detail: string
  fix?: BottleneckFix
}
type StockRow = {
  stock: string; vehicle: string; vehicleId: string
  year: number | null; make: string; model: string
  color: string | null; location: string | null
  askingPrice: number | null; daysInStock: number | null
}
type PartRow = {
  partId: string; vehicleId: string
  stock: string; vehicle: string; part: string; status: string
  eta: string | null; ageDays: number; installTaskCreated: boolean
}
type Report = {
  generatedAt: string
  counts: {
    activeVehicles: number; inStock: number; inRecon: number
    atExternalRepair: number; openExternalRepairs: number; externalOverdue: number
    partsInbound: number; partsHere: number; partsRequested: number; unsetStatus: number
  }
  recon: ReconRow[]
  externalRepairs: ExternalRow[]
  parts: PartRow[]
  inStock: StockRow[]
  flags: string[]
  bottlenecks: Bottleneck[]
}
type FollowUp = {
  id: string; title: string; description: string | null; status: string
  dueDate: string | null; priority: number; stockNumbers: string[]
  assignee: { id: string; name: string } | null
}
type TeamUser = { id: string; name: string; role: string }
/** What the follow-up modal opens with — a new one (optionally seeded from a bottleneck) or an existing task. */
type FollowupDraft = {
  taskId?: string
  title: string
  notes: string
  assigneeId: string | null
  due: string          // '' none · days as string · 'keep' (edit only: leave unchanged)
  priority: number
  stock: string | null
  bottleneckKey?: string
  currentDueLabel?: string
}

type CarRef = {
  stock: string; vehicle: string; vehicleId: string | null; stageId: string | null
  year: number | null; make: string | null; model: string | null
}

type PlanStep = {
  type: 'recon_task' | 'followup' | 'part_request' | 'external'
  item?: string
  title?: string
  detail?: string
  dueInDays?: number
  assignToName?: string
  partAssignToName?: string
  partOnly?: boolean
  partName?: string
  notes?: string
  shopName?: string
  work?: string
  expectedInDays?: number
}

// ── small shared bits ──────────────────────────────────────────────────

const eyebrow: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em',
  color: 'var(--text-muted)',
}
const pill = (bg: string, color: string): React.CSSProperties => ({
  display: 'inline-block', padding: '2px 10px', borderRadius: 999, fontSize: 11.5,
  fontWeight: 600, background: bg, color, whiteSpace: 'nowrap',
})
const stagePill = pill('rgba(223,253,110,0.45)', '#4d5a10')
const warnPill = pill('rgba(180,83,9,0.10)', '#b45309')
const mutedPill = pill('var(--bg-primary)', 'var(--text-secondary)')
const okPill = pill('rgba(21,128,61,0.10)', '#15803d')

/* Hover/focus states need real CSS — mounted once by the page. */
const MTG_CSS = `
.mtg-btn {
  display: inline-flex; align-items: center; gap: 6px;
  border: 1px solid var(--border); background: var(--bg-card); color: var(--text-primary);
  border-radius: 9px; padding: 6px 13px; font-size: 12.5px; font-weight: 600;
  cursor: pointer; min-height: 0; white-space: nowrap;
  transition: background 0.15s ease, border-color 0.15s ease, transform 0.05s ease;
}
.mtg-btn:hover { background: var(--bg-card-hover); border-color: #ddddd8; }
.mtg-btn:active { transform: scale(0.98); }
.mtg-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.mtg-btn:focus-visible { outline: 2px solid var(--accent-dark); outline-offset: 1px; }
.mtg-btn-dark { border: 1px solid #1a1a1a; background: #1a1a1a; color: #fff; }
.mtg-btn-dark:hover { background: #2e2e2e; border-color: #2e2e2e; }
.mtg-btn-danger { color: #b91c1c; }
.mtg-btn-danger:hover { background: #fef2f2; border-color: rgba(185,28,28,0.35); }
.mtg-add { border-style: dashed; color: var(--text-secondary); background: transparent; }
.mtg-add:hover { border-color: var(--accent-dark); color: var(--text-primary); background: var(--bg-card); }
.mtg-input {
  padding: 8px 12px; border-radius: 9px; border: 1px solid var(--border);
  font-size: 12.5px; background: var(--bg-card); outline: none; font-family: inherit;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.mtg-input:focus { border-color: var(--accent-dark); box-shadow: 0 0 0 3px rgba(223,253,110,0.35); }
.mtg-input::placeholder { color: var(--text-muted); }
.mtg-row { transition: background 0.12s ease; }
.mtg-row:hover { background: var(--bg-card-hover); }
.mtg-row:focus-visible { outline: 2px solid var(--accent-dark); outline-offset: -2px; }
.mtg-seg { display: inline-flex; border: 1px solid var(--border); border-radius: 9px; overflow: hidden; background: var(--bg-card); }
.mtg-seg button {
  border: none; background: transparent; padding: 6px 12px; font-size: 12px; font-weight: 600;
  cursor: pointer; color: var(--text-secondary); border-right: 1px solid var(--border);
  min-height: 0; transition: background 0.12s ease, color 0.12s ease;
}
.mtg-seg button:last-child { border-right: none; }
.mtg-seg button:hover { background: var(--bg-card-hover); }
.mtg-seg button.on { background: #1a1a1a; color: #fff; }
@media (prefers-reduced-motion: reduce) {
  .mtg-btn, .mtg-row, .mtg-seg button { transition: none; }
}
`

/** Custom due-date picker — segmented pills, no native select. */
function DuePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const opts = [
    { v: '', label: 'No due' }, { v: '0', label: 'Today' }, { v: '1', label: 'Tmrw' },
    { v: '3', label: '3d' }, { v: '7', label: '1wk' },
  ]
  return (
    <span className="mtg-seg" role="group" aria-label="Due date">
      {opts.map(o => (
        <button key={o.v} type="button" className={value === o.v ? 'on' : ''} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </span>
  )
}

/**
 * Create/edit a follow-up: title, notes, WHO it's assigned to, due date,
 * priority. Opened by ⚑ on a bottleneck card (seeded from the issue), the
 * reminders strip's + button, and by clicking any existing follow-up.
 */
function FollowupModal({ draft, users, onClose, onSave, onDelete }: {
  draft: FollowupDraft
  users: TeamUser[]
  onClose: () => void
  onSave: (d: FollowupDraft) => Promise<void>
  onDelete: (taskId: string) => Promise<boolean>
}) {
  const [d, setD] = useState<FollowupDraft>(draft)
  const [busy, setBusy] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const assignee = users.find(u => u.id === d.assigneeId)

  const label: React.CSSProperties = {
    fontSize: 10.5, fontWeight: 650, textTransform: 'uppercase', letterSpacing: '0.06em',
    color: 'var(--text-muted)', marginBottom: 5,
  }
  const dueOpts = [
    ...(d.taskId ? [{ v: 'keep', label: `Keep (${draft.currentDueLabel ?? 'none'})` }] : []),
    { v: '', label: 'No due' }, { v: '0', label: 'Today' }, { v: '1', label: 'Tmrw' },
    { v: '3', label: '3d' }, { v: '7', label: '1wk' },
  ]

  return (
    <div className="mm-backdrop" onClick={() => !busy && onClose()} style={{ zIndex: 1300 }}>
      <div className="mm-panel" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 460, padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h3 style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em', margin: 0 }}>
            {d.taskId ? 'Edit follow-up' : 'New follow-up'}
          </h3>
          {d.stock && (
            <span style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              fontSize: 10.5, fontWeight: 600, color: 'var(--text-secondary)',
              background: 'var(--bg-primary)', border: '1px solid var(--border)',
              padding: '2px 7px', borderRadius: 6,
            }}>#{d.stock}</span>
          )}
        </div>

        <div style={label}>What needs to get done</div>
        <input
          autoFocus={!d.taskId}
          className="mtg-input"
          value={d.title}
          onChange={e => setD({ ...d, title: e.target.value })}
          placeholder="e.g. Remove hood and send to Frank's"
          style={{ width: '100%', marginBottom: 14 }}
        />

        <div style={label}>Notes</div>
        <textarea
          className="mtg-input"
          rows={2}
          value={d.notes}
          onChange={e => setD({ ...d, notes: e.target.value })}
          placeholder="Any detail the person needs (optional)"
          style={{ width: '100%', resize: 'vertical', marginBottom: 14 }}
        />

        <div style={label}>Assigned to</div>
        <div style={{ position: 'relative', marginBottom: 14 }}>
          <button
            className="mtg-btn"
            aria-haspopup="listbox"
            aria-expanded={assignOpen}
            style={{ width: '100%', justifyContent: 'space-between', padding: '9px 12px' }}
            onClick={() => setAssignOpen(o => !o)}
          >
            <span>{assignee ? assignee.name : 'Unassigned'}</span>
            <span aria-hidden style={{ color: 'var(--text-muted)', fontSize: 11, transform: assignOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}>▾</span>
          </button>
          {assignOpen && (
            <div role="listbox" style={{
              position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 10,
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10,
              boxShadow: '0 8px 24px rgba(24,24,27,0.14)', overflow: 'hidden', maxHeight: 220, overflowY: 'auto',
            }}>
              {users.map(u => {
                const on = u.id === d.assigneeId
                return (
                  <button
                    key={u.id}
                    role="option" aria-selected={on}
                    onClick={() => { setD({ ...d, assigneeId: u.id }); setAssignOpen(false) }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                      width: '100%', textAlign: 'left', padding: '9px 12px', fontSize: 12.5,
                      background: on ? 'var(--bg-primary)' : 'var(--bg-card)', border: 'none',
                      borderBottom: '1px solid var(--border-light)', cursor: 'pointer', minHeight: 0,
                      color: 'var(--text-primary)', fontWeight: on ? 650 : 500,
                    }}
                  >
                    <span>{u.name}</span>
                    <span style={{ fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                      {u.role.replace('_', ' ')}{on && ' · ✓'}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 18 }}>
          <div>
            <div style={label}>Due</div>
            <span className="mtg-seg" role="group" aria-label="Due date">
              {dueOpts.map(o => (
                <button key={o.v} type="button" className={d.due === o.v ? 'on' : ''} onClick={() => setD({ ...d, due: o.v })}>
                  {o.label}
                </button>
              ))}
            </span>
          </div>
          <div>
            <div style={label}>Priority</div>
            <span className="mtg-seg" role="group" aria-label="Priority">
              {[{ v: 0, label: 'Normal' }, { v: 1, label: 'High' }, { v: 2, label: 'Urgent' }].map(o => (
                <button key={o.v} type="button" className={d.priority === o.v ? 'on' : ''} onClick={() => setD({ ...d, priority: o.v })}>
                  {o.label}
                </button>
              ))}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="mtg-btn mtg-btn-dark"
            disabled={busy || !d.title.trim()}
            style={{ flex: 1, justifyContent: 'center', padding: '10px 14px', fontSize: 13 }}
            onClick={async () => { setBusy(true); try { await onSave(d) } finally { setBusy(false) } }}
          >{busy ? '…' : d.taskId ? 'Save changes' : 'Create follow-up'}</button>
          <button className="mtg-btn" disabled={busy} style={{ padding: '10px 16px' }} onClick={onClose}>Cancel</button>
        </div>
        {d.taskId && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            {confirmDelete ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                <span style={{ color: 'var(--text-secondary)' }}>Delete this follow-up?</span>
                <button
                  className="mtg-btn mtg-btn-danger"
                  disabled={busy}
                  style={{ padding: '5px 12px', fontSize: 12 }}
                  onClick={async () => {
                    setBusy(true)
                    try { if (await onDelete(d.taskId!)) onClose() } finally { setBusy(false) }
                  }}
                >{busy ? '…' : 'Yes, delete'}</button>
                <button className="mtg-btn" disabled={busy} style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => setConfirmDelete(false)}>Keep it</button>
              </span>
            ) : (
              <button
                disabled={busy}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#b91c1c', fontWeight: 600, padding: '4px 6px', minHeight: 0 }}
                onClick={() => setConfirmDelete(true)}
              >Delete follow-up</button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function dueBadge(dueDate: string | null) {
  if (!dueDate) return null
  const due = new Date(dueDate)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const days = Math.round((due.getTime() - today.getTime()) / 86400000)
  if (days < 0) return <span style={pill('rgba(185,28,28,0.12)', '#b91c1c')}>{-days}d overdue</span>
  if (days === 0) return <span style={warnPill}>due today</span>
  return <span style={mutedPill}>due {fmtDate(dueDate)}</span>
}

// ── the page ───────────────────────────────────────────────────────────

export default function MorningMeetingPage() {
  const [role, setRole] = useState<string | null>(null)
  const [meId, setMeId] = useState<string | null>(null)
  const [report, setReport] = useState<Report | null>(null)
  const [followups, setFollowups] = useState<FollowUp[]>([])
  const [users, setUsers] = useState<TeamUser[]>([])
  const [fuDraft, setFuDraft] = useState<FollowupDraft | null>(null)
  // Bottlenecks flagged this session (title edits in the modal shouldn't lose the ⚑ state)
  const [flaggedLocal, setFlaggedLocal] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const notify = useCallback((msg: string, err = false) => {
    setToast({ msg, err })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3500)
  }, [])

  const loadReport = useCallback(async () => {
    const res = await fetch('/api/reports/vehicle-status')
    if (res.ok) setReport(await res.json())
  }, [])
  const loadFollowups = useCallback(async () => {
    const res = await fetch('/api/board-tasks?category=admin')
    if (res.ok) {
      const tasks: FollowUp[] = await res.json()
      setFollowups(tasks.filter(t => t.status !== 'done'))
    }
  }, [])

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => {
      setRole(d.user?.role ?? 'none')
      setMeId(d.user?.id ?? null)
    }).catch(() => setRole('none'))
    fetch('/api/users').then(r => r.json()).then(d => {
      setUsers((d.users || []).map((u: { id: string; name: string; role: string }) => ({ id: u.id, name: u.name, role: u.role })))
    }).catch(() => {})
    loadReport()
    loadFollowups()
  }, [loadReport, loadFollowups])

  const followupsByStock = useMemo(() => {
    const map = new Map<string, FollowUp[]>()
    for (const f of followups) {
      for (const sn of f.stockNumbers || []) {
        if (!map.has(sn)) map.set(sn, [])
        map.get(sn)!.push(f)
      }
    }
    return map
  }, [followups])

  // ── actions (all reuse existing endpoints) ───────────────────────────

  async function addReconTask(carRef: CarRef, item: string) {
    if (!carRef.stageId) { notify('This car has no open recon stage.', true); return false }
    const res = await fetch(`/api/stages/${carRef.stageId}`)
    if (!res.ok) { notify('Could not load the stage.', true); return false }
    const { stage } = await res.json()
    const checklist = Array.isArray(stage.checklist) ? stage.checklist : []
    const patch = await fetch(`/api/stages/${carRef.stageId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checklist: [...checklist, {
        item, done: false, note: '',
        addedByMechanic: true, approved: 'approved',
        assigneeId: stage.assigneeId ?? null, assigneeName: stage.assignee?.name ?? null,
      }] }),
    })
    if (!patch.ok) { notify('Could not add the task.', true); return false }
    notify(`Task added to ${carRef.stock}: ${item}`)
    loadReport()
    return true
  }

  async function addFollowup(
    carRef: CarRef | null, title: string, detail?: string, dueInDays?: number, priority?: number,
    assigneeId?: string | null,
  ) {
    const dueDate = dueInDays != null
      ? new Date(Date.now() + dueInDays * 86400000).toISOString()
      : null
    const res = await fetch('/api/board-tasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title, description: detail || null, category: 'admin',
        assigneeId: assigneeId !== undefined ? assigneeId : meId, dueDate, priority: priority ?? 0,
        stockNumbers: carRef ? [carRef.stock] : [],
      }),
    })
    if (!res.ok) { notify('Could not save the follow-up.', true); return false }
    notify(`Follow-up saved${carRef ? ` for ${carRef.stock}` : ''}: ${title}`)
    loadFollowups()
    return true
  }

  async function addPart(carRef: CarRef, name: string, notes?: string, assignedToId?: string | null) {
    if (!carRef.vehicleId) { notify('No vehicle record linked to this car.', true); return false }
    const res = await fetch('/api/parts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vehicleId: carRef.vehicleId, name, notes: notes || null, assignedToId: assignedToId ?? null }),
    })
    if (!res.ok) { notify('Could not create the part request.', true); return false }
    const who = assignedToId ? users.find(u => u.id === assignedToId)?.name : null
    notify(`Part requested for ${carRef.stock}: ${name}${who ? ` — assigned to ${who}` : ''}`)
    loadReport()
    return true
  }

  async function sendExternal(
    carRef: CarRef, shopName: string, work: string,
    opts?: { expectedInDays?: number; notes?: string; partOnly?: boolean },
  ) {
    if (!carRef.make || !carRef.model) { notify('Missing vehicle make/model.', true); return false }
    const res = await fetch('/api/external', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stockNumber: carRef.stock, year: carRef.year, make: carRef.make, model: carRef.model,
        shopName, repairDescription: work, status: 'pending',
        partOnly: opts?.partOnly === true,
        expectedReturn: opts?.expectedInDays != null
          ? new Date(Date.now() + opts.expectedInDays * 86400000).toISOString()
          : undefined,
        notes: opts?.notes,
      }),
    })
    if (!res.ok) { notify('Could not create the external repair.', true); return false }
    notify(`${carRef.stock} queued for external: ${shopName}`)
    loadReport()
    return true
  }

  /** Inline bottleneck remedies — each is a targeted PATCH through the
   *  normal endpoints; the rule stops firing once the data is fixed. */
  async function fixBottleneck(b: Bottleneck, choice: number) {
    if (!b.fix) return
    const day = 86400000
    const iso = (days: number) => new Date(Date.now() + days * day).toISOString()
    let res: Response | null = null
    if (b.fix.kind === 'external_return_date') {
      res = await fetch(`/api/external/${b.fix.externalId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedReturn: iso(choice) }),
      })
    } else if (b.fix.kind === 'external_mark_sent') {
      res = await fetch(`/api/external/${b.fix.externalId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'sent', sentDate: new Date().toISOString(), estimatedDays: choice }),
      })
    } else if (b.fix.kind === 'clear_awaiting_parts') {
      res = await fetch(`/api/stages/${b.fix.stageId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ awaitingParts: false }),
      })
    } else if (b.fix.kind === 'part_status') {
      res = await fetch(`/api/parts/${b.fix.partId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: choice === 0 ? 'sourced' : 'ordered' }),
      })
    } else if (b.fix.kind === 'reschedule_stage') {
      res = await fetch(`/api/stages/${b.fix.stageId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledDate: iso(choice) }),
      })
    }
    if (res?.ok) { notify('Fixed — it will drop off the watchlist.'); loadReport() }
    else notify('That fix did not go through.', true)
  }

  async function markExternalReturned(externalId: string) {
    const res = await fetch(`/api/external/${externalId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'returned' }),
    })
    if (res.ok) { notify('Marked returned — car parked for routing on the recon board.'); loadReport() }
    else notify('Could not mark it returned.', true)
  }

  async function deleteExternal(externalId: string, reason: string) {
    const res = await fetch(`/api/external/${externalId}`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    })
    if (res.ok) { notify('Repair deleted — reason recorded in the audit log.'); loadReport() }
    else notify('Could not delete the repair.', true)
  }

  const bottleneckKey = (b: Bottleneck) => `${b.stock ?? ''}|${b.issue.slice(0, 30)}`

  /** ⚑ on a bottleneck card → open the full follow-up modal, seeded from the
   *  issue: due today, urgent, ready to assign to anyone on the team. */
  function bottleneckFollowup(b: Bottleneck) {
    setFuDraft({
      title: `${b.vehicle ?? b.stock ?? ''}: ${b.issue}`.slice(0, 120),
      notes: b.detail,
      assigneeId: meId,
      due: '0',
      priority: 2,
      stock: b.stock,
      bottleneckKey: bottleneckKey(b),
    })
  }

  async function saveFollowup(draft: FollowupDraft) {
    const body: Record<string, unknown> = {
      title: draft.title.trim(),
      description: draft.notes.trim() || null,
      assigneeId: draft.assigneeId,
      priority: draft.priority,
    }
    if (draft.due !== 'keep') {
      body.dueDate = draft.due === '' ? null : new Date(Date.now() + Number(draft.due) * 86400000).toISOString()
    }
    let res: Response
    if (draft.taskId) {
      res = await fetch(`/api/board-tasks/${draft.taskId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
    } else {
      res = await fetch('/api/board-tasks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, category: 'admin', stockNumbers: draft.stock ? [draft.stock] : [] }),
      })
    }
    if (!res.ok) { notify('Could not save the follow-up.', true); return false }
    if (draft.bottleneckKey) setFlaggedLocal(prev => new Set(prev).add(draft.bottleneckKey!))
    const who = users.find(u => u.id === draft.assigneeId)?.name
    notify(draft.taskId ? 'Follow-up updated.' : `Follow-up assigned to ${who ?? 'you'}.`)
    loadFollowups()
    return true
  }

  function editFollowup(f: FollowUp) {
    setFuDraft({
      taskId: f.id,
      title: f.title,
      notes: f.description ?? '',
      assigneeId: f.assignee?.id ?? null,
      due: 'keep',
      priority: f.priority ?? 0,
      stock: f.stockNumbers?.[0] ?? null,
      currentDueLabel: f.dueDate ? fmtDate(f.dueDate) : 'none',
    })
  }

  /** Has this exact bottleneck already been flagged as a follow-up in the meeting? */
  function isFlagged(b: Bottleneck): boolean {
    if (flaggedLocal.has(bottleneckKey(b))) return true
    if (!b.stock) return false
    const needle = b.issue.slice(0, 30)
    return followups.some(f => (f.stockNumbers || []).includes(b.stock!) && f.title.includes(needle))
  }

  async function installTasks(
    fix: Extract<BottleneckFix, { kind: 'install_tasks' }>, mode: 'create' | 'mark', partIds?: string[],
  ) {
    const ids = partIds && partIds.length ? partIds : fix.parts.map(p => p.id)
    const res = await fetch('/api/parts/install-tasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vehicleId: fix.vehicleId, partIds: ids, mode }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      notify(mode === 'create'
        ? `${data.created} install task${data.created === 1 ? '' : 's'} added to the mechanic's checklist.`
        : `${data.stamped} part${data.stamped === 1 ? '' : 's'} marked handled.`)
      loadReport()
    } else {
      notify(data.error || 'Could not update the parts.', true)
    }
  }

  async function completeFollowup(id: string) {
    const res = await fetch(`/api/board-tasks/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'done' }),
    })
    if (res.ok) { notify('Follow-up done.'); setFlaggedLocal(new Set()); loadFollowups() }
  }

  async function deleteFollowup(id: string) {
    const res = await fetch(`/api/board-tasks/${id}`, { method: 'DELETE' })
    if (res.ok) {
      notify('Follow-up deleted.')
      // Session flags re-derive from the remaining follow-ups, so the card's ⚑ reverts.
      setFlaggedLocal(new Set())
      loadFollowups()
      return true
    }
    notify('Could not delete the follow-up.', true)
    return false
  }

  /** Per-stage write queue: rapid task clicks on the same car apply in order
   *  instead of racing each other's read-modify-write. */
  const stageQueue = useRef<Map<string, Promise<unknown>>>(new Map())
  function enqueueStageWrite(stageId: string, job: () => Promise<void>) {
    const prev = stageQueue.current.get(stageId) ?? Promise.resolve()
    const next = prev.then(job, job)
    stageQueue.current.set(stageId, next.catch(() => {}))
    return next
  }

  /** Immutably patch one recon row's tasks in local state — the optimistic
   *  half of task toggling/assignment, so the UI responds instantly. */
  function patchReconTask(stock: string, idx: number, mut: (t: StageTask) => StageTask) {
    setReport(prev => prev ? {
      ...prev,
      recon: prev.recon.map(r => r.stock === stock
        ? { ...r, tasks: r.tasks.map(t => t.idx === idx ? mut(t) : t) }
        : r),
    } : prev)
  }

  async function writeChecklistField(stageId: string, idx: number, mut: (item: Record<string, unknown>) => Record<string, unknown>) {
    const res = await fetch(`/api/stages/${stageId}`)
    if (!res.ok) throw new Error('load')
    const { stage } = await res.json()
    const checklist = Array.isArray(stage.checklist) ? [...stage.checklist] : []
    if (!checklist[idx]) throw new Error('stale')
    checklist[idx] = mut({ ...checklist[idx] })
    const patch = await fetch(`/api/stages/${stageId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checklist }),
    })
    if (!patch.ok) throw new Error('patch')
  }

  /** Toggle a checklist task done/open — instant in the UI, synced behind. */
  function toggleStageTask(stageId: string, stock: string, idx: number, done: boolean) {
    patchReconTask(stock, idx, t => ({ ...t, done }))
    enqueueStageWrite(stageId, () => writeChecklistField(stageId, idx, item => ({ ...item, done })))
      .catch(() => { notify('Could not update the task — refreshing.', true); loadReport() })
  }

  /** Reassign a checklist task to someone else — same optimistic pattern. */
  function assignStageTask(stageId: string, stock: string, idx: number, u: TeamUser | null) {
    patchReconTask(stock, idx, t => ({ ...t, assignee: u?.name ?? null }))
    enqueueStageWrite(stageId, () => writeChecklistField(stageId, idx, item => ({
      ...item, assigneeId: u?.id ?? null, assigneeName: u?.name ?? null,
    })))
      .then(() => notify(u ? `Task assigned to ${u.name}.` : 'Task unassigned.'))
      .catch(() => { notify('Could not reassign the task — refreshing.', true); loadReport() })
  }

  /** Mark an inbound part received — instant in the UI; the real received
   *  flow (notifications + auto install task) runs behind, then a quiet
   *  refresh picks up anything it created. */
  function markPartReceived(partId: string, name: string) {
    setReport(prev => prev ? {
      ...prev,
      recon: prev.recon.map(r => ({ ...r, partsInbound: r.partsInbound.filter(p => p.partId !== partId) })),
      externalRepairs: prev.externalRepairs.map(e => ({ ...e, partsInbound: e.partsInbound.filter(p => p.partId !== partId) })),
      parts: prev.parts.map(p => p.partId === partId ? { ...p, status: 'received' } : p),
    } : prev)
    notify(`Received: ${name.slice(0, 40)}`)
    fetch(`/api/parts/${partId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'received' }),
    }).then(res => {
      if (!res.ok) throw new Error('patch')
      loadReport() // quiet background sync — picks up the auto install task
    }).catch(() => { notify('Could not update the part — refreshing.', true); loadReport() })
  }

  /**
   * Execute a confirmed plan in order. Cross-linking is deterministic code,
   * not AI: when a plan pairs mechanic prep with an external send, the
   * external's notes record what it's waiting on so the dependency is
   * visible on the External page.
   */
  async function runPlan(carRef: CarRef, steps: PlanStep[]): Promise<boolean> {
    const prepTask = steps.find(s => s.type === 'recon_task')
    let allOk = true
    for (const s of steps) {
      let ok = false
      if (s.type === 'recon_task') ok = await addReconTask(carRef, s.item!)
      if (s.type === 'followup') {
        // "task Lenny with…" → find Lenny on the team; unmatched names fall back to me
        const named = s.assignToName?.trim().toLowerCase()
        const match = named ? users.find(u => u.name.toLowerCase().includes(named)) : undefined
        ok = await addFollowup(carRef, s.title!, s.detail, s.dueInDays, undefined, match ? match.id : undefined)
        if (ok && named && !match) notify(`Couldn't find "${s.assignToName}" on the team — assigned to you instead.`, true)
      }
      if (s.type === 'part_request') {
        const named = s.partAssignToName?.trim().toLowerCase()
        const match = named ? users.find(u => u.name.toLowerCase().includes(named)) : undefined
        ok = await addPart(carRef, s.partName!, s.notes, match?.id ?? null)
        if (ok && named && !match) notify(`Couldn't find "${s.partAssignToName}" on the team — part left unassigned.`, true)
      }
      if (s.type === 'external') {
        ok = await sendExternal(carRef, s.shopName || 'TBD — pick shop', s.work!, {
          expectedInDays: s.expectedInDays,
          partOnly: s.partOnly === true,
          notes: prepTask ? `Waiting on mechanic first: "${prepTask.item}"` : undefined,
        })
      }
      if (!ok) { allOk = false; break }
    }
    return allOk
  }

  // ── gates ────────────────────────────────────────────────────────────

  if (role && role !== 'admin') {
    return (
      <div className="card" style={{ maxWidth: 480, margin: '80px auto', padding: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 28 }}>🔒</div>
        <h2 style={{ margin: '8px 0 4px', fontSize: 18, fontWeight: 700 }}>Admins only</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
          The Morning Meeting board is limited to admin users.
        </p>
      </div>
    )
  }
  if (!report) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', minHeight: '60vh', alignItems: 'center' }}>
        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#e0e0e0' }} />
      </div>
    )
  }

  const c = report.counts
  const dueFirst = [...followups].sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <style>{MTG_CSS}</style>
      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', zIndex: 300,
          background: toast.err ? '#b91c1c' : '#1a1a1a', color: '#fff', padding: '10px 18px',
          borderRadius: 10, fontSize: 13, fontWeight: 600, boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
        }}>{toast.msg}</div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={eyebrow}>Management</div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ margin: '2px 0 4px' }}>Morning Meeting</h1>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {new Date(report.generatedAt).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} · {c.activeVehicles} active vehicles · live
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="mtg-btn" onClick={() => { loadReport(); loadFollowups(); notify('Refreshed.') }}>↻ Refresh</button>
          <button
            className="mtg-btn"
            title="Snapshot today's meeting to the archive — the team can reference it later"
            onClick={async () => {
              const res = await fetch('/api/reports/vehicle-status/archive', { method: 'POST' })
              const d = await res.json().catch(() => ({}))
              if (res.ok) notify(`Meeting saved to the archive (${d.date}).`)
              else notify(d.error || 'Could not save the meeting.', true)
            }}
          >🗂 Save meeting</button>
          <a href="/api/reports/vehicle-status?format=pdf" download className="mtg-btn mtg-btn-dark" style={{ textDecoration: 'none' }}>⬇ PDF</a>
        </div>
      </div>

      {/* Follow-up create/edit modal */}
      {fuDraft && (
        <FollowupModal
          draft={fuDraft}
          users={users}
          onClose={() => setFuDraft(null)}
          onSave={async d => { if (await saveFollowup(d)) setFuDraft(null) }}
          onDelete={deleteFollowup}
        />
      )}

      {/* Follow-ups strip */}
      <FollowupStrip
        followups={dueFirst}
        onDone={completeFollowup}
        onNew={() => setFuDraft({ title: '', notes: '', assigneeId: meId, due: '', priority: 0, stock: null })}
        onEdit={editFollowup}
      />

      {/* Rule-detected bottlenecks — cards, click one to act on it */}
      {report.bottlenecks?.length > 0 && (
        <section>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
            <div>
              <div style={eyebrow}>Watchlist</div>
              <h2 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em', margin: '2px 0 0' }}>
                Bottlenecks
              </h2>
            </div>
            <span style={pill('rgba(180,83,9,0.12)', '#b45309')}>{report.bottlenecks.length} caught</span>
            <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Tap a card to fix it right here.</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
            {report.bottlenecks.map((b, i) => (
              <BottleneckCard
                key={i}
                b={b}
                flagged={isFlagged(b)}
                external={
                  (b.fix?.kind === 'external_return_date' || b.fix?.kind === 'external_mark_sent')
                    ? report.externalRepairs.find(e => e.externalId === (b.fix as { externalId: string }).externalId)
                    : undefined
                }
                stuckPart={
                  b.fix?.kind === 'part_status'
                    ? report.parts.find(p => p.partId === (b.fix as { partId: string }).partId)
                    : undefined
                }
                onFix={fixBottleneck}
                onFollowup={bottleneckFollowup}
                onReturned={markExternalReturned}
                onDelete={deleteExternal}
                onInstall={installTasks}
              />
            ))}
          </div>
        </section>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
        {[
          { n: c.inStock, l: 'In stock' },
          { n: c.inRecon, l: 'In recon' },
          { n: c.atExternalRepair, l: 'At external' },
          { n: c.externalOverdue, l: 'External overdue', crit: c.externalOverdue > 0 },
          { n: c.partsRequested, l: 'Parts requested', crit: false },
          { n: c.partsHere, l: 'Parts here' },
        ].map(s => (
          <div key={s.l} className="stat-card" style={{ padding: '16px 18px', borderLeft: `3px solid ${s.crit ? '#dc2626' : 'var(--accent)'}` }}>
            <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums', color: s.crit ? '#b91c1c' : 'var(--text-primary)' }}>{s.n}</div>
            <div style={{ ...eyebrow, fontSize: 10.5, marginTop: 3 }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* In Recon */}
      <section className="card" style={{ padding: 22 }}>
        <div style={eyebrow}>Recon</div>
        <h2 style={{ fontSize: 17, fontWeight: 700, margin: '2px 0 2px' }}>In Recon — {c.inRecon} vehicles</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 10px' }}>
          Oldest first. Click a car for its tasks, parts, follow-ups — and to act on it.
        </p>
        {report.recon.map(v => (
          <CarRow
            key={v.stock}
            carRef={{ stock: v.stock, vehicle: v.vehicle, vehicleId: v.vehicleId, stageId: v.stageId, year: v.year, make: v.make, model: v.model }}
            summary={
              <>
                <StockChip stock={v.stock} />
                <RowTitle>{v.vehicle}</RowTitle>
                <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                  {v.stage
                    ? <>
                        <DotPill
                          label={v.stage}
                          {...(STAGE_COLORS[v.stage] ?? { fg: 'var(--text-secondary)', bg: 'var(--bg-primary)', dot: '#9a9a9a' })}
                        />
                        <span style={{ color: 'var(--text-muted)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {v.stageStatus === 'in_progress' ? 'in progress' : 'pending'} · {v.assignee ?? 'unassigned'}
                        </span>
                      </>
                    : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>no open stage</span>}
                </span>
                <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {v.awaitingParts && <span style={warnPill}>awaiting parts{v.awaitingPartsName ? `: ${v.awaitingPartsName}` : ''}</span>}
                  {v.paused && <span style={mutedPill}>paused</span>}
                  {v.scheduledDate && <span style={mutedPill}>sched {fmtDate(v.scheduledDate)}</span>}
                  {(followupsByStock.get(v.stock)?.length ?? 0) > 0 && <span style={mutedPill}>⚑ {followupsByStock.get(v.stock)!.length}</span>}
                </span>
                <span style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: (v.daysInStock ?? 0) > 120 ? '#b45309' : 'var(--text-primary)' }}>
                  {v.daysInStock ?? '—'}<span style={{ display: 'block', fontSize: 9.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>days</span>
                </span>
              </>
            }
          >
            <StageTaskList tasks={v.tasks} notes={v.stageNotes} stageId={v.stageId} stage={v.stage} stock={v.stock} users={users} onToggle={toggleStageTask} onAssign={assignStageTask} />
            <InboundList parts={v.partsInbound} onReceive={markPartReceived} />
            <FollowupList items={followupsByStock.get(v.stock) ?? []} onDone={completeFollowup} onEdit={editFollowup} />
            <ActionBar
              carRef={{ stock: v.stock, vehicle: v.vehicle, vehicleId: v.vehicleId, stageId: v.stageId, year: v.year, make: v.make, model: v.model }}
              actions={{ addReconTask, addFollowup, addPart, sendExternal, runPlan }}
              users={users}
              allowReconTask allowExternal
            />
          </CarRow>
        ))}
      </section>

      {/* External */}
      <section className="card" style={{ padding: 22 }}>
        <div style={eyebrow}>External</div>
        <h2 style={{ fontSize: 17, fontWeight: 700, margin: '2px 0 2px' }}>External Repairs — {c.openExternalRepairs} open</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 10px' }}>
          {c.externalOverdue} past expected return · {report.externalRepairs.filter(e => e.status === 'pending').length} not sent yet.
        </p>
        {report.externalRepairs.map((e, i) => (
          <CarRow
            key={`${e.stock}-${i}`}
            carRef={{ stock: e.stock, vehicle: e.vehicle, vehicleId: e.vehicleId, stageId: null, year: null, make: null, model: null }}
            summary={
              <>
                <StockChip stock={e.stock} />
                <RowTitle>{e.vehicle}</RowTitle>
                <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                  <span style={{ fontWeight: 640, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.shop}</span>
                  {e.atDealership && <DotPill label="at dealership" fg="#15803d" bg="#edfaf0" dot="#16a34a" />}
                  {e.partOnly && <DotPill label="part only" fg="#a16207" bg="#fef3c7" dot="#d97706" />}
                </span>
                <span style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {e.status === 'pending'
                    ? <DotPill label="not sent yet" fg="var(--text-secondary)" bg="var(--bg-primary)" dot="#9a9a9a" />
                    : <DotPill label={e.status.replace('_', ' ')} fg="#2563eb" bg="var(--info-bg)" dot="#3b82f6" />}
                  {(followupsByStock.get(e.stock)?.length ?? 0) > 0 && <span style={mutedPill}>⚑ {followupsByStock.get(e.stock)!.length}</span>}
                </span>
                <span style={{ textAlign: 'right', fontSize: 12.5, color: e.overdueDays >= 30 ? '#b91c1c' : e.overdueDays > 0 ? '#b45309' : 'var(--text-muted)', fontWeight: e.overdueDays > 0 ? 700 : 400 }}>
                  {e.expectedBack
                    ? e.overdueDays > 0 ? `${fmtDate(e.expectedBack)} · ${e.overdueDays}d overdue` : `back ${fmtDate(e.expectedBack)}`
                    : 'no return date'}
                </span>
              </>
            }
          >
            <DetailLabel>Work requested</DetailLabel>
            <p style={{ margin: 0, fontSize: 12.5 }}>{e.work}</p>
            {e.notes && <><DetailLabel>Notes</DetailLabel><p style={{ margin: 0, fontSize: 12.5 }}>{e.notes}</p></>}
            <DetailLabel>Repair actions</DetailLabel>
            <div onClick={ev => ev.stopPropagation()}>
              <ExternalQuickControls externalId={e.externalId} onReturned={markExternalReturned} onDelete={deleteExternal} />
            </div>
            <InboundList parts={e.partsInbound} onReceive={markPartReceived} />
            <FollowupList items={followupsByStock.get(e.stock) ?? []} onDone={completeFollowup} onEdit={editFollowup} />
            <ActionBar
              carRef={{ stock: e.stock, vehicle: e.vehicle, vehicleId: e.vehicleId, stageId: null, year: null, make: null, model: null }}
              actions={{ addReconTask, addFollowup, addPart, sendExternal, runPlan }}
              users={users}
            />
          </CarRow>
        ))}
      </section>

      {/* Parts pipeline */}
      <PartsSection parts={report.parts} requested={c.partsRequested} />

      {/* Inventory review — everything not in recon/external */}
      <section className="card" style={{ padding: 22 }}>
        <div style={eyebrow}>Inventory</div>
        <h2 style={{ fontSize: 17, fontWeight: 700, margin: '2px 0 2px' }}>In Stock — {c.inStock} vehicles</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 10px' }}>
          Posted / just-in cars, oldest first. Review for price drops, fixes, or additions — expand a car to act on it.
        </p>
        {report.inStock.map(v => (
          <CarRow
            key={v.stock}
            carRef={{ stock: v.stock, vehicle: v.vehicle, vehicleId: v.vehicleId, stageId: null, year: v.year, make: v.make, model: v.model }}
            summary={
              <>
                <StockChip stock={v.stock} />
                <RowTitle>{v.vehicle}</RowTitle>
                <span style={{ fontWeight: 640, fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>
                  {v.askingPrice != null ? `$${Math.round(v.askingPrice).toLocaleString('en-US')}` : <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>no price</span>}
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: 12.5 }}>
                  {[v.color, v.location].filter(Boolean).join(' · ')}
                  {(followupsByStock.get(v.stock)?.length ?? 0) > 0 && <> <span style={mutedPill}>⚑ {followupsByStock.get(v.stock)!.length}</span></>}
                </span>
                <span style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: (v.daysInStock ?? 0) > 60 ? '#b45309' : 'var(--text-primary)' }}>
                  {v.daysInStock ?? '—'}<span style={{ display: 'block', fontSize: 9.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>days</span>
                </span>
              </>
            }
          >
            <FollowupList items={followupsByStock.get(v.stock) ?? []} onDone={completeFollowup} onEdit={editFollowup} />
            <ActionBar
              carRef={{ stock: v.stock, vehicle: v.vehicle, vehicleId: v.vehicleId, stageId: null, year: v.year, make: v.make, model: v.model }}
              actions={{ addReconTask, addFollowup, addPart, sendExternal, runPlan }}
              users={users}
              allowExternal
            />
          </CarRow>
        ))}
      </section>

      {/* Flags */}
      {report.flags.length > 0 && (
        <section className="card" style={{ padding: 22 }}>
          <div style={eyebrow}>Data flags</div>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: '2px 0 6px' }}>Needs Attention — {report.flags.length}</h2>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13 }}>
            {report.flags.map((f, i) => <li key={i} style={{ margin: '3px 0', color: '#b45309' }}>{f}</li>)}
          </ul>
        </section>
      )}
    </div>
  )
}

// ── components ─────────────────────────────────────────────────────────

const PART_TABS = [
  { key: 'requested', label: 'Requested' },
  { key: 'sourced', label: 'Sourced' },
  { key: 'ordered', label: 'Ordered' },
  { key: 'received', label: 'Received' },
] as const

function PartsSection({ parts, requested }: { parts: PartRow[]; requested: number }) {
  const [tab, setTab] = useState<string>('requested')
  const shown = parts.filter(p => p.status === tab)
  const countFor = (k: string) => parts.filter(p => p.status === k).length
  return (
    <section className="card" style={{ padding: 22 }}>
      <div style={eyebrow}>Parts</div>
      <h2 style={{ fontSize: 17, fontWeight: 700, margin: '2px 0 2px' }}>Parts Pipeline — {parts.length} open</h2>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 10px' }}>
        {requested} sitting in requested — that's the pile to clear. Anything requested over 7 days is flagged.
      </p>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {PART_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={tab === t.key ? 'mtg-btn mtg-btn-dark' : 'mtg-btn'}
          >{t.label} · {countFor(t.key)}</button>
        ))}
      </div>
      {shown.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Nothing in {tab}.</p>}
      {shown.map((p, i) => {
        const stuck = p.status === 'requested' && p.ageDays > 7
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 4px', borderTop: '1px solid var(--border)', fontSize: 13 }}>
            <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', minWidth: 78 }}>{p.stock}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 12.5, minWidth: 170 }}>{p.vehicle}</span>
            <span style={{ flex: 1, fontWeight: 500 }}>{p.part}</span>
            {p.status === 'ordered' && p.eta && <span style={mutedPill}>ETA {fmtDate(p.eta)}</span>}
            {p.status === 'received' && (
              p.installTaskCreated
                ? <span style={okPill}>install task created</span>
                : <span style={warnPill}>awaiting install task</span>
            )}
            <span style={stuck ? warnPill : mutedPill}>{p.ageDays}d in {p.status}</span>
          </div>
        )
      })}
    </section>
  )
}

/**
 * One bottleneck as a recon-style card. The card face is clickable and opens
 * the DETAIL modal — history and context (external snapshot with follow-ups,
 * or the part list with per-part selection). The footer holds the main verbs;
 * verbs that need input finish in the same small mm-panel modals.
 */
function BottleneckCard({ b, flagged, external, stuckPart, onFix, onFollowup, onReturned, onDelete, onInstall }: {
  b: Bottleneck
  flagged: boolean
  external?: ExternalRow
  stuckPart?: PartRow
  onFix: (b: Bottleneck, choice: number) => Promise<void>
  onFollowup: (b: Bottleneck) => void
  onReturned: (id: string) => Promise<void>
  onDelete: (id: string, reason: string) => Promise<void>
  onInstall: (fix: Extract<BottleneckFix, { kind: 'install_tasks' }>, mode: 'create' | 'mark', partIds?: string[]) => Promise<void>
}) {
  type ModalKind = null | 'detail' | 'parts' | 'return_date' | 'mark_sent' | 'returned' | 'delete' | 'reschedule'
  const [modal, setModal] = useState<ModalKind>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const crit = b.severity === 'crit'

  const installFix = b.fix?.kind === 'install_tasks' ? b.fix : null
  const externalId = (b.fix?.kind === 'external_return_date' || b.fix?.kind === 'external_mark_sent') ? b.fix.externalId : null

  const close = () => { setModal(null); setReason('') }
  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try { await fn(); close() } finally { setBusy(false) }
  }
  const openDetail = () => {
    if (installFix) {
      setSel(new Set(installFix.parts.map(p => p.id)))
      setModal('parts')
    } else {
      setModal('detail')
    }
  }
  const toggleSel = (id: string) => {
    setSel(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Main verbs on the card face, per bottleneck type.
  const verbs: Array<{ label: string; danger?: boolean; onClick: () => void }> = []
  if (b.fix?.kind === 'external_return_date') {
    verbs.push({ label: 'Update return', onClick: () => setModal('return_date') })
    verbs.push({ label: '✓ Returned', onClick: () => setModal('returned') })
    verbs.push({ label: 'Delete', danger: true, onClick: () => setModal('delete') })
  } else if (b.fix?.kind === 'external_mark_sent') {
    verbs.push({ label: 'Mark sent', onClick: () => setModal('mark_sent') })
    verbs.push({ label: '✓ Returned', onClick: () => setModal('returned') })
    verbs.push({ label: 'Delete', danger: true, onClick: () => setModal('delete') })
  } else if (b.fix?.kind === 'clear_awaiting_parts') {
    verbs.push({ label: '✓ Clear flag', onClick: () => run(() => onFix(b, 0)) })
  } else if (b.fix?.kind === 'part_status') {
    verbs.push({ label: 'Mark sourced', onClick: () => run(() => onFix(b, 0)) })
    verbs.push({ label: 'Mark ordered', onClick: () => run(() => onFix(b, 1)) })
  } else if (b.fix?.kind === 'reschedule_stage') {
    verbs.push({ label: 'Reschedule', onClick: () => setModal('reschedule') })
  } else if (installFix) {
    verbs.push({ label: 'Parts…', onClick: openDetail })
  }

  const dotPill = (label: string, fg: string, bg: string, dot: string) => (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
      fontSize: 10.5, fontWeight: 650, padding: '3px 9px', borderRadius: 100,
      background: bg, color: fg, letterSpacing: '-0.005em', whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot, flexShrink: 0 }} />
      {label}
    </span>
  )

  const choiceBtn = (label: string, onClick: () => void, dark = false, disabled = false) => (
    <button
      key={label}
      className={dark ? 'mtg-btn mtg-btn-dark' : 'mtg-btn'}
      disabled={busy || disabled}
      style={{ justifyContent: 'center', padding: '10px 14px', fontSize: 13, flex: 1 }}
      onClick={onClick}
    >{busy ? '…' : label}</button>
  )

  return (
    <>
      <div className="routing-card" style={{
        background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border)',
        boxShadow: '0 1px 2px rgba(24,24,27,.04)', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}>
        <div
          role="button" tabIndex={0}
          title="See details and history"
          onClick={openDetail}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail() } }}
          style={{ padding: '13px 15px', flex: 1, cursor: 'pointer' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            {b.stock ? (
              <span style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                fontSize: 10.5, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '-0.01em',
                background: 'var(--bg-primary)', border: '1px solid var(--border)',
                padding: '2px 7px', borderRadius: 6, whiteSpace: 'nowrap',
              }}>#{b.stock}</span>
            ) : <span />}
            {crit
              ? dotPill('Critical', '#b91c1c', '#fdf0f0', '#dc2626')
              : dotPill('Attention', '#b45309', '#fdf6ec', '#d97706')}
          </div>
          <p title={b.vehicle ?? ''} style={{
            fontSize: 13.5, fontWeight: 640, letterSpacing: '-0.015em', color: 'var(--text-primary)',
            lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            margin: '9px 0 0', minWidth: 0,
          }}>{b.vehicle}</p>
          <div style={{ fontSize: 12, fontWeight: 650, marginTop: 5, color: crit ? '#b91c1c' : '#b45309' }}>
            {b.issue}
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.45 }}>
            {b.detail}
          </p>
        </div>
        <div style={{
          display: 'flex', gap: 6, alignItems: 'center', padding: '10px 12px',
          borderTop: '1px solid var(--border-light)', background: 'var(--bg-primary)',
        }}>
          {verbs.map(v => (
            <button
              key={v.label}
              className={v.danger ? 'mtg-btn mtg-btn-danger' : 'mtg-btn'}
              disabled={busy}
              style={{ fontSize: 12 }}
              onClick={v.onClick}
            >{v.label}</button>
          ))}
          <button
            className="mtg-btn"
            title={flagged ? 'Flagged — follow-up is in the reminders strip' : 'Flag it — makes an urgent follow-up due today'}
            aria-label={flagged ? 'Already flagged as follow-up' : 'Flag as follow-up, due today'}
            aria-pressed={flagged}
            disabled={busy || flagged}
            style={{
              marginLeft: 'auto', fontSize: 12, padding: '6px 10px',
              ...(flagged ? {
                color: '#2563eb', background: 'var(--info-bg)',
                borderColor: 'var(--info-border)', opacity: 1, cursor: 'default',
              } : {}),
            }}
            onClick={() => { if (!flagged) onFollowup(b) }}
          >⚑</button>
        </div>
      </div>

      {modal && (
        <div className="mm-backdrop" onClick={() => !busy && close()} style={{ zIndex: 1200 }}>
          <div className="mm-panel" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: modal === 'detail' || modal === 'parts' ? 500 : 420, padding: 24, maxHeight: '84vh', overflowY: 'auto' }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>#{b.stock}</div>
            <h3 style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em', margin: '2px 0 4px' }}>
              {modal === 'detail' && (b.vehicle ?? 'Details')}
              {modal === 'parts' && (b.vehicle ?? 'Parts')}
              {modal === 'return_date' && 'Update return date'}
              {modal === 'mark_sent' && 'Mark sent today'}
              {modal === 'returned' && 'Car is back?'}
              {modal === 'delete' && 'Delete this repair?'}
              {modal === 'reschedule' && 'Reschedule the stage'}
            </h3>
            {(modal === 'detail' || modal === 'parts') && b.where && (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 2 }}>
                Car is <span style={{ fontWeight: 650 }}>{b.where}</span>
              </div>
            )}

            {/* ── Detail / history view ─────────────────────────────── */}
            {modal === 'detail' && (
              <div style={{ marginTop: 10 }}>
                {external && <>
                  {/* Shop + status */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em' }}>
                      {external.shop}
                      {external.atDealership && (
                        <span style={{ ...okPill, marginLeft: 8, verticalAlign: '2px' }}>at dealership</span>
                      )}
                    </div>
                    {external.status === 'pending'
                      ? dotPill('Not sent yet', 'var(--text-secondary)', 'var(--bg-primary)', '#9a9a9a')
                      : external.status === 'ready'
                        ? dotPill('Ready', '#15803d', '#edfaf0', '#16a34a')
                        : dotPill(external.status === 'in_progress' ? 'In progress' : 'Sent', '#2563eb', 'var(--info-bg)', '#3b82f6')}
                  </div>

                  {/* Timeline tiles */}
                  <div style={{ display: 'flex', alignItems: 'stretch', gap: 8, marginBottom: 16 }}>
                    <div style={{ flex: 1, background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10, padding: '9px 12px' }}>
                      <div style={{ fontSize: 10, fontWeight: 650, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>Sent</div>
                      <div style={{ fontSize: 14, fontWeight: 650, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{fmtDate(external.sent)}</div>
                    </div>
                    <span aria-hidden style={{ alignSelf: 'center', color: 'var(--text-muted)', fontSize: 13 }}>→</span>
                    <div style={{
                      flex: 1.4, borderRadius: 10, padding: '9px 12px',
                      background: external.overdueDays > 0 ? '#fdf0f0' : 'var(--bg-primary)',
                      border: `1px solid ${external.overdueDays > 0 ? '#f3d4d4' : 'var(--border-light)'}`,
                    }}>
                      <div style={{ fontSize: 10, fontWeight: 650, textTransform: 'uppercase', letterSpacing: '0.06em', color: external.overdueDays > 0 ? '#b91c1c' : 'var(--text-muted)' }}>Expected back</div>
                      <div style={{ fontSize: 14, fontWeight: 650, fontVariantNumeric: 'tabular-nums', marginTop: 2, color: external.overdueDays > 0 ? '#b91c1c' : 'var(--text-primary)' }}>
                        {fmtDate(external.expectedBack)}
                        {external.overdueDays > 0 && <span style={{ fontSize: 11.5, fontWeight: 700 }}> · {external.overdueDays}d overdue</span>}
                      </div>
                    </div>
                  </div>

                  {/* Work */}
                  <div style={{ fontSize: 10.5, fontWeight: 650, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 4 }}>Work requested</div>
                  <p style={{ fontSize: 13, lineHeight: 1.5, margin: '0 0 14px' }}>{external.work}</p>

                  {/* Notes */}
                  {external.notes && <>
                    <div style={{ fontSize: 10.5, fontWeight: 650, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 4 }}>Notes</div>
                    <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10, padding: '10px 12px', fontSize: 12.5, lineHeight: 1.55, marginBottom: 14 }}>
                      {external.notes}
                    </div>
                  </>}

                  {/* Inbound parts */}
                  {external.partsInbound.length > 0 && <>
                    <div style={{ fontSize: 10.5, fontWeight: 650, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 6 }}>Parts coming in</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                      {external.partsInbound.map((p, pi) => (
                        <span key={pi} style={warnPill}>{p.name.slice(0, 40)}{p.eta ? ` · ${fmtDate(p.eta)}` : ''}</span>
                      ))}
                    </div>
                  </>}

                  {/* Follow-up timeline */}
                  <div style={{ fontSize: 10.5, fontWeight: 650, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 8 }}>
                    Follow-up history
                  </div>
                  {external.followUps.length === 0 && (
                    <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 4px' }}>No follow-ups logged yet.</p>
                  )}
                  <div>
                    {external.followUps.map((f, fi) => (
                      <div key={fi} style={{ display: 'flex', gap: 12, position: 'relative', paddingBottom: fi === external.followUps.length - 1 ? 0 : 12 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 10 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6', marginTop: 4, flexShrink: 0 }} />
                          {fi !== external.followUps.length - 1 && (
                            <span style={{ width: 2, flex: 1, background: 'var(--border)', marginTop: 3 }} />
                          )}
                        </div>
                        <div style={{ minWidth: 0, paddingBottom: 2 }}>
                          <div style={{ fontSize: 11, fontWeight: 650, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{fmtDate(f.date)}</div>
                          <div style={{ fontSize: 12.5, lineHeight: 1.5, marginTop: 1 }}>{f.note}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>}
                {stuckPart && <>
                  <p style={{ fontSize: 13.5, fontWeight: 650, lineHeight: 1.4, margin: '0 0 12px' }}>{stuckPart.part}</p>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                    <div style={{ flex: 1, background: '#fdf6ec', border: '1px solid #f3e3c8', borderRadius: 10, padding: '9px 12px' }}>
                      <div style={{ fontSize: 10, fontWeight: 650, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#b45309' }}>Status</div>
                      <div style={{ fontSize: 14, fontWeight: 650, marginTop: 2, color: '#b45309' }}>{stuckPart.status} · {stuckPart.ageDays}d</div>
                    </div>
                    {stuckPart.eta && (
                      <div style={{ flex: 1, background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10, padding: '9px 12px' }}>
                        <div style={{ fontSize: 10, fontWeight: 650, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>ETA</div>
                        <div style={{ fontSize: 14, fontWeight: 650, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{fmtDate(stuckPart.eta)}</div>
                      </div>
                    )}
                  </div>
                </>}
                {!external && !stuckPart && (
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>{b.detail}</p>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
                  {b.fix?.kind === 'external_return_date' && <>
                    {choiceBtn('Update return', () => setModal('return_date'), true)}
                    {choiceBtn('✓ Returned', () => setModal('returned'))}
                  </>}
                  {b.fix?.kind === 'external_mark_sent' && <>
                    {choiceBtn('Mark sent', () => setModal('mark_sent'), true)}
                    {choiceBtn('✓ Returned', () => setModal('returned'))}
                  </>}
                  {b.fix?.kind === 'clear_awaiting_parts' &&
                    choiceBtn('✓ Clear flag — mechanic resumes', () => run(() => onFix(b, 0)), true)}
                  {b.fix?.kind === 'part_status' && <>
                    {choiceBtn('Mark sourced', () => run(() => onFix(b, 0)), true)}
                    {choiceBtn('Mark ordered', () => run(() => onFix(b, 1)))}
                  </>}
                  {b.fix?.kind === 'reschedule_stage' &&
                    choiceBtn('Reschedule…', () => setModal('reschedule'), true)}
                </div>
              </div>
            )}

            {/* ── Parts view: pick which parts each action applies to ── */}
            {modal === 'parts' && installFix && (
              <div style={{ marginTop: 8 }}>
                <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '0 0 10px', lineHeight: 1.5 }}>
                  Pick the parts, then choose what happens to them. You can do a few now and come back for the rest.
                </p>
                <div style={{ border: '1px solid var(--border-light)', borderRadius: 10, overflow: 'hidden', marginBottom: 6 }}>
                  {installFix.parts.map(p => {
                    const on = sel.has(p.id)
                    return (
                      <button
                        key={p.id}
                        onClick={() => toggleSel(p.id)}
                        aria-pressed={on}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                          padding: '9px 12px', fontSize: 12.5, cursor: 'pointer', minHeight: 0,
                          background: on ? 'var(--bg-primary)' : 'var(--bg-card)',
                          border: 'none', borderBottom: '1px solid var(--border-light)',
                          color: 'var(--text-primary)',
                        }}
                      >
                        <span aria-hidden style={{
                          width: 17, height: 17, borderRadius: 5, flexShrink: 0,
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 700,
                          background: on ? '#1a1a1a' : 'var(--bg-card)',
                          color: '#fff', border: on ? '1px solid #1a1a1a' : '1px solid var(--border)',
                        }}>{on ? '✓' : ''}</span>
                        <span style={{ lineHeight: 1.4 }}>{p.name.slice(0, 70)}</span>
                      </button>
                    )
                  })}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{sel.size} of {installFix.parts.length} selected</span>
                  <button className="mtg-btn" style={{ fontSize: 11.5, padding: '3px 10px' }}
                    onClick={() => setSel(sel.size === installFix.parts.length ? new Set() : new Set(installFix.parts.map(p => p.id)))}>
                    {sel.size === installFix.parts.length ? 'Select none' : 'Select all'}
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {installFix.canCreate &&
                    choiceBtn(`+ Install tasks (${sel.size})`, () => run(() => onInstall(installFix, 'create', [...sel])), true, sel.size === 0)}
                  {choiceBtn(`✓ Mark handled (${sel.size})`, () => run(() => onInstall(installFix, 'mark', [...sel])), !installFix.canCreate, sel.size === 0)}
                </div>
                <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '10px 0 0', lineHeight: 1.5 }}>
                  {installFix.canCreate
                    ? 'Install tasks land on the mechanic checklist unassigned — hand them out from the recon board.'
                    : 'This car has no active mechanic stage, so parts can only be marked handled here.'}
                </p>
              </div>
            )}

            {/* ── Small action modals ───────────────────────────────── */}
            {modal !== 'detail' && modal !== 'parts' && (
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.5 }}>
                {modal === 'return_date' && `${b.vehicle} — when is it now expected back?`}
                {modal === 'mark_sent' && `${b.vehicle} — sent to the shop today. When is it expected back?`}
                {modal === 'returned' && `${b.vehicle} will be parked for routing on the recon board.`}
                {modal === 'delete' && `${b.vehicle} — this cannot be undone. The reason is recorded in the audit log.`}
                {modal === 'reschedule' && `${b.vehicle} — pick the new date.`}
              </p>
            )}
            {modal === 'delete' && (
              <textarea
                autoFocus rows={2}
                className="mtg-input"
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Why is this repair being deleted? (required)"
                style={{ width: '100%', resize: 'vertical', marginBottom: 16 }}
              />
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {modal === 'return_date' && <>
                {choiceBtn('In 3 days', () => run(() => onFix(b, 3)), true)}
                {choiceBtn('In 1 week', () => run(() => onFix(b, 7)))}
                {choiceBtn('In 2 weeks', () => run(() => onFix(b, 14)))}
              </>}
              {modal === 'mark_sent' && <>
                {choiceBtn('Back in 1 week', () => run(() => onFix(b, 7)), true)}
                {choiceBtn('Back in 2 weeks', () => run(() => onFix(b, 14)))}
              </>}
              {modal === 'returned' && externalId &&
                choiceBtn('Yes — mark returned', () => run(() => onReturned(externalId)), true)}
              {modal === 'delete' && externalId && (
                <button
                  className="mtg-btn mtg-btn-danger"
                  disabled={busy || !reason.trim()}
                  style={{ justifyContent: 'center', padding: '10px 14px', fontSize: 13, flex: 1 }}
                  onClick={() => run(() => onDelete(externalId, reason.trim()))}
                >{busy ? '…' : 'Delete repair'}</button>
              )}
              {modal === 'reschedule' && <>
                {choiceBtn('Today', () => run(() => onFix(b, 0)), true)}
                {choiceBtn('Tomorrow', () => run(() => onFix(b, 1)))}
                {choiceBtn('Next week', () => run(() => onFix(b, 7)))}
              </>}
            </div>
            <button
              className="mtg-btn"
              disabled={busy}
              style={{ width: '100%', justifyContent: 'center', marginTop: 10, padding: '9px 14px' }}
              onClick={close}
            >{modal === 'detail' || modal === 'parts' ? 'Close' : 'Cancel'}</button>
          </div>
        </div>
      )}
    </>
  )
}


/**
 * Complete / delete an external repair without leaving the board.
 * "Returned" runs the real return flow (two-step confirm); delete demands a
 * typed reason that lands in the audit log.
 */
function ExternalQuickControls({ externalId, onReturned, onDelete }: {
  externalId: string
  onReturned: (id: string) => Promise<void>
  onDelete: (id: string, reason: string) => Promise<void>
}) {
  const [step, setStep] = useState<'idle' | 'return' | 'delete'>('idle')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const reset = () => { setStep('idle'); setReason('') }

  if (step === 'return') {
    return (
      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
        <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Car is back at the dealership?</span>
        <button
          className="mtg-btn mtg-btn-dark" disabled={busy}
          onClick={async () => { setBusy(true); try { await onReturned(externalId); reset() } finally { setBusy(false) } }}
        >{busy ? '…' : 'Yes — returned'}</button>
        <button className="mtg-btn" onClick={reset}>No</button>
      </span>
    )
  }
  if (step === 'delete') {
    return (
      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          autoFocus value={reason} onChange={e => setReason(e.target.value)}
          placeholder="Reason for deleting (required, audited)"
          className="mtg-input" style={{ minWidth: 240 }}
        />
        <button
          className="mtg-btn mtg-btn-danger"
          disabled={busy || !reason.trim()}
          onClick={async () => { setBusy(true); try { await onDelete(externalId, reason.trim()); reset() } finally { setBusy(false) } }}
        >{busy ? '…' : 'Delete repair'}</button>
        <button className="mtg-btn" onClick={reset}>Cancel</button>
      </span>
    )
  }
  return (
    <span style={{ display: 'inline-flex', gap: 6 }}>
      <button className="mtg-btn" onClick={() => setStep('return')}>✓ Returned</button>
      <button className="mtg-btn mtg-btn-danger" onClick={() => setStep('delete')}>Delete…</button>
    </span>
  )
}

function DetailLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#4d5a10', margin: '10px 0 4px' }}>{children}</div>
}

const STAGE_COLORS: Record<string, { fg: string; bg: string; dot: string }> = {
  mechanic: { fg: '#7e22ce', bg: '#f5f0fb', dot: '#9333ea' },
  detailing: { fg: '#2563eb', bg: 'var(--info-bg)', dot: '#3b82f6' },
  content: { fg: '#b45309', bg: '#fdf6ec', dot: '#d97706' },
  publish: { fg: '#15803d', bg: '#edfaf0', dot: '#16a34a' },
}

function StockChip({ stock }: { stock: string }) {
  return (
    <span style={{
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      fontSize: 10.5, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '-0.01em',
      background: 'var(--bg-primary)', border: '1px solid var(--border)',
      padding: '2px 7px', borderRadius: 6, whiteSpace: 'nowrap', justifySelf: 'start',
    }}>#{stock}</span>
  )
}

function RowTitle({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 13.5, fontWeight: 640, letterSpacing: '-0.015em', color: 'var(--text-primary)',
      lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
    }}>{children}</span>
  )
}

function DotPill({ label, fg, bg, dot }: { label: string; fg: string; bg: string; dot: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
      fontSize: 10.5, fontWeight: 650, padding: '3px 9px', borderRadius: 100,
      background: bg, color: fg, letterSpacing: '-0.005em', whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot, flexShrink: 0 }} />
      {label}
    </span>
  )
}

function CarRow({ carRef, summary, children }: {
  carRef: CarRef; summary: React.ReactNode; children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ borderBottom: '1px solid var(--border-light)' }}>
      <div
        role="button" tabIndex={0}
        className="mtg-row"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o) } }}
        style={{
          display: 'grid', gridTemplateColumns: '88px 1.4fr 1.1fr 1fr 84px 22px',
          gap: 12, alignItems: 'center', padding: '11px 10px', cursor: 'pointer',
          fontSize: 13, borderRadius: 10,
          background: open ? 'var(--bg-card-hover)' : undefined,
        }}
      >
        {summary}
        <span aria-hidden style={{ color: 'var(--text-muted)', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease', textAlign: 'center', fontSize: 12 }}>▸</span>
      </div>
      {open && (
        <div style={{
          background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
          borderRadius: 12, padding: '16px 18px', margin: '2px 0 14px', fontSize: 12.5,
        }}>
          {children}
        </div>
      )}
    </div>
  )
}

// Who can hold a task on each stage — a mechanic-stage task only goes to mechanics.
const STAGE_ROLES: Record<string, string[]> = {
  mechanic: ['mechanic'],
  detailing: ['detailer'],
  content: ['content'],
  publish: ['content'],
}

function StageTaskList({ tasks, notes, stageId, stage, stock, users, onToggle, onAssign }: {
  tasks: StageTask[]; notes: string | null
  stageId: string | null
  stage: string | null
  stock: string
  users: TeamUser[]
  onToggle: (stageId: string, stock: string, idx: number, done: boolean) => void
  onAssign: (stageId: string, stock: string, idx: number, u: TeamUser | null) => void
}) {
  const [assignIdx, setAssignIdx] = useState<number | null>(null)
  const roles = stage ? STAGE_ROLES[stage] : undefined
  const eligible = roles ? users.filter(u => roles.includes(u.role)) : users
  if (tasks.length === 0 && !notes) return <p style={{ margin: 0, color: 'var(--text-muted)' }}>No task list on the current stage.</p>
  const done = tasks.filter(t => t.done).length
  return (
    <>
      {tasks.length > 0 && (
        <>
          <DetailLabel>Tasks · {done}/{tasks.length} done — click to check off, click a name to reassign</DetailLabel>
          <div style={{ border: '1px solid var(--border-light)', borderRadius: 10, background: 'var(--bg-card)' }}>
            {tasks.map(t => (
              <div key={t.idx} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', fontSize: 12.5,
                borderBottom: '1px solid var(--border-light)', position: 'relative',
              }}>
                <button
                  disabled={!stageId}
                  aria-pressed={t.done}
                  aria-label={t.done ? `Reopen: ${t.item}` : `Mark complete: ${t.item}`}
                  onClick={() => stageId && onToggle(stageId, stock, t.idx, !t.done)}
                  style={{
                    width: 17, height: 17, borderRadius: 5, flexShrink: 0, padding: 0, minHeight: 0,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, cursor: stageId ? 'pointer' : 'default',
                    background: t.done ? '#16a34a' : 'var(--bg-card)',
                    color: '#fff', border: t.done ? '1px solid #16a34a' : '1px solid var(--border)',
                  }}
                >{t.done ? '✓' : ''}</button>
                <span style={{
                  flex: 1, lineHeight: 1.4, minWidth: 0,
                  color: t.done ? 'var(--text-muted)' : 'var(--text-primary)',
                  fontWeight: t.done ? 400 : 500,
                  textDecoration: t.done ? 'line-through' : 'none',
                }}>
                  {t.item}
                  {t.note && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> ({t.note})</span>}
                </span>
                <button
                  disabled={!stageId}
                  title="Reassign this task"
                  onClick={() => setAssignIdx(assignIdx === t.idx ? null : t.idx)}
                  style={{
                    background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 100,
                    padding: '2px 10px', fontSize: 10.5, fontWeight: 650, minHeight: 0,
                    color: t.assignee ? 'var(--text-secondary)' : 'var(--text-muted)',
                    cursor: stageId ? 'pointer' : 'default', whiteSpace: 'nowrap', flexShrink: 0,
                  }}
                >{t.assignee ?? '+ assign'}</button>
                {assignIdx === t.idx && stageId && (
                  <div role="listbox" style={{
                    position: 'absolute', right: 10, top: 'calc(100% - 4px)', zIndex: 20, minWidth: 180,
                    background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10,
                    boxShadow: '0 8px 24px rgba(24,24,27,0.16)', overflow: 'hidden', maxHeight: 210, overflowY: 'auto',
                  }}>
                    <button
                      onClick={() => { onAssign(stageId, stock, t.idx, null); setAssignIdx(null) }}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 12,
                        background: 'var(--bg-card)', border: 'none', borderBottom: '1px solid var(--border-light)',
                        cursor: 'pointer', minHeight: 0, color: 'var(--text-muted)',
                      }}
                    >Unassigned</button>
                    {eligible.map(u => (
                      <button
                        key={u.id}
                        onClick={() => { onAssign(stageId, stock, t.idx, u); setAssignIdx(null) }}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                          width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 12,
                          background: u.name === t.assignee ? 'var(--bg-primary)' : 'var(--bg-card)',
                          border: 'none', borderBottom: '1px solid var(--border-light)',
                          cursor: 'pointer', minHeight: 0, color: 'var(--text-primary)',
                          fontWeight: u.name === t.assignee ? 650 : 500,
                        }}
                      >
                        <span>{u.name}</span>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{u.role.replace('_', ' ')}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
      {notes && <><DetailLabel>Notes</DetailLabel><p style={{ margin: 0 }}>{notes}</p></>}
    </>
  )
}

function InboundList({ parts, onReceive }: {
  parts: InboundPart[]
  onReceive: (partId: string, name: string) => void
}) {
  if (parts.length === 0) return null
  return (
    <>
      <DetailLabel>Parts coming in · {parts.length}</DetailLabel>
      <div style={{ border: '1px solid var(--border-light)', borderRadius: 10, background: 'var(--bg-card)' }}>
        {parts.map(p => (
          <div key={p.partId} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', fontSize: 12.5,
            borderBottom: '1px solid var(--border-light)',
          }}>
            <span style={{ flex: 1, lineHeight: 1.4, fontWeight: 500 }}>{p.name.slice(0, 70)}</span>
            <span style={warnPill}>{p.status}{p.eta ? ` · ETA ${fmtDate(p.eta)}` : ''}</span>
            <button
              className="mtg-btn"
              style={{ padding: '3px 10px', fontSize: 11.5 }}
              title="It arrived — mark received"
              onClick={() => onReceive(p.partId, p.name)}
            >✓ Received</button>
          </div>
        ))}
      </div>
    </>
  )
}

function FollowupList({ items, onDone, onEdit }: {
  items: FollowUp[]; onDone: (id: string) => void; onEdit: (f: FollowUp) => void
}) {
  if (items.length === 0) return null
  return (
    <>
      <DetailLabel>Admin follow-ups · {items.length}</DetailLabel>
      <ul style={{ margin: 0, paddingLeft: 4, listStyle: 'none' }}>
        {items.map(f => (
          <li key={f.id} style={{ margin: '3px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={e => { e.stopPropagation(); onDone(f.id) }}
              title="Mark done"
              className="mtg-btn" style={{ padding: '2px 9px', fontSize: 11.5 }}
            >✓</button>
            <button
              onClick={e => { e.stopPropagation(); onEdit(f) }}
              title="Edit — assignee, notes, due date"
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', minHeight: 0,
                fontSize: 12.5, fontWeight: 500, color: 'var(--text-primary)', textAlign: 'left',
              }}
            >⚑ {f.title}</button>
            {f.assignee && <span style={mutedPill}>{f.assignee.name}</span>}
            {dueBadge(f.dueDate)}
          </li>
        ))}
      </ul>
    </>
  )
}

function FollowupStrip({ followups, onDone, onNew, onEdit }: {
  followups: FollowUp[]
  onDone: (id: string) => void
  onNew: () => void
  onEdit: (f: FollowUp) => void
}) {
  return (
    <section className="card" style={{ padding: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: followups.length ? 10 : 0 }}>
        <div>
          <div style={eyebrow}>Reminders</div>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: '2px 0 0' }}>
            Admin Follow-ups — {followups.length} open
          </h2>
        </div>
        <button className="mtg-btn" onClick={onNew}>+ Follow-up</button>
      </div>
      {followups.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '8px 0 0' }}>Nothing pending — you're all caught up.</p>
      )}
      {followups.map(f => (
        <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 4px', borderTop: '1px solid var(--border)', fontSize: 13 }}>
          <button onClick={() => onDone(f.id)} title="Mark done" className="mtg-btn" style={{ padding: '3px 10px', fontSize: 12 }}>✓</button>
          <button
            onClick={() => onEdit(f)}
            title="Edit — assignee, notes, due date"
            className="mtg-row"
            style={{
              flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer',
              padding: '3px 6px', fontSize: 13, fontWeight: 500, minHeight: 0, borderRadius: 8,
              color: 'var(--text-primary)',
            }}
          >
            {f.priority === 2 && <span style={{ ...pill('rgba(185,28,28,0.10)', '#b91c1c'), marginRight: 7, fontSize: 10.5 }}>urgent</span>}
            {f.title}
            {f.description && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> — {f.description}</span>}
          </button>
          {f.assignee && <span style={mutedPill}>{f.assignee.name}</span>}
          {(f.stockNumbers || []).map(sn => <span key={sn} style={mutedPill}>{sn}</span>)}
          {dueBadge(f.dueDate)}
        </div>
      ))}
    </section>
  )
}

type Actions = {
  addReconTask: (c: CarRef, item: string) => Promise<boolean>
  addFollowup: (c: CarRef | null, title: string, detail?: string, dueInDays?: number) => Promise<boolean>
  addPart: (c: CarRef, name: string, notes?: string, assignedToId?: string | null) => Promise<boolean>
  sendExternal: (c: CarRef, shop: string, work: string, opts?: { expectedInDays?: number; notes?: string }) => Promise<boolean>
  runPlan: (c: CarRef, steps: PlanStep[]) => Promise<boolean>
}

function describeStep(s: PlanStep): string {
  switch (s.type) {
    case 'part_request': return `Part request${s.partAssignToName ? ` for ${s.partAssignToName}` : ''}: "${s.partName}"${s.notes ? ` (${s.notes})` : ''}`
    case 'followup': return `Follow-up${s.assignToName ? ` for ${s.assignToName}` : ''}: "${s.title}"${s.dueInDays != null ? ` · due in ${s.dueInDays}d` : ''}`
    case 'recon_task': return `Recon task for the mechanic: "${s.item}"`
    case 'external': return `Send to external: ${s.shopName?.trim() || '(which shop?)'}${s.work?.trim() ? ` — "${s.work}"` : ''}${s.partOnly ? ' · part only, car stays' : ''}${s.expectedInDays != null ? ` · expected in ${s.expectedInDays}d` : ''}`
  }
}

function ActionBar({ carRef, actions, users, allowReconTask, allowExternal }: {
  carRef: CarRef; actions: Actions; users: TeamUser[]; allowReconTask?: boolean; allowExternal?: boolean
}) {
  const [mode, setMode] = useState<'none' | 'task' | 'followup' | 'part' | 'external'>('none')
  const [f1, setF1] = useState('') // primary field
  const [f2, setF2] = useState('') // secondary field
  const [partAssignee, setPartAssignee] = useState<TeamUser | null>(null)
  const [assignOpen, setAssignOpen] = useState(false)
  const [smart, setSmart] = useState('')
  const [plan, setPlan] = useState<PlanStep[] | null>(null)
  const [planText, setPlanText] = useState('')
  const [planQuestion, setPlanQuestion] = useState<{ prompt: string; options: string[]; base: string } | null>(null)
  const [planError, setPlanError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const reset = () => {
    setMode('none'); setF1(''); setF2(''); setPartAssignee(null); setAssignOpen(false)
    setSmart(''); setPlan(null); setPlanText(''); setPlanQuestion(null); setPlanError(null)
  }

  async function interpret(textOverride?: string) {
    const text = (textOverride ?? smart).trim()
    if (!text || busy) return
    setBusy(true)
    setPlan(null)
    setPlanQuestion(null)
    setPlanError(null)
    try {
      const res = await fetch('/api/reports/meeting/interpret', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, vehicle: `${carRef.stock} ${carRef.vehicle}`, hasStage: !!carRef.stageId }),
      })
      const data = await res.json()
      if (res.ok && Array.isArray(data.steps) && data.steps.length) {
        setPlan(data.steps as PlanStep[])
        setPlanText(text)
      } else if (res.ok && data.question?.prompt) {
        // The AI is unsure — it asks, you tap, it re-reads with your answer.
        setPlanQuestion({ prompt: data.question.prompt, options: data.question.options ?? [], base: text })
      } else {
        setPlanError(data.error || 'Could not understand that — try rewording.')
      }
    } finally {
      setBusy(false)
    }
  }

  async function submitMode() {
    if (busy || !f1.trim()) return
    setBusy(true)
    try {
      let ok = false
      if (mode === 'task') ok = await actions.addReconTask(carRef, f1.trim())
      if (mode === 'followup') ok = await actions.addFollowup(carRef, f1.trim(), undefined, f2 ? Number(f2) : undefined)
      if (mode === 'part') ok = await actions.addPart(carRef, f1.trim(), f2.trim() || undefined, partAssignee?.id ?? null)
      if (mode === 'external') ok = await actions.sendExternal(carRef, f1.trim(), f2.trim() || 'See notes')
      if (ok) reset()
    } finally {
      setBusy(false)
    }
  }


  return (
    <div onClick={e => e.stopPropagation()} style={{ marginTop: 12, borderTop: '1px dashed var(--border)', paddingTop: 10 }}>
      {/* Smart input */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ color: '#4d5a10', fontWeight: 700 }}>✦</span>
        <input
          value={smart}
          onChange={e => setSmart(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') interpret() }}
          placeholder={`Type anything… "order rear bumper" · "remove hood, send to Frank's" · "have Paul check the AC"`}
          className="mtg-input" style={{ flex: 1, minWidth: 180 }}
        />
        <button className="mtg-btn mtg-btn-dark" disabled={busy || !smart.trim()} onClick={() => interpret()}>{busy ? '…' : 'Go'}</button>
      </div>
      {planError && (
        <div style={{ marginTop: 8, fontSize: 12.5, color: '#b45309' }}>{planError}</div>
      )}
      {planQuestion && (
        <div style={{
          marginTop: 8, background: 'var(--info-bg)', border: '1px solid var(--info-border)',
          borderRadius: 10, padding: '10px 12px', fontSize: 12.5,
        }}>
          <div style={{ fontWeight: 650, marginBottom: 8 }}>{planQuestion.prompt}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {planQuestion.options.map(opt => (
              <button
                key={opt}
                className="mtg-btn"
                disabled={busy}
                onClick={() => interpret(`${planQuestion.base} — answer: ${opt}`)}
              >{opt}</button>
            ))}
            <button className="mtg-btn" disabled={busy} style={{ marginLeft: 'auto' }} onClick={() => setPlanQuestion(null)}>Cancel</button>
          </div>
        </div>
      )}
      {plan && (
        <div style={{
          marginTop: 8, background: 'rgba(196,224,80,0.16)', border: '1px solid rgba(196,224,80,0.5)',
          borderRadius: 10, padding: '10px 12px', fontSize: 12.5,
        }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#4d5a10', marginBottom: 6 }}>
            {plan.length === 1 ? 'Proposed action' : `Proposed plan · ${plan.length} steps`}
          </div>
          <ol style={{ margin: '0 0 8px', paddingLeft: plan.length === 1 ? 0 : 18, listStyle: plan.length === 1 ? 'none' : 'decimal' }}>
            {plan.map((s, i) => (
              <li key={i} style={{ margin: '2px 0' }}>
                {describeStep(s)}
                {/* The AI never fills gaps with guesses — you do, right here. */}
                {s.type === 'external' && !s.shopName?.trim() && (
                  <input
                    className="mtg-input"
                    value={s.shopName ?? ''}
                    onChange={e => setPlan(p => p ? p.map((x, xi) => xi === i ? { ...x, shopName: e.target.value } : x) : p)}
                    placeholder="Which shop? (required)"
                    style={{ display: 'block', width: '100%', marginTop: 4, fontSize: 12 }}
                  />
                )}
                {s.type === 'external' && !s.work?.trim() && (
                  <input
                    className="mtg-input"
                    value={s.work ?? ''}
                    onChange={e => setPlan(p => p ? p.map((x, xi) => xi === i ? { ...x, work: e.target.value } : x) : p)}
                    placeholder="What will the shop do? (required)"
                    style={{ display: 'block', width: '100%', marginTop: 4, fontSize: 12 }}
                  />
                )}
              </li>
            ))}
          </ol>
          {plan.length > 1 && plan.some(s => s.type === 'recon_task') && plan.some(s => s.type === 'external') && (
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 8 }}>
              The external repair will be noted as waiting on the mechanic task.
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="mtg-btn mtg-btn-dark"
              disabled={busy || plan.some(s => s.type === 'external' && (!s.work?.trim() || !s.shopName?.trim()))}
              onClick={async () => {
                setBusy(true)
                try {
                  if (await actions.runPlan(carRef, plan)) {
                    // Learn-as-you-use: confirmed plans become reference examples
                    if (planText) {
                      fetch('/api/reports/meeting/examples', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text: planText, steps: plan }),
                      }).catch(() => {})
                    }
                    reset()
                  }
                } finally { setBusy(false) }
              }}
            >{busy ? '…' : plan.length === 1 ? 'Confirm' : 'Confirm all'}</button>
            <button className="mtg-btn" onClick={() => setPlan(null)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Quick buttons */}
      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        {allowReconTask && carRef.stageId && (
          <button className={mode === 'task' ? 'mtg-btn mtg-btn-dark' : 'mtg-btn mtg-add'} onClick={() => { setMode(m => m === 'task' ? 'none' : 'task'); setF1(''); setF2('') }}>+ Recon task</button>
        )}
        <button className={mode === 'followup' ? 'mtg-btn mtg-btn-dark' : 'mtg-btn mtg-add'} onClick={() => { setMode(m => m === 'followup' ? 'none' : 'followup'); setF1(''); setF2('') }}>⚑ Follow-up</button>
        <button className={mode === 'part' ? 'mtg-btn mtg-btn-dark' : 'mtg-btn mtg-add'} onClick={() => { setMode(m => m === 'part' ? 'none' : 'part'); setF1(''); setF2('') }}>+ Part</button>
        {allowExternal && (
          <button className={mode === 'external' ? 'mtg-btn mtg-btn-dark' : 'mtg-btn mtg-add'} onClick={() => { setMode(m => m === 'external' ? 'none' : 'external'); setF1(''); setF2('') }}>→ External</button>
        )}
      </div>

      {mode !== 'none' && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            autoFocus value={f1} onChange={e => setF1(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && mode !== 'external') submitMode() }}
            placeholder={
              mode === 'task' ? 'Task for the mechanic, e.g. "Fix brake lights"'
              : mode === 'followup' ? 'What do you need to do for this car?'
              : mode === 'part' ? 'Part name, e.g. "Rear bumper"'
              : 'Shop name, e.g. "Frank\'s Hydraulics"'
            }
            className="mtg-input" style={{ flex: 1, minWidth: 180 }}
          />
          {mode === 'followup' && (
            <DuePicker value={f2} onChange={setF2} />
          )}
          {mode === 'part' && (
            <>
              <input value={f2} onChange={e => setF2(e.target.value)} placeholder="Notes (optional)" className="mtg-input" style={{ flex: '0 1 180px' }} />
              <span style={{ position: 'relative' }}>
                <button
                  className="mtg-btn"
                  aria-haspopup="listbox"
                  aria-expanded={assignOpen}
                  onClick={() => setAssignOpen(o => !o)}
                >{partAssignee ? `→ ${partAssignee.name.split(' ')[0]}` : 'Assign…'}</button>
                {assignOpen && (
                  <span role="listbox" style={{
                    position: 'absolute', bottom: 'calc(100% + 4px)', right: 0, zIndex: 30, minWidth: 180,
                    background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10,
                    boxShadow: '0 8px 24px rgba(24,24,27,0.16)', overflow: 'hidden', display: 'block',
                    maxHeight: 200, overflowY: 'auto',
                  }}>
                    <button
                      onClick={() => { setPartAssignee(null); setAssignOpen(false) }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 12, background: 'var(--bg-card)', border: 'none', borderBottom: '1px solid var(--border-light)', cursor: 'pointer', minHeight: 0, color: 'var(--text-muted)' }}
                    >Unassigned</button>
                    {users.map(u => (
                      <button
                        key={u.id}
                        onClick={() => { setPartAssignee(u); setAssignOpen(false) }}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 12, background: partAssignee?.id === u.id ? 'var(--bg-primary)' : 'var(--bg-card)', border: 'none', borderBottom: '1px solid var(--border-light)', cursor: 'pointer', minHeight: 0, color: 'var(--text-primary)' }}
                      >{u.name}</button>
                    ))}
                  </span>
                )}
              </span>
            </>
          )}
          {mode === 'external' && (
            <input value={f2} onChange={e => setF2(e.target.value)} placeholder="Work to be done" className="mtg-input" style={{ flex: 1, minWidth: 180 }}
              onKeyDown={e => { if (e.key === 'Enter') submitMode() }} />
          )}
          <button className="mtg-btn mtg-btn-dark" disabled={busy || !f1.trim()} onClick={submitMode}>{busy ? '…' : 'Save'}</button>
        </div>
      )}
    </div>
  )
}
