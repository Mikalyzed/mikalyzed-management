import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, requireRole } from '@/lib/auth'
import { notifyReadyToInstall } from '@/lib/part-notifications'

/**
 * Assign a part's install to an OUTSIDE vendor by hand — the manual counterpart
 * to the smart-task flow. Stamps the part's install plan and stands up the
 * mission:
 *   - part not yet received → a GATED external ("Waiting on part"), goes live on receive
 *   - part already received  → a LIVE pending external + notify (ready to install now)
 * Idempotent: reuses an open external already gated on this part.
 *
 * Body: { shop: string }
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!requireRole(user.role, ['shop_coordinator'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const shop = typeof body.shop === 'string' ? body.shop.trim() : ''
  if (!shop) return NextResponse.json({ error: 'Which outside shop installs it?' }, { status: 400 })

  const part = await prisma.part.findUnique({
    where: { id },
    include: { vehicle: { select: { id: true, stockNumber: true, year: true, make: true, model: true, color: true } } },
  })
  if (!part) return NextResponse.json({ error: 'Part not found' }, { status: 404 })

  const alreadyReceived = part.status === 'received'

  // Reuse an open external already gated on this part (don't double up).
  const existing = await prisma.externalRepair.findFirst({
    where: { blockedOnPartId: id },
    select: { id: true },
  })

  let externalRepairId: string
  if (existing) {
    externalRepairId = existing.id
    await prisma.externalRepair.update({
      where: { id: existing.id },
      data: { shopName: shop, ...(alreadyReceived ? { blockedOnPartId: null } : {}) },
    })
  } else {
    const ext = await prisma.externalRepair.create({
      data: {
        stockNumber: part.vehicle.stockNumber,
        year: part.vehicle.year, make: part.vehicle.make, model: part.vehicle.model, color: part.vehicle.color,
        shopName: shop,
        partOnly: true,
        repairDescription: `Install: ${part.name}`,
        status: 'pending',
        blockedOnPartId: alreadyReceived ? null : id,
        notes: alreadyReceived
          ? `Part in hand — take "${part.name}" to ${shop} to install.`
          : `Waiting for part to arrive — "${part.name}". Goes live once the part is received.`,
        createdById: user.id,
      },
    })
    externalRepairId = ext.id
  }

  await prisma.part.update({
    where: { id },
    data: { installVenue: 'external', installShop: shop, ...(alreadyReceived ? { installTaskCreatedAt: new Date() } : {}) },
  })

  // Part already here → this install is live right now: mission task + alert.
  if (alreadyReceived) {
    const dup = await prisma.task.findFirst({
      where: { externalRepairId, status: { not: 'done' } },
      select: { id: true },
    })
    if (!dup) {
      await prisma.task.create({
        data: {
          title: `Send to ${shop} to install ${part.name} (#${part.vehicle.stockNumber})`.slice(0, 200),
          description: `The ${part.name} is in hand — take it to ${shop} for install. Arrange the ride from the mission card.`,
          category: 'operations', priority: 1,
          createdById: user.id,
          stockNumbers: [part.vehicle.stockNumber],
          externalRepairId,
          missionType: 'deliver',
        },
      }).catch(() => {})
    }
    notifyReadyToInstall({
      externalRepairId,
      partName: part.name,
      shopName: shop,
      vehicleStockNumber: part.vehicle.stockNumber,
      vehicleDesc: `${part.vehicle.year ?? ''} ${part.vehicle.make} ${part.vehicle.model}`.trim(),
      triggeredByUserId: user.id,
    })
  }

  await prisma.activityLog.create({
    data: {
      entityType: 'part', entityId: id, action: 'install_assigned_external', actorId: user.id,
      details: { partName: part.name, shop, stockNumber: part.vehicle.stockNumber, gated: !alreadyReceived, externalRepairId },
    },
  }).catch(() => {})

  return NextResponse.json({ ok: true, externalRepairId, gated: !alreadyReceived })
}
