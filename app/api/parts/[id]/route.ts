import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, requireRole } from '@/lib/auth'
import { sendNotificationEmail } from '@/lib/email'
import { partsRequestEmail } from '@/lib/email-templates'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const updates = await req.json()

  const part = await prisma.part.findUnique({
    where: { id },
    include: {
      vehicle: {
        select: { id: true, stockNumber: true, year: true, make: true, model: true, color: true }
      },
      requestedBy: { select: { name: true } }
    }
  })

  if (!part) return NextResponse.json({ error: 'Part not found' }, { status: 404 })

  // Access control
  if (user.role !== 'admin' && part.assignedToId !== user.id) {
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: part.vehicleId },
      select: { currentAssigneeId: true }
    })
    if (vehicle?.currentAssigneeId !== user.id) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }
  }

  const data: any = {}
  let shouldSendEmail = false
  let statusChangeLogged = false

  if ('url' in updates) {
    data.url = updates.url
    if (updates.url && part.status === 'requested') {
      data.status = 'sourced'
    }
  }

  if ('status' in updates && updates.status !== part.status) {
    data.status = updates.status
    if (updates.status === 'ready_to_order' && part.url) {
      shouldSendEmail = true
    }
    if (['ready_to_order', 'ordered', 'received'].includes(updates.status)) {
      await prisma.activityLog.create({
        data: {
          entityType: 'part', entityId: id, action: `part_${updates.status}`, actorId: user.id,
          details: { partName: part.name, vehicleStockNumber: part.vehicle.stockNumber, previousStatus: part.status }
        }
      })
      statusChangeLogged = true
    }
  }

  if ('price' in updates) data.price = updates.price
  if ('tracking' in updates) data.tracking = updates.tracking
  if ('notes' in updates) data.notes = updates.notes
  if ('assignedToId' in updates && user.role === 'admin') data.assignedToId = updates.assignedToId

  const updatedPart = await prisma.part.update({
    where: { id }, data,
    include: {
      vehicle: { select: { id: true, stockNumber: true, year: true, make: true, model: true, color: true } },
      requestedBy: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true } }
    }
  })

  if (shouldSendEmail && part.url) {
    const vehicleDesc = `${part.vehicle.year} ${part.vehicle.make} ${part.vehicle.model} (Stock #${part.vehicle.stockNumber})`
    const { subject, html } = partsRequestEmail({ vehicleDesc, partName: part.name, url: part.url, requestedBy: part.requestedBy.name, vehicleId: part.vehicle.id })
    await sendNotificationEmail({ to: 'parts@mikalyzedautoboutique.com', subject, html })
  }

  await updateVehiclePartsStatus(part.vehicleId)

  if (!statusChangeLogged) {
    await prisma.activityLog.create({
      data: {
        entityType: 'part', entityId: id, action: 'part_updated', actorId: user.id,
        details: { partName: part.name, vehicleStockNumber: part.vehicle.stockNumber, updates: Object.keys(updates) }
      }
    })
  }

  return NextResponse.json({ part: updatedPart })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const { id } = await params
  const part = await prisma.part.findUnique({
    where: { id },
    select: { name: true, vehicleId: true, vehicle: { select: { stockNumber: true } } }
  })

  if (!part) return NextResponse.json({ error: 'Part not found' }, { status: 404 })

  await prisma.part.delete({ where: { id } })

  await prisma.activityLog.create({
    data: {
      entityType: 'part', entityId: id, action: 'part_deleted', actorId: user.id,
      details: { partName: part.name, vehicleStockNumber: part.vehicle.stockNumber }
    }
  })

  await updateVehiclePartsStatus(part.vehicleId)

  return NextResponse.json({ success: true })
}

async function updateVehiclePartsStatus(vehicleId: string) {
  const parts = await prisma.part.findMany({ where: { vehicleId }, select: { status: true } })
  const hasActive = parts.some(p => ['requested', 'sourced', 'ready_to_order', 'ordered'].includes(p.status))
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { currentStageId: true } })
  if (vehicle?.currentStageId) {
    await prisma.vehicleStage.update({ where: { id: vehicle.currentStageId }, data: { awaitingParts: hasActive } })
  }
}
