'use client'

import { useEffect, useState, type CSSProperties } from 'react'

type ReportsData = {
  pipeline: { mechanic: number; detailing: number; content: number; publish: number; completed: number }
  vehiclesInStage: Array<{ id: string; stockNumber: string; year: number | null; make: string; model: string; status: string; stageStatus: string; hoursInStage: number }>
  stageTimes: Array<{ stage: string; avgHours: number; count: number }>
  completedThisWeek: number
  completedThisMonth: number
  totalVehicles: number
  transportOpen: number
  transportDelivered: number
}

type ArchivedMeeting = { date: string; savedAt: string | null; url: string }

// —— Team Activity + Shop KPIs (admin only) ——
type TeamPerson = {
  userId: string
  name: string
  role: string
  hasActivity: boolean
  totals: {
    tasksDone: number
    checklistDone: number
    stagesDone: number
    followUps: number
    activityCounts: Record<string, number>
  }
  highlights: Array<{ kind: string; label: string; stock?: string | null }>
}
type ShopKpis = {
  avgDaysInRecon: number | null
  reconCompletedCount: number
  stageAvgs: Array<{ stage: string; avgHours: number; count: number }>
  sentToExternal: number
  returnedFromExternal: number
  partsCreated: number
  partsReceived: number
  avgPartDays: number | null
  live: { inRecon: number; atExternal: number; awaitingRouting: number }
}
type TeamData = { people: TeamPerson[]; kpis: ShopKpis; weekStart: string; weekEnd: string }

