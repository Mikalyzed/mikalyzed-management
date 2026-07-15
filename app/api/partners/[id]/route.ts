import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

/**
 * GET /api/partners/:id — fetch a single partner with the contact-relevant
 * fields surfaced. Used by the vehicle-detail Source section to display the
 * attached vendor's phone / email / address inline.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const partner = await prisma.partner.findUnique({
    where: { id },
    select: {
      id: true,
      companyName: true,
      phone: true,
      phoneAlternative: true,
      contactName: true,
      contactPhone: true,
      contactCell: true,
      contactEmail: true,
      contactAddress: true,
      shippingAddress: true,
    },
  })
  if (!partner) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ partner })
}
