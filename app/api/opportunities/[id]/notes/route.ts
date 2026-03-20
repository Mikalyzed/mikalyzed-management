import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { body } = await request.json()
  if (!body?.trim()) return NextResponse.json({ error: 'Note body required' }, { status: 400 })

  const note = await prisma.opportunityNote.create({
    data: { opportunityId: id, body, createdById: user.id },
    include: { createdBy: { select: { id: true, name: true } } },
  })

  await prisma.activityEvent.create({
    data: {
      opportunityId: id,
      type: 'note_added',
      description: body.length > 80 ? body.substring(0, 80) + '...' : body,
      actorId: user.id,
    },
  })

  return NextResponse.json(note, { status: 201 })
}
