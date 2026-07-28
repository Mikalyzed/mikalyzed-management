import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function GET(request: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Pipeline counts
  const pipeline = {
    mechanic: await prisma.vehicle.count({ where: { status: 'mechanic' } }),
    detailing: await prisma.vehicle.count({ where: { status: 'detailing' } }),
    content: await prisma.vehicle.count({ where: { status: 'content' } }),
    publish: await prisma.vehicle.count({ where: { status: 'publish' } }),
    completed: await prisma.vehicle.count({ where: { status: 'completed' } }),
    externalRepairs: await prisma.externalRepair.count({ where: { status: 'sent' } }),
    partsPending: await prisma.part.count({ where: { status: { in: ['requested', 'ordered'] } } }),
  }

  const now = new Date()

  // My tasks count (for workers)
  const roleToStage: Record<string, string> = {
    mechanic: 'mechanic',
    detailer: 'detailing',
    content: 'content',
  }
  const myStage = roleToStage[user.role]
  const myTasks = myStage
    ? await prisma.vehicleStage.count({
        where: {
          assigneeId: user.id,
          stage: myStage,
          status: { notIn: ['done', 'skipped'] },
        },
      })
    : 0

  // Recent vehicles
  const recentVehicles = await prisma.vehicle.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      stockNumber: true,
      year: true,
      make: true,
      model: true,
      color: true,
      status: true,
    },
  })

  // ─── My Assignments (all roles) ───

  // Recon tasks assigned to me — sorted by priority (matches recon board order),
  // includes checklist + timer state so the dashboard card can drive the timer/checklist UI.
  const myReconTasks = await prisma.vehicleStage.findMany({
    where: {
      assigneeId: user.id,
      status: { notIn: ['done', 'skipped'] },
    },
    select: {
      id: true,
      stage: true,
      status: true,
      priority: true,
      checklist: true,
      activeSeconds: true,
      timerStartedAt: true,
      pauseReason: true,
      pauseDetail: true,
      startedAt: true,
      estimatedHours: true,
      vehicle: { select: { id: true, stockNumber: true, year: true, make: true, model: true, color: true } },
    },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    take: 20,
  })

  // Event tasks assigned to me
  const myEventTasks = await prisma.eventTask.findMany({
    where: {
      assigneeId: user.id,
      status: { not: 'completed' },
    },
    include: {
      section: {
        include: {
          event: { select: { id: true, name: true, date: true } },
        },
      },
    },
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    take: 10,
  })

  // Calendar items assigned to me (upcoming)
  const myCalendarItems = await prisma.calendarItem.findMany({
    where: {
      assignees: { some: { userId: user.id } },
      status: { notIn: ['completed', 'cancelled'] },
      date: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) }, // include today
    },
    include: {
      vehicle: { select: { id: true, stockNumber: true, make: true, model: true } },
      event: { select: { id: true, name: true } },
    },
    orderBy: { date: 'asc' },
    take: 10,
  })

  // Board tasks assigned to me
  const myBoardTasks = await prisma.task.findMany({
    where: {
      assigneeId: user.id,
      status: { notIn: ['done', 'skipped'] },
    },
    orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
    take: 10,
  })

  // Parts I'm assigned to find/source (still in 'requested' status — open to-do)
  const myParts = await prisma.part.findMany({
    where: {
      assignedToId: user.id,
      status: 'requested',
    },
    include: {
      vehicle: { select: { id: true, stockNumber: true, year: true, make: true, model: true, color: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })

  // Pending task approvals (for admin)
  const pendingApprovals = user.role === 'admin' ? await prisma.taskApproval.findMany({
    where: { status: 'pending' },
    include: {
      vehicleStage: {
        include: {
          vehicle: { select: { id: true, stockNumber: true, year: true, make: true, model: true, color: true } },
        },
      },
      requestedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  }) : []

  // Inspection task requests — mechanic-added tasks awaiting admin approval, grouped by vehicle
  type InspectionRequest = {
    vehicleId: string
    stageId: string
    stockNumber: string
    year: number | null
    make: string
    model: string
    requests: { index: number; item: string; estimatedHours: number | null }[]
  }
  let inspectionRequests: InspectionRequest[] = []
  if (user.role === 'admin') {
    const pendingStages = await prisma.vehicleStage.findMany({
      where: { status: { notIn: ['done', 'skipped'] } },
      include: {
        vehicle: { select: { id: true, stockNumber: true, year: true, make: true, model: true, color: true } },
      },
    })
    for (const s of pendingStages) {
      const checklist = (s.checklist as Array<{ addedByMechanic?: boolean; approved?: string; item?: string; estimatedHours?: number }>) || []
      const requests = checklist
        .map((c, idx) => ({ c, idx }))
        .filter(({ c }) => c.addedByMechanic && c.approved === 'pending')
        .map(({ c, idx }) => ({ index: idx, item: c.item || '', estimatedHours: typeof c.estimatedHours === 'number' ? c.estimatedHours : null }))
      if (requests.length > 0) {
        inspectionRequests.push({
          vehicleId: s.vehicle.id,
          stageId: s.id,
          stockNumber: s.vehicle.stockNumber,
          year: s.vehicle.year,
          make: s.vehicle.make,
          model: s.vehicle.model,
          requests,
        })
      }
    }
  }

  // Upcoming events (for admin)
  const upcomingEvents = user.role === 'admin' ? await prisma.event.findMany({
    where: {
      status: { in: ['draft', 'planned', 'active'] },
    },
    include: {
      owner: { select: { id: true, name: true } },
      sections: {
        include: {
          tasks: { select: { id: true, status: true } },
        },
      },
    },
    orderBy: { date: 'asc' },
    take: 5,
  }) : []

  const upcomingEventsWithProgress = upcomingEvents.map(e => {
    let total = 0, completed = 0
    e.sections.forEach(s => { total += s.tasks.length; completed += s.tasks.filter(t => t.status === 'completed').length })
    return {
      id: e.id, name: e.name, date: e.date, status: e.status,
      owner: e.owner,
      progress: total > 0 ? Math.round((completed / total) * 100) : 0,
      totalTasks: total, completedTasks: completed,
    }
  })

  // ── Admin attention center: everything waiting on a decision, with the
  //    actual items so each can be executed inline on the dashboard ──
  let attention: Record<string, unknown> | null = null
  if (user.role === 'admin' || user.role === 'shop_coordinator') {
    const vName = (v: { year: number | null; make: string; model: string }) => `${v.year ?? ''} ${v.make} ${v.model}`.trim()
    const [routingVehicles, activeStages, deliveredParts, approvalParts, overdueExternals, stuckParts, mechanics] = await Promise.all([
      prisma.vehicle.findMany({
        where: { status: 'awaiting_routing' },
        select: { id: true, stockNumber: true, year: true, make: true, model: true },
        take: 15,
      }),
      prisma.vehicleStage.findMany({
        where: { status: { in: ['pending', 'in_progress'] } },
        select: { id: true, checklist: true, vehicle: { select: { stockNumber: true, year: true, make: true, model: true } } },
      }),
      prisma.part.findMany({
        where: { status: 'ordered', trackingStatus: { in: ['delivered', 'available_for_pickup'] } },
        select: { id: true, name: true, vehicle: { select: { stockNumber: true } } },
        take: 15,
      }),
      prisma.part.findMany({
        where: { status: 'sourced' },
        select: { id: true, name: true, url: true, vehicle: { select: { stockNumber: true } } },
        take: 15,
      }),
      prisma.externalRepair.findMany({
        where: { status: { in: ['sent', 'in_progress', 'ready'] }, expectedReturn: { lt: new Date() } },
        select: { id: true, stockNumber: true, year: true, make: true, model: true, shopName: true, expectedReturn: true },
        orderBy: { expectedReturn: 'asc' },
        take: 15,
      }),
      prisma.part.findMany({
        where: { status: 'requested', createdAt: { lt: new Date(Date.now() - 7 * 86400000) } },
        select: { id: true, name: true, createdAt: true, vehicle: { select: { stockNumber: true } } },
        take: 15,
      }),
      prisma.user.findMany({ where: { role: 'mechanic', isActive: true }, select: { id: true, name: true } }),
    ])
    const installItems = activeStages.flatMap(s =>
      (Array.isArray(s.checklist) ? (s.checklist as Array<Record<string, unknown>>) : [])
        .filter(c => c?.fromPart && !c?.assigneeId && !c?.done)
        .map(c => ({ stageId: s.id, item: String(c.item ?? ''), stock: s.vehicle.stockNumber, vehicle: vName(s.vehicle) })),
    )
    attention = {
      routing: routingVehicles.map(v => ({ id: v.id, stock: v.stockNumber, vehicle: vName(v) })),
      installs: installItems.slice(0, 15),
      installsTotal: installItems.length,
      delivered: deliveredParts.map(p => ({ id: p.id, name: p.name, stock: p.vehicle.stockNumber })),
      approvals: approvalParts.map(p => ({ id: p.id, name: p.name, url: p.url, stock: p.vehicle.stockNumber })),
      overdue: overdueExternals.map(e => ({
        id: e.id, stock: e.stockNumber, vehicle: vName(e), shop: e.shopName,
        overdueDays: Math.floor((Date.now() - (e.expectedReturn?.getTime() ?? Date.now())) / 86400000),
      })),
      stuck: stuckParts.map(p => ({
        id: p.id, name: p.name, stock: p.vehicle.stockNumber,
        ageDays: Math.floor((Date.now() - p.createdAt.getTime()) / 86400000),
      })),
      mechanics,
    }
  }

  // ── Domain overview (DealerCenter-style at-a-glance counts) ──
  let overview: Record<string, unknown> | null = null
  if (['admin', 'shop_coordinator', 'sales_manager'].includes(user.role)) {
    const [invActive, invStock, invRecon, invExternal, dealsDraft, dealsProceeded, dealsFunded30,
           pReq, pSourced, pReady, pOrdered, extOpen, extOverdue, extNotSent] = await Promise.all([
      prisma.vehicle.count({ where: { OR: [{ inventoryStatus: null }, { inventoryStatus: { notIn: ['sold', 'removed'] } }] } }),
      prisma.vehicle.count({ where: { inventoryStatus: 'in_stock' } }),
      prisma.vehicle.count({ where: { inventoryStatus: 'in_recon' } }),
      prisma.vehicle.count({ where: { inventoryStatus: 'external_repair' } }),
      prisma.deal.count({ where: { status: 'draft', proceededAt: null } }),
      prisma.deal.count({ where: { status: 'draft', proceededAt: { not: null } } }),
      prisma.deal.count({ where: { status: 'funded', fundedAt: { gte: new Date(Date.now() - 30 * 86400000) } } }),
      prisma.part.count({ where: { status: 'requested' } }),
      prisma.part.count({ where: { status: 'sourced' } }),
      prisma.part.count({ where: { status: 'ready_to_order' } }),
      prisma.part.count({ where: { status: 'ordered' } }),
      prisma.externalRepair.count({ where: { status: { in: ['sent', 'in_progress', 'ready'] } } }),
      prisma.externalRepair.count({ where: { status: { in: ['sent', 'in_progress', 'ready'] }, expectedReturn: { lt: new Date() } } }),
      prisma.externalRepair.count({ where: { status: 'pending' } }),
    ])
    overview = {
      inventory: { active: invActive, inStock: invStock, inRecon: invRecon, external: invExternal },
      deals: user.role === 'shop_coordinator' ? null : { draft: dealsDraft, inContract: dealsProceeded, funded30: dealsFunded30 },
      parts: { requested: pReq, approval: pSourced, readyToOrder: pReady, ordered: pOrdered },
      external: { open: extOpen, overdue: extOverdue, notSent: extNotSent },
    }
  }

  return NextResponse.json({
    attention,
    overview,
    user: { name: user.name, role: user.role, id: user.id },
    pipeline,
    myTasks,
    recentVehicles,
    myReconTasks,
    myEventTasks,
    myCalendarItems,
    myBoardTasks,
    myParts,
    upcomingEvents: upcomingEventsWithProgress,
    pendingApprovals,
    inspectionRequests,
  })
}
