import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

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
        m.id, m.contact_id, m.direction, m.channel, m.body, m.status, m.read_at, m.created_at,
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

    const result = conversations.map((c: any) => ({
      contactId: c.contact_id,
      contactName: `${c.first_name} ${c.last_name}`,
      phone: c.phone,
      lastMessage: c.body,
      lastDirection: c.direction,
      lastAt: c.created_at,
      unread: unreadMap[c.contact_id] || 0,
    })).sort((a: any, b: any) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime())

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

  return NextResponse.json({ messages })
}
