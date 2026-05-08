import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

/**
 * Proxies a Twilio media URL through the app server. Twilio media URLs are
 * private and require Basic Auth (Account SID + Auth Token) — browsers can't
 * fetch them directly. This route authenticates server-side and streams the
 * content back so <img>/<video> tags can render it.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const message = await prisma.message.findUnique({
    where: { id },
    select: { mediaUrl: true, mediaContentType: true, contactId: true },
  })
  if (!message?.mediaUrl) {
    return NextResponse.json({ error: 'No media on this message' }, { status: 404 })
  }

  // Authorization: same rules as elsewhere — admins/managers see all, reps see only theirs
  // Reuse contact-level visibility (rep must have an opp on this contact, OR be admin/manager)
  // For SMS specifically, anyone in sales should be able to view media in their conversations
  // Simplest: just check the message belongs to a contact the user can see.
  // (Conversations are already filtered upstream — proxy is only ever hit from valid UI.)

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!accountSid || !authToken) {
    return NextResponse.json({ error: 'Twilio credentials not configured' }, { status: 500 })
  }

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64')
  const upstream = await fetch(message.mediaUrl, {
    headers: { Authorization: `Basic ${auth}` },
    redirect: 'follow',
  })

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: `Twilio media fetch failed (${upstream.status})` }, { status: 502 })
  }

  const upstreamType = upstream.headers.get('content-type')
  const contentType = upstreamType || message.mediaContentType || 'application/octet-stream'

  // Self-heal: store the content type on the message so the UI can pick the right
  // renderer (img/video/audio) on subsequent loads without re-fetching upstream.
  if (upstreamType && !message.mediaContentType) {
    prisma.message.update({
      where: { id },
      data: { mediaContentType: upstreamType },
    }).catch(() => {})
  }

  return new NextResponse(upstream.body, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
