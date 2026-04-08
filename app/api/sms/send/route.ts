import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { sendSMS } from '@/lib/twilio'

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { to, body, contactId } = await req.json()

  if (!to || !body) {
    return NextResponse.json({ error: 'to and body are required' }, { status: 400 })
  }

  // Clean phone number
  let cleanNumber = to.replace(/[^0-9+]/g, '')
  if (!cleanNumber.startsWith('+')) {
    cleanNumber = cleanNumber.startsWith('1') ? `+${cleanNumber}` : `+1${cleanNumber}`
  }

  // Find or resolve contact
  let resolvedContactId = contactId
  if (!resolvedContactId) {
    const contact = await prisma.contact.findFirst({
      where: { OR: [{ phone: cleanNumber }, { phone: to }, { phone: cleanNumber.replace('+1', '') }] },
    })
    resolvedContactId = contact?.id
  }

  try {
    const message = await sendSMS(cleanNumber, body)

    // Save to database if we have a contact
    if (resolvedContactId) {
      await prisma.message.create({
        data: {
          contactId: resolvedContactId,
          direction: 'outbound',
          channel: 'sms',
          body,
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
  } catch (error: any) {
    console.error('SMS send error:', error.message)
    return NextResponse.json(
      { error: error.message || 'Failed to send SMS' },
      { status: 500 }
    )
  }
}
