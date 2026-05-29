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
  const matched = mode === 'subscribe' && token === expected && !!challenge
  console.log('[ig-webhook] GET verification', {
    mode,
    tokenMatches: token === expected,
    tokenLen: token?.length || 0,
    expectedLen: expected?.length || 0,
    hasChallenge: !!challenge,
    result: matched ? 'OK' : 'REJECTED',
  })
  if (matched) {
    return new NextResponse(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }
  return new NextResponse('Forbidden', { status: 403 })
}

export async function POST(req: NextRequest) {
  const raw = await req.text()
  const signature = req.headers.get('x-hub-signature-256') || ''
  const appSecret = process.env.META_APP_SECRET

  console.log('[ig-webhook] POST received', {
    rawLen: raw.length,
    hasSignature: !!signature,
    hasAppSecret: !!appSecret,
    bodyPreview: raw.slice(0, 400),
  })

  // Validate signature
  if (appSecret) {
    const expectedSig = 'sha256=' + crypto.createHmac('sha256', appSecret).update(raw).digest('hex')
    if (signature !== expectedSig) {
      console.warn('[ig-webhook] signature mismatch', { got: signature.slice(0, 20) + '...', expected: expectedSig.slice(0, 20) + '...' })
      return new NextResponse('Forbidden', { status: 403 })
    }
  }

  let body: { object?: string; entry?: Array<{ id: string; time: number; messaging?: Array<{
    sender: { id: string }
    recipient: { id: string }
    timestamp: number
    message?: { mid: string; text?: string; attachments?: Array<{ type: string; payload: { url: string } }>; is_echo?: boolean }
  }> }> }
  try { body = JSON.parse(raw) }
  catch (e) {
    console.warn('[ig-webhook] body parse failed', e)
    return new NextResponse(null, { status: 200 })
  }

  console.log('[ig-webhook] parsed', { object: body.object, entryCount: body.entry?.length || 0 })

  if (body.object !== 'instagram') {
    console.log('[ig-webhook] ignoring non-instagram object', body.object)
    return new NextResponse(null, { status: 200 })
  }

  let eventCount = 0
  let handledCount = 0
  for (const entry of body.entry || []) {
    for (const evt of entry.messaging || []) {
      eventCount++
      if (!evt.message) {
        console.log('[ig-webhook] event has no message field, skipping', { keys: Object.keys(evt) })
        continue
      }
      try {
        await handleMessageEvent(evt)
        handledCount++
      } catch (e) {
        console.error('[ig-webhook] handler error', e)
      }
    }
  }
  console.log('[ig-webhook] done', { eventCount, handledCount })

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
  if (!messageId) { console.warn('[ig-webhook] event missing message.mid'); return }

  console.log('[ig-webhook] handleMessageEvent', {
    messageId,
    sender: evt.sender.id,
    recipient: evt.recipient.id,
    is_echo: !!evt.message.is_echo,
    hasText: !!evt.message.text,
    hasAttachment: !!evt.message.attachments?.length,
  })

  // Dedup
  const existing = await prisma.message.findFirst({ where: { externalId: messageId }, select: { id: true } })
  if (existing) {
    console.log('[ig-webhook] message already saved, skipping dedup', messageId)
    return
  }

  const isOutbound = !!evt.message.is_echo // Meta marks our own outbound DMs with is_echo=true
  const counterpartyIgId = isOutbound ? evt.recipient.id : evt.sender.id

  // Find existing contact by Instagram-scoped ID stored as a tag
  let contact = await prisma.contact.findFirst({
    where: { tags: { has: `ig:${counterpartyIgId}` } },
  })
  console.log('[ig-webhook] contact lookup', { counterpartyIgId, found: !!contact, contactId: contact?.id })

  // Auto-create if unknown — Instagram DMs are mostly leads, mirror them all
  if (!contact) {
    const profile = await fetchIgProfile(counterpartyIgId)
    const username = profile?.username || counterpartyIgId
    const fullName = profile?.name || `@${username}`
    const [firstName, ...rest] = fullName.split(/\s+/)
    const lastName = rest.join(' ') || `(@${username})`

    const adminId = await firstAdminId()
    contact = await prisma.contact.create({
      data: {
        firstName: firstName || 'Unknown',
        lastName,
        source: 'instagram',
        tags: [`ig:${counterpartyIgId}`, `ig_handle:${username}`],
        notes: `Auto-created from Instagram DM on ${new Date().toLocaleString()}`,
        createdById: adminId,
      },
    })
    console.log('[ig-webhook] Auto-created contact', contact.id, 'for ig:', counterpartyIgId, '@', username)
  }

  const text = evt.message.text || ''
  const attachment = evt.message.attachments?.[0]

  const saved = await prisma.message.create({
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
  console.log('[ig-webhook] message saved', { messageId: saved.id, direction: saved.direction, textLen: text.length })

  // Notify admins/sales managers of inbound only
  if (!isOutbound) {
    const notifyUsers = await prisma.user.findMany({
      where: { isActive: true, role: { in: ['admin', 'sales_manager'] } },
      select: { id: true },
    })
    const preview = text.slice(0, 60) || (attachment ? '(media)' : '(empty)')
    await prisma.notification.createMany({
      data: notifyUsers.map(u => ({
        userId: u.id,
        type: 'instagram_received',
        title: `IG DM from ${contact!.firstName} ${contact!.lastName}: ${preview}`,
        entityType: 'contact',
        entityId: contact!.id,
      })),
    }).catch(() => {})
  }
}

async function fetchIgProfile(igUserId: string): Promise<{ username?: string; name?: string } | null> {
  const token = process.env.META_PAGE_ACCESS_TOKEN
  if (!token) return null
  try {
    const res = await fetch(
      `https://graph.facebook.com/v18.0/${igUserId}?fields=username,name&access_token=${token}`,
    )
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

async function firstAdminId(): Promise<string> {
  const admin = await prisma.user.findFirst({ where: { role: 'admin', isActive: true }, select: { id: true } })
  if (!admin) throw new Error('No admin user found in system')
  return admin.id
}
