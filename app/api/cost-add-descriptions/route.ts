import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

/**
 * Dealership-wide list of common Cost Add description quick-picks.
 * GET — anyone authenticated may list active options
 * POST — admin only; idempotent (no-op if name already exists, revives archived)
 */

export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const descriptions = await prisma.costAddDescription.findMany({
    where: { archivedAt: null },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  })
  return NextResponse.json({ descriptions })
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only — only admins can add options to the Cost Add description list' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const rawName = typeof body.name === 'string' ? body.name.trim() : ''
  if (!rawName) return NextResponse.json({ error: 'name required' }, { status: 400 })
  if (rawName.length > 80) return NextResponse.json({ error: 'name too long (max 80 chars)' }, { status: 400 })

  // Idempotent: if name exists, revive (clear archivedAt) or return existing.
  const existing = await prisma.costAddDescription.findUnique({ where: { name: rawName } })
  if (existing) {
    if (existing.archivedAt) {
      const revived = await prisma.costAddDescription.update({
        where: { id: existing.id },
        data: { archivedAt: null },
        select: { id: true, name: true },
      })
      return NextResponse.json({ description: revived, revived: true })
    }
    return NextResponse.json({ description: { id: existing.id, name: existing.name }, existed: true })
  }

  const created = await prisma.costAddDescription.create({
    data: { name: rawName, createdById: user.id },
    select: { id: true, name: true },
  })
  return NextResponse.json({ description: created, created: true })
}
