import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, requireRole } from '@/lib/auth'

/**
 * POST /api/stages/[id]/assign-task  { assigneeId, item? }
 * Assigns unassigned auto-created install tasks (fromPart) in this stage to a
 * mechanic — powers the recon board's "Parts Arrived — Assign Install" alert.
 * With `item`, only that task; otherwise every unassigned fromPart task. Admin only.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!requireRole(user.role, ['admin'])) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const assigneeId = typeof body?.assigneeId === 'string' ? body.assigneeId : null
  const onlyItem = typeof body?.item === 'string' ? body.item : null
  if (!assigneeId) return NextResponse.json({ error: 'assigneeId required' }, { status: 400 })

  const [stage, mech] = await Promise.all([
    prisma.vehicleStage.findUnique({ where: { id }, select: { id: true, vehicleId: true, checklist: true } }),
    prisma.user.findUnique({ where: { id: assigneeId }, select: { id: true, name: true } }),
  ])
  if (!stage) return NextResponse.json({ error: 'Stage not found' }, { status: 404 })
  if (!mech) return NextResponse.json({ error: 'Mechanic not found' }, { status: 404 })

  const list = Array.isArray(stage.checklist) ? (stage.checklist as any[]) : []
  let count = 0
  const updated = list.map(c => {
    const isTarget = c?.fromPart && !c?.assigneeId && !c?.done && (!onlyItem || String(c?.item) === onlyItem)
    if (isTarget) { count++; return { ...c, assigneeId: mech.id, assigneeName: mech.name } }
    return c
  })
  if (count === 0) return NextResponse.json({ ok: true, count: 0 })

  await prisma.vehicleStage.update({ where: { id }, data: { checklist: updated } })
  await prisma.activityLog.create({
    data: {
      entityType: 'vehicle', entityId: stage.vehicleId, action: 'install_task_assigned',
      actorId: user.id, details: { stageId: id, assignedTo: mech.id, count },
    },
  }).catch(() => {})

  return NextResponse.json({ ok: true, count })
}
