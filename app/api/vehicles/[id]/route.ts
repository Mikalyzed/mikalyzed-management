import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, requireRole } from '@/lib/auth'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const vehicle = await prisma.vehicle.findUnique({
    where: { id },
    include: {
      currentAssignee: { select: { id: true, name: true, role: true } },
      createdBy: { select: { id: true, name: true } },
      stages: {
        include: {
          assignee: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
      transportRequests: {
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!vehicle) {
    return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 })
  }

  return NextResponse.json({ vehicle })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!requireRole(user.role, ['admin'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()

  const allowed = ['stockNumber', 'vin', 'year', 'make', 'model', 'color', 'trim', 'notes']
  const data: Record<string, unknown> = {}
  for (const key of allowed) {
    if (body[key] !== undefined) data[key] = body[key]
  }

  const vehicle = await prisma.vehicle.update({
    where: { id },
    data,
  })

  return NextResponse.json({ vehicle })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!requireRole(user.role, ['admin'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  await prisma.vehicle.delete({ where: { id } })

  return NextResponse.json({ success: true })
}
