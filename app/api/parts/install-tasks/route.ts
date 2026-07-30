import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { getSessionUser, requireRole } from '@/lib/auth'

/**
 * POST /api/parts/install-tasks — Morning Meeting bottleneck fix for
 * received parts that never got an install task.
 *
 * Body: { vehicleId, partIds: string[], mode: 'create' | 'mark' }
 *  - 'create': appends an "Install: <part>" item to the car's ACTIVE mechanic
 *    checklist (unassigned, flagged fromPart — same shape the parts-received
 *    flow creates) and stamps installTaskCreatedAt.
 *  - 'mark': stamps installTaskCreatedAt only — "handled/already installed",
 *    silences the bottleneck without touching the checklist.
 */
export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // Install tasks are the shop coordinator's lane (admin implicit)
  if (!requireRole(user.role, ['shop_coordinator'])) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const vehicleId = typeof body.vehicleId === 'string' ? body.vehicleId : null
  const partIds: string[] = Array.isArray(body.partIds) ? body.partIds.filter((x: unknown) => typeof x === 'string') : []
  const mode = body.mode === 'create' ? 'create' : 'mark'
  if (!vehicleId || partIds.length === 0) {
    return NextResponse.json({ error: 'vehicleId and partIds required' }, { status: 400 })
  }

  const parts = await prisma.part.findMany({
    where: { id: { in: partIds }, vehicleId, status: 'received' },
    select: { id: true, name: true },
  })
  if (parts.length === 0) return NextResponse.json({ error: 'No matching received parts' }, { status: 404 })

  let created = 0

  if (mode === 'create') {
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { currentStageId: true, stockNumber: true },
    })
    const stage = vehicle?.currentStageId
      ? await prisma.vehicleStage.findUnique({
          where: { id: vehicle.currentStageId },
          select: { id: true, stage: true, status: true, checklist: true },
        })
      : null
    if (!stage || stage.stage !== 'mechanic' || stage.status === 'done' || stage.status === 'skipped') {
      return NextResponse.json({ error: 'This car has no active mechanic stage — mark the parts handled instead.' }, { status: 409 })
    }

    const existing = Array.isArray(stage.checklist) ? (stage.checklist as Array<Record<string, unknown>>) : []
    const additions = parts
      .filter(p => {
        const taskName = `Install: ${p.name}`.trim().toLowerCase()
        return !existing.some(c => typeof c?.item === 'string' && c.item.trim().toLowerCase() === taskName)
      })
      .map(p => ({
        item: `Install: ${p.name}`, done: false, note: '',
        addedByMechanic: true, approved: 'approved',
        assigneeId: null, assigneeName: null, fromPart: true,
      }))
    if (additions.length > 0) {
      await prisma.vehicleStage.update({
        where: { id: stage.id },
        data: { checklist: [...existing, ...additions] as unknown as Prisma.InputJsonValue },
      })
    }
    created = additions.length
  }

  await prisma.part.updateMany({
    where: { id: { in: parts.map(p => p.id) } },
    data: { installTaskCreatedAt: new Date() },
  })

  await prisma.activityLog.create({
    data: {
      entityType: 'vehicle', entityId: vehicleId,
      action: mode === 'create' ? 'install_tasks_created' : 'install_tasks_marked_handled',
      actorId: user.id,
      details: { parts: parts.map(p => p.name), source: 'morning_meeting' },
    },
  }).catch(() => {})

  return NextResponse.json({ ok: true, created, stamped: parts.length })
}
