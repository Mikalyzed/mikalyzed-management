import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, role: true } },
      createdBy: { select: { id: true, name: true } },
      sections: {
        orderBy: { sortOrder: 'asc' },
        include: {
          tasks: {
            orderBy: { sortOrder: 'asc' },
            include: {
              assignee: { select: { id: true, name: true, role: true } },
            },
          },
        },
      },
      calendarItems: {
        include: {
          assignees: { include: { user: { select: { id: true, name: true } } } },
        },
        orderBy: { date: 'asc' },
      },
    },
  })

  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let totalTasks = 0
  let completedTasks = 0
  const sectionsWithProgress = event.sections.map(s => {
    const sTotal = s.tasks.length
    const sCompleted = s.tasks.filter(t => t.status === 'completed').length
    totalTasks += sTotal
    completedTasks += sCompleted
    return {
      ...s,
      progress: sTotal > 0 ? Math.round((sCompleted / sTotal) * 100) : 0,
      totalTasks: sTotal,
      completedTasks: sCompleted,
    }
  })

  return NextResponse.json({
    ...event,
    sections: sectionsWithProgress,
    progress: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
    totalTasks,
    completedTasks,
  })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const { name, type, date, endDate, location, description, status, ownerId } = body

  const data: Record<string, unknown> = {}
  if (name !== undefined) data.name = name
  if (type !== undefined) data.type = type
  if (date !== undefined) data.date = new Date(date)
  if (endDate !== undefined) data.endDate = endDate ? new Date(endDate) : null
  if (location !== undefined) data.location = location
  if (description !== undefined) data.description = description
  if (status !== undefined) data.status = status
  if (ownerId !== undefined) data.ownerId = ownerId

  const event = await prisma.event.update({ where: { id }, data })

  if (status) {
    await prisma.activityLog.create({
      data: {
        entityType: 'event',
        entityId: id,
        action: 'status_changed',
        actorId: user.id,
        details: { status },
      },
    })
  }

  return NextResponse.json(event)
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { id } = await params
  await prisma.event.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
