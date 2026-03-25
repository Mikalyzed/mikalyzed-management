import { NextResponse, NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { sendNotificationEmail } from '@/lib/email'

const STAGE_LABELS: Record<string, string> = {
  mechanic: 'Mechanic',
  detailing: 'Detailing',
  content: 'Content',
  publish: 'Publish',
}

function formatHours(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const dateStr = body.date // optional: "2026-03-24" to generate for a specific day
  
  const targetDate = dateStr ? new Date(dateStr + 'T00:00:00') : new Date()
  const dayStart = new Date(targetDate)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(targetDate)
  dayEnd.setHours(23, 59, 59, 999)

  const dayLabel = targetDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  // Stage order for validating forward progress
  const STAGE_ORDER: Record<string, number> = { mechanic: 0, detailing: 1, content: 2, publish: 3, completed: 4 }

  const vSelect = { stockNumber: true, year: true, make: true, model: true, color: true, status: true } as const
  const aSelect = { select: { name: true } } as const

  // Helper: filter out completions where vehicle went backwards (current stage ≤ completed stage)
  type StageWithVehicle = { stage: string; vehicle: { status: string }; [key: string]: unknown }
  const isRealCompletion = (s: StageWithVehicle) => {
    const completedIdx = STAGE_ORDER[s.stage] ?? -1
    const currentIdx = STAGE_ORDER[s.vehicle.status] ?? -1
    return currentIdx > completedIdx
  }

  // --- MECHANIC ---
  const mechanicCompletedRaw = await prisma.vehicleStage.findMany({
    where: { stage: 'mechanic', status: 'done', completedAt: { gte: dayStart, lte: dayEnd } },
    include: { vehicle: { select: vSelect }, assignee: aSelect },
  })
  const mechanicCompleted = mechanicCompletedRaw.filter(isRealCompletion)

  const mechanicActive = await prisma.vehicleStage.findMany({
    where: { stage: 'mechanic', status: 'in_progress' },
    include: { vehicle: { select: vSelect }, assignee: aSelect },
  })

  const mechanicAwaiting = await prisma.vehicleStage.findMany({
    where: { stage: 'mechanic', awaitingParts: true },
    include: { vehicle: { select: vSelect } },
  })

  const timeExtensions = await prisma.taskApproval.findMany({
    where: {
      taskName: { startsWith: 'Time extension:' },
      status: 'approved',
      reviewedAt: { gte: dayStart, lte: dayEnd },
    },
    include: { vehicleStage: { include: { vehicle: { select: { stockNumber: true } } } } },
  })

  // --- DETAILING ---
  const detailingCompletedRaw = await prisma.vehicleStage.findMany({
    where: { stage: 'detailing', status: 'done', completedAt: { gte: dayStart, lte: dayEnd } },
    include: { vehicle: { select: vSelect }, assignee: aSelect },
  })
  const detailingCompleted = detailingCompletedRaw.filter(isRealCompletion)

  const detailingActive = await prisma.vehicleStage.findMany({
    where: { stage: 'detailing', status: 'in_progress' },
    include: { vehicle: { select: vSelect }, assignee: aSelect },
  })

  // --- CONTENT ---
  const contentCompletedRaw = await prisma.vehicleStage.findMany({
    where: { stage: 'content', status: 'done', completedAt: { gte: dayStart, lte: dayEnd } },
    include: { vehicle: { select: vSelect }, assignee: aSelect },
  })
  const contentCompleted = contentCompletedRaw.filter(isRealCompletion)

  const contentActive = await prisma.vehicleStage.findMany({
    where: { stage: 'content', status: 'in_progress' },
    include: { vehicle: { select: vSelect }, assignee: aSelect },
  })

  // --- OVERALL STATS ---
  const totalVehicles = await prisma.vehicle.count({ where: { status: { notIn: ['completed', 'sold'] } } })
  const inRecon = await prisma.vehicle.count({ where: { status: 'in_recon' } })
  const published = await prisma.vehicleStage.count({ where: { stage: 'publish', status: 'done', completedAt: { gte: dayStart, lte: dayEnd } } })

  // External repairs active
  const externalActive = await prisma.externalRepair.count({ where: { status: 'sent' } })

  // Build HTML
  const vDesc = (v: { stockNumber: string; year: number | null; make: string; model: string; color: string | null }) =>
    `<strong>#${v.stockNumber}</strong> ${v.year ?? ''} ${v.make} ${v.model}${v.color ? ` · ${v.color}` : ''}`

  const sectionStyle = 'margin-bottom: 24px;'
  const headerStyle = 'font-size: 16px; font-weight: 700; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 2px solid #e2e5ea;'
  const itemStyle = 'padding: 6px 0; font-size: 14px; color: #333;'
  const badgeStyle = (color: string) => `display: inline-block; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 100px; background: ${color}18; color: ${color}; margin-left: 8px;`
  const emptyStyle = 'color: #999; font-style: italic; font-size: 13px;'

  let html = `
    <div style="max-width: 600px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a1a;">
      <div style="background: #1a1a1a; color: #fff; padding: 20px 24px; border-radius: 12px 12px 0 0;">
        <h1 style="margin: 0; font-size: 20px; font-weight: 700;">End of Day Report</h1>
        <p style="margin: 4px 0 0; font-size: 13px; color: #999;">${dayLabel}</p>
      </div>
      <div style="padding: 24px; background: #fff; border: 1px solid #e2e5ea; border-top: none; border-radius: 0 0 12px 12px;">

        <!-- Quick Stats -->
        <div style="display: flex; gap: 12px; margin-bottom: 24px; flex-wrap: wrap;">
          <div style="flex: 1; min-width: 100px; background: #f9fafb; border-radius: 10px; padding: 12px; text-align: center;">
            <div style="font-size: 24px; font-weight: 700;">${mechanicCompleted.length}</div>
            <div style="font-size: 11px; color: #666; font-weight: 600;">Mechanic Done</div>
          </div>
          <div style="flex: 1; min-width: 100px; background: #f9fafb; border-radius: 10px; padding: 12px; text-align: center;">
            <div style="font-size: 24px; font-weight: 700;">${detailingCompleted.length}</div>
            <div style="font-size: 11px; color: #666; font-weight: 600;">Detailing Done</div>
          </div>
          <div style="flex: 1; min-width: 100px; background: #f9fafb; border-radius: 10px; padding: 12px; text-align: center;">
            <div style="font-size: 24px; font-weight: 700;">${contentCompleted.length}</div>
            <div style="font-size: 11px; color: #666; font-weight: 600;">Content Done</div>
          </div>
          <div style="flex: 1; min-width: 100px; background: #f9fafb; border-radius: 10px; padding: 12px; text-align: center;">
            <div style="font-size: 24px; font-weight: 700;">${published}</div>
            <div style="font-size: 11px; color: #666; font-weight: 600;">Published</div>
          </div>
        </div>

        <!-- Mechanic -->
        <div style="${sectionStyle}">
          <div style="${headerStyle}">Mechanic</div>
          ${mechanicCompleted.length > 0 ? mechanicCompleted.map(s => `
            <div style="${itemStyle}">${vDesc(s.vehicle)} <span style="${badgeStyle('#22c55e')}">Completed</span>
              ${s.assignee ? `<span style="font-size: 12px; color: #666;"> — ${s.assignee.name}</span>` : ''}
              ${s.estimatedHours ? `<span style="font-size: 12px; color: #666;"> (${formatHours(s.activeSeconds || 0)} / ${s.estimatedHours}h est.)</span>` : ''}
            </div>
          `).join('') : ''}
          ${mechanicActive.length > 0 ? mechanicActive.map(s => `
            <div style="${itemStyle}">${vDesc(s.vehicle)} <span style="${badgeStyle('#3b82f6')}">In Progress</span>
              ${s.assignee ? `<span style="font-size: 12px; color: #666;"> — ${s.assignee.name}</span>` : ''}
              ${s.estimatedHours ? `<span style="font-size: 12px; color: #666;"> (${formatHours(s.activeSeconds || 0)} / ${s.estimatedHours}h est.)</span>` : ''}
            </div>
          `).join('') : ''}
          ${mechanicAwaiting.length > 0 ? `<div style="margin-top: 8px; font-size: 13px; font-weight: 600; color: #eab308;">Waiting on Parts: ${mechanicAwaiting.length} vehicle${mechanicAwaiting.length > 1 ? 's' : ''}</div>` : ''}
          ${timeExtensions.length > 0 ? `<div style="margin-top: 8px; font-size: 12px; color: #666;">Time extensions today: ${timeExtensions.map(t => `#${t.vehicleStage.vehicle.stockNumber} (+${t.additionalHours}h)`).join(', ')}</div>` : ''}
          ${mechanicCompleted.length === 0 && mechanicActive.length === 0 ? `<div style="${emptyStyle}">No mechanic activity today</div>` : ''}
        </div>

        <!-- Detailing -->
        <div style="${sectionStyle}">
          <div style="${headerStyle}">Detailing</div>
          ${detailingCompleted.length > 0 ? detailingCompleted.map(s => `
            <div style="${itemStyle}">${vDesc(s.vehicle)} <span style="${badgeStyle('#22c55e')}">Completed</span>
              ${s.assignee ? `<span style="font-size: 12px; color: #666;"> — ${s.assignee.name}</span>` : ''}
            </div>
          `).join('') : ''}
          ${detailingActive.length > 0 ? detailingActive.map(s => `
            <div style="${itemStyle}">${vDesc(s.vehicle)} <span style="${badgeStyle('#3b82f6')}">In Progress</span>
              ${s.assignee ? `<span style="font-size: 12px; color: #666;"> — ${s.assignee.name}</span>` : ''}
            </div>
          `).join('') : ''}
          ${detailingCompleted.length === 0 && detailingActive.length === 0 ? `<div style="${emptyStyle}">No detailing activity today</div>` : ''}
        </div>

        <!-- Content -->
        <div style="${sectionStyle}">
          <div style="${headerStyle}">Content</div>
          ${contentCompleted.length > 0 ? contentCompleted.map(s => `
            <div style="${itemStyle}">${vDesc(s.vehicle)} <span style="${badgeStyle('#22c55e')}">Completed</span>
              ${s.assignee ? `<span style="font-size: 12px; color: #666;"> — ${s.assignee.name}</span>` : ''}
            </div>
          `).join('') : ''}
          ${contentActive.length > 0 ? contentActive.map(s => `
            <div style="${itemStyle}">${vDesc(s.vehicle)} <span style="${badgeStyle('#3b82f6')}">In Progress</span>
              ${s.assignee ? `<span style="font-size: 12px; color: #666;"> — ${s.assignee.name}</span>` : ''}
            </div>
          `).join('') : ''}
          ${contentCompleted.length === 0 && contentActive.length === 0 ? `<div style="${emptyStyle}">No content activity today</div>` : ''}
        </div>

        <!-- Overview -->
        <div style="background: #f9fafb; border-radius: 10px; padding: 16px; font-size: 13px; color: #666;">
          <strong style="color: #1a1a1a;">Overview:</strong> ${inRecon} vehicles in recon · ${externalActive} at external repairs · ${totalVehicles} total inventory
        </div>
      </div>
    </div>
  `

  // Send email
  const emailTo = body.to || 'ab-management@mikalyzedautoboutique.com'
  const result = await sendNotificationEmail({
    to: emailTo,
    subject: `EOD Report — ${dayLabel}`,
    html,
  })

  return NextResponse.json({ success: true, emailSent: !!result, sentTo: emailTo, preview: body.preview ? html : undefined })
}
