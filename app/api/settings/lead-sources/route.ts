import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

const DEFAULT_SOURCES = [
  { name: 'Website', key: 'website' },
  { name: 'Autotrader', key: 'autotrader' },
  { name: 'Hemmings', key: 'hemmings' },
  { name: 'Facebook Ads', key: 'facebook' },
  { name: 'CarsForsale', key: 'carsforsale' },
  { name: 'Classic.com', key: 'classic_com' },
  { name: 'Phone Call', key: 'phone_call' },
  { name: 'Walk-In', key: 'walk_in' },
  { name: 'Referral', key: 'referral' },
  { name: 'Other', key: 'other' },
]

export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let sources = await prisma.leadSource.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })

  // Seed defaults if empty
  if (sources.length === 0) {
    await prisma.leadSource.createMany({
      data: DEFAULT_SOURCES.map((s, i) => ({ ...s, sortOrder: i })),
    })
    sources = await prisma.leadSource.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })
  }

  return NextResponse.json({ sources })
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { name } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })

  const key = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_')
  const maxOrder = await prisma.leadSource.aggregate({ _max: { sortOrder: true } })

  const source = await prisma.leadSource.create({
    data: {
      name: name.trim(),
      key,
      sortOrder: (maxOrder._max.sortOrder || 0) + 1,
    },
  })

  return NextResponse.json({ source })
}

export async function PUT(req: NextRequest) {
  const user = await getSessionUser()
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { id, name, isActive } = await req.json()
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  const source = await prisma.leadSource.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(isActive !== undefined && { isActive }),
    },
  })

  return NextResponse.json({ source })
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser()
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { id } = await req.json()
  await prisma.leadSource.delete({ where: { id } })

  return NextResponse.json({ success: true })
}
