import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, requireRole } from '@/lib/auth'

export async function GET(request: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!requireRole(user.role, ['admin'])) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const pipelineId = searchParams.get('pipelineId')

  const rules = await prisma.dispositionStageRule.findMany({
    where: pipelineId ? { pipelineId } : {},
    include: {
      pipeline: { select: { id: true, name: true, color: true } },
      disposition: { select: { id: true, name: true } },
      currentStage: { select: { id: true, name: true, type: true } },
      moveToStage: { select: { id: true, name: true, type: true } },
    },
    orderBy: [{ pipelineId: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
  })

  return NextResponse.json({ rules })
}

export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!requireRole(user.role, ['admin'])) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const body = await request.json()
  const { pipelineId, dispositionId, currentStageId, moveToStageId, enabled, description, sortOrder } = body

  if (!pipelineId || !dispositionId || !moveToStageId) {
    return NextResponse.json({ error: 'pipelineId, dispositionId, and moveToStageId required' }, { status: 400 })
  }

  // Validate stages belong to the pipeline
  const stages = await prisma.pipelineStage.findMany({
    where: { pipelineId, id: { in: [moveToStageId, ...(currentStageId ? [currentStageId] : [])] } },
    select: { id: true },
  })
  const found = new Set(stages.map(s => s.id))
  if (!found.has(moveToStageId)) {
    return NextResponse.json({ error: 'moveToStageId is not in this pipeline' }, { status: 400 })
  }
  if (currentStageId && !found.has(currentStageId)) {
    return NextResponse.json({ error: 'currentStageId is not in this pipeline' }, { status: 400 })
  }

  // Check for duplicate (same pipeline + disposition + currentStage)
  const existing = await prisma.dispositionStageRule.findFirst({
    where: { pipelineId, dispositionId, currentStageId: currentStageId || null },
    select: { id: true },
  })
  if (existing) {
    return NextResponse.json({ error: 'A rule with this pipeline + disposition + current stage already exists' }, { status: 409 })
  }

  const rule = await prisma.dispositionStageRule.create({
    data: {
      pipelineId,
      dispositionId,
      currentStageId: currentStageId || null,
      moveToStageId,
      enabled: enabled !== undefined ? !!enabled : true,
      description: description || null,
      sortOrder: typeof sortOrder === 'number' ? sortOrder : 0,
    },
    include: {
      pipeline: { select: { id: true, name: true, color: true } },
      disposition: { select: { id: true, name: true } },
      currentStage: { select: { id: true, name: true, type: true } },
      moveToStage: { select: { id: true, name: true, type: true } },
    },
  })

  return NextResponse.json({ rule }, { status: 201 })
}
