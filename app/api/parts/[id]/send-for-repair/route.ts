import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, requireRole } from '@/lib/auth'

/**
 * Send a RECEIVED part OUT to an outside shop for WORK (e.g. upholstery), to be
 * installed IN-HOUSE when it returns — distinct from external-install (where the
 * shop installs it on the car). Creates a partOnly ExternalRepair linked to the
 * part via installPartId; marking that repair `returned` queues the mechanic
 * install (see lib/part-install.ts). Stamps the part's install plan so it drops
 * off the "No Install Plan" queue.
 *
 * Body: { shop: string, work: string }
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
  const vendorId = typeof body.vendorId === 'string' && body.vendorId ? body.vendorId : null
  const work = typeof body.work === 'string' ? body.work.trim() : ''
  const expectedReturn = typeof body.expectedReturn === 'string' && body.expectedReturn ? new Date(body.expectedReturn) : null
  if (!shop) return NextResponse.json({ error: 'Which shop is doing the work?' }, { status: 400 })
  if (!work) return NextResponse.json({ error: 'What work needs doing?' }, { status: 400 })
  if (!expectedReturn || isNaN(expectedReturn.getTime())) return NextResponse.json({ error: 'When is it expected back?' }, { status: 400 })
  // estimatedDays powers the overdue calc on the external card (days from sent → back).
  const now = new Date()
  const estimatedDays = Math.max(1, Math.round((expectedReturn.getTime() - now.getTime()) / 86400000))

  const part = await prisma.part.findUnique({
    where: { id },
    include: { vehicle: { select: { id: true, stockNumber: true, year: true, make: true, model: true, color: true } } },
  })
  if (!part) return NextResponse.json({ error: 'Part not found' }, { status: 404 })
  if (part.status !== 'received') {
    return NextResponse.json({ error: 'Mark the part received before sending it out for repair.' }, { status: 400 })
  }

  // Reuse an open repair already set up to install this part on return (don't double up).
  const existing = await prisma.externalRepair.findFirst({
    where: { installPartId: id, status: { not: 'returned' } },
    select: { id: true },
  })

  let externalRepairId: string
  if (existing) {
    externalRepairId = existing.id
    await prisma.externalRepair.update({
      where: { id: existing.id },
      data: { shopName: shop, repairDescription: work, expectedReturn, estimatedDays, ...(vendorId ? { vendorId } : {}) },
    })
  } else {
    // Created as `sent` — the button IS the send action; it lands in the
    // coordinator's "Waiting on External" list to track and mark Returned. The
    // car never leaves (partOnly), so no vehicle side-effects.
    const ext = await prisma.externalRepair.create({
      data: {
        stockNumber: part.vehicle.stockNumber,
        year: part.vehicle.year, make: part.vehicle.make, model: part.vehicle.model, color: part.vehicle.color,
        shopName: shop,
        ...(vendorId ? { vendorId } : {}),
        partOnly: true,
        repairDescription: work,
        status: 'sent',
        sentDate: now,
        expectedReturn,
        estimatedDays,
        installPartId: id,
        notes: `"${part.name}" out to ${shop} for: ${work}. Installs in-house on return.`,
        createdById: user.id,
      },
    })
    externalRepairId = ext.id
  }

  // The part now HAS a plan (out for work → install on return) → drops off No Install Plan.
  await prisma.part.update({
    where: { id },
    data: { installTaskCreatedAt: new Date(), installShop: shop },
  })

  await prisma.activityLog.create({
    data: {
      entityType: 'part', entityId: id, action: 'part_sent_for_repair', actorId: user.id,
      details: { partName: part.name, shop, work, stockNumber: part.vehicle.stockNumber, externalRepairId },
    },
  }).catch(() => {})

  return NextResponse.json({ ok: true, externalRepairId })
}
