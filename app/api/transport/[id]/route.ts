import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

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

  return NextResponse.json({ request: updated })
}
