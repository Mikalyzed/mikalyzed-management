import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { NEXT_STAGE, DEFAULT_CHECKLISTS } from '@/lib/constants'
import type { Stage } from '@/lib/constants'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

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

  const nextStage = NEXT_STAGE[stage.stage as Stage]

  await prisma.$transaction(async (tx) => {
    // Mark current stage done
    await tx.vehicleStage.update({
      where: { id },
      data: { status: 'done', completedAt: new Date() },
    })

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
    } else {
      // Create next stage
      const config = await tx.stageConfig.findUnique({ where: { stage: nextStage } })
      const checklist = DEFAULT_CHECKLISTS[nextStage as Stage]?.map((item) => ({
        item, done: false, note: '',
      })) || []

      const newStage = await tx.vehicleStage.create({
        data: {
          vehicleId: stage.vehicleId,
          stage: nextStage,
          status: 'pending',
          assigneeId: config?.defaultAssigneeId || null,
          checklist,
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

  return NextResponse.json({ success: true, nextStage })
}
