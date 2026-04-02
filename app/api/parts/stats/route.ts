import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function GET() {
  const user = await getSessionUser()
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const [requested, sourced, ready_to_order, ordered, received] = await Promise.all([
    prisma.part.count({ where: { status: 'requested' } }),
    prisma.part.count({ where: { status: 'sourced' } }),
    prisma.part.count({ where: { status: 'ready_to_order' } }),
    prisma.part.count({ where: { status: 'ordered' } }),
    prisma.part.count({ where: { status: 'received' } })
  ])

  const pending = requested + sourced + ready_to_order + ordered

  return NextResponse.json({
    requested,
    sourced,
    ready_to_order,
    ordered,
    received,
    pending,
    total: requested + sourced + ready_to_order + ordered + received
  })
}
