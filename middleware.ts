import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip auth for login page, API login route, TV board, public upload pages, Twilio webhook
  if (
    pathname === '/login' ||
    pathname === '/api/auth/login' ||
    pathname === '/tv' ||
    pathname === '/api/tv-board' ||
    pathname.startsWith('/u/') ||
    pathname.match(/^\/api\/upload-links\/[^/]+(\/(sign|complete|multipart\/(start|sign-part|complete)))?$/) ||
    pathname === '/api/sms/webhook' ||
    pathname === '/api/email/webhook' ||
    pathname === '/api/email/subscriptions/renew' ||
    pathname === '/api/voice/twiml' ||
    pathname === '/api/voice/incoming' ||
    pathname === '/api/voice/call-status' ||
    pathname === '/api/voice/recording-status' ||
    pathname === '/api/voice/transcription' ||
    pathname === '/api/voice/voicemail' ||
    pathname === '/api/instagram/webhook' ||
    pathname === '/api/instagram/deauthorize' ||
    pathname === '/api/instagram/data-deletion' ||
    pathname === '/data-deletion-status' ||
    pathname === '/privacy' ||
    pathname === '/terms'
  ) {
    return NextResponse.next()
  }

  // Check for session cookie
  const session = request.cookies.get('mm_user_id')
  if (!session?.value && !pathname.startsWith('/api/')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
