import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { id } = await params
  const body = await req.json()

  const existing = await prisma.checklistTemplate.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const data: Record<string, unknown> = {}
  if (body.name !== undefined) data.name = body.name.trim()
  if (body.items !== undefined) data.items = body.items
  if (body.isActive !== undefined) data.isActive = body.isActive

  // Handle default toggle: only one default per stage
  if (body.isDefault === true && !existing.isDefault) {
    await prisma.checklistTemplate.updateMany({
      where: { stage: existing.stage, isDefault: true },
      data: { isDefault: false },
    })
    data.isDefault = true
  } else if (body.isDefault === false) {
    data.isDefault = false
  }

  const template = await prisma.checklistTemplate.update({ where: { id }, data })
  return NextResponse.json({ template })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { id } = await params
  await prisma.checklistTemplate.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
