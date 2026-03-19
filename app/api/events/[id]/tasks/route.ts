import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { sectionId, title, assigneeId, dueDate, priority, notes } = body

  if (!sectionId || !title) {
    return NextResponse.json({ error: 'Section and title are required' }, { status: 400 })
  }

  const maxTask = await prisma.eventTask.findFirst({
    where: { sectionId },
    orderBy: { sortOrder: 'desc' },
  })

  const task = await prisma.eventTask.create({
    data: {
      sectionId,
      title,
      assigneeId: assigneeId || null,
      dueDate: dueDate ? new Date(dueDate) : null,
      priority: priority || 'normal',
      notes,
      sortOrder: (maxTask?.sortOrder ?? -1) + 1,
    },
    include: {
      assignee: { select: { id: true, name: true } },
    },
  })

  if (assigneeId && assigneeId !== user.id) {
    const { id: eventId } = await params
    const event = await prisma.event.findUnique({ where: { id: eventId }, select: { name: true } })
    await prisma.notification.create({
      data: {
        userId: assigneeId,
        type: 'event_task_assigned',
        title: 'Event task assigned',
        message: `You've been assigned "${title}" for ${event?.name || 'an event'}`,
        entityType: 'event_task',
        entityId: task.id,
      },
    })
  }

  return NextResponse.json(task, { status: 201 })
}
