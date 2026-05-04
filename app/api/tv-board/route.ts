import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  try {
    const now = new Date()
    const todayStart = new Date(now)
    todayStart.setHours(0, 0, 0, 0)

    const stageList = ['mechanic', 'detailing', 'content', 'publish'] as const

    // Single query: get ALL non-done stages + today's completed
    const allStages = await prisma.vehicleStage.findMany({
      where: {
        OR: [
          { status: { in: ['in_progress', 'pending'] } },
          { status: 'done', completedAt: { gte: todayStart } },
        ],
      },
      include: {
        vehicle: { select: { stockNumber: true, year: true, make: true, model: true, color: true } },
        assignee: { select: { name: true } },
      },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    })

    // Build pipeline counts and vehicle lists from the single query
    const pipeline: Record<string, { total: number; inProgress: number; pending: number; done: number }> = {}
    const stageVehicles: Record<string, ReturnType<typeof formatJob>[]> = {}

    for (const stage of stageList) {
      const stageItems = allStages.filter(s => s.stage === stage)
      const inProgress = stageItems.filter(s => s.status === 'in_progress' && !s.awaitingParts)
      const pending = stageItems.filter(s => s.status === 'pending')
      const done = stageItems.filter(s => s.status === 'done')

      pipeline[stage] = {
        total: inProgress.length + pending.length,
        inProgress: inProgress.length,
        pending: pending.length,
        done: done.length,
      }

      if (stage === 'content') {
        // Content column: show ALL recon content stages + all standalone content tasks
        const ordered = [...inProgress, ...pending]
        stageVehicles[stage] = ordered.map(formatJob)
      } else {
        // Other stages: top 5
        const ordered = [...inProgress, ...pending].slice(0, 5)
        stageVehicles[stage] = ordered.map(formatJob)
      }
    }

    // Standalone content tasks — append after the recon content stages
    const contentTasks = await prisma.task.findMany({
      where: { category: 'content', status: { notIn: ['done', 'skipped'] } },
      include: { assignee: { select: { name: true } } },
      orderBy: [
        { status: 'asc' }, // in_progress sorts before pending alphabetically? in_progress < pending? false. Let's sort manually.
        { sortOrder: 'asc' },
        { createdAt: 'desc' },
      ],
    })
    const taskCards = contentTasks
      .sort((a, b) => {
        const aActive = a.status === 'in_progress' ? 0 : 1
        const bActive = b.status === 'in_progress' ? 0 : 1
        if (aActive !== bActive) return aActive - bActive
        return (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
      })
      .map(t => ({
        stockNumber: '',
        vehicle: t.title,
        color: null as string | null,
        assignee: t.assignee?.name || 'Unassigned',
        estimatedHours: null as number | null,
        activeSeconds: 0,
        timerRunning: false,
        timerStartedAt: null as string | null,
        stage: 'content',
        status: t.status === 'in_progress' ? 'in_progress' : 'pending',
        isTask: true,
      }))
    stageVehicles['content'] = [...(stageVehicles['content'] || []), ...taskCards]
    // Include task in_progress count in pipeline summary
    const activeTaskCount = contentTasks.filter(t => t.status === 'in_progress').length
    if (pipeline.content) {
      pipeline.content.inProgress += activeTaskCount
      pipeline.content.total += contentTasks.length
      pipeline.content.pending += contentTasks.filter(t => t.status !== 'in_progress').length
    }

    // Awaiting parts count
    const awaitingPartsCount = allStages.filter(s => s.awaitingParts).length

    // Completed today (across all stages)
    const completedToday = allStages.filter(s => s.status === 'done')
    
    // External repairs + inventory counts (sequential to avoid pool exhaustion)
    const externalCount = await prisma.externalRepair.count({ where: { status: 'sent' } })
    const totalInventory = await prisma.vehicle.count({ where: { status: { notIn: ['completed', 'sold'] } } })
    const inRecon = allStages.filter(s => s.status !== 'done' && s.status !== 'skipped' && !s.awaitingParts).length

    return NextResponse.json({
      pipeline,
      stageVehicles,
      awaitingParts: awaitingPartsCount,
      externalRepairs: externalCount,
      completedToday: completedToday.length,
      totalInventory,
      inRecon,
      completedVehicles: completedToday.slice(0, 10).map(s => ({
        stockNumber: s.vehicle.stockNumber,
        vehicle: `${s.vehicle.year ?? ''} ${s.vehicle.make} ${s.vehicle.model}`.trim(),
        stage: s.stage,
        assignee: s.assignee?.name || null,
        completedAt: s.completedAt?.toISOString(),
      })),
      timestamp: now.toISOString(),
    })
  } catch (err) {
    console.error('[tv-board] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

function formatJob(s: {
  vehicle: { stockNumber: string; year: number | null; make: string; model: string; color: string | null }
  assignee: { name: string } | null
  estimatedHours: number | null; activeSeconds: number; timerStartedAt: Date | null
  stage: string; status: string
}) {
  return {
    stockNumber: s.vehicle.stockNumber,
    vehicle: `${s.vehicle.year ?? ''} ${s.vehicle.make} ${s.vehicle.model}`.trim(),
    color: s.vehicle.color,
    assignee: s.assignee?.name || 'Unassigned',
    estimatedHours: s.estimatedHours,
    activeSeconds: s.activeSeconds,
    timerRunning: !!s.timerStartedAt,
    timerStartedAt: s.timerStartedAt?.toISOString() || null,
    stage: s.stage,
    status: s.status,
  }
}
