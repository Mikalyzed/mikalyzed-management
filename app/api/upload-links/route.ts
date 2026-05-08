import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

/**
 * POST /api/upload-links — admin/sales rep generates a public upload link
 * for a specific contact. Customer opens the link, uploads files (any size)
 * directly to Cloudinary, lands on the contact's timeline at full quality.
 */
export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { contactId, expiresInDays = 7 } = await request.json()
  if (!contactId) return NextResponse.json({ error: 'contactId required' }, { status: 400 })

  const contact = await prisma.contact.findUnique({ where: { id: contactId }, select: { id: true } })
  if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })

  const token = randomBytes(16).toString('base64url')
  const expiresAt = new Date(Date.now() + Math.max(1, Math.min(30, expiresInDays)) * 24 * 60 * 60 * 1000)

  const link = await prisma.uploadLink.create({
    data: {
      token,
      contactId,
      createdById: user.id,
      expiresAt,
    },
  })

  return NextResponse.json({
    token: link.token,
    expiresAt: link.expiresAt,
  })
}
