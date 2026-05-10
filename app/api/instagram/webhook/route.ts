import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/db'

/**
 * Meta webhook for Instagram DMs (and Messenger via the same API).
 *
 * Two flows:
 * 1. GET — verification handshake. Meta sends ?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
 *    We must echo back the challenge if our META_VERIFY_TOKEN matches.
 * 2. POST — message events. Body has { object, entry[] }. Each entry has messaging[] events.
 *    We validate the X-Hub-Signature-256 header using META_APP_SECRET.
 */

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const mode = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')
  const expected = process.env.META_VERIFY_TOKEN
  if (mode === 'subscribe' && token === expected && challenge) {
    return new NextResponse(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }
  return new NextResponse('Forbidden', { status: 403 })
}

export async function POST(req: NextRequest) {
  const raw = await req.text()
  const signature = req.headers.get('x-hub-signature-256') || ''
  const appSecret = process.env.META_APP_SECRET

  // Validate signature
  if (appSecret) {
    const expectedSig = 'sha256=' + crypto.createHmac('sha256', appSecret).update(raw).digest('hex')
    if (signature !== expectedSig) {
      console.warn('[ig-webhook] signature mismatch')
      return new NextResponse('Forbidden', { status: 403 })
    }
  }

  let body: { object?: string; entry?: Array<{ id: string; time: number; messaging?: Array<{
    sender: { id: string }
    recipient: { id: string }
    timestamp: number
    message?: { mid: string; text?: string; attachments?: Array<{ type: string; payload: { url: string } }>; is_echo?: boolean }
  }> }> }
  try { body = JSON.parse(raw) } catch { return new NextResponse(null, { status: 200 }) }

  // Only process Instagram events for now
  if (body.object !== 'instagram') return new NextResponse(null, { status: 200 })

  for (const entry of body.entry || []) {
    for (const evt of entry.messaging || []) {
      if (!evt.message) continue
      try { await handleMessageEvent(evt) }
      catch (e) { console.error('[ig-webhook] handler error', e) }
    }
  }

  return new NextResponse(null, { status: 200 })
}

type IGEvent = {
  sender: { id: string }
  recipient: { id: string }
  timestamp: number
  message?: { mid: string; text?: string; attachments?: Array<{ type: string; payload: { url: string } }>; is_echo?: boolean }
}

async function handleMessageEvent(evt: IGEvent) {
  if (!evt.message) return
  const messageId = evt.message.mid
  if (!messageId) return

  // Dedup
  const existing = await prisma.message.findFirst({ where: { externalId: messageId }, select: { id: true } })
  if (existing) return

  const ourIgId = process.env.META_IG_BUSINESS_ID
  const isOutbound = !!evt.message.is_echo // Meta marks our own outbound DMs with is_echo=true
  const counterpartyIgId = isOutbound ? evt.recipient.id : evt.sender.id

  // Find existing contact by Instagram-scoped ID stored as a tag.
  // We don't auto-create — only mirror if we already track this person.
  const contact = await prisma.contact.findFirst({
    where: { tags: { has: `ig:${counterpartyIgId}` } },
  })
  if (!contact) {
    // Skip — same rule as email mirror. Manual conversion via "Convert IG DM to lead" later.
    console.log('[ig-webhook] no contact for ig:', counterpartyIgId)
    return
  }

  const text = evt.message.text || ''
  const attachment = evt.message.attachments?.[0]

  await prisma.message.create({
    data: {
      contactId: contact.id,
      direction: isOutbound ? 'outbound' : 'inbound',
      channel: 'instagram',
      body: text,
      mediaUrl: attachment?.payload?.url || null,
      mediaContentType: attachment?.type || null,
      status: isOutbound ? 'sent' : 'received',
      externalId: messageId,
    },
  })
}
