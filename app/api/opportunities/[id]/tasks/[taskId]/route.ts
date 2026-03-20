import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, taskId } = await params
  const body = await request.json()
  const { title, dueDate, assigneeId, status, notes } = body

  const data: Record<string, unknown> = {}
  if (title !== undefined) data.title = title
  if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null
  if (assigneeId !== undefined) data.assigneeId = assigneeId || null
  if (notes !== undefined) data.notes = notes || null
  if (status !== undefined) {
    data.status = status
    data.completedAt = status === 'completed' ? new Date() : null
    if (status === 'completed') {
      await prisma.activityEvent.create({
        data: {
          opportunityId: id,
          type: 'task_completed',
          description: `Task completed`,
          actorId: user.id,
        },
      })
    }
  }

  const task = await prisma.opportunityTask.update({
    where: { id: taskId },
    data,
    include: { assignee: { select: { id: true, name: true } } },
  })

  return NextResponse.json(task)
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { taskId } = await params
  await prisma.opportunityTask.delete({ where: { id: taskId } })
  return NextResponse.json({ success: true })
}
