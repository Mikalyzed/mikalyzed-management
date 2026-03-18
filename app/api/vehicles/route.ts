import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, requireRole } from '@/lib/auth'
import { DEFAULT_CHECKLISTS } from '@/lib/constants'

export async function GET(request: Request) {
  const user = await getSessionUser(request)
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

  return NextResponse.json({ vehicles })
}

export async function POST(request: Request) {
  const user = await getSessionUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!requireRole(user.role, ['admin'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { stockNumber, vin, year, make, model, color, trim, notes, assigneeId } = body

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

    // Create mechanic stage
    const checklist = DEFAULT_CHECKLISTS.mechanic.map((item) => ({
      item,
      done: false,
      note: '',
    }))

    const stage = await tx.vehicleStage.create({
      data: {
        vehicleId: v.id,
        stage: 'mechanic',
        status: mechAssigneeId ? 'pending' : 'pending',
        assigneeId: mechAssigneeId,
        checklist,
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

  return NextResponse.json({ vehicle }, { status: 201 })
}
