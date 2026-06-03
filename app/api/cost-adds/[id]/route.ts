import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, requireRole } from '@/lib/auth'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const existing = await prisma.costAdd.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Allow: admin OR the user who added it
  const isOwner = existing.addedById === user.id
  if (!isOwner && !requireRole(user.role, ['admin'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.costAdd.delete({ where: { id } })

  // Activity log
  try {
    await prisma.activityLog.create({
      data: {
        entityType: 'vehicle',
        entityId: existing.vehicleId,
        action: 'cost_add_deleted',
        actorId: user.id,
        details: { kind: existing.kind, amountCents: existing.amountCents },
      },
    })
  } catch {}

  return NextResponse.json({ ok: true })
}
