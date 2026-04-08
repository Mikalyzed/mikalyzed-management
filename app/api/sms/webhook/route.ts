import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// Twilio sends incoming SMS to this webhook
export async function POST(req: NextRequest) {
  const formData = await req.formData()

  const from = formData.get('From') as string
  const body = formData.get('Body') as string
  const messageSid = formData.get('MessageSid') as string
  const numMedia = parseInt(formData.get('NumMedia') as string || '0')

  console.log('[sms-webhook] Incoming SMS:', JSON.stringify({ from, body: body?.slice(0, 100), messageSid }))

  // Get media URL if MMS
  let mediaUrl: string | null = null
  if (numMedia > 0) {
    mediaUrl = formData.get('MediaUrl0') as string
  }

  // Find contact by phone number
  const cleanNumber = from?.replace(/[^0-9+]/g, '')
  const contact = await prisma.contact.findFirst({
    where: {
      OR: [
        { phone: cleanNumber },
        { phone: from },
        { phone: cleanNumber?.replace('+1', '') },
        { phone: cleanNumber?.replace('+', '') },
      ],
    },
  })

  if (contact) {
    // Save inbound message
    await prisma.message.create({
      data: {
        contactId: contact.id,
        direction: 'inbound',
        channel: 'sms',
        body: body || '',
        mediaUrl,
        status: 'received',
        externalId: messageSid,
      },
    })

    // Create notification for the contact's assigned opportunity rep
    const opp = await prisma.opportunity.findFirst({
      where: { contactId: contact.id, lostAt: null, wonAt: null },
      orderBy: { updatedAt: 'desc' },
      select: { assigneeId: true },
    })

    if (opp?.assigneeId) {
      await prisma.notification.create({
        data: {
          userId: opp.assigneeId,
          type: 'sms_received',
          title: `New SMS from ${contact.firstName} ${contact.lastName}: ${body?.slice(0, 50) || '(media)'}`,
          entityType: 'contact',
          entityId: contact.id,
        },
      })
    }
  } else {
    console.log('[sms-webhook] No contact found for:', from)
  }

  // Return empty TwiML (no auto-reply for now)
  return new NextResponse(
    '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
    { headers: { 'Content-Type': 'text/xml' } }
  )
}
