// scripts/dms/resync-inventory-status.ts
// One-shot fix-up: copy InventoryVehicle.status onto Vehicle.inventoryStatus
// for every matched pair (matched by stockNumber).
//
// Background: the 2026-06-03 backfill froze Vehicle.inventoryStatus at that
// moment in time. Between then and the canonical cutover, recon-stage changes
// updated InventoryVehicle.status but did NOT propagate to Vehicle.inventoryStatus
// (writes were still pointed at the legacy table). This script reconciles the
// drift in a single pass.
//
// Run dry-run first:  npx tsx scripts/dms/resync-inventory-status.ts
// Then commit:        npx tsx scripts/dms/resync-inventory-status.ts --apply

import { prisma } from '@/lib/db'

const APPLY = process.argv.includes('--apply')

interface Stats {
  matched: number
  unchanged: number
  updated: number
  noVehicleMatch: number
  errors: number
}

async function main() {
  const stats: Stats = { matched: 0, unchanged: 0, updated: 0, noVehicleMatch: 0, errors: 0 }
  const changes: { stockNumber: string; from: string | null; to: string }[] = []

  console.log(`[resync] mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`)

  const ivs = await prisma.inventoryVehicle.findMany({
    select: { id: true, stockNumber: true, status: true },
  })
  console.log(`[resync] scanning ${ivs.length} InventoryVehicle rows`)

  for (const iv of ivs) {
    try {
      const v = await prisma.vehicle.findUnique({
        where: { stockNumber: iv.stockNumber },
        select: { id: true, inventoryStatus: true },
      })
      if (!v) {
        stats.noVehicleMatch++
        continue
      }
      stats.matched++
      if (v.inventoryStatus === iv.status) {
        stats.unchanged++
        continue
      }
      changes.push({ stockNumber: iv.stockNumber, from: v.inventoryStatus, to: iv.status })
      if (APPLY) {
        await prisma.$transaction([
          prisma.vehicle.update({
            where: { id: v.id },
            data: { inventoryStatus: iv.status },
          }),
          prisma.activityLog.create({
            data: {
              entityType: 'vehicle',
              entityId: v.id,
              action: 'canonical_inventory_status_resync',
              details: { stockNumber: iv.stockNumber, from: v.inventoryStatus, to: iv.status, source: 'iv_table' },
            },
          }),
        ])
      }
      stats.updated++
    } catch (e: any) {
      stats.errors++
      console.error(`[resync] ERROR on IV ${iv.stockNumber}:`, e?.message ?? e)
    }
  }

  console.log('\n[resync] stats:', stats)
  if (changes.length > 0) {
    console.log(`\n[resync] ${changes.length} change(s):`)
    console.log('  stockNumber'.padEnd(14), 'from'.padEnd(18), '→ to')
    console.log(''.padEnd(60, '─'))
    for (const c of changes.slice(0, 80)) {
      console.log(' ', c.stockNumber.padEnd(13), (c.from ?? 'NULL').padEnd(17), '→', c.to)
    }
    if (changes.length > 80) console.log(`  ... and ${changes.length - 80} more`)
  }

  if (!APPLY && changes.length > 0) {
    console.log(`\n💡 Dry run — re-run with --apply to write the ${changes.length} change(s).`)
  } else if (APPLY) {
    console.log(`\n✅ Applied ${changes.length} change(s).`)
  } else {
    console.log('\n✅ No drift found. Nothing to do.')
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
