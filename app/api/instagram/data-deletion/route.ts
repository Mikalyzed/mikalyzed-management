import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { parseMetaSignedRequest } from '@/lib/meta-signed-request'
import crypto from 'crypto'

/**
 * Meta calls this endpoint when a user requests their data be deleted
 * (typically via Settings → Apps → "Request data deletion").
 *
 * We must:
 * 1. Delete the user's data from our systems
 * 2. Return a JSON response with a status URL + confirmation_code
 *    that Meta will display to the user so they can verify deletion
 *
 * No auth required — Meta calls us directly. We verify the signed_request.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null)
  const signedRequest = form?.get('signed_request')
  console.log('[ig-data-deletion] received', { hasForm: !!form, hasSignedRequest: !!signedRequest })

  if (typeof signedRequest !== 'string') {
    return NextResponse.json({ error: 'Missing signed_request' }, { status: 400 })
  }

  const payload = parseMetaSignedRequest(signedRequest)
  if (!payload) {
    return NextResponse.json({ error: 'Invalid signed_request' }, { status: 403 })
  }

  const igUserId = payload.user_id
  if (!igUserId) {
    return NextResponse.json({ error: 'No user_id in payload' }, { status: 400 })
  }

  const confirmationCode = crypto.randomBytes(10).toString('hex')

  try {
    // 1. Delete the ConnectedInstagramAccount (the OAuth connection itself)
    const deletedConn = await prisma.connectedInstagramAccount.deleteMany({
      where: { igUserId },
    })

    // 2. For any contacts that were created from this IG user's DMs, also delete
    //    their stored messages on the instagram channel + the Instagram tag.
    //    We don't delete the entire contact (they may have SMS / email history)
    //    but we scrub the Instagram-specific data.
    const igTag = `ig:${igUserId}`
    const contacts = await prisma.contact.findMany({
      where: { tags: { has: igTag } },
      select: { id: true, tags: true },
    })
    for (const contact of contacts) {
      // Delete Instagram messages
      await prisma.message.deleteMany({
        where: { contactId: contact.id, channel: 'instagram' },
      })
      // Remove ig:* and ig_handle:* tags
      const filteredTags = contact.tags.filter(t => !t.startsWith('ig:') && !t.startsWith('ig_handle:'))
      await prisma.contact.update({
        where: { id: contact.id },
        data: { tags: filteredTags },
      })
    }

    console.log('[ig-data-deletion] purged', {
      igUserId,
      connectionsDeleted: deletedConn.count,
      contactsScrubbed: contacts.length,
      confirmationCode,
    })
  } catch (e) {
    console.error('[ig-data-deletion] deletion error', e)
    // Still return a response — Meta needs the confirmation code regardless
  }

  return NextResponse.json({
    url: `https://mikalyzed-management.vercel.app/data-deletion-status?code=${confirmationCode}`,
    confirmation_code: confirmationCode,
  })
}
