import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { contactId, body } = await req.json()

  if (!contactId || !body?.trim()) {
    return NextResponse.json({ error: 'contactId and body are required' }, { status: 400 })
  }

  const message = await prisma.message.create({
    data: {
      contactId,
      direction: 'outbound',
      channel: 'internal',
      body: body.trim(),
      status: 'sent',
      senderId: user.id,
    },
  })

  return NextResponse.json({ message })
}
