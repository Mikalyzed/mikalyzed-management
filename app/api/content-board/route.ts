import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

function todayET(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const today = todayET()
  const todayStart = new Date(today + 'T00:00:00-04:00')
  const todayEnd = new Date(today + 'T23:59:59-04:00')

  // All content stages not done
  const stages = await prisma.vehicleStage.findMany({
    where: { stage: 'content', status: { notIn: ['done', 'skipped'] } },
    include: {
      vehicle: { select: { id: true, stockNumber: true, year: true, make: true, model: true, color: true } },
      assignee: { select: { id: true, name: true } },
    },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  })

  // Week start (Monday)
  const now = new Date()
  const dayOfWeek = now.getDay()
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const weekStart = new Date(today + 'T00:00:00-04:00')
  weekStart.setDate(weekStart.getDate() + mondayOffset)

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
    where: { category: 'content', status: { notIn: ['done', 'skipped'] } },
    include: { assignee: { select: { id: true, name: true } } },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  })

  // Completed content tasks today
  const completedTasks = await prisma.task.findMany({
    where: { category: 'content', status: 'done', updatedAt: { gte: todayStart } },
    include: { assignee: { select: { id: true, name: true } } },
    orderBy: { updatedAt: 'desc' },
  })

  // Completed this week (vehicles) — excluding today to avoid duplicates
  const completedThisWeek = await prisma.vehicleStage.findMany({
    where: { stage: 'content', status: 'done', completedAt: { gte: weekStart, lt: todayStart } },
    include: {
      vehicle: { select: { id: true, stockNumber: true, year: true, make: true, model: true, color: true } },
      assignee: { select: { id: true, name: true } },
    },
    orderBy: { completedAt: 'desc' },
  })

  const completedTasksThisWeek = await prisma.task.findMany({
    where: { category: 'content', status: 'done', updatedAt: { gte: weekStart, lt: todayStart } },
    include: { assignee: { select: { id: true, name: true } } },
    orderBy: { updatedAt: 'desc' },
  })

  const isScheduledToday = (d: Date | null) => {
    if (!d) return false
    return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) === today
  }

  // Active = in_progress
  const activeVehicles = stages.filter(s => s.status === 'in_progress')
  const activeTasks = contentTasks.filter(t => t.status === 'in_progress')

  // Today = scheduled for today but NOT in_progress
  const todayVehicles = stages.filter(s => s.status !== 'in_progress' && isScheduledToday(s.scheduledDate))
  const todayTasks = contentTasks.filter(t => t.status !== 'in_progress' && isScheduledToday(t.scheduledDate))

  // Queue = not in_progress and not scheduled today
  const queuedVehicles = stages.filter(s => s.status !== 'in_progress' && !isScheduledToday(s.scheduledDate))
  const queuedTasks = contentTasks.filter(t => t.status !== 'in_progress' && !isScheduledToday(t.scheduledDate))

  const formatStage = (s: typeof stages[number]) => ({
    id: s.id, vehicleId: s.vehicle.id, vehicle: s.vehicle,
    assignee: s.assignee, status: s.status,
    checklist: s.checklist as { item: string; done: boolean; note: string }[],
    priority: s.priority, scheduledDate: s.scheduledDate, completedAt: s.completedAt?.toISOString() || null, type: 'vehicle' as const,
  })

  const formatTask = (t: typeof contentTasks[number]) => ({
    id: t.id, title: t.title, description: t.description,
    assignee: t.assignee, status: t.status,
    scheduledDate: t.scheduledDate, type: 'task' as const,
    subtasks: (t.subtasks as { item: string; done: boolean }[] | null) || [],
  })

  return NextResponse.json({
    active: activeVehicles.map(formatStage),
    activeTasks: activeTasks.map(formatTask),
    today: todayVehicles.map(formatStage),
    todayTasks: todayTasks.map(formatTask),
    queuedVehicles: queuedVehicles.map(formatStage),
    queuedTasks: queuedTasks.map(formatTask),
    completedToday: completedToday.map(formatStage),
    completedTasks: completedTasks.map(formatTask),
    completedThisWeek: completedThisWeek.map(formatStage),
    completedTasksThisWeek: completedTasksThisWeek.map(formatTask),
    stats: {
      total: stages.length + contentTasks.length,
      activeCount: activeVehicles.length + activeTasks.length,
      todayCount: todayVehicles.length + todayTasks.length,
      completedToday: completedToday.length + completedTasks.length,
      completedThisWeek: completedToday.length + completedTasks.length + completedThisWeek.length + completedTasksThisWeek.length,
    },
  })
}
