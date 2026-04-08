import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendNotificationEmail } from '@/lib/email'

// Log who's calling this so we can trace the source
export async function GET(req: NextRequest) {
  const headers = Object.fromEntries(req.headers.entries())
  console.log('[parts-check] GET called by:', JSON.stringify({
    userAgent: headers['user-agent'],
    referer: headers['referer'],
    origin: headers['origin'],
    ip: headers['x-forwarded-for'],
    host: headers['host'],
  }))
  // Run the check on GET too (crons use GET)
  return runPartsCheck()
}

export async function POST(req: NextRequest) {
  const headers = Object.fromEntries(req.headers.entries())
  console.log('[parts-check] POST called by:', JSON.stringify({
    userAgent: headers['user-agent'],
    referer: headers['referer'],
    origin: headers['origin'],
    ip: headers['x-forwarded-for'],
    host: headers['host'],
  }))
  return runPartsCheck()
}

async function runPartsCheck() {
  const now = new Date()
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date(now)
  todayEnd.setHours(23, 59, 59, 999)

  // Check if we already sent the daily email
  const emailSentToday = await prisma.notification.findFirst({
    where: { entityType: 'parts_check_email', createdAt: { gte: todayStart } },
  })

  if (emailSentToday) {
    return NextResponse.json({ checked: true, alreadySent: true, alerts: 0 })
  }

  // Find parts from the Part model with expected delivery today or overdue
  const dueParts = await prisma.part.findMany({
    where: {
      status: 'ordered',
      expectedDelivery: { lte: todayEnd },
    },
    include: {
      vehicle: { select: { id: true, stockNumber: true, year: true, make: true, model: true } },
      requestedBy: { select: { name: true } },
    },
  })

  // Also check old vehicle stages awaiting parts
  const dueStages = await prisma.vehicleStage.findMany({
    where: {
      awaitingParts: true,
      awaitingPartsDate: { lte: todayEnd },
    },
    include: {
      vehicle: { select: { id: true, stockNumber: true, year: true, make: true, model: true } },
    },
  })

  const totalAlerts = dueParts.length + dueStages.length

  if (totalAlerts === 0) {
    return NextResponse.json({ checked: true, alerts: 0 })
  }

  // Build email content
  const partItems = dueParts.map(p => {
    const v = p.vehicle
    const dateStr = p.expectedDelivery
      ? new Date(p.expectedDelivery).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : 'today'
    const isOverdue = p.expectedDelivery && new Date(p.expectedDelivery) < todayStart
    return `<tr>
      <td style="padding: 8px 12px; border-bottom: 1px solid #f0f0f0; font-size: 14px;">#${v.stockNumber} ${v.year ?? ''} ${v.make} ${v.model}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #f0f0f0; font-size: 14px; font-weight: 600;">${p.name}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #f0f0f0; font-size: 14px; color: ${isOverdue ? '#ef4444' : '#2563eb'};">${isOverdue ? 'Overdue' : dateStr}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #f0f0f0; font-size: 13px; color: #666;">${p.tracking || '—'}</td>
    </tr>`
  }).join('')

  const stageItems = dueStages.map(s => {
    const v = s.vehicle
    const dateStr = s.awaitingPartsDate
      ? new Date(s.awaitingPartsDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : 'today'
    return `<tr>
      <td style="padding: 8px 12px; border-bottom: 1px solid #f0f0f0; font-size: 14px;">#${v.stockNumber} ${v.year ?? ''} ${v.make} ${v.model}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #f0f0f0; font-size: 14px; font-weight: 600;">${s.awaitingPartsName || 'Unknown part'}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #f0f0f0; font-size: 14px; color: #2563eb;">${dateStr}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #f0f0f0; font-size: 13px; color: #666;">${s.awaitingPartsTracking || '—'}</td>
    </tr>`
  }).join('')

  const allItems = partItems + stageItems

  // Mark email as sent BEFORE sending (prevents duplicates from concurrent calls)
  const admins = await prisma.user.findMany({ where: { role: 'admin', isActive: true } })
  await prisma.notification.create({
    data: {
      userId: admins[0]?.id || '',
      type: 'parts_due_email',
      title: `Parts check: ${totalAlerts} parts arriving today`,
      entityType: 'parts_check_email',
      entityId: 'daily',
    },
  })

  // Send email
  await sendNotificationEmail({
    to: 'ab-management@mikalyzedautoboutique.com',
    subject: `Parts Alert: ${totalAlerts} part${totalAlerts > 1 ? 's' : ''} expected today`,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 600px;">
        <h2 style="font-size: 18px; margin-bottom: 4px;">Parts Expected Today</h2>
        <p style="color: #666; font-size: 14px; margin-top: 0;">The following parts are expected to arrive today or are overdue:</p>
        <table style="width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
          <thead>
            <tr style="background: #f9fafb;">
              <th style="padding: 8px 12px; text-align: left; font-size: 12px; font-weight: 600; color: #6b7280;">Vehicle</th>
              <th style="padding: 8px 12px; text-align: left; font-size: 12px; font-weight: 600; color: #6b7280;">Part</th>
              <th style="padding: 8px 12px; text-align: left; font-size: 12px; font-weight: 600; color: #6b7280;">Expected</th>
              <th style="padding: 8px 12px; text-align: left; font-size: 12px; font-weight: 600; color: #6b7280;">Tracking</th>
            </tr>
          </thead>
          <tbody>
            ${allItems}
          </tbody>
        </table>
        <p style="color: #999; font-size: 12px; margin-top: 16px;">
          <a href="https://mikalyzed-management.vercel.app/parts" style="color: #2563eb;">View Parts Management</a>
        </p>
      </div>
    `,
  })

  // Create in-app notifications
  for (const part of dueParts) {
    const v = part.vehicle
    const title = `Part arriving today: ${part.name} for #${v.stockNumber} ${v.year ?? ''} ${v.make} ${v.model}`
    const notifData = admins.map(admin => ({
      userId: admin.id,
      type: 'parts_due',
      title,
      entityType: 'parts_check',
      entityId: part.id,
    }))
    await prisma.notification.createMany({ data: notifData, skipDuplicates: true })
  }

  return NextResponse.json({ checked: true, alerts: totalAlerts, emailSent: true })
}
