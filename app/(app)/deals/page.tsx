'use client'

// ─── Deals list (Deal Desk Slice 1) ───────────────────────────────────
// DealerCenter-style Deals tab: every deal, newest first, filterable by
// status. "New Deal" walks a two-step picker (buyer → vehicle) and drops
// you into the worksheet. Money-facing: nav shows this only to admin +
// sales_manager, and the API enforces the same gate.

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatDealNumber } from '@/lib/deals'

type DealRow = {
  id: string
  dealNumber: number
  status: string
  dealType: string
  salePrice: number
  otdTotal: number
  fundedAt: string | null
  createdAt: string
  vehicle: { id: string; stockNumber: string; year: number | null; make: string | null; model: string | null }
  buyer: { id: string; firstName: string; lastName: string } | null
  businessBuyer: { id: string; businessName: string } | null
  salesRep: { id: string; name: string } | null
}

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

const cardStyle: React.CSSProperties = {
  background: '#ffffff', borderRadius: 14, padding: 20,
  border: '1px solid rgba(255,255,255,0.6)',
  boxShadow: '0 10px 40px rgba(0,0,0,0.03), 0 1px 2px rgba(15,23,42,0.03), 0 0 0 1px rgba(15,23,42,0.04)',
}

function statusPill(status: string): { label: string; bg: string; fg: string } {
  switch (status) {
    case 'funded': return { label: 'Funded', bg: '#dcfce7', fg: '#15803d' }
    case 'cancelled': return { label: 'Cancelled', bg: '#fee2e2', fg: '#991b1b' }
    default: return { label: 'Draft', bg: '#fef3c7', fg: '#a16207' }
  }
}

const FILTERS = ['All', 'Draft', 'Funded', 'Cancelled'] as const

