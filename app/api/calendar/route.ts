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

  // Synthesize transport + event entries so they appear on the calendar too
  const dateRange: { gte?: Date; lte?: Date } = {}
  if (start) dateRange.gte = new Date(start)
  if (end) dateRange.lte = new Date(end)

  type Synth = typeof items[number]
  const synthItems: Synth[] = []

  // Transports — only include if filter doesn't exclude them
  const includeTransports = !type || type === 'transport'
  if (includeTransports && !vehicleId && !eventId && !assigneeId) {
    const transportWhere: Record<string, unknown> = {
      scheduledDate: { not: null },
      status: { not: 'cancelled' },
    }
    if (dateRange.gte || dateRange.lte) {
      transportWhere.scheduledDate = {
        ...(dateRange.gte ? { gte: dateRange.gte } : {}),
        ...(dateRange.lte ? { lte: dateRange.lte } : {}),
      }
    }
    const transports = await prisma.transportRequest.findMany({
      where: transportWhere,
      include: {
        vehicle: { select: { id: true, stockNumber: true, year: true, make: true, model: true } },
        coordinator: { select: { id: true, name: true, role: true } },
      },
    })
    for (const t of transports) {
      const vehicleDesc = t.vehicleDescription ||
        (t.vehicle ? `${t.vehicle.year ?? ''} ${t.vehicle.make} ${t.vehicle.model}`.trim() : 'Vehicle')
      synthItems.push({
        id: `transport-${t.id}`,
        title: `Transport: ${vehicleDesc}`,
        type: 'transport',
        date: t.scheduledDate as Date,
        endDate: null,
        allDay: false,
        location: t.deliveryLocation || t.pickupLocation,
        notes: t.notes,
        status: t.status === 'delivered' ? 'completed' : 'scheduled',
        vehicleId: t.vehicleId,
        eventId: null,
        createdById: t.requestedById,
        assignees: t.coordinator
          ? [{ user: t.coordinator, userId: t.coordinator.id, calendarItemId: `transport-${t.id}` } as any]
          : [],
        vehicle: t.vehicle,
        event: null,
        createdBy: null,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      } as any)
    }
  }

  // Events — only include if filter doesn't exclude them
  const includeEvents = !type || type === 'event'
  if (includeEvents && !vehicleId && !eventId && !assigneeId) {
    const eventWhere: Record<string, unknown> = {
      status: { not: 'cancelled' },
    }
    if (dateRange.gte || dateRange.lte) {
      eventWhere.date = {
        ...(dateRange.gte ? { gte: dateRange.gte } : {}),
        ...(dateRange.lte ? { lte: dateRange.lte } : {}),
      }
    }
    const events = await prisma.event.findMany({
      where: eventWhere,
      include: { owner: { select: { id: true, name: true, role: true } } },
    })
    for (const e of events) {
      synthItems.push({
        id: `event-${e.id}`,
        title: e.name,
        type: 'event',
        date: e.date,
        endDate: e.endDate,
        allDay: !e.endDate,
        location: e.location,
        notes: e.description,
        status: e.status === 'completed' ? 'completed' : 'scheduled',
        vehicleId: null,
        eventId: e.id,
        createdById: e.createdById,
        assignees: e.owner
          ? [{ user: e.owner, userId: e.owner.id, calendarItemId: `event-${e.id}` } as any]
          : [],
        vehicle: null,
        event: { id: e.id, name: e.name },
        createdBy: null,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
      } as any)
    }
  }

  const merged = [...items, ...synthItems].sort((a, b) =>
    new Date(a.date).getTime() - new Date(b.date).getTime()
  )

  return NextResponse.json(merged)
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
