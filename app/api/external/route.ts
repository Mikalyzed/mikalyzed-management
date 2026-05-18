import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { recomputeInventoryStatus } from '@/lib/inventory-status'

export async function GET() {
  const repairs = await prisma.externalRepair.findMany({
    orderBy: [{ status: 'asc' }, { sentDate: 'desc' }],
  })
  return NextResponse.json({ repairs })
}

export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { stockNumber, year, make, model, color, vendorId, shopName, shopPhone, atDealership, repairDescription, estimatedDays, sentDate, notes, status } = body

  if (!stockNumber || !make || !model || !shopName || !repairDescription) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const isPending = status === 'pending' || !sentDate
  if (!isPending && !sentDate) {
    return NextResponse.json({ error: 'sentDate required unless status is pending' }, { status: 400 })
  }

  const sent = sentDate ? new Date(sentDate) : null
  const expectedReturn = sent && estimatedDays
    ? new Date(sent.getTime() + estimatedDays * 86400000)
    : null

  const repair = await prisma.externalRepair.create({
    data: {
      stockNumber,
      year: year || null,
      make,
      model,
      color: color || null,
      vendorId: vendorId || null,
      shopName,
      shopPhone: shopPhone || null,
      atDealership: !!atDealership,
      repairDescription,
      estimatedDays: estimatedDays || null,
      sentDate: sent,
      expectedReturn,
      status: isPending ? 'pending' : 'sent',
      notes: notes || null,
      createdById: user.id,
    },
  })

  await recomputeInventoryStatus(stockNumber).catch(() => {})

  return NextResponse.json({ repair }, { status: 201 })
}
