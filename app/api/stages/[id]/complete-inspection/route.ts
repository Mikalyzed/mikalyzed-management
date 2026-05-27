import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { sendNotificationEmail } from '@/lib/email'
import { inspectionReportEmail } from '@/lib/email-templates'
import { recomputeInventoryStatus } from '@/lib/inventory-status'
import { notifyStageReadyForRouting } from '@/lib/stage-notifications'

const REPORT_RECIPIENT = process.env.INSPECTION_REPORT_EMAIL || 'ab-management@mikalyzedautoboutique.com'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const stage = await prisma.vehicleStage.findUnique({
    where: { id },
    include: {
      vehicle: { select: { id: true, stockNumber: true, year: true, make: true, model: true, currentStageId: true } },
      assignee: { select: { name: true } },
    },
  })
  if (!stage) return NextResponse.json({ error: 'Stage not found' }, { status: 404 })

  if (stage.assigneeId !== user.id && user.role !== 'admin') {
    return NextResponse.json({ error: 'Not authorized to complete this stage' }, { status: 403 })
  }

  if (stage.vehicle.currentStageId !== stage.id) {
    return NextResponse.json({ error: 'This is not the current stage' }, { status: 400 })
  }

  const checklist = (stage.checklist as Array<{
    item: string; done: boolean; note?: string; type?: string;
    data?: Record<string, unknown>; addedByMechanic?: boolean;
    approved?: string; estimatedHours?: number;
  }>) || []

  const inspectionItems = checklist.filter(c => !c.addedByMechanic)
  const followUps = checklist
    .filter(c => c.addedByMechanic)
    .map(c => ({
      item: c.item,
      estimatedHours: c.estimatedHours ?? null,
      approved: c.approved,
      done: c.done,
    }))

  const undone = inspectionItems.filter(c => !c.done)
  if (undone.length > 0) {
    return NextResponse.json({
      error: 'Inspection incomplete',
      message: `${undone.length} task(s) still need to be checked off.`,
      undone: undone.map(c => c.item),
    }, { status: 400 })
  }

  const vehicleDesc = `${stage.vehicle.year ?? ''} ${stage.vehicle.make} ${stage.vehicle.model}`.trim()
  const { subject, html } = inspectionReportEmail({
    vehicleDesc,
    stockNumber: stage.vehicle.stockNumber,
    mechanicName: stage.assignee?.name || user.name,
    vehicleId: stage.vehicle.id,
    checklist: inspectionItems,
    followUps,
  })

  // Fire-and-forget the email so a slow Resend response doesn't block stage completion
  sendNotificationEmail({ to: REPORT_RECIPIENT, subject, html }).catch((e) => console.error('[inspection email]', e))

  // Mark the stage done + park vehicle in awaiting_routing
  await prisma.$transaction(async (tx) => {
    await tx.vehicleStage.update({
      where: { id },
      data: { status: 'done', completedAt: new Date(), timerStartedAt: null },
    })
    await tx.vehicle.update({
      where: { id: stage.vehicleId },
      data: { status: 'awaiting_routing', currentAssigneeId: null },
    })
    await tx.activityLog.create({
      data: {
        entityType: 'vehicle',
        entityId: stage.vehicleId,
        action: 'inspection_completed',
        actorId: user.id,
        details: { stage: stage.stage, taskCount: inspectionItems.length },
      },
    }).catch(() => {})
  })

  await recomputeInventoryStatus(stage.vehicle.stockNumber).catch(() => {})

  // Notify admins if there's anything they need to review before routing
  notifyStageReadyForRouting({
    stageId: id,
    vehicleId: stage.vehicleId,
    vehicleStockNumber: stage.vehicle.stockNumber,
    vehicleDesc,
    triggeredByUserId: user.id,
  })

  return NextResponse.json({ success: true, awaitingRouting: true })
}
