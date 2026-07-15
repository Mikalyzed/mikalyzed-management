import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

// 1. InventoryVehicle counts (what /inventory page shows)
const inv = await prisma.inventoryVehicle.groupBy({
  by: ['status'],
  _count: true,
  where: { isActive: true },
})
const invInactive = await prisma.inventoryVehicle.count({ where: { isActive: false } })
console.log('=== InventoryVehicle (isActive=true) ===')
let invActiveTotal = 0
let invActiveExcludingSold = 0
for (const s of inv) {
  console.log(`  ${s.status}: ${s._count}`)
  invActiveTotal += s._count
  if (s.status !== 'sold' && s.status !== 'removed') invActiveExcludingSold += s._count
}
console.log(`  ALL isActive=true: ${invActiveTotal}`)
console.log(`  ACTIVE (excluding sold/removed): ${invActiveExcludingSold}`)
console.log(`  isActive=false: ${invInactive}`)

// 2. Vehicle (recon) counts
const veh = await prisma.vehicle.groupBy({
  by: ['status'],
  _count: true,
})
console.log('\n=== Vehicle (recon) by status ===')
let vehTotal = 0
let vehNotCompleted = 0
for (const s of veh) {
  console.log(`  ${s.status}: ${s._count}`)
  vehTotal += s._count
  if (s.status !== 'completed' && s.status !== 'archived') vehNotCompleted += s._count
}
console.log(`  TOTAL: ${vehTotal}`)
console.log(`  NOT completed/archived: ${vehNotCompleted}`)

// 3. Look for Vehicles WITHOUT a matching InventoryVehicle
const vehiclesNoInv = await prisma.$queryRaw`
  SELECT v.stock_number, v.year, v.make, v.model, v.status, v.completed_at
  FROM vehicles v
  LEFT JOIN inventory_vehicles iv ON iv.stock_number = v.stock_number
  WHERE iv.id IS NULL AND v.status NOT IN ('completed', 'archived')
`
console.log(`\n=== Active Vehicles (recon) with NO InventoryVehicle row: ${vehiclesNoInv.length} ===`)
for (const r of vehiclesNoInv) {
  console.log(`  ${r.stock_number} | ${r.year ?? ''} ${r.make} ${r.model} | recon status=${r.status}`)
}

// 4. Look for InventoryVehicles WITHOUT a matching Vehicle (orphan inventory rows)
const invNoVeh = await prisma.$queryRaw`
  SELECT iv.stock_number, iv.year, iv.make, iv.model, iv.status
  FROM inventory_vehicles iv
  LEFT JOIN vehicles v ON v.stock_number = iv.stock_number
  WHERE v.id IS NULL AND iv.is_active = true AND iv.status NOT IN ('sold', 'removed')
`
console.log(`\n=== InventoryVehicles (active, not sold) with NO Vehicle (recon) row: ${invNoVeh.length} ===`)
for (const r of invNoVeh) {
  console.log(`  ${r.stock_number} | ${r.year ?? ''} ${r.make} ${r.model} | inv status=${r.status}`)
}

await prisma.$disconnect()
