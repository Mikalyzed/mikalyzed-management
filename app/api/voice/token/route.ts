import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import twilio from 'twilio'

/**
 * Issues a short-lived Twilio Voice Access Token for the logged-in rep.
 * The browser uses it to register as a Twilio Device that can place + receive
 * calls through Twilio Programmable Voice.
 *
 * Identity = our user.id, used downstream to route inbound calls back to the
 * right rep's browser via `<Client>` dial.
 */
export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const apiKey = process.env.TWILIO_API_KEY
  const apiSecret = process.env.TWILIO_API_SECRET
  const twimlAppSid = process.env.TWILIO_TWIML_APP_SID
  if (!accountSid || !apiKey || !apiSecret || !twimlAppSid) {
    return NextResponse.json({ error: 'Twilio Voice not configured' }, { status: 500 })
  }

  const AccessToken = twilio.jwt.AccessToken
  const VoiceGrant = AccessToken.VoiceGrant

  const token = new AccessToken(accountSid, apiKey, apiSecret, {
    identity: `crm_${user.id}`,
    ttl: 3600, // 1 hour
  })

  const grant = new VoiceGrant({
    outgoingApplicationSid: twimlAppSid,
    incomingAllow: true,
  })
  token.addGrant(grant)

  return NextResponse.json({
    token: token.toJwt(),
    identity: `crm_${user.id}`,
  })
}
