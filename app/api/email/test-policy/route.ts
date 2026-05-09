import { NextResponse } from 'next/server'
import { getSessionUser, requireRole } from '@/lib/auth'
import { canAccessMailbox, isGraphConfigured } from '@/lib/graph'

/**
 * GET /api/email/test-policy?inside=foo@x.com&outside=bar@y.com
 * Admin-only. Probes two mailboxes to verify the Application Access Policy:
 *   `inside` should be Granted; `outside` should be Denied.
 */
export async function GET(request: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!requireRole(user.role, ['admin'])) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }
  if (!isGraphConfigured()) return NextResponse.json({ error: 'Graph not configured' }, { status: 500 })

  const { searchParams } = new URL(request.url)
  const inside = searchParams.get('inside')
  const outside = searchParams.get('outside')
  if (!inside || !outside) {
    return NextResponse.json({ error: 'Provide ?inside=<sales-mailbox>&outside=<non-sales-mailbox>' }, { status: 400 })
  }

  const [insideRes, outsideRes] = await Promise.all([canAccessMailbox(inside), canAccessMailbox(outside)])
  return NextResponse.json({
    insideMailbox: { email: inside, ...insideRes },
    outsideMailbox: { email: outside, ...outsideRes },
    policyEnforced: insideRes.granted && !outsideRes.granted,
  })
}
