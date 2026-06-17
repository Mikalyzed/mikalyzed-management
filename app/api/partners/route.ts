import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

/**
 * Partners API — dealership business entities (vendors, lenders, lienholders, etc.).
 *
 * GET — list / search active partners. Anyone authenticated may read. Supports:
 *   ?category=vendor     filter to partners carrying the given category
 *   ?search=foo          case-insensitive prefix match on company_name
 *   ?take=25             limit (default 25, max 100)
 *
 * POST — create a new partner. Admin only.
 */

const VALID_CATEGORIES = [
  'dealer_or_wholesaler',
  'flooring',
  'insurance',
  'lender',
  'lienholder',
  'service_or_warranty',
  'repo',
  'vendor',
  'rebate_vendor',
  'tax_and_fee',
]

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category')?.trim() || null
  const search = searchParams.get('search')?.trim() || ''
  const takeRaw = parseInt(searchParams.get('take') || '25', 10)
  const take = Math.min(Math.max(1, Number.isFinite(takeRaw) ? takeRaw : 25), 100)

  const where: any = { archivedAt: null }
  if (category) where.categories = { has: category }
  if (search) where.companyName = { contains: search, mode: 'insensitive' }

  const partners = await prisma.partner.findMany({
    where,
    orderBy: { companyName: 'asc' },
    take,
    select: {
      id: true, companyName: true, companyAlias: true,
      phone: true, contactName: true, contactEmail: true,
      categories: true,
    },
  })
  return NextResponse.json({ partners })
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only — only admins can add new Partners' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const companyName = typeof body.companyName === 'string' ? body.companyName.trim() : ''
  if (!companyName) return NextResponse.json({ error: 'companyName required' }, { status: 400 })
  if (companyName.length > 160) {
    return NextResponse.json({ error: 'companyName too long (max 160 chars)' }, { status: 400 })
  }

  const incoming: unknown[] = Array.isArray(body.categories) ? body.categories : []
  const categories: string[] = Array.from(new Set(
    incoming
      .map((c) => typeof c === 'string' ? c.trim() : '')
      .filter((c): c is string => c.length > 0 && VALID_CATEGORIES.includes(c))
  ))

  // Pull every optional field, defaulting unknowns to null.
  const str = (k: string): string | null => {
    const raw = (body as Record<string, unknown>)[k]
    if (typeof raw !== 'string') return null
    const t = raw.trim()
    return t.length > 0 ? t : null
  }

  const created = await prisma.partner.create({
    data: {
      companyName,
      categories,
      companyAlias:     str('companyAlias'),
      dealerNo:         str('dealerNo'),
      phone:            str('phone'),
      phoneAlternative: str('phoneAlternative'),
      fax:              str('fax'),
      licenseNo:        str('licenseNo'),
      ein:              str('ein'),
      salesTaxLicense:  str('salesTaxLicense'),
      lienCode:         str('lienCode'),
      contactName:            str('contactName'),
      contactPhone:           str('contactPhone'),
      contactCell:            str('contactCell'),
      contactAddress:         str('contactAddress'),
      contactEmail:           str('contactEmail'),
      contactLossPayeeAddress: str('contactLossPayeeAddress'),
      contactAlias:           str('contactAlias'),
      shippingName:          str('shippingName'),
      shippingBusinessPhone: str('shippingBusinessPhone'),
      shippingAddress:       str('shippingAddress'),
      createdById: user.id,
    },
    select: {
      id: true, companyName: true, categories: true,
    },
  })

  // Activity log so partner creations are auditable.
  try {
    await prisma.activityLog.create({
      data: {
        entityType: 'partner',
        entityId: created.id,
        action: 'partner_created',
        actorId: user.id,
        details: { companyName: created.companyName, categories: created.categories },
      },
    })
  } catch {}

  return NextResponse.json({ partner: created })
}
