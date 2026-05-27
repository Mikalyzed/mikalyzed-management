import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { recomputeInventoryStatus } from '@/lib/inventory-status'
import { consumeReturnQueue } from '@/lib/return-queue'
import { notifyStageReadyForRouting } from '@/lib/stage-notifications'

/**
 * Worker-facing stage completion. If the vehicle has a queued return,
 * auto-route to that stage; otherwise park in 'awaiting_routing' for admin.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const stage = await prisma.vehicleStage.findUnique({
    where: { id },
    include: { vehicle: { select: { id: true, stockNumber: true, year: true, make: true, model: true, currentStageId: true } } },
  })
  if (!stage) return NextResponse.json({ error: 'Stage not found' }, { status: 404 })

  if (stage.vehicle.currentStageId !== id) {
    return NextResponse.json({ error: 'This is not the current stage' }, { status: 400 })
  }

  const returned = await prisma.$transaction(async (tx) => {
    await tx.vehicleStage.update({
      where: { id },
      data: {
        status: 'done',
        completedAt: new Date(),
        timerStartedAt: null,
      },
    })
    await tx.activityLog.create({
      data: {
        entityType: 'vehicle',
        entityId: stage.vehicleId,
        action: 'stage_completed',
        actorId: user.id,
        details: { stage: stage.stage },
      },
    }).catch(() => {})

    const consumed = await consumeReturnQueue(tx, stage.vehicleId, user.id)
    if (!consumed) {
      await tx.vehicle.update({
        where: { id: stage.vehicleId },
        data: { status: 'awaiting_routing', currentAssigneeId: null },
      })
    }
    return consumed
  })

  await recomputeInventoryStatus(stage.vehicle.stockNumber).catch(() => {})

  // Only notify if vehicle landed in pending-routing (consumeReturnQueue would have auto-routed otherwise)
  if (!returned) {
    notifyStageReadyForRouting({
      stageId: id,
      vehicleId: stage.vehicleId,
      vehicleStockNumber: stage.vehicle.stockNumber,
      vehicleDesc: `${stage.vehicle.year ?? ''} ${stage.vehicle.make} ${stage.vehicle.model}`.trim(),
      triggeredByUserId: user.id,
    })
  }

  return NextResponse.json({ success: true, awaitingRouting: !returned, returned })
}
