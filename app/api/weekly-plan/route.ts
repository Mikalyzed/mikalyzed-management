import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

const WORK_START = 9
const WORK_END = 19
const HOURS_PER_DAY = WORK_END - WORK_START
const TZ = 'America/New_York'

function etHour(d: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(d)
  const h = parseInt(parts.find(p => p.type === 'hour')!.value)
  const m = parseInt(parts.find(p => p.type === 'minute')!.value)
  return h + m / 60
}

function getElapsed(stage: { activeSeconds: number; timerStartedAt: Date | null }): number {
  let elapsed = stage.activeSeconds
  if (stage.timerStartedAt) {
    const now = new Date()
    const h = etHour(now)
    if (h >= WORK_START && h < WORK_END) {
      elapsed += Math.floor((now.getTime() - stage.timerStartedAt.getTime()) / 1000)
    }
  }
  return elapsed
}

function getWeekStart(now: Date): Date {
  const weekStart = new Date(now)
  const dayOfWeek = weekStart.getDay()
  const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  weekStart.setDate(weekStart.getDate() - diff)
  weekStart.setHours(0, 0, 0, 0)
  return weekStart
}

type SnapshotEntry = {
  vehicleStageId: string
  vehicleId: string
  stockNumber: string
  year: number | null
  make: string
  model: string
  color: string | null
  day: string
  estimatedHours: number
  assigneeName: string | null
}

// Shared: generate the weekly plan snapshot
async function generateSnapshot(now: Date, weekStart: Date): Promise<boolean> {
  const stages = await prisma.vehicleStage.findMany({
    where: { stage: 'mechanic', status: { not: 'done' } },
    include: {
      vehicle: { select: { id: true, stockNumber: true, year: true, make: true, model: true, color: true } },
      assignee: { select: { id: true, name: true } },
    },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  })

  if (stages.length === 0) return false

  const h = etHour(now)
  const etDayOfWeek = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(now)
  const dayIndex = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(etDayOfWeek)
  const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

  const active = stages.filter(s => s.status === 'in_progress' && !s.awaitingParts && s.timerStartedAt)
  const pausedWorking = stages.filter(s =>
    (s.status === 'in_progress' && !s.timerStartedAt && !s.awaitingParts) ||
    (s.status === 'blocked' && !s.awaitingParts)
  )
  const awaitingParts = stages.filter(s => s.awaitingParts)
  const queued = stages.filter(s => s.status === 'pending')

  const hoursLeftToday = dayIndex >= 0 && dayIndex <= 4
    ? (h < WORK_START ? HOURS_PER_DAY : h >= WORK_END ? 0 : WORK_END - h)
    : 0

  const activeHoursRemaining = [...active, ...pausedWorking].reduce((sum, s) => {
    const est = s.estimatedHours || 2
    const elapsed = getElapsed(s) / 3600
    return sum + Math.max(0, est - elapsed)
  }, 0)

  const entries: SnapshotEntry[] = []
  const todayName = DAY_NAMES[dayIndex] || 'Monday'

  const makeEntry = (s: typeof stages[0], day: string): SnapshotEntry => ({
    vehicleStageId: s.id,
    vehicleId: s.vehicle.id,
    stockNumber: s.vehicle.stockNumber,
    year: s.vehicle.year,
    make: s.vehicle.make,
    model: s.vehicle.model,
    color: s.vehicle.color,
    day,
    estimatedHours: s.estimatedHours || 2,
    assigneeName: s.assignee?.name || null,
  })

  for (const s of [...active, ...pausedWorking]) entries.push(makeEntry(s, todayName))
  for (const s of awaitingParts) entries.push(makeEntry(s, 'Awaiting Parts'))

  let todayBudget = Math.max(0, hoursLeftToday - activeHoursRemaining)
  const fullDaysLeft = dayIndex >= 0 && dayIndex <= 4 ? 4 - dayIndex : 0

  const dayBuckets: { day: string; budget: number }[] = []
  for (let d = 1; d <= fullDaysLeft; d++) {
    dayBuckets.push({ day: DAY_NAMES[dayIndex + d], budget: HOURS_PER_DAY })
  }

  let currentBucketIdx = 0

  for (const s of queued) {
    const est = s.estimatedHours || 2

    if (todayBudget >= est) {
      entries.push(makeEntry(s, todayName))
      todayBudget -= est
    } else if (todayBudget > 0) {
      entries.push(makeEntry(s, todayName))
      todayBudget = 0
    } else {
      let placed = false
      while (currentBucketIdx < dayBuckets.length) {
        const bucket = dayBuckets[currentBucketIdx]
        if (bucket.budget >= est) {
          entries.push(makeEntry(s, bucket.day))
          bucket.budget -= est
          placed = true
          break
        } else if (bucket.budget > 0 && bucket.budget >= est * 0.5) {
          entries.push(makeEntry(s, bucket.day))
          bucket.budget = 0
          placed = true
          break
        } else {
          currentBucketIdx++
        }
      }
      if (!placed) entries.push(makeEntry(s, 'Overflow'))
    }
  }

  await prisma.weeklyPlanSnapshot.create({
    data: {
      weekStart,
      entries: JSON.parse(JSON.stringify(entries)),
    },
  })

  return true
}

