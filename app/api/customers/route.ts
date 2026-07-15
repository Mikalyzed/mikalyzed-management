import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { presignGet } from '@/lib/r2'

/**
 * GET /api/customers — master-sheet roster of contacts.
 *
 * Returns the rich payload the DealerCenter-style row needs: identity,
 * lead info, employment summary, and the first interested vehicle with a
 * presigned hero photo URL.  Bulk-fetched in one round of queries so the
 * list stays fast as the contact table grows.
 *
 * Filters:
 *   ?contactType=customer|lead|vendor   exact match
 *   ?status=active_lead|past_customer   derived flag
 *   ?search=<query>                     fuzzy name/phone/email
 */
export async function GET(request: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search')?.trim() || null
  const contactType = searchParams.get('contactType')
  const status = searchParams.get('status')
  const limit = parseInt(searchParams.get('limit') || '100')
  const offset = parseInt(searchParams.get('offset') || '0')

  const where: Record<string, unknown> = {}
  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search } },
    ]
  }
  if (contactType) where.contactType = contactType
  if (status === 'active_lead') {
    where.opportunities = { some: { wonAt: null, lostAt: null } }
  } else if (status === 'past_customer') {
    where.contactType = 'customer'
  }

  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        secondaryPhone: true,
        homePhone: true,
        workPhone: true,
        address: true,
        city: true,
        state: true,
        zip: true,
        dateOfBirth: true,
        contactType: true,
        customerStatus: true,
        leadType: true,
        leadSource: true,
        cashDown: true,
        salesRepId: true,
        createdAt: true,
        tags: true,
        // Employment summary
        employerName: true,
        employerYears: true,
        employerMonthlyIncome: true,
        // First interested vehicle for the list row preview
        vehicleInterests: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            vehicle: {
              select: {
                id: true, stockNumber: true, vin: true, year: true, make: true, model: true,
                askingPrice: true, mileage: true, dateInStock: true,
                mediaAssets: {
                  where: { type: { in: ['exterior', 'interior', 'undercarriage'] } },
                  orderBy: [{ sortOrder: 'asc' }, { uploadedAt: 'desc' }],
                  take: 1,
                  select: { r2Key: true },
                },
              },
            },
          },
        },
        _count: {
          select: {
            opportunities: true,
            vehicleInterests: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.contact.count({ where }),
  ])

  // Bulk: sales-rep names
  const salesRepIds = Array.from(new Set(contacts.map(c => c.salesRepId).filter(Boolean) as string[]))
  const reps = salesRepIds.length > 0
    ? await prisma.user.findMany({ where: { id: { in: salesRepIds } }, select: { id: true, name: true } })
    : []
  const repById = new Map(reps.map(r => [r.id, r.name]))

  // Bulk: purchased vehicle counts via won opportunities
  const contactIds = contacts.map(c => c.id)
  const wonOpps = contactIds.length > 0
    ? await prisma.opportunity.groupBy({
        by: ['contactId'],
        where: {
          contactId: { in: contactIds },
          wonAt: { not: null },
          vehicleId: { not: null },
        },
        _count: { _all: true },
      })
    : []
  const purchasesByContact = new Map(wonOpps.map(p => [p.contactId, p._count._all]))

  // Bulk: presign hero photos for the first interested vehicle.
  // Failures are tolerated — a missing thumbnail just renders as the
  // placeholder silhouette, never blocks the whole list response.
  const heroByVehicleId = new Map<string, string>()
  const heroJobs: Promise<void>[] = []
  for (const c of contacts) {
    const v = c.vehicleInterests[0]?.vehicle
    const r2Key = v?.mediaAssets?.[0]?.r2Key
    if (v && r2Key) {
      heroJobs.push(
        presignGet(r2Key, 60 * 60)
          .then(url => { heroByVehicleId.set(v.id, url) })
          .catch(() => {})
      )
    }
  }
  await Promise.all(heroJobs)

  const enriched = contacts.map(c => {
    const v = c.vehicleInterests[0]?.vehicle ?? null
    const heroUrl = v ? heroByVehicleId.get(v.id) ?? null : null
    return {
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      phone: c.phone,
      secondaryPhone: c.secondaryPhone,
      homePhone: c.homePhone,
      workPhone: c.workPhone,
      address: c.address,
      city: c.city,
      state: c.state,
      zip: c.zip,
      dateOfBirth: c.dateOfBirth,
      contactType: c.contactType,
      customerStatus: c.customerStatus,
      leadType: c.leadType,
      leadSource: c.leadSource,
      cashDown: c.cashDown,
      salesRepId: c.salesRepId,
      salesRepName: c.salesRepId ? repById.get(c.salesRepId) ?? null : null,
      createdAt: c.createdAt,
      tags: c.tags,
      employerName: c.employerName,
      employerYears: c.employerYears,
      employerMonthlyIncome: c.employerMonthlyIncome,
      vehiclesPurchasedCount: purchasesByContact.get(c.id) ?? 0,
      _count: c._count,
      interestedVehicle: v ? {
        id: v.id,
        stockNumber: v.stockNumber,
        vin: v.vin,
        year: v.year,
        make: v.make,
        model: v.model,
        askingPrice: v.askingPrice,
        mileage: v.mileage,
        dateInStock: v.dateInStock,
        heroUrl,
      } : null,
    }
  })

  return NextResponse.json({ customers: enriched, total })
}
