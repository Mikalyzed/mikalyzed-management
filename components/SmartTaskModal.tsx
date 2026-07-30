'use client'

import { useState } from 'react'

type Proposal = {
  title: string
  kind: 'coordination' | 'simple' | 'part_request' | 'shop_work'
  partName?: string | null
  mechanicActive?: boolean
  shop: string | null
  work: string | null
  vehicleId: string | null
  vehicleLabel: string | null
  assigneeId: string | null
  assigneeName: string | null
}

/**
 * "+ Add Task" — type it in plain words; the AI structures the task and its
 * execution shape (simple vs coordination with external/transport
 * checkpoints), asks when the text is ambiguous, and NOTHING is created
 * until the human confirms the preview.
 */
export default function SmartTaskModal({ onClose, onCreated }: {
  onClose: () => void
  onCreated: (created: { taskId?: string; partId?: string; externalRepairId: string | null; stock: string | null; proposal: Proposal }) => void
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [question, setQuestion] = useState<{ prompt: string; options: string[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  // A fetch can land mid-deploy and return an empty/HTML body — never crash on it
  const safeJson = async (res: Response) => {
    const txt = await res.text().catch(() => '')
    try { return txt ? JSON.parse(txt) : {} } catch { return {} }
  }

  const propose = async (fullText: string) => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/tasks/assess', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'propose', text: fullText }),
      })
      const d = await safeJson(res)
      if (!res.ok) { setError(d.error || 'Could not read that — try again in a moment.'); return }
      setProposal(d.proposal)
      setQuestion(d.question ?? null)
    } finally { setBusy(false) }
  }

  const answerQuestion = (answer: string) => {
    const merged = `${text}\n\nAnswer: ${answer}`
    setText(merged)
    setProposal(null)
    setQuestion(null)
    propose(merged)
  }

  const create = async () => {
    if (!proposal) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/tasks/assess', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'create', proposal }),
      })
      const d = await safeJson(res)
      if (!res.ok) { setError(d.error || 'Could not create — try again in a moment.'); return }
      onCreated({ taskId: d.taskId, partId: d.partId, externalRepairId: d.externalRepairId ?? null, stock: d.stock ?? null, proposal })
      onClose()
    } finally { setBusy(false) }
  }

  const eyebrow: React.CSSProperties = {
    fontSize: 10.5, fontWeight: 650, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px',
  }
  const chip: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    fontSize: 11.5, fontWeight: 650, padding: '3px 10px', borderRadius: 100, whiteSpace: 'nowrap',
    maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis',
    background: 'var(--bg-primary, #f8f8f6)', border: '1px solid var(--border)', color: 'var(--text-secondary)',
  }

  return (
    <div onClick={() => !busy && onClose()} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1300,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 16, width: '100%', maxWidth: 460,
        padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '86vh', overflowY: 'auto',
      }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>Add Task</h2>
        <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '0 0 14px', lineHeight: 1.5 }}>
          Say it like you'd say it out loud — the car, what's happening, who's on it. The system structures the rest.
        </p>

        <textarea
          autoFocus rows={3}
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={'e.g. "coordinate with willy to get the blue 94 chevy to GWT for the suspension" or "bring the green mustang inside"'}
          style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10, fontSize: 13.5, resize: 'vertical', marginBottom: 10 }}
        />

        {question && (
          <div style={{ border: '1px solid #bfd3fc', background: '#f6f9ff', borderRadius: 10, padding: '10px 12px', marginBottom: 10 }}>
            <p style={{ fontSize: 12.5, fontWeight: 650, margin: '0 0 8px' }}>{question.prompt}</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {question.options.map(o => (
                <button
                  key={o} disabled={busy}
                  onClick={() => answerQuestion(o)}
                  style={{
                    border: '1px solid #bfd3fc', background: '#fff', color: '#1d4ed8',
                    borderRadius: 100, padding: '5px 12px', fontSize: 12, fontWeight: 650,
                    cursor: 'pointer', minHeight: 0,
                  }}
                >{o}</button>
              ))}
            </div>
            {question.options.length === 0 && (
              <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: 0 }}>Add the detail to your text above and press Structure again.</p>
            )}
          </div>
        )}

        {proposal && !question && (() => {
          const stockPart = proposal.vehicleLabel?.split(' · ') ?? []
          const previewSteps = proposal.kind === 'coordination' ? [
            { n: '✓', label: `External logged — ${proposal.shop ?? 'shop'}`, sub: `${proposal.work ?? 'work as described'} · created now as Not Scheduled`, green: true },
            { n: '2', label: 'Transport arranged', sub: `${proposal.assigneeName?.split(' ')[0] ?? 'The assignee'} sets up the tow (or drive) from the card` },
            { n: '3', label: `At ${proposal.shop ?? 'the shop'}`, sub: 'Marked Sent when it actually leaves' },
          ] : proposal.kind === 'part_request' ? [
            { n: '✓', label: `Part requested — ${proposal.partName ?? proposal.title}`, sub: `Lands in ${proposal.assigneeName?.split(' ')[0] ?? 'the'} Source Queue now`, green: true },
            { n: '2', label: 'Sourced', sub: 'Link pasted (goes to admin approval) or bought In Store' },
            { n: '3', label: 'Ordered → Received', sub: 'Tracking watches delivery; the install task creates itself on arrival' },
          ] : proposal.kind === 'shop_work' ? (proposal.mechanicActive ? [
            { n: '✓', label: 'Added to the mechanic checklist', sub: 'Goes on the car\'s active mechanic stage now', green: true },
            { n: '2', label: 'Assign the mechanic', sub: 'Unassigned — hand it off from the board or dashboard' },
            { n: '3', label: 'Checked off when done', sub: 'Completion date stamps automatically' },
          ] : [
            { n: '✓', label: 'Held as a task', sub: 'Car is not in mechanic — the work waits with the coordinator', green: true },
            { n: '2', label: 'Route the car to mechanic', sub: 'Routing carries the work onto the fresh checklist' },
            { n: '3', label: 'Checked off when done', sub: 'Completion date stamps automatically' },
          ]) : []
          return (
          <div style={{ border: '1px solid var(--border)', background: 'var(--bg-primary, #f8f8f6)', borderRadius: 12, padding: '12px 14px', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
              <p style={{ ...eyebrow, margin: 0 }}>This creates</p>
              <span style={{ fontSize: 10.5, fontWeight: 650, color: proposal.kind === 'simple' ? 'var(--text-muted)' : proposal.kind === 'part_request' ? '#92400e' : proposal.kind === 'shop_work' ? '#16a34a' : '#1d4ed8' }}>
                {proposal.kind === 'coordination' ? 'Coordination' : proposal.kind === 'part_request' ? 'Part Request' : proposal.kind === 'shop_work' ? 'Shop Work' : 'Simple task'}
              </span>
            </div>

            {/* Mirrors the task card Lenny will actually see */}
            {stockPart[0] && <div style={{ marginBottom: 4 }}><span style={chip}>{stockPart[0]}</span></div>}
            {stockPart[1] && (
              <div style={{ fontWeight: 700, fontSize: 13, letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
                {stockPart[1]}
              </div>
            )}
            <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.45 }}>{proposal.title}</div>
            {proposal.assigneeName && (
              <div style={{ fontSize: 11.5, fontWeight: 650, color: 'var(--text-muted)', marginTop: 3 }}>→ {proposal.assigneeName}</div>
            )}

            {previewSteps.length > 0 && (
              <div style={{ position: 'relative', marginTop: 10, paddingLeft: 2 }}>
                <div aria-hidden style={{ position: 'absolute', left: 10, top: 12, bottom: 12, width: 2, background: 'var(--border-light, #f0f0ec)', borderRadius: 2 }} />
                {previewSteps.map((st, si) => (
                  <div key={si} style={{ display: 'flex', alignItems: 'flex-start', gap: 11, padding: si === previewSteps.length - 1 ? '5px 0 0' : '5px 0 12px', position: 'relative' }}>
                    <span style={{
                      width: 18, height: 18, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 800, zIndex: 1, boxSizing: 'border-box',
                      background: st.green ? '#16a34a' : '#fff',
                      color: st.green ? '#fff' : 'var(--text-muted)',
                      border: st.green ? '2px solid #16a34a' : '2px solid var(--border)',
                    }}>{st.n}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 12.5, fontWeight: st.green ? 500 : 650, lineHeight: 1.3, color: st.green ? 'var(--text-muted)' : 'var(--text-primary)' }}>{st.label}</span>
                      <span style={{ display: 'block', fontSize: 11, color: st.green ? '#16a34a' : 'var(--text-muted)', marginTop: 1, lineHeight: 1.4 }}>{st.sub}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          )
        })()}

        {error && <p style={{ fontSize: 12.5, color: '#b91c1c', margin: '0 0 10px' }}>{error}</p>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onClose} disabled={busy}
            style={{ flex: 1, padding: '11px 0', borderRadius: 10, border: '1px solid var(--border)', background: '#fff', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', minHeight: 0 }}
          >Cancel</button>
          {proposal && !question ? (
            <button
              onClick={create} disabled={busy}
              style={{ flex: 1.4, padding: '11px 0', borderRadius: 10, border: '1px solid #bfd3fc', background: '#eaf0fe', color: '#1d4ed8', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', minHeight: 0 }}
            >{busy ? 'Creating…' : proposal.kind === 'part_request' ? 'Create Part Request' : proposal.kind === 'shop_work' && proposal.mechanicActive ? 'Add to Checklist' : 'Create Task'}</button>
          ) : (
            <button
              onClick={() => propose(text)} disabled={busy || !text.trim()}
              style={{ flex: 1.4, padding: '11px 0', borderRadius: 10, border: '1px solid #bfd3fc', background: '#eaf0fe', color: '#1d4ed8', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', minHeight: 0, opacity: text.trim() ? 1 : 0.5 }}
            >{busy ? 'Reading…' : 'Structure It'}</button>
          )}
        </div>
      </div>
    </div>
  )
}
