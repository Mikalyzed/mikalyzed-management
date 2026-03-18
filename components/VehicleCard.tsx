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
      <div className={`card ${isOverdue ? 'overdue-flag' : ''}`}
        style={isOverdue ? { borderColor: 'var(--danger)' } : {}}>
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <p className="font-semibold text-sm">
              #{stockNumber}
            </p>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {year} {make} {model}
              {color && <span> · {color}</span>}
            </p>
          </div>
          <StageBadge stage={status} />
        </div>

        <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
          <div className="flex items-center gap-2">
            {stageStatus && <StatusBadge status={stageStatus} />}
            {assigneeName && <span>👤 {assigneeName}</span>}
          </div>
          {timeInStage && (
            <span className={isOverdue ? '' : ''} style={isOverdue ? { color: 'var(--danger)' } : {}}>
              ⏱ {timeInStage}
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
