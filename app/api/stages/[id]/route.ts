import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json()

  const stage = await prisma.vehicleStage.findUnique({ where: { id } })
  if (!stage) return NextResponse.json({ error: 'Stage not found' }, { status: 404 })

  // Only assigned user or admin
  if (stage.assigneeId !== user.id && user.role !== 'admin') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const data: Record<string, unknown> = {}

  // Update status
  if (body.status) {
    const validTransitions: Record<string, string[]> = {
      pending: ['in_progress'],
      in_progress: ['blocked', 'done'],
      blocked: ['in_progress'],
      done: [],
    }
    if (!validTransitions[stage.status]?.includes(body.status)) {
      return NextResponse.json({ error: `Cannot transition from ${stage.status} to ${body.status}` }, { status: 400 })
    }

    data.status = body.status

    // Handle blocked time tracking
    if (body.status === 'blocked') {
      data.blockedAt = new Date()
      if (!body.blockNote) {
        return NextResponse.json({ error: 'Block reason is required' }, { status: 400 })
      }
    }
    if (body.status === 'in_progress' && stage.status === 'blocked' && stage.blockedAt) {
      const blockedSeconds = Math.floor((Date.now() - stage.blockedAt.getTime()) / 1000)
      data.totalBlockedSeconds = stage.totalBlockedSeconds + blockedSeconds
      data.blockedAt = null
    }
  }

  // Update checklist
  if (body.checklist) {
    data.checklist = body.checklist
  }

  // Update notes
  if (body.notes !== undefined) {
    data.notes = body.notes
  }

  const updated = await prisma.vehicleStage.update({
    where: { id },
    data,
  })

  // Log activity
  await prisma.activityLog.create({
    data: {
      entityType: 'stage',
      entityId: id,
      action: body.status ? `status_${body.status}` : 'updated',
      actorId: user.id,
      details: body,
    },
  })

  return NextResponse.json({ stage: updated })
}
