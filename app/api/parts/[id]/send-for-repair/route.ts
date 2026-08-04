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
  // Three timings:
  //  - Not scheduled yet → pending, no dates (fill later).
  //  - Going out on a FUTURE date → pending + plannedSendDate (planned, not gone;
  //    the "never sent" watchlist nags if that date passes).
  //  - Going out today → sent now.
  // A scheduled repair (either of the last two) needs an expected-back date.
  const pending = body.pending === true
  const sendDate = !pending && typeof body.sendDate === 'string' && body.sendDate ? new Date(body.sendDate) : null
  const expectedReturn = !pending && typeof body.expectedReturn === 'string' && body.expectedReturn ? new Date(body.expectedReturn) : null
  if (!shop) return NextResponse.json({ error: 'Which shop is doing the work?' }, { status: 400 })
  if (!work) return NextResponse.json({ error: 'What work needs doing?' }, { status: 400 })
  // Expected-back is optional — a scheduled repair just needs to know it's going
  // out (defaults to today if no date given). Ignore an unparseable date.
  const expectedBack = expectedReturn && !isNaN(expectedReturn.getTime()) ? expectedReturn : null
  const now = new Date()
  const sendDayValid = sendDate && !isNaN(sendDate.getTime())
  // Future going-out date (calendar day after today) → planned rather than sent now.
  const isPlanned = !pending && sendDayValid && sendDate!.toISOString().slice(0, 10) > now.toISOString().slice(0, 10)
  const effectiveSend = isPlanned ? sendDate! : now
  // estimatedDays powers the overdue calc on the external card (days from send → back).
  const estimatedDays = expectedBack ? Math.max(1, Math.round((expectedBack.getTime() - effectiveSend.getTime()) / 86400000)) : null
  // status/date shape for whichever timing applies.
  const timing = pending
    ? { status: 'pending', sentDate: null, plannedSendDate: null, expectedReturn: null, estimatedDays: null }
    : isPlanned
      ? { status: 'pending', sentDate: null, plannedSendDate: sendDate!, expectedReturn: expectedBack, estimatedDays }
      : { status: 'sent', sentDate: now, plannedSendDate: null, expectedReturn: expectedBack, estimatedDays }

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
      data: {
        shopName: shop, repairDescription: work, ...(vendorId ? { vendorId } : {}),
        ...timing,
      },
    })
  } else {
    // Sent now → lands in "Waiting on External" to track + mark Returned. Planned
    // or not-scheduled → pending. Either way the car never leaves (partOnly), so
    // no vehicle side-effects.
    const ext = await prisma.externalRepair.create({
      data: {
        stockNumber: part.vehicle.stockNumber,
        year: part.vehicle.year, make: part.vehicle.make, model: part.vehicle.model, color: part.vehicle.color,
        shopName: shop,
        ...(vendorId ? { vendorId } : {}),
        partOnly: true,
        repairDescription: work,
        ...timing,
        installPartId: id,
        notes: pending
          ? `"${part.name}" going to ${shop} for: ${work} (not scheduled yet). Installs in-house on return.`
          : isPlanned
            ? `"${part.name}" scheduled to go to ${shop} for: ${work}. Installs in-house on return.`
            : `"${part.name}" out to ${shop} for: ${work}. Installs in-house on return.`,
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
