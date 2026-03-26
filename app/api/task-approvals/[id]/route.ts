import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { status } = await request.json()
  if (!['approved', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const approval = await prisma.taskApproval.findUnique({
    where: { id },
    include: { vehicleStage: true },
  })
  if (!approval) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (approval.status !== 'pending') return NextResponse.json({ error: 'Already reviewed' }, { status: 400 })

  await prisma.taskApproval.update({
    where: { id },
    data: { status, reviewedById: user.id, reviewedAt: new Date() },
  })

  if (status === 'approved') {
    const isTimeExtension = approval.taskName.startsWith('Time extension:')
    const tasks = (approval.tasks as Array<{ name: string; hours: number; note: string | null }>) || []
    const hasMultiTasks = tasks.length > 0
    const updateData: Record<string, unknown> = {}
    
    // Add tasks to checklist
    if (!isTimeExtension) {
      const currentChecklist = (approval.vehicleStage.checklist as { item: string; done: boolean; note: string }[]) || []
      if (hasMultiTasks) {
        const newItems = tasks.map(t => ({ item: t.name, done: false, note: t.note || '' }))
        updateData.checklist = [...currentChecklist, ...newItems]
      } else {
        updateData.checklist = [...currentChecklist, { item: approval.taskName, done: false, note: '' }]
      }
    }
    if (approval.additionalHours && approval.additionalHours > 0) {
      updateData.estimatedHours = (approval.vehicleStage.estimatedHours || 0) + approval.additionalHours
    }
    await prisma.vehicleStage.update({ where: { id: approval.vehicleStageId }, data: updateData })

    const actionDesc = isTimeExtension
      ? `Time extended +${approval.additionalHours}h${approval.taskName.includes('—') ? ` — ${approval.taskName.split('—').slice(1).join('—').trim()}` : ''}`
      : hasMultiTasks
        ? `${tasks.length} tasks approved: ${tasks.map(t => t.name).join(', ')}`
        : `Task approved: ${approval.taskName}`

    await prisma.activityLog.create({
      data: {
        entityType: 'vehicle',
        entityId: approval.vehicleStage.vehicleId,
        action: actionDesc,
        actorId: user.id,
        details: isTimeExtension
          ? { type: 'time_extension', hours: approval.additionalHours, stage: approval.vehicleStage.stage }
          : { type: 'task_approval', tasks: hasMultiTasks ? tasks : [{ name: approval.taskName }] },
      },
    })

    await prisma.notification.create({
      data: {
        userId: approval.requestedById,
        type: 'task_approval_result',
        title: isTimeExtension
          ? `Time extension of +${approval.additionalHours}h was approved`
          : `Your task '${approval.taskName}' was approved`,
        entityType: 'task_approval',
        entityId: approval.id,
      },
    })
  } else {
    await prisma.notification.create({
      data: {
        userId: approval.requestedById,
        type: 'task_approval_result',
        title: `Your task '${approval.taskName}' was rejected`,
        entityType: 'task_approval',
        entityId: approval.id,
      },
    })
  }

  return NextResponse.json({ success: true })
}
