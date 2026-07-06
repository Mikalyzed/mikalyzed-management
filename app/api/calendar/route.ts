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

  // Content shoots — scheduled items from the content board: vehicles in the
  // content stage plus standalone content tasks. Surface them here so the
  // calendar shows what the content person is filming and when.
  // The content board stores "day only" items at noon ET (16:00 UTC) as a
  // sentinel — render those as all-day rather than a misleading 12:00 PM.
  const isNoonSentinel = (d: Date) => d.getUTCHours() === 16 && d.getUTCMinutes() === 0
  const includeContent = !type || type === 'content_shoot'
  if (includeContent && !eventId) {
    const hasRange = dateRange.gte || dateRange.lte
    const schedWhere = hasRange
      ? { ...(dateRange.gte ? { gte: dateRange.gte } : {}), ...(dateRange.lte ? { lte: dateRange.lte } : {}) }
      : { not: null }

    const contentStages = await prisma.vehicleStage.findMany({
      where: {
        stage: 'content',
        status: { notIn: ['done', 'skipped'] },
        scheduledDate: schedWhere,
        ...(assigneeId ? { assigneeId } : {}),
        ...(vehicleId ? { vehicleId } : {}),
      },
      include: {
        vehicle: { select: { id: true, stockNumber: true, year: true, make: true, model: true } },
        assignee: { select: { id: true, name: true, role: true } },
      },
    })
    for (const s of contentStages) {
      if (!s.scheduledDate) continue
      const v = s.vehicle
      const desc = `${v.year ?? ''} ${v.make} ${v.model}`.trim()
      synthItems.push({
        id: `content-veh-${s.id}`,
        title: `Content: #${v.stockNumber}${desc ? ` ${desc}` : ''}`,
        type: 'content_shoot',
        date: s.scheduledDate as Date,
        endDate: null,
        allDay: isNoonSentinel(s.scheduledDate),
        location: null,
        notes: null,
        status: s.status === 'in_progress' ? 'in_progress' : 'scheduled',
        vehicleId: s.vehicleId,
        eventId: null,
        createdById: null,
        assignees: s.assignee
          ? [{ user: s.assignee, userId: s.assignee.id, calendarItemId: `content-veh-${s.id}` } as any]
          : [],
        vehicle: v,
        event: null,
        createdBy: null,
        createdAt: s.createdAt,
        updatedAt: s.createdAt,
      } as any)
    }

    // Standalone content tasks (skip when filtering to a specific vehicle)
    if (!vehicleId) {
      const contentTasks = await prisma.task.findMany({
        where: {
          category: 'content',
          status: { notIn: ['done', 'skipped'] },
          scheduledDate: schedWhere,
          ...(assigneeId ? { assigneeId } : {}),
        },
        include: { assignee: { select: { id: true, name: true, role: true } } },
      })
      for (const t of contentTasks) {
        if (!t.scheduledDate) continue
        synthItems.push({
          id: `content-task-${t.id}`,
          title: `Content: ${t.title}`,
          type: 'content_shoot',
          date: t.scheduledDate as Date,
          endDate: null,
          allDay: isNoonSentinel(t.scheduledDate),
          location: null,
          notes: t.description,
          status: t.status === 'in_progress' ? 'in_progress' : 'scheduled',
          vehicleId: null,
          eventId: null,
          createdById: null,
          assignees: t.assignee
            ? [{ user: t.assignee, userId: t.assignee.id, calendarItemId: `content-task-${t.id}` } as any]
            : [],
          vehicle: null,
          event: null,
          createdBy: null,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
        } as any)
      }
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
