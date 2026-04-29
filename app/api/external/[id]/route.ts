import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { recomputeInventoryStatus } from '@/lib/inventory-status'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json()

  const data: Record<string, unknown> = {}
  if (body.status) data.status = body.status
  if (body.notes !== undefined) data.notes = body.notes
  if (body.shopName !== undefined) data.shopName = body.shopName
  if (body.shopPhone !== undefined) data.shopPhone = body.shopPhone
  if (body.repairDescription !== undefined) data.repairDescription = body.repairDescription
  if (body.estimatedDays) {
    data.estimatedDays = body.estimatedDays
    const repair = await prisma.externalRepair.findUnique({ where: { id } })
    if (repair) {
      data.expectedReturn = new Date(repair.sentDate.getTime() + body.estimatedDays * 86400000)
    }
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
  return NextResponse.json({ repair: updated })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const existing = await prisma.externalRepair.findUnique({ where: { id }, select: { stockNumber: true } })
  await prisma.externalRepair.delete({ where: { id } })
  if (existing) await recomputeInventoryStatus(existing.stockNumber).catch(() => {})
  return NextResponse.json({ success: true })
}
