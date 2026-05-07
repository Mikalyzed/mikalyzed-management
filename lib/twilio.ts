import twilio from 'twilio'

const accountSid = process.env.TWILIO_ACCOUNT_SID!
const authToken = process.env.TWILIO_AUTH_TOKEN!
const fallbackPhoneNumber = process.env.TWILIO_PHONE_NUMBER!

const client = twilio(accountSid, authToken)

export type SendSMSOptions = {
  to: string
  body: string
  from?: string
  mediaUrls?: string[]
}

/**
 * Send an SMS or MMS via Twilio.
 * - `from` is required for proper per-rep routing; falls back to TWILIO_PHONE_NUMBER env var if not provided.
 * - `mediaUrls` enables MMS — pass public URLs that Twilio can fetch.
 */
export async function sendSMS(opts: SendSMSOptions | string, body?: string) {
  // Backwards compat with old positional signature: sendSMS(to, body)
  const config: SendSMSOptions = typeof opts === 'string' ? { to: opts, body: body || '' } : opts

  const message = await client.messages.create({
    body: config.body,
    from: config.from || fallbackPhoneNumber,
    to: config.to,
    ...(config.mediaUrls && config.mediaUrls.length > 0 ? { mediaUrl: config.mediaUrls } : {}),
  })
  return message
}

export { client, fallbackPhoneNumber as phoneNumber }
