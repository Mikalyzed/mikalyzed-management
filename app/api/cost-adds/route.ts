import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

const VALID_KINDS = ['recon', 'parts', 'transport', 'detail', 'pack', 'acquisition_fee', 'other']

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // Money-visibility gate (Phase 1a RBAC will replace with per-user settings)
  if (user.role !== 'admin' && user.role !== 'sales_manager') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const vehicleId = searchParams.get('vehicleId')
  if (!vehicleId) return NextResponse.json({ error: 'vehicleId required' }, { status: 400 })

  const costAdds = await prisma.costAdd.findMany({
    where: { vehicleId },
    include: { addedBy: { select: { id: true, name: true } } },
    orderBy: { addedAt: 'desc' },
  })

  return NextResponse.json({ costAdds })
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'admin' && user.role !== 'sales_manager') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { vehicleId, kind, amount, description, vendor, receiptUrl } = body

  if (!vehicleId) return NextResponse.json({ error: 'vehicleId required' }, { status: 400 })
  if (!kind || !VALID_KINDS.includes(kind)) {
    return NextResponse.json({ error: `kind required, must be one of: ${VALID_KINDS.join(', ')}` }, { status: 400 })
  }
  if (typeof amount !== 'number' || amount <= 0) {
    return NextResponse.json({ error: 'amount required (positive number, dollars)' }, { status: 400 })
  }

  // Verify vehicle exists
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { id: true } })
  if (!vehicle) return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 })

  // Store as cents (integer)
  const amountCents = Math.round(amount * 100)

  const created = await prisma.costAdd.create({
    data: {
      vehicleId,
      kind,
      amountCents,
      description: description?.trim() || null,
      vendor: vendor?.trim() || null,
      receiptUrl: receiptUrl?.trim() || null,
      addedById: user.id,
    },
    include: { addedBy: { select: { id: true, name: true } } },
  })

  // Activity log
  try {
    await prisma.activityLog.create({
      data: {
        entityType: 'vehicle',
        entityId: vehicleId,
        action: 'cost_add_created',
        actorId: user.id,
        details: { kind, amountCents, description, vendor },
      },
    })
  } catch {}

  return NextResponse.json({ costAdd: created })
}
