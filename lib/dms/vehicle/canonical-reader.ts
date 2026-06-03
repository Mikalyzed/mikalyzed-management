// lib/dms/vehicle/canonical-reader.ts
// Drop-in replacement for legacy `prisma.inventoryVehicle.findMany` /
// `findUnique` / `count` / `groupBy` calls used by ~10 reader sites.
// Gated by DMS_READ_CANONICAL_VEHICLE — returns legacy behavior until 0.D flip.

import { prisma } from '@/lib/db'
import { isCanonicalReadMode } from '@/lib/dms/feature-flags'

export { isCanonicalReadMode }

/**
 * Inventory list query — used by /api/inventory GET, /api/vehicles list, etc.
 * When canonical mode is on, filters Vehicle rows to those that came from
 * DealerCenter (inventoryStatus IS NOT NULL means the row has inventory data).
 */
export async function getInventoryList(args: {
  where?: any
  orderBy?: any
  take?: number
  skip?: number
  select?: any
}) {
  if (isCanonicalReadMode()) {
    return prisma.vehicle.findMany({
      where: { ...(args.where ?? {}), inventoryStatus: { not: null } },
      orderBy: args.orderBy,
      take: args.take,
      skip: args.skip,
      select: args.select,
    })
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
    return prisma.vehicle.count({ where: { ...(where ?? {}), inventoryStatus: { not: null } } })
  }
  return prisma.inventoryVehicle.count({ where })
}

export async function getInventoryGroupByStatus(where?: any) {
  if (isCanonicalReadMode()) {
    // Group by inventoryStatus on canonical
    return prisma.vehicle.groupBy({
      by: ['inventoryStatus'],
      where: { ...(where ?? {}), inventoryStatus: { not: null } },
      _count: true,
    })
  }
  return prisma.inventoryVehicle.groupBy({
    by: ['status'],
    where,
    _count: true,
  })
}

export async function findInventoryByStockNumber(stockNumber: string) {
  if (isCanonicalReadMode()) {
    return prisma.vehicle.findUnique({ where: { stockNumber } })
  }
  return prisma.inventoryVehicle.findUnique({ where: { stockNumber } })
}
