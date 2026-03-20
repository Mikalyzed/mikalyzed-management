import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function GET(request: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const stage = searchParams.get('stage')

  const where: Record<string, unknown> = { isActive: true }
  if (stage) where.stage = stage

  const templates = await prisma.stageTemplate.findMany({
    where,
    orderBy: [{ stage: 'asc' }, { sortOrder: 'asc' }],
  })

  return NextResponse.json(templates)
}

export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { stage, name, checklist } = await request.json()
  if (!stage || !name) return NextResponse.json({ error: 'Stage and name required' }, { status: 400 })

  const maxOrder = await prisma.stageTemplate.findFirst({
    where: { stage },
    orderBy: { sortOrder: 'desc' },
  })

  const template = await prisma.stageTemplate.create({
    data: {
      stage,
      name,
      checklist: checklist || [],
      sortOrder: (maxOrder?.sortOrder ?? -1) + 1,
    },
  })

  return NextResponse.json(template, { status: 201 })
}
