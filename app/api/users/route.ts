import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function GET() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json({ users })
}

export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const { name, email, role } = await request.json()

  if (!name || !email || !role) {
    return NextResponse.json({ error: 'Name, email, and role are required' }, { status: 400 })
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json({ error: 'Email already exists' }, { status: 409 })
  }

  const newUser = await prisma.user.create({
    data: {
      clerkId: `temp_${Date.now()}`,
      name,
      email,
      role,
    },
  })

  return NextResponse.json({ user: newUser }, { status: 201 })
}
