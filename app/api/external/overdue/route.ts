import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const overdueRepairs = await prisma.externalRepair.findMany({
    where: {
      status: { not: 'returned' },
      estimatedDays: { not: null },
      expectedReturn: { lt: new Date() }
    },
    select: {
      id: true,
      stockNumber: true,
      year: true,
      make: true,
      model: true,
      shopName: true,
      sentDate: true,
      estimatedDays: true,
      expectedReturn: true,
      followUps: true
    },
    orderBy: { expectedReturn: 'asc' }
  })

  return NextResponse.json({ overdueRepairs })
}