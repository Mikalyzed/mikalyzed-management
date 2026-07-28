import { prisma } from '@/lib/db'
import { getTracker, isEasyPostConfigured } from '@/lib/easypost'
import { notifyCarrierDelivered } from '@/lib/part-notifications'

/**
 * Refresh stale live trackers (bounded + cached). Called from the parts list
 * AND the Morning Meeting report build, so carrier truth is fresh wherever
 * the team looks first. Fires the admin notification on the transition into
 * delivered while the part is still "ordered".
 */
export async function refreshPartTracking(limit = 10): Promise<void> {
  if (!isEasyPostConfigured()) return
  const STALE_MS = 30 * 60 * 1000
  const stale = await prisma.part.findMany({
    where: {
      epTrackerId: { not: null },
      status: 'ordered',
      OR: [
        { trackingUpdatedAt: null },
        { trackingUpdatedAt: { lt: new Date(Date.now() - STALE_MS) } },
      ],
      NOT: { trackingStatus: { in: ['delivered', 'cancelled', 'return_to_sender'] } },
    },
    select: {
      id: true, epTrackerId: true, trackingStatus: true, name: true,
      vehicle: { select: { id: true, stockNumber: true, year: true, make: true, model: true } },
    },
    take: limit,
  })
  await Promise.all(stale.map(async p => {
    const t = await getTracker(p.epTrackerId!)
    const data: Record<string, unknown> = { trackingUpdatedAt: new Date() }
    if (t) {
      data.trackingStatus = t.status
      data.trackingCarrier = t.carrier
      if (t.estDeliveryDate) data.expectedDelivery = t.estDeliveryDate
    }
    await prisma.part.update({ where: { id: p.id }, data }).catch(() => {})
    const wasDelivered = ['delivered', 'available_for_pickup'].includes(p.trackingStatus ?? '')
    const nowDelivered = !!t && ['delivered', 'available_for_pickup'].includes(t.status)
    if (nowDelivered && !wasDelivered) {
      await notifyCarrierDelivered({
        partId: p.id,
        partName: p.name,
        vehicleId: p.vehicle.id,
        vehicleStockNumber: p.vehicle.stockNumber,
        vehicleDesc: `${p.vehicle.year ?? ''} ${p.vehicle.make} ${p.vehicle.model}`.trim(),
        carrier: t?.carrier ?? null,
      })
    }
  }))
}
