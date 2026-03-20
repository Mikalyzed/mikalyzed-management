import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function GET(request: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search')
  const source = searchParams.get('source')
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
  const { firstName, lastName, email, phone, secondaryPhone, address, city, state, zip, source, tags, notes } = body

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

  const contact = await prisma.contact.create({
    data: {
      firstName, lastName, email, phone, secondaryPhone,
      address, city, state, zip,
      source: source || 'other',
      tags: tags || [],
      notes,
      createdById: user.id,
    },
  })

  return NextResponse.json(contact, { status: 201 })
}
