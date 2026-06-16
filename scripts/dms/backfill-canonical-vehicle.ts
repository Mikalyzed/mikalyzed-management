// scripts/dms/backfill-canonical-vehicle.ts
// Phase 0.B — idempotent backfill from InventoryVehicle into canonical Vehicle.
//
// Run dry-run first:
//   npx tsx scripts/dms/backfill-canonical-vehicle.ts --dry-run
// Then commit:
//   npx tsx scripts/dms/backfill-canonical-vehicle.ts --commit
//
// IDEMPOTENT: safe to re-run. Every pass checks VehicleMigrationMap first; a row
// that's already mapped is skipped, never re-processed. A re-run after a clean
// run reports zero new operations.
//
// Strategy A invariant:
//   - Vehicle.id is canonical and is NEVER changed.
//   - Matched-merge ONLY fills canonical fields where they are currently null
//     (`existing ?? incoming` semantics). Recon-side data is sacred.
//   - Opportunity.vehicleId already points at Vehicle.id, so attribution is
//     preserved by construction — no FK repointing required.
//
// Phase 0.B explicitly does NOT populate Vehicle flooring columns
// (floorLender / floorPrincipal / floorDailyRate / floorAdvanceDate / floorStatus).
// Those are Phase 2 inventory-core fields; operators set them manually after
// cutover. Legacy `purchaseType = 'FLOORING'` is still mapped to canonical
// `PURCHASED` per RESEARCH Open Question 4, but no `floorStatus = 'active'`
// is opportunistically set.

import { prisma } from '@/lib/db'

const ARGS = new Set(process.argv.slice(2))
const COMMIT = ARGS.has('--commit')
const DRY = ARGS.has('--dry-run') || !COMMIT

// Map legacy InventoryVehicle.purchaseType strings to canonical Vehicle.purchaseType enum
// Per RESEARCH Open Question 4: "FLOORING" in IV means "PURCHASED with active floorplan"
function normalizePurchaseType(raw: string | null | undefined): string | null {
  if (!raw) return null
  const upper = raw.trim().toUpperCase().replace(/-/g, '_')
  if (upper === 'FLOORING') return 'PURCHASED' // Phase 0 NOTE: flooring tracking lands Phase 2
  if (upper === 'PURCHASED') return 'PURCHASED'
  if (upper === 'CONSIGNMENT') return 'CONSIGNMENT'
  if (upper === 'TRADE_IN' || upper === 'TRADEIN') return 'TRADE_IN'
  return upper // pass through anything else; admin review screen flags it
}

interface Stats {
  matched: number
  orphanIV: number
  orphanV: number
  dupVinNoted: number
  skipped: number
  errors: number
}

