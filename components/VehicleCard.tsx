'use client'

import { StageBadge, StatusBadge } from './StageBadge'

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
  status, stageStatus, stageDetail, assigneeName, timeInStage, partsLabel, onClick,
}: VehicleCardProps) {
  const partsStyle = partsLabel ? PARTS_COLORS[partsLabel] || { bg: '#f3f4f6', color: '#6b7280' } : null

  return (
    <div onClick={onClick} className="card" style={{ cursor: onClick ? 'pointer' : undefined }}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <p className="text-sm font-semibold tracking-tight">
              #{stockNumber}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {year} {make} {model}
              {color && <span className="ml-1">· {color}</span>}
            </p>
          </div>
          <StageBadge stage={status} />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {stageStatus && <StatusBadge status={stageStatus} detail={stageDetail} />}
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
            🔧 {partsLabel}
          </div>
        )}
      </div>
  )
}
