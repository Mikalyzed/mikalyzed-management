import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const pipeline = await prisma.pipeline.findUnique({
    where: { id },
    include: { stages: { orderBy: { sortOrder: 'asc' } } },
  })
  if (!pipeline) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(pipeline)
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { id } = await params
  const body = await request.json()
  const { name, color, isActive, stages } = body

  const data: Record<string, unknown> = {}
  if (name !== undefined) data.name = name
  if (color !== undefined) data.color = color
  if (isActive !== undefined) data.isActive = isActive

  const pipeline = await prisma.pipeline.update({ where: { id }, data })

  // Update stages if provided
  if (stages) {
    // Delete removed stages, upsert existing
    const existingStages = await prisma.pipelineStage.findMany({ where: { pipelineId: id } })
    const incomingIds = stages.filter((s: { id?: string }) => s.id).map((s: { id: string }) => s.id)
    const toDelete = existingStages.filter(s => !incomingIds.includes(s.id))

    for (const del of toDelete) {
      // Move opportunities off deleted stage to first open stage
      const firstOpen = stages.find((s: { type: string }) => s.type === 'open')
      if (firstOpen?.id) {
        await prisma.opportunity.updateMany({
          where: { stageId: del.id },
          data: { stageId: firstOpen.id },
        })
      }
      await prisma.pipelineStage.delete({ where: { id: del.id } })
    }

    for (let i = 0; i < stages.length; i++) {
      const s = stages[i]
      if (s.id) {
        await prisma.pipelineStage.update({
          where: { id: s.id },
          data: { name: s.name, type: s.type || 'open', sortOrder: i, color: s.color || null },
        })
      } else {
        await prisma.pipelineStage.create({
          data: { pipelineId: id, name: s.name, type: s.type || 'open', sortOrder: i, color: s.color || null },
        })
      }
    }
  }

  return NextResponse.json(pipeline)
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { id } = await params
  await prisma.pipeline.update({ where: { id }, data: { isActive: false } })
  return NextResponse.json({ success: true })
}
