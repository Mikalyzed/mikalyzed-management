import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { getSessionUser, requireRole } from '@/lib/auth'
import { DEFAULT_CHECKLISTS, STAGE_LABELS } from '@/lib/constants'
import type { Stage } from '@/lib/constants'
import { recomputeInventoryStatus } from '@/lib/inventory-status'
import { sendNotificationEmail } from '@/lib/email'
import { vehicleStageAssignedEmail } from '@/lib/email-templates'

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
  // Tasks may arrive as plain strings (admin-typed) OR as structured objects
  // ({ item, type, fields }) when they come from a checklist template. Preserve
  // the type/fields so rich items (tire PSI, brake pads, fluids, …) render as
  // structured inputs for the mechanic instead of collapsing to bare checkboxes.
  type TaskInput = { item: string; type?: string; fields?: unknown }
  const customTasks: TaskInput[] | null = Array.isArray(body.tasks)
    ? (body.tasks as unknown[])
        .map((t): TaskInput | null => {
          if (typeof t === 'string') {
            const item = t.trim()
            return item ? { item } : null
          }
          if (t && typeof t === 'object' && typeof (t as { item?: unknown }).item === 'string') {
            const raw = t as { item: string; type?: unknown; fields?: unknown }
            const item = raw.item.trim()
            if (!item) return null
            const entry: TaskInput = { item }
            if (typeof raw.type === 'string' && raw.type) entry.type = raw.type
            if (raw.fields != null) entry.fields = raw.fields
            return entry
          }
          return null
        })
        .filter((x): x is TaskInput => x !== null)
    : null
  const estimatedHours = body.estimatedHours != null && body.estimatedHours !== ''
    ? parseFloat(String(body.estimatedHours))
    : null
  const soldDelivery = !!body.soldDelivery && nextStage === 'detailing'
  // NEW: parts to mark as install-task-created (admin generated install tasks for them in this routing)
  const installPartIds = Array.isArray(body.installPartIds)
    ? (body.installPartIds as unknown[]).filter((x): x is string => typeof x === 'string')
    : []
  // NEW: source stage + which added-by-mechanic tasks were approved (others get declined)
  const previousStageId = typeof body.previousStageId === 'string' ? body.previousStageId : null
  const approvedAddedIndices: number[] = Array.isArray(body.approvedAddedIndices)
    ? (body.approvedAddedIndices as unknown[]).filter((x): x is number => typeof x === 'number')
    : []

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
    select: { id: true, stockNumber: true, status: true, year: true, make: true, model: true },
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
  const tasks: (string | TaskInput)[] = soldDelivery
    ? (customTasks && customTasks.length > 0 ? customTasks : SOLD_DELIVERY_TASKS)
    : baseTasks
  type ChecklistEntry = { item: string; done: boolean; note: string; type?: string; fields?: unknown }
  const toChecklistEntry = (t: string | TaskInput): ChecklistEntry => {
    if (typeof t === 'string') return { item: t, done: false, note: '' }
    const entry: ChecklistEntry = { item: t.item, done: false, note: '' }
    if (t.type) entry.type = t.type
    if (t.fields != null) entry.fields = t.fields
    return entry
  }
  const templateChecklist = tasks.map(toChecklistEntry)

  // RESUME-FROM-EXTERNAL: when a vehicle returns from external repair (or any
  // other awaiting_routing state) and the admin routes it back to the same
  // stage type it was at before being skipped, restore the prior stage's
  // checklist + scope rather than building a fresh one from the template.
  // Preserves done state on the items the worker had already finished.
  //
  // Skip the resume when:
  //  - The admin supplied customTasks (explicit override wins).
  //  - The admin chose soldDelivery (a different stage shape entirely).
  //  - The prior skipped stage is older than 60 days (safety hatch: don't
  //    accidentally resurrect a stage from months ago).
  let resumedFromStageId: string | null = null
  let checklist: ChecklistEntry[] = templateChecklist
  let resumedScopeName: string | null = null

  const adminGaveCustom = customTasks && customTasks.length > 0
  const isAwaitingRouting = vehicle.status === 'awaiting_routing'
  if (isAwaitingRouting && !adminGaveCustom && !soldDelivery) {
    const prior = await prisma.vehicleStage.findFirst({
      where: { vehicleId: id, stage: nextStage, status: 'skipped' },
      orderBy: { completedAt: 'desc' },
      select: { id: true, checklist: true, scopeName: true, completedAt: true },
    })
    if (prior && Array.isArray(prior.checklist) && prior.checklist.length > 0) {
      const skippedAt = prior.completedAt?.getTime() ?? 0
      const sixtyDaysMs = 1000 * 60 * 60 * 24 * 60
      const skippedRecently = !prior.completedAt || (Date.now() - skippedAt) < sixtyDaysMs
      if (skippedRecently) {
        resumedFromStageId = prior.id
        // Cast through unknown — Prisma JSON arrays don't carry the entry shape.
        checklist = prior.checklist as unknown as ChecklistEntry[]
        resumedScopeName = prior.scopeName
      }
    }
  }

  // Admin may pick the assignee in the routing modal (e.g. which mechanic owns
  // this scope). Falls back to the stage config default when not supplied.
  const requestedAssigneeId = typeof body.assigneeId === 'string' && body.assigneeId.trim()
    ? body.assigneeId.trim()
    : null
  const newAssigneeId = requestedAssigneeId || config?.defaultAssigneeId || null
  // Optional scope label for the stage (e.g. "Engine", "Brakes") so a car split
  // across two mechanics reads clearly on the board. Custom label wins over resume.
  const requestedScopeName = typeof body.scopeName === 'string' && body.scopeName.trim()
    ? body.scopeName.trim()
    : null

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
        assigneeId: newAssigneeId,
        checklist: checklist as unknown as Prisma.InputJsonValue,
        priority: (maxPriority._max.priority ?? -1) + 1,
        estimatedHours,
        scopeName: soldDelivery ? 'Sold Delivery' : (requestedScopeName || resumedScopeName),
        notes: resumedFromStageId ? 'Resumed from prior stage on return' : null,
      },
    })

    await tx.vehicle.update({
      where: { id },
      data: {
        status: nextStage,
        currentStageId: newStage.id,
        currentAssigneeId: newAssigneeId,
      },
    })

    await tx.activityLog.create({
      data: {
        entityType: 'vehicle',
        entityId: id,
        action: 'routed',
        actorId: user.id,
        details: { to: nextStage, reason, resumedFrom: resumedFromStageId },
      },
    }).catch(() => {})

    // Stamp parts whose install task was just generated so they don't get re-suggested
    // in future routing cycles.
    if (installPartIds.length > 0) {
      await tx.part.updateMany({
        where: { id: { in: installPartIds }, vehicleId: id },
        data: { installTaskCreatedAt: new Date() },
      })
    }

    // Persist approve/decline decisions on the previous stage's added-by-mechanic tasks.
    // Tasks at indices in approvedAddedIndices → approved; other addedByMechanic tasks → declined.
    if (previousStageId) {
      const prevStage = await tx.vehicleStage.findUnique({
        where: { id: previousStageId },
        select: { checklist: true },
      })
      if (prevStage && Array.isArray(prevStage.checklist)) {
        const approvedSet = new Set(approvedAddedIndices)
        const updatedChecklist = (prevStage.checklist as Array<Record<string, unknown>>).map((item, idx) => {
          if (!item.addedByMechanic) return item
          // Skip if already decided (don't overwrite a prior decision)
          if (item.approved === 'approved' || item.approved === 'declined') return item
          return { ...item, approved: approvedSet.has(idx) ? 'approved' : 'declined' }
        })
        await tx.vehicleStage.update({
          where: { id: previousStageId },
          data: { checklist: updatedChecklist as Prisma.InputJsonValue },
        })
      }
    }
  })

  await recomputeInventoryStatus(vehicle.stockNumber).catch(() => {})

  // Notify the new stage's assignee (email + in-app) — fire-and-forget so a slow
  // Resend response doesn't block the routing response.
  if (newAssigneeId) {
    const stageLabel = STAGE_LABELS[nextStage as keyof typeof STAGE_LABELS] || nextStage
    const vehicleDesc = `${vehicle.year ?? ''} ${vehicle.make} ${vehicle.model} (#${vehicle.stockNumber})`.trim()
    prisma.user.findUnique({
      where: { id: newAssigneeId },
      select: { id: true, name: true, email: true },
    }).then(assignee => {
      if (!assignee) return
      const { subject, html } = vehicleStageAssignedEmail({
        vehicleDesc,
        assigneeName: assignee.name,
        stage: stageLabel,
        vehicleId: id,
        reason,
      })
      sendNotificationEmail({ to: assignee.email, subject, html })
        .catch(e => console.error('[route-stage email]', e))
      prisma.notification.create({
        data: {
          userId: assignee.id,
          type: 'stage_routed',
          title: subject,
          message: `${vehicleDesc} routed to ${stageLabel}${reason ? ` — ${reason}` : ''}`,
          entityType: 'vehicle',
          entityId: id,
        },
      }).catch(() => {})
    }).catch(() => {})
  }

  return NextResponse.json({ success: true, nextStage })
}
