import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, canSeeAllLeads } from '@/lib/auth'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const contact = await prisma.contact.findUnique({
    where: { id },
    include: {
      opportunities: {
        include: {
          pipeline: { select: { id: true, name: true, color: true } },
          stage: { select: { id: true, name: true, type: true } },
          assignee: { select: { id: true, name: true } },
          vehicle: { select: { id: true, stockNumber: true, year: true, make: true, model: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
      createdBy: { select: { id: true, name: true } },
    },
  })

  if (!contact) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Sales reps can only access contacts they have at least one opportunity with
  if (!canSeeAllLeads(user.role)) {
    const hasOwnOpp = contact.opportunities.some(o => o.assigneeId === user.id)
    if (!hasOwnOpp) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
  }

  return NextResponse.json(contact)
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // Same access guard as GET — reps can only edit contacts they own an opp on
  if (!canSeeAllLeads(user.role)) {
    const ownOpp = await prisma.opportunity.findFirst({
      where: { contactId: id, assigneeId: user.id },
      select: { id: true },
    })
    if (!ownOpp) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await request.json()
  const { firstName, lastName, email, phone, secondaryPhone, address, city, state, zip, source, tags, notes } = body

  const data: Record<string, unknown> = {}
  if (firstName !== undefined) data.firstName = firstName
  if (lastName !== undefined) data.lastName = lastName
  if (email !== undefined) data.email = email || null
  if (phone !== undefined) data.phone = phone || null
  if (secondaryPhone !== undefined) data.secondaryPhone = secondaryPhone || null
  if (address !== undefined) data.address = address || null
  if (city !== undefined) data.city = city || null
  if (state !== undefined) data.state = state || null
  if (zip !== undefined) data.zip = zip || null
  if (source !== undefined) data.source = source
  if (tags !== undefined) data.tags = tags
  if (notes !== undefined) data.notes = notes || null

  const contact = await prisma.contact.update({ where: { id }, data })
  return NextResponse.json(contact)
}
