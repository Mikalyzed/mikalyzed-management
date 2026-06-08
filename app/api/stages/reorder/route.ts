import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { stage, orderedIds } = await request.json() as { stage: string; orderedIds: string[] }

  if (!stage || !Array.isArray(orderedIds)) {
    return NextResponse.json({ error: 'stage and orderedIds required' }, { status: 400 })
  }

  // Admins can reorder any stage. Content team can reorder the content stage only
  // (matches their UI parity on the content board).
  const isAdmin = user.role === 'admin'
  const contentReorderingContent = user.role === 'content' && stage === 'content'
  if (!isAdmin && !contentReorderingContent) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Update priority for each vehicle's active stage record
  await prisma.$transaction(
    orderedIds.map((vehicleId, index) =>
      prisma.vehicleStage.updateMany({
        where: {
          vehicleId,
          stage,
          status: { notIn: ['done', 'skipped'] },
        },
        data: { priority: index },
      })
    )
  )

  return NextResponse.json({ ok: true })
}
