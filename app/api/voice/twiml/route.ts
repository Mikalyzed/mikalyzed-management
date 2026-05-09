import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

/**
 * TwiML endpoint hit when a rep places an outbound call from the browser.
 * Twilio POSTs `To`, `From`, `Caller`, `CallSid`, plus any custom params we
 * passed via Device.connect({ params: ... }) — those arrive as form fields.
 *
 * Flow:
 *   1. Auto-disclose recording (NJ two-party consent)
 *   2. Dial the destination from the rep's Twilio number
 *   3. Record the call (dual-channel) and request transcription
 */
export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const to = (formData.get('To') as string) || ''
  const callSid = (formData.get('CallSid') as string) || ''
  const ownerId = (formData.get('ownerId') as string) || ''
  const fromNumber = (formData.get('fromNumber') as string) || process.env.TWILIO_PHONE_NUMBER || ''
  const contactId = (formData.get('contactId') as string) || ''

  // Persist initial call record so status callbacks have something to update
  if (callSid) {
    await prisma.call.upsert({
      where: { twilioCallSid: callSid },
      create: {
        twilioCallSid: callSid,
        direction: 'outbound',
        fromNumber,
        toNumber: to,
        status: 'initiated',
        ownerId: ownerId || null,
        contactId: contactId || null,
      },
      update: {},
    }).catch(e => console.error('[voice/twiml] db upsert', e))
  }

  // Build host base for status/recording/transcription callbacks
  const proto = req.headers.get('x-forwarded-proto') || 'https'
  const host = req.headers.get('host')
  const base = `${proto}://${host}`

  const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  // TwiML response
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">This call is being recorded for quality and training.</Say>
  <Dial
    callerId="${xmlEscape(fromNumber)}"
    record="record-from-answer-dual"
    recordingStatusCallback="${base}/api/voice/recording-status"
    recordingStatusCallbackEvent="completed"
    recordingTrack="both"
    answerOnBridge="true"
    timeout="25">
    <Number
      statusCallbackEvent="initiated ringing answered completed"
      statusCallback="${base}/api/voice/call-status"
      statusCallbackMethod="POST">${xmlEscape(to)}</Number>
  </Dial>
</Response>`

  return new NextResponse(twiml, { status: 200, headers: { 'Content-Type': 'text/xml' } })
}
