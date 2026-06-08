'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import VehicleSearch from '@/components/VehicleSearch'

type ChecklistItem = { item: string; done: boolean; note: string }
type ReturnQueueEntry = { stage: string; fromStage?: string; reason?: string }
type Vehicle = { id: string; stockNumber: string; year: number | null; make: string; model: string; color: string | null; returnQueue?: ReturnQueueEntry[] }

function SoldBadge({ scope }: { scope?: string | null }) {
  if (scope !== 'Sold Delivery') return null
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100,
      background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d',
      textTransform: 'uppercase', letterSpacing: '0.04em',
    }}>Sold</span>
  )
}

function ReturnBadge({ vehicle }: { vehicle: Vehicle }) {
  if (!vehicle.returnQueue || vehicle.returnQueue.length === 0) return null
  // Skip stale entries pointing at the content stage (vehicle is already here).
  const next = vehicle.returnQueue.find(r => r.stage !== 'content')
  if (!next) return null
  const label = next.stage.charAt(0).toUpperCase() + next.stage.slice(1)
  return (
    <span title={next.reason || `Returns to ${label}`} style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100,
      background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d',
      display: 'inline-flex', alignItems: 'center', gap: 4,
    }}>
      Returns to {label}
    </span>
  )
}
type VehicleJob = {
  id: string; vehicleId: string; vehicle: Vehicle
  assignee: { id: string; name: string } | null
  status: string; checklist: ChecklistItem[]; priority: number
  scheduledDate: string | null; completedAt: string | null; type: 'vehicle'
  scopeName?: string | null
}
type SubtaskItem = { item: string; done: boolean }
type ContentTask = {
  id: string; title: string; description: string | null
  assignee: { id: string; name: string } | null
  status: string; scheduledDate: string | null; type: 'task'
  subtasks?: SubtaskItem[]
  stockNumbers?: string[]
}
type BoardData = {
  active: VehicleJob[]; activeTasks: ContentTask[]
  scheduled: VehicleJob[]; scheduledTasks: ContentTask[]
  queuedVehicles: VehicleJob[]; queuedTasks: ContentTask[]
  completedToday: VehicleJob[]; completedTasks: ContentTask[]
  completedThisWeek: VehicleJob[]; completedTasksThisWeek: ContentTask[]
  stats: { total: number; activeCount: number; todayCount: number; completedToday: number; completedThisWeek: number }
}

function StatBox({ label, value, color, onClick, active }: { label: string; value: number; color?: string; onClick?: () => void; active?: boolean }) {
  const [hovered, setHovered] = useState(false)
  const isClickable = !!onClick
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: '1 1 130px', minWidth: 110,
        padding: '14px 18px',
        borderRadius: 16,
        background: active
          ? 'linear-gradient(135deg, #1d1d1f 0%, #0a0a0a 100%)'
          : hovered ? 'rgba(255, 255, 255, 0.62)' : 'rgba(255, 255, 255, 0.4)',
        backdropFilter: 'blur(15px) saturate(180%)',
        WebkitBackdropFilter: 'blur(15px) saturate(180%)',
        border: active ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid rgba(255, 255, 255, 0.55)',
        boxShadow: active
          ? [
              '0 8px 22px -8px rgba(0, 0, 0, 0.4)',
              'inset 0 1px 0 rgba(255, 255, 255, 0.12)',
              'inset 0 -1px 0 rgba(0, 0, 0, 0.3)',
            ].join(', ')
          : hovered
            ? [
                '0 10px 28px -10px rgba(31, 38, 135, 0.2)',
                'inset 0 1px 0 rgba(255, 255, 255, 0.85)',
                'inset 0 0 0 0.5px rgba(255, 255, 255, 0.45)',
              ].join(', ')
            : [
                '0 6px 18px -8px rgba(31, 38, 135, 0.1)',
                'inset 0 1px 0 rgba(255, 255, 255, 0.7)',
                'inset 0 0 0 0.5px rgba(255, 255, 255, 0.3)',
              ].join(', '),
        transform: hovered && !active ? 'translateY(-1px)' : 'translateY(0)',
        transition: 'transform 220ms cubic-bezier(0.25, 0.46, 0.45, 0.94), background 220ms ease, box-shadow 220ms ease',
        cursor: isClickable ? 'pointer' : 'default',
      }}>
      <p style={{
        fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
        color: active ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.45)',
        margin: 0,
      }}>{label}</p>
      <p style={{
        fontSize: 26, fontWeight: 800, margin: '6px 0 0',
        letterSpacing: '-0.02em',
        fontVariantNumeric: 'tabular-nums',
        color: active ? '#dffd6e' : (color || '#0a0a0a'),
        lineHeight: 1,
      }}>{value}</p>
    </div>
  )
}

/* ── Week Day Tabs (satin sliding capsule) ──
   Same aesthetic as the Inventory FilterPills: a single glass capsule strip
   with a dark sliding indicator that slides under the active tab.  Each tab
   shows two stacked lines (day label + numeric date) with an inline count
   chip when items are scheduled.  Today's chip rolls in overdue items. */
function WeekTabs({
  selectedDay, onSelect, scheduledByDay, todayDay, overdueCount,
}: {
  selectedDay: string
  onSelect: (day: string) => void
  scheduledByDay: Record<string, number>
  todayDay: string
  overdueCount: number
}) {
  const days = useMemo(() => {
    const out: { value: string; label: string; sub: string; isToday: boolean }[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date()
      d.setDate(d.getDate() + i)
      const value = d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
      const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'America/New_York' })
      const sub = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })
      out.push({ value, label, sub, isToday: value === todayDay })
    }
    return out
  }, [todayDay])

  const activeIdx = Math.max(0, days.findIndex(d => d.value === selectedDay))

  return (
    <div className="week-tabs" style={{
      position: 'relative',
      display: 'flex',
      padding: 4,
      marginBottom: 18,
      background: 'rgba(255, 255, 255, 0.5)',
      backdropFilter: 'blur(20px) saturate(180%)',
      WebkitBackdropFilter: 'blur(20px) saturate(180%)',
      borderRadius: 18,
      border: '1px solid rgba(255, 255, 255, 0.55)',
      boxShadow: [
        '0 4px 14px -4px rgba(31, 38, 135, 0.1)',
        'inset 0 1px 0 rgba(255, 255, 255, 0.75)',
        'inset 0 0 0 0.5px rgba(255, 255, 255, 0.35)',
      ].join(', '),
    }}>
      {/* Dark satin sliding indicator */}
      <div aria-hidden style={{
        position: 'absolute',
        top: 4, bottom: 4, left: 4,
        width: `calc((100% - 8px) / ${days.length})`,
        transform: `translateX(${activeIdx * 100}%)`,
        background: 'linear-gradient(135deg, #1d1d1f 0%, #0a0a0a 100%)',
        borderRadius: 14,
        boxShadow: [
          '0 4px 14px -2px rgba(0, 0, 0, 0.35)',
          'inset 0 1px 0 rgba(255, 255, 255, 0.12)',
          'inset 0 -1px 0 rgba(0, 0, 0, 0.3)',
        ].join(', '),
        transition: 'transform 380ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        pointerEvents: 'none',
        zIndex: 0,
      }} />

      {days.map(d => {
        const count = scheduledByDay[d.value] || 0
        const badgeCount = d.isToday ? count + overdueCount : count
        const isSelected = selectedDay === d.value
        return (
          <button
            key={d.value}
            onClick={() => onSelect(d.value)}
            className={isSelected ? 'week-tab-active' : undefined}
            style={{
              flex: 1,
              position: 'relative',
              zIndex: 1,
              padding: '9px 6px',
              background: 'transparent',
              border: 'none',
              borderRadius: 14,
              cursor: 'pointer',
              minHeight: 'auto',
              transition: 'color 220ms ease, background 220ms ease',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
            }}
          >
            <span style={{
              fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
              color: isSelected ? '#dffd6e' : (d.isToday ? 'rgba(59, 130, 246, 0.85)' : 'rgba(0, 0, 0, 0.4)'),
              transition: 'color 220ms ease',
              lineHeight: 1.1,
            }}>{d.label}</span>
            <span style={{
              fontSize: 13, fontWeight: 700,
              color: isSelected ? '#fff' : 'rgba(0, 0, 0, 0.75)',
              letterSpacing: '-0.005em',
              fontVariantNumeric: 'tabular-nums',
              transition: 'color 220ms ease',
              lineHeight: 1.2,
            }}>{d.sub}</span>
            {badgeCount > 0 && (
              <span style={{
                position: 'absolute', top: 5, right: 6,
                fontSize: 9, fontWeight: 800,
                padding: '1px 6px', borderRadius: 999,
                background: isSelected ? 'rgba(255,255,255,0.18)' : 'rgba(0, 0, 0, 0.06)',
                color: isSelected ? '#dffd6e' : 'rgba(0, 0, 0, 0.55)',
                letterSpacing: '-0.005em', lineHeight: 1.6,
                transition: 'background 220ms ease, color 220ms ease',
              }}>{badgeCount}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/* Glass empty-state placeholder used wherever a section has no items. */
function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: '22px 18px', borderRadius: 14,
      background: 'rgba(255, 255, 255, 0.38)',
      backdropFilter: 'blur(15px) saturate(180%)',
      WebkitBackdropFilter: 'blur(15px) saturate(180%)',
      border: '1px solid rgba(255, 255, 255, 0.5)',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.65)',
      color: 'rgba(0, 0, 0, 0.45)',
      fontSize: 13, fontWeight: 500,
      textAlign: 'center',
      letterSpacing: '-0.005em',
    }}>{children}</div>
  )
}

/* Glass "Show N More" pill button — sits below queue lists when truncated. */
function ShowMore({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      width: '100%', marginTop: 10, padding: '12px 16px',
      borderRadius: 12,
      background: 'rgba(255, 255, 255, 0.45)',
      backdropFilter: 'blur(15px) saturate(180%)',
      WebkitBackdropFilter: 'blur(15px) saturate(180%)',
      border: '1px solid rgba(255, 255, 255, 0.55)',
      boxShadow: '0 4px 14px -8px rgba(31, 38, 135, 0.08), inset 0 1px 0 rgba(255,255,255,0.7)',
      color: 'rgba(0, 0, 0, 0.55)',
      fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
      cursor: 'pointer',
    }}>Show {count} More</button>
  )
}

