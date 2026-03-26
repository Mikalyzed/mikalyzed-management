import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

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

  // Completed today (vehicles)
  const completedToday = await prisma.vehicleStage.findMany({
    where: { stage: 'content', status: 'done', completedAt: { gte: todayStart } },
    include: {
      vehicle: { select: { id: true, stockNumber: true, year: true, make: true, model: true, color: true } },
      assignee: { select: { id: true, name: true } },
    },
    orderBy: { completedAt: 'desc' },
  })

  // Standalone content tasks (not done)
  const contentTasks = await prisma.task.findMany({
    where: { category: 'content', status: { not: 'done' } },
    include: {
      assignee: { select: { id: true, name: true } },
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  })

  // Completed content tasks today
  const completedTasks = await prisma.task.findMany({
    where: { category: 'content', status: 'done', updatedAt: { gte: todayStart } },
    include: {
      assignee: { select: { id: true, name: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })

  const active = stages.filter(s => s.status === 'in_progress')
  const activeTasks = contentTasks.filter(t => t.status === 'in_progress')
  const queuedVehicles = stages.filter(s => s.status === 'pending')
  const queuedTasks = contentTasks.filter(t => t.status === 'todo')

  const formatStage = (s: typeof stages[number]) => ({
    id: s.id,
    vehicleId: s.vehicle.id,
    vehicle: s.vehicle,
    assignee: s.assignee,
    status: s.status,
    checklist: s.checklist as { item: string; done: boolean; note: string }[],
    priority: s.priority,
    type: 'vehicle' as const,
  })

  const formatTask = (t: typeof contentTasks[number]) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    assignee: t.assignee,
    status: t.status,
    type: 'task' as const,
  })

  return NextResponse.json({
    active: active.map(formatStage),
    activeTasks: activeTasks.map(formatTask),
    queuedVehicles: queuedVehicles.map(formatStage),
    queuedTasks: queuedTasks.map(formatTask),
    completedToday: completedToday.map(formatStage),
    completedTasks: completedTasks.map(formatTask),
    stats: {
      total: stages.length + contentTasks.length,
      inProgress: active.length + activeTasks.length,
      completedToday: completedToday.length + completedTasks.length,
    },
  })
}
