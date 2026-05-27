import { prisma } from './db'

/**
 * Fires when a part transitions to status='received'. Notifies:
 *   - All admin users (so they can route the vehicle to mechanic for install when it next hits routing)
 *   - The vehicle's current stage assignee (so they know a part landed mid-stage, even if it's not for their stage)
 *
 * Fire-and-forget — caller doesn't need to await. Errors are logged but don't throw.
 */
export async function notifyPartReceived(args: {
  partId: string
  partName: string
  vehicleId: string
  vehicleStockNumber: string
  vehicleDesc: string  // e.g. "1984 Chevrolet Blazer"
  triggeredByUserId: string  // don't notify the person who marked it received
}): Promise<void> {
  try {
    // Collect recipients: all admins + current vehicle assignee
    const [admins, vehicle] = await Promise.all([
      prisma.user.findMany({
        where: { role: 'admin', isActive: true },
        select: { id: true },
      }),
      prisma.vehicle.findUnique({
        where: { id: args.vehicleId },
        select: { currentAssigneeId: true },
      }),
    ])

    const recipientIds = new Set<string>()
    for (const a of admins) recipientIds.add(a.id)
    if (vehicle?.currentAssigneeId) recipientIds.add(vehicle.currentAssigneeId)
    // Don't notify the person who clicked Mark Received
    recipientIds.delete(args.triggeredByUserId)

    if (recipientIds.size === 0) return

    const title = `Part received — ${args.vehicleStockNumber}`
    const message = `${args.partName} arrived for ${args.vehicleDesc}. It will be flagged for install when the vehicle next routes.`

    await prisma.notification.createMany({
      data: Array.from(recipientIds).map(userId => ({
        userId,
        type: 'part_received',
        title,
        message,
        entityType: 'vehicle',
        entityId: args.vehicleId,
      })),
    })
  } catch (e) {
    console.error('[notifyPartReceived]', e)
  }
}
