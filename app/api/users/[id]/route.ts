import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()

  const data: Record<string, unknown> = {}
  if (body.role) data.role = body.role
  if (body.name) data.name = body.name
  if (body.isActive !== undefined) data.isActive = body.isActive

  const updated = await prisma.user.update({
    where: { id },
    data,
  })

  return NextResponse.json({ user: updated })
}
