import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { isR2Configured, presignUploadPart } from '@/lib/r2'

/**
 * POST /api/upload-links/[token]/multipart/sign-part
 * Body: { key, uploadId, partNumber }
 * Returns: { url }
 *
 * Returns a presigned URL the browser PUTs a single part to.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!isR2Configured()) return NextResponse.json({ error: 'Storage not configured' }, { status: 500 })
  const { token } = await params
  const link = await prisma.uploadLink.findUnique({ where: { token } })
  if (!link) return NextResponse.json({ error: 'Invalid link' }, { status: 404 })
  if (link.expiresAt < new Date()) return NextResponse.json({ error: 'Link expired' }, { status: 410 })

  const { key, uploadId, partNumber } = await request.json()
  if (!key || !uploadId || !partNumber) {
    return NextResponse.json({ error: 'key, uploadId, partNumber required' }, { status: 400 })
  }
  // Make sure the key starts with this contact's prefix (no cross-tenant access)
  if (!String(key).startsWith(`customer-uploads/${link.contactId}/`)) {
    return NextResponse.json({ error: 'Invalid key' }, { status: 403 })
  }

  const url = await presignUploadPart(key, uploadId, Number(partNumber))
  return NextResponse.json({ url })
}
