import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { DEFAULT_SLA_HOURS } from '@/lib/constants'

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

  // Overdue
  const activeVehicles = await prisma.vehicle.findMany({
    where: { status: { not: 'completed' } },
    include: {
      stages: {
        where: { status: { not: 'done' } },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  })

  const overdue = activeVehicles
    .filter((v) => {
      const stage = v.stages[0]
      if (!stage || stage.status === 'blocked') return false
      const sla = DEFAULT_SLA_HOURS[stage.stage as keyof typeof DEFAULT_SLA_HOURS] || 24
      const elapsed = (now.getTime() - stage.startedAt.getTime()) / 1000 - stage.totalBlockedSeconds
      return elapsed > sla * 3600
    })
    .map((v) => {
      const stage = v.stages[0]
      const sla = DEFAULT_SLA_HOURS[stage.stage as keyof typeof DEFAULT_SLA_HOURS] || 24
      const elapsed = (now.getTime() - stage.startedAt.getTime()) / 1000 - stage.totalBlockedSeconds
      const hoursOverdue = (elapsed / 3600) - sla
      return {
        id: v.id,
        stockNumber: v.stockNumber,
        year: v.year,
        make: v.make,
        model: v.model,
        status: v.status,
        hoursInStage: hoursOverdue,
      }
    })

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
    overdue,
    stageTimes,
    completedThisWeek,
    completedThisMonth,
    totalVehicles,
    transportOpen,
    transportDelivered,
  })
}