async function main() {
  const stats: Stats = {
    matched: 0,
    orphanIV: 0,
    orphanV: 0,
    dupVinNoted: 0,
    skipped: 0,
    errors: 0,
  }
  const errors: { ivId: string; error: string }[] = []

  console.log(`[backfill] mode=${COMMIT ? 'COMMIT' : 'DRY-RUN'}`)

  // === PASS 1+2: iterate InventoryVehicle, match by stockNumber or create ===
  const ivs = await prisma.inventoryVehicle.findMany()
  console.log(`[backfill] found ${ivs.length} InventoryVehicle rows`)

  for (const iv of ivs) {
    try {
      // Idempotency guard — already migrated?
      const existingMap = await prisma.vehicleMigrationMap.findFirst({
        where: { oldInventoryVehicleId: iv.id },
      })
      if (existingMap) {
        stats.skipped++
        continue
      }

      const reconMatch = iv.stockNumber
        ? await prisma.vehicle.findUnique({
            where: { stockNumber: iv.stockNumber },
          })
        : null

      if (reconMatch) {
        // PASS 1: matched — absorb IV scalars where canonical field is null
        if (COMMIT) {
          await prisma.$transaction([
            prisma.vehicle.update({
              where: { id: reconMatch.id },
              data: {
                vehicleInfo: reconMatch.vehicleInfo ?? iv.vehicleInfo,
                mileage: reconMatch.mileage ?? iv.mileage,
                location: reconMatch.location ?? iv.location,
                askingPrice: reconMatch.askingPrice ?? iv.askingPrice,
                vehicleCost: reconMatch.vehicleCost ?? iv.vehicleCost,
                purchaseType:
                  reconMatch.purchaseType ??
                  normalizePurchaseType(iv.purchaseType),
                purchasedFrom: reconMatch.purchasedFrom ?? iv.purchasedFrom,
                titleStatus: reconMatch.titleStatus ?? iv.titleStatus,
                dateInStock: reconMatch.dateInStock ?? iv.dateInStock,
                inventoryStatus:
                  reconMatch.inventoryStatus ?? iv.status,
                vin: reconMatch.vin ?? iv.vin,
                legacyInventoryVehicleId: iv.id,
                legacyVehicleId: reconMatch.id, // Strategy A: same id, recorded for symmetry
              },
            }),
            prisma.vehicleMigrationMap.create({
              data: {
                oldVehicleId: reconMatch.id,
                oldInventoryVehicleId: iv.id,
                canonicalVehicleId: reconMatch.id,
                matchMethod: 'stock_number',
                matchConfidence: 'high',
              },
            }),
            prisma.activityLog.create({
              data: {
                entityType: 'vehicle',
                entityId: reconMatch.id,
                action: 'canonical_backfill_merged',
                details: {
                  oldInventoryVehicleId: iv.id,
                  matchMethod: 'stock_number',
                },
              },
            }),
          ])
        }
        stats.matched++
      } else {
        // PASS 2: orphan IV — create canonical Vehicle in inventory_only state
        if (COMMIT) {
          const created = await prisma.vehicle.create({
            data: {
              stockNumber: iv.stockNumber,
              vin: iv.vin,
              year: iv.year,
              make: iv.make || 'Unknown',
              model: iv.model || 'Unknown',
              color: iv.color,
              trim: iv.trim,
              status: 'inventory_only',
              inventoryStatus: iv.status,
              vehicleInfo: iv.vehicleInfo,
              mileage: iv.mileage,
              location: iv.location,
              askingPrice: iv.askingPrice,
              vehicleCost: iv.vehicleCost,
              purchaseType: normalizePurchaseType(iv.purchaseType),
              purchasedFrom: iv.purchasedFrom,
              titleStatus: iv.titleStatus,
              dateInStock: iv.dateInStock,
              legacyInventoryVehicleId: iv.id,
            },
          })
          await prisma.vehicleMigrationMap.create({
            data: {
              oldVehicleId: null,
              oldInventoryVehicleId: iv.id,
              canonicalVehicleId: created.id,
              matchMethod: 'orphan_iv_created',
              matchConfidence: 'high',
            },
          })
          await prisma.activityLog.create({
            data: {
              entityType: 'vehicle',
              entityId: created.id,
              action: 'canonical_backfill_orphan_iv',
              details: {
                oldInventoryVehicleId: iv.id,
                stockNumber: iv.stockNumber,
              },
            },
          })
        }
        stats.orphanIV++
      }
    } catch (e: any) {
      stats.errors++
      errors.push({ ivId: iv.id, error: e?.message ?? String(e) })
      console.error(`[backfill] ERROR on IV ${iv.id}:`, e?.message ?? e)
    }
  }

  // === PASS 3: orphan V (recon Vehicle with no IV match) — log only ===
  const orphanVs = await prisma.vehicle.findMany({
    where: {
      legacyInventoryVehicleId: null,
      status: { not: 'inventory_only' },
    },
    select: { id: true, stockNumber: true },
  })
  for (const v of orphanVs) {
    try {
      const existingMap = await prisma.vehicleMigrationMap.findFirst({
        where: { oldVehicleId: v.id, oldInventoryVehicleId: null },
      })
      if (existingMap) {
        stats.skipped++
        continue
      }
      if (COMMIT) {
        await prisma.$transaction([
          prisma.vehicleMigrationMap.create({
            data: {
              oldVehicleId: v.id,
              oldInventoryVehicleId: null,
              canonicalVehicleId: v.id,
              matchMethod: 'orphan_v_left_alone',
              matchConfidence: 'high',
            },
          }),
          prisma.activityLog.create({
            data: {
              entityType: 'vehicle',
              entityId: v.id,
              action: 'canonical_backfill_orphan_v',
              details: { stockNumber: v.stockNumber },
            },
          }),
        ])
      }
      stats.orphanV++
    } catch (e: any) {
      stats.errors++
      errors.push({ ivId: v.id, error: `orphan_v: ${e?.message ?? String(e)}` })
      console.error(`[backfill] ERROR on orphan V ${v.id}:`, e?.message ?? e)
    }
  }

  // === PASS 4: dup-VIN priorVehicleId linking (older → newer by dateInStock) ===
  const dupVins = await prisma.$queryRaw<{ vin: string; cnt: bigint }[]>`
    SELECT vin, COUNT(*) as cnt FROM vehicles
    WHERE vin IS NOT NULL
    GROUP BY vin
    HAVING COUNT(*) > 1
  `
  for (const { vin } of dupVins) {
    try {
      const rows = await prisma.vehicle.findMany({
        where: { vin },
        orderBy: { dateInStock: 'asc' },
        select: { id: true, dateInStock: true, priorVehicleId: true },
      })
      for (let i = 1; i < rows.length; i++) {
        if (rows[i].priorVehicleId) continue
        if (COMMIT) {
          await prisma.$transaction([
            prisma.vehicle.update({
              where: { id: rows[i].id },
              data: { priorVehicleId: rows[i - 1].id },
            }),
            prisma.activityLog.create({
              data: {
                entityType: 'vehicle',
                entityId: rows[i].id,
                action: 'canonical_backfill_prior_vehicle_linked',
                details: { vin, priorVehicleId: rows[i - 1].id },
              },
            }),
          ])
        }
        stats.dupVinNoted++
      }
    } catch (e: any) {
      stats.errors++
      errors.push({
        ivId: `dup-vin:${vin}`,
        error: `dup_vin: ${e?.message ?? String(e)}`,
      })
      console.error(`[backfill] ERROR on dup-vin ${vin}:`, e?.message ?? e)
    }
  }

  console.log(`[backfill] ${COMMIT ? 'COMMITTED' : 'DRY-RUN'} stats:`, stats)
  if (errors.length) {
    console.log(`[backfill] errors (first 20):`, errors.slice(0, 20))
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
