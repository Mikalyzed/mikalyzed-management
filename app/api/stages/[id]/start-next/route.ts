import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const { pauseReason } = body

  if (!pauseReason) {
    return NextResponse.json({ error: 'Pause reason is required' }, { status: 400 })
  }

  // Set pause reason on current stage
  const currentStage = await prisma.vehicleStage.findUnique({ where: { id } })
  if (!currentStage) return NextResponse.json({ error: 'Stage not found' }, { status: 404 })

  if (currentStage.status !== 'in_progress') {
    return NextResponse.json({ error: 'Stage is not in progress' }, { status: 400 })
  }

  await prisma.vehicleStage.update({
    where: { id },
    data: { pauseReason },
  })

  // Find next pending mechanic stage by priority
  const nextStage = await prisma.vehicleStage.findFirst({
    where: {
      stage: 'mechanic',
      status: 'pending',
      awaitingParts: false,
    },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    include: {
      vehicle: { select: { id: true, stockNumber: true, year: true, make: true, model: true, color: true } },
    },
  })

  if (!nextStage) {
    return NextResponse.json({ error: 'No queued vehicles available' }, { status: 404 })
  }

  const started = await prisma.vehicleStage.update({
    where: { id: nextStage.id },
    data: { status: 'in_progress', startedAt: new Date() },
    include: {
      vehicle: { select: { id: true, stockNumber: true, year: true, make: true, model: true, color: true } },
    },
  })

  // Log activity
  await prisma.activityLog.create({
    data: {
      entityType: 'stage',
      entityId: id,
      action: 'paused',
      actorId: user.id,
      details: { pauseReason, startedNextId: nextStage.id },
    },
  })

  return NextResponse.json({ started })
}
