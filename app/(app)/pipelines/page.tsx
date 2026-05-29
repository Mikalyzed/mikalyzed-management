'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Stage = { id: string; name: string; type: string; sortOrder: number; color: string | null }
type Pipeline = { id: string; name: string; color: string; isActive: boolean; stages: Stage[]; _count: { opportunities: number } }

export default function PipelinesPage() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  function load() {
    fetch('/api/pipelines?all=1').then(r => r.json()).then(d => { setPipelines(d); setLoading(false) })
  }
  useEffect(() => { load() }, [])

  async function toggleActive(id: string, isActive: boolean) {
    await fetch(`/api/pipelines/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !isActive }),
    })
    load()
  }

  if (loading) return <p style={{ color: 'var(--text-muted)', padding: 40, textAlign: 'center' }}>Loading...</p>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>Pipelines</h1>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 4 }}>Build and manage your sales pipelines</p>
        </div>
        <Link href="/pipelines/new" className="btn btn-primary desktop-only" style={{ fontSize: 13 }}>+ New Pipeline</Link>
      </div>

      {/* Mobile-only hint: editing happens on desktop */}
      <div className="mobile-only" style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 14px', marginBottom: 16,
        background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 12,
        fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4,
      }}>
        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
        </svg>
        <span>View pipelines here. To create, edit, or disable a pipeline, open this page on a desktop.</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {pipelines.map(p => {
          const isExpanded = expandedId === p.id
          return (
          <div key={p.id} className="card" style={{ padding: 0, overflow: 'hidden', opacity: p.isActive ? 1 : 0.5 }}>
            <div style={{ height: 4, background: p.color }} />

            {/* Tappable header — on mobile this toggles the accordion */}
            <button
              onClick={() => setExpandedId(isExpanded ? null : p.id)}
              className="pipeline-card-header"
              style={{
                width: '100%', border: 'none', background: 'none', cursor: 'pointer',
                padding: '18px 22px', textAlign: 'left',
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: 18, fontWeight: 700 }}>{p.name}</h2>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', background: '#f5f5f3', padding: '3px 10px', borderRadius: 6 }}>
                  {p._count.opportunities} opps
                </span>
                {!p.isActive && (
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#ef4444', background: '#fef2f2', padding: '3px 10px', borderRadius: 6 }}>
                    Disabled
                  </span>
                )}
              </div>
              {/* Chevron — mobile only (accordion affordance) */}
              <svg className="mobile-only pipeline-chevron" width="20" height="20" fill="none" stroke="var(--text-muted)" strokeWidth="2" viewBox="0 0 24 24"
                style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease', flexShrink: 0 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
              </svg>
            </button>

            {/* Desktop: edit/disable buttons + horizontal stage preview, always visible */}
            <div className="desktop-only" style={{ padding: '0 22px 18px' }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                <Link href={`/pipelines/${p.id}`} style={{
                  padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)',
                  background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  color: 'var(--text-secondary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minHeight: 34,
                }}>
                  Edit
                </Link>
                <button onClick={() => toggleActive(p.id, p.isActive)} style={{
                  padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)',
                  background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  color: p.isActive ? '#ef4444' : '#22c55e', minHeight: 34,
                }}>
                  {p.isActive ? 'Disable' : 'Enable'}
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                {p.stages.map((s, i) => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span style={{
                      fontSize: 13, fontWeight: 600, padding: '7px 14px', borderRadius: 100, whiteSpace: 'nowrap',
                      background: s.type === 'won' ? '#f0fdf4' : s.type === 'lost' ? '#fef2f2' : '#f5f5f3',
                      color: s.type === 'won' ? '#16a34a' : s.type === 'lost' ? '#ef4444' : 'var(--text-secondary)',
                    }}>
                      {s.name}
                    </span>
                    {i < p.stages.length - 1 && <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>›</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* Mobile: expanded vertical stage list */}
            {isExpanded && (
              <div className="mobile-only pipeline-stages-vertical" style={{ borderTop: '1px solid var(--border-light)' }}>
                {p.stages.map((s, i) => (
                  <div key={s.id} style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '14px 22px',
                    borderTop: i > 0 ? '1px solid var(--border-light)' : 'none',
                  }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
                      fontVariantNumeric: 'tabular-nums', minWidth: 18, textAlign: 'right',
                    }}>{i + 1}</span>
                    <span style={{
                      flex: 1, fontSize: 15, fontWeight: 500,
                      color: s.type === 'won' ? '#16a34a' : s.type === 'lost' ? '#ef4444' : 'var(--text-primary)',
                    }}>
                      {s.name}
                    </span>
                    {s.type === 'won' && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#16a34a', background: '#f0fdf4', padding: '3px 9px', borderRadius: 100, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Won</span>
                    )}
                    {s.type === 'lost' && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#ef4444', background: '#fef2f2', padding: '3px 9px', borderRadius: 100, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Lost</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )})}
      </div>
    </div>
  )
}
