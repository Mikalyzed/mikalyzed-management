import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { dispositionId, notes } = await req.json()

  if (!dispositionId) {
    return NextResponse.json({ error: 'dispositionId required' }, { status: 400 })
  }

  const disposition = await prisma.disposition.findUnique({ where: { id: dispositionId } })
  if (!disposition) return NextResponse.json({ error: 'Disposition not found' }, { status: 404 })

  // Create disposition log
  const log = await prisma.dispositionLog.create({
    data: {
      opportunityId: id,
      dispositionId,
      userId: user.id,
      notes: notes || null,
      followUpAt: disposition.followUpMinutes
        ? new Date(Date.now() + disposition.followUpMinutes * 60000)
        : null,
    },
  })

  // Log activity
  await prisma.activityEvent.create({
    data: {
      opportunityId: id,
      type: 'disposition_logged',
      description: `Logged disposition: ${disposition.name}`,
      actorId: user.id,
      metadata: { dispositionId, dispositionName: disposition.name },
    },
  })

  // Set firstContactAt if not already set
  await prisma.opportunity.updateMany({
    where: { id, firstContactAt: null },
    data: { firstContactAt: new Date() },
  })

  return NextResponse.json({ log })
}
