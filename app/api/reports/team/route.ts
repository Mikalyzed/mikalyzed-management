import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { buildTeamActivity } from '@/lib/reports/team-activity'
import { buildShopKpis } from '@/lib/reports/kpis'

/**
 * GET /api/reports/team?week=YYYY-MM-DD — per-person weekly activity + shop
 * KPIs for the Reports page. `week` is the Monday of the desired week (local
 * server time); defaults to the current week's Monday.
 * Admin only — this is a management view of everyone's output.
 */

function toYmd(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const weekParam = req.nextUrl.searchParams.get('week')
  let weekStart: Date
  if (weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam)) {
    weekStart = new Date(`${weekParam}T00:00:00`)
  } else {
    const now = new Date()
    const backToMonday = (now.getDay() + 6) % 7
    weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - backToMonday)
  }
  if (isNaN(weekStart.getTime())) {
    return NextResponse.json({ error: 'Invalid week' }, { status: 400 })
  }
  const weekEnd = new Date(weekStart.getTime() + 7 * 86400000)

  const [team, kpis] = await Promise.all([
    buildTeamActivity(weekStart, weekEnd),
    buildShopKpis(weekStart, weekEnd),
  ])

  return NextResponse.json({
    people: team.people,
    kpis,
    weekStart: toYmd(weekStart),
    weekEnd: toYmd(weekEnd),
  })
}
