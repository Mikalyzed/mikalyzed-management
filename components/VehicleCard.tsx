'use client'

import { StatusBadge } from './StageBadge'

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
  returnQueue?: ReturnQueueEntry[]
  pauseReason?: string | null
  onClick?: () => void
}

const PARTS_COLORS: Record<string, string> = {
  'Parts need to be found': '#ef4444',
  'Parts pending approval': '#a16207',
  'Parts need to be ordered': '#2563eb',
  'Parts ordered': '#eab308',
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

export default function VehicleCard({
  stockNumber, year, make, model, color,
  status, stageStatus, stageDetail, stageScope, assigneeName, timeInStage, partsLabel, returnQueue, pauseReason, onClick,
}: VehicleCardProps) {
  const isCompleted = status === 'completed'
  // Skip queue entries whose target stage equals the vehicle's current stage —
  // those are stale (e.g. admin manually routed back without consuming the queue).
  const nextReturn = !isCompleted && returnQueue && returnQueue.length > 0
    ? returnQueue.find(r => r.stage !== status) ?? null
    : null
  const isSold = stageScope === 'Sold Delivery'
  // "New Inventory" is the legacy toggle scope; "New Vehicle Inspection" is
  // the current template name. Both mark a fresh-intake mechanic stage and
  // should fly the same blue "New Inspection" badge.
  const isNewInventory = stageScope === 'New Inventory' || stageScope === 'New Vehicle Inspection'

  const accentColor = isSold ? '#f59e0b'
    : nextReturn ? '#f59e0b'
    : isNewInventory ? '#3b82f6'
    : null

  let alertLabel: string | null = null
  let alertColor: string | null = null
  if (nextReturn) {
    alertLabel = `Returns to ${titleCase(nextReturn.stage)}`
    alertColor = '#92400e'
  } else if (partsLabel) {
    alertLabel = partsLabel
    alertColor = PARTS_COLORS[partsLabel] || '#6b7280'
  }

  const title = [year, titleCase(make), titleCase(model)].filter(Boolean).join(' ')
  const colorLabel = color ? titleCase(color) : null

  return (
    <div
      onClick={onClick}
      className="vehicle-card-modern"
      style={{
        cursor: onClick ? 'pointer' : undefined,
        position: 'relative',
        background: '#ffffff',
        borderRadius: 14,
        padding: '16px 18px',
        paddingLeft: accentColor ? 18 : 18,
        border: '1px solid rgba(0,0,0,0.04)',
        boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)',
        overflow: 'hidden',
        transition: 'transform 0.14s ease, box-shadow 0.14s ease',
      }}
    >
      {accentColor && (
        <div style={{
          position: 'absolute', top: 0, bottom: 0, left: 0, width: 3,
          background: accentColor,
          opacity: 0.85,
        }} />
      )}

      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
        <p style={{
          fontSize: 14, fontWeight: 600, lineHeight: 1.3,
          color: '#1a1a1a', letterSpacing: '-0.01em',
          wordBreak: 'break-word', flex: 1, minWidth: 0,
        }}>
          {title}
        </p>
        {stageStatus && <StatusBadge status={stageStatus} detail={stageDetail} />}
      </div>

      {/* Sub-row: stock # · color · scope tag */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 14 }}>
        <span style={{
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          fontSize: 10.5, fontWeight: 600,
          color: '#9a9a96',
          letterSpacing: '0.01em',
        }}>
          #{stockNumber}
        </span>
        {colorLabel && (
          <>
            <span style={{ fontSize: 10.5, color: '#cfcfca' }}>·</span>
            <span style={{ fontSize: 10.5, color: '#9a9a96' }}>{colorLabel}</span>
          </>
        )}
        {isSold && (
          <span style={{
            marginLeft: 'auto',
            fontSize: 9, fontWeight: 700,
            padding: '3px 8px', borderRadius: 100,
            background: '#fef3c7',
            color: '#92400e',
            textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>
            Sold
          </span>
        )}
      </div>

      {/* Meta row: assignee · time */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, lineHeight: 1.2 }}>
        <span style={{
          fontSize: 12,
          color: assigneeName ? '#3a3a3a' : '#a8a8a4',
          fontWeight: 500,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          minWidth: 0,
        }}>
          {assigneeName || 'Unassigned'}
        </span>
        {timeInStage && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            color: '#737373',
            fontSize: 12, fontWeight: 500,
            fontVariantNumeric: 'tabular-nums',
            flexShrink: 0,
          }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
              <circle cx="12" cy="12" r="9" />
              <polyline points="12 7 12 12 15.5 13.5" />
            </svg>
            {timeInStage}
          </span>
        )}
      </div>

      {/* Alert row: parts or returns */}
      {alertLabel && alertColor && (
        <div
          title={nextReturn?.reason}
          style={{
            marginTop: 12, paddingTop: 10,
            borderTop: '1px solid #f0f0ec',
            display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 11, fontWeight: 600,
            color: alertColor,
          }}
        >
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: alertColor, flexShrink: 0,
          }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {alertLabel}
          </span>
        </div>
      )}

      {/* Pause reason */}
      {pauseReason && (
        <div style={{
          marginTop: alertLabel ? 6 : 12,
          paddingTop: alertLabel ? 0 : 10,
          borderTop: alertLabel ? 'none' : '1px solid #f0f0ec',
          display: 'flex', alignItems: 'flex-start', gap: 8,
          fontSize: 10.5, fontWeight: 600,
          color: '#b45309',
          textTransform: 'none',
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: '#ea580c', flexShrink: 0,
            marginTop: 5,
          }} />
          <span style={{
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            lineHeight: 1.35,
            textTransform: 'none',
          }}>
            <span style={{ color: '#9a3412' }}>Paused:</span> <span>{sentenceCase(pauseReason)}</span>
          </span>
        </div>
      )}

      {/* New Inspection footer */}
      {isNewInventory && (
        <div style={{
          marginTop: alertLabel ? 6 : 12,
          paddingTop: alertLabel ? 0 : 10,
          borderTop: alertLabel ? 'none' : '1px solid #f0f0ec',
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 11, fontWeight: 600,
          color: '#1d4ed8',
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: '#1d4ed8', flexShrink: 0,
          }} />
          <span>New Inspection</span>
        </div>
      )}
    </div>
  )
}
