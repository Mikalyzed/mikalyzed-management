import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

// POST: assign items to a date
// body: { items: [{ id, type: 'vehicle'|'task', date: 'YYYY-MM-DD' | null }] }
export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

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
