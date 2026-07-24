'use client'

// ─── Deal finalize (next step after the jacket) ───────────────────────
// Placeholder shell — this is where the deal flow continues after
// "Proceed with Deal": review, funding, and (later) documents. Being
// designed with the operator now; Cancel Deal / Mark Funded will live here.

import Link from 'next/link'
import { useParams } from 'next/navigation'

export default function DealFinalizePage() {
  const params = useParams()
  const id = Array.isArray(params.id) ? params.id[0] : (params.id as string)

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto' }}>
      <div style={{
        background: 'var(--bg-card)', borderRadius: 16,
        border: '1px solid var(--border)',
        boxShadow: '0 1px 2px rgba(24,24,27,.04), 0 6px 16px -6px rgba(24,24,27,.10)',
        padding: '40px 32px', textAlign: 'center',
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.015em', color: 'var(--text-primary)', marginBottom: 8 }}>
          Next step — under construction
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: 460, margin: '0 auto 20px' }}>
          This is where the deal continues after the worksheet — review, funding,
          and paperwork. We&apos;re designing it now.
        </div>
        <Link href={`/deals/${id}`} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 0,
          padding: '9px 16px', borderRadius: 12,
          border: '1px solid var(--border)', background: '#fff',
          fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)', textDecoration: 'none',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
          Back to the deal
        </Link>
      </div>
    </div>
  )
}
