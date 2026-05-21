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

  // No Vehicle record — try InventoryVehicle first, fall back to ExternalRepair
  // (a vehicle may exist only in external repairs without ever being added to inventory)
  const inv = await prisma.inventoryVehicle.findUnique({
    where: { stockNumber: stock },
    select: { year: true, make: true, model: true, color: true, vin: true },
  })

  let year: number | null = null
  let make = ''
  let model = ''
  let color: string | null = null
  let vin: string | null = null

  if (inv) {
    year = inv.year
    make = inv.make || ''
    model = inv.model || ''
    color = inv.color
    vin = inv.vin
  } else {
    const ext = await prisma.externalRepair.findFirst({
      where: { stockNumber: stock },
      orderBy: { createdAt: 'desc' },
      select: { year: true, make: true, model: true, color: true },
    })
    if (!ext) return NextResponse.json({ error: 'No inventory or external repair record for this stock number' }, { status: 404 })
    year = ext.year
    make = ext.make
    model = ext.model
    color = ext.color
  }

  const placeholder = await prisma.vehicle.create({
    data: {
      stockNumber: stock,
      vin,
      year,
      make: make || 'Unknown',
      model: model || 'Unknown',
      color,
      status: 'archived',
      completedAt: new Date(),
      createdById: user.id,
    },
    select: { id: true },
  })

  return NextResponse.json({ vehicleId: placeholder.id, created: true })
}
