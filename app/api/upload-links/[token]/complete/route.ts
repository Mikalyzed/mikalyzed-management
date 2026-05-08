import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

/**
 * POST /api/upload-links/[token]/complete — public, called by the client after
 * a successful R2 upload. We record the asset key on the contact's timeline
 * as a Message (channel='upload') so it shows up like any other message.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
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
  const r2Key = body.r2Key as string
  const contentType = (body.contentType as string) || null
  const originalFilename = (body.originalFilename as string) || null

  if (!r2Key) {
    return NextResponse.json({ error: 'r2Key required' }, { status: 400 })
  }

  await prisma.$transaction(async tx => {
    await tx.message.create({
      data: {
        contactId: link.contactId,
        direction: 'inbound',
        channel: 'upload',
        body: originalFilename ? `📎 ${originalFilename}` : '',
        mediaUrl: null,
        mediaContentType: contentType,
        r2Key,
        status: 'received',
      },
    })
    await tx.uploadLink.update({
      where: { id: link.id },
      data: { usedCount: { increment: 1 } },
    })
  })

  // Notify the rep who created the link
  await prisma.notification.create({
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
