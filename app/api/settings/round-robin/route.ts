import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const pipelineId = searchParams.get('pipelineId')

  if (!pipelineId) return NextResponse.json({ error: 'pipelineId required' }, { status: 400 })

  const weights = await prisma.roundRobinWeight.findMany({
    where: { pipelineId },
    include: { user: { select: { id: true, name: true, role: true, isActive: true } } },
  })

  // Also return all eligible sales users so admin can add them
  const salesUsers = await prisma.user.findMany({
    where: { isActive: true, role: { in: ['sales', 'sales_manager', 'admin'] } },
    select: { id: true, name: true, role: true },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json({ weights, salesUsers })
}

export async function PUT(req: NextRequest) {
  const user = await getSessionUser()
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { pipelineId, weights } = await req.json()
  if (!pipelineId || !Array.isArray(weights)) {
    return NextResponse.json({ error: 'pipelineId and weights array required' }, { status: 400 })
  }

  // Delete existing weights for this pipeline
  await prisma.roundRobinWeight.deleteMany({ where: { pipelineId } })

  // Create new weights
  if (weights.length > 0) {
    await prisma.roundRobinWeight.createMany({
      data: weights.map((w: { userId: string; weight: number }) => ({
        pipelineId,
        userId: w.userId,
        weight: w.weight || 1,
      })),
    })
  }

  return NextResponse.json({ success: true })
}
