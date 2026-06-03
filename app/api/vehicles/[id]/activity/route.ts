import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

/**
 * GET /api/vehicles/[id]/activity
 *
 * Returns ActivityLog entries for this vehicle.
 * Includes both direct vehicle events (entity_type='vehicle') and
 * related events on this vehicle's stages and parts.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // Confirm vehicle exists
  const vehicle = await prisma.vehicle.findUnique({
    where: { id },
    select: { id: true, stages: { select: { id: true } }, parts: { select: { id: true } } },
  })
  if (!vehicle) return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 })

  const stageIds = vehicle.stages.map((s) => s.id)
  const partIds = vehicle.parts.map((p) => p.id)

  // Pull activity for: this vehicle + its stages + its parts
  const events = await prisma.activityLog.findMany({
    where: {
      OR: [
        { entityType: 'vehicle', entityId: id },
        { entityType: 'stage', entityId: { in: stageIds } },
        { entityType: 'part', entityId: { in: partIds } },
      ],
    },
    include: {
      actor: { select: { id: true, name: true, role: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  return NextResponse.json({ events })
}