export default function DealsPage() {
  const router = useRouter()
  const [deals, setDeals] = useState<DealRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All')
  const [newOpen, setNewOpen] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    const qs = filter === 'All' ? '' : `?status=${filter.toLowerCase()}`
    fetch(`/api/deals${qs}`)
      .then(r => r.json())
      .then(d => { setDeals(d.deals || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [filter])

  useEffect(() => { load() }, [load])

  return (
    <div style={{ maxWidth: 1480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0a0a0a', letterSpacing: '-0.01em' }}>Deals</h1>
        <button
          onClick={() => setNewOpen(true)}
          style={{
            padding: '9px 16px', borderRadius: 9, border: 'none', cursor: 'pointer',
            background: '#1a1a1a', color: '#dffd6e', fontSize: 13, fontWeight: 600,
          }}
        >+ New Deal</button>
      </div>

      {/* Status filter chips */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {FILTERS.map(f => {
          const active = f === filter
          return (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '6px 14px', borderRadius: 999,
              border: active ? '1px solid #1a1a1a' : '1px solid rgba(15,23,42,0.12)',
              background: active ? '#1a1a1a' : '#ffffff',
              color: active ? '#dffd6e' : '#475569',
              fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
              transition: 'background 140ms ease, color 140ms ease',
            }}>{f}</button>
          )
        })}
      </div>

      {/* List */}
      <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Loading…</div>
        ) : deals.length === 0 ? (
          <div style={{ padding: '48px 20px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
            {filter === 'All' ? 'No deals yet — start one with + New Deal.' : `No ${filter.toLowerCase()} deals.`}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(15,23,42,0.07)' }}>
                  {['Deal', 'Buyer', 'Vehicle', 'Sale Price', 'OTD Total', 'Rep', 'Status', 'Date'].map(h => (
                    <th key={h} style={{
                      textAlign: 'left', padding: '12px 16px',
                      fontSize: 10.5, fontWeight: 700, color: '#94a3b8',
                      textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {deals.map(d => {
                  const pill = statusPill(d.status)
                  return (
                    <tr
                      key={d.id}
                      onClick={() => router.push(`/deals/${d.id}`)}
                      style={{ borderBottom: '1px solid rgba(15,23,42,0.05)', cursor: 'pointer', transition: 'background 120ms ease' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                    >
                      <td style={{ padding: '13px 16px', fontWeight: 700, color: '#0a0a0a', whiteSpace: 'nowrap' }}>
                        {formatDealNumber(d.dealNumber)}
                      </td>
                      <td style={{ padding: '13px 16px', fontWeight: 600, color: '#0a0a0a', whiteSpace: 'nowrap' }}>
                        {d.buyer
                          ? `${d.buyer.firstName} ${d.buyer.lastName}`
                          : d.businessBuyer
                            ? <>{d.businessBuyer.businessName} <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.04em' }}>BIZ</span></>
                            : '—'}
                      </td>
                      <td style={{ padding: '13px 16px', color: '#334155', whiteSpace: 'nowrap' }}>
                        {[d.vehicle.year, d.vehicle.make, d.vehicle.model].filter(Boolean).join(' ')}
                        <span style={{ color: '#94a3b8', marginLeft: 8, fontSize: 11 }}>#{d.vehicle.stockNumber}</span>
                      </td>
                      <td style={{ padding: '13px 16px', fontWeight: 600, color: '#0a0a0a', whiteSpace: 'nowrap' }}>
                        {d.salePrice ? money(d.salePrice) : '—'}
                      </td>
                      <td style={{ padding: '13px 16px', fontWeight: 700, color: '#0a0a0a', whiteSpace: 'nowrap' }}>
                        {d.otdTotal ? money(d.otdTotal) : '—'}
                      </td>
                      <td style={{ padding: '13px 16px', color: '#64748b', whiteSpace: 'nowrap' }}>{d.salesRep?.name || '—'}</td>
                      <td style={{ padding: '13px 16px', whiteSpace: 'nowrap' }}>
                        <span style={{
                          fontSize: 10.5, fontWeight: 700, padding: '4px 10px', borderRadius: 999,
                          background: pill.bg, color: pill.fg, textTransform: 'uppercase', letterSpacing: '0.04em',
                        }}>{pill.label}</span>
                      </td>
                      <td style={{ padding: '13px 16px', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                        {new Date(d.fundedAt || d.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {newOpen && (
        <NewDealModal
          onClose={() => setNewOpen(false)}
          onCreated={(dealId) => { setNewOpen(false); router.push(`/deals/${dealId}`) }}
        />
      )}
    </div>
  )
}

// ─── New Deal modal — pick buyer, then vehicle ────────────────────────

type ContactHit = { id: string; firstName: string; lastName: string; phone: string | null; email: string | null }
type VehicleHit = { id: string; stockNumber: string; year: number | null; make: string | null; model: string | null; askingPrice?: number | null; heroUrl?: string | null; status?: string | null }

function NewDealModal({ onClose, onCreated }: { onClose: () => void; onCreated: (dealId: string) => void }) {
  const [buyer, setBuyer] = useState<ContactHit | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function create(vehicle: VehicleHit) {
    if (!buyer || creating) return
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buyerContactId: buyer.id, vehicleId: vehicle.id }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error || 'Could not create deal'); setCreating(false); return }
      onCreated(d.deal.id)
    } catch {
      setError('Could not create deal')
      setCreating(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(15,23,42,0.40)',
        backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '10vh 16px 16px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560, maxHeight: '76vh',
          display: 'flex', flexDirection: 'column',
          background: '#ffffff', borderRadius: 18,
          border: '1px solid rgba(255,255,255,0.6)',
          boxShadow: '0 24px 70px rgba(15,23,42,0.28)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: 16, borderBottom: '1px solid rgba(15,23,42,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0a0a0a' }}>
            {buyer ? (
              <>
                New deal for <span style={{ color: '#15803d' }}>{buyer.firstName} {buyer.lastName}</span>
                <button
                  onClick={() => setBuyer(null)}
                  style={{
                    marginLeft: 10, padding: '3px 9px', borderRadius: 6, minHeight: 0,
                    border: '1px solid rgba(15,23,42,0.10)', background: '#fff',
                    fontSize: 11, fontWeight: 600, color: '#64748b', cursor: 'pointer',
                  }}
                >Change buyer</button>
              </>
            ) : 'New Deal — pick the buyer'}
          </div>
          <button onClick={onClose} style={{
            width: 26, height: 26, minHeight: 0, borderRadius: 7, border: 'none', cursor: 'pointer',
            background: 'rgba(15,23,42,0.05)', color: '#64748b',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div style={{ padding: '10px 16px', background: '#fef2f2', color: '#991b1b', fontSize: 12.5, fontWeight: 600 }}>
            {error}
          </div>
        )}

        {!buyer
          ? <ContactSearchList onPick={setBuyer} />
          : <VehicleSearchList onPick={create} creating={creating} />}
      </div>
    </div>
  )
}

function ContactSearchList({ onPick }: { onPick: (c: ContactHit) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ContactHit[]>([])
  const [loading, setLoading] = useState(false)
  const lastQ = useRef('')

  useEffect(() => {
    lastQ.current = query
    const t = setTimeout(async () => {
      if (lastQ.current !== query) return
      setLoading(true)
      try {
        const params = new URLSearchParams({ limit: '25' })
        if (query.trim()) params.set('search', query.trim())
        const r = await fetch(`/api/contacts?${params}`)
        const d = await r.json()
        setResults(Array.isArray(d?.contacts) ? d.contacts : [])
      } catch { setResults([]) } finally { setLoading(false) }
    }, 200)
    return () => clearTimeout(t)
  }, [query])

  return (
    <>
      <div style={{ padding: '12px 16px' }}>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search customers by name, phone, or email…"
          style={{
            width: '100%', boxSizing: 'border-box', padding: '10px 14px', borderRadius: 11,
            border: '1px solid rgba(15,23,42,0.12)', background: '#f7f8fa',
            fontSize: 13, fontWeight: 500, color: '#0a0a0a', outline: 'none',
          }}
        />
      </div>
      <div style={{ overflowY: 'auto', padding: 8 }}>
        {loading && results.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Searching…</div>
        ) : results.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No matches.</div>
        ) : results.map(c => (
          <button key={c.id} onClick={() => onPick(c)} style={{
            width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 8,
            background: 'transparent', border: 'none', cursor: 'pointer', transition: 'background 120ms ease',
          }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#f3f4f6' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0a0a0a' }}>{c.firstName} {c.lastName}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
              {[c.phone, c.email].filter(Boolean).join(' · ') || '—'}
            </div>
          </button>
        ))}
      </div>
    </>
  )
}

function VehicleSearchList({ onPick, creating }: { onPick: (v: VehicleHit) => void; creating: boolean }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<VehicleHit[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const t = setTimeout(() => {
      const qs = new URLSearchParams({ limit: '24' })
      if (query.trim()) qs.set('search', query.trim())
      fetch(`/api/inventory?${qs.toString()}`)
        .then(r => r.json())
        .then(d => { if (!cancelled) { setResults(d.vehicles || []); setLoading(false) } })
        .catch(() => { if (!cancelled) setLoading(false) })
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [query])

  return (
    <>
      <div style={{ padding: '12px 16px' }}>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Now pick the vehicle — stock #, VIN, make, model…"
          style={{
            width: '100%', boxSizing: 'border-box', padding: '10px 14px', borderRadius: 11,
            border: '1px solid rgba(15,23,42,0.12)', background: '#f7f8fa',
            fontSize: 13, fontWeight: 500, color: '#0a0a0a', outline: 'none',
          }}
        />
      </div>
      <div style={{ overflowY: 'auto', padding: 8, opacity: creating ? 0.5 : 1 }}>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Searching…</div>
        ) : results.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No vehicles found.</div>
        ) : results.map(v => {
          const sold = v.status === 'sold'
          return (
            <button key={v.id} disabled={sold || creating} onClick={() => onPick(v)} style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 12,
              padding: 8, borderRadius: 11, border: 'none', textAlign: 'left',
              background: 'transparent', cursor: sold || creating ? 'default' : 'pointer',
              opacity: sold ? 0.5 : 1, transition: 'background 120ms ease',
            }}
              onMouseEnter={(e) => { if (!sold && !creating) e.currentTarget.style.background = '#f3f4f6' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              <div style={{
                width: 64, height: 44, borderRadius: 8, flexShrink: 0,
                background: v.heroUrl ? `center/cover no-repeat url(${v.heroUrl})` : '#eef1f4',
                border: '1px solid rgba(15,23,42,0.06)',
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0a0a0a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {[v.year, v.make, v.model].filter(Boolean).join(' ') || 'Vehicle'}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Stock #{v.stockNumber}{sold ? ' · SOLD' : ''}</div>
              </div>
              {v.askingPrice != null && (
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0a0a0a', flexShrink: 0 }}>{money(v.askingPrice)}</div>
              )}
            </button>
          )
        })}
      </div>
    </>
  )
}
