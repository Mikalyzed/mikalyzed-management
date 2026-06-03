/**
 * One-shot duplicate-vehicle merge script
 *
 * After Phase 0.B backfill, surfaced 7 duplicate pairs where the same physical
 * car ended up as two Vehicle rows. This script merges them per user-confirmed
 * decisions (see chat 2026-06-03). Each merge runs in a transaction:
 *
 *   - Copy inventory scalar fields from loser → keeper (only into NULL fields)
 *   - Re-point all FKs: vehicle_stages, parts, transport_requests,
 *     opportunities, vehicle_interest, calendar_items
 *   - Re-point activity_log entries (where entity_type='vehicle' AND
 *     entity_id = loser.id)
 *   - Optionally rename keeper's stock_number (Pair 7) or fix its year (Pair 2)
 *   - Log to vehicle_migration_map with matchMethod='manual_review'
 *   - Delete loser
 *
 * Idempotent: re-running after success is a no-op (looks up by stock_number;
 * if loser already gone, skips).
 *
 * Usage:
 *   npx tsx scripts/dms/merge-duplicate-vehicles.ts            # dry-run
 *   npx tsx scripts/dms/merge-duplicate-vehicles.ts --execute  # apply
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const EXECUTE = process.argv.includes('--execute')

// Inventory-scalar fields we want to backfill from loser → keeper if keeper field is null
const INVENTORY_FIELDS = [
  'vin',
  'vehicleInfo',
  'mileage',
  'location',
  'askingPrice',
  'vehicleCost',
  'purchaseType',
  'purchasedFrom',
  'purchasedFromVendorId',
  'titleStatus',
  'dateInStock',
  'inventoryStatus',
  'consignmentCommissionPct',
  'color',
  'trim',
] as const

type MergeSpec = {
  pair: string
  description: string
  keeperStock: string
  loserStock: string
  renameKeeperStockTo?: string // Pair 7
  setKeeperYear?: number // Pair 2
}

const MERGES: MergeSpec[] = [
  { pair: '1', description: '1961 Cadillac Coupe De Ville', keeperStock: 'N082793', loserStock: '082793' },
  { pair: '2', description: 'Chevrolet Caprice Classic (year fix 1988→1990)', keeperStock: 'N100617', loserStock: '100617', setKeeperYear: 1990 },
  { pair: '3', description: '1983 Porsche 911 SC', keeperStock: 'N170942', loserStock: '170942' },
  { pair: '4', description: '1955 Porsche Beck', keeperStock: 'N285206', loserStock: '285206' },
  { pair: '5', description: '1985 Chevy C/K10 Farm Truck', keeperStock: 'N403450', loserStock: '403450' },
  { pair: '6', description: '1992 GMC 1500 Hotwheels', keeperStock: 'N517539', loserStock: '517539' },
  { pair: '7', description: '1979 Pontiac Trans Am (rename N141867→NI41867)', keeperStock: 'N141867', loserStock: 'NI41867', renameKeeperStockTo: 'NI41867' },
]

async function mergePair(spec: MergeSpec) {
  console.log(`\n[Pair ${spec.pair}] ${spec.description}`)
  console.log(`  keeper: ${spec.keeperStock}    loser: ${spec.loserStock}`)

  const keeper = await prisma.vehicle.findUnique({ where: { stockNumber: spec.keeperStock } })
  const loser = await prisma.vehicle.findUnique({ where: { stockNumber: spec.loserStock } })

  if (!keeper) {
    console.log(`  SKIP — keeper '${spec.keeperStock}' not found (maybe already merged + renamed)`)
    return
  }
  if (!loser) {
    console.log(`  SKIP — loser '${spec.loserStock}' not found (already merged)`)
    return
  }
  if (keeper.id === loser.id) {
    console.log(`  SKIP — same row, no-op`)
    return
  }

  // Build the update payload for keeper (only fill NULL fields from loser)
  const keeperPatch: Record<string, unknown> = {}
  for (const field of INVENTORY_FIELDS) {
    const k = (keeper as Record<string, unknown>)[field]
    const l = (loser as Record<string, unknown>)[field]
    if ((k === null || k === undefined) && l !== null && l !== undefined) {
      keeperPatch[field] = l
    }
  }
  if (spec.setKeeperYear !== undefined) {
    keeperPatch.year = spec.setKeeperYear
  }

  console.log(`  fields to fill on keeper: ${Object.keys(keeperPatch).length > 0 ? Object.keys(keeperPatch).join(', ') : '(none)'}`)

  if (!EXECUTE) {
    // Just report what would happen
    const counts = await prisma.$transaction([
      prisma.vehicleStage.count({ where: { vehicleId: loser.id } }),
      prisma.part.count({ where: { vehicleId: loser.id } }),
      prisma.transportRequest.count({ where: { vehicleId: loser.id } }),
      prisma.opportunity.count({ where: { vehicleId: loser.id } }),
      prisma.vehicleInterest.count({ where: { vehicleId: loser.id } }),
      prisma.calendarItem.count({ where: { vehicleId: loser.id } }),
      prisma.activityLog.count({ where: { entityType: 'vehicle', entityId: loser.id } }),
    ])
    console.log(`  FKs to repoint: ${counts[0]} stages, ${counts[1]} parts, ${counts[2]} transports, ${counts[3]} opps, ${counts[4]} interests, ${counts[5]} calendars, ${counts[6]} activity_log`)
    if (spec.renameKeeperStockTo) console.log(`  rename keeper stock: ${spec.keeperStock} → ${spec.renameKeeperStockTo}`)
    return
  }

  // EXECUTE — do it in a transaction
  await prisma.$transaction(async (tx) => {
    // Step 1: re-point all FKs from loser → keeper
    await tx.vehicleStage.updateMany({ where: { vehicleId: loser.id }, data: { vehicleId: keeper.id } })
    await tx.part.updateMany({ where: { vehicleId: loser.id }, data: { vehicleId: keeper.id } })
    await tx.transportRequest.updateMany({ where: { vehicleId: loser.id }, data: { vehicleId: keeper.id } })
    await tx.opportunity.updateMany({ where: { vehicleId: loser.id }, data: { vehicleId: keeper.id } })
    await tx.vehicleInterest.updateMany({ where: { vehicleId: loser.id }, data: { vehicleId: keeper.id } })
    await tx.calendarItem.updateMany({ where: { vehicleId: loser.id }, data: { vehicleId: keeper.id } })

    // Step 2: re-point activity_log entries (no FK enforcement but data integrity matters)
    await tx.activityLog.updateMany({
      where: { entityType: 'vehicle', entityId: loser.id },
      data: { entityId: keeper.id },
    })

    // Step 3: patch keeper with merged inventory fields + optional year fix
    if (Object.keys(keeperPatch).length > 0) {
      await tx.vehicle.update({ where: { id: keeper.id }, data: keeperPatch })
    }

    // Step 4: copy loser's legacy_inventory_vehicle_id onto keeper if keeper doesn't have one
    if (loser.legacyInventoryVehicleId && !keeper.legacyInventoryVehicleId) {
      await tx.vehicle.update({
        where: { id: keeper.id },
        data: { legacyInventoryVehicleId: loser.legacyInventoryVehicleId },
      })
    }

    // Step 5: write a vehicle_migration_map audit row for the manual merge
    await tx.vehicleMigrationMap.create({
      data: {
        oldVehicleId: loser.id,
        oldInventoryVehicleId: loser.legacyInventoryVehicleId,
        canonicalVehicleId: keeper.id,
        matchMethod: 'manual_review',
        matchConfidence: 'manual',
        notes: `Pair ${spec.pair}: ${spec.description} — merged loser ${spec.loserStock} into keeper ${spec.keeperStock}`,
      },
    })

    // Step 6: optionally rename loser's stock_number FIRST (to avoid UNIQUE collision)
    //         and then rename keeper to the target stock_number.
    if (spec.renameKeeperStockTo) {
      // Free up the loser's stock_number first
      const tempLoserStock = `${spec.loserStock}__DELETING_${Date.now()}`
      await tx.vehicle.update({ where: { id: loser.id }, data: { stockNumber: tempLoserStock } })
      // Now rename keeper to the desired stock number
      await tx.vehicle.update({ where: { id: keeper.id }, data: { stockNumber: spec.renameKeeperStockTo } })
    }

    // Step 7: delete the loser
    await tx.vehicle.delete({ where: { id: loser.id } })

    // Step 8: write activity_log for the merge (so it shows up on the keeper's timeline)
    await tx.activityLog.create({
      data: {
        entityType: 'vehicle',
        entityId: keeper.id,
        action: 'merged_duplicate',
        details: {
          pair: spec.pair,
          description: spec.description,
          loserStockNumber: spec.loserStock,
          loserVehicleId: loser.id,
          fieldsFilled: Object.keys(keeperPatch),
          renamedTo: spec.renameKeeperStockTo,
        },
      },
    })
  }, { timeout: 30000 })

  console.log(`  ✓ merged`)
}

async function main() {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`Duplicate Vehicle Merge — ${EXECUTE ? 'EXECUTE MODE' : 'DRY RUN'}`)
  console.log(`${'='.repeat(60)}`)

  for (const spec of MERGES) {
    await mergePair(spec)
  }

  console.log(`\n${'='.repeat(60)}`)
  if (EXECUTE) {
    console.log('✓ All merges complete.')
  } else {
    console.log('Dry run only. Re-run with --execute to apply.')
  }
  console.log(`${'='.repeat(60)}\n`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
