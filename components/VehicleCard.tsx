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
  assigneeName?: string | null
  timeInStage?: string
  partsLabel?: string | null
  returnQueue?: ReturnQueueEntry[]
  onClick?: () => void
}

const PARTS_COLORS: Record<string, { bg: string; color: string }> = {
  'Parts need to be found': { bg: '#fef2f2', color: '#ef4444' },
  'Parts pending approval': { bg: '#fef9c3', color: '#a16207' },
  'Parts need to be ordered': { bg: '#eff6ff', color: '#2563eb' },
  'Parts ordered': { bg: '#fefce8', color: '#eab308' },
}

export default function VehicleCard({
  id, stockNumber, year, make, model, color,
  status, stageStatus, stageDetail, assigneeName, timeInStage, partsLabel, returnQueue, onClick,
}: VehicleCardProps) {
  const partsStyle = partsLabel ? PARTS_COLORS[partsLabel] || { bg: '#f3f4f6', color: '#6b7280' } : null
  const nextReturn = returnQueue && returnQueue.length > 0 ? returnQueue[0] : null

  return (
    <div onClick={onClick} className="card" style={{ cursor: onClick ? 'pointer' : undefined }}>
        <div className="flex items-center justify-between gap-3 mb-1">
          <p className="text-sm font-semibold tracking-tight">#{stockNumber}</p>
          {stageStatus && <StatusBadge status={stageStatus} detail={stageDetail} />}
        </div>
        <p className="text-xs mb-3" style={{
          color: 'var(--text-muted)',
          whiteSpace: 'normal',
          overflowWrap: 'anywhere',
          wordBreak: 'break-word',
          lineHeight: 1.35,
        }}>
          {year} {make} {model}
          {color && <span className="ml-1">· {color}</span>}
        </p>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {assigneeName && (
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {assigneeName}
              </span>
            )}
          </div>
          {timeInStage && (
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              {timeInStage}
            </span>
          )}
        </div>

        {nextReturn && (
          <div
            title={nextReturn.reason || `Returns to ${nextReturn.stage}`}
            style={{
              marginTop: '8px', padding: '4px 8px', borderRadius: '6px',
              background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d',
              fontSize: '11px', fontWeight: 600, textAlign: 'center',
            }}
          >
            Returns to {nextReturn.stage.charAt(0).toUpperCase() + nextReturn.stage.slice(1)}
          </div>
        )}

        {partsLabel && partsStyle && (
          <div style={{
            marginTop: '8px',
            padding: '4px 8px',
            borderRadius: '6px',
            background: partsStyle.bg,
            color: partsStyle.color,
            fontSize: '11px',
            fontWeight: 600,
            textAlign: 'center',
          }}>
            {partsLabel}
          </div>
        )}
      </div>
  )
}
