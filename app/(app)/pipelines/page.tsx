'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Stage = { id: string; name: string; type: string; sortOrder: number; color: string | null }
type Pipeline = { id: string; name: string; color: string; isActive: boolean; stages: Stage[]; _count: { opportunities: number } }

export default function PipelinesPage() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [loading, setLoading] = useState(true)

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>Pipelines</h1>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 4 }}>Build and manage your sales pipelines</p>
        </div>
        <Link href="/pipelines/new" className="btn btn-primary" style={{ fontSize: 13 }}>+ New Pipeline</Link>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {pipelines.map(p => (
          <div key={p.id} className="card" style={{ padding: 0, overflow: 'hidden', opacity: p.isActive ? 1 : 0.5 }}>
            <div style={{ height: 4, background: p.color }} />
            <div style={{ padding: '18px 22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <h2 style={{ fontSize: 18, fontWeight: 700 }}>{p.name}</h2>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', background: '#f5f5f3', padding: '3px 10px', borderRadius: 6 }}>
                    {p._count.opportunities} opportunities
                  </span>
                  {!p.isActive && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#ef4444', background: '#fef2f2', padding: '3px 10px', borderRadius: 6 }}>
                      Disabled
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
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
              </div>

              {/* Stages preview */}
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
                {p.stages.map((s, i) => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 6, whiteSpace: 'nowrap',
                      background: s.type === 'won' ? '#f0fdf4' : s.type === 'lost' ? '#fef2f2' : '#f5f5f3',
                      color: s.type === 'won' ? '#16a34a' : s.type === 'lost' ? '#ef4444' : 'var(--text-secondary)',
                    }}>
                      {s.name}
                    </span>
                    {i < p.stages.length - 1 && <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>→</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
