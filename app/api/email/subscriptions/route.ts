import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { prisma } from '@/lib/db'
import { getSessionUser, requireRole } from '@/lib/auth'
import {
  createMessageSubscription,
  deleteSubscription,
  isGraphConfigured,
} from '@/lib/graph'

/**
 * Admin-only:
 *  GET  — list active subscriptions
 *  POST — create a subscription for a user (or all sales/sales_manager users)
 *         Body: { userId?, userEmail?, all?: boolean }
 */

function getWebhookBase(req: Request): string {
  // Prefer explicit env var; fall back to deriving from the request host.
  const env = process.env.GRAPH_WEBHOOK_BASE_URL
  if (env) return env.replace(/\/$/, '')
  const url = new URL(req.url)
  return `${url.protocol}//${url.host}`
}

export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!requireRole(user.role, ['admin'])) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }
  const subs = await prisma.emailSubscription.findMany({
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { expiresAt: 'asc' },
  })
  return NextResponse.json({ subscriptions: subs })
}

export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!requireRole(user.role, ['admin'])) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }
  if (!isGraphConfigured()) {
    return NextResponse.json({ error: 'Graph not configured' }, { status: 500 })
  }

  const body = await request.json().catch(() => ({}))
  const webhookUrl = `${getWebhookBase(request)}/api/email/webhook`

  // Resolve target users
  let targets: { id: string; email: string }[] = []
  if (body.all) {
    targets = await prisma.user.findMany({
      where: { isActive: true, role: { in: ['admin', 'sales_manager', 'sales'] } },
      select: { id: true, email: true },
    })
  } else if (body.userId) {
    const u = await prisma.user.findUnique({ where: { id: body.userId }, select: { id: true, email: true } })
    if (u) targets = [u]
  } else if (body.userEmail) {
    const u = await prisma.user.findFirst({ where: { email: body.userEmail }, select: { id: true, email: true } })
    if (u) targets = [u]
  } else {
    return NextResponse.json({ error: 'Provide userId, userEmail, or all=true' }, { status: 400 })
  }

  if (targets.length === 0) {
    return NextResponse.json({ error: 'No matching active users' }, { status: 404 })
  }

  const results: Array<{ email: string; ok: boolean; error?: string; subscriptionId?: string }> = []
  for (const t of targets) {
    try {
      // Tear down any existing subscription for this user first
      const existing = await prisma.emailSubscription.findMany({ where: { userId: t.id } })
      for (const e of existing) {
        await deleteSubscription(e.subscriptionId).catch(() => {})
        await prisma.emailSubscription.delete({ where: { id: e.id } }).catch(() => {})
      }

      const clientState = randomBytes(16).toString('hex')
      const sub = await createMessageSubscription({
        userEmail: t.email,
        notificationUrl: webhookUrl,
        clientState,
      })

      await prisma.emailSubscription.create({
        data: {
          userId: t.id,
          userEmail: t.email,
          subscriptionId: sub.id,
          clientState,
          resource: sub.resource,
          expiresAt: new Date(sub.expirationDateTime),
        },
      })

      results.push({ email: t.email, ok: true, subscriptionId: sub.id })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      results.push({ email: t.email, ok: false, error: msg })
    }
  }

  return NextResponse.json({ webhookUrl, results })
}
