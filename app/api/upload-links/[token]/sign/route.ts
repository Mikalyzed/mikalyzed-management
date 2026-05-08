import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { prisma } from '@/lib/db'
import { isR2Configured, presignUpload } from '@/lib/r2'

/**
 * POST /api/upload-links/[token]/sign — public. Validates the upload link
 * and returns a presigned R2 PUT URL. The customer's browser uploads the
 * file directly to R2, bypassing Vercel's body-size limit.
 *
 * Body: { contentType, fileName }
 * Returns: { uploadUrl, key }
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!isR2Configured()) {
    return NextResponse.json({ error: 'Storage not configured' }, { status: 500 })
  }
  const { token } = await params
  const link = await prisma.uploadLink.findUnique({ where: { token } })
  if (!link) return NextResponse.json({ error: 'Invalid link' }, { status: 404 })
  if (link.expiresAt < new Date()) return NextResponse.json({ error: 'Link expired' }, { status: 410 })
  if (link.usedCount >= link.maxUses) return NextResponse.json({ error: 'Upload limit reached' }, { status: 410 })

  const body = await request.json().catch(() => ({}))
  const contentType = (body.contentType as string) || 'application/octet-stream'
  const rawName = (body.fileName as string) || 'file'
  const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)
  const id = randomBytes(8).toString('hex')
  const key = `customer-uploads/${link.contactId}/${id}-${safeName}`

  const uploadUrl = await presignUpload(key, contentType)

  return NextResponse.json({ uploadUrl, key })
}
