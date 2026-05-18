'use client'

import { useState } from 'react'

type AskTurn = { q: string; a: string | null }

export default function AskAI() {
  const [askOpen, setAskOpen] = useState(false)
  const [askInput, setAskInput] = useState('')
  const [askTurns, setAskTurns] = useState<AskTurn[]>([])
  const [asking, setAsking] = useState(false)

  async function handleAsk() {
    const q = askInput.trim()
    if (!q || asking) return
    setAsking(true)
    const history = askTurns
      .filter(t => t.a !== null)
      .flatMap(t => [
        { role: 'user' as const, content: t.q },
        { role: 'assistant' as const, content: t.a! },
      ])
    setAskTurns(t => [...t, { q, a: null }])
    setAskInput('')
    try {
      const res = await fetch('/api/inventory/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, history }),
      })
      const data = await res.json()
      const answer = data.answer || data.error || 'No response.'
      setAskTurns(t => t.map((turn, i) => i === t.length - 1 ? { ...turn, a: answer } : turn))
    } catch (e: any) {
      setAskTurns(t => t.map((turn, i) => i === t.length - 1 ? { ...turn, a: `Error: ${e.message}` } : turn))
    } finally {
      setAsking(false)
    }
  }

  return (
    <>
      {!askOpen && (
        <button
          onClick={() => setAskOpen(true)}
          aria-label="Ask AI about inventory"
          title="Ask AI"
          style={{
            position: 'fixed',
            bottom: 12, right: 6,
            zIndex: 200,
            width: 44, height: 44,
            background: '#1a1a1a', color: '#dffd6e',
            border: 'none', borderRadius: '50%',
            fontSize: 20, fontWeight: 600,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 6px 20px rgba(0,0,0,0.18)',
          }}
        >
          ✦
        </button>
      )}

      {askOpen && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 200,
          width: 380, maxHeight: 'calc(100vh - 48px)',
          background: '#fff', border: '1px solid var(--border)', borderRadius: 12,
          boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{
            padding: '12px 16px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: '#1a1a1a', color: '#fff',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600 }}>
              <span style={{ color: '#dffd6e' }}>✦</span> Ask AI about inventory
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {askTurns.length > 0 && (
                <button
                  onClick={() => setAskTurns([])}
                  aria-label="New chat"
                  title="New chat"
                  style={{
                    background: 'none', border: 'none', color: '#dffd6e',
                    cursor: 'pointer', fontSize: 12, fontWeight: 600,
                    padding: '4px 8px', borderRadius: 6,
                  }}
                >New chat</button>
              )}
              <button
                onClick={() => setAskOpen(false)}
                aria-label="Close"
                style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 4px' }}
              >×</button>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 200, maxHeight: 420 }}>
            {askTurns.length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Try:
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[
                    'How many flooring vehicles are in external repair or recon?',
                    'List all consignment vehicles in stock.',
                    'What is the average mileage of in-stock vehicles?',
                    'Which vehicles have been in stock the longest?',
                  ].map(s => (
                    <button
                      key={s}
                      onClick={() => setAskInput(s)}
                      style={{
                        textAlign: 'left', background: '#f9fafb', border: '1px solid var(--border)',
                        borderRadius: 6, padding: '6px 10px', fontSize: 12, cursor: 'pointer',
                        color: 'var(--text-secondary)',
                      }}
                    >{s}</button>
                  ))}
                </div>
              </div>
            )}
            {askTurns.map((turn, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{
                  alignSelf: 'flex-end', maxWidth: '85%',
                  background: '#1a1a1a', color: '#fff',
                  padding: '8px 12px', borderRadius: 12, borderBottomRightRadius: 4,
                  fontSize: 13, lineHeight: 1.45,
                }}>{turn.q}</div>
                <div style={{
                  alignSelf: 'flex-start', maxWidth: '92%',
                  background: '#f3f4f6', color: 'var(--text-primary)',
                  padding: '8px 12px', borderRadius: 12, borderBottomLeftRadius: 4,
                  fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap',
                }}>{turn.a === null ? <span style={{ color: 'var(--text-muted)' }}>Thinking…</span> : turn.a}</div>
              </div>
            ))}
          </div>

          <div style={{ padding: 12, borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
            <input
              value={askInput}
              onChange={e => setAskInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAsk() } }}
              placeholder="Ask about your inventory…"
              disabled={asking}
              style={{
                flex: 1, padding: '8px 12px', borderRadius: 8,
                border: '1px solid var(--border)', fontSize: 13,
              }}
            />
            <button
              onClick={handleAsk}
              disabled={asking || !askInput.trim()}
              style={{
                background: '#1a1a1a', color: '#dffd6e', border: 'none',
                borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600,
                cursor: asking || !askInput.trim() ? 'not-allowed' : 'pointer',
                opacity: asking || !askInput.trim() ? 0.6 : 1,
              }}
            >{asking ? '…' : 'Send'}</button>
          </div>
        </div>
      )}
    </>
  )
}
