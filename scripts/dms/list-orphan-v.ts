// scripts/dms/list-orphan-v.ts
// One-shot: list every "orphan V" canonical Vehicle — Vehicles created without an
// InventoryVehicle counterpart (typically via the V2 vehicle-jacket UI).
// These won't appear on the Inventory page after the canonical cutover unless we
// backfill inventoryStatus on them.

import { prisma } from '@/lib/db'

async function main() {
  const orphanMaps = await prisma.vehicleMigrationMap.findMany({
    where: { matchMethod: 'orphan_v_left_alone' },
    select: { canonicalVehicleId: true, createdAt: true, notes: true },
    orderBy: { createdAt: 'desc' },
  })

  const vehicleIds = orphanMaps.map(m => m.canonicalVehicleId)

  const vehicles = await prisma.vehicle.findMany({
    where: { id: { in: vehicleIds } },
    select: {
      id: true,
      stockNumber: true,
      vin: true,
      year: true,
      make: true,
      model: true,
      status: true,
      inventoryStatus: true,
      vehicleInfo: true,
      createdAt: true,
      completedAt: true,
      askingPrice: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  console.log(`Found ${vehicles.length} orphan-V Vehicles (created without an InventoryVehicle):\n`)
  console.log('stockNumber'.padEnd(15), 'year', 'make/model'.padEnd(28), 'recon'.padEnd(18), 'invStatus'.padEnd(14), 'created')
  console.log(''.padEnd(100, '─'))
  for (const v of vehicles) {
    const stock = (v.stockNumber || '(none)').padEnd(15)
    const yr = String(v.year ?? '????').padEnd(4)
    const mm = `${v.make ?? ''} ${v.model ?? ''}`.trim().slice(0, 27).padEnd(28)
    const reconStatus = (v.status ?? '—').padEnd(18)
    const invStatus = (v.inventoryStatus ?? '∅ NULL').padEnd(14)
    const created = v.createdAt.toISOString().split('T')[0]
    console.log(stock, yr, mm, reconStatus, invStatus, created)
  }

  // Per-status tallies for quick sanity check
  const reconTallies: Record<string, number> = {}
  const invTallies: Record<string, number> = {}
  for (const v of vehicles) {
    const r = v.status ?? '(null)'
    const i = v.inventoryStatus ?? '(null)'
    reconTallies[r] = (reconTallies[r] ?? 0) + 1
    invTallies[i] = (invTallies[i] ?? 0) + 1
  }
  console.log('\nRecon-status tallies:', reconTallies)
  console.log('Inventory-status tallies:', invTallies)
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
