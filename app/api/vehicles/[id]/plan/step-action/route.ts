import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, requireRole } from '@/lib/auth'

/**
 * POST /api/vehicles/:id/plan/step-action { stepId } — confirm-first execution
 * of an active plan step's real-world action:
 *
 *  - kind 'external' → drafts an ExternalRepair at the step's shop (status
 *    'pending' / not scheduled — sending it is still a human decision).
 *  - kind 'task'     → appends the step as a task on the car's ACTIVE stage
 *    when that stage matches. If the car isn't in that stage yet, returns 409
 *    'not_in_stage' — the route-stage hook attaches it automatically when the
 *    car reaches the stage instead.
 *
 * Stamps actionCreatedAt so an action can never be created twice.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!requireRole(user.role, ['shop_coordinator'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const stepId = typeof body.stepId === 'string' ? body.stepId : null
  if (!stepId) return NextResponse.json({ error: 'stepId required' }, { status: 400 })

  const step = await prisma.vehiclePlanStep.findUnique({
    where: { id: stepId },
    include: { plan: { include: { vehicle: { select: { id: true, stockNumber: true, year: true, make: true, model: true, color: true, currentStageId: true } } } } },
  })
  if (!step || step.plan.vehicleId !== id) return NextResponse.json({ error: 'Step not found' }, { status: 404 })
  if (step.actionCreatedAt) return NextResponse.json({ error: 'Already created' }, { status: 409 })
  const v = step.plan.vehicle

  if (step.kind === 'external' && step.actionShop) {
    const repair = await prisma.externalRepair.create({
      data: {
        stockNumber: v.stockNumber,
        year: v.year,
        make: v.make,
        model: v.model,
        color: v.color,
        shopName: step.actionShop,
        repairDescription: step.detail ? `${step.title} — ${step.detail}` : step.title,
        status: 'pending', // not scheduled: creating ≠ the car left the lot
        notes: `From the vehicle's game plan (step ${step.order + 1})`,
      },
    })
    await prisma.vehiclePlanStep.update({ where: { id: stepId }, data: { actionCreatedAt: new Date() } })
    await prisma.activityLog.create({
      data: {
        entityType: 'vehicle', entityId: id, action: 'plan_step_action_external', actorId: user.id,
        details: { step: step.title, shop: step.actionShop, externalRepairId: repair.id },
      },
    }).catch(() => {})
    return NextResponse.json({ ok: true, created: 'external', shop: step.actionShop })
  }

  if (step.kind === 'task' && step.actionStage) {
    const activeStage = await prisma.vehicleStage.findFirst({
      where: { vehicleId: id, status: { in: ['pending', 'in_progress'] } },
      orderBy: { startedAt: 'desc' },
      select: { id: true, stage: true, checklist: true },
    })
    if (!activeStage || activeStage.stage !== step.actionStage) {
      return NextResponse.json({
        code: 'not_in_stage',
        stage: step.actionStage,
        currentStage: activeStage?.stage ?? null,
        error: `Car isn't in ${step.actionStage} right now — the task attaches automatically when it gets routed there.`,
      }, { status: 409 })
    }
    const existing = Array.isArray(activeStage.checklist) ? activeStage.checklist as Array<Record<string, unknown>> : []
    const have = existing.some(c => String(c?.item ?? '').trim().toLowerCase() === step.title.trim().toLowerCase())
    if (!have) {
      await prisma.vehicleStage.update({
        where: { id: activeStage.id },
        data: {
          checklist: [...existing, {
            item: step.title, done: false, note: step.detail ?? '',
            addedByMechanic: true, approved: 'approved',
            assigneeId: null, assigneeName: null, fromPlan: true,
          }] as object[],
        },
      })
    }
    await prisma.vehiclePlanStep.update({ where: { id: stepId }, data: { actionCreatedAt: new Date() } })
    await prisma.activityLog.create({
      data: {
        entityType: 'vehicle', entityId: id, action: 'plan_step_action_task', actorId: user.id,
        details: { step: step.title, stage: step.actionStage },
      },
    }).catch(() => {})
    return NextResponse.json({ ok: true, created: 'task', stage: step.actionStage })
  }

  return NextResponse.json({ error: 'This step has no action to create.' }, { status: 400 })
}
