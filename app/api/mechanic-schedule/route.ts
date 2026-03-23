import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

const WORK_START = 9 // 9 AM ET
const WORK_END = 19   // 7 PM ET
const HOURS_PER_DAY = WORK_END - WORK_START // 10 hours
const TZ = 'America/New_York'

// Get hour (with fractional minutes) in ET
function etHour(d: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(d)
  const h = parseInt(parts.find(p => p.type === 'hour')!.value)
  const m = parseInt(parts.find(p => p.type === 'minute')!.value)
  return h + m / 60
}

// Get day-of-week in ET (0=Sun)
function etDay(d: Date): number {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(d)
  return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(wd)
}

// Set time to a specific ET hour (approximate — set UTC to ET equivalent)
function setEtHour(d: Date, hour: number, min = 0): void {
  // Get current ET offset by comparing
  const utcStr = d.toLocaleString('en-US', { timeZone: 'UTC' })
  const etStr = d.toLocaleString('en-US', { timeZone: TZ })
  const diffMs = new Date(utcStr).getTime() - new Date(etStr).getTime()
  const offsetHours = diffMs / 3600000 // positive means ET is behind UTC
  d.setUTCHours(hour + offsetHours, min, 0, 0)
}

export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get all mechanic stages that aren't done, ordered by priority then creation
  const stages = await prisma.vehicleStage.findMany({
    where: {
      stage: 'mechanic',
      status: { not: 'done' },
    },
    include: {
      vehicle: { select: { id: true, stockNumber: true, year: true, make: true, model: true, color: true } },
      assignee: { select: { id: true, name: true } },
    },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  })

  // Build schedule blocks by stacking jobs sequentially
  // Start from now (if within work hours) or next work window
  const now = new Date()
  let cursor = new Date(now)

  const nowEtH = etHour(cursor)
  if (nowEtH < WORK_START) {
    setEtHour(cursor, WORK_START)
  } else if (nowEtH >= WORK_END) {
    cursor.setDate(cursor.getDate() + 1)
    setEtHour(cursor, WORK_START)
  }
  // Skip weekends
  while (etDay(cursor) === 0 || etDay(cursor) === 6) {
    cursor.setDate(cursor.getDate() + 1)
    setEtHour(cursor, WORK_START)
  }

  // Sort: in_progress first, then blocked, then pending (by priority)
  stages.sort((a, b) => {
    const order: Record<string, number> = { in_progress: 0, blocked: 1, pending: 2 }
    const diff = (order[a.status] ?? 2) - (order[b.status] ?? 2)
    if (diff !== 0) return diff
    return a.priority - b.priority
  })

  const schedule = stages.map(stage => {
    const hours = stage.estimatedHours || 2 // default 2 hours if not set
    let startTime: Date
    let endTime: Date

    if (stage.status === 'in_progress' && stage.startedAt) {
      // In-progress: use actual start time, calculate estimated end
      startTime = new Date(stage.startedAt)
      endTime = addWorkHours(startTime, hours)
      // Move cursor past this job so pending jobs stack after it
      if (endTime > cursor) cursor = new Date(endTime)
    } else {
      // Pending/blocked: stack after cursor
      startTime = new Date(cursor)
      endTime = addWorkHours(cursor, hours)
      cursor = new Date(endTime)
    }

    return {
      id: stage.id,
      vehicle: stage.vehicle,
      assignee: stage.assignee,
      status: stage.status,
      estimatedHours: stage.estimatedHours,
      checklist: stage.checklist,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      priority: stage.priority,
    }
  })

  return NextResponse.json({ schedule, workHours: { start: WORK_START, end: WORK_END } })
}

// Add work hours to a date, respecting 9-7 ET work window and skipping weekends
function addWorkHours(from: Date, hours: number): Date {
  const result = new Date(from)
  let remaining = hours

  while (remaining > 0) {
    // Skip weekends
    while (etDay(result) === 0 || etDay(result) === 6) {
      result.setDate(result.getDate() + 1)
      setEtHour(result, WORK_START)
    }

    const currentH = etHour(result)

    // If before work hours, jump to start
    if (currentH < WORK_START) {
      setEtHour(result, WORK_START)
    }

    const hNow = etHour(result)
    const hoursLeftToday = WORK_END - hNow
    if (hoursLeftToday <= 0) {
      result.setDate(result.getDate() + 1)
      setEtHour(result, WORK_START)
      continue
    }

    if (remaining <= hoursLeftToday) {
      // Add remaining hours in milliseconds
      result.setTime(result.getTime() + remaining * 3600000)
      remaining = 0
    } else {
      remaining -= hoursLeftToday
      result.setDate(result.getDate() + 1)
      setEtHour(result, WORK_START)
    }
  }

  return result
}
