import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

// Work-hours window (ET). Overridable via env for local dev/testing —
// e.g. MECH_WORK_START=0 MECH_WORK_END=24 disables the gate entirely.
const WORK_START = Number(process.env.MECH_WORK_START ?? 5)
const WORK_END = Number(process.env.MECH_WORK_END ?? 22)
const HOURS_PER_DAY = WORK_END - WORK_START
const TZ = 'America/New_York'

// Synthetic key for legacy/unowned single-timer work (car with no assignee).
const UNASSIGNED = '__unassigned__'

function etHour(d: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(d)
  const h = parseInt(parts.find(p => p.type === 'hour')!.value)
  const m = parseInt(parts.find(p => p.type === 'minute')!.value)
  return h + m / 60
}

// ET calendar day as 'YYYY-MM-DD' (en-CA yields that format) — used to bucket
// time-log sessions by the day the work actually happened.
function etDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

// Record one completed work session (a timer start→stop) so daily/weekly
// per-mechanic hours stay accurate even when a car spans multiple days.
async function logSession(stageId: string, vehicleId: string, userId: string, startedAtISO: string | null | undefined, endedAt: Date, seconds: number) {
  if (!userId || userId === UNASSIGNED || !startedAtISO || seconds <= 0) return
  await prisma.mechanicTimeLog.create({
    data: {
      stageId, vehicleId, userId,
      seconds,
      startedAt: new Date(startedAtISO),
      endedAt,
      workDate: etDate(endedAt),
    },
  }).catch(() => {})
}

// ── Per-mechanic timers ──────────────────────────────────────────────────────
// A car may be worked by more than one mechanic (each owning their own tasks).
// Timing is therefore keyed by userId in `stage.timers`. Cars worked by a single
// mechanic (the common case) never grow a map — they fall back to the legacy
// single-timer columns and behave exactly as before.

type TimerEntry = {
  activeSeconds: number
  timerStartedAt: string | null
  autoPaused?: boolean
  pauseReason?: string | null
  pauseDetail?: string | null
  pausedAt?: string | null
  // This mechanic has finished their part of a shared car (clock stopped).
  done?: boolean
}

type StageTimerFields = {
  timers: Prisma.JsonValue | null
  assigneeId: string | null
  activeSeconds: number
  timerStartedAt: Date | null
  autoPaused: boolean
  pauseReason: string | null
  pauseDetail: string | null
  pausedAt: Date | null
}

// Read the per-user timer map, seeding from the legacy single-timer columns when
// the map is absent (existing cars, and any car ever worked by one mechanic).
function readTimers(stage: StageTimerFields): Record<string, TimerEntry> {
  const raw = stage.timers as Record<string, TimerEntry> | null
  if (raw && typeof raw === 'object' && Object.keys(raw).length > 0) return raw
  const key = stage.assigneeId || UNASSIGNED
  return {
    [key]: {
      activeSeconds: stage.activeSeconds || 0,
      timerStartedAt: stage.timerStartedAt ? stage.timerStartedAt.toISOString() : null,
      autoPaused: stage.autoPaused,
      pauseReason: stage.pauseReason,
      pauseDetail: stage.pauseDetail,
      pausedAt: stage.pausedAt ? stage.pausedAt.toISOString() : null,
    },
  }
}

// Live elapsed for one timer entry — accrues only during work hours (parity with
// the auto-pause behaviour so numbers don't drift overnight).
function entryElapsed(entry: TimerEntry, nowMs: number, withinHours: boolean): number {
  let sec = entry.activeSeconds || 0
  if (entry.timerStartedAt && withinHours) {
    sec += Math.floor((nowMs - new Date(entry.timerStartedAt).getTime()) / 1000)
  }
  return Math.max(0, sec)
}

function anyRunning(timers: Record<string, TimerEntry>): boolean {
  return Object.values(timers).some(t => !!t.timerStartedAt)
}

// Aggregate elapsed across every mechanic who worked the car — used by the
// car-level scheduling math (which cares about total labour, not who did it).
function totalElapsed(timers: Record<string, TimerEntry>, nowMs: number, withinHours: boolean): number {
  return Object.values(timers).reduce((sum, t) => sum + entryElapsed(t, nowMs, withinHours), 0)
}

