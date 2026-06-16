// scripts/dms/reconcile-with-dealercenter.ts
// Compares a list of DealerCenter stockNumbers (one per line from a paste file)
// against both InventoryVehicle and canonical Vehicle tables and prints the deltas.
//
// Usage: STOCKS_FILE=/tmp/dealercenter-stocks.txt npx tsx scripts/dms/reconcile-with-dealercenter.ts

import { prisma } from '@/lib/db'
import { readFileSync } from 'fs'

async function main() {
  const path = process.env.STOCKS_FILE || '/tmp/dealercenter-stocks.txt'
  const dcStocks = new Set(
    readFileSync(path, 'utf8')
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean),
  )
  console.log(`DealerCenter stockNumbers: ${dcStocks.size}\n`)

  const ivs = await prisma.inventoryVehicle.findMany({
    select: { stockNumber: true, status: true, isActive: true },
  })
  const ivByStock = new Map(ivs.map(iv => [iv.stockNumber, iv]))
  const ivActive = ivs.filter(iv => iv.isActive && !['sold', 'removed'].includes(iv.status))
  console.log(`InventoryVehicle rows: ${ivs.length} total, ${ivActive.length} active+nonsold`)

  const vs = await prisma.vehicle.findMany({
    select: { stockNumber: true, status: true, inventoryStatus: true },
  })
  const vByStock = new Map(vs.map(v => [v.stockNumber, v]))
  const vCanonicalActive = vs.filter(v =>
    v.inventoryStatus != null && !['sold', 'removed'].includes(v.inventoryStatus),
  )
  console.log(`canonical Vehicle rows: ${vs.length} total, ${vCanonicalActive.length} inventoried+nonsold`)

  console.log('\n=== DealerCenter ↔ InventoryVehicle drift ===')
  const dcNotIV: string[] = []
  for (const s of dcStocks) {
    if (!ivByStock.has(s)) dcNotIV.push(s)
    else {
      const iv = ivByStock.get(s)!
      if (!iv.isActive || ['sold', 'removed'].includes(iv.status)) dcNotIV.push(`${s} (IV says: status=${iv.status}, isActive=${iv.isActive})`)
    }
  }
  const ivNotDC: string[] = []
  for (const iv of ivActive) if (!dcStocks.has(iv.stockNumber)) ivNotDC.push(iv.stockNumber)
  console.log(`In DealerCenter but missing/inactive in IV (${dcNotIV.length}):`)
  for (const s of dcNotIV) console.log(`  - ${s}`)
  console.log(`In IV (active+nonsold) but NOT in DealerCenter (${ivNotDC.length}):`)
  for (const s of ivNotDC) console.log(`  - ${s}`)

  console.log('\n=== DealerCenter ↔ canonical Vehicle drift ===')
  const dcNotV: string[] = []
  for (const s of dcStocks) {
    if (!vByStock.has(s)) dcNotV.push(s + ' (NO canonical Vehicle row)')
    else {
      const v = vByStock.get(s)!
      if (v.inventoryStatus == null) dcNotV.push(`${s} (inventoryStatus=NULL — invisible to /inventory)`)
      else if (['sold', 'removed'].includes(v.inventoryStatus)) dcNotV.push(`${s} (inventoryStatus=${v.inventoryStatus})`)
    }
  }
  const vNotDC: { stockNumber: string; status: string }[] = []
  for (const v of vCanonicalActive) if (!dcStocks.has(v.stockNumber)) vNotDC.push({ stockNumber: v.stockNumber, status: v.inventoryStatus as string })
  console.log(`In DealerCenter but missing/hidden in canonical (${dcNotV.length}):`)
  for (const s of dcNotV) console.log(`  - ${s}`)
  console.log(`In canonical (inventoried+nonsold) but NOT in DealerCenter (${vNotDC.length}):`)
  for (const v of vNotDC) console.log(`  - ${v.stockNumber} (inventoryStatus=${v.status})`)
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
