import { prisma } from '@/lib/db'

/**
 * A part has come back from external WORK (e.g. upholstery) and now needs to be
 * installed IN-HOUSE. If the car is actively in a mechanic stage, drop an
 * unassigned "Install: <part>" task onto its checklist. Otherwise clear the
 * part's install stamp so it re-surfaces on the "No Install Plan" queue (car not
 * in recon) for someone to route into mechanic. Mirrors the parts-received
 * in-house install branch in app/api/parts/[id]/route.ts.
 */
export async function queuePartInstallOnReturn(partId: string, actorId: string) {
  const part = await prisma.part.findUnique({
    where: { id: partId },
    include: { vehicle: { select: { id: true, stockNumber: true, currentStageId: true } } },
  })
  if (!part) return

  const stage = part.vehicle.currentStageId
    ? await prisma.vehicleStage.findUnique({
        where: { id: part.vehicle.currentStageId },
        select: { id: true, stage: true, status: true, checklist: true },
      })
    : null
  const inMechanic = !!stage && stage.stage === 'mechanic' && stage.status !== 'done' && stage.status !== 'skipped'

  if (inMechanic && stage) {
    const existing = Array.isArray(stage.checklist) ? (stage.checklist as Array<Record<string, unknown>>) : []
    const taskName = `Install: ${part.name}`
    const alreadyOnList = existing.some(c => typeof c?.item === 'string' && (c.item as string).trim().toLowerCase() === taskName.trim().toLowerCase())
    if (!alreadyOnList) {
      await prisma.vehicleStage.update({
        where: { id: stage.id },
        data: { checklist: [...existing, {
          item: taskName, done: false, note: '',
          addedByMechanic: true, approved: 'approved',
          assigneeId: null, assigneeName: null, fromPart: true,
        }] as unknown as import('@prisma/client').Prisma.InputJsonValue },
      })
    }
    await prisma.part.update({ where: { id: partId }, data: { installTaskCreatedAt: new Date() } })
  } else {
    // No active mechanic stage → re-surface it on the "No Install Plan" queue so
    // the car gets routed into recon to install it, and log a follow-up.
    await prisma.part.update({ where: { id: partId }, data: { installTaskCreatedAt: null } })
    const title = `Part back from repair — #${part.vehicle.stockNumber}: ${part.name} (install it)`.slice(0, 200)
    const dup = await prisma.task.findFirst({ where: { title, status: { not: 'done' } }, select: { id: true } })
    if (!dup) {
      await prisma.task.create({
        data: {
          title,
          description: 'The part is back from external work. Route the car into mechanic recon to install it.',
          category: 'admin', priority: 1,
          createdById: actorId,
          stockNumbers: [part.vehicle.stockNumber],
        },
      }).catch(() => {})
    }
  }

  await prisma.activityLog.create({
    data: {
      entityType: 'part', entityId: partId, action: 'part_returned_for_install', actorId,
      details: { partName: part.name, stockNumber: part.vehicle.stockNumber, queuedToMechanic: inMechanic },
    },
  }).catch(() => {})
}