// ── Checklist / per-task assignment ──────────────────────────────────────────
type ChecklistItem = {
  item?: string
  done?: boolean
  assigneeId?: string | null
  assigneeName?: string | null
  [k: string]: unknown
}

// The set of mechanics "on" a car = its default owner (stage.assigneeId) plus
// anyone a task was explicitly handed to. Names resolved via `nameOf`.
function assigneesOnCar(
  stage: { assigneeId: string | null; assignee: { id: string; name: string } | null; checklist: Prisma.JsonValue },
  nameOf: (id: string) => string | null,
): { id: string; name: string }[] {
  const ids = new Set<string>()
  if (stage.assigneeId) ids.add(stage.assigneeId)
  const list = Array.isArray(stage.checklist) ? (stage.checklist as ChecklistItem[]) : []
  for (const it of list) {
    if (it && typeof it.assigneeId === 'string' && it.assigneeId) ids.add(it.assigneeId)
  }
  return [...ids].map(id => ({
    id,
    name: (id === stage.assignee?.id ? stage.assignee?.name : null) || nameOf(id) || 'Unknown',
  }))
}

export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const stages = await prisma.vehicleStage.findMany({
    where: { stage: 'mechanic' },
    include: {
      vehicle: { select: { id: true, stockNumber: true, year: true, make: true, model: true, color: true, returnQueue: true } },
      assignee: { select: { id: true, name: true } },
    },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  })

  // Resolve mechanic names for per-user timers + per-task assignees.
  const mechUsers = await prisma.user.findMany({
    where: { role: 'mechanic', isActive: true },
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
  })
  const nameMap = new Map<string, string>(mechUsers.map(u => [u.id, u.name]))
  for (const s of stages) if (s.assignee) nameMap.set(s.assignee.id, s.assignee.name)
  const nameOf = (id: string) => nameMap.get(id) || null

  const now = new Date()
  const nowMs = now.getTime()
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)

  const h = etHour(now)
  const withinHours = h >= WORK_START && h < WORK_END

  // Auto-pause any running timer (across all mechanics) outside working hours.
  if (!withinHours) {
    for (const s of stages) {
      const timers = readTimers(s)
      let changed = false
      for (const [uid, t] of Object.entries(timers)) {
        if (t.timerStartedAt) {
          const elapsed = Math.floor((nowMs - new Date(t.timerStartedAt).getTime()) / 1000)
          await logSession(s.id, s.vehicleId, uid, t.timerStartedAt, now, Math.max(0, elapsed))
          timers[uid] = {
            ...t,
            activeSeconds: (t.activeSeconds || 0) + Math.max(0, elapsed),
            timerStartedAt: null,
            autoPaused: true,
          }
          changed = true
        }
      }
      if (changed) {
        await prisma.vehicleStage.update({
          where: { id: s.id },
          data: { timers: timers as Prisma.InputJsonValue, timerStartedAt: null, autoPaused: true },
        })
        s.timers = timers as Prisma.JsonValue
        s.timerStartedAt = null
        s.autoPaused = true
      }
    }
  }

  // Fetch parts for all vehicles in mechanic stage
  const vehicleIds = [...new Set(stages.map(s => s.vehicleId))]
  const allParts = vehicleIds.length > 0 ? await prisma.part.findMany({
    where: { vehicleId: { in: vehicleIds }, status: { not: 'received' } },
    select: { vehicleId: true, status: true },
  }) : []

  const partsMap: Record<string, string> = {}
  for (const vid of vehicleIds) {
    const vParts = allParts.filter(p => p.vehicleId === vid).map(p => p.status)
    if (vParts.includes('requested')) partsMap[vid] = 'Parts need to be found'
    else if (vParts.includes('sourced')) partsMap[vid] = 'Parts pending approval'
    else if (vParts.includes('ready_to_order')) partsMap[vid] = 'Parts need to be ordered'
    else if (vParts.includes('ordered')) partsMap[vid] = 'Parts ordered'
  }

  const active = stages.filter(s => s.status === 'in_progress' && !s.awaitingParts && anyRunning(readTimers(s)))
  // Completed/skipped stages are excluded from `paused` even if an orphaned
  // `awaitingParts` flag is lingering on the row — a completed job is not
  // pending, paused, or waiting on anything.
  const paused = stages.filter(s =>
    (s.status === 'in_progress' && !anyRunning(readTimers(s)) && !s.awaitingParts) ||
    (s.status === 'blocked' && !s.awaitingParts) ||
    (s.awaitingParts && s.status !== 'pending' && s.status !== 'done' && s.status !== 'skipped')
  )
  const queued = stages.filter(s => s.status === 'pending')
  const completedToday = stages.filter(s => s.status === 'done' && s.completedAt && s.completedAt >= todayStart)

  const format = (s: typeof stages[0]) => {
    const timers = readTimers(s)
    // Only real mechanics appear in the per-user split. Legacy time banked under
    // the synthetic UNASSIGNED bucket (a car worked before it had an assignee)
    // stays in the car's aggregate total below, but isn't shown as a nameless row.
    const perUser = Object.entries(timers)
      .filter(([uid]) => uid !== UNASSIGNED)
      .map(([uid, t]) => ({
        userId: uid,
        name: nameOf(uid) || 'Unknown',
        elapsedSeconds: entryElapsed(t, nowMs, withinHours),
        running: !!t.timerStartedAt,
        timerStartedAt: t.timerStartedAt ?? null,
        done: !!t.done,
        autoPaused: !!t.autoPaused,
        pauseReason: t.pauseReason ?? null,
        pauseDetail: t.pauseDetail ?? null,
        pausedAt: t.pausedAt ?? null,
      }))
    // The current viewer's own timer entry (drives their Start/Stop button).
    const mine = perUser.find(p => p.userId === user.id) || null
    return {
      id: s.id,
      vehicle: s.vehicle,
      scopeName: s.scopeName,
      assignee: s.assignee,
      assignees: assigneesOnCar(s, nameOf),
      status: s.status,
      estimatedHours: s.estimatedHours,
      checklist: s.checklist,
      priority: s.priority,
      elapsedSeconds: totalElapsed(timers, nowMs, withinHours),
      timers: perUser,
      myElapsedSeconds: mine?.elapsedSeconds ?? 0,
      myTimerRunning: mine?.running ?? false,
      timerRunning: anyRunning(timers),
      autoPaused: s.autoPaused,
      pauseReason: s.pauseReason,
      pauseDetail: s.pauseDetail,
      pausedAt: s.pausedAt?.toISOString() || null,
      awaitingParts: s.awaitingParts,
      awaitingPartsName: s.awaitingPartsName,
      awaitingPartsDate: s.awaitingPartsDate?.toISOString() || null,
      awaitingPartsTracking: s.awaitingPartsTracking,
      completedAt: s.completedAt?.toISOString() || null,
      startedAt: s.startedAt?.toISOString() || null,
      partsLabel: partsMap[s.vehicleId] || null,
    }
  }

  // Weekly stats
  const weekStart = new Date(now)
  const dayOfWeek = weekStart.getDay()
  const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  weekStart.setDate(weekStart.getDate() - diff)
  weekStart.setHours(0, 0, 0, 0)

  const weekStages = await prisma.vehicleStage.findMany({
    where: {
      stage: 'mechanic',
      OR: [
        { status: { notIn: ['done', 'skipped'] } },
        { completedAt: { gte: weekStart } },
      ],
    },
    select: {
      estimatedHours: true, status: true,
      timers: true, assigneeId: true, activeSeconds: true, timerStartedAt: true,
      autoPaused: true, pauseReason: true, pauseDetail: true, pausedAt: true,
    },
  })

  const weeklyEstimatedHours = weekStages.reduce((sum, s) => sum + (s.estimatedHours || 2), 0)
  const weeklyWorkedSeconds = weekStages.reduce((sum, s) => sum + totalElapsed(readTimers(s), nowMs, withinHours), 0)

  const etDayOfWeek = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(now)
  const dayIndex = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(etDayOfWeek)
  let remainingHoursThisWeek = 0
  if (dayIndex >= 0 && dayIndex <= 4) {
    const hoursLeftToday = h < WORK_START ? HOURS_PER_DAY : h >= WORK_END ? 0 : WORK_END - h
    const fullDaysLeft = 4 - dayIndex
    remainingHoursThisWeek = hoursLeftToday + (fullDaysLeft * HOURS_PER_DAY)
  }

  const hoursLeftToday = dayIndex >= 0 && dayIndex <= 4
    ? (h < WORK_START ? HOURS_PER_DAY : h >= WORK_END ? 0 : WORK_END - h)
    : 0

  // Split active/paused into "worked today" vs "back in queue" vs "awaiting parts"
  // Vehicles paused on a prior day flow back into the queue (sorted by priority alongside pending)
  const workedToday: typeof stages = []
  const backToQueue: typeof stages = []
  const awaitingPartsAll: typeof stages = []

  for (const s of [...active, ...paused]) {
    const touchedToday = anyRunning(readTimers(s)) || (s.pausedAt && s.pausedAt >= todayStart)
    if (s.awaitingParts) {
      if (touchedToday) workedToday.push(s)
      else backToQueue.push(s) // surface awaiting-parts vehicles in the queue too (parity with pending+awaiting-parts)
      awaitingPartsAll.push(s)
    } else if (touchedToday) {
      workedToday.push(s)
    } else {
      backToQueue.push(s)
    }
  }

  // Merge paused-from-prior-days into the queue, sorted by priority
  const queuedWithReturned = [...queued, ...backToQueue].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority
    return a.createdAt.getTime() - b.createdAt.getTime()
  })

  // Add pending+awaiting-parts to the awaiting parts list (in_progress+awaiting-parts already added above)
  for (const s of queued) {
    if (s.awaitingParts) awaitingPartsAll.push(s)
  }

  const workedTodayHours = workedToday.reduce((sum, s) => {
    const est = s.estimatedHours || 2
    const elapsed = totalElapsed(readTimers(s), nowMs, withinHours) / 3600
    return sum + Math.max(0, est - elapsed)
  }, 0)

  // Up Next = queued vehicles that fit into remaining hours today
  const todayJobs: typeof stages = []
  const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
  const remainingDays: { day: string; jobs: ReturnType<typeof format>[] }[] = []

  let todayBudget = Math.max(0, hoursLeftToday - workedTodayHours)
  const fullDaysLeft = dayIndex >= 0 && dayIndex <= 4 ? 4 - dayIndex : 0

  const dayBuckets: { day: string; budget: number; jobs: typeof stages }[] = []
  for (let d = 1; d <= fullDaysLeft; d++) {
    dayBuckets.push({ day: DAY_NAMES[dayIndex + d], budget: HOURS_PER_DAY, jobs: [] })
  }

  let currentBucketIdx = 0

  for (const s of queuedWithReturned) {
    if (s.awaitingParts) continue // skip awaiting parts for scheduling
    const est = s.estimatedHours || 2
    if (todayBudget >= est) {
      todayJobs.push(s)
      todayBudget -= est
    } else if (todayBudget > 0) {
      todayJobs.push(s)
      todayBudget = 0
    } else {
      while (currentBucketIdx < dayBuckets.length) {
        const bucket = dayBuckets[currentBucketIdx]
        if (bucket.budget >= est) {
          bucket.jobs.push(s)
          bucket.budget -= est
          break
        } else if (bucket.budget > 0 && bucket.budget >= est * 0.5) {
          bucket.jobs.push(s)
          bucket.budget = 0
          break
        } else if (bucket.budget <= 0 || bucket.budget < est * 0.5) {
          currentBucketIdx++
          continue
        }
      }
    }
  }

  for (const bucket of dayBuckets) {
    if (bucket.jobs.length > 0) {
      remainingDays.push({ day: bucket.day, jobs: bucket.jobs.map(format) })
    }
  }

  // Per-mechanic worked-hours summary (today + this week) from the time LOG —
  // accurate per day even when a car spans multiple days. Banked sessions come
  // from the log; the currently-running session is added live on top.
  const todayET = etDate(now)
  // Monday of the current week in ET. Derived from the ET weekday (dayIndex,
  // Mon=0) and today's ET date so the boundary can't slip a day on a UTC server
  // the way `etDate(weekStart)` (a server-local midnight) could.
  const weekStartET = (() => {
    const d = new Date(todayET + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() - (dayIndex >= 0 ? dayIndex : 0))
    return d.toISOString().slice(0, 10)
  })()
  const weekLogs = await prisma.mechanicTimeLog.findMany({
    where: { workDate: { gte: weekStartET } },
    select: { userId: true, seconds: true, workDate: true },
  })
  const perMechanic = mechUsers.map(m => {
    let todaySec = 0
    let weekSec = 0
    for (const l of weekLogs) {
      if (l.userId !== m.id) continue
      weekSec += l.seconds
      if (l.workDate === todayET) todaySec += l.seconds
    }
    // Add the in-progress session (not yet logged) so live numbers keep moving.
    if (withinHours) {
      for (const s of stages) {
        const t = readTimers(s)[m.id]
        if (t?.timerStartedAt) {
          const running = Math.max(0, Math.floor((nowMs - new Date(t.timerStartedAt).getTime()) / 1000))
          todaySec += running
          weekSec += running
        }
      }
    }
    return {
      id: m.id,
      name: m.name,
      workedTodayHours: Math.round(todaySec / 360) / 10,
      workedWeekHours: Math.round(weekSec / 360) / 10,
    }
  })

  return NextResponse.json({
    active: active.map(format),
    paused: paused.map(format),
    queued: queuedWithReturned.map(format),
    completedToday: completedToday.map(format),
    // Cars completed in the mechanic stage since Monday (formatted w/ assignees so
    // the lane filter applies) — powers the "Completed This Week" KPI.
    completedThisWeek: stages.filter(s => s.status === 'done' && s.completedAt && s.completedAt >= weekStart).map(format),
    workedToday: workedToday.map(format),
    pausedNotToday: [],
    awaitingParts: awaitingPartsAll.map(format),
    today: todayJobs.map(format),
    remainingDays,
    weeklyEstimatedHours,
    weeklyWorkedHours: Math.round(weeklyWorkedSeconds / 360) / 10,
    remainingHoursThisWeek: Math.round(remainingHoursThisWeek * 10) / 10,
    hoursLeftToday: Math.round(hoursLeftToday * 10) / 10,
    workHours: { start: WORK_START, end: WORK_END },
    currentHour: h,
    isWorkHours: withinHours,
    mechanics: perMechanic,
    currentUserId: user.id,
    currentUserRole: user.role,
  })
}

