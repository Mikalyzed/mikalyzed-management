import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

/**
 * POST /api/reports/meeting/examples — save a CONFIRMED smart-input plan as
 * a few-shot example for the interpreter. This is how the meeting AI learns
 * the dealership's phrasing: only plans the admin actually confirmed get
 * stored, and the newest ~50 are kept.
 */
export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 300) : ''
  const steps = Array.isArray(body.steps) ? body.steps : null
  if (!text || !steps || steps.length === 0) {
    return NextResponse.json({ error: 'text and steps required' }, { status: 400 })
  }

  await prisma.meetingPlanExample.create({ data: { text, steps } })

  // Keep the memory bounded — newest 50 win.
  const stale = await prisma.meetingPlanExample.findMany({
    orderBy: { createdAt: 'desc' }, skip: 50, select: { id: true },
  })
  if (stale.length > 0) {
    await prisma.meetingPlanExample.deleteMany({ where: { id: { in: stale.map(s => s.id) } } })
  }

  return NextResponse.json({ ok: true })
}
