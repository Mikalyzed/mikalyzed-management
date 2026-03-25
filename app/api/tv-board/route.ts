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

  // Get top 4 vehicles per stage (in_progress first, then pending, ordered by priority)
  const vSelect = { stockNumber: true, year: true, make: true, model: true, color: true } as const
  const aSelect = { select: { name: true } } as const

  const getStageVehicles = async (stage: string) => {
    return prisma.vehicleStage.findMany({
      where: { stage, status: { in: ['in_progress', 'pending'] }, awaitingParts: false },
      include: { vehicle: { select: vSelect }, assignee: aSelect },
      orderBy: [{ status: 'asc' }, { priority: 'asc' }], // in_progress before pending
      take: 4,
    })
  }

  const [mechanicVehicles, detailingVehicles, contentVehicles, publishVehicles] = await Promise.all([
    getStageVehicles('mechanic'),
    getStageVehicles('detailing'),
    getStageVehicles('content'),
    getStageVehicles('publish'),
  ])

  // Awaiting parts
  const awaitingParts = await prisma.vehicleStage.findMany({
    where: { awaitingParts: true },
    include: { vehicle: { select: vSelect } },
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

  // Format jobs
  type StageRow = typeof mechanicVehicles[number]
  const formatJob = (s: StageRow) => ({
    stockNumber: s.vehicle.stockNumber,
    vehicle: `${s.vehicle.year ?? ''} ${s.vehicle.make} ${s.vehicle.model}`.trim(),
    color: (s.vehicle as Record<string, unknown>).color as string | null,
    assignee: s.assignee?.name || 'Unassigned',
    estimatedHours: s.estimatedHours,
    activeSeconds: s.activeSeconds,
    timerRunning: !!s.timerStartedAt,
    timerStartedAt: s.timerStartedAt?.toISOString() || null,
    stage: s.stage,
    status: s.status,
  })

  return NextResponse.json({
    pipeline,
    stageVehicles: {
      mechanic: mechanicVehicles.map(formatJob),
      detailing: detailingVehicles.map(formatJob),
      content: contentVehicles.map(formatJob),
      publish: publishVehicles.map(formatJob),
    },
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
