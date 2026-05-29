'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import PipelineForm from '../_components/PipelineForm'

export default function NewPipelinePage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)

  async function handleSave(name: string, color: string, stages: { name: string; type: string }[]) {
    setSaving(true)
    const res = await fetch('/api/pipelines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color, stages }),
    })
    if (res.ok) {
      router.push('/pipelines')
    }
    setSaving(false)
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, letterSpacing: '-0.02em' }}>New Pipeline</h1>

      {/* Mobile: redirect users to desktop for creating */}
      <div className="mobile-only">
        <div className="card" style={{ padding: 28, textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: '#f5f5f3', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
            <svg width="22" height="22" fill="none" stroke="var(--text-secondary)" strokeWidth="1.6" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
            </svg>
          </div>
          <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>Create on desktop</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 18 }}>
            Building a new pipeline involves stages, ordering, and lots of fields — best done on a larger screen.
          </p>
          <button onClick={() => router.push('/pipelines')}
            style={{
              padding: '11px 22px', borderRadius: 10, border: 'none',
              background: '#1a1a1a', color: '#dffd6e', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}>
            ← Back to pipelines
          </button>
        </div>
      </div>

      {/* Desktop: the form */}
      <div className="desktop-only">
        <PipelineForm onSave={handleSave} saving={saving} />
      </div>
    </div>
  )
}
