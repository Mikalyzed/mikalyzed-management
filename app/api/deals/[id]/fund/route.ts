import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, requireRole } from '@/lib/auth'
import { computeDealTotals, flCountySurtaxRate } from '@/lib/deals'

/**
 * POST /api/deals/:id/fund — the single event that closes a deal.
 *
 * In one transaction:
 *   1. Re-verify the vehicle is still unsold (backup drafts on the same
 *      car are allowed, so a race here would sell the car twice)
 *   2. Deal → funded (+ freeze final computed totals; surtax re-derived
 *      from the buyer's LIVE county so profile-side edits can't go stale)
 *   3. Retail: buyer Contact → contactType 'customer'; linked opportunity
 *      (if open) → won.  Wholesale: neither — the buyer is a Business.
 *   4. Vehicle → inventoryStatus 'sold'
 *
 * TODO(flooring): when the flooring accrual job exists (Phase 1b/2), funding
 * should also trigger the final accrual + mark floorStatus. In-house floor
 * plan today, so nothing external is owed in the meantime.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!requireRole(user.role, ['sales_manager'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const deal = await prisma.deal.findUnique({
    where: { id },
    include: { lineItems: true, trades: true, buyer: { select: { county: true } } },
  })
  if (!deal) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (deal.status !== 'draft') {
    return NextResponse.json({ error: `Deal is already ${deal.status}` }, { status: 409 })
  }
  if (!deal.salePrice || deal.salePrice <= 0) {
    return NextResponse.json({ error: 'Set a sale price before funding' }, { status: 400 })
  }
  const isWholesale = deal.dealType === 'wholesale'
  // Each deal type needs its buyer attached.
  if (isWholesale && !deal.businessBuyerId) {
    return NextResponse.json({ error: 'Attach a business buyer before funding' }, { status: 400 })
  }
  if (!isWholesale && !deal.buyerContactId) {
    return NextResponse.json({ error: 'Attach a buyer before funding' }, { status: 400 })
  }

  // Surtax follows the buyer's CURRENT county — re-derive at funding so an
  // edit made on the customer profile (which doesn't touch the deal) can't
  // freeze a stale rate into the closed deal.
  const liveRate = !isWholesale && deal.collectTax
    ? flCountySurtaxRate(deal.buyer?.county)
    : null
  const countySurtaxRate = liveRate ?? deal.countySurtaxRate

  const totals = computeDealTotals({
    salePrice: deal.salePrice,
    collectTax: deal.collectTax,
    stateTaxRate: deal.stateTaxRate,
    countySurtaxRate,
    surtaxCap: deal.surtaxCap,
    depositCredit: deal.depositCredit,
    lineItems: deal.lineItems,
    trades: deal.trades,
  })
  const now = new Date()

  try {
    const funded = await prisma.$transaction(async (tx) => {
      // Backup drafts on the same car are allowed, so re-check INSIDE the
      // transaction that nobody sold it first.
      const vehicle = await tx.vehicle.findUnique({
        where: { id: deal.vehicleId },
        select: { inventoryStatus: true },
      })
      if (!vehicle) throw new Error('FUND_VEHICLE_MISSING')
      if (vehicle.inventoryStatus === 'sold') throw new Error('FUND_VEHICLE_SOLD')
      const alreadyFunded = await tx.deal.findFirst({
        where: { vehicleId: deal.vehicleId, status: 'funded' },
        select: { id: true },
      })
      if (alreadyFunded) throw new Error('FUND_VEHICLE_SOLD')

      const updated = await tx.deal.update({
        where: { id },
        data: {
          status: 'funded', fundedAt: now,
          countySurtaxRate,
          taxAmount: totals.taxAmount, otdTotal: totals.otdTotal,
        },
      })
      // Retail only — wholesale buyers are Businesses: no contact promotion,
      // and the (contact-centric) opportunity is left untouched.
      if (!isWholesale && deal.buyerContactId) {
        await tx.contact.update({
          where: { id: deal.buyerContactId },
          data: { contactType: 'customer' },
        })
        if (deal.opportunityId) {
          const opp = await tx.opportunity.findUnique({ where: { id: deal.opportunityId } })
          if (opp && !opp.wonAt && !opp.lostAt) {
            await tx.opportunity.update({ where: { id: deal.opportunityId }, data: { wonAt: now } })
          }
        }
      }
      await tx.vehicle.update({
        where: { id: deal.vehicleId },
        data: { inventoryStatus: 'sold' },
      })
      await tx.activityLog.create({
        data: {
          entityType: 'deal', entityId: id, action: 'funded', actorId: user.id,
          details: {
            dealNumber: deal.dealNumber, vehicleId: deal.vehicleId,
            buyerContactId: deal.buyerContactId, businessBuyerId: deal.businessBuyerId,
            otdTotal: totals.otdTotal,
          },
        },
      })
      return updated
    })

    return NextResponse.json({ deal: funded, totals })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : ''
    if (msg === 'FUND_VEHICLE_SOLD') {
      return NextResponse.json({ error: 'This vehicle was already sold on another deal' }, { status: 409 })
    }
    if (msg === 'FUND_VEHICLE_MISSING') {
      return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 })
    }
    throw e
  }
}
