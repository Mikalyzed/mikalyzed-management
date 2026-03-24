import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

const WORK_START = 9
const WORK_END = 19
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
        // Accumulate time up to WORK_END, then pause
        const elapsed = Math.floor((now.getTime() - s.timerStartedAt.getTime()) / 1000)
        await prisma.vehicleStage.update({
          where: { id: s.id },
          data: {
            activeSeconds: s.activeSeconds + Math.max(0, elapsed),
            timerStartedAt: null,
            autoPaused: true,
            status: 'in_progress', // keep status, just stop timer
          },
        })
        s.activeSeconds += Math.max(0, elapsed)
        s.timerStartedAt = null
        s.autoPaused = true
      }
    }
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
    awaitingParts: s.awaitingParts,
    awaitingPartsName: s.awaitingPartsName,
    awaitingPartsDate: s.awaitingPartsDate?.toISOString() || null,
    awaitingPartsTracking: s.awaitingPartsTracking,
    completedAt: s.completedAt?.toISOString() || null,
    startedAt: s.startedAt?.toISOString() || null,
  })

  return NextResponse.json({
    active: active.map(format),
    paused: paused.map(format),
    queued: queued.map(format),
    completedToday: completedToday.map(format),
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
        },
      })
      break
    }

    case 'pause': {
      // Accumulate elapsed time
      let addSeconds = 0
      if (stage.timerStartedAt) {
        addSeconds = Math.floor((now.getTime() - stage.timerStartedAt.getTime()) / 1000)
      }
      const updateData: Record<string, unknown> = {
        timerStartedAt: null,
        activeSeconds: stage.activeSeconds + Math.max(0, addSeconds),
        autoPaused: false,
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
        updateData.pauseReason = pauseReason === 'other' ? 'Other' : (pauseReason || 'Paused')
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
          // If resuming from awaiting parts, clear that
          awaitingParts: false,
          awaitingPartsName: null,
          awaitingPartsDate: null,
          awaitingPartsTracking: null,
          awaitingPartsSince: null,
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
      // Advance to next stage
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
        const newStage = await prisma.vehicleStage.create({
          data: {
            vehicleId: stage.vehicleId,
            stage: nextStage,
            status: 'pending',
            assigneeId: config?.defaultAssigneeId || null,
            checklist,
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
      const { taskIndex } = await req.json().catch(() => ({ taskIndex: undefined }))
      // handled via existing PATCH /api/stages/[id]
      return NextResponse.json({ error: 'Use PATCH /api/stages/[id] for checklist updates' }, { status: 400 })
    }

    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
