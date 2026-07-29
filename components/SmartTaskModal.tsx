'use client'

import { useState } from 'react'

type Proposal = {
  title: string
  kind: 'coordination' | 'simple'
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
  onCreated: () => void
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [question, setQuestion] = useState<{ prompt: string; options: string[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const propose = async (fullText: string) => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/tasks/assess', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'propose', text: fullText }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error || 'Could not read that.'); return }
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
      const d = await res.json()
      if (!res.ok) { setError(d.error || 'Could not create.'); return }
      onCreated()
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

        {proposal && !question && (
          <div style={{ border: '1px solid var(--border)', background: 'var(--bg-primary, #f8f8f6)', borderRadius: 12, padding: '12px 14px', marginBottom: 12 }}>
            <p style={eyebrow}>This creates</p>
            <p style={{ fontSize: 13.5, fontWeight: 650, margin: '0 0 8px', lineHeight: 1.4 }}>{proposal.title}</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: proposal.kind === 'coordination' ? 10 : 0 }}>
              {proposal.vehicleLabel && <span style={chip}>{proposal.vehicleLabel}</span>}
              {proposal.assigneeName && <span style={chip}>→ {proposal.assigneeName}</span>}
              <span style={{ ...chip, background: proposal.kind === 'coordination' ? '#eaf0fe' : 'var(--bg-primary, #f8f8f6)', color: proposal.kind === 'coordination' ? '#1d4ed8' : 'var(--text-secondary)', border: proposal.kind === 'coordination' ? '1px solid #bfd3fc' : '1px solid var(--border)' }}>
                {proposal.kind === 'coordination' ? 'Coordination — with checkpoints' : 'Simple task'}
              </span>
            </div>
            {proposal.kind === 'coordination' && (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                <div>① External logged{proposal.shop ? ` — ${proposal.shop}` : ''}{proposal.work ? ` · ${proposal.work}` : ''} <span style={{ color: '#16a34a', fontWeight: 650 }}>(created now, Not Scheduled)</span></div>
                <div>② Transport arranged — from the task card when it's set up</div>
                <div>③ At {proposal.shop ?? 'the shop'} — marked when it actually leaves</div>
              </div>
            )}
          </div>
        )}

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
            >{busy ? 'Creating…' : 'Create Task'}</button>
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
