import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function GET(request: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const start = searchParams.get('start')
  const end = searchParams.get('end')
  const type = searchParams.get('type')
  const assigneeId = searchParams.get('assigneeId')
  const status = searchParams.get('status')
  const vehicleId = searchParams.get('vehicleId')
  const eventId = searchParams.get('eventId')

  const where: Record<string, unknown> = {}
  if (start || end) {
    where.date = {}
    if (start) (where.date as Record<string, unknown>).gte = new Date(start)
    if (end) (where.date as Record<string, unknown>).lte = new Date(end)
  }
  if (type) where.type = type
  if (status) where.status = status
  else where.status = { not: 'cancelled' }
  if (vehicleId) where.vehicleId = vehicleId
  if (eventId) where.eventId = eventId
  if (assigneeId) {
    where.assignees = { some: { userId: assigneeId } }
  }

  const items = await prisma.calendarItem.findMany({
    where,
    include: {
      assignees: { include: { user: { select: { id: true, name: true, role: true } } } },
      vehicle: { select: { id: true, stockNumber: true, year: true, make: true, model: true } },
      event: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: { date: 'asc' },
  })

  return NextResponse.json(items)
}

export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { title, type, date, endDate, allDay, location, notes, vehicleId, eventId, assigneeIds } = body

  if (!title || !date) {
    return NextResponse.json({ error: 'Title and date are required' }, { status: 400 })
  }

  const item = await prisma.calendarItem.create({
    data: {
      title,
      type: type || 'errand',
      date: new Date(date),
      endDate: endDate ? new Date(endDate) : null,
      allDay: allDay || false,
      location,
      notes,
      vehicleId,
      eventId,
      createdById: user.id,
      assignees: assigneeIds?.length
        ? { create: assigneeIds.map((userId: string) => ({ userId })) }
        : undefined,
    },
    include: {
      assignees: { include: { user: { select: { id: true, name: true } } } },
      vehicle: { select: { id: true, stockNumber: true, make: true, model: true } },
    },
  })

  // Notify assignees
  if (assigneeIds?.length) {
    await prisma.notification.createMany({
      data: assigneeIds
        .filter((id: string) => id !== user.id)
        .map((userId: string) => ({
          userId,
          type: 'calendar_assigned',
          title: 'New calendar item assigned',
          message: `You've been assigned to: ${title}`,
          entityType: 'calendar_item',
          entityId: item.id,
        })),
    })
  }

  await prisma.activityLog.create({
    data: {
      entityType: 'calendar_item',
      entityId: item.id,
      action: 'created',
      actorId: user.id,
      details: { title, type: type || 'errand' },
    },
  })

  return NextResponse.json(item, { status: 201 })
}
