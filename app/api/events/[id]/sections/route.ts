import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const { name } = body

  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const maxSection = await prisma.eventSection.findFirst({
    where: { eventId: id },
    orderBy: { sortOrder: 'desc' },
  })

  const section = await prisma.eventSection.create({
    data: {
      eventId: id,
      name,
      sortOrder: (maxSection?.sortOrder ?? -1) + 1,
    },
    include: { tasks: true },
  })

  return NextResponse.json(section, { status: 201 })
}

export async function PATCH(request: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { order } = body

  if (!order?.length) return NextResponse.json({ error: 'Order required' }, { status: 400 })

  await Promise.all(
    order.map((sectionId: string, i: number) =>
      prisma.eventSection.update({
        where: { id: sectionId },
        data: { sortOrder: i },
      })
    )
  )

  return NextResponse.json({ success: true })
}