/* Compact glass card for items already finished (today's view + week roll-up).
   Tinted with the accent color in the corner badge; surface stays neutral glass. */
function CompletedCard({ title, sub, accent, time }: {
  title: React.ReactNode
  sub?: React.ReactNode
  accent: string
  time?: string | null
}) {
  return (
    <div style={{
      position: 'relative',
      flex: '1 1 280px', maxWidth: 420,
      padding: '14px 16px',
      borderRadius: 14,
      background: 'rgba(255, 255, 255, 0.45)',
      backdropFilter: 'blur(15px) saturate(180%)',
      WebkitBackdropFilter: 'blur(15px) saturate(180%)',
      border: '1px solid rgba(255, 255, 255, 0.55)',
      boxShadow: [
        '0 4px 14px -8px rgba(31, 38, 135, 0.08)',
        'inset 0 1px 0 rgba(255, 255, 255, 0.75)',
      ].join(', '),
      overflow: 'hidden',
    }}>
      <div aria-hidden style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
        background: `linear-gradient(180deg, ${accent}, ${accent}bb)`,
      }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{
            fontSize: 14, fontWeight: 800, margin: 0,
            letterSpacing: '-0.015em', color: '#0a0a0a',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{title}</p>
          {sub && (
            <p style={{
              fontSize: 12, color: 'rgba(0, 0, 0, 0.55)', margin: '2px 0 0',
              letterSpacing: '-0.005em', fontWeight: 500,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{sub}</p>
          )}
          {time && (
            <p style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
              color: accent, margin: '4px 0 0',
            }}>{time}</p>
          )}
        </div>
        <SatinStatusChip tone={accent}>Done</SatinStatusChip>
      </div>
    </div>
  )
}

function SectionHeader({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <h2 style={{
        fontSize: 17, fontWeight: 700, margin: 0,
        letterSpacing: '-0.02em',
        color: '#0a0a0a',
      }}>{label}</h2>
      <span style={{
        fontSize: 10, fontWeight: 800, letterSpacing: '0.04em',
        padding: '3px 10px', borderRadius: 999,
        background: 'rgba(255, 255, 255, 0.55)',
        backdropFilter: 'blur(10px) saturate(180%)',
        WebkitBackdropFilter: 'blur(10px) saturate(180%)',
        color,
        border: '1px solid rgba(255, 255, 255, 0.5)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)',
        fontVariantNumeric: 'tabular-nums',
      }}>{count}</span>
    </div>
  )
}

/* ── Active Vehicle Card (with checklist) ──
   Glass card mirroring the inventory ledger aesthetic.  Top edge carries a
   colored accent indicating Active vs Scheduled (no loud frame).  Checklist
   items sit on faint glass tints; CTAs use the inventory dark-pill style. */
function ActiveVehicleCard({ job, onToggleTask, onComplete, adminAction }: {
  job: VehicleJob; onToggleTask: (id: string, idx: number) => void; onComplete: (id: string) => void
  adminAction?: () => void
}) {
  const v = job.vehicle
  const doneCount = job.checklist.filter(c => c.done).length
  const totalCount = job.checklist.length
  const allDone = totalCount > 0 && doneCount === totalCount
  const progress = totalCount > 0 ? doneCount / totalCount : 0
  const isActive = job.status === 'in_progress'
  const isSold = job.scopeName === 'Sold Delivery'
  const accent = isSold ? '#f59e0b' : isActive ? '#f59e0b' : '#3b82f6'

  return (
    <div className="active-card" style={{
      position: 'relative',
      flex: '1 1 340px', maxWidth: 420,
      padding: '16px 18px 14px',
      borderRadius: 18,
      background: 'rgba(255, 255, 255, 0.55)',
      backdropFilter: 'blur(15px) saturate(180%)',
      WebkitBackdropFilter: 'blur(15px) saturate(180%)',
      border: '1px solid rgba(255, 255, 255, 0.55)',
      boxShadow: [
        '0 6px 18px -8px rgba(31, 38, 135, 0.12)',
        'inset 0 1px 0 rgba(255, 255, 255, 0.8)',
        'inset 0 0 0 0.5px rgba(255, 255, 255, 0.35)',
      ].join(', '),
      overflow: 'hidden',
    }}>
      {/* Colored top-edge accent — mood signal without a loud frame. */}
      <div aria-hidden style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 3,
        background: `linear-gradient(90deg, ${accent}, ${accent}80)`,
        borderTopLeftRadius: 18, borderTopRightRadius: 18,
      }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <p style={{ fontSize: 16, fontWeight: 800, margin: 0, letterSpacing: '-0.015em', color: '#0a0a0a' }}>
              #{v.stockNumber}
            </p>
            <SoldBadge scope={job.scopeName} />
            <ReturnBadge vehicle={v} />
          </div>
          <p style={{
            fontSize: 13, color: 'rgba(0, 0, 0, 0.65)', margin: '3px 0 0',
            letterSpacing: '-0.005em', fontWeight: 500,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {`${v.year ?? ''} ${v.make} ${v.model}`.trim()}{v.color ? ` · ${v.color}` : ''}
          </p>
        </div>
        <SatinStatusChip tone={accent}>{isActive ? 'Active' : 'Scheduled'}</SatinStatusChip>
      </div>

      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 8, fontSize: 11, fontWeight: 600, color: 'rgba(0, 0, 0, 0.5)',
      }}>
        <span style={{ letterSpacing: '0.03em' }}>{doneCount}/{totalCount} tasks</span>
        {job.assignee && <span style={{ letterSpacing: '-0.005em' }}>{job.assignee.name}</span>}
      </div>

      {/* Slim progress bar */}
      <div style={{
        height: 4, background: 'rgba(0, 0, 0, 0.06)',
        borderRadius: 999, overflow: 'hidden', marginBottom: 14,
      }}>
        <div style={{
          height: '100%', width: `${progress * 100}%`, borderRadius: 999,
          background: allDone ? 'linear-gradient(90deg, #22c55e, #16a34a)' : `linear-gradient(90deg, ${accent}, ${accent}cc)`,
          transition: 'width 280ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        }} />
      </div>

      {totalCount > 0 && job.status === 'in_progress' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 14 }}>
          {job.checklist.map((task, i) => (
            <label key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
              padding: '7px 10px', borderRadius: 10,
              background: task.done ? 'rgba(34, 197, 94, 0.08)' : 'rgba(255, 255, 255, 0.4)',
              border: `1px solid ${task.done ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255, 255, 255, 0.5)'}`,
              transition: 'background 180ms ease',
            }}>
              <input
                type="checkbox" checked={task.done}
                onChange={() => onToggleTask(job.id, i)}
                style={{ width: 16, height: 16, accentColor: '#22c55e', cursor: 'pointer', flexShrink: 0 }} />
              <span style={{
                fontSize: 13, flex: 1, letterSpacing: '-0.005em',
                color: task.done ? '#16a34a' : 'rgba(0, 0, 0, 0.8)',
                textDecoration: task.done ? 'line-through' : 'none',
                fontWeight: task.done ? 500 : 500,
              }}>{task.item}</span>
            </label>
          ))}
        </div>
      )}

      <div className="active-card-actions" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {job.status === 'in_progress' && (
          <button onClick={() => onComplete(job.id)} disabled={!allDone} style={{
            padding: '9px 22px', borderRadius: 999, border: 'none',
            background: allDone
              ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.95), rgba(22, 163, 74, 0.95))'
              : 'rgba(255, 255, 255, 0.5)',
            color: allDone ? '#fff' : 'rgba(0, 0, 0, 0.35)',
            fontSize: 12, fontWeight: 700, letterSpacing: '-0.005em',
            cursor: allDone ? 'pointer' : 'default',
            boxShadow: allDone
              ? '0 6px 18px -6px rgba(22, 163, 74, 0.45), inset 0 1px 0 rgba(255,255,255,0.25)'
              : 'inset 0 1px 0 rgba(255,255,255,0.7)',
            backdropFilter: allDone ? 'none' : 'blur(10px) saturate(180%)',
            WebkitBackdropFilter: allDone ? 'none' : 'blur(10px) saturate(180%)',
            transition: 'transform 160ms ease',
          }}>Complete</button>
        )}
        {adminAction && (
          <button onClick={adminAction} style={{
            padding: '8px 14px', borderRadius: 999,
            background: 'rgba(255, 255, 255, 0.55)',
            backdropFilter: 'blur(10px) saturate(180%)',
            WebkitBackdropFilter: 'blur(10px) saturate(180%)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            color: '#ef4444', fontSize: 11, fontWeight: 700, letterSpacing: '0.02em',
            cursor: 'pointer',
            textTransform: 'uppercase',
          }}>Remove</button>
        )}
      </div>
    </div>
  )
}

