import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, requireRole } from '@/lib/auth'

/** GET /api/stip-templates — dealership's saved custom stipulations. */
export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!requireRole(user.role, ['sales_manager'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const templates = await prisma.stipTemplate.findMany({
    select: { id: true, name: true, instruction: true },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json({ templates })
}
