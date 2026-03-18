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

  const updated = await prisma.externalRepair.update({ where: { id }, data })
  return NextResponse.json({ repair: updated })
}
