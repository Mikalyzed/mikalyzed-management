import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'

export async function GET() {
  const cookieStore = await cookies()
  const session = cookieStore.get('mm_session')

  if (!session?.value) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const decoded = JSON.parse(atob(session.value))
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 })
    }

    return NextResponse.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    })
  } catch {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  }
}
