import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function GET() {
  const requests = await prisma.transportRequest.findMany({
    include: {
      vehicle: { select: { stockNumber: true, year: true, make: true, model: true } },
      requestedBy: { select: { name: true } },
      coordinator: { select: { name: true } },
    },
    orderBy: [{ urgency: 'desc' }, { createdAt: 'desc' }],
  })
  return NextResponse.json({ requests })
}

export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { vehicleId, vehicleDescription, pickupLocation, deliveryLocation, urgency, preferredDate, notes } = body

  if (!pickupLocation || !deliveryLocation) {
    return NextResponse.json({ error: 'Pickup and delivery locations required' }, { status: 400 })
  }

  const req = await prisma.transportRequest.create({
    data: {
      vehicleId: vehicleId || null,
      vehicleDescription: vehicleDescription || null,
      requestedById: user.id,
      pickupLocation,
      deliveryLocation,
      urgency: urgency || 'standard',
      preferredDate: preferredDate ? new Date(preferredDate) : null,
      notes: notes || null,
    },
  })

  await prisma.activityLog.create({
    data: {
      entityType: 'transport',
      entityId: req.id,
      action: 'created',
      actorId: user.id,
      details: { pickupLocation, deliveryLocation, urgency },
    },
  })

  return NextResponse.json({ request: req }, { status: 201 })
}
