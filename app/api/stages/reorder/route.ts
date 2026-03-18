import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { stage, orderedIds } = await request.json() as { stage: string; orderedIds: string[] }

  if (!stage || !Array.isArray(orderedIds)) {
    return NextResponse.json({ error: 'stage and orderedIds required' }, { status: 400 })
  }

  // Update priority for each vehicle's active stage record
  await prisma.$transaction(
    orderedIds.map((vehicleId, index) =>
      prisma.vehicleStage.updateMany({
        where: {
          vehicleId,
          stage,
          status: { not: 'done' },
        },
        data: { priority: index },
      })
    )
  )

  return NextResponse.json({ ok: true })
}
