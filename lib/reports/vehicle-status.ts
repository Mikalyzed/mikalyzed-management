import { prisma } from '@/lib/db'

/**
 * Inventory Status Report — the management snapshot of every active vehicle:
 * where it is (in stock / in recon / at an external shop), what stage it's in,
 * and every open part (received-and-here vs still coming in).
 *
 * Single source of truth for the report data: the /api/reports/vehicle-status
 * endpoint (JSON + PDF) and the AskAI generate_status_report tool both call
 * this. All numbers come straight from the DB — nothing passes through the
 * model, so the PDF can never contain an invented figure.
 */

export type VehicleStatusReport = Awaited<ReturnType<typeof buildVehicleStatusReport>>

const DAY_MS = 86400000

function vehicleName(v: { year: number | null; make: string; model: string }) {
  return `${v.year || ''} ${v.make} ${v.model}`.trim()
}

function daysSince(d: Date | null) {
  return d ? Math.floor((Date.now() - d.getTime()) / DAY_MS) : null
}

export async function buildVehicleStatusReport() {
  const [vehicles, externals, plans, activeTransports, strayParts] = await Promise.all([
    prisma.vehicle.findMany({
      where: {
        OR: [
          { inventoryStatus: null },
          { inventoryStatus: { notIn: ['sold', 'removed'] } },
        ],
      },
      select: {
        id: true, stockNumber: true, year: true, make: true, model: true, color: true,
        status: true, inventoryStatus: true, location: true, dateInStock: true, askingPrice: true,
        stages: {
          where: { status: { in: ['pending', 'in_progress'] } },
          select: {
            id: true, stage: true, status: true, scheduledDate: true, awaitingParts: true,
            awaitingPartsName: true, pauseReason: true, checklist: true, notes: true,
            assignee: { select: { name: true } },
          },
          orderBy: { startedAt: 'asc' },
        },
        parts: {
          where: { status: { in: ['requested', 'sourced', 'ordered', 'received'] } },
          select: { id: true, name: true, status: true, expectedDelivery: true, installTaskCreatedAt: true, createdAt: true, updatedAt: true, trackingStatus: true, installVenue: true },
        },
      },
      orderBy: { stockNumber: 'asc' },
    }),
    prisma.externalRepair.findMany({
      where: { status: { in: ['pending', 'sent', 'in_progress', 'ready'] } },
      select: {
        id: true, stockNumber: true, year: true, make: true, model: true, shopName: true,
        repairDescription: true, status: true, sentDate: true, expectedReturn: true,
        atDealership: true, partOnly: true, notes: true, createdAt: true, followUps: true, plannedSendDate: true, blockedOnPartId: true, installPartId: true,
      },
      orderBy: { expectedReturn: 'asc' },
    }),
    prisma.vehiclePlan.findMany({ include: { steps: { orderBy: { order: 'asc' } } } }),
    // Open tows: a transport without a pickup date (or past one) is a crack
    // things fall into — the watchlist chases them.
    prisma.transportRequest.findMany({
      where: { status: { in: ['requested', 'scheduled'] } },
      select: {
        id: true, vehicleDescription: true, pickupLocation: true, deliveryLocation: true,
        scheduledDate: true, createdAt: true, status: true,
        vehicle: { select: { stockNumber: true, year: true, make: true, model: true } },
      },
    }),
    // Open parts whose car fell OUT of the active set (sold/removed): the part
    // still needs resolving — install before delivery, or return it. Without
    // this they'd vanish from the pipeline the moment the car sells.
    prisma.part.findMany({
      where: {
        status: { in: ['requested', 'sourced', 'ordered', 'received'] },
        vehicle: { inventoryStatus: { in: ['sold', 'removed'] } },
      },
      select: {
        id: true, name: true, status: true, expectedDelivery: true,
        installTaskCreatedAt: true, createdAt: true, updatedAt: true, trackingStatus: true, installVenue: true,
        vehicle: { select: { id: true, stockNumber: true, year: true, make: true, model: true } },
      },
    }),
  ])

  // Game plans: current step per vehicle — the system's "what's next" for a car
  const planByVehicleId = new Map(plans.map(p => {
    const active = p.steps.find(s => s.status === 'active')
    const finished = p.steps.filter(s => s.status === 'done' || s.status === 'skipped').length
    return [p.vehicleId, {
      goal: p.goal,
      stepId: active?.id ?? null,
      step: active?.title ?? null,
      stepDetail: active?.detail ?? null,
      stepSinceDays: active?.activatedAt ? daysSince(active.activatedAt) : null,
      // Operational action carried by the active step (confirm-first chip)
      stepKind: active?.kind ?? null,
      stepActionStage: active?.actionStage ?? null,
      stepActionShop: active?.actionShop ?? null,
      stepActionDone: !!active?.actionCreatedAt,
      finished,
      total: p.steps.length,
    }] as const
  }))

  const now = Date.now()

  type ChecklistItem = { item?: string; done?: boolean; note?: string; assigneeName?: string; fromPart?: boolean; doneAt?: string }
  const stageTasks = (checklist: unknown) =>
    (Array.isArray(checklist) ? (checklist as ChecklistItem[]) : [])
      .map((t, idx) => ({
        // idx = position in the RAW checklist array — the board toggles a
        // task done by patching the checklist at this index.
        idx,
        item: t.item?.trim() ?? '',
        done: t.done === true,
        note: t.note?.trim() || null,
        assignee: t.assigneeName?.trim() || null,
        doneAt: typeof t.doneAt === 'string' ? t.doneAt : null,
        fromPart: t.fromPart === true,
      }))
      .filter(t => t.item)

  const inboundParts = (v: (typeof vehicles)[number]) =>
    v.parts
      .filter(p => p.status !== 'received')
      .map(p => ({ partId: p.id, name: p.name, status: p.status, eta: p.expectedDelivery?.toISOString().slice(0, 10) ?? null }))

  const recon = vehicles
    .filter(v => v.inventoryStatus === 'in_recon')
    .map(v => {
      const cur = v.stages.find(s => s.status === 'in_progress') || v.stages[0] || null
      return {
        stock: v.stockNumber,
        vehicle: vehicleName(v),
        // IDs + raw fields the Morning Meeting board needs to act on a car
        vehicleId: v.id,
        stageId: cur?.id ?? null,
        year: v.year, make: v.make, model: v.model,
        stage: cur?.stage ?? null,
        stageStatus: cur?.status ?? null,
        assignee: cur?.assignee?.name ?? null,
        awaitingParts: cur?.awaitingParts ?? false,
        awaitingPartsName: cur?.awaitingPartsName?.trim() || null,
        paused: !!cur?.pauseReason,
        scheduledDate: cur?.scheduledDate?.toISOString().slice(0, 10) ?? null,
        daysInStock: daysSince(v.dateInStock),
        openParts: v.parts.length,
        // Deep-dive detail: the active stage's task list + notes + inbound parts
        tasks: stageTasks(cur?.checklist),
        stageNotes: cur?.notes?.trim() || null,
        partsInbound: inboundParts(v),
        plan: planByVehicleId.get(v.id) ?? null,
      }
    })
    .sort((a, b) => (b.daysInStock ?? 0) - (a.daysInStock ?? 0))

  const vehicleByStock = new Map(vehicles.map(v => [v.stockNumber, v]))

  const externalRepairs = externals.map(e => {
    const overdueDays = e.expectedReturn && e.expectedReturn.getTime() < now
      ? Math.floor((now - e.expectedReturn.getTime()) / DAY_MS)
      : 0
    const v = vehicleByStock.get(e.stockNumber)
    return {
      externalId: e.id,
      stock: e.stockNumber,
      vehicle: vehicleName(e),
      vehicleId: v?.id ?? null,
      shop: e.shopName,
      work: e.repairDescription.replace(/\s+/g, ' ').trim(),
      status: e.status,
      atDealership: e.atDealership,
      partOnly: e.partOnly,
      // A part sent OUT for work that installs in-house on return (Send Out for Repair).
      installPartId: e.installPartId ?? null,
      // Gated on a part that hasn't landed yet — the mission is visible but the
      // "never sent" watchlist rule skips it until the part is received.
      blockedOnPart: !!e.blockedOnPartId,
      sent: e.sentDate?.toISOString().slice(0, 10) ?? null,
      plannedSend: e.plannedSendDate?.toISOString().slice(0, 10) ?? null,
      expectedBack: e.expectedReturn?.toISOString().slice(0, 10) ?? null,
      overdueDays,
      createdAgoDays: daysSince(e.createdAt) ?? 0,
      notes: e.notes?.trim() || null,
      // Follow-up history (calls to the shop, status overrides) — shown in the
      // meeting board's card snapshot.
      followUps: (Array.isArray(e.followUps) ? (e.followUps as Array<Record<string, unknown>>) : [])
        .map(f => ({
          date: typeof f.date === 'string' ? f.date.slice(0, 10) : null,
          note: typeof f.note === 'string' ? f.note : '',
        }))
        .filter(f => f.note),
      partsInbound: v ? inboundParts(v) : [],
    }
  })

  // Full parts pipeline across all active vehicles. Primary meeting use:
  // spot what's STUCK in "requested" — ageDays makes that visible.
  const PART_STATUS_ORDER: Record<string, number> = { requested: 0, sourced: 1, ordered: 2, received: 3 }
  const parts = vehicles
    .flatMap(v => v.parts.map(p => ({
      partId: p.id,
      vehicleId: v.id,
      stock: v.stockNumber,
      vehicle: vehicleName(v),
      part: p.name,
      status: p.status,
      trackingStatus: p.trackingStatus,
      eta: p.expectedDelivery?.toISOString().slice(0, 10) ?? null,
      ageDays: daysSince(p.createdAt) ?? 0,
      touchedAgeDays: daysSince(p.updatedAt) ?? 0,
      installTaskCreated: !!p.installTaskCreatedAt,
      // External install: the install plan IS an outside-vendor mission, so the
      // "no install task" rules must not flag it as unhandled.
      installExternal: p.installVenue === 'external',
      soldCar: false,
    })))
    .concat(strayParts.map(p => ({
      partId: p.id,
      vehicleId: p.vehicle.id,
      stock: p.vehicle.stockNumber,
      vehicle: [p.vehicle.year, p.vehicle.make, p.vehicle.model].filter(Boolean).join(' '),
      part: p.name,
      status: p.status,
      trackingStatus: p.trackingStatus,
      eta: p.expectedDelivery?.toISOString().slice(0, 10) ?? null,
      ageDays: daysSince(p.createdAt) ?? 0,
      touchedAgeDays: daysSince(p.updatedAt) ?? 0,
      installTaskCreated: !!p.installTaskCreatedAt,
      installExternal: p.installVenue === 'external',
      soldCar: true,
    })))
    .sort((a, b) =>
      (PART_STATUS_ORDER[a.status] ?? 9) - (PART_STATUS_ORDER[b.status] ?? 9) || b.ageDays - a.ageDays)
  const partsInboundCount = parts.filter(p => p.status !== 'received').length
  const partsHereCount = parts.length - partsInboundCount

  // In Stock must not duplicate a car already shown in External Repairs
  // (a vehicle can sit in_stock while an external record is still open).
  const externalStocks = new Set(externals.map(e => e.stockNumber))
  const inStock = vehicles
    .filter(v => v.inventoryStatus === 'in_stock' && !externalStocks.has(v.stockNumber))
    .map(v => ({
      stock: v.stockNumber,
      vehicle: vehicleName(v),
      vehicleId: v.id,
      year: v.year, make: v.make, model: v.model,
      color: v.color,
      location: v.location,
      askingPrice: v.askingPrice,
      daysInStock: daysSince(v.dateInStock),
      plan: planByVehicleId.get(v.id) ?? null,
    }))
    .sort((a, b) => (b.daysInStock ?? 0) - (a.daysInStock ?? 0))

  const flags = vehicles
    .filter(v => v.inventoryStatus == null)
    .map(v => `${v.stockNumber} ${vehicleName(v)} — no inventory status set (recon status: ${v.status})`)

  const transports = activeTransports.map(t => ({
    transportId: t.id,
    stock: t.vehicle?.stockNumber ?? null,
    vehicle: t.vehicle ? `${t.vehicle.year ?? ''} ${t.vehicle.make} ${t.vehicle.model}`.trim() : (t.vehicleDescription ?? '—'),
    from: t.pickupLocation,
    to: t.deliveryLocation,
    status: t.status,
    scheduledDate: t.scheduledDate?.toISOString().slice(0, 10) ?? null,
    ageDays: daysSince(t.createdAt) ?? 0,
  }))

  return {
    transports,
    generatedAt: new Date().toISOString(),
    counts: {
      activeVehicles: vehicles.length,
      inStock: inStock.length,
      inRecon: recon.length,
      atExternalRepair: vehicles.filter(v => v.inventoryStatus === 'external_repair').length,
      openExternalRepairs: externalRepairs.length,
      externalOverdue: externalRepairs.filter(e => e.overdueDays > 0).length,
      partsInbound: partsInboundCount,
      partsHere: partsHereCount,
      partsRequested: parts.filter(p => p.status === 'requested').length,
      unsetStatus: flags.length,
    },
    recon,
    externalRepairs,
    parts,
    inStock,
    flags,
  }
}
