import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, requireRole } from '@/lib/auth'
import { DEFAULT_CHECKLISTS } from '@/lib/constants'
import type { Stage } from '@/lib/constants'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!requireRole(user.role, ['admin'])) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const { id } = await params

  const vehicle = await prisma.vehicle.findUnique({
    where: { id },
    include: { stages: true },
  })

  if (!vehicle) return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 })
  if (vehicle.status !== 'completed') {
    return NextResponse.json({ error: 'Vehicle is not completed' }, { status: 400 })
  }

  let body: { reason?: string } = {}
  try { body = await request.json() } catch { /* ok */ }

  const firstStage: Stage = 'mechanic'
  const config = await prisma.stageConfig.findUnique({ where: { stage: firstStage } })
  const checklistItems = (config?.defaultChecklist as string[] | undefined)?.length
    ? config!.defaultChecklist as string[]
    : DEFAULT_CHECKLISTS[firstStage] || []
  const checklist = checklistItems.map((item: string) => ({ item, done: false, note: '' }))

  await prisma.$transaction(async (tx) => {
    // Create new first stage
    const newStage = await tx.vehicleStage.create({
      data: {
        vehicleId: id,
        stage: firstStage,
        status: 'pending',
        assigneeId: config?.defaultAssigneeId || null,
        checklist,
      },
    })

    // Reset vehicle status
    await tx.vehicle.update({
      where: { id },
      data: {
        status: firstStage,
        completedAt: null,
        currentStageId: newStage.id,
        currentAssigneeId: config?.defaultAssigneeId || null,
      },
    })

    // Log the restart
    await tx.activityLog.create({
      data: {
        entityType: 'vehicle',
        entityId: id,
        action: 'recon_restarted',
        actorId: user.id,
        details: { reason: body.reason || 'Restarted by admin', previousCompletedAt: vehicle.completedAt },
      },
    })
  })

  return NextResponse.json({ success: true })
}
