import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const item = await prisma.calendarItem.findUnique({
    where: { id },
    include: {
      assignees: { include: { user: { select: { id: true, name: true, role: true } } } },
      vehicle: { select: { id: true, stockNumber: true, year: true, make: true, model: true, color: true } },
      event: { select: { id: true, name: true, date: true } },
      createdBy: { select: { id: true, name: true } },
    },
  })

  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(item)
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const { title, type, date, endDate, allDay, location, notes, status, vehicleId, eventId, assigneeIds } = body

  const data: Record<string, unknown> = {}
  if (title !== undefined) data.title = title
  if (type !== undefined) data.type = type
  if (date !== undefined) data.date = new Date(date)
  if (endDate !== undefined) data.endDate = endDate ? new Date(endDate) : null
  if (allDay !== undefined) data.allDay = allDay
  if (location !== undefined) data.location = location
  if (notes !== undefined) data.notes = notes
  if (status !== undefined) data.status = status
  if (vehicleId !== undefined) data.vehicleId = vehicleId || null
  if (eventId !== undefined) data.eventId = eventId || null

  const item = await prisma.calendarItem.update({
    where: { id },
    data,
    include: {
      assignees: { include: { user: { select: { id: true, name: true } } } },
    },
  })

  // Update assignees if provided
  if (assigneeIds !== undefined) {
    await prisma.calendarAssignee.deleteMany({ where: { calendarItemId: id } })
    if (assigneeIds.length > 0) {
      await prisma.calendarAssignee.createMany({
        data: assigneeIds.map((userId: string) => ({ calendarItemId: id, userId })),
      })
    }
  }

  if (status) {
    await prisma.activityLog.create({
      data: {
        entityType: 'calendar_item',
        entityId: id,
        action: 'status_changed',
        actorId: user.id,
        details: { status },
      },
    })
  }

  return NextResponse.json(item)
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { id } = await params
  await prisma.calendarItem.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
