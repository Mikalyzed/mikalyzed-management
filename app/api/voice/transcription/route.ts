import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyTwilioRequest, parseFormBody } from '@/lib/twilio-validate'

/**
 * Fired when Twilio finishes transcribing a recording. Saves the text on the
 * matching Call record by RecordingSid.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const fd = parseFormBody(rawBody)
  const forbid = await verifyTwilioRequest(req, rawBody, fd)
  if (forbid) return forbid

  const recordingSid = fd['RecordingSid'] || ''
  const transcriptionText = fd['TranscriptionText'] || ''
  const transcriptionStatus = fd['TranscriptionStatus'] || 'completed'

  if (!recordingSid) return new NextResponse(null, { status: 200 })

  await prisma.call.updateMany({
    where: { recordingSid },
    data: {
      transcription: transcriptionText || null,
      transcriptionStatus,
    },
  }).catch(e => console.error('[voice/transcription]', e))

  return new NextResponse(null, { status: 200 })
}
