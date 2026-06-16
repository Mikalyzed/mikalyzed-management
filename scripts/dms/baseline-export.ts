// scripts/dms/baseline-export.ts
// Pre-migration snapshot used to detect attribution drift after Phase 0 cutover.
// (Per Pitfall §1.1 — opportunity attribution can silently re-target during migration.)
//
// Run BEFORE backfill on production:
//   npx tsx scripts/dms/baseline-export.ts > .planning/phases/00-vehicle-identity-unification/baseline-$(date +%Y%m%d-%H%M).json
//
// Captures: count of Vehicles, count of InventoryVehicles, count of Opportunities
// with vehicleId, and a sampled "VIN + stockNumber + opportunityId" triple per
// Opportunity (last 12 months) so post-cutover we can re-resolve and confirm
// every opportunity still points at the same physical car.
//
// Read-only: this script performs NO database writes.

import { prisma } from '@/lib/db'

async function main() {
  const now = new Date()
  const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)

  const [vehicleCount, ivCount, oppWithVehicleCount] = await Promise.all([
    prisma.vehicle.count(),
    prisma.inventoryVehicle.count(),
    prisma.opportunity.count({ where: { vehicleId: { not: null } } }),
  ])

  const opportunitySamples = await prisma.opportunity.findMany({
    where: { vehicleId: { not: null }, createdAt: { gte: yearAgo } },
    select: {
      id: true,
      vehicleId: true,
      createdAt: true,
      vehicle: {
        select: {
          stockNumber: true,
          vin: true,
          year: true,
          make: true,
          model: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  })

  // Capture the canonical Vehicle pre-image too — so post-backfill we can diff
  // (rowCount delta should equal orphanIV count + any inflight CSV imports).
  const vehiclePreImageSample = await prisma.vehicle.findMany({
    select: {
      id: true,
      stockNumber: true,
      vin: true,
      legacyInventoryVehicleId: true,
      legacyVehicleId: true,
      inventoryStatus: true,
      status: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  const output = {
    capturedAt: now.toISOString(),
    counts: {
      vehicleCount,
      inventoryVehicleCount: ivCount,
      opportunityWithVehicleCount: oppWithVehicleCount,
    },
    opportunitySamples,
    vehiclePreImageSample,
  }
  console.log(JSON.stringify(output, null, 2))
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
