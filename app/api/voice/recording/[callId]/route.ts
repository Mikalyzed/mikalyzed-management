import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

/**
 * Streams a call recording from Twilio. Twilio recordings require Basic Auth
 * (account SID + auth token) — browsers can't fetch them directly. This route
 * authenticates server-side and returns the audio bytes so <audio> can play.
 *
 * URL: /api/voice/recording/[callId]
 *   callId = our internal Call.id
 */
export async function GET(_request: Request, { params }: { params: Promise<{ callId: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { callId } = await params
  const call = await prisma.call.findUnique({
    where: { id: callId },
    select: { recordingUrl: true, contactId: true, ownerId: true },
  })
  if (!call?.recordingUrl) {
    return NextResponse.json({ error: 'No recording on this call' }, { status: 404 })
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!accountSid || !authToken) {
    return NextResponse.json({ error: 'Twilio credentials not configured' }, { status: 500 })
  }

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64')
  // Append .mp3 so Twilio returns a stereo MP3 (the bare URL gives wav by default)
  const upstream = await fetch(`${call.recordingUrl}.mp3`, {
    headers: { Authorization: `Basic ${auth}` },
    redirect: 'follow',
  })
  if (!upstream.ok) {
    console.error('[voice/recording] upstream', upstream.status, call.recordingUrl)
    return NextResponse.json({ error: `Twilio fetch failed (${upstream.status})` }, { status: 502 })
  }

  // Buffer the response so browsers see Content-Length + Accept-Ranges (needed for seeking)
  const buffer = await upstream.arrayBuffer()
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(buffer.byteLength),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
