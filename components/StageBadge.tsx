import { STAGE_LABELS, STAGE_COLORS } from '@/lib/constants'

export function StageBadge({ stage }: { stage: string }) {
  const label = STAGE_LABELS[stage as keyof typeof STAGE_LABELS] || stage
  const color = STAGE_COLORS[stage as keyof typeof STAGE_COLORS] || 'badge-pending'
  return <span className={`badge ${color}`}>{label}</span>
}

export function StatusBadge({ status, detail }: { status: string; detail?: string }) {
  const labels: Record<string, string> = {
    pending: 'Pending',
    in_progress: 'In Progress',
    blocked: 'Blocked',
    done: 'Done',
    paused: 'Paused',
    awaiting_parts: 'Awaiting Parts',
    auto_paused: 'Auto Paused',
  }
  const displayStatus = detail || status
  return (
    <span className={`badge badge-${displayStatus.replace('_', '-')}`}>
      {labels[displayStatus] || labels[status] || status}
    </span>
  )
}

export function UrgencyBadge({ urgency }: { urgency: string }) {
  return <span className={`badge badge-${urgency}`}>{urgency}</span>
}
