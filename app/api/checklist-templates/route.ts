import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const stage = searchParams.get('stage')

  const where: any = { isActive: true }
  if (stage) where.stage = stage

  const templates = await prisma.checklistTemplate.findMany({
    where,
    orderBy: [{ stage: 'asc' }, { isDefault: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  })

  return NextResponse.json({ templates })
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { stage, name, items = [], isDefault = false } = await req.json()
  if (!stage?.trim() || !name?.trim()) {
    return NextResponse.json({ error: 'Stage and name are required' }, { status: 400 })
  }

  // If marking as default, unset any existing default for this stage
  if (isDefault) {
    await prisma.checklistTemplate.updateMany({
      where: { stage, isDefault: true },
      data: { isDefault: false },
    })
  }

  const template = await prisma.checklistTemplate.create({
    data: {
      stage: stage.trim(),
      name: name.trim(),
      items,
      isDefault,
    },
  })

  return NextResponse.json({ template })
}
