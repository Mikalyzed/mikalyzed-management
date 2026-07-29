import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, requireRole } from '@/lib/auth'

function planAccess(role: string) {
  return requireRole(role, ['shop_coordinator'])
}

/**
 * Per-vehicle Game Plan.
 *
 * The agentic loop: exactly one step is active. Completing it (PATCH advance)
 * marks it done, activates the next step, and AUTO-CREATES an admin follow-up
 * for it — so the system tells the admin what's next through the existing
 * reminder machinery (dashboard, follow-ups strip, tasks). The previous
 * step's follow-up is closed automatically.
 */

async function shadowFollowup(vehicleId: string, actorId: string, stepTitle: string, stock: string) {
  await prisma.task.create({
    data: {
      title: `Plan — #${stock}: ${stepTitle}`.slice(0, 200),
      description: 'Next step on this vehicle\'s game plan. Completing the step in the plan closes this automatically.',
      category: 'admin',
      priority: 1,
      createdById: actorId,
      stockNumbers: [stock],
    },
  }).catch(() => {})
}

async function closeShadowFollowup(stock: string, stepTitle: string) {
  await prisma.task.updateMany({
    where: {
      category: 'admin',
      status: { not: 'done' },
      title: `Plan — #${stock}: ${stepTitle}`.slice(0, 200),
    },
    data: { status: 'done', completedAt: new Date() },
  }).catch(() => {})
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const plan = await prisma.vehiclePlan.findUnique({
    where: { vehicleId: id },
    include: { steps: { orderBy: { order: 'asc' } } },
  })
  return NextResponse.json({ plan })
}

/** Create/replace the plan. Body: { goal?, steps: [{ title, detail? }] } */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!planAccess(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const vehicle = await prisma.vehicle.findUnique({ where: { id }, select: { id: true, stockNumber: true } })
  if (!vehicle) return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const goal = typeof body.goal === 'string' ? body.goal.trim() || null : null
  const rawSteps: Array<{ title?: unknown; detail?: unknown; kind?: unknown; stage?: unknown; shop?: unknown }> = Array.isArray(body.steps) ? body.steps : []
  const steps = rawSteps
    .map(s => {
      const kind = s.kind === 'task' || s.kind === 'external' ? s.kind : 'generic'
      const stage = typeof s.stage === 'string' && ['mechanic', 'detailing', 'content', 'publish'].includes(s.stage) ? s.stage : null
      const shop = typeof s.shop === 'string' && s.shop.trim() ? s.shop.trim() : null
      return {
        title: typeof s.title === 'string' ? s.title.trim() : '',
        detail: typeof s.detail === 'string' && s.detail.trim() ? s.detail.trim() : null,
        kind: (kind === 'task' && !stage) || (kind === 'external' && !shop) ? 'generic' : kind,
        actionStage: kind === 'task' ? stage : null,
        actionShop: kind === 'external' ? shop : null,
      }
    })
    .filter(s => s.title)
  if (steps.length === 0) return NextResponse.json({ error: 'At least one step required' }, { status: 400 })

  // Replace any existing plan wholesale
  await prisma.vehiclePlan.deleteMany({ where: { vehicleId: id } })
  const plan = await prisma.vehiclePlan.create({
    data: {
      vehicleId: id,
      goal,
      steps: {
        create: steps.map((s, i) => ({
          order: i,
          title: s.title,
          detail: s.detail,
          kind: s.kind,
          actionStage: s.actionStage,
          actionShop: s.actionShop,
          status: i === 0 ? 'active' : 'pending',
          activatedAt: i === 0 ? new Date() : null,
        })),
      },
    },
    include: { steps: { orderBy: { order: 'asc' } } },
  })

  // The system announces the first step
  await shadowFollowup(id, user.id, steps[0].title, vehicle.stockNumber)
  await prisma.activityLog.create({
    data: {
      entityType: 'vehicle', entityId: id, action: 'plan_created', actorId: user.id,
      details: { steps: steps.length, goal },
    },
  }).catch(() => {})

  return NextResponse.json({ plan })
}

/** PATCH { action: 'advance' | 'skip', stepId } — complete/skip the step, activate the next. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!planAccess(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const stepId = typeof body.stepId === 'string' ? body.stepId : null
  const action = body.action === 'skip' ? 'skip' : 'advance'
  if (!stepId) return NextResponse.json({ error: 'stepId required' }, { status: 400 })

  const plan = await prisma.vehiclePlan.findUnique({
    where: { vehicleId: id },
    include: { steps: { orderBy: { order: 'asc' } }, vehicle: { select: { stockNumber: true } } },
  })
  if (!plan) return NextResponse.json({ error: 'No plan' }, { status: 404 })
  const step = plan.steps.find(s => s.id === stepId)
  if (!step) return NextResponse.json({ error: 'Step not found' }, { status: 404 })

  await prisma.vehiclePlanStep.update({
    where: { id: stepId },
    data: { status: action === 'skip' ? 'skipped' : 'done', doneAt: new Date() },
  })
  await closeShadowFollowup(plan.vehicle.stockNumber, step.title)

  // Activate the next pending step and announce it
  const next = plan.steps.find(s => s.order > step.order && s.status === 'pending')
  if (next) {
    await prisma.vehiclePlanStep.update({
      where: { id: next.id },
      data: { status: 'active', activatedAt: new Date() },
    })
    await shadowFollowup(id, user.id, next.title, plan.vehicle.stockNumber)
  }

  await prisma.activityLog.create({
    data: {
      entityType: 'vehicle', entityId: id, action: action === 'skip' ? 'plan_step_skipped' : 'plan_step_done',
      actorId: user.id,
      details: { step: step.title, next: next?.title ?? null },
    },
  }).catch(() => {})

  const fresh = await prisma.vehiclePlan.findUnique({
    where: { vehicleId: id },
    include: { steps: { orderBy: { order: 'asc' } } },
  })
  return NextResponse.json({ plan: fresh, done: !next })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  await prisma.vehiclePlan.deleteMany({ where: { vehicleId: id } })
  return NextResponse.json({ ok: true })
}
