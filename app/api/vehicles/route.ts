import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, requireRole } from '@/lib/auth'
import { DEFAULT_CHECKLISTS, STAGE_LABELS } from '@/lib/constants'
import { sendNotificationEmail } from '@/lib/email'
import { newVehicleEmail } from '@/lib/email-templates'
import { recomputeInventoryStatus } from '@/lib/inventory-status'

export async function GET(request: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const assignee = searchParams.get('assignee')
  const stockNumber = searchParams.get('stockNumber')

  const where: Record<string, unknown> = {}
  if (status) where.status = status
  if (assignee) where.currentAssigneeId = assignee
  if (stockNumber) where.stockNumber = stockNumber

  const vehicles = await prisma.vehicle.findMany({
    where,
    include: {
      currentAssignee: { select: { id: true, name: true } },
      stages: {
        where: { status: { notIn: ['done', 'skipped'] } },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          id: true, status: true, startedAt: true, totalBlockedSeconds: true,
          priority: true, estimatedHours: true, checklist: true, scopeName: true,
          awaitingParts: true, awaitingPartsName: true, pauseReason: true,
          timerStartedAt: true, autoPaused: true,
          assignee: { select: { id: true, name: true } },
        },
      },
      parts: {
        where: { status: { not: 'received' } },
        select: { status: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Pull inventory status (sold/in_stock/etc) for SOLD badges
  const stockNumbers = vehicles.map(v => v.stockNumber).filter(Boolean) as string[]
  const inventoryRows = stockNumbers.length > 0
    ? await prisma.inventoryVehicle.findMany({
        where: { stockNumber: { in: stockNumbers } },
        select: { stockNumber: true, status: true },
      })
    : []
  const invByStock = Object.fromEntries(inventoryRows.map(i => [i.stockNumber, i.status]))

  // For routing UI: fetch the most recent completed stage for any awaiting_routing vehicles
  const awaitingIds = vehicles.filter(v => v.status === 'awaiting_routing').map(v => v.id)
  const lastCompletedByVehicle: Record<string, {
    stage: string; completedAt: Date | null; checklist: any; scopeName: string | null;
    assignee: { id: string; name: string } | null
  }> = {}
  if (awaitingIds.length > 0) {
    const lastDone = await prisma.vehicleStage.findMany({
      where: { vehicleId: { in: awaitingIds }, status: 'done' },
      orderBy: { completedAt: 'desc' },
      select: {
        vehicleId: true, stage: true, completedAt: true, checklist: true, scopeName: true,
        assignee: { select: { id: true, name: true } },
      },
    })
    for (const s of lastDone) {
      if (!lastCompletedByVehicle[s.vehicleId]) {
        lastCompletedByVehicle[s.vehicleId] = {
          stage: s.stage, completedAt: s.completedAt,
          checklist: s.checklist, scopeName: s.scopeName,
          assignee: s.assignee,
        }
      }
    }
  }

  // Sort vehicles by their current stage priority
  vehicles.sort((a, b) => {
    const aPriority = a.stages[0]?.priority ?? 999999
    const bPriority = b.stages[0]?.priority ?? 999999
    return aPriority - bPriority
  })

  // Compute parts status summary for each vehicle
  const vehiclesWithParts = vehicles.map(v => {
    const partStatuses = v.parts.map(p => p.status)
    let partsLabel = null
    if (partStatuses.includes('requested')) partsLabel = 'Parts need to be found'
    else if (partStatuses.includes('sourced')) partsLabel = 'Parts pending approval'
    else if (partStatuses.includes('ready_to_order')) partsLabel = 'Parts need to be ordered'
    else if (partStatuses.includes('ordered')) partsLabel = 'Parts ordered'
    return {
      ...v,
      partsLabel,
      partsCount: partStatuses.length,
      lastCompletedStage: lastCompletedByVehicle[v.id]?.stage || null,
      lastCompleted: lastCompletedByVehicle[v.id] || null,
      inventoryStatus: invByStock[v.stockNumber] || null,
    }
  })

  return NextResponse.json({ vehicles: vehiclesWithParts })
}

export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!requireRole(user.role, ['admin'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { stockNumber, vin, year, make, model, color, trim, notes, assigneeId, mechanicChecklist, startingStage: rawStartingStage, estimatedHours, soldDelivery: rawSoldDelivery } = body
  const validStages = ['mechanic', 'detailing', 'content', 'publish']
  const startingStage = validStages.includes(rawStartingStage) ? rawStartingStage : 'mechanic'
  const soldDelivery = !!rawSoldDelivery && startingStage === 'detailing'

  const SOLD_DELIVERY_TASKS = [
    'Floor mats placed in vehicle',
    'Gift box placed in vehicle',
    'Air freshener',
    'Full interior + exterior clean',
  ]

  if (!stockNumber || !make || !model) {
    return NextResponse.json({ error: 'Stock number, make, and model are required' }, { status: 400 })
  }

  // Check for duplicate stock number
  const existing = await prisma.vehicle.findUnique({ where: { stockNumber } })
  if (existing) {
    if (existing.status === 'external') {
      // Vehicle returning from external repair — re-enter recon
      let stageAssignee = assigneeId
      if (!stageAssignee) {
        const config = await prisma.stageConfig.findUnique({ where: { stage: startingStage } })
        stageAssignee = config?.defaultAssigneeId || null
      }

      const stageConfig = await prisma.stageConfig.findUnique({ where: { stage: startingStage } })
      const configChecklist = (stageConfig?.defaultChecklist as string[] | undefined)?.length
        ? stageConfig!.defaultChecklist as string[]
        : null
      let checklistItems = mechanicChecklist && mechanicChecklist.length > 0
        ? mechanicChecklist
        : configChecklist || DEFAULT_CHECKLISTS[startingStage as keyof typeof DEFAULT_CHECKLISTS] || ['Inspect & clear']
      if (soldDelivery) {
        checklistItems = mechanicChecklist && mechanicChecklist.length > 0
          ? mechanicChecklist
          : SOLD_DELIVERY_TASKS
      }
      const checklist = checklistItems.map((item: string) => ({ item, done: false, note: '' }))

      const maxPriority = await prisma.vehicleStage.aggregate({
        where: { stage: startingStage, status: { notIn: ['done', 'skipped'] } },
        _max: { priority: true },
      })
      const nextPriority = (maxPriority._max.priority ?? -1) + 1

      const vehicle = await prisma.$transaction(async (tx) => {
        // Update vehicle info
        await tx.vehicle.update({
          where: { id: existing.id },
          data: {
            year: year ? parseInt(year) : existing.year,
            make: make || existing.make,
            model: model || existing.model,
            color: color || existing.color,
            trim: trim || existing.trim,
            notes: notes || existing.notes,
            vin: vin || existing.vin,
          },
        })

        const stage = await tx.vehicleStage.create({
          data: {
            vehicleId: existing.id,
            stage: startingStage,
            status: 'pending',
            assigneeId: stageAssignee,
            checklist,
            priority: nextPriority,
            estimatedHours: estimatedHours ? parseFloat(estimatedHours) : null,
            scopeName: soldDelivery ? 'Sold Delivery' : null,
          },
        })

        const updated = await tx.vehicle.update({
          where: { id: existing.id },
          data: {
            status: startingStage,
            currentStageId: stage.id,
            currentAssigneeId: stageAssignee,
          },
        })

        await tx.activityLog.create({
          data: {
            entityType: 'vehicle',
            entityId: existing.id,
            action: 'returned_from_external',
            actorId: user.id,
            details: { stockNumber, stage: startingStage },
          },
        })

        return updated
      })

      return NextResponse.json({ vehicle }, { status: 201 })
    }
    if (existing.status === 'completed') {
      return NextResponse.json({
        error: 'completed',
        message: 'This vehicle has already completed the recon process.',
        vehicleId: existing.id,
        vehicle: `${existing.year ?? ''} ${existing.make} ${existing.model}`.trim(),
      }, { status: 409 })
    }
    return NextResponse.json({ error: 'Stock number already exists and is currently in recon.' }, { status: 409 })
  }

  // Determine assignee — use provided, or find default for starting stage
  let stageAssigneeId = assigneeId
  if (!stageAssigneeId) {
    const config = await prisma.stageConfig.findUnique({ where: { stage: startingStage } })
    stageAssigneeId = config?.defaultAssigneeId || null
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
        status: startingStage,
        currentAssigneeId: stageAssigneeId,
        createdById: user.id,
      },
    })

    // Create stage with custom or default checklist
    const stageConfig = await tx.stageConfig.findUnique({ where: { stage: startingStage } })
    const configChecklist = (stageConfig?.defaultChecklist as string[] | undefined)?.length
      ? stageConfig!.defaultChecklist as string[]
      : null
    let checklistItems = mechanicChecklist && mechanicChecklist.length > 0
      ? mechanicChecklist
      : configChecklist || DEFAULT_CHECKLISTS[startingStage as keyof typeof DEFAULT_CHECKLISTS] || ['Inspect & clear']
    if (soldDelivery) {
      checklistItems = mechanicChecklist && mechanicChecklist.length > 0
        ? mechanicChecklist
        : SOLD_DELIVERY_TASKS
    }
    const checklist = checklistItems.map((item: string) => ({
      item,
      done: false,
      note: '',
    }))

    // Set priority to max + 1 so new vehicles go to bottom
    const maxPriority = await tx.vehicleStage.aggregate({
      where: { stage: startingStage, status: { notIn: ['done', 'skipped'] } },
      _max: { priority: true },
    })
    const nextPriority = (maxPriority._max.priority ?? -1) + 1

    const stage = await tx.vehicleStage.create({
      data: {
        vehicleId: v.id,
        stage: startingStage,
        status: 'pending',
        assigneeId: stageAssigneeId,
        checklist,
        priority: nextPriority,
        estimatedHours: estimatedHours ? parseFloat(estimatedHours) : null,
        scopeName: soldDelivery ? 'Sold Delivery' : null,
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

  // Sync inventory status
  await recomputeInventoryStatus(stockNumber).catch(() => {})

  // Fire-and-forget: notify assignee
  if (stageAssigneeId) {
    prisma.user.findUnique({ where: { id: stageAssigneeId } }).then((assignee) => {
      if (!assignee) return
      const vehicleDesc = `${year ?? ''} ${make} ${model} (${stockNumber})`.trim()
      const { subject, html } = newVehicleEmail({
        vehicleDesc,
        assigneeName: assignee.name,
        stage: STAGE_LABELS[startingStage as keyof typeof STAGE_LABELS] || startingStage,
        vehicleId: vehicle.id,
      })
      sendNotificationEmail({ to: assignee.email, subject, html }).catch(() => {})
      prisma.notification.create({
        data: {
          userId: assignee.id,
          type: 'new_vehicle',
          title: subject,
          message: `${vehicleDesc} added to ${STAGE_LABELS[startingStage as keyof typeof STAGE_LABELS] || startingStage}`,
          entityType: 'vehicle',
          entityId: vehicle.id,
        },
      }).catch(() => {})
    }).catch(() => {})
  }

  return NextResponse.json({ vehicle }, { status: 201 })
}
