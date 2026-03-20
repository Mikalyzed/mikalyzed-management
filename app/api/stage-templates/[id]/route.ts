import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { id } = await params
  const body = await request.json()
  const data: Record<string, unknown> = {}
  if (body.name !== undefined) data.name = body.name
  if (body.checklist !== undefined) data.checklist = body.checklist
  if (body.isActive !== undefined) data.isActive = body.isActive
  if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder

  const template = await prisma.stageTemplate.update({ where: { id }, data })
  return NextResponse.json(template)
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { id } = await params
  await prisma.stageTemplate.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
