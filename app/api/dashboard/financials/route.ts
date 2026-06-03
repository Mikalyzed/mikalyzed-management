import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

/**
 * Fleet financial summary for the dashboard.
 *
 * Returns aggregates across vehicles NOT in sold/inventory_only:
 *  - totalInventoryCost: sum of vehicle_cost
 *  - totalAskingPrice: sum of asking_price
 *  - potentialGrossProfit: sum of (asking - cost) where both exist
 *  - vehiclesWithCost / vehiclesWithPrice: counts for context
 *  - totalCostAdds: sum of all cost_adds.amount_cents (active vehicles only)
 *  - flooringPrincipal: sum of floor_principal for active floored vehicles
 *  - flooringAccrued: sum of accrued interest = principal * (rate/100) * days_since_advance
 *  - flooringExposure: principal + accrued
 *  - activeFlooredCount: number of vehicles with active flooring
 *  - agingBuckets: counts by 0-30 / 31-60 / 61-90 / 90+ days
 */
export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // Money-visibility gate: admin or sales_manager only (temporary; per-user settings come later in Phase 1a RBAC)
  if (user.role !== 'admin' && user.role !== 'sales_manager') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Active fleet — exclude sold + inventory_only "ghost" vehicles
  const activeFilter = {
    inventoryStatus: { notIn: ['sold', 'removed'] as string[] },
    status: { not: 'inventory_only' },
  }

  const vehicles = await prisma.vehicle.findMany({
    where: activeFilter,
    select: {
      id: true,
      vehicleCost: true,
      askingPrice: true,
      dateInStock: true,
      floorPrincipal: true,
      floorDailyRate: true,
      floorAdvanceDate: true,
      floorStatus: true,
    },
  })

  let totalInventoryCost = 0
  let totalAskingPrice = 0
  let potentialGrossProfit = 0
  let vehiclesWithCost = 0
  let vehiclesWithPrice = 0
  let flooringPrincipal = 0
  let flooringAccrued = 0
  let activeFlooredCount = 0

  const agingBuckets = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0, 'unknown': 0 }
  const now = Date.now()

  const activeVehicleIds: string[] = []

  for (const v of vehicles) {
    activeVehicleIds.push(v.id)

    if (v.vehicleCost !== null) {
      totalInventoryCost += v.vehicleCost
      vehiclesWithCost++
    }
    if (v.askingPrice !== null) {
      totalAskingPrice += v.askingPrice
      vehiclesWithPrice++
    }
    if (v.vehicleCost !== null && v.askingPrice !== null) {
      potentialGrossProfit += v.askingPrice - v.vehicleCost
    }

    // Aging
    if (v.dateInStock) {
      const days = Math.floor((now - new Date(v.dateInStock).getTime()) / 86400000)
      if (days <= 30) agingBuckets['0-30']++
      else if (days <= 60) agingBuckets['31-60']++
      else if (days <= 90) agingBuckets['61-90']++
      else agingBuckets['90+']++
    } else {
      agingBuckets['unknown']++
    }

    // Flooring
    if (v.floorPrincipal && v.floorDailyRate && v.floorAdvanceDate && v.floorStatus === 'active') {
      activeFlooredCount++
      flooringPrincipal += v.floorPrincipal
      const days = Math.max(0, Math.floor((now - new Date(v.floorAdvanceDate).getTime()) / 86400000))
      flooringAccrued += v.floorPrincipal * (v.floorDailyRate / 100) * days
    }
  }

  // Total cost adds across the active fleet
  const costAddsAgg = await prisma.costAdd.aggregate({
    where: { vehicleId: { in: activeVehicleIds } },
    _sum: { amountCents: true },
  })
  const totalCostAddsDollars = (costAddsAgg._sum.amountCents || 0) / 100

  return NextResponse.json({
    activeVehicleCount: vehicles.length,
    totalInventoryCost: Math.round(totalInventoryCost * 100) / 100,
    totalAskingPrice: Math.round(totalAskingPrice * 100) / 100,
    potentialGrossProfit: Math.round(potentialGrossProfit * 100) / 100,
    vehiclesWithCost,
    vehiclesWithPrice,
    totalCostAdds: Math.round(totalCostAddsDollars * 100) / 100,
    flooringPrincipal: Math.round(flooringPrincipal * 100) / 100,
    flooringAccrued: Math.round(flooringAccrued * 100) / 100,
    flooringExposure: Math.round((flooringPrincipal + flooringAccrued) * 100) / 100,
    activeFlooredCount,
    agingBuckets,
  })
}
