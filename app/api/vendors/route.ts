import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('search')?.trim() || ''
  const limit = parseInt(searchParams.get('limit') || '20')

  const where = q
    ? { isActive: true, name: { contains: q, mode: 'insensitive' as const } }
    : { isActive: true }

  const vendors = await prisma.vendor.findMany({
    where,
    orderBy: { name: 'asc' },
    take: Math.min(limit, 100),
    select: { id: true, name: true, phone: true, notes: true },
  })

  return NextResponse.json({ vendors })
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, phone, notes } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })

  // Case-insensitive uniqueness check
  const trimmed = name.trim()
  const existing = await prisma.vendor.findFirst({
    where: { name: { equals: trimmed, mode: 'insensitive' } },
    select: { id: true, name: true, phone: true, notes: true },
  })
  if (existing) return NextResponse.json({ vendor: existing, existed: true })

  const vendor = await prisma.vendor.create({
    data: {
      name: trimmed,
      phone: phone?.trim() || null,
      notes: notes?.trim() || null,
    },
    select: { id: true, name: true, phone: true, notes: true },
  })

  return NextResponse.json({ vendor, existed: false })
}
