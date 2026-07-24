import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, requireRole } from '@/lib/auth'
import { computeDealTotals, FL_DEFAULT_FEES, flCountySurtaxRate } from '@/lib/deals'

// Deal Desk is money-facing: admin + sales_manager only until the Phase 1a
// per-user permission system ships (same temp gate as other money surfaces).
function dealAccess(role: string) {
  return requireRole(role, ['sales_manager'])
}

const DEAL_LIST_SELECT = {
  id: true, dealNumber: true, status: true, dealType: true,
  salePrice: true, otdTotal: true, depositCredit: true,
  fundedAt: true, createdAt: true,
  vehicle: { select: { id: true, stockNumber: true, year: true, make: true, model: true } },
  buyer: { select: { id: true, firstName: true, lastName: true } },
  businessBuyer: { select: { id: true, businessName: true } },
  salesRep: { select: { id: true, name: true } },
} as const

/** GET /api/deals — list, newest first. Optional ?status= filter. */
export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!dealAccess(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')

  const deals = await prisma.deal.findMany({
    where: status ? { status } : undefined,
    select: DEAL_LIST_SELECT,
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  return NextResponse.json({ deals })
}

/**
 * POST /api/deals — create a draft deal.
 * Body: { vehicleId, buyerContactId } or { opportunityId } (created from a
 * won opp — vehicle/buyer/rep/co-buyer are lifted off the opportunity).
 */
export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!dealAccess(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  let vehicleId: string | null = body.vehicleId ?? null
  let buyerContactId: string | null = body.buyerContactId ?? null
  let coBuyerContactId: string | null = null
  let salesRepId: string | null = null
  let salePrice = 0
  const opportunityId: string | null = body.opportunityId ?? null

  if (opportunityId) {
    const opp = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
      include: { contact: { select: { id: true, coBuyerContactId: true, salesRepId: true } } },
    })
    if (!opp) return NextResponse.json({ error: 'Opportunity not found' }, { status: 404 })
    const existing = await prisma.deal.findUnique({ where: { opportunityId } })
    if (existing) {
      return NextResponse.json({ error: 'A deal already exists for this opportunity', dealId: existing.id }, { status: 409 })
    }
    vehicleId = vehicleId ?? opp.vehicleId
    buyerContactId = buyerContactId ?? opp.contactId
    coBuyerContactId = opp.contact.coBuyerContactId
    salesRepId = opp.assigneeId ?? opp.contact.salesRepId
    // Opportunity.value is legacy Int cents.
    if (opp.value) salePrice = opp.value / 100
  }

  if (!vehicleId || !buyerContactId) {
    return NextResponse.json({ error: 'vehicleId and buyerContactId are required' }, { status: 400 })
  }

  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: { id: true, askingPrice: true, inventoryStatus: true },
  })
  if (!vehicle) return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 })

  // Seed the worksheet with the asking price if the opp had no value.
  if (!salePrice && vehicle.askingPrice) salePrice = vehicle.askingPrice

  // Guard: warn-level block on selling an already-sold car twice. A second
  // draft on the same vehicle is allowed (backup deals happen), but not on
  // one already funded/sold.
  const fundedOnVehicle = await prisma.deal.findFirst({ where: { vehicleId, status: 'funded' } })
  if (fundedOnVehicle || vehicle.inventoryStatus === 'sold') {
    return NextResponse.json({ error: 'This vehicle is already sold' }, { status: 409 })
  }

  // Pull the buyer's co-buyer/rep and county (county drives the surtax).
  const buyer = await prisma.contact.findUnique({
    where: { id: buyerContactId },
    select: { coBuyerContactId: true, salesRepId: true, county: true },
  })
  coBuyerContactId = coBuyerContactId ?? buyer?.coBuyerContactId ?? null
  salesRepId = salesRepId ?? buyer?.salesRepId ?? null
  // 6% state is fixed; surtax follows the buyer's county when we know it
  // (falls back to the 1% default until the county is entered).
  const countySurtaxRate = flCountySurtaxRate(buyer?.county) ?? 0.01

  // New retail deals start in FL-buyer mode → pre-populate the standard
  // FL fee sheet (all lines editable on the worksheet).
  const totals = computeDealTotals({
    salePrice, collectTax: true,
    stateTaxRate: 0.06, countySurtaxRate, surtaxCap: 5000,
    depositCredit: 0, lineItems: FL_DEFAULT_FEES, trades: [],
  })

  const deal = await prisma.deal.create({
    data: {
      vehicleId, buyerContactId, coBuyerContactId, opportunityId, salesRepId,
      salePrice,
      countySurtaxRate,
      taxAmount: totals.taxAmount,
      otdTotal: totals.otdTotal,
      createdById: user.id,
      lineItems: {
        create: FL_DEFAULT_FEES.map((f, i) => ({ ...f, sortOrder: i })),
      },
    },
    select: { id: true, dealNumber: true },
  })

  await prisma.activityLog.create({
    data: {
      entityType: 'deal', entityId: deal.id, action: 'created',
      actorId: user.id,
      details: { dealNumber: deal.dealNumber, vehicleId, buyerContactId, opportunityId },
    },
  }).catch(() => { /* audit log is best-effort */ })

  return NextResponse.json({ deal }, { status: 201 })
}
