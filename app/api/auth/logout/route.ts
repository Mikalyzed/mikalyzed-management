import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const url = new URL('/login', request.url)
  const response = NextResponse.redirect(url)
  response.cookies.set('mm_user_id', '', { maxAge: 0, path: '/' })
  response.cookies.set('mm_user_role', '', { maxAge: 0, path: '/' })
  response.cookies.set('mm_user_name', '', { maxAge: 0, path: '/' })
  return response
}
