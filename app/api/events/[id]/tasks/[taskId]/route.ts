import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { taskId } = await params
  const body = await request.json()
  const { title, assigneeId, dueDate, priority, status, notes, sortOrder } = body

  const data: Record<string, unknown> = {}
  if (title !== undefined) data.title = title
  if (assigneeId !== undefined) data.assigneeId = assigneeId || null
  if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null
  if (priority !== undefined) data.priority = priority
  if (notes !== undefined) data.notes = notes
  if (sortOrder !== undefined) data.sortOrder = sortOrder

  if (status !== undefined) {
    data.status = status
    data.completedAt = status === 'completed' ? new Date() : null
  }

  const task = await prisma.eventTask.update({
    where: { id: taskId },
    data,
    include: {
      assignee: { select: { id: true, name: true } },
    },
  })

  return NextResponse.json(task)
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { taskId } = await params
  await prisma.eventTask.delete({ where: { id: taskId } })
  return NextResponse.json({ success: true })
}
