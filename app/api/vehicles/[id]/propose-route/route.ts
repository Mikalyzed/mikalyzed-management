import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, requireRole } from '@/lib/auth'

/**
 * POST /api/vehicles/:id/propose-route { stage } — the shop coordinator's
 * routing suggestion for a car in Pending Routing. Nothing moves: the
 * proposal shows on the admin's routing queue ("Lenny suggests Detailing")
 * and Approve opens the routing modal preloaded. Cleared when routed.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!requireRole(user.role, ['shop_coordinator'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const stage = typeof body.stage === 'string' && ['mechanic', 'detailing', 'content', 'publish', 'completed'].includes(body.stage)
    ? body.stage : null
  if (!stage) return NextResponse.json({ error: 'stage required' }, { status: 400 })

  const vehicle = await prisma.vehicle.findUnique({ where: { id }, select: { id: true, status: true, stockNumber: true } })
  if (!vehicle) return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 })
  if (vehicle.status !== 'awaiting_routing') {
    return NextResponse.json({ error: 'Car is not in Pending Routing.' }, { status: 409 })
  }

  await prisma.vehicle.update({
    where: { id },
    data: { routingProposal: { stage, byId: user.id, byName: user.name, at: new Date().toISOString() } },
  })
  await prisma.activityLog.create({
    data: {
      entityType: 'vehicle', entityId: id, action: 'routing_proposed', actorId: user.id,
      details: { stockNumber: vehicle.stockNumber, stage },
    },
  }).catch(() => {})

  return NextResponse.json({ ok: true, stage })
}
