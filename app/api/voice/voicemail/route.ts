import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyTwilioRequest, parseFormBody } from '@/lib/twilio-validate'

/**
 * Hit by Twilio after a voicemail is recorded. Notifies the rep.
 * Recording URL + transcription land via /recording-status and /transcription
 * webhooks separately.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const fd = parseFormBody(rawBody)
  const forbid = await verifyTwilioRequest(req, rawBody, fd)
  if (forbid) return forbid

  const callSid = fd['CallSid'] || ''

  if (callSid) {
    const call = await prisma.call.findUnique({
      where: { twilioCallSid: callSid },
      include: { contact: { select: { firstName: true, lastName: true } } },
    }).catch(() => null)
    if (call?.ownerId) {
      const fromLabel = call.contact ? `${call.contact.firstName} ${call.contact.lastName}` : call.fromNumber
      await prisma.notification.create({
        data: {
          userId: call.ownerId,
          type: 'voicemail',
          title: `Voicemail from ${fromLabel}`,
          message: `New voicemail received at ${new Date().toLocaleString()}`,
          entityType: call.contactId ? 'contact' : 'call',
          entityId: call.contactId || call.id,
        },
      }).catch(() => {})
    }
  }

  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna-Neural">Thank you. Goodbye.</Say><Hangup /></Response>`,
    { status: 200, headers: { 'Content-Type': 'text/xml' } },
  )
}