// Soft satin status chip used across the active/scheduled cards.
function SatinStatusChip({ children, tone }: { children: React.ReactNode; tone: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 10px',
      fontSize: 9, fontWeight: 800, letterSpacing: '0.08em',
      textTransform: 'uppercase',
      color: tone,
      background: 'rgba(255, 255, 255, 0.55)',
      backdropFilter: 'blur(10px) saturate(180%)',
      WebkitBackdropFilter: 'blur(10px) saturate(180%)',
      borderRadius: 999,
      border: '1px solid rgba(255, 255, 255, 0.5)',
      boxShadow: [
        '0 1px 3px rgba(0, 0, 0, 0.04)',
        'inset 0 1px 0 rgba(255, 255, 255, 0.7)',
      ].join(', '),
      flexShrink: 0,
    }}>
      <span aria-hidden style={{ width: 5, height: 5, borderRadius: '50%', background: tone }} />
      {children}
    </span>
  )
}

/* ── Active Task Card ── */
function ActiveTaskCard({ task, onComplete, onToggleSubtask, onEdit, adminAction }: {
  task: ContentTask; onComplete: (id: string) => void
  onToggleSubtask?: (taskId: string, idx: number) => void
  onEdit?: (task: ContentTask) => void
  adminAction?: () => void
}) {
  const isActive = task.status === 'in_progress'
  const accent = isActive ? '#f59e0b' : '#8b5cf6'
  const subtasks = task.subtasks || []
  const doneCount = subtasks.filter(s => s.done).length
  const allDone = subtasks.length > 0 && doneCount === subtasks.length
  const progress = subtasks.length > 0 ? doneCount / subtasks.length : 0
  const canComplete = subtasks.length === 0 || allDone

  return (
    <div className="active-card" style={{
      position: 'relative',
      flex: '1 1 340px', maxWidth: 420,
      padding: '16px 18px 14px',
      borderRadius: 18,
      background: 'rgba(255, 255, 255, 0.55)',
      backdropFilter: 'blur(15px) saturate(180%)',
      WebkitBackdropFilter: 'blur(15px) saturate(180%)',
      border: '1px solid rgba(255, 255, 255, 0.55)',
      boxShadow: [
        '0 6px 18px -8px rgba(31, 38, 135, 0.12)',
        'inset 0 1px 0 rgba(255, 255, 255, 0.8)',
        'inset 0 0 0 0.5px rgba(255, 255, 255, 0.35)',
      ].join(', '),
      overflow: 'hidden',
    }}>
      <div aria-hidden style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 3,
        background: `linear-gradient(90deg, ${accent}, ${accent}80)`,
        borderTopLeftRadius: 18, borderTopRightRadius: 18,
      }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <p style={{ fontSize: 16, fontWeight: 800, margin: 0, letterSpacing: '-0.015em', color: '#0a0a0a' }}>
              {task.title}
            </p>
            {task.stockNumbers && task.stockNumbers.map(sn => (
              <span key={sn} style={{
                fontSize: 9, color: '#0d9488', fontWeight: 800, letterSpacing: '0.04em',
                background: 'rgba(204, 251, 241, 0.6)',
                backdropFilter: 'blur(8px) saturate(180%)', WebkitBackdropFilter: 'blur(8px) saturate(180%)',
                padding: '2px 8px', borderRadius: 999,
                border: '1px solid rgba(13, 148, 136, 0.18)',
              }}>#{sn}</span>
            ))}
            {onEdit && (
              <button onClick={() => onEdit(task)} title="Edit subtasks" style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'rgba(0, 0, 0, 0.35)', padding: 2, flexShrink: 0,
                transition: 'color 160ms ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#8b5cf6' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(0, 0, 0, 0.35)' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
              </button>
            )}
          </div>
          {task.description && (
            <p style={{
              fontSize: 13, color: 'rgba(0, 0, 0, 0.6)', margin: '4px 0 0',
              letterSpacing: '-0.005em', fontWeight: 500,
            }}>{task.description}</p>
          )}
        </div>
        <SatinStatusChip tone={accent}>{isActive ? 'Active' : 'Scheduled'}</SatinStatusChip>
      </div>

      {task.assignee && (
        <p style={{
          fontSize: 11, fontWeight: 600, color: 'rgba(0, 0, 0, 0.5)',
          margin: '0 0 8px', letterSpacing: '-0.005em',
        }}>{task.assignee.name}</p>
      )}

      {subtasks.length > 0 && (
        <>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 8, fontSize: 11, fontWeight: 600, color: 'rgba(0, 0, 0, 0.5)',
          }}>
            <span style={{ letterSpacing: '0.03em' }}>{doneCount}/{subtasks.length} subtasks</span>
          </div>
          <div style={{
            height: 4, background: 'rgba(0, 0, 0, 0.06)',
            borderRadius: 999, overflow: 'hidden', marginBottom: 14,
          }}>
            <div style={{
              height: '100%', width: `${progress * 100}%`, borderRadius: 999,
              background: allDone ? 'linear-gradient(90deg, #22c55e, #16a34a)' : `linear-gradient(90deg, ${accent}, ${accent}cc)`,
              transition: 'width 280ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            }} />
          </div>
          {isActive && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 14 }}>
              {subtasks.map((sub, i) => (
                <label key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                  padding: '7px 10px', borderRadius: 10,
                  background: sub.done ? 'rgba(34, 197, 94, 0.08)' : 'rgba(255, 255, 255, 0.4)',
                  border: `1px solid ${sub.done ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255, 255, 255, 0.5)'}`,
                  transition: 'background 180ms ease',
                }}>
                  <input
                    type="checkbox" checked={sub.done}
                    onChange={() => onToggleSubtask?.(task.id, i)}
                    style={{ width: 16, height: 16, accentColor: '#22c55e', cursor: 'pointer', flexShrink: 0 }} />
                  <span style={{
                    fontSize: 13, flex: 1, letterSpacing: '-0.005em',
                    color: sub.done ? '#16a34a' : 'rgba(0, 0, 0, 0.8)',
                    textDecoration: sub.done ? 'line-through' : 'none',
                    fontWeight: 500,
                  }}>{sub.item}</span>
                </label>
              ))}
            </div>
          )}
        </>
      )}

      {subtasks.length === 0 && (
        <div style={{
          padding: '8px 12px', borderRadius: 10,
          background: 'rgba(139, 92, 246, 0.08)',
          border: '1px solid rgba(139, 92, 246, 0.18)',
          marginBottom: 14,
          fontSize: 12, fontWeight: 600,
          color: 'rgba(139, 92, 246, 0.9)',
          display: 'inline-flex', alignItems: 'center', gap: 7,
          letterSpacing: '-0.005em',
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9A2.25 2.25 0 0013.5 5.25h-9A2.25 2.25 0 002.25 7.5v9A2.25 2.25 0 004.5 18.75z" /></svg>
          Reel for social media
        </div>
      )}

      <div className="active-card-actions" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {task.status === 'in_progress' && (
          <button onClick={() => onComplete(task.id)} disabled={!canComplete} style={{
            padding: '9px 22px', borderRadius: 999, border: 'none',
            background: canComplete
              ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.95), rgba(22, 163, 74, 0.95))'
              : 'rgba(255, 255, 255, 0.5)',
            color: canComplete ? '#fff' : 'rgba(0, 0, 0, 0.35)',
            fontSize: 12, fontWeight: 700, letterSpacing: '-0.005em',
            cursor: canComplete ? 'pointer' : 'default',
            boxShadow: canComplete
              ? '0 6px 18px -6px rgba(22, 163, 74, 0.45), inset 0 1px 0 rgba(255,255,255,0.25)'
              : 'inset 0 1px 0 rgba(255,255,255,0.7)',
            backdropFilter: canComplete ? 'none' : 'blur(10px) saturate(180%)',
            WebkitBackdropFilter: canComplete ? 'none' : 'blur(10px) saturate(180%)',
            transition: 'transform 160ms ease',
          }}>Complete</button>
        )}
        {adminAction && (
          <button onClick={adminAction} style={{
            padding: '8px 14px', borderRadius: 999,
            background: 'rgba(255, 255, 255, 0.55)',
            backdropFilter: 'blur(10px) saturate(180%)',
            WebkitBackdropFilter: 'blur(10px) saturate(180%)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            color: '#ef4444', fontSize: 11, fontWeight: 700, letterSpacing: '0.02em',
            cursor: 'pointer',
            textTransform: 'uppercase',
          }}>Remove</button>
        )}
      </div>
    </div>
  )
}

