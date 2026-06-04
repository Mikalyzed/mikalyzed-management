import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { recomputeInventoryStatus } from '@/lib/inventory-status'
import { markVehicleAsAtExternal, markVehicleReturnedFromExternal } from '@/lib/external-repair-flow'

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

  // Snapshot the prior status BEFORE the update so we can detect transitions.
  const prior = await prisma.externalRepair.findUnique({ where: { id }, select: { status: true } })
  const priorStatus = prior?.status

  const updated = await prisma.externalRepair.update({ where: { id }, data })
  await recomputeInventoryStatus(updated.stockNumber).catch(() => {})

  // Vehicle status side-effects driven by external repair status transitions:
  if (typeof data.status === 'string' && data.status !== priorStatus) {
    if (data.status === 'sent' || data.status === 'in_progress') {
      // Car just left the shop (or got upgraded from pending tracking → sent) — pull
      // it off the recon board and skip any active stages so they don't orphan.
      await markVehicleAsAtExternal({
        stockNumber: updated.stockNumber,
        externalRepairId: id,
      })
    } else if (data.status === 'returned') {
      // Car came back — park in awaiting_routing for admin to route (only if no other
      // active externals remain for this stock).
      await markVehicleReturnedFromExternal({
        stockNumber: updated.stockNumber,
        externalRepairId: id,
      })
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
