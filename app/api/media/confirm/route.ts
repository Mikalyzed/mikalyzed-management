import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

const VALID_TYPES = ['exterior', 'interior', 'undercarriage', 'walkaround_video', 'turntable_video', 'doc', 'other']

/**
 * POST /api/media/confirm
 * Body: { vehicleId, r2Key, type, contentType, sizeBytes?, filename?, caption? }
 *
 * Called by the browser AFTER it successfully PUTs to R2.
 * Creates the MediaAsset DB record.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { vehicleId, r2Key, type, contentType, sizeBytes, filename, caption } = body

  if (!vehicleId || !r2Key || !type) {
    return NextResponse.json({ error: 'vehicleId, r2Key, type required' }, { status: 400 })
  }
  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 })
  }

  // Verify vehicle exists
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { id: true } })
  if (!vehicle) return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 })

  // Compute next sortOrder (append at end)
  const maxOrder = await prisma.mediaAsset.aggregate({
    where: { vehicleId },
    _max: { sortOrder: true },
  })
  const sortOrder = (maxOrder._max.sortOrder ?? -1) + 1

  const asset = await prisma.mediaAsset.create({
    data: {
      vehicleId,
      type,
      r2Key,
      contentType: contentType || null,
      sizeBytes: typeof sizeBytes === 'number' ? sizeBytes : null,
      filename: filename || null,
      caption: caption || null,
      sortOrder,
      uploadedById: user.id,
    },
  })

  // Activity log
  try {
    await prisma.activityLog.create({
      data: {
        entityType: 'vehicle',
        entityId: vehicleId,
        action: 'media_uploaded',
        actorId: user.id,
        details: { mediaAssetId: asset.id, type, filename },
      },
    })
  } catch {}

  return NextResponse.json({ asset })
}
