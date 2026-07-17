import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

/**
 * POST /api/media/reorder
 * Body: { vehicleId, orderedIds: string[] }
 * Persists the display/syndication order by writing sortOrder = index for the
 * full ordered list of a vehicle's media. Ids not belonging to the vehicle are
 * ignored. This is the order photos syndicate to marketing channels in.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const vehicleId = typeof body?.vehicleId === 'string' ? body.vehicleId : null
  const orderedIds: string[] = Array.isArray(body?.orderedIds) ? body.orderedIds : []
  if (!vehicleId || orderedIds.length === 0) {
    return NextResponse.json({ error: 'vehicleId and orderedIds required' }, { status: 400 })
  }

  // Only touch assets that actually belong to this vehicle.
  const owned = await prisma.mediaAsset.findMany({
    where: { vehicleId, id: { in: orderedIds } },
    select: { id: true },
  })
  const valid = new Set(owned.map(a => a.id))
  const clean = orderedIds.filter(id => valid.has(id))
  if (clean.length === 0) return NextResponse.json({ error: 'no matching media' }, { status: 400 })

  await prisma.$transaction(
    clean.map((id, i) => prisma.mediaAsset.update({ where: { id }, data: { sortOrder: i } })),
  )

  return NextResponse.json({ ok: true, count: clean.length })
}
