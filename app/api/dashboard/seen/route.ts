import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

/**
 * POST /api/dashboard/seen — "Got it": stamps the user's what's-new cutoff.
 * Everything assigned after this moment shows in the next New For You card.
 */
export async function POST() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await prisma.user.update({
    where: { id: user.id },
    data: { dashboardSeenAt: new Date() },
  })
  return NextResponse.json({ ok: true })
}
