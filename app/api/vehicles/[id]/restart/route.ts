import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, requireRole } from '@/lib/auth'
import type { Stage } from '@/lib/constants'
import { recomputeInventoryStatus } from '@/lib/inventory-status'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!requireRole(user.role, ['admin'])) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const { id } = await params

  const vehicle = await prisma.vehicle.findUnique({
    where: { id },
    include: { stages: true },
  })

  if (!vehicle) return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 })
  if (vehicle.status !== 'completed') {
    return NextResponse.json({ error: 'Vehicle is not completed' }, { status: 400 })
  }

  let body: { reason?: string; mechanicChecklist?: (string | { item: string; type?: string })[]; mechanicScopeName?: string | null } = {}
  try { body = await request.json() } catch { /* ok */ }
  const mechanicScopeName = typeof body.mechanicScopeName === 'string' && body.mechanicScopeName.trim()
    ? body.mechanicScopeName.trim()
    : null

  const firstStage: Stage = 'mechanic'
  const config = await prisma.stageConfig.findUnique({ where: { stage: firstStage } })
  // No more legacy DEFAULT_CHECKLISTS fallback — mechanic templates live in the DB
  // ("New Vehicle Inspection", "Sold Vehicle Inspection").  If the request doesn't
  // send a checklist, fall through to the DB stage config or a single placeholder.
  const fallback: string[] = (config?.defaultChecklist as string[] | undefined)?.length
    ? config!.defaultChecklist as string[]
    : ['Inspect & clear']
  const rawChecklist = body.mechanicChecklist && body.mechanicChecklist.length > 0
    ? body.mechanicChecklist
    : fallback
  const checklist = rawChecklist.map((entry) => {
    if (typeof entry === 'string') return { item: entry, done: false, note: '' }
    return { item: entry.item, done: false, note: '', ...(entry.type ? { type: entry.type } : {}) }
  })

  await prisma.$transaction(async (tx) => {
    // Create new first stage
    const newStage = await tx.vehicleStage.create({
      data: {
        vehicleId: id,
        stage: firstStage,
        status: 'pending',
        assigneeId: config?.defaultAssigneeId || null,
        checklist,
        scopeName: mechanicScopeName,
      },
    })

    // Reset vehicle status
    await tx.vehicle.update({
      where: { id },
      data: {
        status: firstStage,
        completedAt: null,
        currentStageId: newStage.id,
        currentAssigneeId: config?.defaultAssigneeId || null,
      },
    })

    // Log the restart
    await tx.activityLog.create({
      data: {
        entityType: 'vehicle',
        entityId: id,
        action: 'recon_restarted',
        actorId: user.id,
        details: { reason: body.reason || 'Restarted by admin', previousCompletedAt: vehicle.completedAt },
      },
    })
  })

  await recomputeInventoryStatus(vehicle.stockNumber).catch(() => {})

  return NextResponse.json({ success: true })
}
