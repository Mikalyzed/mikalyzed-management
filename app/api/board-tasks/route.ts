import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function GET(request: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category')
  const assigneeId = searchParams.get('assigneeId')
  const status = searchParams.get('status')
  const mine = searchParams.get('mine')

  const stock = searchParams.get('stock')

  const where: Record<string, unknown> = {}
  if (category) where.category = category
  if (assigneeId) where.assigneeId = assigneeId
  if (status) where.status = status
  if (mine === '1') where.assigneeId = user.id
  if (stock) {
    where.stockNumbers = { array_contains: stock }
    if (!status) where.status = { notIn: ['done', 'skipped'] }
  }

  const tasks = await prisma.task.findMany({
    where,
    include: {
      assignee: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: [{ priority: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
  })

  // Vehicle-jacket view: enrich linked missions with their record state
  if (stock) {
    const extIds = tasks.map(t => t.externalRepairId).filter((x): x is string => !!x)
    const trIds = tasks.map(t => t.transportRequestId).filter((x): x is string => !!x)
    const [exts, trs] = await Promise.all([
      extIds.length ? prisma.externalRepair.findMany({ where: { id: { in: extIds } }, select: { id: true, shopName: true, status: true } }) : [],
      trIds.length ? prisma.transportRequest.findMany({ where: { id: { in: trIds } }, select: { id: true, status: true, scheduledDate: true } }) : [],
    ])
    const extById = new Map(exts.map(e => [e.id, e]))
    const trById = new Map(trs.map(t => [t.id, t]))
    return NextResponse.json(tasks.map(t => ({
      ...t,
      linkedExternal: t.externalRepairId ? extById.get(t.externalRepairId) ?? null : null,
      linkedTransport: t.transportRequestId ? trById.get(t.transportRequestId) ?? null : null,
    })))
  }

  return NextResponse.json(tasks)
}

export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { title, description, category, assigneeId, dueDate, priority, subtasks, stockNumbers } = body

  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 })

  const task = await prisma.task.create({
    data: {
      title,
      description: description || null,
      category: category || 'content',
      assigneeId: assigneeId || null,
      createdById: user.id,
      dueDate: dueDate ? new Date(dueDate) : null,
      priority: priority || 0,
      subtasks: subtasks && Array.isArray(subtasks) ? subtasks : [],
      stockNumbers: Array.isArray(stockNumbers) ? stockNumbers.filter(Boolean) : [],
    },
    include: {
      assignee: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
    },
  })

  return NextResponse.json(task, { status: 201 })
}
