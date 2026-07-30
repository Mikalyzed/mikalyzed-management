import { prisma } from '@/lib/db'

/**
 * Team Activity report — "what did each person complete this week."
 *
 * Aggregates per active user from four independent sources:
 *   1. Board tasks (Task.completedAt in range, by assigneeId)
 *   2. Checklist items inside VehicleStage.checklist JSON (done + doneAt in
 *      range). doneAt only exists on items completed after 2026-07-28 —
 *      earlier completions have no timestamp and are deliberately not counted.
 *      Attribution: item.assigneeId when set, else the stage's assigneeId.
 *   3. Stages completed (VehicleStage.completedAt in range, status done)
 *   4. ActivityLog rows (parts / routing / external actions, by actorId)
 * Plus external-repair follow-ups, attributed by matching the entry's `by`
 * name to a user's name (the JSON stores a name, not an id — a rename would
 * orphan old entries; acceptable for a weekly report).
 *
 * Everything comes straight from the DB — no AI, no invented numbers.
 */

export type TeamHighlight = {
  kind: 'task' | 'checklist' | 'stage' | 'followup' | 'activity'
  label: string
  stock?: string | null
}

export type TeamActivityPerson = {
  userId: string
  name: string
  role: string
  /** false → all-zero totals; UI shows these collapsed as "no activity" */
  hasActivity: boolean
  totals: {
    tasksDone: number
    checklistDone: number
    stagesDone: number
    followUps: number
    /** Human label → count, e.g. { "Parts Requested": 3 } */
    activityCounts: Record<string, number>
  }
  highlights: TeamHighlight[]
}

const MAX_HIGHLIGHTS = 12

/** Aggregate labels for the totals chips (Title Case, no lowercase runs). */
const ACTIVITY_LABELS: Record<string, string> = {
  part_created: 'Parts Requested',
  part_created_with_url: 'Parts Sourced With Link',
  install_tasks_created: 'Install Tasks Created',
  install_tasks_marked_handled: 'Install Tasks Handled',
  routing_proposed: 'Routing Proposed',
  smart_task_created: 'Smart Tasks Created',
  routed: 'Cars Routed',
  sent_to_external: 'Sent To External',
  returned_from_external: 'Returned From External',
}

const TRACKED_ACTIONS = [
  'part_created',
  'install_tasks_created',
  'install_tasks_marked_handled',
  'routing_proposed',
  'smart_task_created',
  'routed',
  'sent_to_external',
  'returned_from_external',
]

type ChecklistItem = {
  item?: string
  done?: boolean
  doneAt?: string
  assigneeId?: string
  assigneeName?: string
}

