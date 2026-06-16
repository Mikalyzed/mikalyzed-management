// lib/dms/vehicle/canonical-reader.ts
// Flag-gated reader shim for the canonical-Vehicle migration.
//
// When DMS_READ_CANONICAL_VEHICLE=false (default): hits legacy `InventoryVehicle`
// When DMS_READ_CANONICAL_VEHICLE=true: hits canonical `Vehicle` and remaps the
// where/orderBy/return shapes so call-sites keep working unchanged.
//
// The canonical `Vehicle` has both a recon-side `status` (mechanic/detailing/...)
// and an inventory-side `inventoryStatus` (in_stock/in_recon/sold/...). Old call
// sites refer to InventoryVehicle.status which maps to Vehicle.inventoryStatus.
// This module owns the mapping so callers don't have to.

import { prisma } from '@/lib/db'
import { isCanonicalReadMode } from '@/lib/dms/feature-flags'

export { isCanonicalReadMode }

/**
 * Remap a Prisma `where` clause expressed in InventoryVehicle terms into one
 * that works against the canonical Vehicle table. Recursively walks AND/OR/NOT.
 *
 * - `status` -> `inventoryStatus`
 * - `isActive` is dropped (no such column on Vehicle; treated as always-true)
 */
function remapWhereToCanonical(where: any): any {
  if (!where || typeof where !== 'object') return where
  if (Array.isArray(where)) return where.map(remapWhereToCanonical)
  const out: any = {}
  for (const [k, v] of Object.entries(where)) {
    if (k === 'isActive') continue
    if (k === 'status') {
      out.inventoryStatus = v
      continue
    }
    if (k === 'AND' || k === 'OR' || k === 'NOT') {
      out[k] = Array.isArray(v) ? v.map(remapWhereToCanonical) : remapWhereToCanonical(v)
      continue
    }
    out[k] = v
  }
  return out
}

/**
 * Same as remapWhereToCanonical but for `orderBy` clauses, where `status`
 * also needs to become `inventoryStatus`.
 */
function remapOrderByToCanonical(orderBy: any): any {
  if (!orderBy) return orderBy
  if (Array.isArray(orderBy)) return orderBy.map(remapOrderByToCanonical)
  if (typeof orderBy !== 'object') return orderBy
  const out: any = {}
  for (const [k, v] of Object.entries(orderBy)) {
    if (k === 'status') out.inventoryStatus = v
    else out[k] = v
  }
  return out
}

/**
 * If the caller passed an explicit `select` shaped for InventoryVehicle,
 * remap `status: true` -> `inventoryStatus: true` so the row that comes
 * back has the field we need to alias.
 */
function remapSelectToCanonical(select: any): any {
  if (!select || typeof select !== 'object') return select
  const out: any = {}
  let needsInventoryStatus = false
  for (const [k, v] of Object.entries(select)) {
    if (k === 'isActive') continue
    if (k === 'status') {
      out.inventoryStatus = v
      needsInventoryStatus = true
      continue
    }
    out[k] = v
  }
  // If caller asked for `id`, we already include it. If they asked for nothing
  // and used a default findMany, we'd get the full row anyway.
  if (needsInventoryStatus && !('inventoryStatus' in out)) {
    out.inventoryStatus = true
  }
  return out
}

/**
 * Take a Vehicle row that may have `inventoryStatus` and present it back to
 * the caller as if it were an InventoryVehicle row: `status` field, synthesized
 * `isActive: true`.
 */
function reshapeVehicleAsInventory<T extends Record<string, any>>(row: T | null): any {
  if (!row) return row
  if (!('inventoryStatus' in row)) return row
  const { inventoryStatus, ...rest } = row as any
  return { ...rest, status: inventoryStatus, isActive: true }
}

/**
 * Inventory list query — used by /api/inventory GET, /api/vehicles list, etc.
 * Returns rows shaped like InventoryVehicle so caller code doesn't change.
 */
export async function getInventoryList(args: {
  where?: any
  orderBy?: any
  take?: number
  skip?: number
  select?: any
}) {
  if (isCanonicalReadMode()) {
    const rows = await prisma.vehicle.findMany({
      where: { ...remapWhereToCanonical(args.where ?? {}), inventoryStatus: { not: null } },
      orderBy: remapOrderByToCanonical(args.orderBy),
      take: args.take,
      skip: args.skip,
      select: remapSelectToCanonical(args.select),
    })
    return rows.map(reshapeVehicleAsInventory)
  }
  return prisma.inventoryVehicle.findMany({
    where: args.where,
    orderBy: args.orderBy,
    take: args.take,
    skip: args.skip,
    select: args.select,
  })
}

export async function getInventoryCount(where?: any) {
  if (isCanonicalReadMode()) {
    return prisma.vehicle.count({
      where: { ...remapWhereToCanonical(where ?? {}), inventoryStatus: { not: null } },
    })
  }
  return prisma.inventoryVehicle.count({ where })
}

/**
 * GroupBy returning `{ status, _count }` rows so callers keep working.
 * In canonical mode we group by Vehicle.inventoryStatus and rename the
 * key on the way out.
 */
export async function getInventoryGroupByStatus(where?: any): Promise<{ status: string; _count: number }[]> {
  if (isCanonicalReadMode()) {
    const rows = await prisma.vehicle.groupBy({
      by: ['inventoryStatus'],
      where: { ...remapWhereToCanonical(where ?? {}), inventoryStatus: { not: null } },
      _count: true,
    })
    return rows
      .filter(r => r.inventoryStatus !== null)
      .map(r => ({ status: r.inventoryStatus as string, _count: r._count as unknown as number }))
  }
  const rows = await prisma.inventoryVehicle.groupBy({
    by: ['status'],
    where,
    _count: true,
  })
  return rows.map(r => ({ status: r.status, _count: r._count as unknown as number }))
}

/**
 * Lookup by stockNumber. Returns null if not found.
 * Caller can pass `select` to narrow what columns come back.
 */
export async function findInventoryByStockNumber(
  stockNumber: string,
  opts?: { select?: any },
) {
  if (isCanonicalReadMode()) {
    const row = await prisma.vehicle.findUnique({
      where: { stockNumber },
      select: opts?.select ? remapSelectToCanonical(opts.select) : undefined,
    })
    // Filter out rows that don't have inventoryStatus (storage / non-inventoried)
    if (row && 'inventoryStatus' in row && row.inventoryStatus == null) return null
    return reshapeVehicleAsInventory(row)
  }
  return prisma.inventoryVehicle.findUnique({
    where: { stockNumber },
    select: opts?.select,
  })
}
