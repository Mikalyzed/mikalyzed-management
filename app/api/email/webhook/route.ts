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

      // Save the message — prefer uniqueBody (just new content, no quoted reply chain)
      const source = msg.uniqueBody || msg.body
      const rawContent = source?.content || msg.bodyPreview || ''
      let bodyText = source?.contentType === 'html' ? stripHtml(rawContent) : rawContent.trim()

      // Strip the rep's configured signature if it appears in the body (outbound only —
      // their own messages will include the signature; inbound messages from the lead won't).
      if (isOutbound) {
        const repUser = await prisma.user.findUnique({
          where: { id: sub.userId },
          select: { emailSignature: true },
        })
        if (repUser?.emailSignature) {
          bodyText = stripSignature(bodyText, repUser.emailSignature)
        }
      }

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

/**
 * Removes a known signature block from the end of an email body. Tries an exact
 * match first, then a fuzzy match by collapsing whitespace.
 */
function stripSignature(body: string, signature: string): string {
  if (!signature?.trim()) return body
  const sigPlain = signature.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
  if (!sigPlain) return body

  // Exact substring (with whitespace tolerance via collapse + reindex)
  const collapsed = body.replace(/\s+/g, ' ').trim()
  const idx = collapsed.toLowerCase().indexOf(sigPlain.toLowerCase())
  if (idx === -1) return body

  // Find the same start in the original body (rough — first signature line)
  const firstLine = sigPlain.split(' ').slice(0, 3).join(' ')
  const realIdx = body.toLowerCase().indexOf(firstLine.toLowerCase())
  if (realIdx > 0) {
    return body.slice(0, realIdx).replace(/\s+$/, '')
  }
  return body
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|blockquote)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
