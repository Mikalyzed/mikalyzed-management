import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json()

  const data: Record<string, unknown> = {}
  if (body.status) data.status = body.status
  if (body.notes !== undefined) data.notes = body.notes
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
      const newFollowUp = {
        date: new Date().toISOString(),
        note: body.addFollowUp.note,
        newEta: body.addFollowUp.newEta || null
      }
      
      const updatedFollowUps = [...currentFollowUps, newFollowUp]
      data.followUps = updatedFollowUps
      
      // If new ETA provided, update estimatedDays
      if (body.addFollowUp.newEta) {
        data.estimatedDays = body.addFollowUp.newEta
        data.expectedReturn = new Date(repair.sentDate.getTime() + body.addFollowUp.newEta * 86400000)
      }
    }
  }

  const updated = await prisma.externalRepair.update({ where: { id }, data })
  return NextResponse.json({ repair: updated })
}
