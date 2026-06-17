import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

/**
 * Dealership-wide list of Cost Add Category quick-picks.
 * GET — anyone authenticated may list active options
 * POST — admin only; idempotent (revives archived row if name already exists)
 */

export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const categories = await prisma.costAddCategory.findMany({
    where: { archivedAt: null },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  })
  return NextResponse.json({ categories })
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only — only admins can add Cost Add categories' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const rawName = typeof body.name === 'string' ? body.name.trim() : ''
  if (!rawName) return NextResponse.json({ error: 'name required' }, { status: 400 })
  if (rawName.length > 80) return NextResponse.json({ error: 'name too long (max 80 chars)' }, { status: 400 })

  const existing = await prisma.costAddCategory.findUnique({ where: { name: rawName } })
  if (existing) {
    if (existing.archivedAt) {
      const revived = await prisma.costAddCategory.update({
        where: { id: existing.id },
        data: { archivedAt: null },
        select: { id: true, name: true },
      })
      return NextResponse.json({ category: revived, revived: true })
    }
    return NextResponse.json({ category: { id: existing.id, name: existing.name }, existed: true })
  }

  const created = await prisma.costAddCategory.create({
    data: { name: rawName, createdById: user.id },
    select: { id: true, name: true },
  })
  return NextResponse.json({ category: created, created: true })
}
