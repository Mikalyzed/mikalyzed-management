import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

/**
 * Twilio webhook for inbound voice calls. Routes to the rep that owns the
 * called number — rings their browser via <Client> dial. Falls through to
 * voicemail if they don't pick up in 25s.
 */
export async function POST(req: NextRequest) {
  const fd = await req.formData()
  const from = (fd.get('From') as string) || ''
  const to = (fd.get('To') as string) || ''
  const callSid = (fd.get('CallSid') as string) || ''

  // Find the rep that owns this Twilio number
  const rep = to ? await prisma.user.findUnique({
    where: { twilioNumber: to },
    select: { id: true, name: true },
  }) : null

  // Find existing contact by phone (if any) so the call lands on their timeline
  const cleanFrom = from.replace(/[^0-9+]/g, '')
  const contact = await prisma.contact.findFirst({
    where: {
      OR: [
        { phone: cleanFrom },
        { phone: from },
        { phone: cleanFrom.replace('+1', '') },
        { phone: cleanFrom.replace('+', '') },
      ],
    },
    select: { id: true },
  })

  // Persist a starting call record
  if (callSid) {
    await prisma.call.upsert({
      where: { twilioCallSid: callSid },
      create: {
        twilioCallSid: callSid,
        direction: 'inbound',
        fromNumber: from,
        toNumber: to,
        status: 'ringing',
        ownerId: rep?.id || null,
        contactId: contact?.id || null,
      },
      update: {},
    }).catch(e => console.error('[voice/incoming] db upsert', e))
  }

  const proto = req.headers.get('x-forwarded-proto') || 'https'
  const host = req.headers.get('host')
  const base = `${proto}://${host}`
  const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  // No rep assigned to this number → straight to voicemail
  if (!rep) {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">Thanks for calling Mikalyzed Auto Boutique. Please leave a message after the tone.</Say>
  <Record
    action="${base}/api/voice/voicemail"
    transcribe="true"
    transcribeCallback="${base}/api/voice/transcription"
    maxLength="180"
    recordingStatusCallback="${base}/api/voice/recording-status"
    recordingStatusCallbackEvent="completed"
    finishOnKey="#"
    playBeep="true" />
</Response>`
    return new NextResponse(twiml, { status: 200, headers: { 'Content-Type': 'text/xml' } })
  }

  // Ring the rep's browser; if no answer in 25s, action= URL fires voicemail
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">This call is being recorded for quality and training.</Say>
  <Dial
    timeout="25"
    answerOnBridge="true"
    record="record-from-answer-dual"
    recordingStatusCallback="${base}/api/voice/recording-status"
    recordingStatusCallbackEvent="completed"
    recordingTrack="both"
    callerId="${xmlEscape(from)}"
    action="${base}/api/voice/voicemail-fallback">
    <Client
      statusCallbackEvent="initiated ringing answered completed"
      statusCallback="${base}/api/voice/call-status"
      statusCallbackMethod="POST">crm_${rep.id}</Client>
  </Dial>
</Response>`

  return new NextResponse(twiml, { status: 200, headers: { 'Content-Type': 'text/xml' } })
}
