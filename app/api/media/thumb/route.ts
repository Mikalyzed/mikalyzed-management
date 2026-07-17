export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { presignGet } from '@/lib/r2'

/**
 * GET /api/media/thumb?id=<mediaId>&w=<width>
 * Returns a small JPEG thumbnail of the stored image, resized on the fly and
 * cached hard (media is immutable per id). Keeps the gallery grid smooth without
 * ever downscaling the full-res original in R2.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const w = Math.min(Math.max(parseInt(searchParams.get('w') || '600', 10) || 600, 100), 1600)
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const asset = await prisma.mediaAsset.findUnique({
    where: { id },
    select: { r2Key: true, contentType: true },
  })
  if (!asset) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    const url = await presignGet(asset.r2Key, 60 * 5)
    const res = await fetch(url)
    if (!res.ok) return NextResponse.json({ error: 'source fetch failed' }, { status: 502 })
    const input = Buffer.from(await res.arrayBuffer())
    const out = await sharp(input)
      .rotate()
      .resize(w, w, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 74 })
      .toBuffer()
    return new NextResponse(new Uint8Array(out), {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        // Immutable per media id — cache aggressively so scrolling is instant on revisit.
        'Cache-Control': 'private, max-age=604800, immutable',
      },
    })
  } catch {
    return NextResponse.json({ error: 'thumbnail failed' }, { status: 500 })
  }
}
