import twilio from 'twilio'
import { NextResponse } from 'next/server'

/**
 * Validates a Twilio webhook signature. Returns null on success, a 403
 * NextResponse on failure. Skip validation only when TWILIO_AUTH_TOKEN is
 * missing (e.g., local dev). On any signed deployment, this is enforced.
 *
 * Twilio signs the request URL + sorted form params with HMAC-SHA1 and the
 * auth token. We must reconstruct the exact URL Twilio called — which on
 * Vercel can differ from req.url because of proxying. We honor the
 * x-forwarded-proto / host headers when present.
 */
export async function verifyTwilioRequest(req: Request, rawBody: string, params: Record<string, string>): Promise<NextResponse | null> {
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!authToken) {
    console.warn('[twilio-validate] TWILIO_AUTH_TOKEN missing — skipping validation')
    return null
  }

  const signature = req.headers.get('x-twilio-signature') || ''
  if (!signature) {
    console.warn('[twilio-validate] missing x-twilio-signature header')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Reconstruct the URL Twilio actually called (honors Vercel proxy headers)
  const forwardedProto = req.headers.get('x-forwarded-proto') || 'https'
  const forwardedHost = req.headers.get('x-forwarded-host') || req.headers.get('host') || ''
  const url = forwardedHost
    ? `${forwardedProto}://${forwardedHost}${new URL(req.url).pathname}${new URL(req.url).search}`
    : req.url

  const ok = twilio.validateRequest(authToken, signature, url, params)
  if (!ok) {
    // Also try with the original req.url in case the proxy headers were wrong
    const okFallback = twilio.validateRequest(authToken, signature, req.url, params)
    if (!okFallback) {
      console.warn('[twilio-validate] signature mismatch', { url, hasParams: Object.keys(params).length })
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  // mark as used to avoid eslint
  void rawBody
  return null
}

/**
 * Helper: parse application/x-www-form-urlencoded body into a flat string map
 * (Twilio webhooks always send form-encoded payloads).
 */
export function parseFormBody(rawBody: string): Record<string, string> {
  const params: Record<string, string> = {}
  const sp = new URLSearchParams(rawBody)
  sp.forEach((v, k) => { params[k] = v })
  return params
}
