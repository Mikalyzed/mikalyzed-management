import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { sendNotificationEmail } from '@/lib/email'
import { newTransportRequestEmail } from '@/lib/email-templates'

const TRANSPORT_DISTRO = process.env.TRANSPORT_NOTIFY_EMAIL || 'transport@mikalyzedautoboutique.com'

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
  const { vehicleId, vehicleDescription, vin, trailerType, pickupLocation, deliveryLocation, clientName, clientPhone, urgency, preferredDate, scheduledDate, carrierInfo, purpose, purposeNote, estimatedPrice, notes } = body

  if (!pickupLocation || !deliveryLocation) {
    return NextResponse.json({ error: 'Pickup and delivery locations required' }, { status: 400 })
  }

  const status = scheduledDate ? 'scheduled' : 'requested'

  const req = await prisma.transportRequest.create({
    data: {
      vehicleId: vehicleId || null,
      vehicleDescription: vehicleDescription || null,
      vin: vin || null,
      trailerType: trailerType || null,
      clientName: clientName || null,
      clientPhone: clientPhone || null,
      requestedById: user.id,
      pickupLocation,
      deliveryLocation,
      urgency: urgency || 'standard',
      preferredDate: preferredDate ? new Date(preferredDate) : null,
      scheduledDate: scheduledDate ? new Date(scheduledDate) : null,
      carrierInfo: carrierInfo || null,
      purpose: purpose || null,
      purposeNote: purpose === 'other' ? (purposeNote || null) : null,
      estimatedPrice: purpose === 'ship_to_client' && estimatedPrice ? Number(estimatedPrice) : null,
      status,
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

  // Notify the transport distribution list
  ;(async () => {
    const vehicleDesc = req.vehicleDescription || (vehicleId
      ? (await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { year: true, make: true, model: true } }).then(v => v ? `${v.year ?? ''} ${v.make} ${v.model}`.trim() : 'Vehicle'))
      : 'Vehicle')
    const { subject, html } = newTransportRequestEmail({
      vehicleDesc,
      pickupLocation: req.pickupLocation,
      deliveryLocation: req.deliveryLocation,
      trailerType: req.trailerType,
      purpose: req.purpose,
      purposeNote: req.purposeNote,
      scheduledDate: req.scheduledDate,
      carrierInfo: req.carrierInfo,
      estimatedPrice: req.estimatedPrice,
      urgency: req.urgency,
      clientName: req.clientName,
      clientPhone: req.clientPhone,
      notes: req.notes,
      status: req.status,
      requestedBy: user.name,
    })
    await sendNotificationEmail({ to: TRANSPORT_DISTRO, subject, html })
  })().catch((e) => console.error('[transport email]', e))

  return NextResponse.json({ request: req }, { status: 201 })
}
