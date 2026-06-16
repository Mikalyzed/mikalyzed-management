import { prisma } from './db'
import { findInventoryByStockNumber } from './dms/vehicle/canonical-reader'
import { setInventoryStatusByStockNumber } from './dms/vehicle/canonical-writer'

/**
 * Recomputes inventory-side status for a given stock# based on current
 * Vehicle (recon) and ExternalRepair state. Priority:
 *   external_repair > in_recon > in_stock
 * Does not overwrite `sold` or `removed` — those are terminal/manual states.
 *
 * Reads/writes are flag-gated via canonical-reader/writer — flips to canonical
 * Vehicle.inventoryStatus when DMS_READ_CANONICAL_VEHICLE=true.
 */
export async function recomputeInventoryStatus(stockNumber: string) {
  if (!stockNumber) return

  const inv = await findInventoryByStockNumber(stockNumber, {
    select: { id: true, status: true },
  }) as { id: string; status: string } | null
  if (!inv) return
  if (inv.status === 'sold' || inv.status === 'removed') return

  const [activeRecon, activeExternal] = await Promise.all([
    // "Active recon" = a Vehicle row that (a) isn't a placeholder/terminal and
    // (b) has at least one stage record that's still pending/in_progress/blocked.
    // Driving this off the stages directly avoids depending on Vehicle.completedAt
    // staying in sync — which it doesn't, in cases where a completed car was
    // restarted or moved back into a stage and the completedAt timestamp didn't
    // get cleared.  See #N514814 (2026-06-05): status='mechanic', completedAt
    // set, live mechanic stage — the old `completedAt: null` check missed it.
    prisma.vehicle.findFirst({
      where: {
        stockNumber,
        // 'inventory_only' = car exists in the inventory feed but never actually
        //   started recon.  'archived' = placeholder Vehicle created when adding
        //   a part to a non-recon car.  Neither is a real recon line, so they
        //   must not flip InventoryVehicle.status to 'in_recon'.
        status: { notIn: ['completed', 'inventory_only', 'archived'] },
        stages: { some: { status: { notIn: ['done', 'skipped'] } } },
      },
      select: { id: true },
    }),
    prisma.externalRepair.findFirst({
      where: { stockNumber, status: { not: 'returned' } },
      select: { id: true },
    }),
  ])

  const nextStatus = activeExternal
    ? 'external_repair'
    : activeRecon
      ? 'in_recon'
      : 'in_stock'

  if (nextStatus !== inv.status) {
    await setInventoryStatusByStockNumber(stockNumber, nextStatus)
  }
}
