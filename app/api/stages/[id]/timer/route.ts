import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

/**
 * Generic stage timer controls. Works for any stage (mechanic, detailing,
 * content, publish). Updates VehicleStage.activeSeconds + timerStartedAt
 * so reporting reflects actual hands-on work time, not wall-clock.
 *
 * Actions:
 *   - start: pending → in_progress, start timer
 *   - pause: in_progress → in_progress (timer stopped), accumulates activeSeconds
 *   - resume: paused/blocked → in_progress, restarts timer
 *   - complete: in_progress → done, accumulates activeSeconds, completedAt set
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { action, pauseReason, pauseDetail } = await req.json()

  if (!['start', 'pause', 'resume', 'complete'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const stage = await prisma.vehicleStage.findUnique({ where: { id } })
  if (!stage) return NextResponse.json({ error: 'Stage not found' }, { status: 404 })

  // Only the assigned user or admin can run the timer
  if (stage.assigneeId !== user.id && user.role !== 'admin') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const now = new Date()

  // Helper: accumulate activeSeconds based on currently running timer
  function addPendingTime(currentActive: number, startedAt: Date | null): number {
    if (!startedAt) return currentActive
    const delta = Math.floor((now.getTime() - startedAt.getTime()) / 1000)
    return currentActive + Math.max(0, delta)
  }

  if (action === 'start') {
    if (stage.status === 'done') {
      return NextResponse.json({ error: 'Stage already completed' }, { status: 400 })
    }
    await prisma.vehicleStage.update({
      where: { id },
      data: {
        status: 'in_progress',
        timerStartedAt: now,
        autoPaused: false,
        pauseReason: null,
        pauseDetail: null,
        pausedAt: null,
      },
    })
  } else if (action === 'pause') {
    await prisma.vehicleStage.update({
      where: { id },
      data: {
        timerStartedAt: null,
        activeSeconds: addPendingTime(stage.activeSeconds, stage.timerStartedAt),
        pausedAt: now,
        pauseReason: pauseReason?.trim() || 'Paused',
        pauseDetail: pauseDetail?.trim() || null,
        autoPaused: false,
      },
    })
  } else if (action === 'resume') {
    await prisma.vehicleStage.update({
      where: { id },
      data: {
        status: 'in_progress',
        timerStartedAt: now,
        autoPaused: false,
        pauseReason: null,
        pauseDetail: null,
        pausedAt: null,
      },
    })
  } else if (action === 'complete') {
    await prisma.vehicleStage.update({
      where: { id },
      data: {
        status: 'done',
        completedAt: now,
        timerStartedAt: null,
        activeSeconds: addPendingTime(stage.activeSeconds, stage.timerStartedAt),
        autoPaused: false,
        pauseReason: null,
        pauseDetail: null,
        pausedAt: null,
        awaitingParts: false,
        awaitingPartsName: null,
        awaitingPartsDate: null,
        awaitingPartsTracking: null,
        awaitingPartsSince: null,
      },
    })
    // Park the vehicle in awaiting_routing for the admin to decide what's next.
    // (Same behavior as /api/stages/[id]/advance, but without the consumeReturnQueue
    // logic — that's a separate concern the admin handles.)
    await prisma.vehicle.update({
      where: { id: stage.vehicleId },
      data: { status: 'awaiting_routing', currentAssigneeId: null },
    }).catch(() => {})
  }

  // Log activity
  await prisma.activityLog.create({
    data: {
      entityType: 'stage',
      entityId: id,
      action: `timer_${action}`,
      actorId: user.id,
      details: { stage: stage.stage, pauseReason, pauseDetail },
    },
  }).catch(() => {})

  return NextResponse.json({ ok: true })
}
