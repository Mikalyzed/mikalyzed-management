'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

type ConnectedAccount = {
  id: string
  igUserId: string
  username: string
  name: string | null
  profilePictureUrl: string | null
  connectedAt: string
  tokenExpiresAt: string | null
  connectedBy: { id: string; name: string; email: string }
}

export default function IntegrationsPage() {
  const searchParams = useSearchParams()
  const igConnected = searchParams.get('ig_connected')
  const igError = searchParams.get('ig_error')

  const [accounts, setAccounts] = useState<ConnectedAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [banner, setBanner] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  function load() {
    setLoading(true)
    fetch('/api/instagram/connected-accounts')
      .then(r => r.json())
      .then(d => setAccounts(d.accounts || []))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (igConnected) setBanner({ kind: 'success', text: `Connected @${igConnected} successfully.` })
    else if (igError) setBanner({ kind: 'error', text: `Could not connect Instagram: ${igError}` })
  }, [igConnected, igError])

  function startConnect() {
    // Server-side redirect to Meta OAuth
    window.location.href = '/api/instagram/oauth/start'
  }

  return (
    <div>
      <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Link href="/settings" style={{
          fontSize: 13, color: 'var(--text-muted)', textDecoration: 'none',
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>← Settings</Link>
      </div>
      <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6 }}>Integrations</h1>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 24 }}>
        Connect external services so the CRM can talk to them.
      </p>

      {banner && (
        <div style={{
          padding: '12px 16px', borderRadius: 10, marginBottom: 20,
          background: banner.kind === 'success' ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${banner.kind === 'success' ? '#bbf7d0' : '#fecaca'}`,
          color: banner.kind === 'success' ? '#166534' : '#991b1b',
          fontSize: 13, fontWeight: 500,
        }}>
          {banner.text}
        </div>
      )}

      {/* Instagram section */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* Instagram glyph */}
            <div style={{
              width: 44, height: 44, borderRadius: 12, flexShrink: 0,
              background: 'linear-gradient(135deg, #f9ce34 0%, #ee2a7b 50%, #6228d7 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
            }}>
              <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <rect x="3" y="3" width="18" height="18" rx="5" />
                <circle cx="12" cy="12" r="4" />
                <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
              </svg>
            </div>
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 2 }}>Instagram</h2>
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                Connect a business Instagram account to send + receive DMs from the CRM.
              </p>
            </div>
          </div>
          <button onClick={startConnect} style={{
            padding: '10px 18px', borderRadius: 8, border: 'none',
            background: '#1a1a1a', color: '#dffd6e', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}>
            + Connect Instagram Account
          </button>
        </div>

        {/* Connected accounts list */}
        <div style={{ padding: '8px 0' }}>
          {loading ? (
            <p style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Loading...</p>
          ) : accounts.length === 0 ? (
            <p style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              No Instagram accounts connected yet. Click <strong>Connect Instagram Account</strong> above to get started.
            </p>
          ) : (
            accounts.map(a => (
              <div key={a.id} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 24px',
                borderTop: '1px solid var(--border-light)',
              }}>
                {a.profilePictureUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.profilePictureUrl} alt={a.username} style={{
                    width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', flexShrink: 0,
                  }} />
                ) : (
                  <div style={{
                    width: 48, height: 48, borderRadius: '50%', background: '#e2e8f0',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16, fontWeight: 700, color: '#475569', flexShrink: 0,
                  }}>
                    {a.username.charAt(0).toUpperCase()}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 15, fontWeight: 700 }}>@{a.username}</p>
                  {a.name && <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{a.name}</p>}
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    Connected {new Date(a.connectedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    {' · IG user id: '}<span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{a.igUserId}</span>
                    {' · by '}{a.connectedBy.name}
                  </p>
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 700, color: '#166534', background: '#dcfce7',
                  padding: '4px 10px', borderRadius: 100, textTransform: 'uppercase', letterSpacing: '0.04em',
                }}>
                  Active
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 16, lineHeight: 1.5 }}>
        Connecting an Instagram account uses Meta&apos;s official OAuth flow.
        You authorize Mikalyzed Management to read your profile info and send/receive direct messages on your behalf.
        Tokens are stored encrypted at rest and expire after 60 days, at which point you can reconnect.
      </p>
    </div>
  )
}
