import { NextResponse } from 'next/server'
import { getSessionUser, requireRole } from '@/lib/auth'
import { buildVehicleStatusReport } from '@/lib/reports/vehicle-status'
import { detectBottlenecks } from '@/lib/reports/bottlenecks'
import { refreshPartTracking } from '@/lib/refresh-part-tracking'

/**
 * GET /api/watchlist — the shop watchlist as a standalone surface: every
 * rule-detected bottleneck WITH its typed fix so the page can act inline.
 * Same rules as the morning meeting; no pricing data in any field.
 */
export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!requireRole(user.role, ['shop_coordinator'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await refreshPartTracking().catch(() => {})
  const report = await buildVehicleStatusReport()
  const bottlenecks = detectBottlenecks(report)
  return NextResponse.json({ bottlenecks, generatedAt: new Date().toISOString(), role: user.role })
}
