import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { cloudinaryDeliveryUrl, isCloudinaryConfigured } from '@/lib/cloudinary'
import { isR2Configured, presignGet } from '@/lib/r2'

async function buildMediaUrl(msg: {
  id: string
  cloudinaryPublicId?: string | null
  cloudinaryResourceType?: string | null
  mediaUrl?: string | null
  r2Key?: string | null
}): Promise<string | null> {
  // R2 first — used for direct customer uploads (any size)
  if (msg.r2Key && isR2Configured()) {
    return await presignGet(msg.r2Key, 60 * 60)
  }
  if (!msg.mediaUrl) return null
  if (msg.cloudinaryPublicId && msg.cloudinaryResourceType && isCloudinaryConfigured()) {
    return cloudinaryDeliveryUrl(msg.cloudinaryPublicId, msg.cloudinaryResourceType)
  }
  return `/api/sms/media/${msg.id}`
}

// Get messages for a contact
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const contactId = searchParams.get('contactId')

  if (!contactId) {
    // Return all conversations (grouped by contact, latest message)
    const conversations = await prisma.$queryRaw`
      SELECT DISTINCT ON (m.contact_id)
        m.id, m.contact_id, m.direction, m.channel, m.body, m.media_url, m.media_content_type, m.r2_key,
        m.status, m.read_at, m.created_at,
        c.first_name, c.last_name, c.phone
      FROM messages m
      JOIN contacts c ON c.id = m.contact_id
      ORDER BY m.contact_id, m.created_at DESC
    ` as any[]

    // Get unread counts per contact
    const unreadCounts = await prisma.message.groupBy({
      by: ['contactId'],
      where: { direction: 'inbound', readAt: null },
      _count: true,
    })

    const unreadMap: Record<string, number> = {}
    for (const u of unreadCounts) {
      unreadMap[u.contactId] = u._count
    }

    const result = conversations.map((c: any) => {
      const hasMedia = !!c.media_url || !!c.r2_key
      const mediaKind = c.media_content_type?.startsWith('video') ? 'Video'
        : c.media_content_type?.startsWith('image') ? 'Photo'
        : c.media_content_type?.startsWith('audio') ? 'Audio'
        : 'File'
      const preview = c.body?.trim()
        ? c.body
        : hasMedia ? `📎 ${mediaKind}` : ''
      return {
        contactId: c.contact_id,
        contactName: `${c.first_name} ${c.last_name}`,
        phone: c.phone,
        lastMessage: preview,
        lastDirection: c.direction,
        lastAt: c.created_at,
        unread: unreadMap[c.contact_id] || 0,
      }
    }).sort((a: any, b: any) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime())

    return NextResponse.json({ conversations: result })
  }

  // Get messages for a specific contact
  const messages = await prisma.message.findMany({
    where: { contactId },
    orderBy: { createdAt: 'asc' },
    include: {
      sender: { select: { id: true, name: true } },
    },
  })

  // Mark inbound messages as read
  await prisma.message.updateMany({
    where: { contactId, direction: 'inbound', readAt: null },
    data: { readAt: new Date() },
  })

  // Decorate each message with a ready-to-render mediaPublicUrl (R2 signed URL → Cloudinary → proxy fallback)
  const decorated = await Promise.all(
    messages.map(async m => ({ ...m, mediaPublicUrl: await buildMediaUrl(m) }))
  )

  return NextResponse.json({ messages: decorated })
}
