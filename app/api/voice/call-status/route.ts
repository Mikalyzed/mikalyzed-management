import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyTwilioRequest, parseFormBody } from '@/lib/twilio-validate'

/**
 * Twilio fires this for every state transition on a call leg.
 * We use it to track answered/completed times and final duration.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const fd = parseFormBody(rawBody)
  const forbid = await verifyTwilioRequest(req, rawBody, fd)
  if (forbid) return forbid

  const callSid = fd['CallSid'] || ''
  const parentSid = fd['ParentCallSid'] || ''
  const status = fd['CallStatus'] || ''
  const callDuration = parseInt(fd['CallDuration'] || '0') || null
  const timestamp = fd['Timestamp'] || new Date().toISOString()

  // The parent SID is the call we created in /twiml. Child legs share that as ParentCallSid.
  const targetSid = parentSid || callSid
  if (!targetSid) return new NextResponse(null, { status: 200 })

  const data: Record<string, unknown> = { status }
  if (status === 'in-progress') data.answeredAt = new Date(timestamp)
  if (status === 'completed' || status === 'busy' || status === 'no-answer' || status === 'failed' || status === 'canceled') {
    data.endedAt = new Date(timestamp)
    if (callDuration) data.durationSeconds = callDuration
  }

  await prisma.call.update({ where: { twilioCallSid: targetSid }, data }).catch(e =>
    console.error('[voice/call-status]', targetSid, status, e),
  )

  return new NextResponse(null, { status: 200 })
}
