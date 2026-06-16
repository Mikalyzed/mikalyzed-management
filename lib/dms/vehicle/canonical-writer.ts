// lib/dms/vehicle/canonical-writer.ts
// Flag-gated writer shim for the canonical-Vehicle migration.
//
// When DMS_READ_CANONICAL_VEHICLE=false (default): writes go to legacy InventoryVehicle
// When DMS_READ_CANONICAL_VEHICLE=true: writes go to canonical Vehicle, with
// status->inventoryStatus remap. The `isActive` column doesn't exist on Vehicle
// and is silently dropped from inputs.
//
// We reuse the same env flag as the reader so reads + writes always stay on
// the same table — never a mixed state.

import { prisma } from '@/lib/db'
import { isCanonicalReadMode } from '@/lib/dms/feature-flags'

/**
 * Fields shared by InventoryVehicle and the absorbed inventory scalars on
 * canonical Vehicle. `status` here is the inventory-side status (in_stock /
 * in_recon / external_repair / sold / removed).
 */
type InventoryWritePayload = {
  vin?: string | null
  vehicleInfo?: string | null
  year?: number | null
  make?: string
  model?: string
  color?: string | null
  trim?: string | null
  mileage?: number | null
  location?: string | null
  askingPrice?: number | null
  vehicleCost?: number | null
  purchaseType?: string | null
  purchasedFrom?: string | null
  titleStatus?: string | null
  dateInStock?: Date | null
  status?: string
}

/**
 * For canonical Vehicle writes: rename `status` -> `inventoryStatus`, drop `isActive`.
 * For the create branch, we synthesize a default recon-side `status: 'inventory_only'`
 * so a brand-new Vehicle that comes in via CSV (no recon yet) doesn't pollute the
 * recon board — it stays invisible to recon UI until someone routes it through.
 */
function payloadToVehicleUpdate(p: InventoryWritePayload): any {
  const out: any = {}
  for (const [k, v] of Object.entries(p)) {
    if (k === 'isActive') continue
    if (k === 'status') {
      out.inventoryStatus = v
      continue
    }
    out[k] = v
  }
  return out
}

function payloadToVehicleCreate(stockNumber: string, p: InventoryWritePayload): any {
  const base = payloadToVehicleUpdate(p)
  return {
    ...base,
    stockNumber,
    // canonical Vehicle requires non-null make/model — fall back to 'Unknown'
    make: base.make || 'Unknown',
    model: base.model || 'Unknown',
    // brand-new inventory rows stay off the recon board until routed
    status: 'inventory_only',
    legacyInventoryVehicleId: null,
  }
}

/**
 * CSV-import upsert. Used by /api/inventory POST action=import.
 *
 * Behavior:
 *   - flag OFF: prisma.inventoryVehicle.upsert (unchanged legacy path)
 *   - flag ON: prisma.vehicle.upsert keyed by stockNumber, status->inventoryStatus
 */
export async function upsertInventoryRecord(args: {
  stockNumber: string
  update: InventoryWritePayload
  create: InventoryWritePayload
}) {
  if (isCanonicalReadMode()) {
    return prisma.vehicle.upsert({
      where: { stockNumber: args.stockNumber },
      update: payloadToVehicleUpdate(args.update),
      create: payloadToVehicleCreate(args.stockNumber, args.create),
    })
  }
  return prisma.inventoryVehicle.upsert({
    where: { stockNumber: args.stockNumber },
    update: args.update as any,
    create: { ...args.create, stockNumber: args.stockNumber } as any,
  })
}

/**
 * Used by /api/inventory POST action=import to mark inventory rows that
 * fell off the CSV (DealerCenter removed them = sold) as `sold`.
 *
 * - flag OFF: legacy updateMany filtering isActive + status IN/NOT IN
 * - flag ON:  canonical updateMany on Vehicle.inventoryStatus
 */
export async function markStaleInventoryAsSold(args: {
  activeStockNumbers: string[]
  alsoInStatuses: string[] // e.g. ['in_stock', 'in_recon', 'external_repair']
}): Promise<{ count: number }> {
  if (isCanonicalReadMode()) {
    return prisma.vehicle.updateMany({
      where: {
        stockNumber: { notIn: args.activeStockNumbers },
        inventoryStatus: { in: args.alsoInStatuses },
      },
      data: { inventoryStatus: 'sold' },
    })
  }
  return prisma.inventoryVehicle.updateMany({
    where: {
      isActive: true,
      status: { in: args.alsoInStatuses },
      stockNumber: { notIn: args.activeStockNumbers },
    },
    data: { status: 'sold' },
  })
}

/**
 * Used by lib/inventory-status.ts to flip the inventory-side status of a
 * single vehicle (typically as a side-effect of recon/external state changes).
 * Keyed by stockNumber because Vehicle.id != InventoryVehicle.id in general.
 */
export async function setInventoryStatusByStockNumber(stockNumber: string, nextStatus: string) {
  if (isCanonicalReadMode()) {
    return prisma.vehicle.updateMany({
      where: { stockNumber },
      data: { inventoryStatus: nextStatus },
    })
  }
  return prisma.inventoryVehicle.updateMany({
    where: { stockNumber },
    data: { status: nextStatus },
  })
}
