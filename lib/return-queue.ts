import type { Prisma, PrismaClient } from '@prisma/client'

type Tx = Prisma.TransactionClient | PrismaClient

type ReturnEntry = {
  stage: string
  fromStage?: string
  reason?: string
  uncompletedTasks?: unknown[]
}

/**
 * Consumes the next entry from a vehicle's returnQueue (if any) and creates
 * a new stage at the queued return target. Returns true if a queued return
 * was consumed; false if the queue was empty (caller should park the
 * vehicle in awaiting_routing instead).
 */
export async function consumeReturnQueue(
  tx: Tx,
  vehicleId: string,
  actorId: string,
): Promise<boolean> {
  const vehicle = await tx.vehicle.findUnique({
    where: { id: vehicleId },
    select: { id: true, returnQueue: true },
  })
  const queue = (vehicle?.returnQueue as ReturnEntry[] | null) || []
  if (queue.length === 0) return false

  const nextReturn = queue[0]
  const remaining = queue.slice(1)

  const lastInStage = await tx.vehicleStage.findFirst({
    where: { stage: nextReturn.stage, status: { notIn: ['done', 'skipped'] } },
    orderBy: { priority: 'desc' },
    select: { priority: true },
  })
  const bottomPriority = (lastInStage?.priority ?? -1) + 1

  const newStage = await tx.vehicleStage.create({
    data: {
      vehicleId,
      stage: nextReturn.stage,
      status: 'pending',
      assigneeId: null,
      checklist: (nextReturn.uncompletedTasks as Prisma.InputJsonValue) || [],
      priority: bottomPriority,
      notes: `Returned from ${nextReturn.fromStage ?? '?'}: ${nextReturn.reason ?? ''}`.trim(),
    },
  })

  await tx.vehicle.update({
    where: { id: vehicleId },
    data: {
      status: nextReturn.stage,
      currentStageId: newStage.id,
      currentAssigneeId: null,
      returnQueue: remaining as Prisma.InputJsonValue,
    },
  })

  await tx.activityLog.create({
    data: {
      entityType: 'vehicle',
      entityId: vehicleId,
      action: 'returned_to_stage',
      actorId,
      details: {
        returnedStage: nextReturn.stage,
        fromStage: nextReturn.fromStage,
        tasksRemaining: Array.isArray(nextReturn.uncompletedTasks) ? nextReturn.uncompletedTasks.length : 0,
      },
    },
  }).catch(() => {})

  return true
}
