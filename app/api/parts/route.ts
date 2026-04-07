import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, requireRole } from '@/lib/auth'
import { sendNotificationEmail } from '@/lib/email'
import { partsRequestEmail } from '@/lib/email-templates'

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const vehicleId = searchParams.get('vehicleId')
  const status = searchParams.get('status')

  const where: any = {}

  // Filter by vehicle if specified
  if (vehicleId) {
    where.vehicleId = vehicleId
  }

  // Filter by status if specified
  if (status && status !== 'all') {
    where.status = status
  }

  // Access control: admins see all, mechanics see parts assigned to them or on their vehicles
  if (user.role !== 'admin') {
    where.OR = [
      { assignedToId: user.id },
      { vehicle: { currentAssigneeId: user.id } }
    ]
  }

  const parts = await prisma.part.findMany({
    where,
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
    },
    orderBy: [
      { status: 'asc' }, // requested first, then sourced/ordered/received
      { createdAt: 'desc' }
    ]
  })

  return NextResponse.json({ parts, userRole: user.role })
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { vehicleId, name, url, notes, assignedToId } = await req.json()

  if (!vehicleId || !name) {
    return NextResponse.json({ error: 'vehicleId and name are required' }, { status: 400 })
  }

  // Verify vehicle exists
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: {
      id: true,
      stockNumber: true,
      year: true,
      make: true,
      model: true,
      color: true
    }
  })

  if (!vehicle) {
    return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 })
  }

  // Determine initial status
  const initialStatus = url ? 'sourced' : 'requested'

  const part = await prisma.part.create({
    data: {
      vehicleId,
      name,
      url: url || null,
      status: initialStatus,
      requestedById: user.id,
      assignedToId: assignedToId || null,
      notes: notes || null
    },
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

  // Send email notification when URL is provided (part is sourced)
  if (url) {
    const vehicleDesc = `${vehicle.year} ${vehicle.make} ${vehicle.model} (Stock #${vehicle.stockNumber})`
    const { subject, html } = partsRequestEmail({
      vehicleDesc,
      partName: name,
      url,
      requestedBy: user.name,
      vehicleId: vehicle.id
    })

    await sendNotificationEmail({
      to: 'parts@mikalyzedautoboutique.com',
      subject,
      html
    })
  }

  // Update vehicle awaitingParts status
  await updateVehiclePartsStatus(vehicleId)

  // Log activity
  await prisma.activityLog.create({
    data: {
      entityType: 'vehicle',
      entityId: vehicleId,
      action: 'part_created',
      actorId: user.id,
      details: { partName: name, status: initialStatus, hasUrl: !!url }
    }
  })

  return NextResponse.json({ part })
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