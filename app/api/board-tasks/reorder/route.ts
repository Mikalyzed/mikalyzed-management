import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { orderedIds } = await request.json()
  if (!Array.isArray(orderedIds)) return NextResponse.json({ error: 'orderedIds required' }, { status: 400 })

  await prisma.$transaction(
    orderedIds.map((id: string, index: number) =>
      prisma.task.update({ where: { id }, data: { sortOrder: index } })
    )
  )

  return NextResponse.json({ ok: true })
}
