import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dispositions = await prisma.disposition.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: {
      pipeline: { select: { id: true, name: true } },
      moveToStage: { select: { id: true, name: true } },
    },
  })

  return NextResponse.json({ dispositions })
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { name, pipelineId, moveToStageId, followUpMinutes, color } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })

  const maxOrder = await prisma.disposition.aggregate({ _max: { sortOrder: true } })

  const disposition = await prisma.disposition.create({
    data: {
      name: name.trim(),
      pipelineId: pipelineId || null,
      moveToStageId: moveToStageId || null,
      followUpMinutes: followUpMinutes ? parseInt(followUpMinutes) : null,
      color: color || null,
      sortOrder: (maxOrder._max.sortOrder || 0) + 1,
    },
  })

  return NextResponse.json({ disposition })
}

export async function PUT(req: NextRequest) {
  const user = await getSessionUser()
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { id, name, pipelineId, moveToStageId, followUpMinutes, color, isActive } = await req.json()
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  const disposition = await prisma.disposition.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(pipelineId !== undefined && { pipelineId: pipelineId || null }),
      ...(moveToStageId !== undefined && { moveToStageId: moveToStageId || null }),
      ...(followUpMinutes !== undefined && { followUpMinutes: followUpMinutes ? parseInt(followUpMinutes) : null }),
      ...(color !== undefined && { color: color || null }),
      ...(isActive !== undefined && { isActive }),
    },
  })

  return NextResponse.json({ disposition })
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser()
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { id } = await req.json()
  await prisma.disposition.delete({ where: { id } })

  return NextResponse.json({ success: true })
}
