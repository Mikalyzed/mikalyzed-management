import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { createSessionToken } from '@/lib/auth'

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json()

    // Simple password check — will be replaced by Clerk
    if (password !== process.env.APP_PASSWORD) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    // Find or create user by email
    let user = await prisma.user.findUnique({ where: { email } })

    if (!user) {
      // Auto-create first user as admin
      const userCount = await prisma.user.count()
      user = await prisma.user.create({
        data: {
          clerkId: `temp_${Date.now()}`,
          name: email.split('@')[0],
          email,
          role: userCount === 0 ? 'admin' : 'sales', // first user is admin
        },
      })
    }

    if (!user.isActive) {
      return NextResponse.json({ error: 'Account disabled' }, { status: 403 })
    }

    const token = createSessionToken(user.id)

    const response = NextResponse.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    })

    response.cookies.set('mm_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    })

    return response
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
