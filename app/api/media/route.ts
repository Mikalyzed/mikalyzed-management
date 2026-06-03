import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { presignGet } from '@/lib/r2'

/**
 * GET /api/media?vehicleId=... — list media for a vehicle, each with a
 * fresh presigned GET URL the browser can use directly.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const vehicleId = searchParams.get('vehicleId')
  if (!vehicleId) return NextResponse.json({ error: 'vehicleId required' }, { status: 400 })

  const assets = await prisma.mediaAsset.findMany({
    where: { vehicleId },
    include: { uploadedBy: { select: { id: true, name: true } } },
    orderBy: [{ sortOrder: 'asc' }, { uploadedAt: 'desc' }],
  })

  // Presign each URL so the browser can render directly from R2
  const enriched = await Promise.all(assets.map(async (a) => ({
    id: a.id,
    type: a.type,
    contentType: a.contentType,
    sizeBytes: a.sizeBytes,
    filename: a.filename,
    caption: a.caption,
    sortOrder: a.sortOrder,
    uploadedAt: a.uploadedAt,
    uploadedBy: a.uploadedBy,
    url: await presignGet(a.r2Key, 60 * 60), // 1 hour
  })))

  return NextResponse.json({ media: enriched })
}
