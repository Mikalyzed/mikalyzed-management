import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'fs'

const prisma = new PrismaClient()

// Parse DealerCenter CSV (column 7 = StockNumber, 1-indexed in CSV)
const csv = readFileSync('/tmp/dealercenter-export.csv', 'utf8')
const lines = csv.trim().split('\n').slice(1) // skip header
const dcStocks = new Set()
const dcByStock = new Map()
for (const line of lines) {
  const cols = line.split(',')
  const stock = cols[6]?.trim() // 7th column
  const desc = cols[0]?.trim()
  if (stock) {
    dcStocks.add(stock)
    dcByStock.set(stock, desc)
  }
}
console.log(`DealerCenter CSV: ${dcStocks.size} rows`)

// Our InventoryVehicle (the DC-synced table)
const invRows = await prisma.inventoryVehicle.findMany({
  where: { isActive: true, status: { notIn: ['sold', 'removed'] } },
  select: { stockNumber: true, year: true, make: true, model: true, status: true },
})
const invStocks = new Set(invRows.map(v => v.stockNumber))
console.log(`Our InventoryVehicle (active): ${invStocks.size} rows`)

// Our active Vehicles (recon side), all statuses
const vehRows = await prisma.vehicle.findMany({
  where: { status: { notIn: ['completed', 'archived'] } },
  select: { stockNumber: true, year: true, make: true, model: true, status: true },
})
const vehStocks = new Set(vehRows.map(v => v.stockNumber))
console.log(`Our active Vehicles (recon): ${vehStocks.size} rows`)

// What the Inventory page UI most likely tallies:
// InventoryVehicle (active) ∪ active recon Vehicles
const uiStocks = new Set([...invStocks, ...vehStocks])
console.log(`UI count (union): ${uiStocks.size}`)

console.log('\n=== IN DealerCenter but NOT in our InventoryVehicle ===')
const dcMissingFromInv = [...dcStocks].filter(s => !invStocks.has(s))
console.log(`Count: ${dcMissingFromInv.length}`)
for (const s of dcMissingFromInv) {
  const inVeh = vehStocks.has(s) ? ' (BUT in recon Vehicle table)' : ''
  console.log(`  ${s}: ${dcByStock.get(s)}${inVeh}`)
}

console.log('\n=== IN our InventoryVehicle but NOT in DealerCenter ===')
const invMissingFromDc = [...invStocks].filter(s => !dcStocks.has(s))
console.log(`Count: ${invMissingFromDc.length}`)
for (const s of invMissingFromDc) {
  const v = invRows.find(r => r.stockNumber === s)
  console.log(`  ${s}: ${v.year ?? ''} ${v.make} ${v.model} (inv status=${v.status})`)
}

console.log('\n=== Active recon Vehicles NOT in DealerCenter ===')
const vehMissingFromDc = [...vehStocks].filter(s => !dcStocks.has(s))
console.log(`Count: ${vehMissingFromDc.length}`)
for (const s of vehMissingFromDc) {
  const v = vehRows.find(r => r.stockNumber === s)
  const inInv = invStocks.has(s) ? ' (also in InventoryVehicle)' : ''
  console.log(`  ${s}: ${v.year ?? ''} ${v.make} ${v.model} (recon=${v.status})${inInv}`)
}

await prisma.$disconnect()
