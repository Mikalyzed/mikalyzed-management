import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { buildVehicleStatusReport } from '@/lib/reports/vehicle-status'
import { detectBottlenecks } from '@/lib/reports/bottlenecks'

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

  // Board tasks assigned to me — mission-linked tasks carry live checkpoint
  // state derived from their external repair / transport request records.
  const myBoardTasksRaw = await prisma.task.findMany({
    where: {
      assigneeId: user.id,
      status: { notIn: ['done', 'skipped'] },
    },
    orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
    take: 10,
  })
  const linkedExtIds = myBoardTasksRaw.map(t => t.externalRepairId).filter((x): x is string => !!x)
  const linkedTrIds = myBoardTasksRaw.map(t => t.transportRequestId).filter((x): x is string => !!x)
  const [linkedExts, linkedTrs] = await Promise.all([
    linkedExtIds.length ? prisma.externalRepair.findMany({
      where: { id: { in: linkedExtIds } },
      select: { id: true, shopName: true, status: true, stockNumber: true, expectedReturn: true },
    }) : Promise.resolve([]),
    linkedTrIds.length ? prisma.transportRequest.findMany({
      where: { id: { in: linkedTrIds } },
      select: { id: true, status: true, scheduledDate: true, carrierInfo: true },
    }) : Promise.resolve([]),
  ])
  const taskStocks = myBoardTasksRaw
    .flatMap(t => Array.isArray(t.stockNumbers) ? t.stockNumbers.map(String) : [])
  const missionVehicles = (linkedExts.length || taskStocks.length) ? await prisma.vehicle.findMany({
    where: { stockNumber: { in: [...new Set([...linkedExts.map(e => e.stockNumber), ...taskStocks])] } },
    select: { id: true, stockNumber: true, year: true, make: true, model: true, vin: true },
  }) : []
  const mvByStock = new Map(missionVehicles.map(v => [v.stockNumber, v]))
  const extById = new Map(linkedExts.map(e => [e.id, e]))
  const trById = new Map(linkedTrs.map(t => [t.id, t]))
  const myBoardTasks = myBoardTasksRaw.map(t => {
    const ext = t.externalRepairId ? extById.get(t.externalRepairId) : null
    const tr = t.transportRequestId ? trById.get(t.transportRequestId) : null
    const taskStock = Array.isArray(t.stockNumbers) && t.stockNumbers.length > 0 ? String(t.stockNumbers[0]) : null
    const taskVehicle = taskStock ? mvByStock.get(taskStock) : null
    return {
      ...t,
      stock: taskStock,
      vehicleName: taskVehicle ? `${taskVehicle.year ?? ''} ${taskVehicle.make} ${taskVehicle.model}`.trim() : null,
      mission: ext ? {
        missionType: t.missionType === 'retrieve' ? 'retrieve' : 'deliver',
        selfTransport: t.selfTransport === true,
        externalId: ext.id,
        shop: ext.shopName,
        externalStatus: ext.status,
        stock: ext.stockNumber,
        vehicleId: mvByStock.get(ext.stockNumber)?.id ?? null,
        vehicleDesc: (() => { const v = mvByStock.get(ext.stockNumber); return v ? `${v.year ?? ''} ${v.make} ${v.model}`.trim() : ext.stockNumber })(),
        vin: mvByStock.get(ext.stockNumber)?.vin ?? null,
        transportId: tr?.id ?? null,
        transportStatus: tr?.status ?? null,
        transportDate: tr?.scheduledDate?.toISOString().slice(0, 10) ?? null,
        // deliver = done once the car is out; retrieve = done once it's back
        looksDone: t.missionType === 'retrieve'
          ? ext.status === 'returned'
          : ['sent', 'in_progress', 'ready', 'returned'].includes(ext.status),
      } : null,
    }
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
    const [routingVehicles, activeStages, deliveredParts, approvalParts, overdueExternals, stuckParts, strandedParts, mechanics] = await Promise.all([
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
        select: { id: true, name: true, vehicle: { select: { stockNumber: true, year: true, make: true, model: true } } },
        take: 15,
      }),
      prisma.part.findMany({
        where: { status: 'sourced' },
        select: { id: true, name: true, url: true, vehicle: { select: { stockNumber: true, year: true, make: true, model: true } } },
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
        select: { id: true, name: true, createdAt: true, vehicle: { select: { stockNumber: true, year: true, make: true, model: true } } },
        take: 15,
      }),
      // Part is here but the car has no recon stage to carry the install —
      // it would sit on a shelf invisible. 21-day window since last touch.
      prisma.part.findMany({
        where: {
          status: 'received',
          installTaskCreatedAt: null,
          updatedAt: { gte: new Date(Date.now() - 21 * 86400000) },
          vehicle: { OR: [{ inventoryStatus: null }, { inventoryStatus: { not: 'in_recon' } }] },
        },
        select: { id: true, name: true, vehicle: { select: { id: true, stockNumber: true, year: true, make: true, model: true, inventoryStatus: true } } },
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
      delivered: deliveredParts.map(p => ({ id: p.id, name: p.name, stock: p.vehicle.stockNumber, vehicle: vName(p.vehicle) })),
      approvals: approvalParts.map(p => ({ id: p.id, name: p.name, url: p.url, stock: p.vehicle.stockNumber, vehicle: vName(p.vehicle) })),
      overdue: overdueExternals.map(e => ({
        id: e.id, stock: e.stockNumber, vehicle: vName(e), shop: e.shopName,
        overdueDays: Math.floor((Date.now() - (e.expectedReturn?.getTime() ?? Date.now())) / 86400000),
      })),
      stuck: stuckParts.map(p => ({
        id: p.id, name: p.name, stock: p.vehicle.stockNumber, vehicle: vName(p.vehicle),
        ageDays: Math.floor((Date.now() - p.createdAt.getTime()) / 86400000),
      })),
      stranded: strandedParts.map(p => ({
        id: p.id, name: p.name, stock: p.vehicle.stockNumber, vehicleId: p.vehicle.id, vehicle: vName(p.vehicle),
        sold: p.vehicle.inventoryStatus === 'sold' || p.vehicle.inventoryStatus === 'removed',
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

  // ── Shop Coordinator board — Lenny's whole loop, derived from the same
  //    report the morning meeting uses (no prices in any of these fields) ──
  let coordinator: Record<string, unknown> | null = null
  const wantCoordinator = user.role === 'shop_coordinator' ||
    (user.role === 'admin' && new URL(request.url).searchParams.get('view') === 'coordinator')
  if (wantCoordinator) {
    const report = await buildVehicleStatusReport()
    const bottlenecks = detectBottlenecks(report)
    const toInstallByStock = new Map<string, number>()
    for (const pt of report.parts) {
      if (pt.status === 'received' && !pt.installTaskCreated) {
        toInstallByStock.set(pt.stock, (toInstallByStock.get(pt.stock) ?? 0) + 1)
      }
    }
    coordinator = {
      sourceQueue: report.parts
        .filter(pt => pt.status === 'requested')
        .map(pt => ({ partId: pt.partId, part: pt.part, stock: pt.stock, vehicle: pt.vehicle, ageDays: pt.ageDays })),
      externalOut: report.externalRepairs
        .filter(e => !e.partOnly && ['sent', 'in_progress', 'ready'].includes(e.status))
        .map(e => ({
          externalId: e.externalId, stock: e.stock, vehicle: e.vehicle, shop: e.shop,
          status: e.status, expectedBack: e.expectedBack, overdueDays: e.overdueDays,
          toInstall: toInstallByStock.get(e.stock) ?? 0,
        })),
      watchlist: bottlenecks,
    }
  }

  // ── "New For You" — everything assigned to this user since they last hit
  //    Got It. Nothing is ever added silently: it sits here until acknowledged.
  //    (Trial: shop coordinator first.)
  let newForYou: Record<string, unknown> | null = null
  const coordinatorPreview = user.role === 'admin' && wantCoordinator
    ? await prisma.user.findFirst({ where: { role: 'shop_coordinator', isActive: true }, select: { id: true, name: true, dashboardSeenAt: true } })
    : null
  if (user.role === 'shop_coordinator' || coordinatorPreview) {
    const targetId = coordinatorPreview?.id ?? user.id
    const me = coordinatorPreview ?? await prisma.user.findUnique({ where: { id: user.id }, select: { dashboardSeenAt: true } })
    // First-ever visit: show the last 7 days rather than all history
    const since = me?.dashboardSeenAt ?? new Date(Date.now() - 7 * 86400000)
    const [newTasks, newParts] = await Promise.all([
      prisma.task.findMany({
        where: { assigneeId: targetId, status: { not: 'done' }, createdAt: { gt: since } },
        select: { id: true, title: true, description: true, priority: true, stockNumbers: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      prisma.part.findMany({
        where: { assignedToId: targetId, status: { in: ['requested', 'sourced', 'ready_to_order'] }, createdAt: { gt: since } },
        select: { id: true, name: true, status: true, createdAt: true, vehicle: { select: { stockNumber: true, year: true, make: true, model: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ])
    newForYou = {
      since: since.toISOString(),
      previewFor: coordinatorPreview?.name ?? null,
      tasks: newTasks.map(t => ({
        id: t.id, title: t.title, description: t.description, priority: t.priority,
        stock: Array.isArray(t.stockNumbers) && t.stockNumbers.length > 0 ? String(t.stockNumbers[0]) : null,
        createdAt: t.createdAt.toISOString(),
      })),
      parts: newParts.map(pt => ({
        id: pt.id, name: pt.name, status: pt.status,
        stock: pt.vehicle.stockNumber,
        vehicle: `${pt.vehicle.year ?? ''} ${pt.vehicle.make} ${pt.vehicle.model}`.trim(),
        createdAt: pt.createdAt.toISOString(),
      })),
    }
  }

  // Watchlist reference count for the dashboards (page lives at /watchlist)
  let watchlistCount: number | null = null
  if (user.role === 'admin' || user.role === 'shop_coordinator') {
    if (coordinator) {
      watchlistCount = (coordinator.watchlist as unknown[]).length
    } else {
      const wlReport = await buildVehicleStatusReport()
      watchlistCount = detectBottlenecks(wlReport).length
    }
  }

  return NextResponse.json({
    newForYou,
    coordinator,
    watchlistCount,
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
