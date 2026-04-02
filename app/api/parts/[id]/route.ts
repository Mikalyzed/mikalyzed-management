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
        select: {
          id: true,
          stockNumber: true,
          year: true,
          make: true,
          model: true,
          color: true
        }
      },
      requestedBy: { select: { name: true } }
    }
  })

  if (!part) {
    return NextResponse.json({ error: 'Part not found' }, { status: 404 })
  }

  // Access control: only admin, or assigned user, or vehicle assignee can update
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

  // Handle URL updates
  if ('url' in updates) {
    data.url = updates.url
    // If URL is being added and status was 'requested', auto-update to 'sourced' (pending approval)
    if (updates.url && part.status === 'requested') {
      data.status = 'sourced'
    }
    // If URL is cleared (decline), keep status as-is (caller sets status to 'requested')
  }

  // Handle status updates
  if ('status' in updates && updates.status !== part.status) {
    data.status = updates.status
    
    // Send email to parts@ when approved (ready_to_order)
    if (updates.status === 'ready_to_order' && part.url) {
      shouldSendEmail = true
    }

    // Log status changes
    if (['ready_to_order', 'ordered', 'received'].includes(updates.status)) {
      await prisma.activityLog.create({
        data: {
          entityType: 'part',
          entityId: id,
          action: `part_${updates.status}`,
          actorId: user.id,
          details: { 
            partName: part.name, 
            vehicleStockNumber: part.vehicle.stockNumber,
            previousStatus: part.status 
          }
        }
      })
      statusChangeLogged = true
    }
  }

  // Handle other field updates
  if ('price' in updates) data.price = updates.price
  if ('tracking' in updates) data.tracking = updates.tracking
  if ('notes' in updates) data.notes = updates.notes
  if ('assignedToId' in updates && user.role === 'admin') {
    data.assignedToId = updates.assignedToId
  }

  // Update the part
  const updatedPart = await prisma.part.update({
    where: { id },
    data,
    include: {
      vehicle: {
        select: {
          id: true,
          stockNumber: true,
          year: true,
          make: true,
          model: true,
          color: true
        }
      },
      requestedBy: {
        select: { id: true, name: true }
      },
      assignedTo: {
        select: { id: true, name: true }
      }
    }
  })

  // Send email when part is approved (ready_to_order)
  if (shouldSendEmail && part.url) {
    const vehicleDesc = `${part.vehicle.year} ${part.vehicle.make} ${part.vehicle.model} (Stock #${part.vehicle.stockNumber})`
    const { subject, html } = partsRequestEmail({
      vehicleDesc,
      partName: part.name,
      url: data.url,
      requestedBy: part.requestedBy.name,
      vehicleId: part.vehicle.id
    })

    await sendNotificationEmail({
      to: 'parts@mikalyzedautoboutique.com',
      subject,
      html
    })
  }

  // Update vehicle awaitingParts status
  await updateVehiclePartsStatus(part.vehicleId)

  // Log general update if no specific status change was logged
  if (!statusChangeLogged) {
    await prisma.activityLog.create({
      data: {
        entityType: 'part',
        entityId: id,
        action: 'part_updated',
        actorId: user.id,
        details: { 
          partName: part.name,
          vehicleStockNumber: part.vehicle.stockNumber,
          updates: Object.keys(updates)
        }
      }
    })
  }

  return NextResponse.json({ part: updatedPart })
}

// Helper function to update vehicle awaitingParts status
async function updateVehiclePartsStatus(vehicleId: string) {
  const parts = await prisma.part.findMany({
    where: { vehicleId },
    select: { status: true }
  })

  const hasRequestedOrOrdered = parts.some(p => ['requested', 'sourced', 'ready_to_order', 'ordered'].includes(p.status))

  // Update current vehicle stage if it exists
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: { currentStageId: true }
  })

  if (vehicle?.currentStageId) {
    await prisma.vehicleStage.update({
      where: { id: vehicle.currentStageId },
      data: { awaitingParts: hasRequestedOrOrdered }
    })
  }
}