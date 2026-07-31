import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { recomputeInventoryStatus } from '@/lib/inventory-status'
import { markVehicleAsAtExternal } from '@/lib/external-repair-flow'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  const repairs = await prisma.externalRepair.findMany({
    where: id ? { id } : undefined,
    orderBy: [{ status: 'asc' }, { sentDate: 'desc' }],
  })
  // Attach the blocked part (name + live tracking) to any repair still gated on
  // a part that hasn't landed, so the card can show "Waiting on <part> · <status>".
  const blockedIds = repairs.map(r => r.blockedOnPartId).filter((v): v is string => !!v)
  const blockedParts = blockedIds.length
    ? await prisma.part.findMany({
        where: { id: { in: blockedIds } },
        select: { id: true, name: true, status: true, trackingStatus: true, expectedDelivery: true },
      })
    : []
  const partById = new Map(blockedParts.map(p => [p.id, p]))
  const withBlocked = repairs.map(r => ({
    ...r,
    blockedPart: r.blockedOnPartId ? partById.get(r.blockedOnPartId) ?? null : null,
  }))

  // Single-repair fetch (the action modal): carry the linked mission task so
  // the modal can notice a skipped step (e.g. Sent without a ride arranged)
  if (id && withBlocked.length === 1) {
    const task = await prisma.task.findFirst({
      where: { externalRepairId: id, status: { notIn: ['done', 'skipped'] } },
      select: { id: true, missionType: true, transportRequestId: true, selfTransport: true },
    })
    return NextResponse.json({ repairs: withBlocked, linkedTask: task })
  }
  return NextResponse.json({ repairs: withBlocked })
}

export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { stockNumber, year, make, model, color, vendorId, shopName, shopPhone, atDealership, partOnly, repairDescription, estimatedDays, sentDate, notes, status } = body

  if (!stockNumber || !make || !model || !shopName || !repairDescription) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const isPending = status === 'pending' || !sentDate
  if (!isPending && !sentDate) {
    return NextResponse.json({ error: 'sentDate required unless status is pending' }, { status: 400 })
  }

  const sent = sentDate ? new Date(sentDate) : null
  // Expected return: derived from sent + estimate, or taken directly from the
  // body — a pending (not-yet-sent) repair can still carry a target date
  // (e.g. Morning Meeting "send to Frank's next week").
  const expectedReturn = sent && estimatedDays
    ? new Date(sent.getTime() + estimatedDays * 86400000)
    : body.expectedReturn
      ? new Date(body.expectedReturn)
      : null

  const repair = await prisma.externalRepair.create({
    data: {
      stockNumber,
      year: year || null,
      make,
      model,
      color: color || null,
      vendorId: vendorId || null,
      shopName,
      shopPhone: shopPhone || null,
      atDealership: !!atDealership,
      partOnly: !!partOnly,
      repairDescription,
      estimatedDays: estimatedDays || null,
      sentDate: sent,
      expectedReturn,
      status: isPending ? 'pending' : 'sent',
      notes: notes || null,
      createdById: user.id,
    },
  })

  await recomputeInventoryStatus(stockNumber).catch(() => {})

  // If the repair is created as 'sent' (car already on its way out, not just being
  // pre-tracked), pull the vehicle off the recon board and skip orphan stages.
  // 'pending' repairs are tracking-only and leave the vehicle wherever it is.
  if (repair.status === 'sent' && !repair.partOnly) {
    await markVehicleAsAtExternal({
      stockNumber,
      actorId: user.id,
      externalRepairId: repair.id,
    })
  }

  return NextResponse.json({ repair }, { status: 201 })
}
