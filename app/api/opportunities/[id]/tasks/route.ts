import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { title, dueDate, assigneeId, notes } = await request.json()
  if (!title?.trim()) return NextResponse.json({ error: 'Title required' }, { status: 400 })

  const task = await prisma.opportunityTask.create({
    data: {
      opportunityId: id,
      title,
      dueDate: dueDate ? new Date(dueDate) : null,
      assigneeId: assigneeId || null,
      notes: notes || null,
      createdById: user.id,
    },
    include: { assignee: { select: { id: true, name: true } } },
  })

  await prisma.activityEvent.create({
    data: {
      opportunityId: id,
      type: 'task_created',
      description: `Task: ${title}`,
      actorId: user.id,
    },
  })

  return NextResponse.json(task, { status: 201 })
}
