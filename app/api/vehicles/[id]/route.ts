import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, requireRole } from '@/lib/auth'
import { recomputeInventoryStatus } from '@/lib/inventory-status'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const vehicle = await prisma.vehicle.findUnique({
    where: { id },
    include: {
      currentAssignee: { select: { id: true, name: true, role: true } },
      createdBy: { select: { id: true, name: true } },
      stages: {
        include: {
          assignee: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
      transportRequests: {
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!vehicle) {
    return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 })
  }

  // External repair runs alongside recon (separate table, keyed by stockNumber
  // not vehicleId).  Pulled here so the detail page can weave it into the
  // recon timeline as part of the vehicle jacket.
  const externalRepairs = await prisma.externalRepair.findMany({
    where: { stockNumber: vehicle.stockNumber },
    orderBy: { createdAt: 'asc' },
    include: { vendor: { select: { id: true, name: true } } },
  })

  return NextResponse.json({ vehicle: { ...vehicle, externalRepairs } })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!requireRole(user.role, ['admin'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()

  const allowed = [
    'stockNumber', 'vin', 'year', 'make', 'model', 'color', 'trim', 'notes', 'status',
    // Pricing & cost (Price & Cost card)
    'askingPrice', 'vehicleCost', 'dateInStock',
    // Marketing description (Vehicle Info → Description sub-tab)
    'vehicleInfo',
    // Title & Build Studio (Vehicle Info → Build / Title sub-tab)
    'titleStatus',
    // Phase 2 — flooring
    'floorLender', 'floorPrincipal', 'floorDailyRate', 'floorAdvanceDate', 'floorStatus',
  ]
  const dateFields = new Set(['floorAdvanceDate', 'dateInStock'])
  const data: Record<string, unknown> = {}
  for (const key of allowed) {
    if (body[key] === undefined) continue
    const v = body[key]
    if (dateFields.has(key)) {
      // Accept YYYY-MM-DD or ISO datetime; null clears the field
      data[key] = v === null || v === '' ? null : new Date(v as string)
    } else {
      data[key] = v
    }
  }

  const vehicle = await prisma.vehicle.update({
    where: { id },
    data,
  })

  return NextResponse.json({ vehicle })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!requireRole(user.role, ['admin'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const v = await prisma.vehicle.findUnique({ where: { id }, select: { stockNumber: true } })
  await prisma.vehicle.delete({ where: { id } })
  if (v) await recomputeInventoryStatus(v.stockNumber).catch(() => {})

  return NextResponse.json({ success: true })
}
