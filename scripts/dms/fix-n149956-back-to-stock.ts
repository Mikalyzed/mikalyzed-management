// scripts/dms/fix-n149956-back-to-stock.ts
// One-shot: flip N149956 (1994 Hummer H1) from sold back to in_stock in both
// the legacy InventoryVehicle table AND the canonical Vehicle table. The car
// was deleted from DealerCenter (which our CSV import treats as 'sold' since
// the CSV doesn't distinguish deleted vs sold) and later re-listed.
// Run: npx tsx scripts/dms/fix-n149956-back-to-stock.ts --apply

import { prisma } from '@/lib/db'

const APPLY = process.argv.includes('--apply')
const TARGET = 'N149956'

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN'} — target: ${TARGET}`)

  const iv = await prisma.inventoryVehicle.findUnique({ where: { stockNumber: TARGET } })
  const v = await prisma.vehicle.findUnique({ where: { stockNumber: TARGET } })

  console.log(`\nBefore:`)
  console.log(`  IV: status=${iv?.status ?? 'NOT FOUND'}, isActive=${iv?.isActive}`)
  console.log(`  Vehicle: inventoryStatus=${v?.inventoryStatus ?? 'NOT FOUND'}, status=${v?.status}`)

  if (!iv && !v) {
    console.error(`❌ ${TARGET} not found in either table.`)
    process.exit(1)
  }

  if (!APPLY) {
    console.log(`\n💡 Dry run — re-run with --apply to flip both to in_stock.`)
    return
  }

  if (iv && iv.status !== 'in_stock') {
    await prisma.inventoryVehicle.update({
      where: { stockNumber: TARGET },
      data: { status: 'in_stock' },
    })
    console.log(`  ✅ IV: status set to in_stock`)
  }
  if (v && v.inventoryStatus !== 'in_stock') {
    await prisma.$transaction([
      prisma.vehicle.update({
        where: { stockNumber: TARGET },
        data: { inventoryStatus: 'in_stock' },
      }),
      prisma.activityLog.create({
        data: {
          entityType: 'vehicle',
          entityId: v.id,
          action: 'inventory_status_manual_correction',
          details: { stockNumber: TARGET, from: v.inventoryStatus, to: 'in_stock', reason: 'DealerCenter delete+relist (CSV cannot distinguish sold from removed)' },
        },
      }),
    ])
    console.log(`  ✅ Vehicle: inventoryStatus set to in_stock + ActivityLog written`)
  }

  console.log(`\n✅ Done.`)
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
