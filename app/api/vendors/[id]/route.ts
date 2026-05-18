import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const data: Record<string, unknown> = {}
  if (body.name !== undefined) data.name = body.name.trim()
  if (body.phone !== undefined) data.phone = body.phone?.trim() || null
  if (body.notes !== undefined) data.notes = body.notes?.trim() || null
  if (body.isActive !== undefined) data.isActive = body.isActive

  const vendor = await prisma.vendor.update({ where: { id }, data })
  return NextResponse.json({ vendor })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { id } = await params
  // Soft-delete: mark inactive so historical external_repairs still resolve
  await prisma.vendor.update({ where: { id }, data: { isActive: false } })
  return NextResponse.json({ ok: true })
}
