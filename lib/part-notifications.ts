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


/**
 * Carrier says a package is delivered (via live tracking) but the part is
 * still "ordered" in the system — ping the admins to confirm receipt.
 * Fired once per part, on the transition into delivered.
 */
export async function notifyCarrierDelivered(args: {
  partId: string
  partName: string
  vehicleId: string
  vehicleStockNumber: string
  vehicleDesc: string
  carrier: string | null
}): Promise<void> {
  try {
    const admins = await prisma.user.findMany({
      where: { role: { in: ['admin', 'shop_coordinator'] }, isActive: true },
      select: { id: true },
    })
    if (admins.length === 0) return

    const title = `Carrier says delivered — ${args.vehicleStockNumber}`
    const message = `${args.carrier ?? 'The carrier'} shows "${args.partName}" delivered for ${args.vehicleDesc}, but it hasn't been marked received. Confirm it arrived on the Parts page.`

    await prisma.notification.createMany({
      data: admins.map(a => ({
        userId: a.id,
        type: 'part_carrier_delivered',
        title,
        message,
        entityType: 'vehicle',
        entityId: args.vehicleId,
      })),
    })
  } catch (e) {
    console.error('[notifyCarrierDelivered]', e)
  }
}


/**
 * Fires when a received part un-gates its external install mission (the part
 * has an install-at-outside-vendor plan and just arrived). Tells the shop
 * coordinator + admins the mission is live: take the part to the shop. Links
 * to the external repair so the notification opens straight to the mission.
 * Fire-and-forget.
 */
export async function notifyReadyToInstall(args: {
  externalRepairId: string
  partName: string
  shopName: string
  vehicleStockNumber: string
  vehicleDesc: string
  triggeredByUserId: string
}): Promise<void> {
  try {
    const recipients = await prisma.user.findMany({
      where: { role: { in: ['admin', 'shop_coordinator'] }, isActive: true },
      select: { id: true },
    })
    const ids = recipients.map(r => r.id).filter(id => id !== args.triggeredByUserId)
    if (ids.length === 0) return

    const title = `Ready to install — ${args.vehicleStockNumber}`
    const message = `"${args.partName}" arrived for ${args.vehicleDesc}. Take it to ${args.shopName} to install — the mission is now live.`

    await prisma.notification.createMany({
      data: ids.map(userId => ({
        userId,
        type: 'external_ready_to_install',
        title,
        message,
        entityType: 'external_repair',
        entityId: args.externalRepairId,
      })),
    })
  } catch (e) {
    console.error('[notifyReadyToInstall]', e)
  }
}
