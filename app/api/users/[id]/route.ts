import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()

  const data: Record<string, unknown> = {}
  if (body.role) data.role = body.role
  if (body.name) data.name = body.name
  if (body.email) data.email = body.email
  if (body.password) data.password = body.password
  if (body.isActive !== undefined) data.isActive = body.isActive
  if (body.twilioNumber !== undefined) {
    let n = (body.twilioNumber as string | null) || null
    if (n) {
      // Normalize to E.164
      n = n.replace(/[^0-9+]/g, '')
      if (!n.startsWith('+')) n = n.startsWith('1') ? `+${n}` : `+1${n}`
    }
    data.twilioNumber = n
  }

  try {
    const updated = await prisma.user.update({
      where: { id },
      data,
    })
    return NextResponse.json({ user: updated })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : ''
    if (msg.includes('Unique constraint') && msg.includes('twilio')) {
      return NextResponse.json({ error: 'That Twilio number is already assigned to another user' }, { status: 409 })
    }
    throw e
  }
}