function titleCase(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

function trunc(s: string, n = 80) {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}

export async function buildTeamActivity(weekStart: Date, weekEnd: Date) {
  const range = { gte: weekStart, lt: weekEnd }

  const [users, boardTasks, allStages, doneStages, activity, externals] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    }),
    prisma.task.findMany({
      where: { completedAt: range, assigneeId: { not: null } },
      select: { title: true, assigneeId: true, completedAt: true, stockNumbers: true },
    }),
    // Full checklist scan — every stage regardless of status, since a live
    // stage can already hold items finished this week. Row count is bounded
    // by total stages ever created; fine for an on-demand report.
    prisma.vehicleStage.findMany({
      select: {
        assigneeId: true,
        stage: true,
        checklist: true,
        vehicle: { select: { stockNumber: true } },
      },
    }),
    prisma.vehicleStage.findMany({
      where: { status: 'done', completedAt: range },
      select: {
        assigneeId: true,
        stage: true,
        completedAt: true,
        vehicle: { select: { stockNumber: true } },
      },
    }),
    prisma.activityLog.findMany({
      where: { createdAt: range, action: { in: TRACKED_ACTIONS }, actorId: { not: null } },
      select: { action: true, actorId: true, details: true, createdAt: true, entityType: true, entityId: true },
    }),
    // updatedAt >= weekStart is a safe superset: appending a follow-up bumps
    // updatedAt to that moment, and later edits only push it forward — so any
    // repair with an in-range follow-up is guaranteed to be in this set.
    prisma.externalRepair.findMany({
      where: { updatedAt: { gte: weekStart } },
      select: { stockNumber: true, followUps: true },
    }),
  ])

  // Stock numbers for vehicle-entity activity rows (for highlight chips)
  const vehicleIds = [...new Set(activity.filter(a => a.entityType === 'vehicle').map(a => a.entityId))]
  const vehicleStocks = vehicleIds.length
    ? await prisma.vehicle.findMany({ where: { id: { in: vehicleIds } }, select: { id: true, stockNumber: true } })
    : []
  const stockByVehicleId = new Map(vehicleStocks.map(v => [v.id, v.stockNumber]))

  type Acc = {
    tasksDone: number
    checklistDone: number
    stagesDone: number
    followUps: number
    activityCounts: Record<string, number>
    highlights: Array<TeamHighlight & { at: number }>
  }
  const byUser = new Map<string, Acc>()
  const acc = (userId: string): Acc => {
    let a = byUser.get(userId)
    if (!a) {
      a = { tasksDone: 0, checklistDone: 0, stagesDone: 0, followUps: 0, activityCounts: {}, highlights: [] }
      byUser.set(userId, a)
    }
    return a
  }
  const userIds = new Set(users.map(u => u.id))
  const userIdByName = new Map(users.map(u => [u.name.trim().toLowerCase(), u.id]))

  // 1. Board tasks
  for (const t of boardTasks) {
    if (!t.assigneeId || !userIds.has(t.assigneeId)) continue
    const a = acc(t.assigneeId)
    a.tasksDone += 1
    const stocks = Array.isArray(t.stockNumbers) ? (t.stockNumbers as unknown[]) : []
    a.highlights.push({
      kind: 'task',
      label: trunc(t.title),
      stock: typeof stocks[0] === 'string' ? (stocks[0] as string) : null,
      at: t.completedAt ? t.completedAt.getTime() : 0,
    })
  }

  // 2. Checklist items (doneAt-stamped only — see file header)
  for (const s of allStages) {
    const items = Array.isArray(s.checklist) ? (s.checklist as ChecklistItem[]) : []
    for (const it of items) {
      if (it?.done !== true || typeof it.doneAt !== 'string') continue
      const at = new Date(it.doneAt)
      if (isNaN(at.getTime()) || at < weekStart || at >= weekEnd) continue
      const owner = (typeof it.assigneeId === 'string' && it.assigneeId) ? it.assigneeId : s.assigneeId
      if (!owner || !userIds.has(owner)) continue
      const a = acc(owner)
      a.checklistDone += 1
      const text = (it.item ?? '').trim()
      if (text) {
        a.highlights.push({ kind: 'checklist', label: trunc(text), stock: s.vehicle.stockNumber, at: at.getTime() })
      }
    }
  }

  // 3. Stages completed
  for (const s of doneStages) {
    if (!s.assigneeId || !userIds.has(s.assigneeId)) continue
    const a = acc(s.assigneeId)
    a.stagesDone += 1
    a.highlights.push({
      kind: 'stage',
      label: `${titleCase(s.stage)} Stage Completed`,
      stock: s.vehicle.stockNumber,
      at: s.completedAt ? s.completedAt.getTime() : 0,
    })
  }

  // 4. Parts / routing / external activity
  for (const log of activity) {
    if (!log.actorId || !userIds.has(log.actorId)) continue
    const details = (log.details ?? {}) as Record<string, unknown>
    const key = log.action === 'part_created' && details.hasUrl === true ? 'part_created_with_url' : log.action
    const label = ACTIVITY_LABELS[key]
    if (!label) continue
    const a = acc(log.actorId)
    a.activityCounts[label] = (a.activityCounts[label] ?? 0) + 1

    const stock = log.entityType === 'vehicle'
      ? stockByVehicleId.get(log.entityId) ?? (typeof details.stockNumber === 'string' ? details.stockNumber : null)
      : (typeof details.stockNumber === 'string' ? details.stockNumber : null)
    let eventLabel = label
    if (log.action === 'part_created' && typeof details.partName === 'string' && details.partName) {
      eventLabel = `${details.hasUrl === true ? 'Sourced Part With Link' : 'Requested Part'} — ${trunc(details.partName, 50)}`
    } else if (log.action === 'routed' && typeof details.to === 'string' && details.to) {
      eventLabel = `Routed To ${titleCase(details.to)}`
    }
    a.highlights.push({ kind: 'activity', label: eventLabel, stock, at: log.createdAt.getTime() })
  }

  // 5. External-repair follow-ups (name-matched)
  for (const e of externals) {
    const entries = Array.isArray(e.followUps) ? (e.followUps as Array<Record<string, unknown>>) : []
    for (const f of entries) {
      if (typeof f?.by !== 'string' || typeof f?.date !== 'string') continue
      const at = new Date(f.date)
      if (isNaN(at.getTime()) || at < weekStart || at >= weekEnd) continue
      const owner = userIdByName.get(f.by.trim().toLowerCase())
      if (!owner) continue
      const a = acc(owner)
      a.followUps += 1
      const note = typeof f.note === 'string' ? f.note : ''
      a.highlights.push({
        kind: 'followup',
        label: note ? `Follow-Up — ${trunc(note, 60)}` : 'External Shop Follow-Up',
        stock: e.stockNumber,
        at: at.getTime(),
      })
    }
  }

  const people: TeamActivityPerson[] = users.map(u => {
    const a = byUser.get(u.id)
    const totals = {
      tasksDone: a?.tasksDone ?? 0,
      checklistDone: a?.checklistDone ?? 0,
      stagesDone: a?.stagesDone ?? 0,
      followUps: a?.followUps ?? 0,
      activityCounts: a?.activityCounts ?? {},
    }
    const activitySum = Object.values(totals.activityCounts).reduce((s, n) => s + n, 0)
    const hasActivity = totals.tasksDone + totals.checklistDone + totals.stagesDone + totals.followUps + activitySum > 0
    const highlights = (a?.highlights ?? [])
      .sort((x, y) => y.at - x.at)
      .slice(0, MAX_HIGHLIGHTS)
      .map(({ kind, label, stock }) => ({ kind, label, stock }))
    return { userId: u.id, name: u.name, role: u.role, hasActivity, totals, highlights }
  })

  // Active people first, busiest at the top
  const weight = (p: TeamActivityPerson) =>
    p.totals.tasksDone + p.totals.checklistDone + p.totals.stagesDone + p.totals.followUps +
    Object.values(p.totals.activityCounts).reduce((s, n) => s + n, 0)
  people.sort((x, y) => (Number(y.hasActivity) - Number(x.hasActivity)) || (weight(y) - weight(x)) || x.name.localeCompare(y.name))

  return { people, generatedAt: new Date().toISOString() }
}
