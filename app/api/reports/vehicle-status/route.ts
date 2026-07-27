import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, requireRole } from '@/lib/auth'
import { buildVehicleStatusReport } from '@/lib/reports/vehicle-status'
import { detectBottlenecks } from '@/lib/reports/bottlenecks'
import { renderVehicleStatusPdf } from '@/lib/reports/pdf'

/**
 * GET /api/reports/vehicle-status — the management inventory snapshot.
 *   ?format=pdf → downloadable PDF (used by the Reports page button and the
 *                 AskAI report link)
 *   default     → JSON (same data, for future report views)
 * Always built fresh from the DB at request time.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // Management report — carries asking prices, so money-gated (admin implicit).
  if (!requireRole(user.role, ['sales_manager'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const report = await buildVehicleStatusReport()
  const bottlenecks = detectBottlenecks(report)

  if (req.nextUrl.searchParams.get('format') === 'pdf') {
    const bytes = await renderVehicleStatusPdf(report, bottlenecks)
    const stamp = report.generatedAt.slice(0, 10)
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="inventory-status-${stamp}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  }

  return NextResponse.json({ ...report, bottlenecks })
}
