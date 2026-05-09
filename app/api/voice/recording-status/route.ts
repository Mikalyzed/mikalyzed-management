import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

/**
 * Fired when a call recording finishes processing. Saves the recording URL
 * and SID, then kicks off transcription via Twilio's Intelligence service
 * (or you can use built-in Recording.transcribe at record time — using the
 * separate flow gives better quality + lets us swap providers later).
 */
export async function POST(req: NextRequest) {
  const fd = await req.formData()
  const recordingSid = (fd.get('RecordingSid') as string) || ''
  const recordingUrl = (fd.get('RecordingUrl') as string) || ''
  const recordingDuration = parseInt((fd.get('RecordingDuration') as string) || '0') || null
  const callSid = (fd.get('CallSid') as string) || ''
  const parentSid = (fd.get('ParentCallSid') as string) || ''

  const targetSid = parentSid || callSid
  if (!targetSid || !recordingSid) return new NextResponse(null, { status: 200 })

  await prisma.call.update({
    where: { twilioCallSid: targetSid },
    data: {
      recordingSid,
      recordingUrl,
      recordingDurationSeconds: recordingDuration,
      transcriptionStatus: 'pending',
    },
  }).catch(e => console.error('[voice/recording-status]', e))

  // Kick off transcription via Twilio's REST API (async)
  triggerTranscription(recordingSid).catch(e => console.error('[voice/transcribe trigger]', e))

  return new NextResponse(null, { status: 200 })
}

async function triggerTranscription(recordingSid: string) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!accountSid || !authToken) return
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64')
  const proto = process.env.NEXT_PUBLIC_BASE_URL ? new URL(process.env.NEXT_PUBLIC_BASE_URL).protocol.replace(':', '') : 'https'
  const host = process.env.NEXT_PUBLIC_BASE_URL ? new URL(process.env.NEXT_PUBLIC_BASE_URL).host : 'mikalyzed-management.vercel.app'
  const transcribeCallbackUrl = `${proto}://${host}/api/voice/transcription`

  // Twilio's standard recording transcription is the simplest path.
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${recordingSid}/Transcriptions.json`
  const body = new URLSearchParams({
    TranscribeCallback: transcribeCallbackUrl,
  })
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!r.ok) {
    console.error('[voice/transcribe trigger] failed', r.status, await r.text())
  }
}
