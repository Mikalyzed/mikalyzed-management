import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { recomputeInventoryStatus } from '@/lib/inventory-status'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json()

  const data: Record<string, unknown> = {}
  if (body.status) data.status = body.status

  // Admin status override: append a follow-up entry as audit trail
  if (body.statusChangeReason && body.status && body.fromStatus && body.status !== body.fromStatus) {
    const existing = await prisma.externalRepair.findUnique({ where: { id }, select: { followUps: true } })
    const current = (existing?.followUps as any[]) || []
    const overrideEntry = {
      date: new Date().toISOString(),
      type: 'status_override',
      fromStatus: body.fromStatus,
      toStatus: body.status,
      note: `Status changed: ${body.fromStatus} → ${body.status}. Reason: ${body.statusChangeReason}`,
    }
    data.followUps = [...current, overrideEntry]
  }
  if (body.notes !== undefined) data.notes = body.notes
  if (body.shopName !== undefined) data.shopName = body.shopName
  if (body.shopPhone !== undefined) data.shopPhone = body.shopPhone
  if (body.repairDescription !== undefined) data.repairDescription = body.repairDescription

  // Schedule action: pending repair gets a date + estimated days, optionally flips status to "sent"
  if (body.sentDate !== undefined) {
    const sent = body.sentDate ? new Date(body.sentDate) : null
    data.sentDate = sent
    if (sent && body.estimatedDays) {
      data.expectedReturn = new Date(sent.getTime() + body.estimatedDays * 86400000)
    } else if (!sent) {
      data.expectedReturn = null
    }
  }
  if (body.estimatedDays !== undefined && body.sentDate === undefined) {
    data.estimatedDays = body.estimatedDays || null
    const repair = await prisma.externalRepair.findUnique({ where: { id } })
    if (repair?.sentDate && body.estimatedDays) {
      data.expectedReturn = new Date(repair.sentDate.getTime() + body.estimatedDays * 86400000)
    } else if (!body.estimatedDays) {
      data.expectedReturn = null
    }
  } else if (body.sentDate !== undefined && body.estimatedDays !== undefined) {
    data.estimatedDays = body.estimatedDays || null
  }

  // Handle follow-ups
  if (body.followUps !== undefined) {
    data.followUps = body.followUps
  }

  // If adding a new follow-up
  if (body.addFollowUp) {
    const repair = await prisma.externalRepair.findUnique({ where: { id } })
    if (repair) {
      const currentFollowUps = (repair.followUps as any[]) || []
      const followupDate = new Date()
      
      // Get the latest deadline to build from (previous follow-up or today)
      let baseDeadlineTime: number
      if (currentFollowUps.length > 0) {
        // Use the last follow-up's deadline as the base
        const lastFollowUp = currentFollowUps[currentFollowUps.length - 1]
        baseDeadlineTime = lastFollowUp.calculatedDeadline 
          ? new Date(lastFollowUp.calculatedDeadline).getTime()
          : followupDate.getTime()
      } else {
        // No previous follow-up, use today
        baseDeadlineTime = followupDate.getTime()
      }
      
      // Calculate new deadline from the base + entered days
      let calculatedDeadline = null
      if (body.addFollowUp.etaDays) {
        calculatedDeadline = new Date(baseDeadlineTime + body.addFollowUp.etaDays * 86400000).toISOString()
      }
      
      const newFollowUp = {
        date: followupDate.toISOString(),
        etaDays: body.addFollowUp.etaDays || null,
        note: body.addFollowUp.note,
        calculatedDeadline: calculatedDeadline
      }
      
      const updatedFollowUps = [...currentFollowUps, newFollowUp]
      data.followUps = updatedFollowUps
      
      // DO NOT update estimatedDays — keep original for historical context
    }
  }

  const updated = await prisma.externalRepair.update({ where: { id }, data })
  await recomputeInventoryStatus(updated.stockNumber).catch(() => {})

  // When an external repair is marked 'returned', the vehicle is ready to come back
  // into recon. Park it in awaiting_routing so admin reviews + routes it (consistent
  // with how stage completions are handled). Only flip if THIS vehicle has no other
  // active external repairs still in progress, and only if it was at status='external'.
  if (data.status === 'returned') {
    const stillActive = await prisma.externalRepair.count({
      where: { stockNumber: updated.stockNumber, status: { not: 'returned' } },
    })
    if (stillActive === 0) {
      const v = await prisma.vehicle.findFirst({
        where: { stockNumber: updated.stockNumber, status: 'external' },
        select: { id: true },
      })
      if (v) {
        // Mark any leftover pending/in_progress stages as skipped — they were orphaned
        // when the vehicle went out for external repair.
        await prisma.vehicleStage.updateMany({
          where: { vehicleId: v.id, status: { in: ['pending', 'in_progress'] } },
          data: { status: 'skipped', completedAt: new Date(), timerStartedAt: null },
        })
        await prisma.vehicle.update({
          where: { id: v.id },
          data: { status: 'awaiting_routing', currentStageId: null, currentAssigneeId: null },
        })
        await prisma.activityLog.create({
          data: {
            entityType: 'vehicle',
            entityId: v.id,
            action: 'returned_from_external',
            actorId: null,
            details: { stockNumber: updated.stockNumber, externalRepairId: id },
          },
        }).catch(() => {})
      }
    }
  }

  return NextResponse.json({ repair: updated })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const existing = await prisma.externalRepair.findUnique({ where: { id }, select: { stockNumber: true } })
  await prisma.externalRepair.delete({ where: { id } })
  if (existing) await recomputeInventoryStatus(existing.stockNumber).catch(() => {})
  return NextResponse.json({ success: true })
}
