import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function GET() {
  const user = await getSessionUser()
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const [requested, sourced, ordered, received] = await Promise.all([
    prisma.part.count({ where: { status: 'requested' } }),
    prisma.part.count({ where: { status: 'sourced' } }),
    prisma.part.count({ where: { status: 'ordered' } }),
    prisma.part.count({ where: { status: 'received' } })
  ])

  const pending = requested + ordered // requested + ordered = pending

  return NextResponse.json({
    requested,
    sourced,
    ordered,
    received,
    pending,
    total: requested + sourced + ordered + received
  })
}