/**
 * Phase 0.B — Backfill canonical Vehicle from InventoryVehicle
 *
 * For each inventory_vehicles row:
 *   1. If a matching Vehicle exists (same stock_number) → copy IV scalars onto it
 *      (only into NULL Vehicle fields; never overwrite recon data)
 *   2. If no match → create a new Vehicle with inventory_only status
 *   3. Record the mapping in vehicle_migration_map (audit trail per VEH-02)
 *   4. Also record orphan-V cases (Vehicles with no IV match) for visibility
 *
 * Idempotent: re-running this script after a successful pass is a no-op.
 * (Detected via Vehicle.legacyInventoryVehicleId already set.)
 *
 * Usage:
 *   npx tsx scripts/dms/backfill-canonical-vehicle.ts            # dry-run (default)
 *   npx tsx scripts/dms/backfill-canonical-vehicle.ts --execute  # actually write
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const EXECUTE = process.argv.includes('--execute')

type Report = {
  matched: number
  orphanIvCreated: number
  orphanVRecorded: number
  alreadyProcessedSkipped: number
  errors: { stockNumber: string; reason: string }[]
}

// Map InventoryVehicle.purchaseType → Vehicle.purchaseType
// Legacy "FLOORING" becomes "PURCHASED" (per schema note).
function mapPurchaseType(iv: string | null): string | null {
  if (!iv) return null
  const v = iv.trim().toUpperCase()
  if (v === 'FLOORING') return 'PURCHASED'
  if (v === 'TRADE-IN' || v === 'TRADE IN' || v === 'TRADEIN') return 'TRADE_IN'
  return v
}

// Map InventoryVehicle.status → Vehicle.inventoryStatus
// Keep as-is (in_stock/in_recon/external_repair/sold/removed)
function mapInventoryStatus(s: string | null): string | null {
  if (!s) return null
  return s.trim().toLowerCase()
}

async function main() {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`Phase 0.B Backfill — ${EXECUTE ? 'EXECUTE MODE' : 'DRY RUN'}`)
  console.log(`${'='.repeat(60)}\n`)

  const report: Report = {
    matched: 0,
    orphanIvCreated: 0,
    orphanVRecorded: 0,
    alreadyProcessedSkipped: 0,
    errors: [],
  }

  const inventoryVehicles = await prisma.inventoryVehicle.findMany({ orderBy: { stockNumber: 'asc' } })
  console.log(`Found ${inventoryVehicles.length} InventoryVehicle rows to process\n`)

  for (const iv of inventoryVehicles) {
    const existing = await prisma.vehicle.findUnique({ where: { stockNumber: iv.stockNumber } })

    try {
      if (existing) {
        // Already processed?
        if (existing.legacyInventoryVehicleId === iv.id) {
          report.alreadyProcessedSkipped++
          continue
        }

        // MERGE: copy scalars onto existing Vehicle (only into null fields)
        const updates: Record<string, unknown> = {}
        if (existing.vehicleInfo === null) updates.vehicleInfo = iv.vehicleInfo
        if (existing.mileage === null && iv.mileage !== null) updates.mileage = iv.mileage
        if (existing.location === null && iv.location !== null) updates.location = iv.location
        if (existing.askingPrice === null && iv.askingPrice !== null) updates.askingPrice = iv.askingPrice
        if (existing.vehicleCost === null && iv.vehicleCost !== null) updates.vehicleCost = iv.vehicleCost
        if (existing.purchaseType === null) updates.purchaseType = mapPurchaseType(iv.purchaseType)
        if (existing.purchasedFrom === null) updates.purchasedFrom = iv.purchasedFrom
        if (existing.titleStatus === null) updates.titleStatus = iv.titleStatus
        if (existing.dateInStock === null && iv.dateInStock !== null) updates.dateInStock = iv.dateInStock
        if (existing.inventoryStatus === null) updates.inventoryStatus = mapInventoryStatus(iv.status)
        // legacy bridge — always set if not yet set
        updates.legacyInventoryVehicleId = iv.id
        updates.legacyVehicleId = existing.id

        if (EXECUTE) {
          await prisma.$transaction([
            prisma.vehicle.update({ where: { id: existing.id }, data: updates }),
            prisma.vehicleMigrationMap.create({
              data: {
                oldVehicleId: existing.id,
                oldInventoryVehicleId: iv.id,
                canonicalVehicleId: existing.id,
                matchMethod: 'stock_number',
                matchConfidence: 'high',
                notes: `merged ${Object.keys(updates).length - 2} scalars`,
              },
            }),
          ])
        }
        report.matched++
        console.log(`  MATCH  ${iv.stockNumber.padEnd(10)} → Vehicle ${existing.id.slice(0, 8)} (+${Object.keys(updates).length - 2} fields)`)
      } else {
        // ORPHAN IV: create canonical Vehicle in inventory_only mode
        const newVehicleData = {
          stockNumber: iv.stockNumber,
          vin: iv.vin,
          year: iv.year,
          make: iv.make,
          model: iv.model,
          trim: iv.trim,
          color: iv.color,
          status: 'inventory_only',
          // absorbed inventory fields
          vehicleInfo: iv.vehicleInfo,
          mileage: iv.mileage,
          location: iv.location,
          askingPrice: iv.askingPrice,
          vehicleCost: iv.vehicleCost,
          purchaseType: mapPurchaseType(iv.purchaseType),
          purchasedFrom: iv.purchasedFrom,
          titleStatus: iv.titleStatus,
          dateInStock: iv.dateInStock,
          inventoryStatus: mapInventoryStatus(iv.status),
          legacyInventoryVehicleId: iv.id,
          // legacyVehicleId will be set to the newly-created id below in same tx
        }

        if (EXECUTE) {
          const created = await prisma.vehicle.create({ data: newVehicleData })
          await prisma.$transaction([
            prisma.vehicle.update({ where: { id: created.id }, data: { legacyVehicleId: created.id } }),
            prisma.vehicleMigrationMap.create({
              data: {
                oldVehicleId: null,
                oldInventoryVehicleId: iv.id,
                canonicalVehicleId: created.id,
                matchMethod: 'orphan_iv_created',
                matchConfidence: 'high',
                notes: 'created from orphan InventoryVehicle (no matching recon Vehicle by stock_number)',
              },
            }),
          ])
        }
        report.orphanIvCreated++
        console.log(`  CREATE ${iv.stockNumber.padEnd(10)} → new Vehicle ${iv.year ?? '????'} ${iv.make} ${iv.model.slice(0, 30)}`)
      }
    } catch (e: unknown) {
      const reason = e instanceof Error ? e.message : String(e)
      report.errors.push({ stockNumber: iv.stockNumber, reason })
      console.log(`  ERROR  ${iv.stockNumber.padEnd(10)} → ${reason}`)
    }
  }

  // Also record orphan Vs (Vehicles with no matching InventoryVehicle)
  // so the migration map is comprehensive.
  const orphanVehicles = await prisma.vehicle.findMany({
    where: {
      legacyInventoryVehicleId: null,
      status: { not: 'inventory_only' }, // exclude the ones we just created above
    },
    select: { id: true, stockNumber: true, year: true, make: true, model: true },
  })

  for (const ov of orphanVehicles) {
    try {
      if (EXECUTE) {
        // Mark as processed by setting legacyVehicleId = id (its own id)
        await prisma.$transaction([
          prisma.vehicle.update({ where: { id: ov.id }, data: { legacyVehicleId: ov.id } }),
          prisma.vehicleMigrationMap.create({
            data: {
              oldVehicleId: ov.id,
              oldInventoryVehicleId: null,
              canonicalVehicleId: ov.id,
              matchMethod: 'orphan_v_left_alone',
              matchConfidence: 'high',
              notes: 'recon Vehicle with no InventoryVehicle counterpart — inventory fields stay null',
            },
          }),
        ])
      }
      report.orphanVRecorded++
    } catch (e: unknown) {
      const reason = e instanceof Error ? e.message : String(e)
      report.errors.push({ stockNumber: ov.stockNumber, reason })
    }
  }

  console.log(`\n${'='.repeat(60)}`)
  console.log('Report:')
  console.log(`  Matched (IV merged into existing Vehicle):  ${report.matched}`)
  console.log(`  Orphan IV (new Vehicle created):            ${report.orphanIvCreated}`)
  console.log(`  Orphan V  (existing Vehicle, no IV data):   ${report.orphanVRecorded}`)
  console.log(`  Already processed (skipped):                ${report.alreadyProcessedSkipped}`)
  console.log(`  Errors:                                     ${report.errors.length}`)
  if (report.errors.length > 0) {
    console.log('\nErrors:')
    for (const e of report.errors) {
      console.log(`  ${e.stockNumber}: ${e.reason}`)
    }
  }
  console.log(`${'='.repeat(60)}\n`)

  if (!EXECUTE) {
    console.log('Dry run only. Re-run with --execute to apply changes.\n')
  } else {
    console.log('✓ Backfill complete.\n')
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
