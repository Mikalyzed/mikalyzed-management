import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

// Kinds are no longer a fixed enum — admins manage the Category quick-pick
// list via /api/cost-add-categories. We still cap the field length to keep
// rogue input from polluting reports.
const MAX_KIND_LENGTH = 80

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
    include: {
      addedBy: { select: { id: true, name: true } },
      partner: { select: { id: true, companyName: true } },
    },
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
  const { vehicleId, kind, amount, description, vendor, partnerId, receiptUrl, paymentMethod, memo, addedAt } = body

  if (!vehicleId) return NextResponse.json({ error: 'vehicleId required' }, { status: 400 })
  const kindStr = typeof kind === 'string' ? kind.trim() : ''
  if (!kindStr) return NextResponse.json({ error: 'kind required' }, { status: 400 })
  if (kindStr.length > MAX_KIND_LENGTH) {
    return NextResponse.json({ error: `kind too long (max ${MAX_KIND_LENGTH} chars)` }, { status: 400 })
  }
  if (typeof amount !== 'number' || amount <= 0) {
    return NextResponse.json({ error: 'amount required (positive number, dollars)' }, { status: 400 })
  }

  // Verify vehicle exists
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { id: true } })
  if (!vehicle) return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 })

  // Store as cents (integer)
  const amountCents = Math.round(amount * 100)

  // Allow caller to backdate / override addedAt (e.g., user records a cost paid
  // last week). Falls back to default(now()) when omitted or invalid.
  const parsedAddedAt = addedAt ? new Date(addedAt) : null
  const addedAtValue = parsedAddedAt && !Number.isNaN(parsedAddedAt.getTime()) ? parsedAddedAt : undefined

  const cleanPartnerId = typeof partnerId === 'string' && partnerId.trim() ? partnerId.trim() : null

  const created = await prisma.costAdd.create({
    data: {
      vehicleId,
      kind: kindStr,
      amountCents,
      description: description?.trim() || null,
      vendor: vendor?.trim() || null,
      partnerId: cleanPartnerId,
      receiptUrl: receiptUrl?.trim() || null,
      paymentMethod: paymentMethod?.trim() || null,
      memo: memo?.trim() || null,
      addedById: user.id,
      ...(addedAtValue ? { addedAt: addedAtValue } : {}),
    },
    include: {
      addedBy: { select: { id: true, name: true } },
      partner: { select: { id: true, companyName: true } },
    },
  })

  // Activity log
  try {
    await prisma.activityLog.create({
      data: {
        entityType: 'vehicle',
        entityId: vehicleId,
        action: 'cost_add_created',
        actorId: user.id,
        details: { kind: kindStr, amountCents, description, vendor, paymentMethod, memo },
      },
    })
  } catch {}

  return NextResponse.json({ costAdd: created })
}
