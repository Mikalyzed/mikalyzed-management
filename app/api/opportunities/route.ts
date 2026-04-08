import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function GET(request: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const pipelineId = searchParams.get('pipelineId')
  const stageId = searchParams.get('stageId')
  const assigneeId = searchParams.get('assigneeId')
  const source = searchParams.get('source')

  const where: Record<string, unknown> = {}
  if (pipelineId) where.pipelineId = pipelineId
  if (stageId) where.stageId = stageId
  if (assigneeId) where.assigneeId = assigneeId
  if (source) where.source = source

  const opportunities = await prisma.opportunity.findMany({
    where,
    include: {
      contact: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
      stage: { select: { id: true, name: true, type: true } },
      assignee: { select: { id: true, name: true } },
      vehicle: { select: { id: true, stockNumber: true, year: true, make: true, model: true } },
      _count: { select: { tasks: true, notes: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })

  return NextResponse.json(opportunities)
}

export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { contactId, pipelineId, stageId, assigneeId, vehicleId, vehicleInterest, source, sourceDetail, value } = body

  if (!contactId || !pipelineId) {
    return NextResponse.json({ error: 'Contact and pipeline required' }, { status: 400 })
  }

  // If no stageId, use first stage of pipeline
  let resolvedStageId = stageId
  if (!resolvedStageId) {
    const firstStage = await prisma.pipelineStage.findFirst({
      where: { pipelineId },
      orderBy: { sortOrder: 'asc' },
    })
    if (!firstStage) return NextResponse.json({ error: 'Pipeline has no stages' }, { status: 400 })
    resolvedStageId = firstStage.id
  }

  // Assign rep: returning contacts get same rep, new contacts get round robin
  let resolvedAssigneeId = assigneeId
  if (!resolvedAssigneeId) {
    // Check if this contact has a previous opportunity with an assigned rep
    const previousOpp = await prisma.opportunity.findFirst({
      where: { contactId, assigneeId: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { assigneeId: true, assignee: { select: { isActive: true } } },
    })

    if (previousOpp?.assigneeId && previousOpp.assignee?.isActive) {
      // Returning contact — assign same rep
      resolvedAssigneeId = previousOpp.assigneeId
    }
  }

  if (!resolvedAssigneeId) {
    // New contact — weighted round robin
    // Check for custom weights first
    const weights = await prisma.roundRobinWeight.findMany({
      where: { pipelineId },
      include: { user: { select: { id: true, name: true, isActive: true } } },
    })

    const activeWeights = weights.filter(w => w.user.isActive)

    if (activeWeights.length > 0) {
      // Build weighted list: user with weight 2 appears twice, weight 3 appears 3x, etc.
      const weightedList: string[] = []
      for (const w of activeWeights) {
        for (let i = 0; i < w.weight; i++) {
          weightedList.push(w.userId)
        }
      }

      const rrState = await prisma.roundRobinState.findUnique({ where: { pipelineId } })
      if (rrState) {
        const lastIdx = weightedList.indexOf(rrState.lastAssignedId)
        const nextIdx = (lastIdx + 1) % weightedList.length
        resolvedAssigneeId = weightedList[nextIdx]
      } else {
        resolvedAssigneeId = weightedList[0]
      }
    } else {
      // Fallback: equal distribution across all active sales users
      const salesUsers = await prisma.user.findMany({
        where: { isActive: true, role: { in: ['sales', 'sales_manager', 'admin'] } },
        orderBy: { name: 'asc' },
      })
      if (salesUsers.length > 0) {
        const rrState = await prisma.roundRobinState.findUnique({ where: { pipelineId } })
        if (rrState) {
          const lastIdx = salesUsers.findIndex(u => u.id === rrState.lastAssignedId)
          const nextIdx = (lastIdx + 1) % salesUsers.length
          resolvedAssigneeId = salesUsers[nextIdx].id
        } else {
          resolvedAssigneeId = salesUsers[0].id
        }
      }
    }

    if (resolvedAssigneeId) {
      await prisma.roundRobinState.upsert({
        where: { pipelineId },
        update: { lastAssignedId: resolvedAssigneeId },
        create: { pipelineId, lastAssignedId: resolvedAssigneeId },
      })
    }
  }

  const opp = await prisma.opportunity.create({
    data: {
      contactId,
      pipelineId,
      stageId: resolvedStageId,
      assigneeId: resolvedAssigneeId,
      vehicleId: vehicleId || null,
      vehicleInterest: vehicleInterest || null,
      source: source || 'other',
      sourceDetail: sourceDetail || null,
      value: value || null,
    },
    include: {
      contact: { select: { id: true, firstName: true, lastName: true } },
      stage: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true } },
    },
  })

  // Activity log
  await prisma.activityEvent.create({
    data: {
      opportunityId: opp.id,
      type: 'lead_created',
      description: `Lead created from ${source || 'other'}`,
      actorId: user.id,
      metadata: { source, sourceDetail },
    },
  })

  if (resolvedAssigneeId) {
    await prisma.activityEvent.create({
      data: {
        opportunityId: opp.id,
        type: 'assigned',
        description: `Assigned to ${opp.assignee?.name || 'salesperson'}`,
        actorId: user.id,
      },
    })

    // Notify assignee
    if (resolvedAssigneeId !== user.id) {
      await prisma.notification.create({
        data: {
          userId: resolvedAssigneeId,
          type: 'lead_assigned',
          title: 'New lead assigned',
          message: `${opp.contact.firstName} ${opp.contact.lastName} — ${vehicleInterest || 'General inquiry'}`,
          entityType: 'opportunity',
          entityId: opp.id,
        },
      })
    }
  }

  return NextResponse.json(opp, { status: 201 })
}
