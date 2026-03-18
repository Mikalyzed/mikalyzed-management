import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json()

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      return NextResponse.json({ error: 'No account found with this email' }, { status: 404 })
    }
    if (!user.isActive) {
      return NextResponse.json({ error: 'Account disabled' }, { status: 403 })
    }

    // Check individual password, fallback to APP_PASSWORD for admin
    if (user.password) {
      if (password !== user.password) {
        return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
      }
    } else if (password !== process.env.APP_PASSWORD) {
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
    }

    const response = NextResponse.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    })

    response.cookies.set('mm_user_id', user.id, {
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    })
    response.cookies.set('mm_user_role', user.role, {
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    })
    response.cookies.set('mm_user_name', encodeURIComponent(user.name), {
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    })

    return response
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
