import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, requireRole } from '@/lib/auth'

// POST: assign items to a date
// body: { items: [{ id, type: 'vehicle'|'task', date: 'YYYY-MM-DD' | null }] }
export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // Content team owns this board's workflow alongside admins (same parity as the UI).
  if (!requireRole(user.role, ['admin', 'content'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { items } = await request.json()
  if (!Array.isArray(items)) return NextResponse.json({ error: 'items required' }, { status: 400 })

  for (const item of items) {
    const date = item.date ? new Date(item.date + 'T12:00:00-04:00') : null
    if (item.type === 'vehicle') {
      await prisma.vehicleStage.update({
        where: { id: item.id },
        data: { scheduledDate: date },
      })
    } else if (item.type === 'task') {
      await prisma.task.update({
        where: { id: item.id },
        data: { scheduledDate: date },
      })
    }
  }

  return NextResponse.json({ ok: true })
}
