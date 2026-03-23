import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const { awaitingParts, expectedDate, partName, trackingNumber } = body

  const stage = await prisma.vehicleStage.findUnique({ where: { id } })
  if (!stage) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (awaitingParts) {
    await prisma.vehicleStage.update({
      where: { id },
      data: {
        awaitingParts: true,
        awaitingPartsDate: expectedDate ? new Date(expectedDate) : null,
        awaitingPartsSince: new Date(),
        awaitingPartsName: partName || null,
        awaitingPartsTracking: trackingNumber || null,
        status: 'blocked',
      },
    })
  } else {
    // Parts arrived — clear awaiting, set in_progress, move to priority 0
    await prisma.$transaction(async (tx) => {
      // Shift all other mechanic stages' priorities down by 1
      await tx.vehicleStage.updateMany({
        where: {
          stage: stage.stage,
          status: { not: 'done' },
          id: { not: id },
        },
        data: { priority: { increment: 1 } },
      })

      await tx.vehicleStage.update({
        where: { id },
        data: {
          awaitingParts: false,
          awaitingPartsDate: null,
          awaitingPartsSince: null,
          awaitingPartsName: null,
          awaitingPartsTracking: null,
          status: 'in_progress',
          priority: 0,
        },
      })
    })
  }

  return NextResponse.json({ ok: true })
}
