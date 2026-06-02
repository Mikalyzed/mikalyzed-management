import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'

/**
 * Step 1 of Instagram Business Login OAuth:
 * Redirects the user to Meta's authorization page. After they authorize,
 * Meta sends them back to /api/instagram/oauth/callback with a `code` param.
 */
export async function GET(_req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appId = process.env.META_APP_ID
  if (!appId) {
    return NextResponse.json({ error: 'META_APP_ID env var is not set' }, { status: 500 })
  }

  const redirectUri = `https://mikalyzed-management.vercel.app/api/instagram/oauth/callback`

  // Permissions we're requesting. instagram_business_basic is the base for everything else.
  const scopes = [
    'instagram_business_basic',
    'instagram_business_manage_messages',
  ].join(',')

  // CSRF protection: include the user's id as state so we know which dealership user initiated this
  const state = user.id

  const authUrl = new URL('https://www.instagram.com/oauth/authorize')
  authUrl.searchParams.set('client_id', appId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', scopes)
  authUrl.searchParams.set('state', state)

  return NextResponse.redirect(authUrl.toString())
}
