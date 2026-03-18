import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const role = searchParams.get('role')

  const where: Record<string, unknown> = { isActive: true }
  if (role) where.role = role

  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json({ users })
}

export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const { name, email, password, role } = await request.json()

  if (!name || !email || !role || !password) {
    return NextResponse.json({ error: 'Name, email, password, and role are required' }, { status: 400 })
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
      password,
      role,
    },
  })

  return NextResponse.json({ user: newUser }, { status: 201 })
}
