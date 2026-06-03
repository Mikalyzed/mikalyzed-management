import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { presignUpload } from '@/lib/r2'

/**
 * POST /api/media/presign
 * Body: { vehicleId, filename, contentType }
 *
 * Returns: { uploadUrl, r2Key } — browser PUTs the file bytes directly to R2.
 * No file goes through the Next.js server (avoids Vercel body-size limits).
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { vehicleId, filename, contentType } = body

  if (!vehicleId) return NextResponse.json({ error: 'vehicleId required' }, { status: 400 })
  if (!filename) return NextResponse.json({ error: 'filename required' }, { status: 400 })

  // Sanitize filename and build a unique key under vehicles/<vehicleId>/<ts>-<rand>-<filename>
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)
  const r2Key = `vehicles/${vehicleId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeFilename}`

  const uploadUrl = await presignUpload(r2Key, contentType || 'application/octet-stream', 60 * 30) // 30 min

  return NextResponse.json({ uploadUrl, r2Key })
}
