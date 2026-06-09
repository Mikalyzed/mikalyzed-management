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
          awaitingParts: true, awaitingPartsName: true, pauseReason: true, pauseDetail: true,
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
    id: string; stage: string; completedAt: Date | null; checklist: any; scopeName: string | null;
    assignee: { id: string; name: string } | null
  }> = {}
  const routeHistoryByVehicle: Record<string, { stage: string; status: string; completedAt: Date | null; scopeName: string | null }[]> = {}
  const pendingInstallsByVehicle: Record<string, { id: string; name: string; sourceItem: string | null; sourceSubField: string | null }[]> = {}
  const partsInPipelineByVehicle: Record<string, { id: string; name: string; status: string; sourceItem: string | null; sourceSubField: string | null }[]> = {}
  if (awaitingIds.length > 0) {
    const [lastDone, allDoneAsc, pendingInstalls, pipelineParts] = await Promise.all([
      prisma.vehicleStage.findMany({
        // Exclude orphaned stages (status='done' but no completedAt) — Postgres NULLS FIRST
        // in DESC would otherwise hoist them above legit recent completions.
        where: { vehicleId: { in: awaitingIds }, status: 'done', completedAt: { not: null } },
        orderBy: { completedAt: 'desc' },
        select: {
          id: true, vehicleId: true, stage: true, completedAt: true, checklist: true, scopeName: true,
          assignee: { select: { id: true, name: true } },
        },
      }),
      // Full route history (incl. skipped) in chronological order — used by the routing modal.
      // Same null-completedAt guard so the timeline doesn't include orphaned rows.
      prisma.vehicleStage.findMany({
        where: { vehicleId: { in: awaitingIds }, status: { in: ['done', 'skipped'] }, completedAt: { not: null } },
        orderBy: { completedAt: 'asc' },
        select: { vehicleId: true, stage: true, status: true, completedAt: true, scopeName: true },
      }),
      // Pending install = received but no install task yet generated
      prisma.part.findMany({
        where: { vehicleId: { in: awaitingIds }, status: 'received', installTaskCreatedAt: null },
        select: { id: true, vehicleId: true, name: true, sourceItem: true, sourceSubField: true },
      }),
      // Parts in pipeline = requested/sourced/ready_to_order/ordered (not yet received)
      prisma.part.findMany({
        where: { vehicleId: { in: awaitingIds }, status: { in: ['requested', 'sourced', 'ready_to_order', 'ordered'] } },
        select: { id: true, vehicleId: true, name: true, status: true, sourceItem: true, sourceSubField: true },
      }),
    ])
    for (const s of lastDone) {
      if (!lastCompletedByVehicle[s.vehicleId]) {
        lastCompletedByVehicle[s.vehicleId] = {
          id: s.id, stage: s.stage, completedAt: s.completedAt,
          checklist: s.checklist, scopeName: s.scopeName,
          assignee: s.assignee,
        }
      }
    }
    for (const s of allDoneAsc) {
      if (!routeHistoryByVehicle[s.vehicleId]) routeHistoryByVehicle[s.vehicleId] = []
      routeHistoryByVehicle[s.vehicleId].push({
        stage: s.stage, status: s.status, completedAt: s.completedAt, scopeName: s.scopeName,
      })
    }
    for (const p of pendingInstalls) {
      if (!pendingInstallsByVehicle[p.vehicleId]) pendingInstallsByVehicle[p.vehicleId] = []
      pendingInstallsByVehicle[p.vehicleId].push({ id: p.id, name: p.name.trim(), sourceItem: p.sourceItem, sourceSubField: p.sourceSubField })
    }
    for (const p of pipelineParts) {
      if (!partsInPipelineByVehicle[p.vehicleId]) partsInPipelineByVehicle[p.vehicleId] = []
      partsInPipelineByVehicle[p.vehicleId].push({ id: p.id, name: p.name.trim(), status: p.status, sourceItem: p.sourceItem, sourceSubField: p.sourceSubField })
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
      routeHistory: routeHistoryByVehicle[v.id] || [],
      pendingInstalls: pendingInstallsByVehicle[v.id] || [],
      partsInPipeline: partsInPipelineByVehicle[v.id] || [],
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
  const { stockNumber, vin, year, make, model, color, trim, notes, assigneeId, mechanicChecklist, startingStage: rawStartingStage, estimatedHours, soldDelivery: rawSoldDelivery, newInventory: rawNewInventory } = body
  const validStages = ['mechanic', 'detailing', 'content', 'publish']
  const startingStage = validStages.includes(rawStartingStage) ? rawStartingStage : 'mechanic'
  const soldDelivery = !!rawSoldDelivery && startingStage === 'detailing'
  const newInventory = !!rawNewInventory && startingStage === 'mechanic'

  // Helpers to normalize checklist items: accept either string or { item, type }
  type ChecklistInput = string | { item: string; type?: string }
  const toChecklistObj = (entry: ChecklistInput) => {
    if (typeof entry === 'string') return { item: entry, done: false, note: '' }
    return { item: entry.item, done: false, note: '', ...(entry.type ? { type: entry.type } : {}) }
  }

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
    // 'archived'        = placeholder Vehicle created when adding a part to a
    //                     non-recon car (see /api/vehicles/resolve).
    // 'inventory_only'  = car present in the inventory feed that never actually
    //                     started recon — the admin is now sending it in.
    // 'external'        = car out at an external shop coming back in.
    // All three are "not actually in active recon yet" — treat them the same way
    // and promote into active recon when the admin re-adds the stock number.
    if (existing.status === 'external' || existing.status === 'archived' || existing.status === 'inventory_only') {
      // Vehicle returning from external repair / promoted from placeholder — re-enter recon
      let stageAssignee = assigneeId
      if (!stageAssignee) {
        const config = await prisma.stageConfig.findUnique({ where: { stage: startingStage } })
        stageAssignee = config?.defaultAssigneeId || null
      }

      const stageConfig = await prisma.stageConfig.findUnique({ where: { stage: startingStage } })
      const configChecklist = (stageConfig?.defaultChecklist as string[] | undefined)?.length
        ? stageConfig!.defaultChecklist as string[]
        : null
      // Default order: explicit checklist from the request -> DB stage config -> single
      // 'Inspect & clear' placeholder.  No more legacy DEFAULT_CHECKLISTS fallback —
      // that was producing the old 8-item "New Inventory" template on stages that
      // shouldn't get it (see the 1973 Camaro case 2026-06-09).  Mechanic templates
      // ("New Vehicle Inspection", "Sold Vehicle Inspection") live in the DB now.
      let checklistItems: ChecklistInput[] = mechanicChecklist && mechanicChecklist.length > 0
        ? mechanicChecklist
        : (configChecklist || ['Inspect & clear'])
      if (soldDelivery) {
        checklistItems = mechanicChecklist && mechanicChecklist.length > 0
          ? mechanicChecklist
          : SOLD_DELIVERY_TASKS
      }
      const checklist = checklistItems.map(toChecklistObj)

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

        // Cleanly close any abandoned in-flight stages (e.g. an old mechanic stage
        // the vehicle left when it went out to external repair). Mark them 'skipped'
        // with a completedAt so they don't haunt the routing UI as the "last completed" stage.
        await tx.vehicleStage.updateMany({
          where: {
            vehicleId: existing.id,
            status: { notIn: ['done', 'skipped'] },
          },
          data: { status: 'skipped', completedAt: new Date() },
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
            scopeName: soldDelivery ? 'Sold Delivery' : newInventory ? 'New Inventory' : null,
          },
        })

        const updated = await tx.vehicle.update({
          where: { id: existing.id },
          data: {
            status: startingStage,
            currentStageId: stage.id,
            currentAssigneeId: stageAssignee,
            completedAt: null,
          },
        })

        await tx.activityLog.create({
          data: {
            entityType: 'vehicle',
            entityId: existing.id,
            action: existing.status === 'archived' ? 'promoted_from_placeholder' : 'returned_from_external',
            actorId: user.id,
            details: { stockNumber, stage: startingStage },
          },
        })

        return updated
      })

      // Keep the inventory-side badge in sync — recompute reads the just-created
      // mechanic stage and flips InventoryVehicle.status to 'in_recon' (was
      // skipped before this line was added, leaving promoted cars stuck on
      // their prior badge: in_stock / external_repair / sold).
      await recomputeInventoryStatus(stockNumber).catch(() => {})

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
    let checklistItems: ChecklistInput[] = mechanicChecklist && mechanicChecklist.length > 0
      ? mechanicChecklist
      : (configChecklist || DEFAULT_CHECKLISTS[startingStage as keyof typeof DEFAULT_CHECKLISTS] || ['Inspect & clear'])
    if (soldDelivery) {
      checklistItems = mechanicChecklist && mechanicChecklist.length > 0
        ? mechanicChecklist
        : SOLD_DELIVERY_TASKS
    }
    const checklist = checklistItems.map(toChecklistObj)

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
        scopeName: soldDelivery ? 'Sold Delivery' : newInventory ? 'New Inventory' : null,
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
