import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

/**
 * GET /api/upload-links/[token] — public, returns contact metadata if the
 * token is valid + unexpired + not exhausted. Used by the public upload page
 * to show "Send files to: Caleb @ Mikalyzed Auto Boutique" type info.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const link = await prisma.uploadLink.findUnique({
    where: { token },
    include: { contact: { select: { id: true, firstName: true, lastName: true } } },
  })
  if (!link) return NextResponse.json({ error: 'Invalid link' }, { status: 404 })
  if (link.expiresAt < new Date()) return NextResponse.json({ error: 'Link expired' }, { status: 410 })
  if (link.usedCount >= link.maxUses) return NextResponse.json({ error: 'Upload limit reached' }, { status: 410 })

  return NextResponse.json({
    contact: { firstName: link.contact.firstName, lastName: link.contact.lastName },
    remaining: link.maxUses - link.usedCount,
    expiresAt: link.expiresAt,
  })
}
