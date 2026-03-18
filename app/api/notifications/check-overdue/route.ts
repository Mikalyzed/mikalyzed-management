import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { DEFAULT_SLA_HOURS, STAGE_LABELS } from '@/lib/constants'
import type { Stage } from '@/lib/constants'
import { sendNotificationEmail } from '@/lib/email'
import { overdueAlertEmail } from '@/lib/email-templates'

export async function POST() {
  // Get all active (non-completed) vehicle stages
  const activeStages = await prisma.vehicleStage.findMany({
    where: { status: { not: 'done' } },
    include: { vehicle: true },
  })

  // Get SLA configs
  const configs = await prisma.stageConfig.findMany()
  const slaMap = new Map(configs.map((c) => [c.stage, c.slaHours]))

  // Get admin users
  const admins = await prisma.user.findMany({ where: { role: 'admin', isActive: true } })
  if (admins.length === 0) return NextResponse.json({ sent: 0 })

  let sent = 0

  for (const vs of activeStages) {
    const slaHours = slaMap.get(vs.stage) ?? DEFAULT_SLA_HOURS[vs.stage as Stage] ?? 24
    const elapsed = (Date.now() - vs.startedAt.getTime()) / 3600000
    if (elapsed <= slaHours) continue

    // Check if already notified
    const existing = await prisma.notification.findFirst({
      where: { type: 'overdue', entityId: vs.id },
    })
    if (existing) continue

    const vehicleDesc = `${vs.vehicle.year ?? ''} ${vs.vehicle.make} ${vs.vehicle.model} (${vs.vehicle.stockNumber})`.trim()
    const stageLabel = STAGE_LABELS[vs.stage as Stage] || vs.stage
    const hoursOverdue = elapsed - slaHours

    for (const admin of admins) {
      const { subject, html } = overdueAlertEmail({
        vehicleDesc,
        stage: stageLabel,
        hoursOverdue,
        slaHours,
        vehicleId: vs.vehicleId,
      })
      sendNotificationEmail({ to: admin.email, subject, html }).catch(() => {})
      await prisma.notification.create({
        data: {
          userId: admin.id,
          type: 'overdue',
          title: subject,
          message: `${vehicleDesc} overdue in ${stageLabel} by ${Math.round(hoursOverdue)}h`,
          entityType: 'vehicle_stage',
          entityId: vs.id,
        },
      })
      sent++
    }
  }

  return NextResponse.json({ sent })
}
