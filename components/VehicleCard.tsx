'use client'

import Link from 'next/link'
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
  assigneeName?: string | null
  timeInStage?: string
  isOverdue?: boolean
}

export default function VehicleCard({
  id, stockNumber, year, make, model, color,
  status, stageStatus, assigneeName, timeInStage, isOverdue,
}: VehicleCardProps) {
  return (
    <Link href={`/vehicles/${id}`} className="block">
      <div className={`card ${isOverdue ? 'overdue-flag' : ''}`}>
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
            {stageStatus && <StatusBadge status={stageStatus} />}
            {assigneeName && (
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {assigneeName}
              </span>
            )}
          </div>
          {timeInStage && (
            <span className="text-xs font-medium" style={{ color: isOverdue ? 'var(--danger)' : 'var(--text-muted)' }}>
              {timeInStage}
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
