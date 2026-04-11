import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { NEXT_STAGE, DEFAULT_CHECKLISTS, STAGE_LABELS } from '@/lib/constants'
import type { Stage } from '@/lib/constants'
import { sendNotificationEmail } from '@/lib/email'
import { stageAdvanceEmail } from '@/lib/email-templates'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // Optional body for next stage configuration
  let body: { dueDate?: string; scopeName?: string; checklist?: { item: string; done: boolean; note: string }[]; estimatedHours?: number | null } = {}
  try { body = await request.json() } catch { /* no body is fine */ }

  const stage = await prisma.vehicleStage.findUnique({
    where: { id },
    include: { vehicle: true },
  })

  if (!stage) return NextResponse.json({ error: 'Stage not found' }, { status: 404 })

  // Only assigned user or admin can advance
  if (stage.assigneeId !== user.id && user.role !== 'admin') {
    return NextResponse.json({ error: 'Not authorized to advance this stage' }, { status: 403 })
  }

  // Must be current stage
  if (stage.vehicle.currentStageId !== stage.id) {
    return NextResponse.json({ error: 'This is not the current stage' }, { status: 400 })
  }

  // Check if this vehicle has a return queue entry for this stage
  const returnQueue = (stage.vehicle.returnQueue as any[]) || []
  const returnEntry = returnQueue.find((r: any) => r.fromStage === stage.stage)

  // If there's a return entry, go back to that stage instead of forward
  const nextStage = returnEntry ? returnEntry.stage : NEXT_STAGE[stage.stage as Stage]

  await prisma.$transaction(async (tx) => {
    // Mark current stage done
    await tx.vehicleStage.update({
      where: { id },
      data: { status: 'done', completedAt: new Date() },
    })

    // Remove the return entry from the queue if we used it
    if (returnEntry) {
      const updatedQueue = returnQueue.filter((r: any) => r !== returnEntry)
      await tx.vehicle.update({
        where: { id: stage.vehicleId },
        data: { returnQueue: updatedQueue },
      })
    }

    if (nextStage === 'completed') {
      // Vehicle is fully done
      await tx.vehicle.update({
        where: { id: stage.vehicleId },
        data: {
          status: 'completed',
          completedAt: new Date(),
          currentStageId: null,
          currentAssigneeId: null,
        },
      })
    } else if (returnEntry) {
      // Returning to previous stage — reactivate the skipped stage
      const skippedStage = await tx.vehicleStage.findFirst({
        where: { vehicleId: stage.vehicleId, stage: nextStage, status: 'skipped' },
        orderBy: { createdAt: 'desc' },
      })

      if (skippedStage) {
        // Reactivate the skipped stage with its remaining tasks
        await tx.vehicleStage.update({
          where: { id: skippedStage.id },
          data: { status: 'pending', completedAt: null },
        })

        await tx.vehicle.update({
          where: { id: stage.vehicleId },
          data: {
            status: nextStage,
            currentStageId: skippedStage.id,
            currentAssigneeId: skippedStage.assigneeId,
          },
        })
      } else {
        // No skipped stage found, create a new one with uncompleted tasks
        const config = await tx.stageConfig.findUnique({ where: { stage: nextStage } })
        const checklist = returnEntry.uncompletedTasks ||
          (DEFAULT_CHECKLISTS[nextStage as Stage] || []).map((item: string) => ({ item, done: false, note: '' }))

        const maxPriority = await tx.vehicleStage.aggregate({
          where: { stage: nextStage, status: { notIn: ['done', 'skipped'] } },
          _max: { priority: true },
        })

        const newStage = await tx.vehicleStage.create({
          data: {
            vehicleId: stage.vehicleId,
            stage: nextStage,
            status: 'pending',
            assigneeId: config?.defaultAssigneeId || null,
            checklist,
            priority: (maxPriority._max.priority ?? -1) + 1,
          },
        })

        await tx.vehicle.update({
          where: { id: stage.vehicleId },
          data: {
            status: nextStage,
            currentStageId: newStage.id,
            currentAssigneeId: config?.defaultAssigneeId || null,
          },
        })
      }
    } else {
      // Normal advance — create next stage
      const config = await tx.stageConfig.findUnique({ where: { stage: nextStage } })

      // Use custom checklist from body (scope template), or fall back to defaults
      let checklist: { item: string; done: boolean; note: string }[]
      if (body.checklist && body.checklist.length > 0) {
        checklist = body.checklist
      } else {
        const checklistItems = (config?.defaultChecklist as string[] | undefined)?.length
          ? config!.defaultChecklist as string[]
          : DEFAULT_CHECKLISTS[nextStage as Stage] || []
        checklist = checklistItems.map((item: string) => ({
          item, done: false, note: '',
        }))
      }

      // Place at bottom of next stage (highest priority + 1)
      const maxPriority = await tx.vehicleStage.aggregate({
        where: { stage: nextStage, status: { notIn: ['done', 'skipped'] } },
        _max: { priority: true },
      })
      const bottomPriority = (maxPriority._max.priority ?? -1) + 1

      const newStage = await tx.vehicleStage.create({
        data: {
          vehicleId: stage.vehicleId,
          stage: nextStage,
          status: 'pending',
          assigneeId: config?.defaultAssigneeId || null,
          checklist,
          dueDate: body.dueDate ? new Date(body.dueDate) : null,
          scopeName: body.scopeName || null,
          estimatedHours: body.estimatedHours ?? null,
          priority: bottomPriority,
        },
      })

      await tx.vehicle.update({
        where: { id: stage.vehicleId },
        data: {
          status: nextStage,
          currentStageId: newStage.id,
          currentAssigneeId: config?.defaultAssigneeId || null,
        },
      })
    }

    // Log
    await tx.activityLog.create({
      data: {
        entityType: 'vehicle',
        entityId: stage.vehicleId,
        action: 'stage_advanced',
        actorId: user.id,
        details: { from: stage.stage, to: nextStage },
      },
    })
  })

  // Fire-and-forget: email + in-app notification for next stage assignee
  if (nextStage !== 'completed') {
    const newStageRecord = await prisma.vehicleStage.findFirst({
      where: { vehicleId: stage.vehicleId, stage: nextStage },
      orderBy: { createdAt: 'desc' },
      include: { assignee: true, vehicle: true },
    })
    if (newStageRecord?.assignee) {
      const vehicleDesc = `${stage.vehicle.year ?? ''} ${stage.vehicle.make} ${stage.vehicle.model} (${stage.vehicle.stockNumber})`.trim()
      const fromLabel = STAGE_LABELS[stage.stage as Stage] || stage.stage
      const toLabel = STAGE_LABELS[nextStage as Stage] || nextStage
      const { subject, html } = stageAdvanceEmail({
        vehicleDesc,
        fromStage: fromLabel,
        toStage: toLabel,
        assigneeName: newStageRecord.assignee.name,
        vehicleId: stage.vehicleId,
      })
      // Send email (don't await)
      sendNotificationEmail({ to: newStageRecord.assignee.email, subject, html }).catch(() => {})
      // In-app notification
      prisma.notification.create({
        data: {
          userId: newStageRecord.assignee.id,
          type: 'stage_advance',
          title: subject,
          message: `${vehicleDesc} moved from ${fromLabel} to ${toLabel}`,
          entityType: 'vehicle',
          entityId: stage.vehicleId,
        },
      }).catch(() => {})
    }
  }

  return NextResponse.json({ success: true, nextStage })
}
