import { Resend } from 'resend'

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null

const DEFAULT_FROM = 'Mikalyzed Auto Boutique <notifications@mikalyzedautoboutique.com>'

export async function sendNotificationEmail({
  to,
  subject,
  html,
}: {
  to: string
  subject: string
  html: string
}) {
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set — skipping email:', subject)
    return null
  }

  try {
    const { data, error } = await resend.emails.send({
      from: DEFAULT_FROM,
      to,
      subject,
      html,
    })
    if (error) {
      console.error('[email] Send error:', error)
      return null
    }
    return data
  } catch (err) {
    console.error('[email] Exception:', err)
    return null
  }
}