// Shared: build the response from a snapshot
async function buildResponse(snapshot: { createdAt: Date; entries: unknown }, weekStart: Date) {
  const entries = snapshot.entries as SnapshotEntry[]

  const stageIds = entries.map(e => e.vehicleStageId)
  const liveStages = await prisma.vehicleStage.findMany({
    where: { id: { in: stageIds } },
    include: { assignee: { select: { id: true, name: true } } },
  })

  const liveMap = new Map(liveStages.map(s => [s.id, s]))

  const enriched = entries.map(entry => {
    const live = liveMap.get(entry.vehicleStageId)
    if (!live) {
      return {
        ...entry,
        liveStatus: 'unknown',
        elapsedSeconds: 0,
        timerRunning: false,
        completedAt: null,
        awaitingParts: false,
        awaitingPartsName: null,
        checklist: [],
      }
    }
    return {
      ...entry,
      liveStatus: live.status,
      elapsedSeconds: getElapsed(live),
      timerRunning: !!live.timerStartedAt,
      completedAt: live.completedAt?.toISOString() || null,
      awaitingParts: live.awaitingParts,
      awaitingPartsName: live.awaitingPartsName,
      autoPaused: live.autoPaused,
      pauseReason: live.pauseReason,
      checklist: (live.checklist as { item: string; done: boolean; note: string }[]) || [],
    }
  })

  return NextResponse.json({
    exists: true,
    weekStart: weekStart.toISOString(),
    createdAt: snapshot.createdAt.toISOString(),
    entries: enriched,
  })
}

// GET: Fetch the weekly plan (auto-generates if none exists)
export async function GET() {
  const user = await getSessionUser()
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const now = new Date()
  const weekStart = getWeekStart(now)

  let snapshot = await prisma.weeklyPlanSnapshot.findUnique({
    where: { weekStart },
  })

  // Auto-generate if no plan exists for this week
  if (!snapshot) {
    const generated = await generateSnapshot(now, weekStart)
    if (!generated) {
      return NextResponse.json({ exists: false, entries: [], weekStart: weekStart.toISOString() })
    }
    snapshot = await prisma.weeklyPlanSnapshot.findUnique({ where: { weekStart } })
    if (!snapshot) {
      return NextResponse.json({ exists: false, entries: [], weekStart: weekStart.toISOString() })
    }
  }

  return buildResponse(snapshot, weekStart)
}

// POST: Manually generate (only if none exists)
export async function POST() {
  const user = await getSessionUser()
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const now = new Date()
  const weekStart = getWeekStart(now)

  const existing = await prisma.weeklyPlanSnapshot.findUnique({ where: { weekStart } })
  if (existing) {
    return NextResponse.json({ error: 'Plan already exists for this week. Delete it first to regenerate.' }, { status: 409 })
  }

  const generated = await generateSnapshot(now, weekStart)
  if (!generated) {
    return NextResponse.json({ error: 'No mechanic jobs to plan' }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}

// DELETE: Remove snapshot for current week (to regenerate)
export async function DELETE() {
  const user = await getSessionUser()
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const now = new Date()
  const weekStart = getWeekStart(now)

  await prisma.weeklyPlanSnapshot.deleteMany({ where: { weekStart } })

  return NextResponse.json({ success: true })
}
