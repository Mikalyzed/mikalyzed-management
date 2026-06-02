import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

/**
 * Disconnect a previously-connected Instagram account from this app.
 * Only deletes our local record — does not call Meta to revoke the token
 * on Instagram's side. The user can manually revoke from their Instagram
 * Settings → Apps and Websites if they want a hard revoke.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const existing = await prisma.connectedInstagramAccount.findUnique({ where: { id }, select: { id: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.connectedInstagramAccount.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
