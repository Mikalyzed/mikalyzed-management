import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { STAGES, DEFAULT_CHECKLISTS, DEFAULT_SLA_HOURS } from '@/lib/constants'
import type { Stage } from '@/lib/constants'

export async function GET() {
  const user = await getSessionUser()
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const configs = await prisma.stageConfig.findMany()
  const configMap = Object.fromEntries(configs.map((c) => [c.stage, c]))

  const stages = STAGES.map((stage) => {
    const cfg = configMap[stage]
    return {
      stage,
      slaHours: cfg?.slaHours ?? DEFAULT_SLA_HOURS[stage],
      defaultAssigneeId: cfg?.defaultAssigneeId ?? null,
      defaultChecklist: (cfg?.defaultChecklist as string[] | undefined)?.length
        ? cfg!.defaultChecklist as string[]
        : DEFAULT_CHECKLISTS[stage],
    }
  })

  return NextResponse.json({ stages })
}

export async function PUT(request: Request) {
  const user = await getSessionUser()
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const { stages } = await request.json()
  if (!Array.isArray(stages)) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  for (const s of stages) {
    await prisma.stageConfig.upsert({
      where: { stage: s.stage },
      update: {
        slaHours: s.slaHours,
        defaultAssigneeId: s.defaultAssigneeId || null,
        defaultChecklist: s.defaultChecklist || [],
      },
      create: {
        stage: s.stage,
        slaHours: s.slaHours,
        defaultAssigneeId: s.defaultAssigneeId || null,
        defaultChecklist: s.defaultChecklist || [],
      },
    })
  }

  return NextResponse.json({ success: true })
}