/* ── Queue Vehicle Card (glass floating row) ── */
function QueueVehicleCard({ job, onStart, isAdmin, onSchedule, index }: {
  job: VehicleJob; onStart: (id: string) => void; isAdmin: boolean
  onSchedule?: (id: string, type: 'vehicle') => void; index?: number
}) {
  const v = job.vehicle
  const doneCount = job.checklist.filter(c => c.done).length
  const isSold = job.scopeName === 'Sold Delivery'
  const [hovered, setHovered] = useState(false)
  return (
    <div className="queue-card"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 16px',
        borderRadius: 14,
        background: hovered ? 'rgba(255, 255, 255, 0.62)' : 'rgba(255, 255, 255, 0.4)',
        backdropFilter: 'blur(15px) saturate(180%)',
        WebkitBackdropFilter: 'blur(15px) saturate(180%)',
        border: '1px solid rgba(255, 255, 255, 0.55)',
        boxShadow: hovered
          ? [
              '0 10px 28px -10px rgba(31, 38, 135, 0.18)',
              'inset 0 1px 0 rgba(255, 255, 255, 0.85)',
              'inset 0 0 0 0.5px rgba(255, 255, 255, 0.45)',
            ].join(', ')
          : [
              '0 4px 14px -8px rgba(31, 38, 135, 0.08)',
              'inset 0 1px 0 rgba(255, 255, 255, 0.7)',
              'inset 0 0 0 0.5px rgba(255, 255, 255, 0.3)',
            ].join(', '),
        transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
        transition: 'transform 220ms cubic-bezier(0.25, 0.46, 0.45, 0.94), background 220ms ease, box-shadow 220ms ease',
        overflow: 'hidden',
      }}>
      {isSold && (
        <div aria-hidden style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
          background: 'linear-gradient(180deg, #f59e0b, #f59e0bbb)',
        }} />
      )}
      <div className="queue-card-info" style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
        {isAdmin && (
          <div style={{ cursor: 'grab', color: 'rgba(0, 0, 0, 0.2)', flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>
          </div>
        )}
        {index !== undefined && (
          <span style={{
            fontSize: 12, fontWeight: 800, letterSpacing: '0.04em',
            color: 'rgba(0, 0, 0, 0.3)', minWidth: 22, textAlign: 'center', flexShrink: 0,
            fontVariantNumeric: 'tabular-nums',
          }}>{String(index + 1).padStart(2, '0')}</span>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <p style={{
              fontSize: 14, fontWeight: 700, margin: 0,
              letterSpacing: '-0.01em', color: '#0a0a0a',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              #{v.stockNumber}
              <span style={{ color: 'rgba(0, 0, 0, 0.35)', margin: '0 8px' }}>·</span>
              {`${v.year ?? ''} ${v.make} ${v.model}`.trim()}
            </p>
            <SoldBadge scope={job.scopeName} />
            <ReturnBadge vehicle={v} />
          </div>
          <p style={{
            fontSize: 11, fontWeight: 500, color: 'rgba(0, 0, 0, 0.5)',
            margin: '2px 0 0', letterSpacing: '-0.005em',
          }}>
            {job.assignee?.name || 'Unassigned'} · {doneCount}/{job.checklist.length} tasks
          </p>
        </div>
      </div>
      <div className="queue-card-actions" style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button onClick={() => onStart(job.id)} style={{
          padding: '7px 16px', borderRadius: 999,
          border: '1px solid rgba(255, 255, 255, 0.18)',
          background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.95), rgba(37, 99, 235, 0.95))',
          color: '#fff',
          fontSize: 11, fontWeight: 700, letterSpacing: '-0.005em',
          cursor: 'pointer',
          boxSizing: 'border-box',
          boxShadow: '0 4px 14px -4px rgba(37, 99, 235, 0.4), inset 0 1px 0 rgba(255,255,255,0.2)',
        }}>Start</button>
        {isAdmin && onSchedule && (
          <button onClick={() => onSchedule(job.id, 'vehicle')} style={{
            padding: '7px 16px', borderRadius: 999,
            background: 'rgba(255, 255, 255, 0.55)',
            backdropFilter: 'blur(10px) saturate(180%)',
            WebkitBackdropFilter: 'blur(10px) saturate(180%)',
            border: '1px solid rgba(255, 255, 255, 0.55)',
            color: 'rgba(0, 0, 0, 0.6)', fontSize: 11, fontWeight: 700, letterSpacing: '-0.005em',
            cursor: 'pointer',
            boxSizing: 'border-box',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)',
          }}>Schedule</button>
        )}
      </div>
    </div>
  )
}

/* ── Queue Task Card (glass floating row) ── */
function QueueTaskCard({ task, onStart, isAdmin, onSchedule, onDelete, onEdit, index }: {
  task: ContentTask; onStart: (id: string) => void; isAdmin: boolean
  onSchedule?: (id: string, type: 'task') => void; onDelete?: (id: string) => void
  onEdit?: (task: ContentTask) => void; index?: number
}) {
  const [hovered, setHovered] = useState(false)
  const hasSubtasks = (task.subtasks?.length || 0) > 0
  return (
    <div className="queue-card"
      onClick={() => onEdit?.(task)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 16px',
        borderRadius: 14,
        background: hovered ? 'rgba(255, 255, 255, 0.62)' : 'rgba(255, 255, 255, 0.4)',
        backdropFilter: 'blur(15px) saturate(180%)',
        WebkitBackdropFilter: 'blur(15px) saturate(180%)',
        border: '1px solid rgba(255, 255, 255, 0.55)',
        boxShadow: hovered
          ? [
              '0 10px 28px -10px rgba(31, 38, 135, 0.18)',
              'inset 0 1px 0 rgba(255, 255, 255, 0.85)',
              'inset 0 0 0 0.5px rgba(255, 255, 255, 0.45)',
            ].join(', ')
          : [
              '0 4px 14px -8px rgba(31, 38, 135, 0.08)',
              'inset 0 1px 0 rgba(255, 255, 255, 0.7)',
              'inset 0 0 0 0.5px rgba(255, 255, 255, 0.3)',
            ].join(', '),
        transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
        transition: 'transform 220ms cubic-bezier(0.25, 0.46, 0.45, 0.94), background 220ms ease, box-shadow 220ms ease',
        cursor: 'pointer',
      }}>
      <div className="queue-card-info" style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
        {isAdmin && (
          <div style={{ cursor: 'grab', color: 'rgba(0, 0, 0, 0.2)', flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>
          </div>
        )}
        {index !== undefined && (
          <span style={{
            fontSize: 12, fontWeight: 800, letterSpacing: '0.04em',
            color: 'rgba(0, 0, 0, 0.3)', minWidth: 22, textAlign: 'center', flexShrink: 0,
            fontVariantNumeric: 'tabular-nums',
          }}>{String(index + 1).padStart(2, '0')}</span>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <p style={{
              fontSize: 14, fontWeight: 700, margin: 0,
              letterSpacing: '-0.01em', color: '#0a0a0a',
            }}>{task.title}</p>
            {task.stockNumbers && task.stockNumbers.map(sn => (
              <span key={sn} style={{
                fontSize: 9, color: '#0d9488', fontWeight: 800, letterSpacing: '0.04em',
                background: 'rgba(204, 251, 241, 0.6)',
                backdropFilter: 'blur(8px) saturate(180%)', WebkitBackdropFilter: 'blur(8px) saturate(180%)',
                padding: '2px 8px', borderRadius: 999,
                border: '1px solid rgba(13, 148, 136, 0.18)',
              }}>#{sn}</span>
            ))}
            <span style={{
              fontSize: 9, color: '#8b5cf6', fontWeight: 800, letterSpacing: '0.04em',
              background: 'rgba(250, 245, 255, 0.7)',
              backdropFilter: 'blur(8px) saturate(180%)', WebkitBackdropFilter: 'blur(8px) saturate(180%)',
              padding: '2px 8px', borderRadius: 999,
              border: '1px solid rgba(139, 92, 246, 0.18)',
            }}>
              {hasSubtasks
                ? `${task.subtasks!.filter(s => s.done).length}/${task.subtasks!.length} SUBTASKS`
                : 'REEL'}
            </span>
          </div>
          <p style={{
            fontSize: 11, fontWeight: 500, color: 'rgba(0, 0, 0, 0.5)',
            margin: '2px 0 0', letterSpacing: '-0.005em',
          }}>
            {task.assignee?.name || 'Unassigned'}
          </p>
        </div>
      </div>
      <div className="queue-card-actions" style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
        <button onClick={() => onStart(task.id)} style={{
          padding: '7px 16px', borderRadius: 999,
          border: '1px solid rgba(255, 255, 255, 0.18)',
          background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.95), rgba(124, 58, 237, 0.95))',
          color: '#fff',
          fontSize: 11, fontWeight: 700, letterSpacing: '-0.005em',
          cursor: 'pointer',
          boxSizing: 'border-box',
          boxShadow: '0 4px 14px -4px rgba(124, 58, 237, 0.4), inset 0 1px 0 rgba(255,255,255,0.2)',
        }}>Start</button>
        {isAdmin && onSchedule && (
          <button onClick={() => onSchedule(task.id, 'task')} style={{
            padding: '7px 16px', borderRadius: 999,
            background: 'rgba(255, 255, 255, 0.55)',
            backdropFilter: 'blur(10px) saturate(180%)',
            WebkitBackdropFilter: 'blur(10px) saturate(180%)',
            border: '1px solid rgba(255, 255, 255, 0.55)',
            color: 'rgba(0, 0, 0, 0.6)', fontSize: 11, fontWeight: 700, letterSpacing: '-0.005em',
            cursor: 'pointer',
            boxSizing: 'border-box',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)',
          }}>Schedule</button>
        )}
        {isAdmin && onDelete && (
          <button className="queue-icon-btn"
            onClick={() => { if (confirm('Remove this task?')) onDelete(task.id) }}
            title="Remove task"
            style={{
              padding: '7px 9px', borderRadius: 999,
              background: 'rgba(255, 255, 255, 0.55)',
              backdropFilter: 'blur(10px) saturate(180%)',
              WebkitBackdropFilter: 'blur(10px) saturate(180%)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              color: '#ef4444', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        )}
      </div>
    </div>
  )
}

/* ── Schedule Modal ── */
function ScheduleModal({ onConfirm, onCancel }: {
  onConfirm: (date: string) => void; onCancel: () => void
}) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const [date, setDate] = useState(today)

  // Generate next 7 days as quick picks
  const days: { label: string; value: string }[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date()
    d.setDate(d.getDate() + i)
    const val = d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York' })
    days.push({ label, value: val })
  }

  return (
    <div className="content-modal-overlay" style={{
      position: 'fixed', inset: 0,
      background: 'rgba(20, 22, 30, 0.42)',
      backdropFilter: 'blur(14px) saturate(140%)',
      WebkitBackdropFilter: 'blur(14px) saturate(140%)',
      zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }} onClick={onCancel}>
      <div className="content-modal-card" style={{
        width: '100%', maxWidth: 380,
        padding: '22px 22px 20px',
        borderRadius: 22,
        background: 'rgba(255, 255, 255, 0.72)',
        backdropFilter: 'blur(28px) saturate(180%)',
        WebkitBackdropFilter: 'blur(28px) saturate(180%)',
        border: '1px solid rgba(255, 255, 255, 0.55)',
        boxShadow: [
          '0 24px 60px -20px rgba(31, 38, 135, 0.32)',
          '0 8px 24px -8px rgba(0, 0, 0, 0.18)',
          'inset 0 1px 0 rgba(255, 255, 255, 0.85)',
          'inset 0 0 0 0.5px rgba(255, 255, 255, 0.4)',
        ].join(', '),
      }} onClick={e => e.stopPropagation()}>
        <p style={{
          fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase',
          color: 'rgba(0, 0, 0, 0.5)', margin: '0 0 4px',
        }}>Schedule for</p>
        <h3 style={{
          fontSize: 18, fontWeight: 800, margin: '0 0 16px',
          letterSpacing: '-0.02em', color: '#0a0a0a',
        }}>Pick a day</h3>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
          {days.map(d => {
            const isActive = date === d.value
            return (
              <button key={d.value} onClick={() => setDate(d.value)} style={{
                padding: '7px 12px', borderRadius: 999,
                border: isActive ? '1px solid rgba(59, 130, 246, 0.35)' : '1px solid rgba(255, 255, 255, 0.55)',
                background: isActive
                  ? 'rgba(59, 130, 246, 0.12)'
                  : 'rgba(255, 255, 255, 0.55)',
                backdropFilter: 'blur(10px) saturate(180%)',
                WebkitBackdropFilter: 'blur(10px) saturate(180%)',
                color: isActive ? '#1d4ed8' : 'rgba(0, 0, 0, 0.6)',
                fontSize: 12, fontWeight: 700, letterSpacing: '-0.005em',
                cursor: 'pointer',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)',
                transition: 'background 180ms ease, color 180ms ease, border-color 180ms ease',
              }}>{d.label}</button>
            )
          })}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => onConfirm(date)} style={{
            flex: 1, padding: '11px 0', borderRadius: 999, border: 'none',
            background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.95), rgba(37, 99, 235, 0.95))',
            color: '#fff', fontSize: 13, fontWeight: 700, letterSpacing: '-0.005em',
            cursor: 'pointer',
            boxShadow: '0 6px 18px -6px rgba(37, 99, 235, 0.45), inset 0 1px 0 rgba(255,255,255,0.2)',
          }}>Confirm</button>
          <button onClick={onCancel} style={{
            padding: '11px 22px', borderRadius: 999,
            background: 'rgba(255, 255, 255, 0.55)',
            backdropFilter: 'blur(10px) saturate(180%)',
            WebkitBackdropFilter: 'blur(10px) saturate(180%)',
            border: '1px solid rgba(255, 255, 255, 0.55)',
            color: 'rgba(0, 0, 0, 0.6)', fontSize: 13, fontWeight: 700, letterSpacing: '-0.005em',
            cursor: 'pointer',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)',
          }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

type LinkedVehicle = {
  stockNumber: string; vin: string | null
  year: number | null; make: string; model: string; color: string | null
}

/* ── Add Task Modal ── */
function AddTaskModal({ users, onConfirm, onCancel }: {
  users: { id: string; name: string }[]
  onConfirm: (title: string, assigneeId: string | null, subtasks: { item: string; done: boolean }[], stockNumbers: string[]) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [subtasks, setSubtasks] = useState<string[]>([''])
  const [newSubtask, setNewSubtask] = useState('')
  const [linkedVehicles, setLinkedVehicles] = useState<LinkedVehicle[]>([])

  const addLinkedVehicle = (v: LinkedVehicle) => {
    setLinkedVehicles((prev) => prev.find(x => x.stockNumber === v.stockNumber) ? prev : [...prev, v])
  }
  const removeLinkedVehicle = (stockNumber: string) => {
    setLinkedVehicles((prev) => prev.filter(v => v.stockNumber !== stockNumber))
  }

  const addSubtask = () => {
    const val = newSubtask.trim()
    if (!val) return
    setSubtasks([...subtasks.filter(s => s.trim()), val])
    setNewSubtask('')
  }

  const removeSubtask = (idx: number) => {
    setSubtasks(subtasks.filter((_, i) => i !== idx))
  }

  const validSubtasks = subtasks.filter(s => s.trim())

  return (
    <div className="content-modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onCancel}>
      <div className="content-modal-card" style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 440, maxHeight: '90vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}>
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px' }}>Add Content Task</h3>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Title</label>
          <input
            value={title} onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Ad with Camaros and Chevelles"
            autoFocus
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e5ea',
              fontSize: 14, outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
            Linked Vehicles (optional)
          </label>
          <VehicleSearch
            placeholder="Search inventory to tag a vehicle..."
            onSelect={(v) => addLinkedVehicle({
              stockNumber: v.stockNumber, vin: v.vin,
              year: v.year, make: v.make, model: v.model, color: v.color,
            })}
          />
          {linkedVehicles.length > 0 && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {linkedVehicles.map((v) => (
                <div key={v.stockNumber} style={{
                  padding: '8px 12px', borderRadius: 8, background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  fontSize: 13,
                }}>
                  <span>#{v.stockNumber} — {[v.year, v.make, v.model].filter(Boolean).join(' ')}</span>
                  <button type="button" onClick={() => removeLinkedVehicle(v.stockNumber)} style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#16a34a', fontSize: 16, fontWeight: 600, lineHeight: 1,
                  }}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Assign to</label>
          <select
            value={assigneeId} onChange={e => setAssigneeId(e.target.value)}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e5ea',
              fontSize: 14, outline: 'none', background: '#fff', boxSizing: 'border-box',
            }}
          >
            <option value="">Unassigned</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>

        {/* Subtasks */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 8 }}>
            Subtasks {validSubtasks.length > 0 && <span style={{ color: '#8b5cf6' }}>({validSubtasks.length})</span>}
          </label>
          {validSubtasks.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
              {validSubtasks.map((sub, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                  background: '#faf5ff', borderRadius: 8, border: '1px solid #e9d5ff',
                }}>
                  <span style={{ fontSize: 13, flex: 1 }}>{sub}</span>
                  <button onClick={() => removeSubtask(i)} style={{
                    background: 'none', border: 'none', cursor: 'pointer', color: '#ccc', padding: 2,
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={newSubtask}
              onChange={e => setNewSubtask(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSubtask() } }}
              placeholder="e.g. Film Camaro walkthrough video"
              style={{
                flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e5ea',
                fontSize: 13, outline: 'none', boxSizing: 'border-box',
              }}
            />
            <button onClick={addSubtask} disabled={!newSubtask.trim()} style={{
              padding: '10px 14px', borderRadius: 8, border: 'none',
              background: newSubtask.trim() ? '#8b5cf6' : '#e2e5ea',
              color: newSubtask.trim() ? '#fff' : '#999',
              fontSize: 13, fontWeight: 700, cursor: newSubtask.trim() ? 'pointer' : 'default',
            }}>Add</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => title.trim() && onConfirm(
              title.trim(),
              assigneeId || null,
              validSubtasks.map(s => ({ item: s, done: false })),
              linkedVehicles.map(v => v.stockNumber)
            )}
            disabled={!title.trim()}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
              background: title.trim() ? '#8b5cf6' : '#e2e5ea',
              color: title.trim() ? '#fff' : '#999',
              fontSize: 13, fontWeight: 700, cursor: title.trim() ? 'pointer' : 'default',
            }}
          >Add Task</button>
          <button onClick={onCancel} style={{
            padding: '10px 20px', borderRadius: 10, border: '1px solid #e8e8e8',
            background: '#fff', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

/* ── Edit Task Modal (add/remove subtasks) ── */
function EditTaskModal({ task, onSave, onCancel }: {
  task: ContentTask
  onSave: (id: string, subtasks: SubtaskItem[]) => void
  onCancel: () => void
}) {
  const [subtasks, setSubtasks] = useState<SubtaskItem[]>(task.subtasks || [])
  const [newSubtask, setNewSubtask] = useState('')

  const addSubtask = () => {
    const val = newSubtask.trim()
    if (!val) return
    setSubtasks([...subtasks, { item: val, done: false }])
    setNewSubtask('')
  }

  const removeSubtask = (idx: number) => {
    setSubtasks(subtasks.filter((_, i) => i !== idx))
  }

  return (
    <div className="content-modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onCancel}>
      <div className="content-modal-card" style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 440, maxHeight: '90vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}>
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>{task.title}</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 16px' }}>
          {task.assignee?.name || 'Unassigned'}
        </p>

        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 8 }}>
          Subtasks {subtasks.length > 0 && <span style={{ color: '#8b5cf6' }}>({subtasks.filter(s => s.done).length}/{subtasks.length})</span>}
        </label>

        {subtasks.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
            {subtasks.map((sub, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                background: sub.done ? '#f0fdf4' : '#faf5ff', borderRadius: 8,
                border: `1px solid ${sub.done ? '#bbf7d0' : '#e9d5ff'}`,
              }}>
                <div style={{
                  width: 18, height: 18, borderRadius: 5, border: '2px solid',
                  borderColor: sub.done ? '#22c55e' : '#d1d5db',
                  background: sub.done ? '#22c55e' : '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  {sub.done && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>}
                </div>
                <span style={{ fontSize: 13, flex: 1, color: sub.done ? '#22c55e' : 'var(--text-primary)', textDecoration: sub.done ? 'line-through' : 'none' }}>{sub.item}</span>
                <button onClick={() => removeSubtask(i)} style={{
                  background: 'none', border: 'none', cursor: 'pointer', color: '#ccc', padding: 2,
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <input
            value={newSubtask}
            onChange={e => setNewSubtask(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSubtask() } }}
            placeholder="Add a subtask..."
            autoFocus
            style={{
              flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e5ea',
              fontSize: 13, outline: 'none', boxSizing: 'border-box',
            }}
          />
          <button onClick={addSubtask} disabled={!newSubtask.trim()} style={{
            padding: '10px 14px', borderRadius: 8, border: 'none',
            background: newSubtask.trim() ? '#8b5cf6' : '#e2e5ea',
            color: newSubtask.trim() ? '#fff' : '#999',
            fontSize: 13, fontWeight: 700, cursor: newSubtask.trim() ? 'pointer' : 'default',
          }}>Add</button>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => onSave(task.id, subtasks)}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
              background: '#8b5cf6', color: '#fff',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}
          >Save</button>
          <button onClick={onCancel} style={{
            padding: '10px 20px', borderRadius: 10, border: '1px solid #e8e8e8',
            background: '#fff', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

export default function ContentBoard() {
  const [rawData, setData] = useState<BoardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAllVehicles, setShowAllVehicles] = useState(false)
  const [showAllTasks, setShowAllTasks] = useState(false)
  const [userRole, setUserRole] = useState('')
  const [showWeekCompleted, setShowWeekCompleted] = useState(false)
  const [scheduling, setScheduling] = useState<{ id: string; type: 'vehicle' | 'task' } | null>(null)
  const [showAddTask, setShowAddTask] = useState(false)
  const [editTask, setEditTask] = useState<ContentTask | null>(null)
  const [users, setUsers] = useState<{ id: string; name: string }[]>([])
  const [search, setSearch] = useState('')
  // Week-tab state: which day's schedule the user is viewing.  Defaults to today in ET.
  const todayET = useMemo(() => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }), [])
  const [selectedDay, setSelectedDay] = useState<string>(todayET)
  const dragItem = useRef<number | null>(null)
  const dragOver = useRef<number | null>(null)

  // Content team gets parity with admin on this board (schedule, drag, add/edit/delete tasks, etc.)
  // since they own the workflow. Other admin-only features elsewhere remain admin-only.
  const isAdmin = userRole === 'admin' || userRole === 'content'

  const data = useMemo<BoardData | null>(() => {
    if (!rawData) return null
    const q = search.trim().toLowerCase()
    if (!q) return rawData
    const matchVehicle = (j: VehicleJob) => {
      const v = j.vehicle
      const hay = [v.stockNumber, v.year, v.make, v.model, v.color, j.assignee?.name]
        .filter(Boolean).join(' ').toLowerCase()
      return hay.includes(q)
    }
    const matchTask = (t: ContentTask) => {
      const hay = [t.title, t.description, t.assignee?.name, ...(t.stockNumbers || [])]
        .filter(Boolean).join(' ').toLowerCase()
      return hay.includes(q)
    }
    return {
      ...rawData,
      active: rawData.active.filter(matchVehicle),
      activeTasks: rawData.activeTasks.filter(matchTask),
      scheduled: rawData.scheduled.filter(matchVehicle),
      scheduledTasks: rawData.scheduledTasks.filter(matchTask),
      queuedVehicles: rawData.queuedVehicles.filter(matchVehicle),
      queuedTasks: rawData.queuedTasks.filter(matchTask),
      completedToday: rawData.completedToday.filter(matchVehicle),
      completedTasks: rawData.completedTasks.filter(matchTask),
      completedThisWeek: rawData.completedThisWeek.filter(matchVehicle),
      completedTasksThisWeek: rawData.completedTasksThisWeek.filter(matchTask),
    }
  }, [rawData, search])

  const fetchData = useCallback(() => {
    fetch('/api/content-board').then(r => r.json()).then(d => { setData(d); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchData()
    fetch('/api/auth/me').then(r => r.json()).then(d => { if (d.user) setUserRole(d.user.role) }).catch(() => {})
    fetch('/api/users').then(r => r.json()).then(d => { if (Array.isArray(d.users || d)) setUsers(d.users || d) }).catch(() => {})
  }, [fetchData])

  const toggleTask = async (jobId: string, taskIdx: number) => {
    if (!rawData) return
    const updateJobs = (jobs: VehicleJob[]) => jobs.map(j => {
      if (j.id !== jobId) return j
      const updated = [...j.checklist]
      updated[taskIdx] = { ...updated[taskIdx], done: !updated[taskIdx].done }
      return { ...j, checklist: updated }
    })
    setData({ ...rawData, scheduled: updateJobs(rawData.scheduled), queuedVehicles: updateJobs(rawData.queuedVehicles) })
    const job = [...rawData.scheduled, ...rawData.queuedVehicles].find(j => j.id === jobId)
    if (!job) return
    const updated = [...job.checklist]
    updated[taskIdx] = { ...updated[taskIdx], done: !updated[taskIdx].done }
    await fetch(`/api/stages/${jobId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ checklist: updated }) })
  }

  const startVehicle = async (id: string) => {
    await fetch(`/api/stages/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'in_progress' }) })
    fetchData()
  }

  const completeVehicle = async (id: string) => {
    await fetch(`/api/stages/${id}/advance`, { method: 'POST' })
    fetchData()
  }

  const startTask = async (id: string) => {
    await fetch(`/api/board-tasks/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'in_progress' }) })
    fetchData()
  }

  const completeTask = async (id: string) => {
    await fetch(`/api/board-tasks/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'done' }) })
    fetchData()
  }

  const openSchedule = (id: string, type: 'vehicle' | 'task') => setScheduling({ id, type })

  const confirmSchedule = async (date: string) => {
    if (!scheduling) return
    await fetch('/api/content-board/schedule', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ id: scheduling.id, type: scheduling.type, date }] }),
    })
    setScheduling(null)
    fetchData()
  }

  const unschedule = async (id: string, type: 'vehicle' | 'task') => {
    await fetch('/api/content-board/schedule', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ id, type, date: null }] }),
    })
    fetchData()
  }

  const reorderVehicles = async (fromIdx: number, toIdx: number) => {
    if (!rawData) return
    const reordered = [...rawData.queuedVehicles]
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)
    setData({ ...rawData, queuedVehicles: reordered })
    await fetch('/api/stages/reorder', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: 'content', orderedIds: reordered.map(v => v.vehicleId) }),
    })
  }

  const reorderTasks = async (fromIdx: number, toIdx: number) => {
    if (!rawData) return
    const reordered = [...rawData.queuedTasks]
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)
    setData({ ...rawData, queuedTasks: reordered })
    await fetch('/api/board-tasks/reorder', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds: reordered.map(t => t.id) }),
    })
  }

  const deleteTask = async (id: string) => {
    await fetch(`/api/board-tasks/${id}`, { method: 'DELETE' })
    fetchData()
  }

  const createTask = async (title: string, assigneeId: string | null, subtasks: { item: string; done: boolean }[], stockNumbers: string[]) => {
    await fetch('/api/board-tasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, category: 'content', assigneeId, subtasks, stockNumbers }),
    })
    setShowAddTask(false)
    fetchData()
  }

  const toggleSubtask = async (taskId: string, subIdx: number) => {
    if (!rawData) return
    // Optimistic update
    const updateTasks = (tasks: ContentTask[]) => tasks.map(t => {
      if (t.id !== taskId || !t.subtasks) return t
      const updated = [...t.subtasks]
      updated[subIdx] = { ...updated[subIdx], done: !updated[subIdx].done }
      return { ...t, subtasks: updated }
    })
    setData({
      ...rawData,
      activeTasks: updateTasks(rawData.activeTasks),
      scheduledTasks: updateTasks(rawData.scheduledTasks),
    })
    // Find the task to get current subtasks
    const task = [...rawData.activeTasks, ...rawData.scheduledTasks].find(t => t.id === taskId)
    if (!task?.subtasks) return
    const updated = [...task.subtasks]
    updated[subIdx] = { ...updated[subIdx], done: !updated[subIdx].done }
    await fetch(`/api/board-tasks/${taskId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subtasks: updated }),
    })
  }

  if (loading) return <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>Loading...</p>
  if (!data) return <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>Failed to load.</p>

  const LIMIT = 6
  const visibleVehicles = showAllVehicles ? data.queuedVehicles : data.queuedVehicles.slice(0, LIMIT)
  const hiddenVehicles = data.queuedVehicles.length - LIMIT
  const visibleTasks = showAllTasks ? data.queuedTasks : data.queuedTasks.slice(0, LIMIT)
  const hiddenTasks = data.queuedTasks.length - LIMIT

  // Group scheduled items by the YYYY-MM-DD in ET that their scheduledDate falls on,
  // so the day tabs know how many items live on each day and the section below can
  // pull just the selected day's slice.
  const dayKey = (iso: string | null): string | null => {
    if (!iso) return null
    return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  }
  const scheduledByDay: Record<string, number> = {}
  for (const j of data.scheduled) {
    const k = dayKey(j.scheduledDate)
    if (k) scheduledByDay[k] = (scheduledByDay[k] || 0) + 1
  }
  for (const t of data.scheduledTasks) {
    const k = dayKey(t.scheduledDate)
    if (k) scheduledByDay[k] = (scheduledByDay[k] || 0) + 1
  }
  // Active (in_progress) items always belong on the Today tab, so fold them into
  // today's count for the tab badge + the Today stat box.
  if (data.active.length + data.activeTasks.length > 0) {
    scheduledByDay[todayET] = (scheduledByDay[todayET] || 0) + data.active.length + data.activeTasks.length
  }
  // Overdue = scheduled for any day before today and not done.  These auto-roll
  // into the Today tab so nothing slips through the cracks.
  const overdueVehicles = data.scheduled.filter(j => {
    const k = dayKey(j.scheduledDate)
    return k !== null && k < todayET
  })
  const overdueTasks = data.scheduledTasks.filter(t => {
    const k = dayKey(t.scheduledDate)
    return k !== null && k < todayET
  })
  const overdueCount = overdueVehicles.length + overdueTasks.length
  // The slice of items shown in the selected day's panel.
  // Today's panel pulls in three buckets in priority order: anything in_progress
  // (work happening right now), past-due unfinished items (overdue rollover),
  // then items scheduled for today.  Other day tabs only show items scheduled
  // for that specific day — in_progress always belongs on today.
  const isViewingToday = selectedDay === todayET
  const dayVehicles = [
    ...(isViewingToday ? data.active : []),
    ...(isViewingToday ? overdueVehicles : []),
    ...data.scheduled.filter(j => dayKey(j.scheduledDate) === selectedDay),
  ]
  const dayTasks = [
    ...(isViewingToday ? data.activeTasks : []),
    ...(isViewingToday ? overdueTasks : []),
    ...data.scheduledTasks.filter(t => dayKey(t.scheduledDate) === selectedDay),
  ]
  const dayLabel = (() => {
    if (selectedDay === todayET) return 'Today'
    const d = new Date(selectedDay + 'T12:00:00-04:00')
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'America/New_York' })
  })()

  return (
    <div style={{ maxWidth: 1500, margin: '0 auto', position: 'relative' }}>
      <style>{`
        @keyframes content-modal-in {
          from { opacity: 0; transform: scale(0.96) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes content-overlay-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @media (max-width: 767px) {
          /* Header: drop the "Content Board" chip on mobile and let the
             search pill take the full row width. */
          .content-board-chip { display: none !important; }
          .content-board-search { width: 100% !important; }

          /* Day tabs: 7 days don't fit side-by-side at phone widths.
             Switch to horizontal scroll with fixed per-tab width so each
             one stays readable; remove the sliding indicator math by
             pinning each tab to its own size instead of flexing. */
          .week-tabs { overflow-x: auto !important; scrollbar-width: none; }
          .week-tabs::-webkit-scrollbar { display: none; }
          .week-tabs > button { flex: 0 0 78px !important; }
          .week-tabs > div[aria-hidden] { display: none !important; }
          .week-tabs > button.week-tab-active {
            background: linear-gradient(135deg, #1d1d1f, #0a0a0a);
            box-shadow:
              0 4px 14px -2px rgba(0,0,0,0.35),
              inset 0 1px 0 rgba(255,255,255,0.12),
              inset 0 -1px 0 rgba(0,0,0,0.3);
          }

          .queue-card,
          .active-card {
            transition: transform 0.18s ease, box-shadow 0.18s ease;
            -webkit-tap-highlight-color: transparent;
          }
          .queue-card:active,
          .active-card:active {
            transform: scale(0.985);
          }
          .queue-card { flex-direction: column !important; align-items: stretch !important; gap: 10px !important; }
          .queue-card-info { width: 100%; }
          .queue-card-actions {
            width: 100%;
            display: flex !important;
            gap: 8px !important;
            padding-top: 10px;
            border-top: 1px solid rgba(255, 255, 255, 0.4);
          }
          .queue-card-actions > button {
            flex: 1 1 0;
            min-height: 38px;
          }
          .queue-card-actions > button.queue-icon-btn { flex: 0 0 38px; min-height: 38px; }
          .active-card-actions {
            width: 100%;
            display: flex !important;
            gap: 8px !important;
            margin-top: 4px;
          }
          .active-card-actions > button {
            flex: 1 1 0;
            min-height: 38px;
          }
          .content-modal-overlay { animation: content-overlay-in 0.18s ease both; }
          .content-modal-card { animation: content-modal-in 0.22s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
        }
      `}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 22 }}>
        <span className="content-board-chip" style={{
          fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
          padding: '4px 12px', borderRadius: 999,
          background: 'rgba(255, 255, 255, 0.6)',
          backdropFilter: 'blur(14px) saturate(180%)',
          WebkitBackdropFilter: 'blur(14px) saturate(180%)',
          color: 'rgba(0, 0, 0, 0.6)',
          border: '1px solid rgba(255, 255, 255, 0.6)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8)',
        }}>Content Board</span>
        <input
          className="content-board-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search stock, vehicle, task, assignee…"
          style={{
            padding: '10px 16px', borderRadius: 999,
            border: '1px solid rgba(255, 255, 255, 0.55)',
            background: 'rgba(255, 255, 255, 0.55)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            fontSize: 13, fontWeight: 500, color: '#1d1d1f',
            width: 300, outline: 'none',
            boxSizing: 'border-box',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7), 0 2px 8px -2px rgba(31, 38, 135, 0.08)',
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        <StatBox label="Total" value={data.stats.total} />
        <StatBox label="Today" value={(scheduledByDay[todayET] || 0) + overdueCount} color="#3b82f6" />
        <StatBox label="Done Today" value={data.stats.completedToday} color="#22c55e" />
        <StatBox label="Done This Week" value={data.stats.completedThisWeek} color="#8b5cf6"
          onClick={() => setShowWeekCompleted(!showWeekCompleted)} active={showWeekCompleted} />
      </div>

      {/* Schedule — day tabs for the next 7 days.  Active (in_progress) items
          live in the Today tab automatically so they share a viewport with the
          rest of today's work. */}
      <div style={{ marginBottom: 28 }}>
        <WeekTabs
          selectedDay={selectedDay}
          onSelect={setSelectedDay}
          scheduledByDay={scheduledByDay}
          todayDay={todayET}
          overdueCount={overdueCount}
        />
        <SectionHeader
          label={`Schedule · ${dayLabel}`}
          count={dayVehicles.length + dayTasks.length}
          color="#3b82f6"
        />
        {isViewingToday && overdueCount > 0 && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
            color: '#b42318',
            background: 'rgba(254, 226, 226, 0.65)',
            backdropFilter: 'blur(10px) saturate(180%)',
            WebkitBackdropFilter: 'blur(10px) saturate(180%)',
            border: '1px solid rgba(252, 165, 165, 0.5)',
            padding: '5px 12px', borderRadius: 999, marginBottom: 10,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5)',
          }}>
            <span aria-hidden style={{
              width: 5, height: 5, borderRadius: '50%', background: '#b42318',
              boxShadow: '0 0 6px rgba(180,35,24,0.6)',
            }} />
            {overdueCount} overdue rolled in
          </div>
        )}
        {dayVehicles.length === 0 && dayTasks.length === 0 ? (
          <EmptyHint>
            Nothing scheduled for {isViewingToday ? 'today' : dayLabel}{isAdmin ? ' · Use the Schedule button on queue items below.' : '.'}
          </EmptyHint>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {dayVehicles.map(job => (
              <ActiveVehicleCard key={job.id} job={job} onToggleTask={toggleTask} onComplete={completeVehicle}
                adminAction={isAdmin ? () => unschedule(job.id, 'vehicle') : undefined} />
            ))}
            {dayTasks.map(task => (
              <ActiveTaskCard key={task.id} task={task} onComplete={completeTask} onToggleSubtask={toggleSubtask} onEdit={setEditTask}
                adminAction={isAdmin ? () => unschedule(task.id, 'task') : undefined} />
            ))}
          </div>
        )}
      </div>

      {/* Queue: Recon Vehicles */}
      <div style={{ marginBottom: 28 }}>
        <SectionHeader label="Recon Vehicles" count={data.queuedVehicles.length} color="#94a3b8" />
        {data.queuedVehicles.length === 0 ? (
          <EmptyHint>No recon vehicles waiting</EmptyHint>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {visibleVehicles.map((job, idx) => (
                <div key={job.id}
                  draggable={isAdmin}
                  onDragStart={() => { dragItem.current = idx }}
                  onDragEnter={() => { dragOver.current = idx }}
                  onDragEnd={() => { if (dragItem.current !== null && dragOver.current !== null && dragItem.current !== dragOver.current) reorderVehicles(dragItem.current, dragOver.current); dragItem.current = null; dragOver.current = null }}
                  onDragOver={e => e.preventDefault()}
                  style={{ cursor: isAdmin ? 'grab' : 'default' }}
                >
                  <QueueVehicleCard job={job} onStart={startVehicle} isAdmin={isAdmin} onSchedule={openSchedule} index={idx} />
                </div>
              ))}
            </div>
            {!showAllVehicles && hiddenVehicles > 0 && (
              <ShowMore count={hiddenVehicles} onClick={() => setShowAllVehicles(true)} />
            )}
          </>
        )}
      </div>

      {/* Queue: Content to Create */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <SectionHeader label="Content to Create" count={data.queuedTasks.length} color="#8b5cf6" />
          {isAdmin && (
            <button onClick={() => setShowAddTask(true)} style={{
              padding: '8px 16px', borderRadius: 999, border: 'none',
              background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.95), rgba(124, 58, 237, 0.95))',
              color: '#fff',
              fontSize: 12, fontWeight: 700, letterSpacing: '-0.005em',
              cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              boxShadow: '0 6px 18px -6px rgba(124, 58, 237, 0.45), inset 0 1px 0 rgba(255,255,255,0.2)',
              transition: 'transform 160ms ease',
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              Add Task
            </button>
          )}
        </div>
        {data.queuedTasks.length === 0 ? (
          <EmptyHint>No content tasks queued</EmptyHint>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {visibleTasks.map((task, idx) => (
                <div key={task.id}
                  draggable={isAdmin}
                  onDragStart={() => { dragItem.current = idx }}
                  onDragEnter={() => { dragOver.current = idx }}
                  onDragEnd={() => { if (dragItem.current !== null && dragOver.current !== null && dragItem.current !== dragOver.current) reorderTasks(dragItem.current, dragOver.current); dragItem.current = null; dragOver.current = null }}
                  onDragOver={e => e.preventDefault()}
                  style={{ cursor: isAdmin ? 'grab' : 'default' }}
                >
                  <QueueTaskCard task={task} onStart={startTask} isAdmin={isAdmin} onSchedule={openSchedule} onDelete={deleteTask} onEdit={setEditTask} index={idx} />
                </div>
              ))}
            </div>
            {!showAllTasks && hiddenTasks > 0 && (
              <ShowMore count={hiddenTasks} onClick={() => setShowAllTasks(true)} />
            )}
          </>
        )}
      </div>

      {/* Completed Today */}
      {(data.completedToday.length > 0 || data.completedTasks.length > 0) && (
        <div style={{ marginBottom: 28 }}>
          <SectionHeader label="Completed Today" count={data.completedToday.length + data.completedTasks.length} color="#22c55e" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {data.completedToday.map(job => {
              const v = job.vehicle
              return (
                <CompletedCard
                  key={job.id}
                  accent="#22c55e"
                  title={`#${v.stockNumber}`}
                  sub={`${`${v.year ?? ''} ${v.make} ${v.model}`.trim()}${job.assignee ? ` · ${job.assignee.name}` : ''}`}
                  time={job.completedAt ? new Date(job.completedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null}
                />
              )
            })}
            {data.completedTasks.map(task => (
              <CompletedCard
                key={task.id}
                accent="#22c55e"
                title={task.title}
                sub={task.assignee?.name}
              />
            ))}
          </div>
        </div>
      )}

      {/* Completed This Week */}
      {showWeekCompleted && (data.completedToday.length + data.completedTasks.length + data.completedThisWeek.length + data.completedTasksThisWeek.length > 0) && (
        <div style={{ marginBottom: 28 }}>
          <SectionHeader label="Completed This Week" count={data.stats.completedThisWeek} color="#8b5cf6" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {[...data.completedToday, ...data.completedThisWeek].map(job => {
              const v = job.vehicle
              const timeText = job.completedAt
                ? `${new Date(job.completedAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${new Date(job.completedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
                : null
              return (
                <CompletedCard
                  key={job.id}
                  accent="#8b5cf6"
                  title={`#${v.stockNumber}`}
                  sub={`${`${v.year ?? ''} ${v.make} ${v.model}`.trim()}${job.assignee ? ` · ${job.assignee.name}` : ''}`}
                  time={timeText}
                />
              )
            })}
            {[...data.completedTasks, ...data.completedTasksThisWeek].map(task => (
              <CompletedCard
                key={task.id}
                accent="#8b5cf6"
                title={task.title}
                sub={task.assignee?.name}
              />
            ))}
          </div>
        </div>
      )}

      {/* Add Task Modal */}
      {showAddTask && <AddTaskModal users={users} onConfirm={createTask} onCancel={() => setShowAddTask(false)} />}

      {/* Edit Task Modal */}
      {editTask && <EditTaskModal task={editTask} onSave={async (id, subtasks) => {
        await fetch(`/api/board-tasks/${id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subtasks }),
        })
        setEditTask(null)
        fetchData()
      }} onCancel={() => setEditTask(null)} />}

      {/* Schedule Modal */}
      {scheduling && <ScheduleModal onConfirm={confirmSchedule} onCancel={() => setScheduling(null)} />}
    </div>
  )
}
