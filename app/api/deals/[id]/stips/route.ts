import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { prisma } from '@/lib/db'
import { getSessionUser, requireRole } from '@/lib/auth'
import { sendSMS } from '@/lib/twilio'
import { sendNotificationEmail } from '@/lib/email'
import { formatDealNumber } from '@/lib/deals'

function dealAccess(role: string) {
  return requireRole(role, ['sales_manager'])
}

type StipBody = { name?: unknown; instruction?: unknown; forBuyer?: unknown; forCoBuyer?: unknown }

/**
 * POST /api/deals/:id/stips — save the requested stips and send the buyer
 * a tokenized upload link via the chosen channel.
 *
 * Body: {
 *   stips: [{ name, instruction?, forBuyer, forCoBuyer }],
 *   channel: 'email' | 'sms',
 *   saveTemplates?: [{ name, instruction? }]   // custom stips to keep for future deals
 * }
 *
 * Sending today uses the dealership's existing channels (Twilio number +
 * the management@ Resend address). When the dedicated admin-sales number /
 * mailbox exist, this is the single place to swap them in.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!dealAccess(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const deal = await prisma.deal.findUnique({
    where: { id },
    select: {
      id: true, dealNumber: true, status: true, dealType: true,
      buyerContactId: true,
      buyer: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
      vehicle: { select: { year: true, make: true, model: true } },
    },
  })
  if (!deal) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (deal.dealType === 'wholesale' || !deal.buyer) {
    return NextResponse.json({ error: 'Stipulations are for retail deals with a buyer attached' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const channel = body.channel === 'sms' ? 'sms' : 'email'
  const rawStips: StipBody[] = Array.isArray(body.stips) ? body.stips : []
  const stips = rawStips
    .map(s => ({
      name: typeof s.name === 'string' ? s.name.trim() : '',
      instruction: typeof s.instruction === 'string' && s.instruction.trim() ? s.instruction.trim() : null,
      forBuyer: s.forBuyer !== false,
      forCoBuyer: s.forCoBuyer === true,
    }))
    .filter(s => s.name)
  if (stips.length === 0) {
    return NextResponse.json({ error: 'Pick at least one stipulation' }, { status: 400 })
  }

  // Channel prerequisites live on the buyer's contact record.
  if (channel === 'sms' && !deal.buyer.phone) {
    return NextResponse.json({ error: 'The buyer has no phone on file' }, { status: 400 })
  }
  if (channel === 'email' && !deal.buyer.email) {
    return NextResponse.json({ error: 'The buyer has no email on file' }, { status: 400 })
  }

  // Persist any custom stips flagged "save for future".
  if (Array.isArray(body.saveTemplates)) {
    for (const t of body.saveTemplates as StipBody[]) {
      const name = typeof t.name === 'string' ? t.name.trim() : ''
      if (!name) continue
      await prisma.stipTemplate.upsert({
        where: { name },
        create: { name, instruction: typeof t.instruction === 'string' ? t.instruction.trim() || null : null },
        update: { instruction: typeof t.instruction === 'string' ? t.instruction.trim() || null : null },
      }).catch(() => { /* best-effort */ })
    }
  }

  // Upload link — 7 days, reuses the existing public /u/[token] flow.
  const token = randomBytes(16).toString('base64url')
  await prisma.uploadLink.create({
    data: {
      token,
      contactId: deal.buyer.id,
      createdById: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  })
  const uploadUrl = `${new URL(req.url).origin}/u/${token}`

  // Record the stip rows.
  await prisma.dealStipulation.createMany({
    data: stips.map(s => ({ ...s, dealId: id, sentVia: channel })),
  })

  // Compose + send.
  const vehicleName = [deal.vehicle.year, deal.vehicle.make, deal.vehicle.model].filter(Boolean).join(' ')
  const stipNames = stips.map(s => s.name)

  if (channel === 'sms') {
    const smsBody =
      `Mikalyzed Auto Boutique: Hi ${deal.buyer.firstName}, to complete your ${vehicleName} purchase we need: ` +
      `${stipNames.join(', ')}. Upload securely here (link expires in 7 days): ${uploadUrl}`
    await sendSMS({ to: deal.buyer.phone!, body: smsBody })
  } else {
    const rows = stips.map(s => `
      <tr>
        <td style="padding:10px 14px;border-bottom:1px solid #eee;font-weight:600;">${s.name}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #eee;color:#555;">${s.instruction ?? ''}</td>
      </tr>`).join('')
    await sendNotificationEmail({
      to: deal.buyer.email!,
      subject: `Documents needed for your ${vehicleName} — Mikalyzed Auto Boutique`,
      html: `
        <div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;">
          <h2 style="letter-spacing:-0.01em;">Almost there, ${deal.buyer.firstName}!</h2>
          <p style="color:#444;line-height:1.6;">To complete your <strong>${vehicleName}</strong> purchase, please send us the following:</p>
          <table style="width:100%;border-collapse:collapse;margin:14px 0;">${rows}</table>
          <p style="margin:22px 0;">
            <a href="${uploadUrl}" style="background:#1a1a1a;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600;">Upload documents securely</a>
          </p>
          <p style="color:#888;font-size:12px;">This link expires in 7 days. Questions? Just reply to this email.</p>
        </div>`,
    })
  }

  await prisma.activityLog.create({
    data: {
      entityType: 'deal', entityId: id, action: 'stips_requested', actorId: user.id,
      details: { dealNumber: deal.dealNumber, channel, stips: stipNames, uploadToken: token },
    },
  }).catch(() => {})

  const stipulations = await prisma.dealStipulation.findMany({
    where: { dealId: id }, orderBy: { requestedAt: 'asc' },
  })
  return NextResponse.json({ stipulations, sent: channel, dealNumber: formatDealNumber(deal.dealNumber) })
}

/** PATCH /api/deals/:id/stips — toggle a stip received/pending or remove it. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!dealAccess(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const stipId = typeof body.stipId === 'string' ? body.stipId : null
  if (!stipId) return NextResponse.json({ error: 'stipId required' }, { status: 400 })

  const stip = await prisma.dealStipulation.findFirst({ where: { id: stipId, dealId: id } })
  if (!stip) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (body.remove === true) {
    await prisma.dealStipulation.delete({ where: { id: stipId } })
  } else {
    const received = body.status === 'received'
    await prisma.dealStipulation.update({
      where: { id: stipId },
      data: { status: received ? 'received' : 'pending', receivedAt: received ? new Date() : null },
    })
  }

  const stipulations = await prisma.dealStipulation.findMany({
    where: { dealId: id }, orderBy: { requestedAt: 'asc' },
  })
  return NextResponse.json({ stipulations })
}
