// scripts/dms/fix-active-recon-inventory-status.ts
// One-shot data fix: set inventoryStatus='in_recon' on the 2 orphan-V Vehicles
// that are actively in recon but were never imported from a CSV.
// Run: npx tsx scripts/dms/fix-active-recon-inventory-status.ts --apply
// Without --apply, runs as dry-run.

import { prisma } from '@/lib/db'

const APPLY = process.argv.includes('--apply')
const TARGETS = ['N340471', 'N801774'] // 2006 Trailblazer SS, 1991 GMC Sonoma SLS

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN'} — target stockNumbers: ${TARGETS.join(', ')}`)

  const rows = await prisma.vehicle.findMany({
    where: { stockNumber: { in: TARGETS } },
    select: { id: true, stockNumber: true, year: true, make: true, model: true, status: true, inventoryStatus: true },
  })

  for (const r of rows) {
    console.log(`  ${r.stockNumber.padEnd(10)} ${r.year ?? ''} ${r.make} ${r.model.padEnd(20)} recon=${r.status} invStatus=${r.inventoryStatus ?? 'NULL'} → in_recon`)
  }

  if (rows.length !== TARGETS.length) {
    console.error(`\n⚠️  Expected ${TARGETS.length} rows, got ${rows.length}. Aborting.`)
    process.exit(1)
  }

  for (const r of rows) {
    if (r.inventoryStatus !== null && r.inventoryStatus !== 'in_recon') {
      console.error(`\n⚠️  ${r.stockNumber} already has inventoryStatus='${r.inventoryStatus}'. Refusing to overwrite. Aborting.`)
      process.exit(1)
    }
  }

  if (APPLY) {
    const updated = await prisma.vehicle.updateMany({
      where: { stockNumber: { in: TARGETS } },
      data: { inventoryStatus: 'in_recon' },
    })
    console.log(`\n✅ Updated ${updated.count} Vehicle(s).`)
  } else {
    console.log(`\n💡 Dry run — re-run with --apply to write.`)
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
