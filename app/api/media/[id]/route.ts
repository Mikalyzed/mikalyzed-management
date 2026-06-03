import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, requireRole } from '@/lib/auth'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const existing = await prisma.mediaAsset.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Admin or uploader can delete
  const isOwner = existing.uploadedById === user.id
  if (!isOwner && !requireRole(user.role, ['admin'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.mediaAsset.delete({ where: { id } })

  // Note: not deleting the R2 object here for safety. A cron later sweeps orphaned R2 keys.

  try {
    await prisma.activityLog.create({
      data: {
        entityType: 'vehicle',
        entityId: existing.vehicleId,
        action: 'media_deleted',
        actorId: user.id,
        details: { mediaAssetId: existing.id, type: existing.type },
      },
    })
  } catch {}

  return NextResponse.json({ ok: true })
}
