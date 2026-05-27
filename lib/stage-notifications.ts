import { prisma } from './db'
import { summarizeReview, findPendingInstallParts, type ChecklistItem } from './inspection-issues'

const STAGE_LABELS: Record<string, string> = {
  mechanic: 'Mechanic',
  detailing: 'Detailing',
  content: 'Content',
  publish: 'Publish',
}

/**
 * Fires when a stage completes and the vehicle hits pending routing. Notifies
 * all admin users only when there's something they need to review — issues
 * flagged on the checklist, mechanic-added tasks, or pending install parts.
 *
 * If everything is clean (normal stage completion with no issues and no
 * pending parts), no notification fires.
 *
 * Fire-and-forget — caller doesn't need to await.
 */
export async function notifyStageReadyForRouting(args: {
  stageId: string
  vehicleId: string
  vehicleStockNumber: string
  vehicleDesc: string
  triggeredByUserId: string
}): Promise<void> {
  try {
    const [stage, pendingParts] = await Promise.all([
      prisma.vehicleStage.findUnique({
        where: { id: args.stageId },
        select: { stage: true, checklist: true },
      }),
      findPendingInstallParts(prisma, args.vehicleId),
    ])

    if (!stage) return

    const checklist = (stage.checklist as ChecklistItem[]) || []
    const { issueCount, addedTaskCount, hasAnything } = summarizeReview(checklist)
    const pendingPartCount = pendingParts.length

    if (!hasAnything && pendingPartCount === 0) return

    const stageLabel = STAGE_LABELS[stage.stage] || stage.stage

    const bits: string[] = []
    if (issueCount > 0) bits.push(`${issueCount} issue${issueCount === 1 ? '' : 's'}`)
    if (addedTaskCount > 0) bits.push(`${addedTaskCount} added task${addedTaskCount === 1 ? '' : 's'}`)
    if (pendingPartCount > 0) bits.push(`${pendingPartCount} part${pendingPartCount === 1 ? '' : 's'} to install`)

    const title = `${args.vehicleStockNumber} ready to route — ${bits.join(' · ')}`
    const message = `${args.vehicleDesc} completed ${stageLabel}. Review and route.`

    const admins = await prisma.user.findMany({
      where: { role: 'admin', isActive: true },
      select: { id: true },
    })

    const recipientIds = admins.map(a => a.id).filter(id => id !== args.triggeredByUserId)
    if (recipientIds.length === 0) return

    await prisma.notification.createMany({
      data: recipientIds.map(userId => ({
        userId,
        type: 'stage_ready_for_routing',
        title,
        message,
        entityType: 'vehicle',
        entityId: args.vehicleId,
      })),
    })
  } catch (e) {
    console.error('[notifyStageReadyForRouting]', e)
  }
}
