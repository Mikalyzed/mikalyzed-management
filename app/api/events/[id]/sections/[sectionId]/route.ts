import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; sectionId: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sectionId } = await params
  const body = await request.json()
  const { name } = body

  const section = await prisma.eventSection.update({
    where: { id: sectionId },
    data: { name },
  })

  return NextResponse.json(section)
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; sectionId: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { sectionId } = await params
  await prisma.eventSection.delete({ where: { id: sectionId } })
  return NextResponse.json({ success: true })
}
