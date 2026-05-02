import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { recomputeInventoryStatus } from '@/lib/inventory-status'

/**
 * Worker-facing stage completion. Marks stage as done and parks the vehicle
 * in 'awaiting_routing' so an admin can decide where it goes next instead
 * of auto-advancing through a fixed pipeline.
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

  if (stage.vehicle.currentStageId !== id) {
    return NextResponse.json({ error: 'This is not the current stage' }, { status: 400 })
  }

  await prisma.$transaction(async (tx) => {
    await tx.vehicleStage.update({
      where: { id },
      data: {
        status: 'done',
        completedAt: new Date(),
        timerStartedAt: null,
      },
    })
    await tx.vehicle.update({
      where: { id: stage.vehicleId },
      data: {
        status: 'awaiting_routing',
        currentAssigneeId: null,
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
  })

  await recomputeInventoryStatus(stage.vehicle.stockNumber).catch(() => {})

  return NextResponse.json({ success: true, awaitingRouting: true })
}
