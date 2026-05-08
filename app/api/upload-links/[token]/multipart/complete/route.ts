import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { isR2Configured, completeMultipart, abortMultipart } from '@/lib/r2'

/**
 * POST /api/upload-links/[token]/multipart/complete
 * Body: { key, uploadId, parts: [{partNumber, etag}], contentType, originalFilename }
 *
 * Finalizes the multipart upload + creates a Message record.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!isR2Configured()) return NextResponse.json({ error: 'Storage not configured' }, { status: 500 })
  const { token } = await params
  const link = await prisma.uploadLink.findUnique({
    where: { token },
    include: {
      contact: { select: { id: true, firstName: true, lastName: true } },
      createdBy: { select: { id: true, name: true } },
    },
  })
  if (!link) return NextResponse.json({ error: 'Invalid link' }, { status: 404 })
  if (link.expiresAt < new Date()) return NextResponse.json({ error: 'Link expired' }, { status: 410 })
  if (link.usedCount >= link.maxUses) return NextResponse.json({ error: 'Upload limit reached' }, { status: 410 })

  const body = await request.json()
  const key = body.key as string
  const uploadId = body.uploadId as string
  const parts = body.parts as { partNumber: number; etag: string }[]
  const contentType = (body.contentType as string) || null
  const originalFilename = (body.originalFilename as string) || null

  if (!key || !uploadId || !Array.isArray(parts) || parts.length === 0) {
    return NextResponse.json({ error: 'key, uploadId, parts required' }, { status: 400 })
  }
  if (!key.startsWith(`customer-uploads/${link.contactId}/`)) {
    return NextResponse.json({ error: 'Invalid key' }, { status: 403 })
  }

  try {
    await completeMultipart(key, uploadId, parts)
  } catch (e) {
    console.error('[multipart/complete]', e)
    await abortMultipart(key, uploadId)
    return NextResponse.json({ error: 'Failed to assemble upload' }, { status: 500 })
  }

  await prisma.$transaction(async tx => {
    await tx.message.create({
      data: {
        contactId: link.contactId,
        direction: 'inbound',
        channel: 'upload',
        body: originalFilename ? `📎 ${originalFilename}` : '',
        mediaContentType: contentType,
        r2Key: key,
        status: 'received',
      },
    })
    await tx.uploadLink.update({
      where: { id: link.id },
      data: { usedCount: { increment: 1 } },
    })
  })

  prisma.notification.create({
    data: {
      userId: link.createdBy.id,
      type: 'upload_received',
      title: `${link.contact.firstName} ${link.contact.lastName} uploaded a file`,
      message: originalFilename || 'A file was uploaded via the link you sent',
      entityType: 'contact',
      entityId: link.contactId,
    },
  }).catch(() => {})

  return NextResponse.json({ success: true })
}
