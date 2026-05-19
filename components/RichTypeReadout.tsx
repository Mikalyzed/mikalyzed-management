'use client'

import { fieldsForItem } from '@/lib/checklist-fields'

/**
 * Read-only display of values for a structured checklist item.
 * Shows on the recon board card so admins can see at a glance what the
 * mechanic recorded (tire PSIs, fluid statuses, brake mm, etc.) without
 * having to navigate to the Mechanic Schedule.
 */

type PillValue = { status?: string; note?: string } | string | number | undefined | null

type Props = {
  item: { type?: string; fields?: { key: string; label: string }[]; data?: Record<string, unknown> }
}

const PILL_COLORS: Record<string, { bg: string; fg: string }> = {
  ok: { bg: '#dcfce7', fg: '#16a34a' },
  no: { bg: '#dcfce7', fg: '#16a34a' },
  topped: { bg: '#dbeafe', fg: '#2563eb' },
  issue: { bg: '#fee2e2', fg: '#dc2626' },
  yes: { bg: '#fee2e2', fg: '#dc2626' },
}

const PILL_LABELS: Record<string, string> = {
  ok: 'OK', topped: 'Topped', issue: 'Issue', no: 'No', yes: 'Yes',
}

function isNumberType(type?: string): boolean {
  return type === 'tirePsi' || type === 'brakePads'
}

function unitForType(type?: string): string {
  if (type === 'tirePsi') return ' psi'
  if (type === 'brakePads') return ' mm'
  return ''
}

function getStatus(v: PillValue): string | undefined {
  if (v && typeof v === 'object' && 'status' in v) return (v as any).status
  return undefined
}

function getNote(v: PillValue): string | undefined {
  if (v && typeof v === 'object' && 'note' in v) return (v as any).note
  return undefined
}

export default function RichTypeReadout({ item }: Props) {
  const fields = fieldsForItem(item)
  const data = (item.data || {}) as Record<string, PillValue>
  if (fields.length === 0) return null

  const isNumber = isNumberType(item.type)
  const unit = unitForType(item.type)

  // Number-type readout: compact grid of label: value
  if (isNumber) {
    return (
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px 12px',
        marginTop: 6, padding: '6px 8px', borderRadius: 6,
        background: 'rgba(0,0,0,0.03)',
      }}>
        {fields.map(f => {
          const v = data[f.key]
          const display = v == null || v === '' ? '—' : `${v}${unit}`
          return (
            <div key={f.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
              <span style={{ color: 'var(--text-muted)' }}>{f.label}</span>
              <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: v == null ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                {display}
              </span>
            </div>
          )
        })}
      </div>
    )
  }

  // Pill-type readout: each field with a colored chip + optional note
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 3,
      marginTop: 6, padding: '6px 8px', borderRadius: 6,
      background: 'rgba(0,0,0,0.03)',
    }}>
      {fields.map(f => {
        const v = data[f.key]
        const status = getStatus(v)
        const note = getNote(v)
        const colors = status ? PILL_COLORS[status.toLowerCase()] : null
        return (
          <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
            <span style={{ flex: 1, color: 'var(--text-muted)' }}>{f.label}</span>
            {status && colors ? (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 4,
                background: colors.bg, color: colors.fg,
                textTransform: 'uppercase', letterSpacing: '0.03em',
              }}>
                {PILL_LABELS[status.toLowerCase()] || status}
              </span>
            ) : (
              <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>—</span>
            )}
            {note && status && (
              <span style={{ fontSize: 10, color: '#92400e', fontStyle: 'italic', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {note}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
