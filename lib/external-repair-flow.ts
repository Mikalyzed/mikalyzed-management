import { prisma } from './db'

/**
 * When an external repair transitions to 'sent' or 'in_progress' (car is out at the
 * shop), pull the vehicle out of any recon board it's on:
 *   - Mark all pending/in_progress stages as skipped (so they don't orphan in worker queues)
 *   - Set Vehicle.status='external' and clear the stage pointers
 *   - Log activity
 *
 * Idempotent: no-op if the vehicle is already at status='external'.
 */
export async function markVehicleAsAtExternal(args: {
  stockNumber: string
  actorId?: string | null
  externalRepairId: string
}): Promise<void> {
  const v = await prisma.vehicle.findFirst({
    where: { stockNumber: args.stockNumber, status: { not: 'external' } },
    select: { id: true },
  })
  if (!v) return

  await prisma.vehicleStage.updateMany({
    where: { vehicleId: v.id, status: { in: ['pending', 'in_progress'] } },
    data: {
      status: 'skipped',
      completedAt: new Date(),
      timerStartedAt: null,
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
  await prisma.vehicle.update({
    where: { id: v.id },
    data: { status: 'external', currentStageId: null, currentAssigneeId: null },
  })
  await prisma.activityLog.create({
    data: {
      entityType: 'vehicle',
      entityId: v.id,
      action: 'sent_to_external',
      actorId: args.actorId ?? null,
      details: { stockNumber: args.stockNumber, externalRepairId: args.externalRepairId },
    },
  }).catch(() => {})
}

/**
 * Counterpart: when an external repair is marked 'returned' AND no other active
 * external repairs remain for that stock #, park the vehicle in awaiting_routing
 * so admin reviews + routes it.
 */
export async function markVehicleReturnedFromExternal(args: {
  stockNumber: string
  actorId?: string | null
  externalRepairId: string
}): Promise<void> {
  const stillActive = await prisma.externalRepair.count({
    where: { stockNumber: args.stockNumber, status: { not: 'returned' } },
  })
  if (stillActive > 0) return

  const v = await prisma.vehicle.findFirst({
    where: { stockNumber: args.stockNumber, status: 'external' },
    select: { id: true },
  })
  if (!v) return

  await prisma.vehicleStage.updateMany({
    where: { vehicleId: v.id, status: { in: ['pending', 'in_progress'] } },
    data: {
      status: 'skipped',
      completedAt: new Date(),
      timerStartedAt: null,
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
  await prisma.vehicle.update({
    where: { id: v.id },
    data: { status: 'awaiting_routing', currentStageId: null, currentAssigneeId: null },
  })
  await prisma.activityLog.create({
    data: {
      entityType: 'vehicle',
      entityId: v.id,
      action: 'returned_from_external',
      actorId: args.actorId ?? null,
      details: { stockNumber: args.stockNumber, externalRepairId: args.externalRepairId },
    },
  }).catch(() => {})
}
