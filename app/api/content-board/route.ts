import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

const MAX_TODAY = 3 // Default vehicles for today's batch

export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const now = new Date()
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)

  // All content stages not done
  const stages = await prisma.vehicleStage.findMany({
    where: { stage: 'content', status: { not: 'done' } },
    include: {
      vehicle: { select: { id: true, stockNumber: true, year: true, make: true, model: true, color: true } },
      assignee: { select: { id: true, name: true } },
    },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  })

  // Completed today
  const completedToday = await prisma.vehicleStage.findMany({
    where: { stage: 'content', status: 'done', completedAt: { gte: todayStart } },
    include: {
      vehicle: { select: { id: true, stockNumber: true, year: true, make: true, model: true, color: true } },
      assignee: { select: { id: true, name: true } },
    },
    orderBy: { completedAt: 'desc' },
  })

  // Split: in_progress first, then pending
  const inProgress = stages.filter(s => s.status === 'in_progress')
  const pending = stages.filter(s => s.status === 'pending')

  // Today = all in_progress + top pending to fill up to MAX_TODAY
  const todaySlots = Math.max(0, MAX_TODAY - inProgress.length)
  const todayPending = pending.slice(0, todaySlots)
  const queue = pending.slice(todaySlots)

  const format = (s: typeof stages[number]) => ({
    id: s.id,
    vehicleId: s.vehicle.id,
    vehicle: s.vehicle,
    assignee: s.assignee,
    status: s.status,
    checklist: s.checklist as { item: string; done: boolean; note: string }[],
    priority: s.priority,
  })

  return NextResponse.json({
    today: [...inProgress, ...todayPending].map(format),
    queue: queue.map(format),
    completedToday: completedToday.map(format),
    stats: {
      total: stages.length,
      inProgress: inProgress.length,
      completedToday: completedToday.length,
    },
  })
}
