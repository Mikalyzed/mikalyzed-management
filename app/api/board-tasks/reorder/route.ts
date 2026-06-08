import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, requireRole } from '@/lib/auth'

export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!requireRole(user.role, ['admin', 'content'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { orderedIds } = await request.json()
  if (!Array.isArray(orderedIds)) return NextResponse.json({ error: 'orderedIds required' }, { status: 400 })

  await prisma.$transaction(
    orderedIds.map((id: string, index: number) =>
      prisma.task.update({ where: { id }, data: { sortOrder: index } })
    )
  )

  return NextResponse.json({ ok: true })
}
