'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { fieldsForItem } from '@/lib/checklist-fields'

type ChecklistItem = {
  item: string
  done: boolean
  note?: string
  type?: string
  fields?: { key: string; label: string }[]
  addedByMechanic?: boolean
  approved?: 'pending' | 'approved' | 'declined'
}

export type ReconTask = {
  id: string
  stage: string
  status: string
  priority: number
  checklist: ChecklistItem[]
  activeSeconds: number
  timerStartedAt: string | null
  pauseReason: string | null
  pauseDetail: string | null
  startedAt: string | null
  estimatedHours: number | null
  vehicle: { id: string; stockNumber: string; year: number | null; make: string; model: string }
}

const STAGE_COLORS: Record<string, string> = {
  mechanic: '#9333ea',
  detailing: '#0891b2',
  content: '#d97706',
  publish: '#65a30d',
}

const STAGE_LABELS: Record<string, string> = {
  mechanic: 'Mechanic',
  detailing: 'Detailing',
  content: 'Content',
  publish: 'Publish',
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return '0m'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export default function ReconTaskCard({ task, onChange }: { task: ReconTask; onChange: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [checklist, setChecklist] = useState<ChecklistItem[]>(task.checklist || [])
  const [showPauseInput, setShowPauseInput] = useState(false)
  const [pauseReasonDraft, setPauseReasonDraft] = useState('')
  const [tickSeconds, setTickSeconds] = useState(0)

  const stageColor = STAGE_COLORS[task.stage] || '#6b7280'
  const stageLabel = STAGE_LABELS[task.stage] || task.stage
  const timerRunning = !!task.timerStartedAt
  const isPaused = !timerRunning && task.status === 'in_progress'
  const isInProgress = task.status === 'in_progress'

  // Live timer tick — only when running, only when card is expanded (saves CPU)
  useEffect(() => {
    if (!timerRunning || !expanded) return
    const baseTime = task.timerStartedAt ? new Date(task.timerStartedAt).getTime() : Date.now()
    const tick = () => setTickSeconds(Math.floor((Date.now() - baseTime) / 1000))
    tick()
    const i = setInterval(tick, 1000)
    return () => clearInterval(i)
  }, [timerRunning, expanded, task.timerStartedAt])

  // Keep local checklist in sync if task prop updates
  useEffect(() => {
    setChecklist(task.checklist || [])
  }, [task.checklist])

  const liveSeconds = timerRunning
    ? task.activeSeconds + tickSeconds
    : task.activeSeconds

  const totalItems = checklist.length
  const doneItems = checklist.filter(i => i.done).length
  const allDone = totalItems > 0 && doneItems === totalItems

  async function timerAction(action: 'start' | 'pause' | 'resume' | 'complete', reason?: string) {
    if (busy) return
    setBusy(true)
    try {
      await fetch(`/api/stages/${task.id}/timer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...(reason ? { pauseReason: reason } : {}) }),
      })
      onChange()
    } catch { /* swallow */ }
    setBusy(false)
  }

  async function toggleItem(idx: number) {
    const next = checklist.map((it, i) => i === idx ? { ...it, done: !it.done } : it)
    setChecklist(next)  // optimistic
    try {
      await fetch(`/api/stages/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checklist: next }),
      })
    } catch {
      setChecklist(task.checklist || [])  // rollback
    }
  }

  return (
    <div className="card" style={{
      padding: 0, overflow: 'hidden', borderLeft: `4px solid ${stageColor}`,
      transition: 'box-shadow 0.15s',
      boxShadow: expanded ? '0 4px 16px rgba(0,0,0,0.08)' : undefined,
    }}>
      {/* Header — clickable to expand */}
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        style={{
          width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14,
          textAlign: 'left',
        }}
      >
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 22, height: 22, borderRadius: 6,
          background: expanded ? '#1a1a1a' : '#f3f4f6',
          color: expanded ? '#dffd6e' : 'var(--text-muted)',
          fontSize: 10, fontWeight: 700,
          transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s, background 0.15s',
          flexShrink: 0,
        }}>▶</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            {task.vehicle.year} {task.vehicle.make} {task.vehicle.model}
            <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 8, fontSize: 12 }}>#{task.vehicle.stockNumber}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span>{stageLabel}</span>
            <span>·</span>
            <span style={{
              fontWeight: 600,
              color: timerRunning ? '#16a34a' : isPaused ? '#f59e0b' : 'var(--text-muted)',
            }}>
              {timerRunning ? '● Running' : isPaused ? '⏸ Paused' : task.status === 'pending' ? 'Not started' : task.status}
            </span>
            {totalItems > 0 && (
              <>
                <span>·</span>
                <span>{doneItems}/{totalItems} done</span>
              </>
            )}
            {(liveSeconds > 0 || timerRunning) && (
              <>
                <span>·</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatElapsed(liveSeconds)}</span>
              </>
            )}
          </div>
        </div>
        <span className={`badge badge-${task.stage}`} style={{ fontSize: 11, flexShrink: 0 }}>
          {stageLabel}
        </span>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div style={{ padding: '0 20px 16px', borderTop: '1px solid var(--border)' }}>
          {/* Timer + action buttons */}
          <div style={{ display: 'flex', gap: 8, padding: '14px 0', flexWrap: 'wrap' }}>
            {task.status === 'pending' && (
              <button
                type="button"
                onClick={() => timerAction('start')}
                disabled={busy}
                style={primaryBtn('#16a34a', busy)}
              >▶ Start</button>
            )}
            {isInProgress && timerRunning && (
              <>
                {!showPauseInput ? (
                  <button
                    type="button"
                    onClick={() => setShowPauseInput(true)}
                    disabled={busy}
                    style={primaryBtn('#f59e0b', busy)}
                  >⏸ Pause</button>
                ) : (
                  <div style={{ display: 'flex', gap: 6, flex: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                      value={pauseReasonDraft}
                      onChange={e => setPauseReasonDraft(e.target.value)}
                      placeholder="Why are you pausing? (lunch, parts, etc.)"
                      style={{
                        flex: 1, minWidth: 200, padding: '8px 12px', borderRadius: 8,
                        border: '1px solid var(--border)', fontSize: 13, outline: 'none',
                      }}
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        await timerAction('pause', pauseReasonDraft.trim() || 'Paused')
                        setShowPauseInput(false)
                        setPauseReasonDraft('')
                      }}
                      disabled={busy}
                      style={primaryBtn('#f59e0b', busy)}
                    >Pause</button>
                    <button
                      type="button"
                      onClick={() => { setShowPauseInput(false); setPauseReasonDraft('') }}
                      style={secondaryBtn()}
                    >Cancel</button>
                  </div>
                )}
              </>
            )}
            {isInProgress && !timerRunning && (
              <button
                type="button"
                onClick={() => timerAction('resume')}
                disabled={busy}
                style={primaryBtn('#3b82f6', busy)}
              >▶ Resume</button>
            )}
            {isInProgress && allDone && (
              <button
                type="button"
                onClick={() => timerAction('complete')}
                disabled={busy}
                style={primaryBtn('#16a34a', busy)}
              >✓ Complete Stage</button>
            )}
            <Link
              href={`/vehicles/${task.vehicle.id}`}
              style={{ ...secondaryBtn(), textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
            >Open vehicle</Link>
          </div>

          {/* Paused state info */}
          {isPaused && task.pauseReason && (
            <div style={{
              padding: '10px 14px', borderRadius: 10, marginBottom: 12,
              background: '#fffbeb', border: '1px solid #fcd34d',
              fontSize: 12, color: '#92400e',
            }}>
              <strong>Paused:</strong> {task.pauseReason}
              {task.pauseDetail && ` — ${task.pauseDetail}`}
            </div>
          )}

          {/* Checklist */}
          {checklist.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '6px 0', fontStyle: 'italic' }}>
              No checklist items for this stage.
            </p>
          ) : (
            <>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 8 }}>
                Checklist ({doneItems}/{totalItems})
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {checklist.map((it, i) => {
                  const sub = it.type ? fieldsForItem(it).length : 0
                  return (
                    <label
                      key={i}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 10,
                        padding: '10px 12px', borderRadius: 8,
                        background: it.done ? '#f0fdf4' : '#fafaf8',
                        border: `1px solid ${it.done ? '#bbf7d0' : 'var(--border)'}`,
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={!!it.done}
                        onChange={() => toggleItem(i)}
                        style={{ width: 18, height: 18, marginTop: 1, cursor: 'pointer', accentColor: '#16a34a' }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 13, fontWeight: 500,
                          color: it.done ? 'var(--text-muted)' : 'var(--text-primary)',
                          textDecoration: it.done ? 'line-through' : 'none',
                        }}>
                          {it.item}
                        </div>
                        {sub > 0 && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                            Structured: {sub} field{sub === 1 ? '' : 's'} (open vehicle to fill in)
                          </div>
                        )}
                      </div>
                    </label>
                  )
                })}
              </div>
              {!allDone && isInProgress && (
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10 }}>
                  Complete all items to finish this stage.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function primaryBtn(color: string, busy: boolean): React.CSSProperties {
  return {
    padding: '8px 16px', borderRadius: 10, border: 'none',
    background: color, color: '#fff',
    fontSize: 13, fontWeight: 700,
    cursor: busy ? 'not-allowed' : 'pointer',
    opacity: busy ? 0.5 : 1,
    display: 'inline-flex', alignItems: 'center', gap: 4,
    whiteSpace: 'nowrap',
  }
}

function secondaryBtn(): React.CSSProperties {
  return {
    padding: '8px 14px', borderRadius: 10,
    background: '#fff', border: '1px solid var(--border)',
    fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)',
    cursor: 'pointer', whiteSpace: 'nowrap',
  }
}
