import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { parseMetaSignedRequest } from '@/lib/meta-signed-request'

/**
 * Meta calls this endpoint when a user revokes our app's access from their
 * Instagram side (Settings → Apps and Websites → Active → Remove).
 *
 * We delete the ConnectedInstagramAccount record so the user no longer
 * appears as connected in our settings UI.
 *
 * No auth required — Meta calls us directly. We verify the signed_request
 * signature using META_APP_SECRET to confirm the request is genuine.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null)
  const signedRequest = form?.get('signed_request')
  console.log('[ig-deauth] received', { hasForm: !!form, hasSignedRequest: !!signedRequest })

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

  // Delete the connection (the user revoked us; there's nothing to keep)
  const deleted = await prisma.connectedInstagramAccount.deleteMany({
    where: { igUserId },
  })
  console.log('[ig-deauth] removed', { igUserId, count: deleted.count })

  return NextResponse.json({ success: true })
}
