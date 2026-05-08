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
    pathname === '/api/sms/webhook'
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
