import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, canAccessOpportunity } from '@/lib/auth'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const opp = await prisma.opportunity.findUnique({
    where: { id },
    include: { stage: { select: { id: true, name: true } } },
  })
  if (!opp) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!canAccessOpportunity(user, opp)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { dispositionId, notes } = await req.json()

  if (!dispositionId) {
    return NextResponse.json({ error: 'dispositionId required' }, { status: 400 })
  }

  const disposition = await prisma.disposition.findUnique({ where: { id: dispositionId } })
  if (!disposition) return NextResponse.json({ error: 'Disposition not found' }, { status: 404 })

  // Create disposition log
  const log = await prisma.dispositionLog.create({
    data: {
      opportunityId: id,
      dispositionId,
      userId: user.id,
      notes: notes || null,
      followUpAt: disposition.followUpMinutes
        ? new Date(Date.now() + disposition.followUpMinutes * 60000)
        : null,
    },
  })

  // Log activity
  await prisma.activityEvent.create({
    data: {
      opportunityId: id,
      type: 'disposition_logged',
      description: `Logged disposition: ${disposition.name}`,
      actorId: user.id,
      metadata: { dispositionId, dispositionName: disposition.name },
    },
  })

  // Look up stage-rule for this (pipeline + disposition + current stage).
  // Prefer an exact-stage match; fall back to a wildcard rule (currentStageId IS NULL)
  // which applies to "any non-final stage" (current stage type must be 'open').
  let stageMoved = false
  const exactRule = await prisma.dispositionStageRule.findFirst({
    where: {
      pipelineId: opp.pipelineId,
      dispositionId,
      currentStageId: opp.stageId,
      enabled: true,
    },
    include: { moveToStage: { select: { id: true, name: true, type: true, pipelineId: true } } },
  })
  let matchedRule = exactRule
  if (!matchedRule) {
    // Wildcard rule — only applies if current stage is 'open' (not won/lost)
    const currentStageRecord = await prisma.pipelineStage.findUnique({
      where: { id: opp.stageId },
      select: { type: true },
    })
    if (currentStageRecord?.type === 'open') {
      matchedRule = await prisma.dispositionStageRule.findFirst({
        where: {
          pipelineId: opp.pipelineId,
          dispositionId,
          currentStageId: null,
          enabled: true,
        },
        include: { moveToStage: { select: { id: true, name: true, type: true, pipelineId: true } } },
      })
    }
  }

  if (matchedRule && matchedRule.moveToStage && matchedRule.moveToStageId !== opp.stageId) {
    const newStage = matchedRule.moveToStage
    // Safety: never move to a stage in a different pipeline
    if (newStage.pipelineId === opp.pipelineId) {
      const stageData: Record<string, unknown> = { stageId: newStage.id }
      if (newStage.type === 'won') stageData.wonAt = new Date()
      if (newStage.type === 'lost') stageData.lostAt = new Date()

      await prisma.opportunity.update({ where: { id }, data: stageData })

      await prisma.activityEvent.create({
        data: {
          opportunityId: id,
          type: 'stage_changed',
          description: `Moved from ${opp.stage.name} to ${newStage.name}`,
          actorId: user.id,
          metadata: {
            from: opp.stage.name,
            to: newStage.name,
            stageType: newStage.type,
            triggeredBy: 'disposition_rule',
            dispositionName: disposition.name,
            ruleId: matchedRule.id,
          },
        },
      })
      stageMoved = true
    }
  }

  // Set firstContactAt if not already set
  await prisma.opportunity.updateMany({
    where: { id, firstContactAt: null },
    data: { firstContactAt: new Date() },
  })

  return NextResponse.json({ log, stageMoved })
}
