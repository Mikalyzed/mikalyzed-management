import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function GET(request: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')

  const where: Record<string, unknown> = {}
  if (status) where.status = status

  const events = await prisma.event.findMany({
    where,
    include: {
      owner: { select: { id: true, name: true } },
      sections: {
        orderBy: { sortOrder: 'asc' },
        include: {
          tasks: {
            orderBy: { sortOrder: 'asc' },
            select: { id: true, status: true },
          },
        },
      },
    },
    orderBy: { date: 'asc' },
  })

  const eventsWithProgress = events.map(event => {
    let totalTasks = 0
    let completedTasks = 0
    event.sections.forEach(s => {
      totalTasks += s.tasks.length
      completedTasks += s.tasks.filter(t => t.status === 'completed').length
    })
    return {
      ...event,
      progress: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
      totalTasks,
      completedTasks,
    }
  })

  return NextResponse.json(eventsWithProgress)
}

export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const body = await request.json()
  const { name, type, date, endDate, location, description, ownerId, sections } = body

  if (!name || !date) {
    return NextResponse.json({ error: 'Name and date are required' }, { status: 400 })
  }

  const event = await prisma.event.create({
    data: {
      name,
      type: type || 'dealership_event',
      date: new Date(date),
      endDate: endDate ? new Date(endDate) : null,
      location,
      description,
      ownerId: ownerId || user.id,
      createdById: user.id,
      sections: sections?.length
        ? {
            create: sections.map((s: { name: string }, i: number) => ({
              name: s.name,
              sortOrder: i,
            })),
          }
        : undefined,
    },
    include: {
      owner: { select: { id: true, name: true } },
      sections: { orderBy: { sortOrder: 'asc' } },
    },
  })

  await prisma.activityLog.create({
    data: {
      entityType: 'event',
      entityId: event.id,
      action: 'created',
      actorId: user.id,
      details: { name, type: type || 'dealership_event' },
    },
  })

  return NextResponse.json(event, { status: 201 })
}
