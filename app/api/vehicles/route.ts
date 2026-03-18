import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, requireRole } from '@/lib/auth'
import { DEFAULT_CHECKLISTS, STAGE_LABELS } from '@/lib/constants'
import { sendNotificationEmail } from '@/lib/email'
import { newVehicleEmail } from '@/lib/email-templates'

export async function GET(request: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const assignee = searchParams.get('assignee')

  const where: Record<string, unknown> = {}
  if (status) where.status = status
  if (assignee) where.currentAssigneeId = assignee

  const vehicles = await prisma.vehicle.findMany({
    where,
    include: {
      currentAssignee: { select: { id: true, name: true } },
      stages: {
        where: { status: { not: 'done' } },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Sort vehicles by their current stage priority
  vehicles.sort((a, b) => {
    const aPriority = a.stages[0]?.priority ?? 999999
    const bPriority = b.stages[0]?.priority ?? 999999
    return aPriority - bPriority
  })

  return NextResponse.json({ vehicles })
}

export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!requireRole(user.role, ['admin'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { stockNumber, vin, year, make, model, color, trim, notes, assigneeId, mechanicChecklist } = body

  if (!stockNumber || !make || !model) {
    return NextResponse.json({ error: 'Stock number, make, and model are required' }, { status: 400 })
  }

  // Check for duplicate stock number
  const existing = await prisma.vehicle.findUnique({ where: { stockNumber } })
  if (existing) {
    return NextResponse.json({ error: 'Stock number already exists' }, { status: 409 })
  }

  // Determine assignee — use provided, or find default mechanic
  let mechAssigneeId = assigneeId
  if (!mechAssigneeId) {
    const config = await prisma.stageConfig.findUnique({ where: { stage: 'mechanic' } })
    mechAssigneeId = config?.defaultAssigneeId || null
  }

  // Create vehicle + first stage in transaction
  const vehicle = await prisma.$transaction(async (tx) => {
    const v = await tx.vehicle.create({
      data: {
        stockNumber,
        vin: vin || null,
        year: year ? parseInt(year) : null,
        make,
        model,
        color: color || null,
        trim: trim || null,
        notes: notes || null,
        status: 'mechanic',
        currentAssigneeId: mechAssigneeId,
        createdById: user.id,
      },
    })

    // Create mechanic stage with custom or default checklist
    const mechConfig = await tx.stageConfig.findUnique({ where: { stage: 'mechanic' } })
    const configChecklist = (mechConfig?.defaultChecklist as string[] | undefined)?.length
      ? mechConfig!.defaultChecklist as string[]
      : null
    const checklistItems = mechanicChecklist && mechanicChecklist.length > 0
      ? mechanicChecklist
      : configChecklist || DEFAULT_CHECKLISTS.mechanic
    const checklist = checklistItems.map((item: string) => ({
      item,
      done: false,
      note: '',
    }))

    // Set priority to max + 1 so new vehicles go to bottom
    const maxPriority = await tx.vehicleStage.aggregate({
      where: { stage: 'mechanic', status: { not: 'done' } },
      _max: { priority: true },
    })
    const nextPriority = (maxPriority._max.priority ?? -1) + 1

    const stage = await tx.vehicleStage.create({
      data: {
        vehicleId: v.id,
        stage: 'mechanic',
        status: mechAssigneeId ? 'pending' : 'pending',
        assigneeId: mechAssigneeId,
        checklist,
        priority: nextPriority,
      },
    })

    // Update vehicle with current stage
    await tx.vehicle.update({
      where: { id: v.id },
      data: { currentStageId: stage.id },
    })

    // Log activity
    await tx.activityLog.create({
      data: {
        entityType: 'vehicle',
        entityId: v.id,
        action: 'created',
        actorId: user.id,
        details: { stockNumber, make, model },
      },
    })

    return v
  })

  // Fire-and-forget: notify assignee
  if (mechAssigneeId) {
    prisma.user.findUnique({ where: { id: mechAssigneeId } }).then((assignee) => {
      if (!assignee) return
      const vehicleDesc = `${year ?? ''} ${make} ${model} (${stockNumber})`.trim()
      const { subject, html } = newVehicleEmail({
        vehicleDesc,
        assigneeName: assignee.name,
        stage: STAGE_LABELS.mechanic,
        vehicleId: vehicle.id,
      })
      sendNotificationEmail({ to: assignee.email, subject, html }).catch(() => {})
      prisma.notification.create({
        data: {
          userId: assignee.id,
          type: 'new_vehicle',
          title: subject,
          message: `${vehicleDesc} added to ${STAGE_LABELS.mechanic}`,
          entityType: 'vehicle',
          entityId: vehicle.id,
        },
      }).catch(() => {})
    }).catch(() => {})
  }

  return NextResponse.json({ vehicle }, { status: 201 })
}
