import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

/**
 * Hit by Twilio when the inbound `<Dial>` ends. If no one answered, prompt the
 * caller to leave a voicemail.
 */
export async function POST(req: NextRequest) {
  const fd = await req.formData()
  const dialCallStatus = (fd.get('DialCallStatus') as string) || ''
  const callSid = (fd.get('CallSid') as string) || ''

  const proto = req.headers.get('x-forwarded-proto') || 'https'
  const host = req.headers.get('host')
  const base = `${proto}://${host}`

  // Connected, busy, or canceled — nothing more to do
  if (dialCallStatus === 'completed' || dialCallStatus === 'answered') {
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { status: 200, headers: { 'Content-Type': 'text/xml' } },
    )
  }

  // Mark this call as missed/voicemail-pending
  if (callSid) {
    await prisma.call.updateMany({
      where: { twilioCallSid: callSid },
      data: { voicemail: true, status: 'voicemail' },
    }).catch(() => {})
  }

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">Sorry we missed you. Please leave a message after the tone.</Say>
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
