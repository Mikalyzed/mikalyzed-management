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

  // Ensure cursor is within a valid work window
  function normalizeCursor() {
    // If at or past end of work day, move to next day 9 AM
    if (etHour(cursor) >= WORK_END) {
      cursor.setDate(cursor.getDate() + 1)
      setEtHour(cursor, WORK_START)
    }
    // If before work hours, jump to 9 AM
    if (etHour(cursor) < WORK_START) {
      setEtHour(cursor, WORK_START)
    }
    // Skip weekends
    while (etDay(cursor) === 0 || etDay(cursor) === 6) {
      cursor.setDate(cursor.getDate() + 1)
      setEtHour(cursor, WORK_START)
    }
  }

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
      // Pending/blocked: normalize cursor to next work window first
      normalizeCursor()
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
      // Split into day segments for display
      segments: splitIntoDays(startTime, endTime),
      priority: stage.priority,
    }
  })

  // Flatten: each segment becomes its own entry so the frontend groups by day correctly
  const flattened = schedule.flatMap(block => {
    if (!block.segments || block.segments.length <= 1) return [block]
    return block.segments.map((seg: { start: string; end: string; hours: number }, i: number) => ({
      ...block,
      startTime: seg.start,
      endTime: seg.end,
      segmentHours: seg.hours,
      isContination: i > 0,
      segmentIndex: i,
      totalSegments: block.segments.length,
    }))
  })

  return NextResponse.json({ schedule: flattened, workHours: { start: WORK_START, end: WORK_END } })
}

// Split a time range into per-day work segments
function splitIntoDays(start: Date, end: Date): { start: string; end: string; hours: number }[] {
  const segments: { start: string; end: string; hours: number }[] = []
  let cursor = new Date(start)

  while (cursor < end) {
    // Find end of work day for current cursor
    const dayEnd = new Date(cursor)
    setEtHour(dayEnd, WORK_END)

    const segEnd = dayEnd < end ? dayEnd : end
    const hours = (segEnd.getTime() - cursor.getTime()) / 3600000

    if (hours > 0) {
      segments.push({ start: cursor.toISOString(), end: segEnd.toISOString(), hours: Math.round(hours * 10) / 10 })
    }

    // Move to next work day
    cursor = new Date(dayEnd)
    cursor.setDate(cursor.getDate() + 1)
    setEtHour(cursor, WORK_START)
    // Skip weekends
    while (etDay(cursor) === 0 || etDay(cursor) === 6) {
      cursor.setDate(cursor.getDate() + 1)
      setEtHour(cursor, WORK_START)
    }
  }

  return segments
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
