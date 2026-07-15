import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

/**
 * POST /api/customers/:id/interests — attach a vehicle of interest to a
 * customer. Body: { vehicleId }. Snapshots make/model/year from the vehicle so
 * the interest still reads sensibly if the car later leaves inventory. No-ops
 * (returns the existing row) if the same vehicle is already flagged.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: contactId } = await params
  const { vehicleId } = await req.json()
  if (!vehicleId) return NextResponse.json({ error: 'vehicleId required' }, { status: 400 })

  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: { id: true, make: true, model: true, year: true },
  })
  if (!vehicle) return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 })

  const existing = await prisma.vehicleInterest.findFirst({
    where: { contactId, vehicleId },
  })
  if (existing) return NextResponse.json(existing)

  const created = await prisma.vehicleInterest.create({
    data: {
      contactId,
      vehicleId,
      make: vehicle.make,
      model: vehicle.model,
      yearMin: vehicle.year,
      yearMax: vehicle.year,
    },
  })
  return NextResponse.json(created)
}

/**
 * DELETE /api/customers/:id/interests?interestId=… — remove a flagged vehicle.
 * Scoped to the contact so an interest can't be deleted out from under another.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: contactId } = await params
  const { searchParams } = new URL(req.url)
  const interestId = searchParams.get('interestId')
  if (!interestId) return NextResponse.json({ error: 'interestId required' }, { status: 400 })

  await prisma.vehicleInterest.deleteMany({ where: { id: interestId, contactId } })
  return NextResponse.json({ ok: true })
}
