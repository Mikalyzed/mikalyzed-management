import { prisma } from '@/lib/db'

/**
 * Shop KPIs — weekly throughput + live pipeline snapshot for the Reports page.
 * All numbers come straight from the DB; nothing passes through a model.
 */

export type ShopKpis = Awaited<ReturnType<typeof buildShopKpis>>

const DAY_MS = 86400000

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

export async function buildShopKpis(weekStart: Date, weekEnd: Date) {
  const range = { gte: weekStart, lt: weekEnd }

  const [
    completedRoutedLogs,
    doneStages,
    sentToExternal,
    returnedFromExternal,
    partsCreated,
    receivedParts,
    liveInRecon,
    liveAtExternal,
    liveAwaitingRouting,
  ] = await Promise.all([
    // "Finished recon this week" signal: the `routed → completed` ActivityLog
    // row. Chosen over "vehicle currently status completed + stage completedAt
    // in range" because the log is stamped at the exact moment recon finished
    // and survives later status changes (sold, re-routed back into recon) —
    // the current-status approach silently drops any car that moved on.
    prisma.activityLog.findMany({
      where: {
        action: 'routed',
        createdAt: range,
        entityType: 'vehicle',
        details: { path: ['to'], equals: 'completed' },
      },
      select: { entityId: true, createdAt: true },
    }),
    prisma.vehicleStage.findMany({
      where: { status: 'done', completedAt: range },
      select: { stage: true, startedAt: true, completedAt: true, totalBlockedSeconds: true },
    }),
    prisma.activityLog.count({ where: { action: 'sent_to_external', createdAt: range } }),
    prisma.activityLog.count({ where: { action: 'returned_from_external', createdAt: range } }),
    prisma.part.count({ where: { createdAt: range } }),
    // Caveat: Part has no receivedAt — updatedAt is the closest signal. It is
    // the receive time only if the part wasn't touched afterwards (notes edit,
    // tracking refresh, etc. would shift it). Approximate by design.
    prisma.part.findMany({
      where: { status: 'received', updatedAt: range },
      select: { createdAt: true, updatedAt: true },
    }),
    prisma.vehicle.count({ where: { inventoryStatus: 'in_recon' } }),
    prisma.vehicle.count({ where: { inventoryStatus: 'external_repair' } }),
    prisma.vehicle.count({ where: { status: 'awaiting_routing' } }),
  ])

  // Avg days in recon: first stage createdAt → last stage completedAt for
  // each vehicle that finished recon this week (fallback: the routed-log
  // timestamp when a stage row is missing its completedAt).
  const completedAtById = new Map<string, Date>()
  for (const log of completedRoutedLogs) {
    // Keep the latest completion if a car somehow completed twice in the week
    const prev = completedAtById.get(log.entityId)
    if (!prev || log.createdAt > prev) completedAtById.set(log.entityId, log.createdAt)
  }
  const completedIds = [...completedAtById.keys()]
  const reconStages = completedIds.length
    ? await prisma.vehicleStage.findMany({
        where: { vehicleId: { in: completedIds } },
        select: { vehicleId: true, createdAt: true, completedAt: true },
      })
    : []
  const spanById = new Map<string, { first: number; last: number }>()
  for (const s of reconStages) {
    const cur = spanById.get(s.vehicleId) ?? { first: Infinity, last: -Infinity }
    cur.first = Math.min(cur.first, s.createdAt.getTime())
    if (s.completedAt) cur.last = Math.max(cur.last, s.completedAt.getTime())
    spanById.set(s.vehicleId, cur)
  }
  const reconDays: number[] = []
  for (const [vehicleId, routedAt] of completedAtById) {
    const span = spanById.get(vehicleId)
    if (!span || !isFinite(span.first)) continue
    const end = span.last > 0 ? span.last : routedAt.getTime()
    reconDays.push(Math.max(0, (end - span.first) / DAY_MS))
  }

  // Avg time per stage type for stages finished in range (blocked time excluded)
  const stageHours: Record<string, number[]> = {}
  for (const s of doneStages) {
    if (!s.completedAt) continue
    const hours = (s.completedAt.getTime() - s.startedAt.getTime()) / 3600000 - s.totalBlockedSeconds / 3600
    ;(stageHours[s.stage] ??= []).push(Math.max(0, hours))
  }
  const stageAvgs = Object.entries(stageHours)
    .map(([stage, hours]) => ({ stage, avgHours: avg(hours) ?? 0, count: hours.length }))
    .sort((a, b) => b.count - a.count)

  return {
    avgDaysInRecon: avg(reconDays),
    reconCompletedCount: completedIds.length,
    stageAvgs,
    sentToExternal,
    returnedFromExternal,
    partsCreated,
    partsReceived: receivedParts.length,
    // requested → received, for parts received in range (same updatedAt caveat)
    avgPartDays: avg(receivedParts.map(p => Math.max(0, (p.updatedAt.getTime() - p.createdAt.getTime()) / DAY_MS))),
    live: {
      inRecon: liveInRecon,
      atExternal: liveAtExternal,
      awaitingRouting: liveAwaitingRouting,
    },
  }
}
