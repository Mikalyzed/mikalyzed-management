import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { sendNotificationEmail } from '@/lib/email'
import { transportUpdateEmail } from '@/lib/email-templates'

const TRANSPORT_DISTRO = process.env.TRANSPORT_NOTIFY_EMAIL || 'transport@mikalyzedautoboutique.com'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const req = await prisma.transportRequest.findUnique({
    where: { id },
    include: {
      vehicle: { select: { stockNumber: true, year: true, make: true, model: true } },
      requestedBy: { select: { name: true, email: true } },
      coordinator: { select: { name: true } },
    },
  })
  if (!req) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ request: req })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json()

  const data: Record<string, unknown> = {}
  if (body.status) data.status = body.status
  if (body.transportType) data.transportType = body.transportType
  if (body.scheduledDate) data.scheduledDate = new Date(body.scheduledDate)
  if (body.carrierInfo !== undefined) data.carrierInfo = body.carrierInfo
  if (body.notes !== undefined) data.notes = body.notes

  // Auto-assign coordinator on first update
  if (!data.coordinatorId) {
    const existing = await prisma.transportRequest.findUnique({ where: { id } })
    if (existing && !existing.coordinatorId) {
      data.coordinatorId = user.id
    }
  }

  const updated = await prisma.transportRequest.update({
    where: { id },
    data,
  })

  await prisma.activityLog.create({
    data: {
      entityType: 'transport',
      entityId: id,
      action: body.status ? `status_${body.status}` : 'updated',
      actorId: user.id,
      details: body,
    },
  })

  // Fire-and-forget: notify the transport distribution list + requester
  prisma.transportRequest.findUnique({
    where: { id },
    include: { requestedBy: true, vehicle: { select: { year: true, make: true, model: true } } },
  }).then((tr) => {
    if (!tr) return
    const vehicleDesc = tr.vehicleDescription
      || (tr.vehicle ? `${tr.vehicle.year ?? ''} ${tr.vehicle.make} ${tr.vehicle.model}`.trim() : 'Transport request')
    const { subject, html } = transportUpdateEmail({
      vehicleDesc,
      status: updated.status,
      updatedBy: user!.name,
      transportId: id,
    })
    sendNotificationEmail({ to: TRANSPORT_DISTRO, subject, html }).catch(() => {})
    if (tr.requestedBy && tr.requestedBy.email !== TRANSPORT_DISTRO) {
      sendNotificationEmail({ to: tr.requestedBy.email, subject, html }).catch(() => {})
      prisma.notification.create({
        data: {
          userId: tr.requestedBy.id,
          type: 'transport_update',
          title: subject,
          message: `${vehicleDesc} — status: ${updated.status}`,
          entityType: 'transport',
          entityId: id,
        },
      }).catch(() => {})
    }
  }).catch(() => {})

  return NextResponse.json({ request: updated })
}
