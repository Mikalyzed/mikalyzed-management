import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

/**
 * Fired when Twilio finishes transcribing a recording. Saves the text on the
 * matching Call record by RecordingSid.
 */
export async function POST(req: NextRequest) {
  const fd = await req.formData()
  const recordingSid = (fd.get('RecordingSid') as string) || ''
  const transcriptionText = (fd.get('TranscriptionText') as string) || ''
  const transcriptionStatus = (fd.get('TranscriptionStatus') as string) || 'completed'

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
