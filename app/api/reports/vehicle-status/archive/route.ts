import { NextResponse } from 'next/server'
import { getSessionUser, requireRole } from '@/lib/auth'
import { buildVehicleStatusReport } from '@/lib/reports/vehicle-status'
import { detectBottlenecks } from '@/lib/reports/bottlenecks'
import { renderVehicleStatusPdf } from '@/lib/reports/pdf'
import { isR2Configured, putObject, listObjects, presignGet } from '@/lib/r2'

const PREFIX = 'meeting-archive/'

/**
 * Meeting archive — saved snapshots of the Morning Meeting status report.
 *
 * POST (admin): render today's report PDF and store it in R2 as
 *   meeting-archive/inventory-status-YYYY-MM-DD.pdf (same-day saves overwrite,
 *   so "the meeting" is always the day's latest save).
 * GET (admin / sales manager / shop coordinator): list saved meetings with
 *   1-hour download links — how the Shop Coordinator references past meetings.
 */
export async function POST() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!isR2Configured()) return NextResponse.json({ error: 'Storage not configured' }, { status: 503 })

  const report = await buildVehicleStatusReport()
  const bottlenecks = detectBottlenecks(report)
  const bytes = await renderVehicleStatusPdf(report, bottlenecks)
  const date = report.generatedAt.slice(0, 10)
  const key = `${PREFIX}inventory-status-${date}.pdf`
  await putObject(key, Buffer.from(bytes), 'application/pdf')

  return NextResponse.json({ ok: true, date, key })
}

export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!requireRole(user.role, ['sales_manager', 'shop_coordinator'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!isR2Configured()) return NextResponse.json({ meetings: [] })

  const objects = await listObjects(PREFIX)
  const meetings = await Promise.all(
    objects
      .filter(o => o.key.endsWith('.pdf'))
      .sort((a, b) => b.key.localeCompare(a.key))
      .slice(0, 60)
      .map(async o => ({
        date: o.key.slice(PREFIX.length).replace('inventory-status-', '').replace('.pdf', ''),
        savedAt: o.lastModified?.toISOString() ?? null,
        url: await presignGet(o.key, 3600),
      })),
  )
  return NextResponse.json({ meetings })
}
