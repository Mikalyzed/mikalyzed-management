import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

const WORK_START = 9 // 9 AM
const WORK_END = 19   // 7 PM
const HOURS_PER_DAY = WORK_END - WORK_START // 10 hours

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
  // Start from today at 9 AM or now (whichever is later during work hours)
  const now = new Date()
  let cursor = new Date(now)

  // If before work hours today, start at 9 AM
  if (cursor.getHours() < WORK_START) {
    cursor.setHours(WORK_START, 0, 0, 0)
  }
  // If after work hours, start next day 9 AM
  if (cursor.getHours() >= WORK_END) {
    cursor.setDate(cursor.getDate() + 1)
    cursor.setHours(WORK_START, 0, 0, 0)
  }
  // Skip weekends
  while (cursor.getDay() === 0 || cursor.getDay() === 6) {
    cursor.setDate(cursor.getDate() + 1)
    cursor.setHours(WORK_START, 0, 0, 0)
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

    if (stage.status === 'in_progress') {
      // In progress — started at startedAt, estimate end
      startTime = new Date(stage.startedAt)
      endTime = addWorkHours(startTime, hours)
    } else if (stage.status === 'blocked') {
      // Blocked — show at its started position but flagged
      startTime = new Date(stage.blockedAt || stage.startedAt)
      endTime = addWorkHours(startTime, hours)
    } else {
      // Pending — stack after cursor
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

// Add work hours to a date, respecting 9-7 work window and skipping weekends
function addWorkHours(from: Date, hours: number): Date {
  const result = new Date(from)
  let remaining = hours

  while (remaining > 0) {
    // Skip weekends
    while (result.getDay() === 0 || result.getDay() === 6) {
      result.setDate(result.getDate() + 1)
      result.setHours(WORK_START, 0, 0, 0)
    }

    // If before work hours, jump to start
    if (result.getHours() < WORK_START) {
      result.setHours(WORK_START, 0, 0, 0)
    }

    const hoursLeftToday = WORK_END - result.getHours() - result.getMinutes() / 60
    if (remaining <= hoursLeftToday) {
      result.setMinutes(result.getMinutes() + remaining * 60)
      remaining = 0
    } else {
      remaining -= hoursLeftToday
      result.setDate(result.getDate() + 1)
      result.setHours(WORK_START, 0, 0, 0)
    }
  }

  return result
}
