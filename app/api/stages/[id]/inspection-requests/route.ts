import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

type Action = 'approve' | 'decline' | 'approveAll' | 'declineAll'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as { action?: Action; index?: number }
  const { action, index } = body
  if (!action) return NextResponse.json({ error: 'action required' }, { status: 400 })

  const stage = await prisma.vehicleStage.findUnique({ where: { id } })
  if (!stage) return NextResponse.json({ error: 'Stage not found' }, { status: 404 })

  const checklist = (stage.checklist as Array<{ addedByMechanic?: boolean; approved?: string; [k: string]: unknown }>) || []
  let updated = checklist

  if (action === 'approve') {
    if (typeof index !== 'number') return NextResponse.json({ error: 'index required' }, { status: 400 })
    updated = checklist.map((it, i) => i === index ? { ...it, approved: 'approved' } : it)
  } else if (action === 'decline') {
    if (typeof index !== 'number') return NextResponse.json({ error: 'index required' }, { status: 400 })
    updated = checklist.filter((_, i) => i !== index)
  } else if (action === 'approveAll') {
    updated = checklist.map(it => it.addedByMechanic && it.approved === 'pending' ? { ...it, approved: 'approved' } : it)
  } else if (action === 'declineAll') {
    updated = checklist.filter(it => !(it.addedByMechanic && it.approved === 'pending'))
  } else {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  await prisma.vehicleStage.update({ where: { id }, data: { checklist: updated as unknown as never } })
  return NextResponse.json({ success: true, checklist: updated })
}
