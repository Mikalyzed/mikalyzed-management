'use client'

type ReturnQueueEntry = { stage: string; fromStage?: string; reason?: string }

type VehicleCardProps = {
  id: string
  stockNumber: string
  year?: number | null
  make: string
  model: string
  color?: string | null
  status: string
  stageStatus?: string
  stageDetail?: string
  stageScope?: string | null
  assigneeName?: string | null
  timeInStage?: string
  partsLabel?: string | null
  partsToInstall?: number
  returnQueue?: ReturnQueueEntry[]
  pauseReason?: string | null
  // Display-only checklist progress (already loaded on the board) — drives the
  // slim progress bar. Rendered only when checklistTotal > 0.
  checklistDone?: number
  checklistTotal?: number
  progressLabel?: string | null
  onClick?: () => void
}

const PARTS_COLORS: Record<string, string> = {
  'Parts need to be found': '#ef4444',
  'Parts pending approval': '#a16207',
  'Parts need to be ordered': '#2563eb',
  'Parts ordered': '#eab308',
}

// Stable, friendly avatar tints keyed off the assignee's name.
const AVATAR_COLORS = ['#6366f1', '#0d9488', '#8b5cf6', '#16a34a', '#d97706', '#e11d48', '#2563eb', '#0891b2']

function avatarColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function titleCase(s: string) {
  return s
    .toLowerCase()
    .split(/(\s+|\/)/)
    .map(part => /^\s+$|^\/$/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

function sentenceCase(s: string): string {
  const trimmed = s.trim()
  if (!trimmed) return trimmed
  const lower = trimmed.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

// Map the computed stage status → a calm pill (dot + label) + a spine colour.
// Colour encodes state so a busy board reads at a glance: green active, amber
// paused, blue parts, red blocked, neutral queued. `spine` is a solid hex
// (never a CSS var) so the glowing left edge always renders.
function statusPill(status?: string, detail?: string): { label: string; fg: string; bg: string; spine: string } | null {
  const s = detail || status
  if (!s) return null
  switch (s) {
    case 'in_progress': return { label: 'Active', fg: '#16a34a', bg: '#edfaf0', spine: '#16a34a' }
    case 'paused':
    case 'auto_paused': return { label: 'Paused', fg: '#d97706', bg: '#fdf3e7', spine: '#f59e0b' }
    case 'awaiting_parts': return { label: 'Parts', fg: '#2563eb', bg: '#eaf0fe', spine: '#2563eb' }
    case 'blocked': return { label: 'Blocked', fg: '#e11d48', bg: '#fdecef', spine: '#e11d48' }
    case 'done': return { label: 'Done', fg: '#16a34a', bg: '#edfaf0', spine: '#16a34a' }
    case 'pending': return { label: 'Queued', fg: 'var(--text-secondary)', bg: 'var(--bg-primary)', spine: '#c7c7c1' }
    default: return { label: titleCase(s.replace(/_/g, ' ')), fg: 'var(--text-secondary)', bg: 'var(--bg-primary)', spine: '#c7c7c1' }
  }
}

export default function VehicleCard({
  stockNumber, year, make, model, color,
  status, stageStatus, stageDetail, stageScope, assigneeName, timeInStage, partsLabel, partsToInstall, returnQueue, pauseReason,
  checklistDone, checklistTotal, progressLabel, onClick,
}: VehicleCardProps) {
  const isCompleted = status === 'completed'
  // Skip queue entries whose target stage equals the vehicle's current stage —
  // those are stale (e.g. admin manually routed back without consuming the queue).
  const nextReturn = !isCompleted && returnQueue && returnQueue.length > 0
    ? returnQueue.find(r => r.stage !== status) ?? null
    : null
  const isSold = stageScope === 'Sold Delivery'
  // "New Inventory" is the legacy toggle scope; "New Vehicle Inspection" is
  // the current template name. Both mark a fresh-intake mechanic stage.
  const isNewInventory = stageScope === 'New Inventory' || stageScope === 'New Vehicle Inspection'

  const pill = statusPill(stageStatus, stageDetail)
  const title = [year, titleCase(make), titleCase(model)].filter(Boolean).join(' ')
  const colorLabel = color ? titleCase(color) : null

  const total = checklistTotal ?? 0
  const done = Math.min(checklistDone ?? 0, total)
  const pct = total > 0 ? Math.max(4, Math.round((done / total) * 100)) : 0
  const allDone = total > 0 && done >= total

  // Attention strips — one small inset per relevant signal (usually 0–1).
  type Strip = { fg: string; bg: string; dot: string; label: React.ReactNode; title?: string }
  const strips: Strip[] = []
  if (nextReturn) {
    strips.push({
      fg: '#b45309', bg: '#fdf3e7', dot: '#f59e0b',
      label: <><b style={{ fontWeight: 700 }}>Returns to {titleCase(nextReturn.stage)}</b>{nextReturn.reason ? ` · ${nextReturn.reason}` : ''}</>,
      title: nextReturn.reason,
    })
  } else if (partsLabel) {
    const c = PARTS_COLORS[partsLabel] || '#6b7280'
    strips.push({ fg: c, bg: '#f6f7f9', dot: c, label: <b style={{ fontWeight: 700 }}>{partsLabel}</b> })
  }
  if (isSold) {
    strips.push({ fg: '#b45309', bg: '#fdf3e7', dot: '#f59e0b', label: <><b style={{ fontWeight: 700 }}>Sold</b> · delivery prep</> })
  }
  if (isNewInventory) {
    strips.push({ fg: '#1d4ed8', bg: '#eaf0fe', dot: '#2563eb', label: <b style={{ fontWeight: 700 }}>New inspection</b> })
  }
  if (pauseReason) {
    strips.push({
      fg: '#b45309', bg: '#fdf3e7', dot: '#ea580c',
      label: <><b style={{ fontWeight: 700 }}>Paused</b> · {sentenceCase(pauseReason)}</>,
    })
  }
  // Received part(s) waiting to be installed while the car isn't in mechanic —
  // caller passes this only for non-mechanic stages.
  if (partsToInstall && partsToInstall > 0) {
    strips.push({
      fg: '#1d4ed8', bg: '#eaf0fe', dot: '#2563eb',
      label: <b style={{ fontWeight: 700 }}>{partsToInstall} part{partsToInstall === 1 ? '' : 's'} to install</b>,
    })
  }

  return (
    <div
      onClick={onClick}
      className="vehicle-card-modern"
      style={{
        cursor: onClick ? 'pointer' : undefined,
        position: 'relative',
        background: 'var(--bg-card)',
        borderRadius: 16,
        padding: '14px 15px',
        border: '1px solid var(--border)',
        boxShadow: '0 1px 2px rgba(24,24,27,.04), 0 6px 16px -6px rgba(24,24,27,.10)',
        overflow: 'hidden',
        transition: 'transform 0.16s cubic-bezier(.2,.7,.3,1), box-shadow 0.16s ease, border-color 0.16s ease',
      }}
    >
      {/* Title row: vehicle name (truncates — full name on hover) + status */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 9 }}>
        <p title={title} style={{
          fontSize: 13.5, fontWeight: 640, lineHeight: 1.3, letterSpacing: '-0.015em',
          color: 'var(--text-primary)', flex: 1, minWidth: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {title}
        </p>
        {pill && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
            fontSize: 10.5, fontWeight: 600, letterSpacing: '-0.005em',
            padding: '3px 8px 3px 7px', borderRadius: 100,
            color: pill.fg, background: pill.bg,
            border: pill.bg.startsWith('var') ? '1px solid var(--border)' : 'none',
            whiteSpace: 'nowrap',
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: pill.fg, flexShrink: 0 }} />
            {pill.label}
          </span>
        )}
      </div>

      {/* Meta row: stock chip · color */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 8, minWidth: 0 }}>
        <span style={{
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          fontSize: 10.5, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '-0.01em',
          background: 'var(--bg-primary)', border: '1px solid var(--border)',
          padding: '2px 7px', borderRadius: 6, whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          #{stockNumber}
        </span>
        {colorLabel && (
          <span style={{ fontSize: 11.5, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {colorLabel}
          </span>
        )}
      </div>

      {/* Progress */}
      {total > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: 10 }}>
            <span style={{
              fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', letterSpacing: '-0.005em',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
            }}>
              {progressLabel || 'Checklist'}
            </span>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
              {done}/{total}
            </span>
          </div>
          <div style={{ height: 5, borderRadius: 100, background: 'var(--border-light)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${pct}%`, borderRadius: 100,
              background: allDone ? '#16a34a' : 'var(--text-primary)',
              transition: 'width 0.3s ease',
            }} />
          </div>
        </div>
      )}

      <div style={{ height: 1, background: 'var(--border-light)', margin: '14px 0' }} />

      {/* Footer: assignee · time */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {assigneeName ? (
            <span style={{
              width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
              display: 'grid', placeItems: 'center',
              fontSize: 10.5, fontWeight: 700, color: '#fff', letterSpacing: '-0.01em',
              background: avatarColor(assigneeName),
            }}>
              {initials(assigneeName)}
            </span>
          ) : (
            <span style={{
              width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
              display: 'grid', placeItems: 'center',
              fontSize: 12, fontWeight: 600, color: 'var(--text-muted)',
              background: 'var(--bg-primary)', border: '1.5px dashed var(--border)',
            }}>?</span>
          )}
          <span style={{
            fontSize: 12.5, fontWeight: assigneeName ? 500 : 500,
            color: assigneeName ? 'var(--text-primary)' : 'var(--text-muted)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
          }}>
            {assigneeName || 'Unassigned'}
          </span>
        </div>
        {timeInStage && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            color: 'var(--text-secondary)', fontSize: 12, fontWeight: 500,
            fontVariantNumeric: 'tabular-nums', flexShrink: 0,
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3.5 1.8" />
            </svg>
            {timeInStage}
          </span>
        )}
      </div>

      {/* Attention strips */}
      {strips.map((s, i) => (
        <div
          key={i}
          title={s.title}
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: i === 0 ? 12 : 6,
            padding: '9px 11px', borderRadius: 9, background: s.bg, color: s.fg,
            fontSize: 11.5, fontWeight: 550, lineHeight: 1.35,
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.dot, flexShrink: 0, marginTop: 3 }} />
          <span style={{
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>{s.label}</span>
        </div>
      ))}
    </div>
  )
}
