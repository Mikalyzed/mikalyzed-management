import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  // Pipeline
  const pipeline = {
    mechanic: await prisma.vehicle.count({ where: { status: 'mechanic' } }),
    detailing: await prisma.vehicle.count({ where: { status: 'detailing' } }),
    content: await prisma.vehicle.count({ where: { status: 'content' } }),
    publish: await prisma.vehicle.count({ where: { status: 'publish' } }),
    completed: await prisma.vehicle.count({ where: { status: 'completed' } }),
  }

  // Totals
  const totalVehicles = await prisma.vehicle.count()
  const completedThisWeek = await prisma.vehicle.count({
    where: { status: 'completed', completedAt: { gte: weekAgo } },
  })
  const completedThisMonth = await prisma.vehicle.count({
    where: { status: 'completed', completedAt: { gte: monthAgo } },
  })

  // Time in stage for active vehicles
  const activeVehicles = await prisma.vehicle.findMany({
    where: { status: { not: 'completed' } },
    include: {
      stages: {
        where: { status: { notIn: ['done', 'skipped'] } },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  })

  const vehiclesInStage = activeVehicles
    .filter((v) => v.stages[0])
    .map((v) => {
      const stage = v.stages[0]
      const elapsed = (now.getTime() - stage.startedAt.getTime()) / 1000 - stage.totalBlockedSeconds
      const hoursInStage = Math.max(0, elapsed / 3600)
      return {
        id: v.id,
        stockNumber: v.stockNumber,
        year: v.year,
        make: v.make,
        model: v.model,
        status: v.status,
        stageStatus: stage.status,
        hoursInStage,
      }
    })
    .sort((a, b) => b.hoursInStage - a.hoursInStage)

  // Avg stage times (completed stages only, last 30 days)
  const completedStages = await prisma.vehicleStage.findMany({
    where: {
      status: 'done',
      completedAt: { gte: monthAgo },
    },
    select: { stage: true, startedAt: true, completedAt: true, totalBlockedSeconds: true },
  })

  const stageGroups: Record<string, number[]> = {}
  for (const s of completedStages) {
    if (!s.completedAt) continue
    const hours = (s.completedAt.getTime() - s.startedAt.getTime()) / 3600000 - (s.totalBlockedSeconds / 3600)
    if (!stageGroups[s.stage]) stageGroups[s.stage] = []
    stageGroups[s.stage].push(Math.max(0, hours))
  }

  const stageTimes = Object.entries(stageGroups).map(([stage, hours]) => ({
    stage,
    avgHours: hours.reduce((a, b) => a + b, 0) / hours.length,
    count: hours.length,
  }))

  // Transport
  const transportOpen = await prisma.transportRequest.count({
    where: { status: { not: 'delivered' } },
  })
  const transportDelivered = await prisma.transportRequest.count({
    where: { status: 'delivered' },
  })

  return NextResponse.json({
    pipeline,
    vehiclesInStage,
    stageTimes,
    completedThisWeek,
    completedThisMonth,
    totalVehicles,
    transportOpen,
    transportDelivered,
  })
}
