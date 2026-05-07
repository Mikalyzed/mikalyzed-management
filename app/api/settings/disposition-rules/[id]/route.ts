import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, requireRole } from '@/lib/auth'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!requireRole(user.role, ['admin'])) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()
  const { currentStageId, moveToStageId, enabled, description, sortOrder } = body

  const existing = await prisma.dispositionStageRule.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Rule not found' }, { status: 404 })

  // Validate any stage change is in the same pipeline
  const stagesToCheck: string[] = []
  if (moveToStageId !== undefined && moveToStageId !== null) stagesToCheck.push(moveToStageId)
  if (currentStageId !== undefined && currentStageId !== null) stagesToCheck.push(currentStageId)
  if (stagesToCheck.length > 0) {
    const stages = await prisma.pipelineStage.findMany({
      where: { pipelineId: existing.pipelineId, id: { in: stagesToCheck } },
      select: { id: true },
    })
    const found = new Set(stages.map(s => s.id))
    for (const sId of stagesToCheck) {
      if (!found.has(sId)) {
        return NextResponse.json({ error: 'Stage is not in this pipeline' }, { status: 400 })
      }
    }
  }

  const data: Record<string, unknown> = {}
  if (currentStageId !== undefined) data.currentStageId = currentStageId || null
  if (moveToStageId !== undefined) data.moveToStageId = moveToStageId
  if (enabled !== undefined) data.enabled = !!enabled
  if (description !== undefined) data.description = description || null
  if (sortOrder !== undefined) data.sortOrder = sortOrder

  const updated = await prisma.dispositionStageRule.update({
    where: { id },
    data,
    include: {
      pipeline: { select: { id: true, name: true, color: true } },
      disposition: { select: { id: true, name: true } },
      currentStage: { select: { id: true, name: true, type: true } },
      moveToStage: { select: { id: true, name: true, type: true } },
    },
  })

  return NextResponse.json({ rule: updated })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!requireRole(user.role, ['admin'])) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const { id } = await params
  await prisma.dispositionStageRule.delete({ where: { id } }).catch(() => {})
  return NextResponse.json({ success: true })
}