/** Monday of the current week as YYYY-MM-DD (local time). */
function currentMonday(): string {
  const now = new Date()
  const back = (now.getDay() + 6) % 7
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function shiftWeek(ymd: string, weeks: number): string {
  const d = new Date(`${ymd}T00:00:00`)
  d.setDate(d.getDate() + weeks * 7)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function weekLabel(ymd: string): string {
  const start = new Date(`${ymd}T00:00:00`)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${fmt(start)} – ${fmt(end)}`
}

const EYEBROW: CSSProperties = {
  fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em',
  color: 'var(--text-muted)',
}
const CARD: CSSProperties = {
  background: 'var(--bg-card, #fff)', border: '1px solid var(--border)', borderRadius: 14,
}
const STOCK_CHIP: CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: 10.5, fontWeight: 600, background: 'var(--bg-primary, #f8f8f6)',
  border: '1px solid var(--border)', padding: '1px 6px', borderRadius: 6,
  whiteSpace: 'nowrap', flexShrink: 0,
}

// Soft role tints (blue / amber / green; neutral fallback)
const ROLE_PILL: Record<string, { bg: string; color: string; border: string }> = {
  admin: { bg: '#eaf0fe', color: '#1d4ed8', border: '#bfd3fc' },
  sales_manager: { bg: '#f0fdf4', color: '#16a34a', border: '#f0fdf4' },
  sales: { bg: '#f0fdf4', color: '#16a34a', border: '#f0fdf4' },
  mechanic: { bg: '#fdf3e7', color: '#92400e', border: '#fdf3e7' },
  detailer: { bg: '#eaf0fe', color: '#1d4ed8', border: '#eaf0fe' },
  content: { bg: '#fdf3e7', color: '#92400e', border: '#fdf3e7' },
  coordinator: { bg: '#f0fdf4', color: '#16a34a', border: '#f0fdf4' },
  porter: { bg: '#eaf0fe', color: '#1d4ed8', border: '#eaf0fe' },
}

function RolePill({ role }: { role: string }) {
  const c = ROLE_PILL[role] ?? { bg: 'var(--bg-primary, #f8f8f6)', color: 'var(--text-muted)', border: 'var(--border)' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 650,
      borderRadius: 100, padding: '2px 9px', background: c.bg, color: c.color, border: `1px solid ${c.border}`,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
      {role.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
    </span>
  )
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ ...CARD, borderRadius: 12, padding: '14px 16px' }}>
      <p style={EYEBROW}>{label}</p>
      <p style={{ fontSize: 26, fontWeight: 700, fontVariantNumeric: 'tabular-nums', marginTop: 4, lineHeight: 1.2 }}>{value}</p>
      {sub && <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</p>}
    </div>
  )
}

export default function ReportsPage() {
  const [data, setData] = useState<ReportsData | null>(null)
  const [meetings, setMeetings] = useState<ArchivedMeeting[] | null>(null)
  const [myRole, setMyRole] = useState<string>('')
  const [team, setTeam] = useState<TeamData | null>(null)
  const [teamLoading, setTeamLoading] = useState(false)
  const [weekMonday, setWeekMonday] = useState<string>(currentMonday())
  const [expandedPeople, setExpandedPeople] = useState<Record<string, boolean>>({})
  const [showInactive, setShowInactive] = useState(false)

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => setMyRole(d.user?.role ?? '')).catch(() => {})
    fetch('/api/reports')
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
    // Meeting archive — 403 for roles without access; section simply hides.
    fetch('/api/reports/vehicle-status/archive')
      .then(r => (r.ok ? r.json() : null))
      .then(d => setMeetings(d?.meetings ?? null))
      .catch(() => setMeetings(null))
  }, [])

  useEffect(() => {
    if (myRole !== 'admin') return
    let cancelled = false
    setTeamLoading(true)
    fetch(`/api/reports/team?week=${weekMonday}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled) { setTeam(d); setTeamLoading(false) } })
      .catch(() => { if (!cancelled) setTeamLoading(false) })
    return () => { cancelled = true }
  }, [myRole, weekMonday])

  if (!data) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: '60vh' }}>
        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#e0e0e0', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8 flex items-start justify-between" style={{ gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Performance metrics and bottleneck analysis
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {myRole === 'admin' && <a
            href="/reports/meeting"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: '#1a1a1a', color: '#dffd6e', textDecoration: 'none',
              padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600,
            }}
          >☀ Morning Meeting</a>}
          {(myRole === 'admin' || myRole === 'sales_manager') && <a
            href="/api/reports/vehicle-status?format=pdf"
            download
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: '#fff', color: 'var(--text-primary)', textDecoration: 'none',
              border: '1px solid var(--border)',
              padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600,
            }}
          >⬇ Status Report (PDF)</a>}
        </div>
      </div>

      {/* Overview stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4" style={{ gap: '16px', marginBottom: '32px' }}>
        <div className="stat-card" style={{ borderLeft: '3px solid #dffd6e' }}>
          <p className="stat-label">Total Vehicles</p>
          <p className="stat-value">{data.totalVehicles}</p>
        </div>
        <div className="stat-card" style={{ borderLeft: '3px solid var(--success)' }}>
          <p className="stat-label">This Week</p>
          <p className="stat-value" style={{ color: 'var(--success)' }}>{data.completedThisWeek}</p>
          <p className="stat-sub">Completed</p>
        </div>
        <div className="stat-card" style={{ borderLeft: '3px solid var(--info)' }}>
          <p className="stat-label">This Month</p>
          <p className="stat-value">{data.completedThisMonth}</p>
          <p className="stat-sub">Completed</p>
        </div>
        <div className="stat-card" style={{ borderLeft: '3px solid var(--warning)' }}>
          <p className="stat-label">Transport</p>
          <p className="stat-value">{data.transportOpen}</p>
          <p className="stat-sub">{data.transportDelivered} delivered</p>
        </div>
      </div>

      {/* Shop KPIs — admin only */}
      {myRole === 'admin' && (
        <div style={{ marginBottom: 32 }}>
          <h2 className="text-lg font-bold" style={{ marginBottom: 12 }}>Shop KPIs</h2>
          {!team && teamLoading ? (
            <div style={{ ...CARD, padding: 20, fontSize: 13, color: 'var(--text-muted)' }}>Loading KPIs…</div>
          ) : team ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(158px, 100%), 1fr))', gap: 12 }}>
                <KpiCard
                  label="Avg Days In Recon"
                  value={team.kpis.avgDaysInRecon != null ? team.kpis.avgDaysInRecon.toFixed(1) : '—'}
                  sub={team.kpis.reconCompletedCount > 0 ? `${team.kpis.reconCompletedCount} Finished This Week` : 'None Finished This Week'}
                />
                <KpiCard label="In Recon Now" value={String(team.kpis.live.inRecon)} sub="Live Count" />
                <KpiCard label="At External Now" value={String(team.kpis.live.atExternal)} sub="Live Count" />
                <KpiCard label="Awaiting Routing" value={String(team.kpis.live.awaitingRouting)} sub="Live Count" />
                <KpiCard label="Sent To External" value={String(team.kpis.sentToExternal)} sub="This Week" />
                <KpiCard label="Back From External" value={String(team.kpis.returnedFromExternal)} sub="This Week" />
                <KpiCard label="Parts Requested" value={String(team.kpis.partsCreated)} sub="This Week" />
                <KpiCard
                  label="Parts Received"
                  value={String(team.kpis.partsReceived)}
                  sub={team.kpis.avgPartDays != null ? `Avg ${team.kpis.avgPartDays.toFixed(1)}d Request To Arrival` : 'This Week'}
                />
              </div>
              {team.kpis.stageAvgs.length > 0 && (
                <div style={{ ...CARD, borderRadius: 12, padding: '12px 16px', marginTop: 12, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                  <span style={EYEBROW}>Avg Stage Time This Week</span>
                  {team.kpis.stageAvgs.map(s => (
                    <span key={s.stage} style={{
                      fontSize: 11.5, fontWeight: 600, background: 'var(--bg-primary, #f8f8f6)',
                      border: '1px solid var(--border)', borderRadius: 8, padding: '3px 9px',
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {s.stage.charAt(0).toUpperCase() + s.stage.slice(1)}{' '}
                      {s.avgHours < 24 ? `${s.avgHours.toFixed(1)}h` : `${(s.avgHours / 24).toFixed(1)}d`}
                      <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}> · {s.count} Done</span>
                    </span>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div style={{ ...CARD, padding: 20, fontSize: 13, color: 'var(--text-muted)' }}>Could not load KPIs.</div>
          )}
        </div>
      )}

      {/* Team Activity — admin only */}
      {myRole === 'admin' && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
            <h2 className="text-lg font-bold">Team Activity</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => setWeekMonday(w => shiftWeek(w, -1))}
                aria-label="Previous Week"
                style={{
                  width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--bg-card, #fff)', border: '1px solid var(--border)', borderRadius: 8,
                  fontSize: 15, fontWeight: 600, cursor: 'pointer', color: 'var(--text-primary)',
                }}
              >‹</button>
              <span style={{ fontSize: 13, fontWeight: 600, minWidth: 110, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                {weekLabel(weekMonday)}
              </span>
              <button
                onClick={() => setWeekMonday(w => shiftWeek(w, 1))}
                disabled={weekMonday >= currentMonday()}
                aria-label="Next Week"
                style={{
                  width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--bg-card, #fff)', border: '1px solid var(--border)', borderRadius: 8,
                  fontSize: 15, fontWeight: 600, color: 'var(--text-primary)',
                  cursor: weekMonday >= currentMonday() ? 'default' : 'pointer',
                  opacity: weekMonday >= currentMonday() ? 0.35 : 1,
                }}
              >›</button>
            </div>
          </div>

          {teamLoading && !team ? (
            <div style={{ ...CARD, padding: 20, fontSize: 13, color: 'var(--text-muted)' }}>Loading team activity…</div>
          ) : team ? (
            <div style={{ opacity: teamLoading ? 0.55 : 1, transition: 'opacity 120ms' }}>
              {team.people.filter(p => p.hasActivity).length === 0 ? (
                <div style={{ ...CARD, padding: 20, fontSize: 13, color: 'var(--text-muted)' }}>
                  No recorded activity for this week.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 14 }}>
                  {team.people.filter(p => p.hasActivity).map(p => {
                    const chips: Array<[string, number]> = [
                      ['Board Tasks', p.totals.tasksDone],
                      ['Checklist Items', p.totals.checklistDone],
                      ['Stages Done', p.totals.stagesDone],
                      ['Follow-Ups', p.totals.followUps],
                      ...Object.entries(p.totals.activityCounts),
                    ]
                    const visible = chips.filter(([, n]) => n > 0)
                    const isOpen = !!expandedPeople[p.userId]
                    const shown = isOpen ? p.highlights : p.highlights.slice(0, 6)
                    return (
                      <div key={p.userId} style={{ ...CARD, padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 14, fontWeight: 700 }}>{p.name}</span>
                          <RolePill role={p.role} />
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                          {visible.map(([label, n]) => (
                            <span key={label} style={{
                              fontSize: 11, fontWeight: 600, background: 'var(--bg-primary, #f8f8f6)',
                              border: '1px solid var(--border)', borderRadius: 8, padding: '3px 8px',
                              fontVariantNumeric: 'tabular-nums',
                            }}>
                              {n} <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>
                            </span>
                          ))}
                        </div>
                        {shown.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
                            {shown.map((h, i) => (
                              <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 7, minWidth: 0 }}>
                                {h.stock && <span style={STOCK_CHIP}>#{h.stock}</span>}
                                <span style={{ fontSize: 12.5, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {h.label}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        {p.highlights.length > 6 && (
                          <button
                            onClick={() => setExpandedPeople(prev => ({ ...prev, [p.userId]: !isOpen }))}
                            style={{
                              marginTop: 8, background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                              fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)',
                            }}
                          >
                            {isOpen ? 'Show Less' : `Show All ${p.highlights.length}`}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {team.people.some(p => !p.hasActivity) && (
                <div style={{ marginTop: 12 }}>
                  <button
                    onClick={() => setShowInactive(s => !s)}
                    style={{
                      background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                      fontSize: 12, fontWeight: 600, color: 'var(--text-muted)',
                    }}
                  >
                    {showInactive ? 'Hide' : 'Show'} {team.people.filter(p => !p.hasActivity).length} With No Recorded Activity
                  </button>
                  {showInactive && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                      {team.people.filter(p => !p.hasActivity).map(p => (
                        <span key={p.userId} style={{
                          ...CARD, borderRadius: 10, padding: '6px 12px',
                          display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600,
                        }}>
                          {p.name} <RolePill role={p.role} />
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div style={{ ...CARD, padding: 20, fontSize: 13, color: 'var(--text-muted)' }}>Could not load team activity.</div>
          )}
        </div>
      )}

      {/* Meeting archive — saved Morning Meeting snapshots */}
      {meetings && meetings.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h2 className="text-lg font-bold mb-1">Meeting Archive</h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)', marginBottom: 12 }}>
            Saved Morning Meeting snapshots — open any date to see that day's full status report.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {meetings.map(m => (
              <a
                key={m.date}
                href={m.url}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  border: '1px solid var(--border)', borderRadius: 10,
                  padding: '8px 14px', fontSize: 13, fontWeight: 600,
                  color: 'var(--text-primary)', textDecoration: 'none',
                  background: 'var(--bg-card)',
                }}
              >
                🗂 {new Date(`${m.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: '24px' }}>
        {/* Avg time per stage */}
        <div className="card">
          <h2 className="text-lg font-bold mb-4">Avg Time Per Stage</h2>
          {data.stageTimes.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No completed stages yet</p>
          ) : (
            <div className="flex flex-col gap-3">
              {data.stageTimes.map((s) => {
                const label = s.stage.charAt(0).toUpperCase() + s.stage.slice(1)
                const displayTime = s.avgHours < 1
                  ? `${Math.round(s.avgHours * 60)}m`
                  : s.avgHours < 24
                    ? `${s.avgHours.toFixed(1)}h`
                    : `${(s.avgHours / 24).toFixed(1)}d`
                const maxHours = Math.max(...data.stageTimes.map((x) => x.avgHours), 1)
                const pct = Math.min((s.avgHours / maxHours) * 100, 100)

                return (
                  <div key={s.stage}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium">{label}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{displayTime} · {s.count} done</span>
                    </div>
                    <div className="h-2 rounded-full" style={{ background: 'var(--border)' }}>
                      <div className="h-2 rounded-full" style={{
                        width: `${pct}%`,
                        background: s.stage === 'mechanic' ? '#9333ea'
                          : s.stage === 'detailing' ? '#2563eb'
                          : s.stage === 'content' ? '#d97706'
                          : '#16a34a',
                      }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Time in Stage */}
        <div className="card">
          <h2 className="text-lg font-bold mb-4">
            Time in Stage
            {data.vehiclesInStage.length > 0 && (
              <span className="ml-2 text-xs font-normal" style={{ color: 'var(--text-muted)' }}>{data.vehiclesInStage.length} active</span>
            )}
          </h2>
          {data.vehiclesInStage.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-lg">✅</p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>No active vehicles</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {data.vehiclesInStage.map((v) => {
                const displayTime = v.hoursInStage < 1
                  ? `${Math.round(v.hoursInStage * 60)}m`
                  : v.hoursInStage < 24
                    ? `${v.hoursInStage.toFixed(1)}h`
                    : `${(v.hoursInStage / 24).toFixed(1)}d`
                return (
                  <div key={v.id} className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'var(--bg-primary)' }}>
                    <div>
                      <p className="text-sm font-semibold">#{v.stockNumber}</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {v.year} {v.make} {v.model}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className={`badge badge-${v.status}`}>{v.status}</span>
                      <p className="text-xs mt-1 font-medium" style={{ color: 'var(--text-muted)' }}>
                        {displayTime}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
