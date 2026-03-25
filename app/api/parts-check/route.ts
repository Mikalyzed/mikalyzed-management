import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendNotificationEmail } from '@/lib/email'

// Check for parts with expected delivery dates that have passed or are today
// Called by cron or manually
export async function POST() {
  const now = new Date()
  const todayEnd = new Date(now)
  todayEnd.setHours(23, 59, 59, 999)

  // Find stages awaiting parts with expected date <= today
  const dueStages = await prisma.vehicleStage.findMany({
    where: {
      awaitingParts: true,
      awaitingPartsDate: { lte: todayEnd },
    },
    include: {
      vehicle: { select: { id: true, stockNumber: true, year: true, make: true, model: true, color: true } },
      assignee: { select: { id: true, name: true } },
    },
  })

  if (dueStages.length === 0) {
    return NextResponse.json({ checked: true, alerts: 0 })
  }

  // Create notifications for admins and assigned mechanic
  const admins = await prisma.user.findMany({ where: { role: 'admin', isActive: true } })

  for (const stage of dueStages) {
    const v = stage.vehicle
    const desc = `${v.year ?? ''} ${v.make} ${v.model}`.trim()
    const partName = stage.awaitingPartsName || 'Unknown part'
    const dateStr = stage.awaitingPartsDate
      ? new Date(stage.awaitingPartsDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : 'today'

    const title = `Parts expected ${dateStr} for #${v.stockNumber} ${desc} — ${partName}`

    // Check if we already notified today (avoid spam)
    const todayStart = new Date(now)
    todayStart.setHours(0, 0, 0, 0)
    const existingNotification = await prisma.notification.findFirst({
      where: {
        entityType: 'parts_check',
        entityId: stage.id,
        createdAt: { gte: todayStart },
      },
    })

    if (existingNotification) continue // Already notified today

    // Notify admins
    const notifData = admins.map(admin => ({
      userId: admin.id,
      type: 'parts_due',
      title,
      entityType: 'parts_check',
      entityId: stage.id,
    }))

    // Also notify assigned mechanic if any
    if (stage.assignee) {
      notifData.push({
        userId: stage.assignee.id,
        type: 'parts_due',
        title,
        entityType: 'parts_check',
        entityId: stage.id,
      })
    }

    await prisma.notification.createMany({ data: notifData })
  }

  // Also send email summary to management
  if (dueStages.length > 0) {
    const items = dueStages.map(s => {
      const v = s.vehicle
      return `#${v.stockNumber} ${v.year ?? ''} ${v.make} ${v.model} — ${s.awaitingPartsName || 'Unknown'}`
    }).join('<br>')

    await sendNotificationEmail({
      to: 'ab-management@mikalyzedautoboutique.com',
      subject: `Parts Alert: ${dueStages.length} vehicle${dueStages.length > 1 ? 's' : ''} expecting parts today`,
      html: `
        <div style="font-family: -apple-system, sans-serif; max-width: 500px;">
          <h2 style="font-size: 18px;">Parts Expected Today</h2>
          <p style="color: #666; font-size: 14px;">The following vehicles have parts that were expected by today:</p>
          <div style="background: #fefce8; border: 1px solid #eab308; border-radius: 10px; padding: 16px; font-size: 14px;">
            ${items}
          </div>
          <p style="color: #999; font-size: 12px; margin-top: 16px;">Check the mechanic board for details and update status when parts arrive.</p>
        </div>
      `,
    })
  }

  return NextResponse.json({ checked: true, alerts: dueStages.length })
}
