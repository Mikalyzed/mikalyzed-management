import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const stage = await prisma.vehicleStage.findUnique({
    where: { id },
    include: { assignee: { select: { id: true, name: true } } },
  })
  if (!stage) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ stage })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json()

  const stage = await prisma.vehicleStage.findUnique({ where: { id } })
  if (!stage) return NextResponse.json({ error: 'Stage not found' }, { status: 404 })

  // Only assigned user or admin can update
  if (stage.assigneeId !== user.id && user.role !== 'admin') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const data: Record<string, unknown> = {}

  // Update status
  if (body.status) {
    // Admins can set any status; non-admins follow transition rules
    if (user.role !== 'admin') {
      const validTransitions: Record<string, string[]> = {
        pending: ['in_progress'],
        in_progress: ['blocked', 'done'],
        blocked: ['in_progress'],
        done: [],
      }
      if (!validTransitions[stage.status]?.includes(body.status)) {
        return NextResponse.json({ error: `Cannot transition from ${stage.status} to ${body.status}` }, { status: 400 })
      }
    }

    data.status = body.status

    // Handle blocked time tracking
    if (body.status === 'blocked') {
      data.blockedAt = new Date()
      if (!body.blockNote && user.role !== 'admin') {
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

  // Update due date
  if (body.dueDate !== undefined) {
    data.dueDate = body.dueDate ? new Date(body.dueDate) : null
  }

  // Update scope
  if (body.scopeName !== undefined) {
    data.scopeName = body.scopeName || null
  }

  // Update estimated hours
  if (body.estimatedHours !== undefined) {
    data.estimatedHours = body.estimatedHours ? parseFloat(body.estimatedHours) : null
  }

  // Update assignee (admin only)
  if (body.assigneeId !== undefined && user.role === 'admin') {
    data.assigneeId = body.assigneeId || null
  }

  const updated = await prisma.vehicleStage.update({
    where: { id },
    data,
  })

  // Sync vehicle's currentAssigneeId if this is the current stage
  if (body.assigneeId !== undefined && user.role === 'admin') {
    const vehicle = await prisma.vehicle.findFirst({ where: { currentStageId: id } })
    if (vehicle) {
      await prisma.vehicle.update({
        where: { id: vehicle.id },
        data: { currentAssigneeId: body.assigneeId || null },
      })
    }
  }

  // Handle return queue when stage is completed
  if (body.status === 'done') {
    const vehicle = await prisma.vehicle.findFirst({ 
      where: { currentStageId: id },
      include: { stages: { orderBy: { createdAt: 'desc' } } }
    })
    
    if (vehicle && vehicle.returnQueue) {
      const returnQueue = vehicle.returnQueue as any[]
      if (returnQueue.length > 0) {
        // Pop the first entry from return queue
        const nextReturn = returnQueue[0]
        const remainingQueue = returnQueue.slice(1)

        // Get the highest priority for the target stage to put at bottom
        const lastInStage = await prisma.vehicleStage.findFirst({
          where: { stage: nextReturn.stage, status: { notIn: ['done', 'skipped'] } },
          orderBy: { priority: 'desc' },
          select: { priority: true },
        })
        const bottomPriority = (lastInStage?.priority ?? -1) + 1

        // Create new stage with uncompleted tasks
        const newStage = await prisma.vehicleStage.create({
          data: {
            vehicleId: vehicle.id,
            stage: nextReturn.stage,
            status: 'pending',
            assigneeId: null, // Admin can assign
            checklist: nextReturn.uncompletedTasks || [],
            priority: bottomPriority,
            notes: `Returned from ${nextReturn.fromStage}: ${nextReturn.reason}`,
          },
        })

        // Update vehicle to point to returned stage
        await prisma.vehicle.update({
          where: { id: vehicle.id },
          data: {
            status: nextReturn.stage,
            currentStageId: newStage.id,
            currentAssigneeId: null,
            returnQueue: remainingQueue,
          },
        })

        // Send notification to admin
        await prisma.activityLog.create({
          data: {
            entityType: 'vehicle',
            entityId: vehicle.id,
            action: 'returned_to_stage',
            actorId: user.id,
            details: {
              returnedStage: nextReturn.stage,
              fromStage: nextReturn.fromStage,
              tasksRemaining: nextReturn.uncompletedTasks?.length || 0,
              stockNumber: vehicle.stockNumber
            },
          },
        })
      }
    }
  }

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
