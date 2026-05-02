import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, requireRole } from '@/lib/auth'
import { DEFAULT_CHECKLISTS } from '@/lib/constants'
import type { Stage } from '@/lib/constants'
import { recomputeInventoryStatus } from '@/lib/inventory-status'

const VALID_NEXT = ['mechanic', 'detailing', 'content', 'publish', 'completed'] as const
type NextStage = typeof VALID_NEXT[number]

/**
 * Admin routes a vehicle that's awaiting routing.
 * Either creates a new stage of the chosen type or marks the vehicle completed.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!requireRole(user.role, ['admin'])) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const nextStage = body.nextStage as NextStage | undefined
  const reason = (body.reason as string | undefined)?.trim() || null
  const customTasks = Array.isArray(body.tasks)
    ? (body.tasks as string[]).map(t => String(t).trim()).filter(Boolean)
    : null
  const estimatedHours = body.estimatedHours != null && body.estimatedHours !== ''
    ? parseFloat(String(body.estimatedHours))
    : null
  const soldDelivery = !!body.soldDelivery && nextStage === 'detailing'

  const SOLD_DELIVERY_TASKS = [
    'Floor mats placed in vehicle',
    'Gift box placed in vehicle',
    'Air freshener',
    'Full interior + exterior clean',
  ]

  if (!nextStage || !VALID_NEXT.includes(nextStage)) {
    return NextResponse.json({ error: 'nextStage must be one of: ' + VALID_NEXT.join(', ') }, { status: 400 })
  }

  const vehicle = await prisma.vehicle.findUnique({
    where: { id },
    select: { id: true, stockNumber: true, status: true },
  })
  if (!vehicle) return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 })

  if (nextStage === 'completed') {
    await prisma.$transaction(async (tx) => {
      await tx.vehicle.update({
        where: { id },
        data: {
          status: 'completed',
          completedAt: new Date(),
          currentStageId: null,
          currentAssigneeId: null,
        },
      })
      await tx.activityLog.create({
        data: {
          entityType: 'vehicle',
          entityId: id,
          action: 'routed',
          actorId: user.id,
          details: { to: 'completed', reason },
        },
      }).catch(() => {})
    })
    await recomputeInventoryStatus(vehicle.stockNumber).catch(() => {})
    return NextResponse.json({ success: true, nextStage: 'completed' })
  }

  // Create new stage
  const config = await prisma.stageConfig.findUnique({ where: { stage: nextStage } })
  const baseTasks = customTasks && customTasks.length > 0
    ? customTasks
    : (config?.defaultChecklist as string[] | undefined)?.length
      ? (config!.defaultChecklist as string[])
      : DEFAULT_CHECKLISTS[nextStage as Stage] || []
  // Sold delivery: replace defaults with the sold prep checklist (admin-supplied custom tasks still override)
  const tasks = soldDelivery
    ? (customTasks && customTasks.length > 0 ? customTasks : SOLD_DELIVERY_TASKS)
    : baseTasks
  const checklist = tasks.map((item: string) => ({ item, done: false, note: '' }))

  await prisma.$transaction(async (tx) => {
    const maxPriority = await tx.vehicleStage.aggregate({
      where: { stage: nextStage, status: { notIn: ['done', 'skipped'] } },
      _max: { priority: true },
    })

    const newStage = await tx.vehicleStage.create({
      data: {
        vehicleId: id,
        stage: nextStage,
        status: 'pending',
        assigneeId: config?.defaultAssigneeId || null,
        checklist,
        priority: (maxPriority._max.priority ?? -1) + 1,
        estimatedHours,
        scopeName: soldDelivery ? 'Sold Delivery' : null,
      },
    })

    await tx.vehicle.update({
      where: { id },
      data: {
        status: nextStage,
        currentStageId: newStage.id,
        currentAssigneeId: config?.defaultAssigneeId || null,
      },
    })

    await tx.activityLog.create({
      data: {
        entityType: 'vehicle',
        entityId: id,
        action: 'routed',
        actorId: user.id,
        details: { to: nextStage, reason },
      },
    }).catch(() => {})
  })

  await recomputeInventoryStatus(vehicle.stockNumber).catch(() => {})

  return NextResponse.json({ success: true, nextStage })
}
