import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

/**
 * Given a stockNumber, return a Vehicle.id suitable for navigating to /vehicles/[id].
 * If no Vehicle record exists for this stock, create a placeholder one (status='archived',
 * completedAt set) so the detail page has somewhere to render. The placeholder is invisible
 * to the recon board, mechanic schedule, etc. since they filter on known stage statuses.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { stockNumber } = await req.json()
  if (!stockNumber?.trim()) return NextResponse.json({ error: 'stockNumber required' }, { status: 400 })

  const stock = stockNumber.trim()

  // Try existing Vehicle record first
  const existing = await prisma.vehicle.findUnique({
    where: { stockNumber: stock },
    select: { id: true },
  })
  if (existing) return NextResponse.json({ vehicleId: existing.id, created: false })

  // No Vehicle record — derive basic info from InventoryVehicle and create a placeholder
  const inv = await prisma.inventoryVehicle.findUnique({
    where: { stockNumber: stock },
    select: { year: true, make: true, model: true, color: true, vin: true },
  })
  if (!inv) return NextResponse.json({ error: 'No inventory record for this stock number' }, { status: 404 })

  const placeholder = await prisma.vehicle.create({
    data: {
      stockNumber: stock,
      vin: inv.vin,
      year: inv.year,
      make: inv.make || 'Unknown',
      model: inv.model || 'Unknown',
      color: inv.color,
      status: 'archived',
      completedAt: new Date(),
      createdById: user.id,
    },
    select: { id: true },
  })

  return NextResponse.json({ vehicleId: placeholder.id, created: true })
}
