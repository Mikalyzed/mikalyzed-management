import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { isCloudinaryConfigured, uploadBufferToCloudinary } from '@/lib/cloudinary'
import { verifyTwilioRequest, parseFormBody } from '@/lib/twilio-validate'

/**
 * Twilio webhook for inbound SMS/MMS.
 * - `To` (the rep's Twilio number) determines which rep "received" the message.
 * - Auto-creates a Contact for unknown numbers (NOT an Opportunity — a human reviews and converts).
 * - Notifies: receiving rep + all sales managers + all admins.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const params = parseFormBody(rawBody)
  const forbid = await verifyTwilioRequest(req, rawBody, params)
  if (forbid) return forbid

  const from = params['From'] || ''
  const to = params['To'] || '' // The Twilio number that received the message
  const body = params['Body'] || ''
  const messageSid = params['MessageSid'] || ''
  const numMedia = parseInt(params['NumMedia'] || '0')

  console.log('[sms-webhook] Incoming SMS:', JSON.stringify({ from, to, body: body.slice(0, 100), messageSid }))

  const mediaUrl: string | null = numMedia > 0 ? (params['MediaUrl0'] || null) : null
  const mediaContentType: string | null = numMedia > 0 ? (params['MediaContentType0'] || null) : null

  // Look up the rep who owns this Twilio number (the "receiver")
  const receivingRep = to
    ? await prisma.user.findUnique({
        where: { twilioNumber: to },
        select: { id: true, name: true },
      })
    : null

  if (!receivingRep) {
    console.warn('[sms-webhook] Inbound SMS to', to, '— no rep assigned to this number')
  }

  const cleanNumber = from?.replace(/[^0-9+]/g, '')

  // Find existing contact by phone
  let contact = await prisma.contact.findFirst({
    where: {
      OR: [
        { phone: cleanNumber },
        { phone: from },
        { phone: cleanNumber?.replace('+1', '') },
        { phone: cleanNumber?.replace('+', '') },
      ],
    },
  })

  let isNewContact = false
  if (!contact) {
    // Auto-create Contact (no Opportunity — a human will review and convert)
    contact = await prisma.contact.create({
      data: {
        firstName: 'Unknown',
        lastName: from ? `(${from})` : '(SMS lead)',
        phone: cleanNumber || from,
        source: 'sms',
        notes: `Auto-created from inbound SMS to ${to || '(unknown number)'} on ${new Date().toLocaleString()}`,
        // Use the receiving rep as the creator if we know who it is, else any admin (fallback: first admin)
        createdById: receivingRep?.id ?? (await firstAdminId()),
      },
    })
    isNewContact = true
    console.log('[sms-webhook] Auto-created contact', contact.id, 'for unknown number', from)
  }

  // Save inbound message
  const savedMessage = await prisma.message.create({
    data: {
      contactId: contact.id,
      direction: 'inbound',
      channel: 'sms',
      body,
      mediaUrl,
      mediaContentType,
      status: 'received',
      externalId: messageSid,
    },
  })

  // If there's media + Cloudinary is configured, upload async (don't block webhook response).
  // Cloudinary auto-converts video formats to browser-friendly mp4 on delivery.
  if (mediaUrl && isCloudinaryConfigured()) {
    ;(async () => {
      try {
        const accountSid = process.env.TWILIO_ACCOUNT_SID
        const authToken = process.env.TWILIO_AUTH_TOKEN
        if (!accountSid || !authToken) return
        const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64')
        const upstream = await fetch(mediaUrl, {
          headers: { Authorization: `Basic ${auth}` },
          redirect: 'follow',
        })
        if (!upstream.ok) {
          console.error('[sms-webhook] Cloudinary upstream fetch failed', upstream.status, mediaUrl)
          return
        }
        const ct = upstream.headers.get('content-type') || mediaContentType || 'application/octet-stream'
        const buf = Buffer.from(await upstream.arrayBuffer())
        const result = await uploadBufferToCloudinary(buf, ct, `sms/${contact!.id}`)
        await prisma.message.update({
          where: { id: savedMessage.id },
          data: {
            cloudinaryPublicId: result.publicId,
            cloudinaryResourceType: result.resourceType,
            // Backfill content type if Twilio didn't include it
            ...(mediaContentType ? {} : { mediaContentType: ct }),
          },
        })
        console.log('[sms-webhook] Uploaded to Cloudinary', result.publicId, result.resourceType)
      } catch (e) {
        console.error('[sms-webhook] Cloudinary upload failed', e)
      }
    })()
  }

  // Notify: receiving rep + all sales managers + all admins (deduped)
  const notifyUserIds = new Set<string>()
  if (receivingRep) notifyUserIds.add(receivingRep.id)

  const managersAndAdmins = await prisma.user.findMany({
    where: { isActive: true, role: { in: ['admin', 'sales_manager'] } },
    select: { id: true },
  })
  for (const u of managersAndAdmins) notifyUserIds.add(u.id)

  const preview = body.slice(0, 60) || (mediaUrl ? '(media)' : '(empty)')
  const contactName = isNewContact ? `New SMS from ${from}` : `${contact.firstName} ${contact.lastName}`
  const title = isNewContact
    ? `New unknown SMS: ${preview}`
    : `${contactName}: ${preview}`

  await prisma.notification.createMany({
    data: Array.from(notifyUserIds).map(userId => ({
      userId,
      type: 'sms_received',
      title,
      entityType: 'contact',
      entityId: contact!.id,
    })),
  })

  return new NextResponse(
    '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
    { headers: { 'Content-Type': 'text/xml' } }
  )
}

async function firstAdminId(): Promise<string> {
  const admin = await prisma.user.findFirst({ where: { role: 'admin', isActive: true }, select: { id: true } })
  if (!admin) throw new Error('No admin user found in system')
  return admin.id
}
