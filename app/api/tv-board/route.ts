import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const now = new Date()
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)

  // Pipeline counts
  const stages = ['mechanic', 'detailing', 'content', 'publish'] as const
  const pipeline: Record<string, { total: number; inProgress: number; pending: number; done: number }> = {}

  for (const stage of stages) {
    const [inProgress, pending, doneToday] = await Promise.all([
      prisma.vehicleStage.count({ where: { stage, status: 'in_progress', awaitingParts: false } }),
      prisma.vehicleStage.count({ where: { stage, status: 'pending' } }),
      prisma.vehicleStage.count({ where: { stage, status: 'done', completedAt: { gte: todayStart } } }),
    ])
    pipeline[stage] = { total: inProgress + pending, inProgress, pending, done: doneToday }
  }

  // Active mechanic work
  const mechanicActive = await prisma.vehicleStage.findMany({
    where: { stage: 'mechanic', status: 'in_progress', awaitingParts: false },
    include: {
      vehicle: { select: { stockNumber: true, year: true, make: true, model: true, color: true } },
      assignee: { select: { name: true } },
    },
    orderBy: { priority: 'asc' },
  })

  // Awaiting parts
  const awaitingParts = await prisma.vehicleStage.findMany({
    where: { awaitingParts: true },
    include: {
      vehicle: { select: { stockNumber: true, year: true, make: true, model: true } },
    },
  })

  // Active detailing work
  const detailingActive = await prisma.vehicleStage.findMany({
    where: { stage: 'detailing', status: 'in_progress' },
    include: {
      vehicle: { select: { stockNumber: true, year: true, make: true, model: true, color: true } },
      assignee: { select: { name: true } },
    },
  })

  // Active content work
  const contentActive = await prisma.vehicleStage.findMany({
    where: { stage: 'content', status: 'in_progress' },
    include: {
      vehicle: { select: { stockNumber: true, year: true, make: true, model: true, color: true } },
      assignee: { select: { name: true } },
    },
  })

  // External repairs
  const externalCount = await prisma.externalRepair.count({ where: { status: 'sent' } })

  // Completed today across all stages
  const completedToday = await prisma.vehicleStage.count({
    where: { status: 'done', completedAt: { gte: todayStart } },
  })

  // Total inventory
  const totalInventory = await prisma.vehicle.count({ where: { status: { notIn: ['completed', 'sold'] } } })
  const inRecon = await prisma.vehicle.count({ where: { status: { in: ['mechanic', 'detailing', 'content', 'publish'] } } })

  // Today's completed vehicles (for the feed)
  const completedVehicles = await prisma.vehicleStage.findMany({
    where: { status: 'done', completedAt: { gte: todayStart } },
    include: {
      vehicle: { select: { stockNumber: true, year: true, make: true, model: true } },
      assignee: { select: { name: true } },
    },
    orderBy: { completedAt: 'desc' },
    take: 10,
  })

  // Format active jobs
  const formatJob = (s: typeof mechanicActive[number]) => ({
    stockNumber: s.vehicle.stockNumber,
    vehicle: `${s.vehicle.year ?? ''} ${s.vehicle.make} ${s.vehicle.model}`.trim(),
    color: (s.vehicle as Record<string, unknown>).color as string | null,
    assignee: s.assignee?.name || 'Unassigned',
    estimatedHours: s.estimatedHours,
    activeSeconds: s.activeSeconds,
    timerRunning: !!s.timerStartedAt,
    timerStartedAt: s.timerStartedAt?.toISOString() || null,
    stage: s.stage,
  })

  return NextResponse.json({
    pipeline,
    mechanicActive: mechanicActive.map(formatJob),
    detailingActive: detailingActive.map(formatJob),
    contentActive: contentActive.map(formatJob),
    awaitingParts: awaitingParts.length,
    externalRepairs: externalCount,
    completedToday,
    totalInventory,
    inRecon,
    completedVehicles: completedVehicles.map(s => ({
      stockNumber: s.vehicle.stockNumber,
      vehicle: `${s.vehicle.year ?? ''} ${s.vehicle.make} ${s.vehicle.model}`.trim(),
      stage: s.stage,
      assignee: s.assignee?.name || null,
      completedAt: s.completedAt?.toISOString(),
    })),
    timestamp: now.toISOString(),
  })
}
