import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Content stage vehicles
  const stages = await prisma.vehicleStage.findMany({
    where: { stage: 'content', status: { notIn: ['done', 'skipped'] } },
    include: {
      vehicle: { select: { id: true, stockNumber: true, year: true, make: true, model: true, color: true } },
      assignee: { select: { id: true, name: true } },
    },
    orderBy: { priority: 'asc' },
  })

  const vehicles = stages.map(s => ({
    id: s.id,
    vehicleId: s.vehicleId,
    vehicle: s.vehicle,
    assignee: s.assignee,
    status: s.status,
    checklist: s.checklist as Array<{ item: string; done: boolean; note: string }>,
    priority: s.priority,
  }))

  // Standalone content tasks
  const tasks = await prisma.task.findMany({
    where: { category: 'content' },
    include: {
      assignee: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  })

  // Stats
  const total = vehicles.length
  const inProgress = vehicles.filter(v => v.status === 'in_progress').length

  // Completed today: count checklist items marked done today from activity logs
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const completedToday = await prisma.vehicleStage.count({
    where: { stage: 'content', status: 'done', completedAt: { gte: todayStart } },
  })

  return NextResponse.json({ vehicles, tasks, stats: { total, inProgress, completedToday } })
}
