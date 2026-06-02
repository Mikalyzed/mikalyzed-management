import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

/**
 * Returns the list of Instagram Business accounts connected to this app
 * via the OAuth flow (`/api/instagram/oauth/start` → `/callback`).
 */
export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const accounts = await prisma.connectedInstagramAccount.findMany({
    orderBy: { connectedAt: 'desc' },
    select: {
      id: true,
      igUserId: true,
      username: true,
      name: true,
      profilePictureUrl: true,
      connectedAt: true,
      tokenExpiresAt: true,
      connectedBy: { select: { id: true, name: true, email: true } },
    },
  })
  return NextResponse.json({ accounts })
}
