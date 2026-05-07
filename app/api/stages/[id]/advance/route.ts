import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { recomputeInventoryStatus } from '@/lib/inventory-status'
import { consumeReturnQueue } from '@/lib/return-queue'

/**
 * Stage completion. If the vehicle has a queued return (admin previously
 * dragged it back from a downstream stage), auto-route to that stage.
 * Otherwise park in 'awaiting_routing' for admin to decide.
 *
 * Kept at the /advance path for backwards compatibility with existing UI.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const stage = await prisma.vehicleStage.findUnique({
    where: { id },
    include: { vehicle: { select: { id: true, stockNumber: true, currentStageId: true } } },
  })
  if (!stage) return NextResponse.json({ error: 'Stage not found' }, { status: 404 })

  if (stage.assigneeId !== user.id && user.role !== 'admin') {
    return NextResponse.json({ error: 'Not authorized to complete this stage' }, { status: 403 })
  }

  if (stage.vehicle.currentStageId !== stage.id) {
    return NextResponse.json({ error: 'This is not the current stage' }, { status: 400 })
  }

  const returned = await prisma.$transaction(async (tx) => {
    await tx.vehicleStage.update({
      where: { id },
      data: { status: 'done', completedAt: new Date(), timerStartedAt: null },
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

  return NextResponse.json({ success: true, awaitingRouting: !returned, returned })
}
