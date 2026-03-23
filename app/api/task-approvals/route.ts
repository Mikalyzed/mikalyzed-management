import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function GET() {
  const user = await getSessionUser()
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const approvals = await prisma.taskApproval.findMany({
    where: { status: 'pending' },
    include: {
      vehicleStage: {
        include: {
          vehicle: { select: { id: true, stockNumber: true, year: true, make: true, model: true, color: true } },
        },
      },
      requestedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ approvals })
}

export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { vehicleStageId, taskName, additionalHours } = await request.json()
  if (!vehicleStageId || !taskName) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const stage = await prisma.vehicleStage.findUnique({
    where: { id: vehicleStageId },
    include: { vehicle: { select: { stockNumber: true, year: true, make: true, model: true } } },
  })
  if (!stage) return NextResponse.json({ error: 'Stage not found' }, { status: 404 })

  const approval = await prisma.taskApproval.create({
    data: {
      vehicleStageId,
      taskName,
      additionalHours: additionalHours || null,
      requestedById: user.id,
    },
  })

  // Notify all admin users
  const admins = await prisma.user.findMany({ where: { role: 'admin', isActive: true } })
  const v = stage.vehicle
  const vehicleDesc = `${v.year ?? ''} ${v.make} ${v.model}`.trim()
  await prisma.notification.createMany({
    data: admins.map(admin => ({
      userId: admin.id,
      type: 'task_approval_request',
      title: `New task request: ${taskName} for #${v.stockNumber} ${vehicleDesc}`,
      entityType: 'task_approval',
      entityId: approval.id,
    })),
  })

  return NextResponse.json({ approval })
}
