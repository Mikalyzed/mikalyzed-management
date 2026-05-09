import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { isGraphConfigured, renewSubscription } from '@/lib/graph'

/**
 * POST /api/email/subscriptions/renew — renews any subscription expiring within
 * the next 24 hours. Designed to be called by a daily cron (Vercel cron).
 * Auth: requires X-Cron-Secret header matching CRON_SECRET env var.
 *
 * Graph subscriptions on /messages can live up to ~70 hours. We renew them
 * once a day to stay well ahead of expiration.
 */
export async function GET(request: Request) {
  return POST(request)
}

export async function POST(request: Request) {
  if (!isGraphConfigured()) return NextResponse.json({ error: 'Graph not configured' }, { status: 500 })

  // Optional shared-secret auth for cron callers
  const expected = process.env.CRON_SECRET
  if (expected) {
    const provided = request.headers.get('x-cron-secret') || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    if (provided !== expected) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const cutoff = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const expiring = await prisma.emailSubscription.findMany({ where: { expiresAt: { lt: cutoff } } })

  const results: Array<{ id: string; ok: boolean; error?: string; newExpiresAt?: string }> = []
  for (const sub of expiring) {
    try {
      const result = await renewSubscription(sub.subscriptionId)
      const newExpires = new Date(result.expirationDateTime)
      await prisma.emailSubscription.update({
        where: { id: sub.id },
        data: { expiresAt: newExpires },
      })
      results.push({ id: sub.id, ok: true, newExpiresAt: newExpires.toISOString() })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      results.push({ id: sub.id, ok: false, error: msg })
    }
  }

  return NextResponse.json({ checked: expiring.length, results })
}
