// scripts/dms/verify-backfill.ts
// Phase 0.B post-backfill assertion script. Run AFTER backfill --commit:
//   npx tsx scripts/dms/verify-backfill.ts
//
// Exits non-zero if any invariant fails. Use as a gate before proceeding to 0.C.
//
// Checks:
//   1. Every InventoryVehicle has a VehicleMigrationMap row.
//   2. Every canonical Vehicle with legacyInventoryVehicleId has a matching map row.
//   3. Every inventory_only Vehicle has its inventoryStatus populated (orphan IV).
//   4. Every dup-VIN chain has priorVehicleId set on rows 2..N when ordered by dateInStock.
//   5. Every Opportunity.vehicleId still resolves to a real Vehicle row
//      (Strategy A invariant: should be impossible to violate, but we verify).

import { prisma } from '@/lib/db'

interface Issue {
  check: string
  detail: string
}

async function main() {
  const issues: Issue[] = []

  // CHECK 1: every InventoryVehicle has a VehicleMigrationMap row
  const ivCount = await prisma.inventoryVehicle.count()
  const ivMappedCount = await prisma.vehicleMigrationMap.count({
    where: { oldInventoryVehicleId: { not: null } },
  })
  if (ivCount !== ivMappedCount) {
    issues.push({
      check: 'iv_mapping_completeness',
      detail: `InventoryVehicle.count=${ivCount} but VehicleMigrationMap rows with oldInventoryVehicleId=${ivMappedCount}`,
    })
  }

  // CHECK 2: every canonical Vehicle with legacyInventoryVehicleId exists in map
  const canonicalsWithLegacy = await prisma.vehicle.findMany({
    where: { legacyInventoryVehicleId: { not: null } },
    select: { id: true, legacyInventoryVehicleId: true },
  })
  for (const v of canonicalsWithLegacy) {
    const m = await prisma.vehicleMigrationMap.findFirst({
      where: {
        canonicalVehicleId: v.id,
        oldInventoryVehicleId: v.legacyInventoryVehicleId,
      },
    })
    if (!m) {
      issues.push({
        check: 'canonical_to_map_link',
        detail: `Vehicle ${v.id} has legacyInventoryVehicleId=${v.legacyInventoryVehicleId} but no matching map row`,
      })
    }
  }

  // CHECK 3: orphan IV → inventory_only Vehicles have inventoryStatus set
  const orphanIVCanonicals = await prisma.vehicle.findMany({
    where: { status: 'inventory_only' },
    select: { id: true, inventoryStatus: true, stockNumber: true },
  })
  for (const v of orphanIVCanonicals) {
    if (!v.inventoryStatus) {
      issues.push({
        check: 'orphan_iv_has_inventory_status',
        detail: `Vehicle ${v.id} (stock ${v.stockNumber}) is inventory_only but inventoryStatus is null`,
      })
    }
  }

  // CHECK 4: dup-VIN chains are linked (rows 2..N have priorVehicleId)
  const dupVins = await prisma.$queryRaw<{ vin: string; cnt: bigint }[]>`
    SELECT vin, COUNT(*) as cnt FROM vehicles
    WHERE vin IS NOT NULL
    GROUP BY vin
    HAVING COUNT(*) > 1
  `
  for (const { vin } of dupVins) {
    const rows = await prisma.vehicle.findMany({
      where: { vin },
      orderBy: { dateInStock: 'asc' },
      select: { id: true, priorVehicleId: true },
    })
    for (let i = 1; i < rows.length; i++) {
      if (!rows[i].priorVehicleId) {
        issues.push({
          check: 'dup_vin_linked',
          detail: `Vehicle ${rows[i].id} (vin ${vin}, idx ${i}) is missing priorVehicleId`,
        })
      }
    }
  }

  // CHECK 5: every Opportunity.vehicleId still resolves to a Vehicle row.
  // Use a left-join raw query because Prisma's `vehicle: null` filter on a
  // required-when-set relation isn't well-defined.
  const orphanOpps = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count
    FROM opportunities o
    LEFT JOIN vehicles v ON v.id = o.vehicle_id
    WHERE o.vehicle_id IS NOT NULL AND v.id IS NULL
  `
  const orphanOppCount = Number(orphanOpps?.[0]?.count ?? 0)
  if (orphanOppCount > 0) {
    issues.push({
      check: 'opportunity_attribution_intact',
      detail: `${orphanOppCount} Opportunities have vehicleId pointing at a non-existent Vehicle (Strategy A should make this impossible)`,
    })
  }

  const stats = {
    inventoryVehicleCount: ivCount,
    canonicalWithLegacy: canonicalsWithLegacy.length,
    inventoryOnlyVehicles: orphanIVCanonicals.length,
    dupVinGroups: dupVins.length,
    orphanOpportunities: orphanOppCount,
    issues: issues.length,
  }
  console.log('[verify-backfill] stats:', stats)
  if (issues.length) {
    console.log('[verify-backfill] ISSUES (showing all):')
    for (const i of issues) console.log(`  - [${i.check}] ${i.detail}`)
    process.exit(1)
  }
  console.log('[verify-backfill] all invariants pass')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
