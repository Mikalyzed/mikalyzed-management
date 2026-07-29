import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, requireRole } from '@/lib/auth'

/**
 * POST /api/vehicles/:id/plan/steps — "things come up": insert a new step
 * into an existing game plan without redoing it.
 *
 * Body: { title, detail?, kind?, stage?, shop?, position: 'next' | 'end' }
 *  - 'next' slots it right after the active step (do this before moving on)
 *  - 'end'  appends it before the finish line
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!requireRole(user.role, ['shop_coordinator'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const plan = await prisma.vehiclePlan.findUnique({
    where: { vehicleId: id },
    include: { steps: { orderBy: { order: 'asc' } } },
  })
  if (!plan) return NextResponse.json({ error: 'No plan on this vehicle' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title) return NextResponse.json({ error: 'Title required' }, { status: 400 })
  const detail = typeof body.detail === 'string' && body.detail.trim() ? body.detail.trim() : null
  const kind = body.kind === 'task' || body.kind === 'external' ? body.kind : 'generic'
  const stage = typeof body.stage === 'string' && ['mechanic', 'detailing', 'content', 'publish'].includes(body.stage) ? body.stage : null
  const shop = typeof body.shop === 'string' && body.shop.trim() ? body.shop.trim() : null
  const finalKind = (kind === 'task' && !stage) || (kind === 'external' && !shop) ? 'generic' : kind

  const active = plan.steps.find(s => s.status === 'active')
  const position: 'next' | 'end' = body.position === 'end' ? 'end' : 'next'
  const insertOrder = position === 'next' && active
    ? active.order + 1
    : (plan.steps[plan.steps.length - 1]?.order ?? -1) + 1

  await prisma.$transaction(async (tx) => {
    // Shift everything at/after the slot down one
    await tx.vehiclePlanStep.updateMany({
      where: { planId: plan.id, order: { gte: insertOrder } },
      data: { order: { increment: 1 } },
    })
    await tx.vehiclePlanStep.create({
      data: {
        planId: plan.id,
        order: insertOrder,
        title, detail,
        kind: finalKind,
        actionStage: finalKind === 'task' ? stage : null,
        actionShop: finalKind === 'external' ? shop : null,
        status: 'pending',
      },
    })
  })

  await prisma.activityLog.create({
    data: {
      entityType: 'vehicle', entityId: id, action: 'plan_step_added', actorId: user.id,
      details: { title, position, kind: finalKind },
    },
  }).catch(() => {})

  const fresh = await prisma.vehiclePlan.findUnique({
    where: { vehicleId: id },
    include: { steps: { orderBy: { order: 'asc' } } },
  })
  return NextResponse.json({ plan: fresh })
}
