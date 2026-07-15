import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

for (const s of ['N804617', 'N170313', 'N193509', 'N428829', 'N449594', 'N176084']) {
  const r = await prisma.inventoryVehicle.findFirst({
    where: { stockNumber: s },
    select: { stockNumber: true, year: true, make: true, model: true, status: true, isActive: true, updatedAt: true },
  })
  console.log(`${s}:`, r ? `${r.year} ${r.make} ${r.model} | status=${r.status} | isActive=${r.isActive} | updated=${r.updatedAt.toISOString().slice(0,10)}` : 'NOT FOUND')
}
await prisma.$disconnect()
