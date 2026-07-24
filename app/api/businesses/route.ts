import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, requireRole } from '@/lib/auth'

// Business buyers (wholesale deals) — same money gate as the deal desk.
function dealAccess(role: string) {
  return requireRole(role, ['sales_manager'])
}

/** GET /api/businesses?search= — reusable business-buyer list. */
export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!dealAccess(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search')?.trim()

  const businesses = await prisma.business.findMany({
    where: search
      ? {
          OR: [
            { businessName: { contains: search, mode: 'insensitive' } },
            { tradeName: { contains: search, mode: 'insensitive' } },
            { taxId: { contains: search, mode: 'insensitive' } },
          ],
        }
      : undefined,
    select: { id: true, businessName: true, tradeName: true, city: true, state: true, phone: true },
    orderBy: { businessName: 'asc' },
    take: 25,
  })
  return NextResponse.json({ businesses })
}

/** POST /api/businesses — create (name is enough to start). */
export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!dealAccess(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const businessName = typeof body.businessName === 'string' ? body.businessName.trim() : ''
  if (!businessName) return NextResponse.json({ error: 'businessName is required' }, { status: 400 })

  const business = await prisma.business.create({
    data: { businessName },
    select: { id: true, businessName: true },
  })
  return NextResponse.json({ business }, { status: 201 })
}
