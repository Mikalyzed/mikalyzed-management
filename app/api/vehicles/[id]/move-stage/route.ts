import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { STAGES, DEFAULT_CHECKLISTS, STAGE_LABELS } from '@/lib/constants'
import type { Stage } from '@/lib/constants'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const { id: vehicleId } = await params
  const { targetStage, checklist: customChecklist, assigneeId: customAssigneeId } = await req.json()

  if (!STAGES.includes(targetStage) && targetStage !== 'completed') {
    return NextResponse.json({ error: 'Invalid stage' }, { status: 400 })
  }

  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    include: { stages: { orderBy: { createdAt: 'desc' } } },
  })

  if (!vehicle) return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 })

  const currentStage = vehicle.stages.find(s => s.id === vehicle.currentStageId)

  if (currentStage?.stage === targetStage) {
    return NextResponse.json({ error: 'Already in that stage' }, { status: 400 })
  }

  await prisma.$transaction(async (tx) => {
    // Mark current stage as done
    if (currentStage) {
      await tx.vehicleStage.update({
        where: { id: currentStage.id },
        data: { status: 'done', completedAt: new Date() },
      })
    }

    if (targetStage === 'completed') {
      await tx.vehicle.update({
        where: { id: vehicleId },
        data: {
          status: 'completed',
          completedAt: new Date(),
          currentStageId: null,
          currentAssigneeId: null,
        },
      })
    } else {
      // Get stage config for defaults
      const config = await tx.stageConfig.findUnique({ where: { stage: targetStage } })

      // Use custom checklist if provided, otherwise fall back to config/defaults
      let checklist
      if (customChecklist && Array.isArray(customChecklist) && customChecklist.length > 0) {
        checklist = customChecklist
      } else {
        const checklistItems = (config?.defaultChecklist as string[] | undefined)?.length
          ? config!.defaultChecklist as string[]
          : DEFAULT_CHECKLISTS[targetStage as Stage] || []
        checklist = checklistItems.map((item: string) => ({ item, done: false, note: '' }))
      }

      // Use custom assignee if provided (including explicit null for unassigned)
      const assigneeId = customAssigneeId !== undefined ? (customAssigneeId || null) : (config?.defaultAssigneeId || null)

      const newStage = await tx.vehicleStage.create({
        data: {
          vehicleId,
          stage: targetStage,
          status: 'pending',
          assigneeId,
          checklist,
        },
      })

      await tx.vehicle.update({
        where: { id: vehicleId },
        data: {
          status: targetStage,
          currentStageId: newStage.id,
          currentAssigneeId: assigneeId,
        },
      })
    }

    // Log
    await tx.activityLog.create({
      data: {
        entityType: 'vehicle',
        entityId: vehicleId,
        action: 'stage_moved',
        actorId: user.id,
        details: { from: currentStage?.stage || 'unknown', to: targetStage },
      },
    })
  })

  return NextResponse.json({ success: true })
}
