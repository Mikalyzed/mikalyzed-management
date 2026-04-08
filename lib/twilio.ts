import twilio from 'twilio'

const accountSid = process.env.TWILIO_ACCOUNT_SID!
const authToken = process.env.TWILIO_AUTH_TOKEN!
const phoneNumber = process.env.TWILIO_PHONE_NUMBER!

const client = twilio(accountSid, authToken)

export async function sendSMS(to: string, body: string) {
  const message = await client.messages.create({
    body,
    from: phoneNumber,
    to,
  })
  return message
}

export { client, phoneNumber }
