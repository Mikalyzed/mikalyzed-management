import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

// Reorder ONE mechanic's queue without disturbing the others.
// `orderedIds` are that mechanic's vehicle ids in the new order. We take the
// SAME set of priority slots those cars currently occupy and reassign them in
// the new order — so the mechanic's relative order changes while every other
// car keeps its global position (the recon column stays coherent).
export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { orderedIds } = await request.json() as { orderedIds: string[] }
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return NextResponse.json({ error: 'orderedIds required' }, { status: 400 })
  }

  const stages = await prisma.vehicleStage.findMany({
    where: { vehicleId: { in: orderedIds }, stage: 'mechanic', status: { notIn: ['done', 'skipped'] } },
    select: { vehicleId: true, priority: true },
  })
  // The slots this mechanic's cars occupy, ascending. Fallback to indices if a
  // car had no live mechanic stage (shouldn't happen for a scheduled lane).
  const slots = stages.map(s => s.priority).sort((a, b) => a - b)

  await prisma.$transaction(
    orderedIds.map((vehicleId, i) =>
      prisma.vehicleStage.updateMany({
        where: { vehicleId, stage: 'mechanic', status: { notIn: ['done', 'skipped'] } },
        data: { priority: slots[i] ?? i },
      })
    )
  )

  return NextResponse.json({ ok: true })
}
