import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

/**
 * Outbound Instagram DM via Meta Graph API.
 *
 * Looks up the contact, extracts their IG-scoped ID from the `ig:<id>` tag
 * (set when the inbound webhook auto-created the contact), POSTs to Meta's
 * messaging endpoint using the dealership's PAGE_ACCESS_TOKEN, and saves the
 * outbound message locally so it appears in the conversation thread.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const contactId = typeof body.contactId === 'string' ? body.contactId : null
  const text = typeof body.body === 'string' ? body.body.trim() : ''

  if (!contactId || !text) {
    return NextResponse.json({ error: 'contactId and body are required' }, { status: 400 })
  }

  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { id: true, tags: true },
  })
  if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })

  // Find the Instagram-scoped ID stored as a tag (e.g. "ig:1234567890")
  const igTag = contact.tags.find(t => t.startsWith('ig:'))
  const counterpartyIgId = igTag?.slice(3)
  if (!counterpartyIgId) {
    return NextResponse.json({ error: 'This contact has no Instagram ID on file (no ig:* tag).' }, { status: 400 })
  }

  const token = process.env.META_PAGE_ACCESS_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'META_PAGE_ACCESS_TOKEN env var is not set' }, { status: 500 })
  }

  // POST to Meta — IG User Tokens use graph.instagram.com
  const metaRes = await fetch('https://graph.instagram.com/v21.0/me/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: counterpartyIgId },
      message: { text },
      access_token: token,
    }),
  })
  const metaJson = await metaRes.json().catch(() => ({}))

  if (!metaRes.ok) {
    console.error('[ig-send] Meta API error', metaRes.status, metaJson)
    const raw = metaJson?.error?.message || `HTTP ${metaRes.status}`
    const looksLikeRecipientIssue =
      /recipient/i.test(raw) ||
      /valid ID/i.test(raw) ||
      /does not exist/i.test(raw) ||
      /Object with ID/i.test(raw) ||
      /user is not (a )?valid/i.test(raw)
    const friendly = looksLikeRecipientIssue
      ? 'Could not deliver to this Instagram user. Instagram requires the recipient to have messaged your business within the last 24 hours, and (while the app is still under review) to be added as a Tester in Meta. Once Advanced Access is approved this restriction is lifted.'
      : raw
    return NextResponse.json({ error: friendly }, { status: 502 })
  }

  // Meta returns { recipient_id, message_id } on success
  const externalId: string | null = metaJson?.message_id || null

  const saved = await prisma.message.create({
    data: {
      contactId: contact.id,
      direction: 'outbound',
      channel: 'instagram',
      body: text,
      status: 'sent',
      externalId,
      senderId: user.id,
    },
  })

  return NextResponse.json({ success: true, messageId: saved.id, externalId })
}
