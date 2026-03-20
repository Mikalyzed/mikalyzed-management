import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const opp = await prisma.opportunity.findUnique({
    where: { id },
    include: {
      contact: true,
      pipeline: { select: { id: true, name: true, color: true } },
      stage: { select: { id: true, name: true, type: true } },
      assignee: { select: { id: true, name: true, role: true } },
      vehicle: { select: { id: true, stockNumber: true, year: true, make: true, model: true, color: true, status: true } },
      tasks: {
        include: { assignee: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      },
      notes: {
        include: { createdBy: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      },
      activities: {
        include: { actor: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      },
    },
  })

  if (!opp) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Also fetch pipeline stages for the stage selector
  const pipelineStages = await prisma.pipelineStage.findMany({
    where: { pipelineId: opp.pipelineId },
    orderBy: { sortOrder: 'asc' },
  })

  return NextResponse.json({ ...opp, pipelineStages })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const { stageId, assigneeId, vehicleId, vehicleInterest, value, lostReason, lostNotes, appointmentDate } = body

  const opp = await prisma.opportunity.findUnique({
    where: { id },
    include: { stage: true, assignee: true },
  })
  if (!opp) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const data: Record<string, unknown> = {}
  if (vehicleId !== undefined) data.vehicleId = vehicleId || null
  if (vehicleInterest !== undefined) data.vehicleInterest = vehicleInterest || null
  if (value !== undefined) data.value = value
  if (lostReason !== undefined) data.lostReason = lostReason
  if (lostNotes !== undefined) data.lostNotes = lostNotes
  if (appointmentDate !== undefined) data.appointmentDate = appointmentDate ? new Date(appointmentDate) : null

  // Stage change
  if (stageId && stageId !== opp.stageId) {
    data.stageId = stageId
    const newStage = await prisma.pipelineStage.findUnique({ where: { id: stageId } })
    if (newStage) {
      if (newStage.type === 'won') data.wonAt = new Date()
      if (newStage.type === 'lost') {
        data.lostAt = new Date()
        if (!data.lostReason && !opp.lostReason) data.lostReason = lostReason || null
      }

      await prisma.activityEvent.create({
        data: {
          opportunityId: id,
          type: 'stage_changed',
          description: `Moved from ${opp.stage.name} to ${newStage.name}`,
          actorId: user.id,
          metadata: { from: opp.stage.name, to: newStage.name, stageType: newStage.type },
        },
      })
    }
  }

  // Assignment change
  if (assigneeId !== undefined && assigneeId !== opp.assigneeId) {
    data.assigneeId = assigneeId || null
    if (assigneeId) {
      const newAssignee = await prisma.user.findUnique({ where: { id: assigneeId } })
      await prisma.activityEvent.create({
        data: {
          opportunityId: id,
          type: 'assigned',
          description: `Reassigned to ${newAssignee?.name || 'unknown'}`,
          actorId: user.id,
        },
      })
      if (assigneeId !== user.id) {
        await prisma.notification.create({
          data: {
            userId: assigneeId,
            type: 'lead_assigned',
            title: 'Lead reassigned to you',
            message: `An opportunity has been reassigned to you`,
            entityType: 'opportunity',
            entityId: id,
          },
        })
      }
    }
  }

  // Appointment
  if (appointmentDate && !opp.appointmentDate) {
    await prisma.activityEvent.create({
      data: {
        opportunityId: id,
        type: 'appointment_set',
        description: `Appointment set for ${new Date(appointmentDate).toLocaleDateString()}`,
        actorId: user.id,
      },
    })
  }

  const updated = await prisma.opportunity.update({ where: { id }, data })
  return NextResponse.json(updated)
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  await prisma.opportunity.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
