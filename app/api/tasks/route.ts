import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function GET(request: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tasks = await prisma.vehicleStage.findMany({
    where: {
      assigneeId: user.id,
      status: { not: 'done' },
    },
    include: {
      vehicle: {
        select: {
          id: true,
          stockNumber: true,
          year: true,
          make: true,
          model: true,
          color: true,
          status: true,
        },
      },
    },
    orderBy: { startedAt: 'asc' },
  })

  return NextResponse.json({ tasks })
}
