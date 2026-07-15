import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

/**
 * GET /api/customers/:id — admin-facing customer profile payload.
 *
 * Returns the full Contact record plus the joined data the profile page
 * needs to render in one round trip: vehicle interests (with the linked
 * vehicle when set), every opportunity for pipeline context, the assigned
 * sales rep's name, and any purchased vehicles (Vehicle rows linked via
 * a won opportunity).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const contact = await prisma.contact.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, name: true } },
      vehicleInterests: {
        include: {
          vehicle: {
            select: {
              id: true, stockNumber: true, year: true, make: true, model: true,
              color: true, askingPrice: true, status: true, location: true, mileage: true, vehicleInfo: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
      opportunities: {
        include: {
          pipeline: { select: { id: true, name: true, color: true } },
          stage: { select: { id: true, name: true, type: true } },
          assignee: { select: { id: true, name: true } },
          vehicle: {
            select: { id: true, stockNumber: true, year: true, make: true, model: true, status: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  })
  if (!contact) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const salesRep = contact.salesRepId
    ? await prisma.user.findUnique({ where: { id: contact.salesRepId }, select: { id: true, name: true } })
    : null

  // Co-buyer — separate fetch so the page can show their name + contact
  // info inline without a second round trip.
  const coBuyer = contact.coBuyerContactId
    ? await prisma.contact.findUnique({
        where: { id: contact.coBuyerContactId },
        select: { id: true, firstName: true, lastName: true, phone: true, email: true },
      })
    : null

  // Vehicles this contact purchased = won opportunities with a vehicle attached.
  const purchasedVehicles = contact.opportunities
    .filter(o => o.wonAt && o.vehicle)
    .map(o => ({
      id: o.vehicle!.id,
      stockNumber: o.vehicle!.stockNumber,
      year: o.vehicle!.year,
      make: o.vehicle!.make,
      model: o.vehicle!.model,
      wonAt: o.wonAt,
      value: o.value,
    }))

  return NextResponse.json({ contact, salesRep, coBuyer, purchasedVehicles })
}

/**
 * PATCH /api/customers/:id — partial update covering ALL customer-side
 * fields (identity, employment, referrer, pipeline status, etc.).
 * Distinct from /api/contacts/:id PATCH which only handles the core
 * messaging-thread fields.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()

  const allowed = [
    'firstName', 'lastName', 'email', 'phone', 'secondaryPhone',
    'dateOfBirth', 'contactType', 'address', 'city', 'state', 'zip', 'country',
    'source', 'tags', 'notes',
    // Identity
    'gender', 'ssn', 'idType', 'idState', 'idNo', 'idIssuedDate', 'idExpirationDate',
    'homePhone', 'workPhone',
    // Lead pipeline
    'leadType', 'leadSource', 'inquiryType', 'customerStatus', 'cashDown', 'salesRepId', 'isInShowroom',
    // Employment
    'employerName', 'employerPhone', 'employerAddress', 'employerYears', 'employerMonthlyIncome',
    // Referrer
    'referrerName', 'referrerPhone', 'referrerEmail', 'referrerAddress', 'referrerContactId',
    // Co-buyer
    'coBuyerContactId',
  ]
  const dateFields = new Set(['dateOfBirth', 'idIssuedDate', 'idExpirationDate'])
  const data: Record<string, unknown> = {}
  for (const k of allowed) {
    if (!(k in body)) continue
    const v = body[k]
    if (dateFields.has(k)) {
      data[k] = v === null || v === '' ? null : new Date(v as string)
    } else if (v === '') {
      data[k] = null
    } else {
      data[k] = v
    }
  }

  const updated = await prisma.contact.update({ where: { id }, data })
  return NextResponse.json(updated)
}
