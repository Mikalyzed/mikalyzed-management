import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, requireRole } from '@/lib/auth'
import { computeDealTotals, FL_DEFAULT_FEES, flCountySurtaxRate, MAX_TRADES } from '@/lib/deals'

function dealAccess(role: string) {
  return requireRole(role, ['sales_manager'])
}

const DEAL_DETAIL_INCLUDE = {
  vehicle: {
    select: {
      id: true, stockNumber: true, vin: true, year: true, make: true, model: true,
      color: true, mileage: true, askingPrice: true, inventoryStatus: true,
      trim: true, engine: true, transmission: true, driveTrain: true,
      titleBrand: true, newUsed: true,
    },
  },
  // Full contact — the deal jacket edits the applicant record inline
  // (DealerCenter-style), so it needs every buyer field.
  buyer: true,
  businessBuyer: true,
  coBuyer: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
  salesRep: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  opportunity: { select: { id: true, pipeline: { select: { name: true } } } },
  lineItems: {
    orderBy: { sortOrder: 'asc' as const },
    include: { vendorPartner: { select: { id: true, companyName: true } } },
  },
  trades: { orderBy: { sortOrder: 'asc' as const } },
} as const

/** GET /api/deals/:id — full worksheet payload. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!dealAccess(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const deal = await prisma.deal.findUnique({ where: { id }, include: DEAL_DETAIL_INCLUDE })
  if (!deal) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ deal })
}

// Scalar worksheet fields the client may PATCH. Totals are NEVER accepted
// from the client — recomputed server-side on every save.
const MONEY_FIELDS = ['salePrice', 'stateTaxRate', 'countySurtaxRate', 'surtaxCap', 'depositCredit'] as const
const OTHER_FIELDS = ['collectTax', 'notes', 'salesRepId', 'coBuyerContactId', 'dealType', 'buyerContactId', 'businessBuyerId'] as const
const DEAL_TYPES = new Set(['retail_cash', 'wholesale'])

type LineItemBody = {
  category?: unknown; label?: unknown; amount?: unknown; taxable?: unknown
  cost?: unknown; itemNumber?: unknown; vendorPartnerId?: unknown; deductFrom?: unknown
}
type TradeBody = {
  vin?: unknown; year?: unknown; make?: unknown; model?: unknown; trim?: unknown
  mileage?: unknown; color?: unknown; allowance?: unknown; acv?: unknown
  payoff?: unknown; lienholder?: unknown; notes?: unknown
}

const num = (v: unknown): number => {
  const n = v === null || v === '' || typeof v === 'undefined' ? 0 : Number(v)
  return Number.isNaN(n) ? 0 : n
}
const intOrNull = (v: unknown): number | null => {
  const n = Number(v)
  return v === null || v === '' || typeof v === 'undefined' || Number.isNaN(n) ? null : Math.trunc(n)
}
const strOrNull = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null

/**
 * PATCH /api/deals/:id — update the worksheet (draft deals only).
 * Accepts scalar fields plus optional replace-all `lineItems` and `trades`
 * arrays, and a `vehicleId` swap. Everything runs in one transaction and
 * returns the fresh deal + computed totals.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!dealAccess(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const deal = await prisma.deal.findUnique({
    where: { id },
    include: { lineItems: true, trades: true },
  })
  if (!deal) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (deal.status !== 'draft') {
    return NextResponse.json({ error: `A ${deal.status} deal can no longer be edited` }, { status: 409 })
  }

  const body = await req.json().catch(() => ({}))
  const data: Record<string, unknown> = {}

  for (const k of MONEY_FIELDS) {
    if (!(k in body)) continue
    const n = num(body[k])
    if (n < 0) return NextResponse.json({ error: `Invalid ${k}` }, { status: 400 })
    // Tax rates are decimals (0.06 = 6%) — a raw "6" would charge 600% tax.
    if ((k === 'stateTaxRate' || k === 'countySurtaxRate') && n > 0.2) {
      return NextResponse.json({ error: `${k} must be a decimal rate (e.g. 0.06 for 6%)` }, { status: 400 })
    }
    data[k] = n
  }
  for (const k of OTHER_FIELDS) {
    if (k in body) data[k] = body[k]
  }
  if (typeof data.collectTax !== 'undefined') data.collectTax = Boolean(data.collectTax)
  if (typeof data.dealType !== 'undefined' && !DEAL_TYPES.has(String(data.dealType))) {
    return NextResponse.json({ error: 'Invalid dealType' }, { status: 400 })
  }
  // Buyer swaps (retail customer ↔ wholesale business) — validate targets.
  if (typeof data.buyerContactId === 'string') {
    const c = await prisma.contact.findUnique({ where: { id: data.buyerContactId }, select: { id: true, county: true } })
    if (!c) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    // Surtax follows the buyer's county — auto-apply when we know it and
    // the caller didn't set a rate explicitly.
    const rate = flCountySurtaxRate(c.county)
    if (rate != null && !('countySurtaxRate' in data)) data.countySurtaxRate = rate
  }
  if (typeof data.businessBuyerId === 'string') {
    const bz = await prisma.business.findUnique({ where: { id: data.businessBuyerId }, select: { id: true } })
    if (!bz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })
  }

  // Vehicle spec edits (DC Vehicle Info parity) — these write to the
  // VEHICLE record itself (single source of truth for inventory too).
  let vehiclePatch: Record<string, unknown> | null = null
  if (body.vehiclePatch && typeof body.vehiclePatch === 'object') {
    const VP_STR = ['vin', 'stockNumber', 'make', 'model', 'trim', 'color', 'engine', 'transmission', 'driveTrain', 'titleBrand', 'newUsed'] as const
    const vp: Record<string, unknown> = {}
    for (const k of VP_STR) {
      if (k in body.vehiclePatch) vp[k] = strOrNull(body.vehiclePatch[k])
    }
    // make/model are non-nullable columns — ignore attempts to blank them.
    if (vp.make === null) delete vp.make
    if (vp.model === null) delete vp.model
    if (vp.stockNumber === null) delete vp.stockNumber
    if ('year' in body.vehiclePatch) vp.year = intOrNull(body.vehiclePatch.year)
    if ('mileage' in body.vehiclePatch) vp.mileage = intOrNull(body.vehiclePatch.mileage)
    if (Object.keys(vp).length) vehiclePatch = vp
  }

  // Vehicle swap — draft only; must exist and not be sold.
  if (typeof body.vehicleId === 'string' && body.vehicleId !== deal.vehicleId) {
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: body.vehicleId },
      select: { id: true, inventoryStatus: true, askingPrice: true },
    })
    if (!vehicle) return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 })
    const fundedOnVehicle = await prisma.deal.findFirst({ where: { vehicleId: vehicle.id, status: 'funded' } })
    if (fundedOnVehicle || vehicle.inventoryStatus === 'sold') {
      return NextResponse.json({ error: 'That vehicle is already sold' }, { status: 409 })
    }
    data.vehicleId = vehicle.id
    // Re-seed the price from the new car unless this PATCH also sets one.
    if (!('salePrice' in data) && vehicle.askingPrice) data.salePrice = vehicle.askingPrice
  }

  // Replace-all children (the worksheet edits them as whole sets).
  let nextLineItems: Array<{
    category: string; label: string; amount: number; taxable: boolean; sortOrder: number
    cost: number | null; itemNumber: string | null; vendorPartnerId: string | null; deductFrom: string | null
  }> | null = null
  if (Array.isArray(body.lineItems)) {
    nextLineItems = (body.lineItems as LineItemBody[]).map((li, i) => ({
      category: typeof li.category === 'string' ? li.category : 'fee',
      label: strOrNull(li.label) ?? 'Item',
      amount: num(li.amount),
      taxable: Boolean(li.taxable),
      sortOrder: i,
      cost: li.cost == null || li.cost === '' ? null : num(li.cost),
      itemNumber: strOrNull(li.itemNumber),
      vendorPartnerId: strOrNull(li.vendorPartnerId),
      deductFrom: strOrNull(li.deductFrom),
    }))
  }

  let nextTrades: Array<{
    vin: string | null; year: number | null; make: string | null; model: string | null
    trim: string | null; mileage: number | null; color: string | null
    allowance: number; acv: number; payoff: number
    lienholder: string | null; notes: string | null; sortOrder: number
  }> | null = null
  if (Array.isArray(body.trades)) {
    if (body.trades.length > MAX_TRADES) {
      return NextResponse.json({ error: `Max ${MAX_TRADES} trade-ins per deal` }, { status: 400 })
    }
    nextTrades = (body.trades as TradeBody[]).map((t, i) => ({
      vin: strOrNull(t.vin), year: intOrNull(t.year), make: strOrNull(t.make),
      model: strOrNull(t.model), trim: strOrNull(t.trim), mileage: intOrNull(t.mileage),
      color: strOrNull(t.color),
      allowance: num(t.allowance), acv: num(t.acv), payoff: num(t.payoff),
      lienholder: strOrNull(t.lienholder), notes: strOrNull(t.notes), sortOrder: i,
    }))
  }

  // Recompute stored totals from the merged next state.
  const merged = { ...deal, ...data } as typeof deal

  // FL Buyer switched on with an empty fee list (fresh retail flip or
  // cleared sheet) → auto-populate the standard FL fees. Editable as
  // always; this just saves the 99%-case typing.
  // ── FL fee-sheet reconciliation ──
  // The sheet belongs on a deal only when the FINAL state is retail + FL
  // buyer. Reconcile on any transition of collectTax or dealType (fixes:
  // switching retail→wholesale previously kept ~$1,452 of retail fees in
  // the OTD because the old guard checked the post-switch dealType).
  // Manual edits are respected: no transition key in the body → no touch.
  const carryLine = (li: (typeof deal.lineItems)[number], i: number) => ({
    category: li.category, label: li.label, amount: li.amount, taxable: li.taxable, sortOrder: i,
    cost: li.cost, itemNumber: li.itemNumber, vendorPartnerId: li.vendorPartnerId, deductFrom: li.deductFrom,
  })
  const feeTransition = 'collectTax' in data || 'dealType' in data
  const shouldHaveFeeSheet = merged.collectTax === true && merged.dealType !== 'wholesale'
  const hasFeeLines = deal.lineItems.some(li => li.category === 'fee')

  if (!nextLineItems && feeTransition && !shouldHaveFeeSheet && hasFeeLines) {
    // Out-of-state or wholesale → strip the FL sheet, keep deliberate add-ons.
    nextLineItems = deal.lineItems.filter(li => li.category !== 'fee').map(carryLine)
  }

  if (!nextLineItems && feeTransition && shouldHaveFeeSheet && !hasFeeLines) {
    // FL retail (re)activated with an empty sheet → seed the standard fees.
    const nonFees = deal.lineItems.filter(li => li.category !== 'fee').map(carryLine)
    nextLineItems = [
      ...nonFees,
      ...FL_DEFAULT_FEES.map((f, i) => ({
        ...f, sortOrder: nonFees.length + i,
        cost: null, itemNumber: null, vendorPartnerId: null, deductFrom: null,
      })),
    ]
  }
  const totals = computeDealTotals({
    salePrice: merged.salePrice,
    collectTax: merged.collectTax,
    stateTaxRate: merged.stateTaxRate,
    countySurtaxRate: merged.countySurtaxRate,
    surtaxCap: merged.surtaxCap,
    depositCredit: merged.depositCredit,
    lineItems: nextLineItems ?? deal.lineItems,
    trades: nextTrades ?? deal.trades,
  })
  data.taxAmount = totals.taxAmount
  data.otdTotal = totals.otdTotal

  try {
  const updated = await prisma.$transaction(async (tx) => {
    if (vehiclePatch) {
      await tx.vehicle.update({ where: { id: merged.vehicleId }, data: vehiclePatch })
    }
    if (nextLineItems) {
      await tx.dealLineItem.deleteMany({ where: { dealId: id } })
      if (nextLineItems.length) {
        await tx.dealLineItem.createMany({ data: nextLineItems.map(li => ({ ...li, dealId: id })) })
      }
    }
    if (nextTrades) {
      await tx.dealTrade.deleteMany({ where: { dealId: id } })
      if (nextTrades.length) {
        await tx.dealTrade.createMany({ data: nextTrades.map(t => ({ ...t, dealId: id })) })
      }
    }
    return tx.deal.update({ where: { id }, data, include: DEAL_DETAIL_INCLUDE })
  })

  return NextResponse.json({ deal: updated, totals })
  } catch (e: unknown) {
    // Unique-constraint clash (e.g. editing stock # to one that exists).
    const code = (e as { code?: string })?.code
    if (code === 'P2002') {
      return NextResponse.json({ error: 'That stock # or VIN is already in use' }, { status: 409 })
    }
    throw e
  }
}

/** DELETE /api/deals/:id — cancel (soft) a draft deal. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!dealAccess(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const deal = await prisma.deal.findUnique({ where: { id } })
  if (!deal) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (deal.status === 'funded') {
    return NextResponse.json({ error: 'Funded deals cannot be cancelled from here' }, { status: 409 })
  }

  const updated = await prisma.deal.update({
    where: { id },
    data: { status: 'cancelled', cancelledAt: new Date() },
    select: { id: true, status: true },
  })
  await prisma.activityLog.create({
    data: { entityType: 'deal', entityId: id, action: 'cancelled', actorId: user.id },
  }).catch(() => {})
  return NextResponse.json({ deal: updated })
}
