import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const role = searchParams.get('role')
  // Comma-separated list of roles for pickers that span multiple roles —
  // e.g. the Sales Rep picker on the customer profile needs both
  // `sales` and `sales_manager`.
  const roles = searchParams.get('roles')

  const where: Record<string, unknown> = { isActive: true }
  if (roles) {
    const list = roles.split(',').map(r => r.trim()).filter(Boolean)
    if (list.length > 0) where.role = { in: list }
  } else if (role) {
    where.role = role
  }

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
