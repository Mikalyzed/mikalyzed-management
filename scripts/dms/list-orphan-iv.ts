// scripts/dms/list-orphan-iv.ts
// Quick: find InventoryVehicle rows that have NO matching canonical Vehicle by stockNumber.
// Should be very few — these are anomalies the backfill (or its precursor) missed.

import { prisma } from '@/lib/db'

async function main() {
  const ivs = await prisma.inventoryVehicle.findMany({
    select: {
      id: true, stockNumber: true, vin: true, year: true, make: true, model: true,
      vehicleInfo: true, status: true, isActive: true, dateInStock: true, createdAt: true,
    },
  })
  const orphans: typeof ivs = []
  for (const iv of ivs) {
    const v = await prisma.vehicle.findUnique({
      where: { stockNumber: iv.stockNumber },
      select: { id: true },
    })
    if (!v) orphans.push(iv)
  }
  console.log(`Found ${orphans.length} orphan InventoryVehicle row(s) (no matching canonical Vehicle):\n`)
  for (const iv of orphans) {
    console.log(`  stockNumber: ${iv.stockNumber}`)
    console.log(`     vehicle: ${iv.year ?? ''} ${iv.make} ${iv.model} ${iv.vehicleInfo ? `(${iv.vehicleInfo})` : ''}`)
    console.log(`     vin: ${iv.vin ?? '—'}`)
    console.log(`     status: ${iv.status}    isActive: ${iv.isActive}    dateInStock: ${iv.dateInStock?.toISOString() ?? '—'}`)
    console.log(`     created: ${iv.createdAt.toISOString()}`)
    console.log()
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
