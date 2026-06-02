import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

/**
 * Step 2 of Instagram Business Login OAuth:
 * Meta redirects here with ?code=... after the user authorizes.
 *
 * Flow:
 * 1. Exchange the code for a SHORT-LIVED access token
 * 2. Exchange the short-lived token for a LONG-LIVED token (~60 days)
 * 3. Fetch the user's IG profile (username, picture, etc)
 * 4. Save / upsert the ConnectedInstagramAccount record
 * 5. Redirect to settings page with a success flag
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const errorParam = url.searchParams.get('error')
  const errorDesc = url.searchParams.get('error_description')

  // If user cancelled or Meta returned an error
  if (errorParam) {
    return NextResponse.redirect(`https://mikalyzed-management.vercel.app/settings/integrations?ig_error=${encodeURIComponent(errorDesc || errorParam)}`)
  }
  if (!code) {
    return NextResponse.redirect(`https://mikalyzed-management.vercel.app/settings/integrations?ig_error=no_code`)
  }

  const user = await getSessionUser()
  if (!user) {
    // Meta redirected back but the session cookie is gone — send them to login
    return NextResponse.redirect(`https://mikalyzed-management.vercel.app/login`)
  }

  const appId = process.env.META_APP_ID
  const appSecret = process.env.META_APP_SECRET
  if (!appId || !appSecret) {
    return NextResponse.redirect(`https://mikalyzed-management.vercel.app/settings/integrations?ig_error=missing_app_credentials`)
  }

  const redirectUri = `https://mikalyzed-management.vercel.app/api/instagram/oauth/callback`

  try {
    // 1. Exchange code → short-lived token
    const shortRes = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code,
      }),
    })
    const shortJson = await shortRes.json()
    if (!shortRes.ok || !shortJson.access_token) {
      console.error('[ig-oauth] short-token exchange failed', shortJson)
      return NextResponse.redirect(`https://mikalyzed-management.vercel.app/settings/integrations?ig_error=${encodeURIComponent('short_token_exchange_failed: ' + (shortJson.error_message || JSON.stringify(shortJson)))}`)
    }
    const shortLivedToken: string = shortJson.access_token
    const igUserId: string = String(shortJson.user_id)

    // 2. Exchange short-lived → long-lived (60-day) token
    const longUrl = new URL('https://graph.instagram.com/access_token')
    longUrl.searchParams.set('grant_type', 'ig_exchange_token')
    longUrl.searchParams.set('client_secret', appSecret)
    longUrl.searchParams.set('access_token', shortLivedToken)
    const longRes = await fetch(longUrl.toString())
    const longJson = await longRes.json()
    if (!longRes.ok || !longJson.access_token) {
      console.error('[ig-oauth] long-token exchange failed', longJson)
      return NextResponse.redirect(`https://mikalyzed-management.vercel.app/settings/integrations?ig_error=${encodeURIComponent('long_token_exchange_failed')}`)
    }
    const longLivedToken: string = longJson.access_token
    const expiresInSeconds: number = longJson.expires_in || 0
    const tokenExpiresAt = expiresInSeconds > 0 ? new Date(Date.now() + expiresInSeconds * 1000) : null

    // 3. Fetch profile info
    const profileUrl = new URL(`https://graph.instagram.com/v21.0/me`)
    profileUrl.searchParams.set('fields', 'user_id,username,name,profile_picture_url,account_type')
    profileUrl.searchParams.set('access_token', longLivedToken)
    const profileRes = await fetch(profileUrl.toString())
    const profile = await profileRes.json()
    if (!profileRes.ok) {
      console.error('[ig-oauth] profile fetch failed', profile)
      return NextResponse.redirect(`https://mikalyzed-management.vercel.app/settings/integrations?ig_error=${encodeURIComponent('profile_fetch_failed')}`)
    }

    // 4. Upsert
    await prisma.connectedInstagramAccount.upsert({
      where: { igUserId },
      create: {
        igUserId,
        username: profile.username || `(@${igUserId})`,
        name: profile.name || null,
        profilePictureUrl: profile.profile_picture_url || null,
        accessToken: longLivedToken,
        tokenExpiresAt,
        connectedById: user.id,
      },
      update: {
        username: profile.username || `(@${igUserId})`,
        name: profile.name || null,
        profilePictureUrl: profile.profile_picture_url || null,
        accessToken: longLivedToken,
        tokenExpiresAt,
        connectedById: user.id,
      },
    })

    return NextResponse.redirect(`https://mikalyzed-management.vercel.app/settings/integrations?ig_connected=${encodeURIComponent(profile.username || igUserId)}`)
  } catch (e) {
    console.error('[ig-oauth] unexpected error', e)
    return NextResponse.redirect(`https://mikalyzed-management.vercel.app/settings/integrations?ig_error=${encodeURIComponent('unexpected_error')}`)
  }
}
