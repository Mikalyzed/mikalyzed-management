import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, requireRole } from '@/lib/auth'
import { recomputeInventoryStatus } from '@/lib/inventory-status'

/**
 * POST /api/vehicles/:id/send-to-mechanic — get an arrived part's install onto
 * the recon board, from wherever the car currently is.
 *
 * Body: { partIds?: string[] } — defaults to every received part on the car
 * that has no install task yet.
 *
 * Outcomes:
 *  - Car has an active MECHANIC stage      → append the Install tasks to it.
 *  - Car is in recon at ANOTHER stage      → 409 { code: 'in_recon', stage }
 *    (the client offers routing — moving stages is a routing decision).
 *  - Car is physically at an EXTERNAL shop → 409 { code: 'external', shop }
 *    (the install is already queued: the routing modal surfaces received
 *    parts without install tasks when the car comes back in).
 *  - Otherwise (in stock / sold / completed) → create a fresh mechanic stage
 *    with the Install tasks and put the car in recon.
 *
 * Install tasks are created unassigned (fromPart) so they land in the
 * "assign the install" attention row, and installTaskCreatedAt is stamped so
 * the stranded-part reminders clear themselves.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!requireRole(user.role, ['shop_coordinator'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const vehicle = await prisma.vehicle.findUnique({
    where: { id },
    select: { id: true, stockNumber: true, status: true },
  })
  if (!vehicle) return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const partIds: string[] | null = Array.isArray(body.partIds) ? body.partIds.filter((x: unknown) => typeof x === 'string') : null

  const parts = await prisma.part.findMany({
    where: {
      vehicleId: id,
      status: 'received',
      installTaskCreatedAt: null,
      ...(partIds ? { id: { in: partIds } } : {}),
    },
    select: { id: true, name: true },
  })
  if (parts.length === 0) {
    return NextResponse.json({ error: 'No received parts without an install task on this car.' }, { status: 400 })
  }

  // Car physically at an external shop? The install can't happen until it's
  // back — and the return-routing flow already picks these parts up.
  const openExternal = await prisma.externalRepair.findFirst({
    where: { stockNumber: vehicle.stockNumber, status: { in: ['sent', 'in_progress', 'ready'] }, partOnly: false },
    select: { shopName: true, expectedReturn: true },
  })
  if (openExternal) {
    return NextResponse.json({
      code: 'external',
      shop: openExternal.shopName,
      expectedBack: openExternal.expectedReturn?.toISOString().slice(0, 10) ?? null,
      error: `Car is at ${openExternal.shopName} — the install is queued and will surface in routing when it returns.`,
    }, { status: 409 })
  }

  const activeStage = await prisma.vehicleStage.findFirst({
    where: { vehicleId: id, status: { in: ['pending', 'in_progress'] } },
    orderBy: { startedAt: 'desc' },
    select: { id: true, stage: true, checklist: true },
  })

  const installItem = (name: string) => ({
    item: `Install: ${name}`, done: false, note: '',
    addedByMechanic: true, approved: 'approved',
    assigneeId: null, assigneeName: null, fromPart: true,
  })

  if (activeStage && activeStage.stage !== 'mechanic') {
    return NextResponse.json({
      code: 'in_recon',
      stage: activeStage.stage,
      error: `Car is in recon at ${activeStage.stage} — route it to mechanic to do the install.`,
    }, { status: 409 })
  }

  if (activeStage) {
    // Active mechanic stage: append (skipping installs already on the list).
    const existing = Array.isArray(activeStage.checklist) ? activeStage.checklist as Array<Record<string, unknown>> : []
    const have = new Set(existing.map(c => String(c?.item ?? '').trim().toLowerCase()))
    const fresh = parts.filter(p => !have.has(`install: ${p.name}`.trim().toLowerCase()))
    if (fresh.length > 0) {
      await prisma.vehicleStage.update({
        where: { id: activeStage.id },
        data: { checklist: [...existing, ...fresh.map(p => installItem(p.name))] as object[] },
      })
    }
    await prisma.part.updateMany({ where: { id: { in: parts.map(p => p.id) } }, data: { installTaskCreatedAt: new Date() } })
    await prisma.activityLog.create({
      data: {
        entityType: 'vehicle', entityId: id, action: 'install_tasks_added', actorId: user.id,
        details: { stockNumber: vehicle.stockNumber, parts: parts.map(p => p.name), mode: 'appended' },
      },
    }).catch(() => {})
    return NextResponse.json({ ok: true, mode: 'appended', count: parts.length })
  }

  // No active stage: put the car into recon at mechanic with the installs as
  // its checklist. Mirrors the promote/restart flows (close strays, end of lane).
  const config = await prisma.stageConfig.findUnique({ where: { stage: 'mechanic' } })
  const maxPriority = await prisma.vehicleStage.aggregate({
    where: { stage: 'mechanic', status: { notIn: ['done', 'skipped'] } },
    _max: { priority: true },
  })
  await prisma.$transaction(async (tx) => {
    await tx.vehicleStage.updateMany({
      where: { vehicleId: id, status: { notIn: ['done', 'skipped'] } },
      data: { status: 'skipped', completedAt: new Date() },
    })
    const stage = await tx.vehicleStage.create({
      data: {
        vehicleId: id,
        stage: 'mechanic',
        status: 'pending',
        assigneeId: config?.defaultAssigneeId || null,
        checklist: parts.map(p => installItem(p.name)),
        priority: (maxPriority._max.priority ?? -1) + 1,
        notes: 'Arrived part install (sent from dashboard)',
      },
    })
    await tx.vehicle.update({
      where: { id },
      data: { status: 'mechanic', currentStageId: stage.id, currentAssigneeId: config?.defaultAssigneeId || null, completedAt: null },
    })
    await tx.part.updateMany({ where: { id: { in: parts.map(p => p.id) } }, data: { installTaskCreatedAt: new Date() } })
    await tx.activityLog.create({
      data: {
        entityType: 'vehicle', entityId: id, action: 'sent_to_mechanic_for_install', actorId: user.id,
        details: { stockNumber: vehicle.stockNumber, parts: parts.map(p => p.name), previousStatus: vehicle.status },
      },
    })
  })
  await recomputeInventoryStatus(vehicle.stockNumber).catch(() => {})

  return NextResponse.json({ ok: true, mode: 'created', count: parts.length })
}
