import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { DEFAULT_SLA_HOURS } from '@/lib/constants'

export async function GET(request: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Pipeline counts
  const pipeline = {
    mechanic: await prisma.vehicle.count({ where: { status: 'mechanic' } }),
    detailing: await prisma.vehicle.count({ where: { status: 'detailing' } }),
    content: await prisma.vehicle.count({ where: { status: 'content' } }),
    publish: await prisma.vehicle.count({ where: { status: 'publish' } }),
    completed: await prisma.vehicle.count({ where: { status: 'completed' } }),
    externalRepairs: await prisma.externalRepair.count({ where: { status: { notIn: ['completed', 'cancelled'] } } }),
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
      color: true,
      status: true,
    },
  })

  // ─── My Assignments (all roles) ───

  // Recon tasks assigned to me
  const myReconTasks = await prisma.vehicleStage.findMany({
    where: {
      assigneeId: user.id,
      status: { not: 'done' },
    },
    include: {
      vehicle: { select: { id: true, stockNumber: true, year: true, make: true, model: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })

  // Event tasks assigned to me
  const myEventTasks = await prisma.eventTask.findMany({
    where: {
      assigneeId: user.id,
      status: { not: 'completed' },
    },
    include: {
      section: {
        include: {
          event: { select: { id: true, name: true, date: true } },
        },
      },
    },
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    take: 10,
  })

  // Calendar items assigned to me (upcoming)
  const myCalendarItems = await prisma.calendarItem.findMany({
    where: {
      assignees: { some: { userId: user.id } },
      status: { notIn: ['completed', 'cancelled'] },
      date: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) }, // include today
    },
    include: {
      vehicle: { select: { id: true, stockNumber: true, make: true, model: true } },
      event: { select: { id: true, name: true } },
    },
    orderBy: { date: 'asc' },
    take: 10,
  })

  // Upcoming events (for admin)
  const upcomingEvents = user.role === 'admin' ? await prisma.event.findMany({
    where: {
      status: { in: ['draft', 'planned', 'active'] },
    },
    include: {
      owner: { select: { id: true, name: true } },
      sections: {
        include: {
          tasks: { select: { id: true, status: true } },
        },
      },
    },
    orderBy: { date: 'asc' },
    take: 5,
  }) : []

  const upcomingEventsWithProgress = upcomingEvents.map(e => {
    let total = 0, completed = 0
    e.sections.forEach(s => { total += s.tasks.length; completed += s.tasks.filter(t => t.status === 'completed').length })
    return {
      id: e.id, name: e.name, date: e.date, status: e.status,
      owner: e.owner,
      progress: total > 0 ? Math.round((completed / total) * 100) : 0,
      totalTasks: total, completedTasks: completed,
    }
  })

  return NextResponse.json({
    user: { name: user.name, role: user.role, id: user.id },
    pipeline,
    overdue,
    blocked,
    myTasks,
    recentVehicles,
    myReconTasks,
    myEventTasks,
    myCalendarItems,
    upcomingEvents: upcomingEventsWithProgress,
  })
}
