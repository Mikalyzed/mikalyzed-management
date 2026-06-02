import crypto from 'crypto'

/**
 * Parses Meta's `signed_request` POST body and verifies its HMAC-SHA256
 * signature against META_APP_SECRET. Returns the decoded payload if valid,
 * or null if invalid / unparseable.
 *
 * Used by /api/instagram/deauthorize + /api/instagram/data-deletion — both
 * are server-to-server callbacks Meta hits when a user takes action on the
 * Meta side (revoking app access, requesting data deletion).
 */
export function parseMetaSignedRequest(signedRequest: string): { user_id?: string; algorithm?: string; issued_at?: number } | null {
  if (!signedRequest || typeof signedRequest !== 'string') return null
  const parts = signedRequest.split('.')
  if (parts.length !== 2) return null
  const [encodedSig, encodedPayload] = parts

  const secret = process.env.META_APP_SECRET
  if (!secret) {
    console.error('[meta-signed-request] META_APP_SECRET not set; cannot verify')
    return null
  }

  // Decode the base64url-encoded parts
  const decodedSig = base64UrlDecode(encodedSig)
  const expectedSig = crypto.createHmac('sha256', secret).update(encodedPayload).digest()
  if (!crypto.timingSafeEqual(decodedSig, expectedSig)) {
    console.warn('[meta-signed-request] signature mismatch')
    return null
  }

  try {
    const payloadJson = base64UrlDecode(encodedPayload).toString('utf-8')
    return JSON.parse(payloadJson)
  } catch (e) {
    console.warn('[meta-signed-request] payload parse failed', e)
    return null
  }
}

function base64UrlDecode(str: string): Buffer {
  // Convert base64url to base64
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/')
  // Add padding
  const padded = b64 + '='.repeat((4 - b64.length % 4) % 4)
  return Buffer.from(padded, 'base64')
}
