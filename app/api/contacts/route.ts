import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, canSeeAllLeads } from '@/lib/auth'

export async function GET(request: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search')
  const source = searchParams.get('source')
  const contactType = searchParams.get('contactType')
  const limit = parseInt(searchParams.get('limit') || '50')
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
  if (source) where.source = source
  if (contactType) where.contactType = contactType

  // Sales reps see only contacts with at least one opportunity assigned to them
  if (!canSeeAllLeads(user.role)) {
    where.opportunities = { some: { assigneeId: user.id } }
  }

  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      include: {
        _count: { select: { opportunities: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.contact.count({ where }),
  ])

  return NextResponse.json({ contacts, total })
}

export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const {
    firstName, lastName, email, phone, secondaryPhone, address, city, state, zip,
    source, tags, notes, contactType, dateOfBirth,
    // Identity (DealerCenter Buyer Info)
    gender, ssn, idType, idState, idNo, idIssuedDate, idExpirationDate,
    homePhone, workPhone,
    // Lead pipeline
    leadType, leadSource, customerStatus, cashDown, salesRepId, isInShowroom,
    // Employment
    employerName, employerPhone, employerAddress, employerYears, employerMonthlyIncome,
    // Referrer
    referrerName, referrerContactId,
  } = body

  if (!firstName || !lastName) {
    return NextResponse.json({ error: 'First and last name required' }, { status: 400 })
  }

  // Check for existing contact by phone or email
  if (phone || email) {
    const existing = await prisma.contact.findFirst({
      where: {
        OR: [
          ...(phone ? [{ phone }] : []),
          ...(email ? [{ email }] : []),
        ],
      },
    })
    if (existing) {
      return NextResponse.json({ error: 'Contact with this phone or email already exists', existingId: existing.id }, { status: 409 })
    }
  }

  const parseDate = (v: unknown): Date | null => {
    if (!v || typeof v !== 'string') return null
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const trimStr = (v: unknown): string | null => {
    if (typeof v !== 'string') return null
    const t = v.trim()
    return t.length > 0 ? t : null
  }
  const num = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null
    const n = typeof v === 'number' ? v : parseFloat(String(v))
    return Number.isFinite(n) ? n : null
  }
  const int = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null
    const n = typeof v === 'number' ? v : parseInt(String(v), 10)
    return Number.isFinite(n) ? Math.trunc(n) : null
  }

  const contact = await prisma.contact.create({
    data: {
      firstName, lastName,
      email: trimStr(email) ?? undefined,
      phone: trimStr(phone) ?? undefined,
      secondaryPhone: trimStr(secondaryPhone) ?? undefined,
      address: trimStr(address) ?? undefined,
      city: trimStr(city) ?? undefined,
      state: trimStr(state) ?? undefined,
      zip: trimStr(zip) ?? undefined,
      source: source || 'other',
      tags: tags || [],
      notes: trimStr(notes) ?? undefined,
      contactType: typeof contactType === 'string' && contactType ? contactType : undefined,
      dateOfBirth: parseDate(dateOfBirth) ?? undefined,
      // Identity
      gender: trimStr(gender) ?? undefined,
      ssn: trimStr(ssn) ?? undefined,
      idType: trimStr(idType) ?? undefined,
      idState: trimStr(idState) ?? undefined,
      idNo: trimStr(idNo) ?? undefined,
      idIssuedDate: parseDate(idIssuedDate) ?? undefined,
      idExpirationDate: parseDate(idExpirationDate) ?? undefined,
      homePhone: trimStr(homePhone) ?? undefined,
      workPhone: trimStr(workPhone) ?? undefined,
      // Lead pipeline
      leadType: trimStr(leadType) ?? undefined,
      leadSource: trimStr(leadSource) ?? undefined,
      customerStatus: trimStr(customerStatus) ?? undefined,
      cashDown: num(cashDown) ?? undefined,
      salesRepId: trimStr(salesRepId) ?? undefined,
      isInShowroom: typeof isInShowroom === 'boolean' ? isInShowroom : undefined,
      // Employment
      employerName: trimStr(employerName) ?? undefined,
      employerPhone: trimStr(employerPhone) ?? undefined,
      employerAddress: trimStr(employerAddress) ?? undefined,
      employerYears: int(employerYears) ?? undefined,
      employerMonthlyIncome: num(employerMonthlyIncome) ?? undefined,
      // Referrer
      referrerName: trimStr(referrerName) ?? undefined,
      referrerContactId: trimStr(referrerContactId) ?? undefined,
      createdById: user.id,
    },
  })

  return NextResponse.json(contact, { status: 201 })
}
