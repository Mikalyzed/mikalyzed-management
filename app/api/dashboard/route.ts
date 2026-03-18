import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { DEFAULT_SLA_HOURS } from '@/lib/constants'

export async function GET(request: Request) {
  const user = await getSessionUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Pipeline counts
  const pipeline = {
    mechanic: await prisma.vehicle.count({ where: { status: 'mechanic' } }),
    detailing: await prisma.vehicle.count({ where: { status: 'detailing' } }),
    content: await prisma.vehicle.count({ where: { status: 'content' } }),
    publish: await prisma.vehicle.count({ where: { status: 'publish' } }),
    completed: await prisma.vehicle.count({ where: { status: 'completed' } }),
  }

  // Overdue count — vehicles where current stage exceeds SLA
  const now = new Date()
  const allActive = await prisma.vehicle.findMany({
    where: { status: { not: 'completed' } },
    include: {
      stages: {
        where: { status: { not: 'done' } },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  })

  let overdue = 0
  let blocked = 0
  for (const v of allActive) {
    const stage = v.stages[0]
    if (!stage) continue
    if (stage.status === 'blocked') {
      blocked++
      continue
    }
    const slaHours = DEFAULT_SLA_HOURS[stage.stage as keyof typeof DEFAULT_SLA_HOURS] || 24
    const elapsed = (now.getTime() - stage.startedAt.getTime()) / 1000 - stage.totalBlockedSeconds
    if (elapsed > slaHours * 3600) overdue++
  }

  // My tasks count (for workers)
  const roleToStage: Record<string, string> = {
    mechanic: 'mechanic',
    detailer: 'detailing',
    content: 'content',
  }
  const myStage = roleToStage[user.role]
  const myTasks = myStage
    ? await prisma.vehicleStage.count({
        where: {
          assigneeId: user.id,
          stage: myStage,
          status: { not: 'done' },
        },
      })
    : 0

  // Recent vehicles
  const recentVehicles = await prisma.vehicle.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      stockNumber: true,
      year: true,
      make: true,
      model: true,
      status: true,
    },
  })

  return NextResponse.json({
    user: { name: user.name, role: user.role },
    pipeline,
    overdue,
    blocked,
    myTasks,
    recentVehicles,
  })
}
