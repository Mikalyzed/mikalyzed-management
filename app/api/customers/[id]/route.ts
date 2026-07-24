import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, requireRole } from '@/lib/auth'

// Customer profiles carry PII (SSN, DOB, income) — sales-side roles only
// (admin passes implicitly via requireRole).
function customerAccess(role: string) {
  return requireRole(role, ['sales', 'sales_manager'])
}

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
  if (!customerAccess(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

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
        select: {
          id: true, firstName: true, lastName: true,
          phone: true, homePhone: true, workPhone: true, email: true,
          leadType: true, leadSource: true, inquiryType: true,
        },
      })
    : null

  // Vehicles this contact purchased = won opportunities with a vehicle
  // attached UNION funded deals (deals started directly — via Start Deal /
  // the deals page — have no opportunity and would otherwise never appear).
  const fundedDeals = await prisma.deal.findMany({
    where: { buyerContactId: id, status: 'funded' },
    select: {
      fundedAt: true,
      vehicle: { select: { id: true, stockNumber: true, year: true, make: true, model: true } },
    },
  })

  const purchasedById = new Map<string, {
    id: string; stockNumber: string; year: number | null; make: string; model: string
    wonAt: Date | string | null; value: number | null
  }>()
  for (const o of contact.opportunities) {
    if (o.wonAt && o.vehicle) {
      purchasedById.set(o.vehicle.id, {
        id: o.vehicle.id, stockNumber: o.vehicle.stockNumber,
        year: o.vehicle.year, make: o.vehicle.make, model: o.vehicle.model,
        wonAt: o.wonAt, value: o.value,
      })
    }
  }
  for (const d of fundedDeals) {
    if (!purchasedById.has(d.vehicle.id)) {
      purchasedById.set(d.vehicle.id, {
        id: d.vehicle.id, stockNumber: d.vehicle.stockNumber,
        year: d.vehicle.year, make: d.vehicle.make, model: d.vehicle.model,
        wonAt: d.fundedAt, value: null,
      })
    }
  }
  const purchasedVehicles = [...purchasedById.values()]

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
  if (!customerAccess(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json()

  // Same SSN rule as contact creation: digits only, exactly 9 (or clearing).
  if ('ssn' in body && body.ssn != null && body.ssn !== '') {
    const digits = String(body.ssn).replace(/\D/g, '')
    if (digits.length !== 9) {
      return NextResponse.json({ error: 'SSN must be exactly 9 digits' }, { status: 400 })
    }
    body.ssn = digits
  }

  const allowed = [
    'firstName', 'lastName', 'email', 'phone', 'secondaryPhone',
    'dateOfBirth', 'contactType', 'address', 'city', 'state', 'zip', 'country',
    'source', 'tags', 'notes',
    // Identity
    'salutation', 'middleName', 'nameSuffix', 'nickname',
    'gender', 'ssn', 'idType', 'idState', 'idNo', 'idIssuedDate', 'idExpirationDate',
    'homePhone', 'workPhone',
    // Residence + previous address (deal-jacket / credit-app fields)
    'county', 'residenceType', 'rentMortgage', 'lengthAtAddressYears', 'lengthAtAddressMonths',
    'prevStreet', 'prevCity', 'prevState', 'prevZip', 'prevCounty',
    'prevResidenceType', 'prevRentMortgage', 'prevLengthYears', 'prevLengthMonths',
    // Lead pipeline
    'leadType', 'leadSource', 'inquiryType', 'customerStatus', 'cashDown', 'salesRepId', 'isInShowroom',
    // Employment (primary + secondary)
    'employmentType', 'employerName', 'employerPhone', 'employerAddress',
    'employerYears', 'employerMonths', 'incomeType', 'employerMonthlyIncome',
    'employment2Type', 'employer2Name', 'employer2Phone',
    'employer2Years', 'employer2Months', 'income2Type', 'employer2MonthlyIncome',
    // Referrer
    'referrerName', 'referrerPhone', 'referrerEmail', 'referrerAddress', 'referrerContactId',
    // Co-buyer
    'coBuyerContactId',
    'coBuyerRelationship',
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
