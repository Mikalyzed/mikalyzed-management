// scripts/dms/create-canonical-for-n136471.ts
// One-shot: create the canonical Vehicle row for N136471 (1987 Chevrolet Caprice)
// whose InventoryVehicle row exists but has no Vehicle counterpart.
// Mirrors the backfill's orphan-IV creation path + writes a VehicleMigrationMap row.
//
// Run dry-run first:  npx tsx scripts/dms/create-canonical-for-n136471.ts
// Then commit:        npx tsx scripts/dms/create-canonical-for-n136471.ts --apply

import { prisma } from '@/lib/db'

const APPLY = process.argv.includes('--apply')
const TARGET = 'N136471'

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN'} — target stockNumber: ${TARGET}`)

  const existingV = await prisma.vehicle.findUnique({ where: { stockNumber: TARGET } })
  if (existingV) {
    console.log(`⚠️  Canonical Vehicle already exists for ${TARGET} (id=${existingV.id}). Nothing to do.`)
    return
  }

  const iv = await prisma.inventoryVehicle.findUnique({ where: { stockNumber: TARGET } })
  if (!iv) {
    console.error(`❌ InventoryVehicle row not found for ${TARGET}.`)
    process.exit(1)
  }

  console.log(`\nSource IV row:`)
  console.log(`  ${iv.year ?? ''} ${iv.make} ${iv.model}`)
  console.log(`  vin: ${iv.vin ?? '—'}`)
  console.log(`  status: ${iv.status}    purchaseType: ${iv.purchaseType ?? '—'}`)
  console.log(`  askingPrice: ${iv.askingPrice ?? '—'}    vehicleCost: ${iv.vehicleCost ?? '—'}`)

  if (!APPLY) {
    console.log(`\n💡 Dry run — re-run with --apply to create the canonical Vehicle row.`)
    return
  }

  const result = await prisma.$transaction(async (tx) => {
    const created = await tx.vehicle.create({
      data: {
        stockNumber: iv.stockNumber,
        vin: iv.vin,
        year: iv.year,
        make: iv.make || 'Unknown',
        model: iv.model || 'Unknown',
        color: iv.color,
        status: 'inventory_only',
        inventoryStatus: iv.status,
        vehicleInfo: iv.vehicleInfo,
        mileage: iv.mileage,
        location: iv.location,
        askingPrice: iv.askingPrice,
        vehicleCost: iv.vehicleCost,
        purchaseType: iv.purchaseType,
        purchasedFrom: iv.purchasedFrom,
        titleStatus: iv.titleStatus,
        dateInStock: iv.dateInStock,
        legacyInventoryVehicleId: iv.id,
      },
    })
    await tx.vehicleMigrationMap.create({
      data: {
        oldVehicleId: null,
        oldInventoryVehicleId: iv.id,
        canonicalVehicleId: created.id,
        matchMethod: 'orphan_iv_created',
        matchConfidence: 'high',
        notes: 'Manual catch-up after canonical cutover — backfill skipped this row for unknown reason',
      },
    })
    await tx.activityLog.create({
      data: {
        entityType: 'vehicle',
        entityId: created.id,
        action: 'canonical_backfill_orphan_iv',
        details: { stockNumber: TARGET, source: 'manual_catchup_post_cutover', oldInventoryVehicleId: iv.id },
      },
    })
    return created
  })

  console.log(`\n✅ Created canonical Vehicle ${result.id} (status=${result.status}, inventoryStatus=${result.inventoryStatus}).`)
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
