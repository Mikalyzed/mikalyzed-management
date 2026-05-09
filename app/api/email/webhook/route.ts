import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getMessage, isGraphConfigured } from '@/lib/graph'

/**
 * Microsoft Graph webhook for inbound email change notifications.
 *
 * Two flows handled here:
 * 1. Validation handshake — Graph posts with `?validationToken=<token>` query param
 *    and expects us to echo it back as text/plain within 10 seconds. This proves
 *    we own the URL.
 * 2. Change notifications — Graph posts JSON `{ value: [{ subscriptionId, resource,
 *    resourceData: { id }, clientState, ... }] }`. For each notification we fetch
 *    the full message and create a Message record, deduped by externalId.
 */

export async function POST(request: Request) {
  if (!isGraphConfigured()) return NextResponse.json({ error: 'Graph not configured' }, { status: 500 })

  // 1. Validation handshake — echo validationToken as text/plain
  const url = new URL(request.url)
  const validationToken = url.searchParams.get('validationToken')
  if (validationToken) {
    return new Response(validationToken, { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }

  // 2. Change notifications
  const body = await request.json().catch(() => ({}))
  const notifications = (body.value || []) as Array<{
    subscriptionId: string
    clientState: string
    resource: string
    resourceData?: { id?: string }
    changeType?: string
  }>

  for (const notif of notifications) {
    try {
      // Validate clientState matches what we stored when creating the subscription
      const sub = await prisma.emailSubscription.findUnique({
        where: { subscriptionId: notif.subscriptionId },
      })
      if (!sub) {
        console.warn('[email-webhook] No subscription record for', notif.subscriptionId)
        continue
      }
      if (sub.clientState !== notif.clientState) {
        console.warn('[email-webhook] clientState mismatch for', notif.subscriptionId)
        continue
      }

      const messageId = notif.resourceData?.id
      if (!messageId) continue

      // Dedup: skip if we already have this message
      const existing = await prisma.message.findFirst({
        where: { externalId: messageId },
        select: { id: true },
      })
      if (existing) continue

      // Fetch the full message via Graph
      const msg = await getMessage(sub.userEmail, messageId).catch(e => {
        console.error('[email-webhook] getMessage failed', e)
        return null
      })
      if (!msg) continue

      // Determine direction + collect every counterparty address (anyone who's NOT the rep).
      // If no counterparty matches an existing contact, skip — we don't mirror random
      // emails like vendor receipts, internal coworker chatter, etc.
      const repEmail = sub.userEmail.toLowerCase()
      const fromAddr = msg.from?.emailAddress?.address?.toLowerCase()
      const toAddrs = msg.toRecipients?.map(r => r.emailAddress.address.toLowerCase()) || []
      const ccAddrs = msg.ccRecipients?.map(r => r.emailAddress.address.toLowerCase()) || []
      const isOutbound = fromAddr === repEmail
      const counterpartyEmails = isOutbound
        ? [...toAddrs, ...ccAddrs]
        : [fromAddr].filter(Boolean) as string[]

      if (counterpartyEmails.length === 0) continue

      // Look up a Contact by ANY of the counterparty emails — MUST already exist.
      const contact = await prisma.contact.findFirst({
        where: {
          email: { in: counterpartyEmails, mode: 'insensitive' },
        },
      })
      if (!contact) {
        // Not a CRM contact — skip silently. The rep's mailbox is full of unrelated mail.
        continue
      }

      // Save the message
      const bodyText = msg.body?.contentType === 'html'
        ? stripHtml(msg.body.content)
        : (msg.body?.content || msg.bodyPreview || '')

      await prisma.message.create({
        data: {
          contactId: contact.id,
          direction: isOutbound ? 'outbound' : 'inbound',
          channel: 'email',
          body: bodyText,
          subject: msg.subject || null,
          status: isOutbound ? 'sent' : 'received',
          externalId: msg.id,
          emailConversationId: msg.conversationId || null,
          // Outbound emails sent through Outlook (not via the CRM) get the senderId
          // set to the rep that owns the mailbox so it shows as their message.
          senderId: isOutbound ? sub.userId : null,
        },
      })

      // Notify the rep on inbound only (avoid noise for their own outbound)
      if (!isOutbound) {
        await prisma.notification.create({
          data: {
            userId: sub.userId,
            type: 'email_received',
            title: `Email from ${contact.firstName} ${contact.lastName}: ${(msg.subject || '').slice(0, 60)}`,
            entityType: 'contact',
            entityId: contact.id,
          },
        }).catch(() => {})
      }
    } catch (e) {
      console.error('[email-webhook] notification handler error', e)
    }
  }

  // Graph requires a 200 within 30 seconds, even on partial failures
  return new Response(null, { status: 202 })
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}
