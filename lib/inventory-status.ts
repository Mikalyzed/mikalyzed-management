import { prisma } from './db'

/**
 * Recomputes InventoryVehicle.status for a given stock# based on current
 * Vehicle (recon) and ExternalRepair state. Priority:
 *   external_repair > in_recon > in_stock
 * Does not overwrite `sold` or `removed` — those are terminal/manual states.
 */
export async function recomputeInventoryStatus(stockNumber: string) {
  if (!stockNumber) return

  const inv = await prisma.inventoryVehicle.findUnique({
    where: { stockNumber },
    select: { id: true, status: true },
  })
  if (!inv) return
  if (inv.status === 'sold' || inv.status === 'removed') return

  const [activeRecon, activeExternal] = await Promise.all([
    prisma.vehicle.findFirst({
      where: { stockNumber, completedAt: null },
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
    await prisma.inventoryVehicle.update({
      where: { id: inv.id },
      data: { status: nextStatus },
    })
  }
}
