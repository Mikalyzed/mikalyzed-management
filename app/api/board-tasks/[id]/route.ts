import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json()

  const data: Record<string, unknown> = {}
  if (body.title !== undefined) data.title = body.title
  if (body.description !== undefined) data.description = body.description
  if (body.category !== undefined) data.category = body.category
  if (body.status !== undefined) {
    data.status = body.status
    if (body.status === 'done') data.completedAt = new Date()
    if (body.status !== 'done') data.completedAt = null
  }
  if (body.assigneeId !== undefined) data.assigneeId = body.assigneeId || null
  if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null
  if (body.priority !== undefined) data.priority = body.priority
  if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder
  if (body.subtasks !== undefined) data.subtasks = body.subtasks

  const task = await prisma.task.update({
    where: { id },
    data,
    include: {
      assignee: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
    },
  })

  return NextResponse.json(task)
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { id } = await params
  await prisma.task.delete({ where: { id } })

  return NextResponse.json({ success: true })
}
