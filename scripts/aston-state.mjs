// READ-ONLY: inspect the 2014 Aston Martin Rapide S recon/external state.
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const vehicles = await prisma.vehicle.findMany({
  where: { make: { contains: 'ASTON', mode: 'insensitive' } },
  select: {
    id: true, stockNumber: true, vin: true, year: true, make: true, model: true,
    color: true, status: true, inventoryStatus: true, currentStageId: true,
    completedAt: true, updatedAt: true,
    stages: { select: { id: true, name: true, status: true }, orderBy: { createdAt: 'asc' } },
  },
})

for (const v of vehicles) {
  console.log(`\n=== ${v.year} ${v.make} ${v.model} | stock=${v.stockNumber} | vin=${v.vin}`)
  console.log(`    id=${v.id}`)
  console.log(`    color=${v.color}  status=${v.status}  inventoryStatus=${v.inventoryStatus}`)
  console.log(`    completedAt=${v.completedAt}  updated=${v.updatedAt?.toISOString().slice(0, 16)}`)
  const open = v.stages.filter(s => !['done', 'skipped'].includes(s.status))
  console.log(`    stages: ${v.stages.length} total, ${open.length} OPEN`)
  for (const s of v.stages) {
    const flag = ['done', 'skipped'].includes(s.status) ? ' ' : '*'
    console.log(`      ${flag} ${s.name} = ${s.status}${s.id === v.currentStageId ? '   <-- current' : ''}`)
  }
  const ext = await prisma.externalRepair.findMany({
    where: { stockNumber: v.stockNumber },
    select: {
      id: true, shopName: true, status: true, partOnly: true, atDealership: true,
      repairDescription: true, sentDate: true, expectedReturn: true, updatedAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })
  console.log(`    externalRepairs: ${ext.length}`)
  for (const e of ext) {
    console.log(`      - ${e.shopName} | status=${e.status} | partOnly=${e.partOnly} | atDealership=${e.atDealership}`)
    console.log(`        "${e.repairDescription}"`)
    console.log(`        sent=${e.sentDate?.toISOString().slice(0, 10)} expectedReturn=${e.expectedReturn?.toISOString().slice(0, 10)} updated=${e.updatedAt?.toISOString().slice(0, 16)}`)
  }
}

// What the recon board actually treats as "actively in recon"
const onBoard = await prisma.vehicle.count({
  where: {
    id: { in: vehicles.map(v => v.id) },
    completedAt: null,
    status: { notIn: ['inventory_only', 'archived', 'completed'] },
    stages: { some: { status: { notIn: ['done', 'skipped'] } } },
  },
})
console.log(`\nMatches the "actively in recon" predicate: ${onBoard} of ${vehicles.length}`)

await prisma.$disconnect()
