import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get today's entries
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date()
  todayEnd.setHours(23, 59, 59, 999)

  const entries = await prisma.porterEntry.findMany({
    where: { date: { gte: todayStart, lte: todayEnd } },
    orderBy: { createdAt: 'asc' },
    include: { porter: { select: { id: true, name: true } } },
  })

  // Get misc tasks (pending + in_progress + completed today)
  const tasks = await prisma.porterTask.findMany({
    where: {
      OR: [
        { status: 'pending' },
        { status: 'in_progress' },
        { completedAt: { gte: todayStart } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    include: {
      assignedTo: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
    },
  })

  // Weekly summary for admin
  const weekStart = new Date()
  const dayOfWeek = weekStart.getDay()
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  weekStart.setDate(weekStart.getDate() + mondayOffset)
  weekStart.setHours(0, 0, 0, 0)

  const weeklyEntries = await prisma.porterEntry.findMany({
    where: { date: { gte: weekStart } },
    orderBy: { createdAt: 'desc' },
    include: { porter: { select: { id: true, name: true } } },
  })

  const weeklyTasks = await prisma.porterTask.findMany({
    where: { completedAt: { gte: weekStart } },
    orderBy: { completedAt: 'desc' },
    include: {
      assignedTo: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
    },
  })

  return NextResponse.json({ entries, tasks, weeklyEntries, weeklyTasks })
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { action, ...data } = await req.json()

  if (action === 'addCar') {
    const { vin6, carName } = data
    if (!vin6?.trim() || !carName?.trim()) {
      return NextResponse.json({ error: 'VIN and car name required' }, { status: 400 })
    }

    const entry = await prisma.porterEntry.create({
      data: {
        vin6: vin6.trim().toUpperCase(),
        carName: carName.trim(),
        porterId: user.id,
        date: new Date(),
      },
    })
    return NextResponse.json({ entry })
  }

  if (action === 'toggle') {
    const { entryId, field } = data
    const validFields = ['wipeDown', 'tirePressure', 'matUnderCar', 'charger']
    if (!entryId || !validFields.includes(field)) {
      return NextResponse.json({ error: 'Invalid field' }, { status: 400 })
    }

    const entry = await prisma.porterEntry.findUnique({ where: { id: entryId } })
    if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const newValue = !(entry as any)[field]
    const updateData: any = { [field]: newValue }

    // Check if all 4 are now done
    const updated = { ...entry, [field]: newValue }
    if (updated.wipeDown && updated.tirePressure && updated.matUnderCar && updated.charger) {
      updateData.completedAt = new Date()
    } else {
      updateData.completedAt = null
    }

    const result = await prisma.porterEntry.update({
      where: { id: entryId },
      data: updateData,
    })
    return NextResponse.json({ entry: result })
  }

  if (action === 'startTimer') {
    const { entryId } = data
    await prisma.porterEntry.update({
      where: { id: entryId },
      data: { startedAt: new Date(), finishedAt: null },
    })
    return NextResponse.json({ success: true })
  }

  if (action === 'stopTimer') {
    const { entryId } = data
    await prisma.porterEntry.update({
      where: { id: entryId },
      data: { finishedAt: new Date() },
    })
    return NextResponse.json({ success: true })
  }

  if (action === 'deleteEntry') {
    const { entryId } = data
    await prisma.porterEntry.delete({ where: { id: entryId } })
    return NextResponse.json({ success: true })
  }

  if (action === 'addTask') {
    const { title, assignedToId } = data
    if (!title?.trim()) return NextResponse.json({ error: 'Title required' }, { status: 400 })

    const task = await prisma.porterTask.create({
      data: {
        title: title.trim(),
        assignedToId: assignedToId || null,
        createdById: user.id,
      },
    })
    return NextResponse.json({ task })
  }

  if (action === 'startTask') {
    const { taskId } = data
    await prisma.porterTask.update({
      where: { id: taskId },
      data: { status: 'in_progress', startedAt: new Date(), completedAt: null },
    })
    return NextResponse.json({ success: true })
  }

  if (action === 'completeTask') {
    const { taskId } = data
    await prisma.porterTask.update({
      where: { id: taskId },
      data: { status: 'completed', completedAt: new Date() },
    })
    return NextResponse.json({ success: true })
  }

  if (action === 'toggleTask') {
    const { taskId } = data
    const task = await prisma.porterTask.findUnique({ where: { id: taskId } })
    if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const newStatus = task.status === 'completed' ? 'pending' : 'completed'
    const result = await prisma.porterTask.update({
      where: { id: taskId },
      data: { status: newStatus, completedAt: newStatus === 'completed' ? new Date() : null, startedAt: newStatus === 'pending' ? null : task.startedAt },
    })
    return NextResponse.json({ task: result })
  }

  if (action === 'deleteTask') {
    const { taskId } = data
    await prisma.porterTask.delete({ where: { id: taskId } })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