// Actions: start, pause, resume, complete — each operates on the ACTING
// mechanic's own timer entry (keyed by the logged-in user id).
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { action, stageId, pauseReason, pauseDetail, partName, expectedDate, trackingNumber } = await req.json()

  const stage = await prisma.vehicleStage.findUnique({ where: { id: stageId } })
  if (!stage || stage.stage !== 'mechanic') {
    return NextResponse.json({ error: 'Stage not found' }, { status: 404 })
  }

  const now = new Date()
  const nowMs = now.getTime()
  const h = etHour(now)
  const withinHours = h >= WORK_START && h < WORK_END

  // The acting user's timer key. Fall back to the car's assignee bucket only when
  // the actor has no identity (shouldn't happen — session is required above).
  const uid = user.id
  const timers = readTimers(stage)
  const cur: TimerEntry = timers[uid] || { activeSeconds: 0, timerStartedAt: null }

  const persist = (extra: Prisma.VehicleStageUpdateInput = {}) =>
    prisma.vehicleStage.update({
      where: { id: stageId },
      data: { timers: timers as Prisma.InputJsonValue, ...extra },
    })

  switch (action) {
    case 'start': {
      if (!withinHours) {
        return NextResponse.json({ error: 'Outside working hours (5 AM - 10 PM)' }, { status: 400 })
      }
      timers[uid] = { ...cur, timerStartedAt: now.toISOString(), autoPaused: false, pauseReason: null, pauseDetail: null, pausedAt: null, done: false }
      await persist({ status: 'in_progress' })
      break
    }

    case 'pause': {
      let add = 0
      if (cur.timerStartedAt) add = Math.floor((nowMs - new Date(cur.timerStartedAt).getTime()) / 1000)
      const paused: TimerEntry = {
        ...cur,
        activeSeconds: (cur.activeSeconds || 0) + Math.max(0, add),
        timerStartedAt: null,
        autoPaused: false,
        pausedAt: now.toISOString(),
      }
      const extra: Prisma.VehicleStageUpdateInput = {}
      if (pauseReason === 'waiting_on_parts') {
        // Waiting-on-parts is a car-level state (parts block everyone), kept on the stage.
        extra.awaitingParts = true
        extra.awaitingPartsName = partName || null
        extra.awaitingPartsDate = expectedDate ? new Date(expectedDate) : null
        extra.awaitingPartsTracking = trackingNumber || null
        extra.awaitingPartsSince = now
        paused.pauseReason = 'Waiting on Parts'
        paused.pauseDetail = partName || null
      } else {
        paused.pauseReason = pauseReason === 'other' ? 'Other' : pauseReason === 'lunch' ? 'Lunch' : (pauseReason || 'Paused')
        paused.pauseDetail = pauseDetail || null
      }
      timers[uid] = paused
      await persist(extra)
      await logSession(stageId, stage.vehicleId, uid, cur.timerStartedAt, now, Math.max(0, add))
      break
    }

    case 'resume': {
      if (!withinHours) {
        return NextResponse.json({ error: 'Outside working hours (5 AM - 10 PM)' }, { status: 400 })
      }
      timers[uid] = { ...cur, timerStartedAt: now.toISOString(), autoPaused: false, pauseReason: null, pauseDetail: null, pausedAt: null, done: false }
      await persist({
        status: 'in_progress',
        awaitingParts: false,
        awaitingPartsName: null,
        awaitingPartsDate: null,
        awaitingPartsTracking: null,
        awaitingPartsSince: null,
      })
      break
    }

    case 'complete': {
      // Who's on this car? default owner + anyone a task was handed to. If two
      // or more, it's a shared car and completion is PER MECHANIC.
      const checklist = Array.isArray(stage.checklist) ? (stage.checklist as ChecklistItem[]) : []
      const assigneeIds = new Set<string>()
      if (stage.assigneeId) assigneeIds.add(stage.assigneeId)
      for (const it of checklist) if (it && typeof it.assigneeId === 'string' && it.assigneeId) assigneeIds.add(it.assigneeId)
      const shared = assigneeIds.size > 1
      // The car is finished when every non-declined task is checked off.
      const allTasksDone = checklist.filter(it => it?.approved !== 'declined').length > 0
        && checklist.filter(it => it?.approved !== 'declined').every(it => !!it?.done)

      // Bank + stop the acting mechanic's timer and mark their part done.
      const actorStarted = cur.timerStartedAt
      let add = 0
      if (cur.timerStartedAt) add = Math.floor((nowMs - new Date(cur.timerStartedAt).getTime()) / 1000)
      timers[uid] = { ...cur, activeSeconds: (cur.activeSeconds || 0) + Math.max(0, add), timerStartedAt: null, autoPaused: false, pauseReason: null, pauseDetail: null, pausedAt: null, done: true }

      // Owner of a task: explicit assignee → them; mechanic-added-unassigned → nobody; else the car owner.
      const ownerOf = (it: ChecklistItem): string | null => {
        if (typeof it?.assigneeId === 'string' && it.assigneeId) return it.assigneeId
        if (it?.addedByMechanic) return null
        return stage.assigneeId
      }

      // On a SHARED car that isn't fully done yet, this only finishes the acting
      // mechanic's part — the car stays open and co-workers' clocks keep running.
      if (shared && !allTasksDone) {
        // Check off the tasks THIS mechanic owns so the checkboxes match "your part done".
        const partialChecklist = checklist.map(it =>
          it?.approved !== 'declined' && ownerOf(it) === uid ? { ...it, done: true } : it,
        )
        await persist({ checklist: partialChecklist as unknown as Prisma.InputJsonValue })
        await logSession(stageId, stage.vehicleId, uid, actorStarted, now, Math.max(0, add))
        await prisma.activityLog.create({
          data: {
            entityType: 'vehicle',
            entityId: stage.vehicleId,
            action: 'stage_scope_completed',
            actorId: user.id,
            details: { stage: stage.stage, scopeName: stage.scopeName, via: 'mechanic_board_complete', partialBy: uid },
          },
        }).catch(() => {})
        break
      }

      // Final completion — bank any other still-running timers too, then finish the car.
      // Collect every banked session (actor + co-workers) to write to the time log.
      const sessions: { userId: string; started: string | null; secs: number }[] = []
      if (add > 0) sessions.push({ userId: uid, started: actorStarted, secs: add })
      for (const [k, t] of Object.entries(timers)) {
        if (k !== uid && t.timerStartedAt) {
          const banked = Math.floor((nowMs - new Date(t.timerStartedAt).getTime()) / 1000)
          sessions.push({ userId: k, started: t.timerStartedAt, secs: Math.max(0, banked) })
          timers[k] = { ...t, activeSeconds: (t.activeSeconds || 0) + Math.max(0, banked), timerStartedAt: null, autoPaused: false }
        }
        timers[k] = { ...timers[k], done: true }
      }
      for (const sess of sessions) await logSession(stageId, stage.vehicleId, sess.userId, sess.started, now, sess.secs)
      // Whole car is finishing → mark every non-declined task done so the checklist
      // reflects completion instead of showing stale unchecked boxes.
      const finalChecklist = checklist.map(it =>
        it?.approved !== 'declined' ? { ...it, done: true } : it,
      )
      await persist({
        checklist: finalChecklist as unknown as Prisma.InputJsonValue,
        status: 'done',
        completedAt: now,
        awaitingParts: false,
        awaitingPartsName: null,
        awaitingPartsDate: null,
        awaitingPartsTracking: null,
        awaitingPartsSince: null,
      })

      // Legacy separate-stage guard (kept harmless): if some other mechanic STAGE
      // on this vehicle is still open, don't advance the vehicle yet.
      const openSiblings = await prisma.vehicleStage.count({
        where: {
          vehicleId: stage.vehicleId,
          stage: 'mechanic',
          id: { not: stageId },
          status: { notIn: ['done', 'skipped'] },
        },
      })

      await prisma.activityLog.create({
        data: {
          entityType: 'vehicle',
          entityId: stage.vehicleId,
          action: openSiblings > 0 ? 'stage_scope_completed' : 'stage_completed',
          actorId: user.id,
          details: { stage: stage.stage, scopeName: stage.scopeName, via: 'mechanic_board_complete', openSiblings },
        },
      }).catch(() => {})

      if (openSiblings > 0) break

      // Car fully done — park in awaiting_routing for admin review (never auto-advance).
      await prisma.vehicle.update({
        where: { id: stage.vehicleId },
        data: { status: 'awaiting_routing', currentAssigneeId: null },
      })
      const vehicleForNotify = await prisma.vehicle.findUnique({
        where: { id: stage.vehicleId },
        select: { stockNumber: true, year: true, make: true, model: true },
      })
      if (vehicleForNotify) {
        const { notifyStageReadyForRouting } = await import('@/lib/stage-notifications')
        notifyStageReadyForRouting({
          stageId,
          vehicleId: stage.vehicleId,
          vehicleStockNumber: vehicleForNotify.stockNumber,
          vehicleDesc: `${vehicleForNotify.year ?? ''} ${vehicleForNotify.make} ${vehicleForNotify.model}`.trim(),
          triggeredByUserId: user.id,
        })
      }
      break
    }

    case 'toggle_task': {
      return NextResponse.json({ error: 'Use PATCH /api/stages/[id] for checklist updates' }, { status: 400 })
    }

    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
