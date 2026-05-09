import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { isGraphConfigured, sendMail } from '@/lib/graph'

export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isGraphConfigured()) {
    return NextResponse.json({ error: 'Email integration not configured' }, { status: 500 })
  }

  const body = await request.json()
  const { contactId, to, subject, bodyHtml, bodyText } = body
  if (!contactId || !to || !subject) {
    return NextResponse.json({ error: 'contactId, to, subject required' }, { status: 400 })
  }

  // Resolve the sender — must be a real M365 mailbox the app is allowed to send as
  const senderEmail = user.email
  if (!senderEmail) return NextResponse.json({ error: 'No email on your account' }, { status: 400 })

  const html = bodyHtml || (bodyText ? `<div style="font-family:system-ui;font-size:14px;white-space:pre-wrap">${escapeHtml(bodyText)}</div>` : '')
  if (!html) return NextResponse.json({ error: 'body required' }, { status: 400 })

  try {
    await sendMail({
      fromUserEmail: senderEmail,
      to: Array.isArray(to) ? to : [to],
      subject,
      bodyHtml: html,
      saveToSentItems: true,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Send failed'
    console.error('[email/send]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  // Mirror to the contact's timeline
  await prisma.message.create({
    data: {
      contactId,
      direction: 'outbound',
      channel: 'email',
      body: bodyText || stripHtml(html),
      status: 'sent',
      senderId: user.id,
    },
  }).catch(() => {})

  return NextResponse.json({ success: true })
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
}
