import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { sendSMS } from '@/lib/twilio'

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { to, body, contactId, mediaUrls } = await req.json()

  if (!to || (!body && (!mediaUrls || mediaUrls.length === 0))) {
    return NextResponse.json({ error: 'to and body (or mediaUrls) are required' }, { status: 400 })
  }

  // Clean phone number to E.164
  let cleanNumber = to.replace(/[^0-9+]/g, '')
  if (!cleanNumber.startsWith('+')) {
    cleanNumber = cleanNumber.startsWith('1') ? `+${cleanNumber}` : `+1${cleanNumber}`
  }

  // Resolve sender's Twilio number — required for per-rep routing
  const sender = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, name: true, twilioNumber: true },
  })
  if (!sender?.twilioNumber && !process.env.TWILIO_PHONE_NUMBER) {
    return NextResponse.json({
      error: 'No Twilio number assigned to your account. Ask an admin to assign one in Settings → Sales → Team.',
    }, { status: 400 })
  }
  const fromNumber = sender?.twilioNumber || process.env.TWILIO_PHONE_NUMBER!

  // Find or resolve contact
  let resolvedContactId = contactId
  if (!resolvedContactId) {
    const contact = await prisma.contact.findFirst({
      where: { OR: [{ phone: cleanNumber }, { phone: to }, { phone: cleanNumber.replace('+1', '') }] },
    })
    resolvedContactId = contact?.id
  }

  try {
    const message = await sendSMS({
      to: cleanNumber,
      body: body || '',
      from: fromNumber,
      mediaUrls: Array.isArray(mediaUrls) ? mediaUrls : undefined,
    })

    // Save to database if we have a contact
    if (resolvedContactId) {
      await prisma.message.create({
        data: {
          contactId: resolvedContactId,
          direction: 'outbound',
          channel: 'sms',
          body: body || '',
          mediaUrl: Array.isArray(mediaUrls) && mediaUrls.length > 0 ? mediaUrls[0] : null,
          status: message.status || 'sent',
          externalId: message.sid,
          senderId: user.id,
        },
      })
    }

    return NextResponse.json({
      success: true,
      sid: message.sid,
      status: message.status,
      to: message.to,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to send SMS'
    console.error('SMS send error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
