import { NextRequest, NextResponse } from 'next/server'
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
    // Cap at work hours
    const h = etHour(now)
    if (h >= WORK_START && h < WORK_END) {
      elapsed += Math.floor((now.getTime() - stage.timerStartedAt.getTime()) / 1000)
    }
  }
  return elapsed
}

export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const stages = await prisma.vehicleStage.findMany({
    where: { stage: 'mechanic' },
    include: {
      vehicle: { select: { id: true, stockNumber: true, year: true, make: true, model: true, color: true } },
      assignee: { select: { id: true, name: true } },
    },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  })

  const now = new Date()
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)

  // Auto-pause any active jobs outside working hours
  const h = etHour(now)
  if (h < WORK_START || h >= WORK_END) {
    for (const s of stages) {
      if (s.timerStartedAt && s.status === 'in_progress') {
        const elapsed = Math.floor((now.getTime() - s.timerStartedAt.getTime()) / 1000)
        await prisma.vehicleStage.update({
          where: { id: s.id },
          data: {
            activeSeconds: s.activeSeconds + Math.max(0, elapsed),
            timerStartedAt: null,
            autoPaused: true,
            status: 'in_progress',
          },
        })
        s.activeSeconds += Math.max(0, elapsed)
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

  const active = stages.filter(s => s.status === 'in_progress' && !s.awaitingParts && s.timerStartedAt)
  const paused = stages.filter(s =>
    (s.status === 'in_progress' && !s.timerStartedAt && !s.awaitingParts) ||
    (s.status === 'blocked' && !s.awaitingParts) ||
    s.awaitingParts
  )
  const queued = stages.filter(s => s.status === 'pending')
  const completedToday = stages.filter(s => s.status === 'done' && s.completedAt && s.completedAt >= todayStart)

  const format = (s: typeof stages[0]) => ({
    id: s.id,
    vehicle: s.vehicle,
    assignee: s.assignee,
    status: s.status,
    estimatedHours: s.estimatedHours,
    checklist: s.checklist,
    priority: s.priority,
    elapsedSeconds: getElapsed(s),
    timerRunning: !!s.timerStartedAt,
    timerStartedAt: s.timerStartedAt?.toISOString() || null,
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
  })

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
    select: { estimatedHours: true, activeSeconds: true, timerStartedAt: true, status: true },
  })

  const weeklyEstimatedHours = weekStages.reduce((sum, s) => sum + (s.estimatedHours || 2), 0)
  const weeklyWorkedSeconds = weekStages.reduce((sum, s) => {
    let sec = s.activeSeconds
    if (s.timerStartedAt && h >= WORK_START && h < WORK_END) {
      sec += Math.floor((now.getTime() - s.timerStartedAt.getTime()) / 1000)
    }
    return sum + sec
  }, 0)

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

  const activeHoursRemaining = [...active, ...paused.filter(p => !p.awaitingParts)].reduce((sum, s) => {
    const est = s.estimatedHours || 2
    const elapsed = getElapsed(s) / 3600
    return sum + Math.max(0, est - elapsed)
  }, 0)

  const todayJobs: typeof stages = [...active, ...paused.filter(p => !p.awaitingParts)]
  const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
  const remainingDays: { day: string; jobs: ReturnType<typeof format>[] }[] = []

  let todayBudget = Math.max(0, hoursLeftToday - activeHoursRemaining)
  const fullDaysLeft = dayIndex >= 0 && dayIndex <= 4 ? 4 - dayIndex : 0

  const dayBuckets: { day: string; budget: number; jobs: typeof stages }[] = []
  for (let d = 1; d <= fullDaysLeft; d++) {
    dayBuckets.push({ day: DAY_NAMES[dayIndex + d], budget: HOURS_PER_DAY, jobs: [] })
  }

  let currentBucketIdx = 0

  for (const s of queued) {
    const est = s.estimatedHours || 2
    if (todayBudget >= est) {
      todayJobs.push(s)
      todayBudget -= est
    } else if (todayBudget > 0) {
      todayJobs.push(s)
      todayBudget = 0
    } else {
      let placed = false
      while (currentBucketIdx < dayBuckets.length) {
        const bucket = dayBuckets[currentBucketIdx]
        if (bucket.budget >= est) {
          bucket.jobs.push(s)
          bucket.budget -= est
          placed = true
          break
        } else if (bucket.budget > 0 && bucket.budget >= est * 0.5) {
          bucket.jobs.push(s)
          bucket.budget = 0
          placed = true
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

  return NextResponse.json({
    active: active.map(format),
    paused: paused.map(format),
    queued: queued.map(format),
    completedToday: completedToday.map(format),
    today: todayJobs.map(format),
    remainingDays,
    weeklyEstimatedHours,
    weeklyWorkedHours: Math.round(weeklyWorkedSeconds / 360) / 10,
    remainingHoursThisWeek: Math.round(remainingHoursThisWeek * 10) / 10,
    hoursLeftToday: Math.round(hoursLeftToday * 10) / 10,
    workHours: { start: WORK_START, end: WORK_END },
    currentHour: h,
    isWorkHours: h >= WORK_START && h < WORK_END,
  })
}

// Actions: start, pause, resume, complete
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { action, stageId, pauseReason, pauseDetail, partName, expectedDate, trackingNumber } = await req.json()

  const stage = await prisma.vehicleStage.findUnique({ where: { id: stageId } })
  if (!stage || stage.stage !== 'mechanic') {
    return NextResponse.json({ error: 'Stage not found' }, { status: 404 })
  }

  const now = new Date()
  const h = etHour(now)

  switch (action) {
    case 'start': {
      if (h < WORK_START || h >= WORK_END) {
        return NextResponse.json({ error: 'Outside working hours (9 AM - 7 PM)' }, { status: 400 })
      }
      await prisma.vehicleStage.update({
        where: { id: stageId },
        data: {
          status: 'in_progress',
          timerStartedAt: now,
          autoPaused: false,
          pauseReason: null,
          pauseDetail: null,
          pausedAt: null,
        },
      })
      break
    }

    case 'pause': {
      let addSeconds = 0
      if (stage.timerStartedAt) {
        addSeconds = Math.floor((now.getTime() - stage.timerStartedAt.getTime()) / 1000)
      }
      const updateData: Record<string, unknown> = {
        timerStartedAt: null,
        activeSeconds: stage.activeSeconds + Math.max(0, addSeconds),
        autoPaused: false,
        pausedAt: now,
      }
      if (pauseReason === 'waiting_on_parts') {
        updateData.awaitingParts = true
        updateData.awaitingPartsName = partName || null
        updateData.awaitingPartsDate = expectedDate ? new Date(expectedDate) : null
        updateData.awaitingPartsTracking = trackingNumber || null
        updateData.awaitingPartsSince = now
        updateData.pauseReason = 'Waiting on Parts'
        updateData.pauseDetail = partName || null
      } else {
        updateData.pauseReason = pauseReason === 'other' ? 'Other' : pauseReason === 'lunch' ? 'Lunch' : (pauseReason || 'Paused')
        updateData.pauseDetail = pauseDetail || null
      }
      await prisma.vehicleStage.update({ where: { id: stageId }, data: updateData })
      break
    }

    case 'resume': {
      if (h < WORK_START || h >= WORK_END) {
        return NextResponse.json({ error: 'Outside working hours (9 AM - 7 PM)' }, { status: 400 })
      }
      await prisma.vehicleStage.update({
        where: { id: stageId },
        data: {
          timerStartedAt: now,
          autoPaused: false,
          pauseReason: null,
          pauseDetail: null,
          status: 'in_progress',
          awaitingParts: false,
          awaitingPartsName: null,
          awaitingPartsDate: null,
          awaitingPartsTracking: null,
          awaitingPartsSince: null,
          pausedAt: null,
        },
      })
      break
    }

    case 'complete': {
      let addSeconds = 0
      if (stage.timerStartedAt) {
        addSeconds = Math.floor((now.getTime() - stage.timerStartedAt.getTime()) / 1000)
      }
      await prisma.vehicleStage.update({
        where: { id: stageId },
        data: {
          status: 'done',
          completedAt: now,
          timerStartedAt: null,
          activeSeconds: stage.activeSeconds + Math.max(0, addSeconds),
          autoPaused: false,
          pauseReason: null,
        },
      })
      const { STAGES, DEFAULT_CHECKLISTS } = await import('@/lib/constants')
      type Stage = (typeof STAGES)[number]
      const currentIdx = STAGES.indexOf(stage.stage as Stage)
      if (currentIdx < STAGES.length - 1) {
        const nextStage = STAGES[currentIdx + 1]
        const config = await prisma.stageConfig.findUnique({ where: { stage: nextStage } })
        const checklistItems = (config?.defaultChecklist as string[] | undefined)?.length
          ? config!.defaultChecklist as string[]
          : DEFAULT_CHECKLISTS[nextStage as Stage] || []
        const checklist = checklistItems.map((item: string) => ({ item, done: false, note: '' }))

        const maxPriority = await prisma.vehicleStage.aggregate({
          where: { stage: nextStage, status: { notIn: ['done', 'skipped'] } },
          _max: { priority: true },
        })
        const bottomPriority = (maxPriority._max.priority ?? -1) + 1

        const newStage = await prisma.vehicleStage.create({
          data: {
            vehicleId: stage.vehicleId,
            stage: nextStage,
            status: 'pending',
            assigneeId: config?.defaultAssigneeId || null,
            checklist,
            priority: bottomPriority,
          },
        })
        await prisma.vehicle.update({
          where: { id: stage.vehicleId },
          data: { status: nextStage, currentStageId: newStage.id, currentAssigneeId: config?.defaultAssigneeId || null },
        })
      } else {
        await prisma.vehicle.update({
          where: { id: stage.vehicleId },
          data: { status: 'completed', completedAt: now, currentStageId: null, currentAssigneeId: null },
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
