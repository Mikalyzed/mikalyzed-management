'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

// ─── Types ────────────────────────────────────────────────────────────

type InterestedVehicle = {
  id: string
  stockNumber: string
  vin: string | null
  year: number | null
  make: string | null
  model: string | null
  askingPrice: number | null
  mileage: number | null
  dateInStock: string | null
  heroUrl: string | null
}

type Customer = {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  secondaryPhone: string | null
  homePhone: string | null
  workPhone: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  dateOfBirth: string | null
  contactType: string
  customerStatus: string | null
  leadType: string | null
  leadSource: string | null
  cashDown: number | null
  salesRepId: string | null
  salesRepName: string | null
  createdAt: string
  tags: string[]
  employerName: string | null
  employerYears: number | null
  employerMonthlyIncome: number | null
  vehiclesPurchasedCount: number
  _count: { opportunities: number; vehicleInterests: number }
  interestedVehicle: InterestedVehicle | null
}

type FilterKey = 'all' | 'customers' | 'leads' | 'vendors' | 'active_lead' | 'past_customer'

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active_lead', label: 'Active Leads' },
  { key: 'past_customer', label: 'Past Customers' },
  { key: 'customers', label: 'Customers' },
  { key: 'leads', label: 'Leads' },
  { key: 'vendors', label: 'Vendors' },
]

// ─── Helpers ──────────────────────────────────────────────────────────

function formatPhone(raw: string | null) {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  if (digits.length === 11 && digits.startsWith('1')) return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  return raw
}

function formatDate(d: string | null, fmt: 'mdy' | 'md' = 'md') {
  if (!d) return null
  const date = new Date(d)
  if (fmt === 'mdy') return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
  return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' })
}

function daysBetween(from: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(from).getTime()) / 86400000))
}

function statusBadge(status: string | null): { label: string; bg: string; fg: string } | null {
  if (!status) return null
  const lc = status.toLowerCase()
  if (lc.includes('sold') || lc.includes('won')) return { label: status, bg: '#dcfce7', fg: '#15803d' }
  if (lc.includes('lost')) return { label: status, bg: '#fee2e2', fg: '#991b1b' }
  if (lc.includes('working') || lc.includes('hot')) return { label: status, bg: '#fef3c7', fg: '#a16207' }
  if (lc.includes('appt') || lc.includes('contact')) return { label: status, bg: '#dbeafe', fg: '#1e40af' }
  if (lc.includes('new')) return { label: status, bg: '#ede9fe', fg: '#6d28d9' }
  return { label: status, bg: '#f1f5f9', fg: '#475569' }
}

function typeBadge(type: string): { label: string; bg: string; fg: string } {
  switch (type) {
    case 'customer': return { label: 'Customer', bg: '#dcfce7', fg: '#15803d' }
    case 'vendor':   return { label: 'Vendor',   bg: '#fef3c7', fg: '#a16207' }
    default:         return { label: 'Lead',     bg: '#dbeafe', fg: '#1e40af' }
  }
}

const AVATAR_PALETTE = ['#94a3b8', '#a78bfa', '#67e8f9', '#fbbf24', '#f87171', '#4ade80', '#fb923c', '#c084fc']
function initialsColor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length]
}

// ─── Table column geometry (DealerCenter parity) ─────────────────────
//
// Wide horizontal table — total min-width far exceeds viewport so the
// user scrolls right to see Sold Vehicle / Trade / Customer Offer / Deal
// Info, the way DealerCenter does.  Empty cells render as "—" so the
// rhythm is preserved even when the underlying data isn't tracked yet.

const COLUMN_LABELS = [
  'Customer',
  'Lead Info',
  'Date',
  'Inquiry Type',
  'Employment',
  'Interested Vehicle',
  'Sold Vehicle',
  'Trade',
  'Customer Offer',
  'Deal Info',
] as const

// Wider footprint — customer names, emails, and addresses get full room
// to stretch across the wide canvas without truncation.
const COLUMN_WIDTHS = [340, 240, 200, 200, 260, 300, 260, 200, 240, 260]
const COL_TEMPLATE = COLUMN_WIDTHS.map(w => `${w}px`).join(' ')
const COL_MIN_WIDTH = `${COLUMN_WIDTHS.reduce((a, b) => a + b, 0)}px`

// ─── Stacked field primitive (small label above value) ───────────────
// Stacked typography gives the row real hierarchy: the eye finds the label
// instantly, then drops to the value.  Beats the inline `Label: value`
// shape which made every field weigh the same.

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  const has = value != null && value !== '' && value !== '—'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <span style={{
        fontSize: 9.5, color: '#94a3b8', fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '0.08em',
      }}>{label}</span>
      <span style={{
        fontSize: 13, color: has ? '#0a0a0a' : '#cbd5e1', fontWeight: has ? 600 : 500,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        letterSpacing: '-0.005em',
      }}>
        {has ? value : '—'}
      </span>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────

// useSearchParams() requires a Suspense boundary so Next.js can prerender
// this route instead of bailing out to full client-side rendering.
export default function CustomersPage() {
  return (
    <Suspense fallback={null}>
      <CustomersPageInner />
    </Suspense>
  )
}

function CustomersPageInner() {
  const router = useRouter()
  const urlParams = useSearchParams()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState(urlParams.get('search') || '')
  const [searchDebounced, setSearchDebounced] = useState(search)
  const [filter, setFilter] = useState<FilterKey>((urlParams.get('filter') as FilterKey) || 'all')
  const [page, setPage] = useState(1)
  const perPage = 50

  useEffect(() => {
    const t = setTimeout(() => { setSearchDebounced(search); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    const params = new URLSearchParams()
    if (filter !== 'all') params.set('filter', filter)
    if (searchDebounced) params.set('search', searchDebounced)
    const qs = params.toString()
    router.replace(`/customers${qs ? '?' + qs : ''}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, searchDebounced])

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (searchDebounced) params.set('search', searchDebounced)
    if (filter === 'customers') params.set('contactType', 'customer')
    else if (filter === 'leads') params.set('contactType', 'lead')
    else if (filter === 'vendors') params.set('contactType', 'vendor')
    else if (filter === 'active_lead' || filter === 'past_customer') params.set('status', filter)
    params.set('limit', String(perPage))
    params.set('offset', String((page - 1) * perPage))
    fetch(`/api/customers?${params}`).then(r => r.json()).then(d => {
      setCustomers(d.customers || [])
      setTotal(d.total || 0)
      setLoading(false)
    })
  }, [filter, searchDebounced, page])

  const totalPages = Math.ceil(total / perPage)

  return (
    <div>
      {/* ─── Desktop header ─── */}
      <div className="desktop-only" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0a0a0a', letterSpacing: '-0.01em' }}>Customers</h1>
          <span style={{ fontSize: 13, fontWeight: 600, padding: '4px 12px', borderRadius: 20, background: '#eff6ff', color: '#2563eb' }}>
            {total.toLocaleString()}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, phone, email…"
            style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, width: 260 }}
          />
          <Link href="/leads/new" style={{
            padding: '8px 16px', borderRadius: 8,
            background: '#1a1a1a', color: '#dffd6e', fontSize: 14, fontWeight: 600,
            textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6,
          }}>+ Add Customer</Link>
        </div>
      </div>

      {/* ─── Mobile header ─── */}
      <div className="mobile-only" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em' }}>Customers</h1>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>{total.toLocaleString()}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search…"
            style={{ flex: 1, padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', fontSize: 15, background: '#fff', minWidth: 0 }}
          />
          <Link href="/leads/new" aria-label="Add customer" style={{
            flexShrink: 0, width: 48, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#1a1a1a', color: '#dffd6e', borderRadius: 12, fontSize: 26, fontWeight: 400, lineHeight: 1, textDecoration: 'none',
          }}>+</Link>
        </div>
      </div>

      {/* ─── Filter chip rail ─── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, overflowX: 'auto', paddingBottom: 4 }}>
        {FILTERS.map(f => {
          const active = f.key === filter
          return (
            <button
              key={f.key}
              onClick={() => { setFilter(f.key); setPage(1) }}
              style={{
                flexShrink: 0,
                padding: '7px 14px', borderRadius: 999,
                border: active ? '1px solid #1a1a1a' : '1px solid rgba(15, 23, 42, 0.12)',
                background: active ? '#1a1a1a' : '#ffffff',
                color: active ? '#dffd6e' : '#475569',
                fontSize: 13, fontWeight: 600,
                cursor: 'pointer', whiteSpace: 'nowrap',
                transition: 'background 140ms ease, color 140ms ease, border-color 140ms ease',
              }}
            >
              {f.label}
            </button>
          )
        })}
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>Loading...</p>
      ) : customers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          {searchDebounced ? 'No customers match your search.' : 'No customers in this view yet.'}
        </div>
      ) : (
        <>
          {/* ─── Mobile minimal list ─── */}
          <div className="mobile-only">
            <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              {customers.map((c, i) => {
                const fullName = `${c.firstName} ${c.lastName}`
                const badge = typeBadge(c.contactType)
                const bg = initialsColor(fullName)
                return (
                  <button
                    key={c.id}
                    onClick={() => router.push(`/customers/${c.id}`)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                      padding: '14px 16px', textAlign: 'left',
                      borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                      background: 'transparent', border: 'none', cursor: 'pointer',
                    }}
                  >
                    <div style={{
                      width: 38, height: 38, borderRadius: '50%', background: bg, color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: 700, flexShrink: 0,
                    }}>
                      {c.firstName.charAt(0)}{c.lastName.charAt(0)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: '#0a0a0a' }}>{fullName}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {formatPhone(c.phone) || c.email || '—'}
                      </div>
                    </div>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                      background: badge.bg, color: badge.fg, flexShrink: 0,
                    }}>{badge.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* ─── Desktop glass table ─── */}
          {/* Custom scrollbar styling — minimal, translucent, matches the
              glass sheet vibe (no chunky default grey bars).  Scoped via
              a className so it doesn't leak to other tables. */}
          <style>{`
            .glass-table::-webkit-scrollbar {
              height: 10px; width: 10px; background: transparent;
            }
            .glass-table::-webkit-scrollbar-track {
              background: transparent;
            }
            .glass-table::-webkit-scrollbar-thumb {
              background: rgba(15, 23, 42, 0.15);
              border-radius: 999px;
              border: 2px solid transparent;
              background-clip: padding-box;
            }
            .glass-table::-webkit-scrollbar-thumb:hover {
              background: rgba(15, 23, 42, 0.28);
              background-clip: padding-box;
              border: 2px solid transparent;
            }
            .glass-table { scrollbar-color: rgba(15, 23, 42, 0.18) transparent; scrollbar-width: thin; }
          `}</style>
          <div className="desktop-only glass-table" style={{
            // Solid white — backdrop-filter blur was crushing scroll perf
            // when applied to every row's sticky cell.  Keep the soft
            // outer shadow + 16px radius for the floating feel.
            background: '#ffffff',
            border: '1px solid rgba(15, 23, 42, 0.06)',
            borderRadius: 16,
            overflow: 'auto',
            boxShadow: [
              '0 12px 36px -12px rgba(15, 23, 42, 0.08)',
              '0 4px 12px -4px rgba(15, 23, 42, 0.04)',
            ].join(', '),
          }}>
            {/* Header — solid, slim slate-grey caps, single translucent divider */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: COL_TEMPLATE,
              minWidth: COL_MIN_WIDTH,
              background: '#ffffff',
              borderBottom: '1px solid rgba(15, 23, 42, 0.08)',
              position: 'sticky', top: 0, zIndex: 2,
            }}>
              {COLUMN_LABELS.map((label, i) => (
                <div key={label} style={{
                  padding: '14px 20px',
                  // No vertical dividers between header cells — clean
                  // satin rhythm, only the bottom underline anchors them.
                  fontSize: 10.5, fontWeight: 600, color: '#64748b',
                  textTransform: 'uppercase', letterSpacing: '0.08em',
                  // Pin Customer column.  Solid white so content scrolling
                  // underneath stays occluded — no blur.
                  ...(i === 0 ? {
                    position: 'sticky', left: 0, zIndex: 3,
                    background: '#ffffff',
                    boxShadow: '6px 0 14px -10px rgba(15, 23, 42, 0.12)',
                  } : {}),
                }}>{label}</div>
              ))}
            </div>
            {/* Body — independent floating satin tracks, no row dividers */}
            {customers.map(c => (
              <CustomerRow key={c.id} c={c} onOpen={() => router.push(`/customers/${c.id}`)} />
            ))}
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, fontSize: 13 }}>
              <span style={{ color: 'var(--text-muted)' }}>Page {page} of {totalPages}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{
                  padding: '6px 14px', borderRadius: 6, border: '1px solid var(--border)',
                  background: '#fff', fontSize: 13, cursor: page === 1 ? 'default' : 'pointer',
                  opacity: page === 1 ? 0.4 : 1,
                }}>Prev</button>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{
                  padding: '6px 14px', borderRadius: 6, border: '1px solid var(--border)',
                  background: '#fff', fontSize: 13, cursor: page === totalPages ? 'default' : 'pointer',
                  opacity: page === totalPages ? 0.4 : 1,
                }}>Next</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Desktop wide row ─────────────────────────────────────────────────

// ─── Table primitives ─────────────────────────────────────────────────

const CELL_STYLE: React.CSSProperties = {
  // Generous py-4 satin track padding; horizontal padding scaled to fit
  // the wider columns without crowding the values.
  padding: '16px 20px',
  minWidth: 0,
  display: 'flex', flexDirection: 'column', gap: 7,
  fontSize: 12, lineHeight: 1.4,
}

// Inline pair: label left muted, value right charcoal-bold.  Label is
// ALWAYS shown so the row reveals which properties exist (DealerCenter
// parity).  Empty values fall back to a soft em-dash next to the label.
// For cells where EVERY field is empty, use the single-dash EmptyCell at
// the cell level instead of N rows of "Label —".
function Pair({ label, value }: { label: string; value: React.ReactNode }) {
  const has = value != null && value !== ''
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      gap: 12, minWidth: 0,
    }}>
      <span style={{
        fontSize: 10.5, color: '#94a3b8', fontWeight: 500,
        flexShrink: 0, whiteSpace: 'nowrap',
        textTransform: 'uppercase', letterSpacing: '0.06em',
      }}>{label}</span>
      <span style={{
        fontSize: 12, color: has ? '#0a0a0a' : '#cbd5e1', fontWeight: has ? 600 : 400,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        minWidth: 0, textAlign: 'right',
      }}>{has ? value : '—'}</span>
    </div>
  )
}


function VehicleCell({
  thumb, headline, price, meta, stockNumber, empty,
}: {
  thumb?: string | null
  headline?: string
  price?: number | null
  meta?: string | null
  stockNumber?: string
  empty?: boolean
}) {
  if (empty) {
    return <span style={{ color: '#cbd5e1', fontSize: 11.5 }}>—</span>
  }
  return (
    <div style={{ display: 'flex', gap: 10, minWidth: 0, alignItems: 'flex-start' }}>
      <div style={{
        width: 72, height: 54, borderRadius: 6, overflow: 'hidden', flexShrink: 0,
        background: '#f1f5f9',
        border: '1px solid rgba(15, 23, 42, 0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 17h2a2 2 0 1 0 4 0h2a2 2 0 1 0 4 0h2v-4l-3-4H7l-3 4v4Z" />
            <circle cx="7" cy="17" r="2" />
            <circle cx="17" cy="17" r="2" />
          </svg>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {headline && (
          <div style={{
            fontSize: 12, fontWeight: 700, color: '#0a0a0a', letterSpacing: '-0.005em',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{headline}</div>
        )}
        {price != null && (
          <div style={{ fontSize: 12, fontWeight: 700, color: '#0a0a0a' }}>
            ${price.toLocaleString()}
          </div>
        )}
        {meta && (
          <div style={{ fontSize: 10.5, color: '#94a3b8' }}>{meta}</div>
        )}
        {stockNumber && (
          <div style={{ fontSize: 10, color: '#cbd5e1', fontWeight: 600 }}>
            #{stockNumber}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Customer row (floating satin track) ─────────────────────────────

// Soft em-dash placeholder for cells where we don't track any data yet.
// Used in Trade / Customer Offer / Deal Info / Sold Vehicle so the row
// doesn't print N stacked empty labels for visual noise.
function EmptyCell() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
      <span style={{ fontSize: 14, color: '#cbd5e1', fontWeight: 400 }}>—</span>
    </div>
  )
}

function CustomerRow({ c, onOpen }: { c: Customer; onOpen: () => void }) {
  const [hover, setHover] = useState(false)
  const fullName = `${c.firstName} ${c.lastName}`
  const status = statusBadge(c.customerStatus)
  const v = c.interestedVehicle
  const daysOld = daysBetween(c.createdAt)
  const daysInStock = v?.dateInStock ? daysBetween(v.dateInStock) : null
  const employerMonths = c.employerYears != null ? Math.floor(c.employerYears * 12) : null
  const lengthAtJob = c.employerYears != null
    ? `${Math.floor(c.employerYears)} yr${Math.floor(c.employerYears) === 1 ? '' : 's'}${employerMonths && employerMonths % 12 !== 0 ? ` ${employerMonths % 12} mo` : ''}`
    : null
  const locationLine = [c.city, c.state].filter(Boolean).join(', ') || null
  const addressLine = c.address ? c.address.toUpperCase() : null

  // Inquiry Type cell collapses to single em-dash when we have neither a
  // status badge NOR any of the supporting flags (we don't track those yet).
  const inquiryEmpty = !status

  return (
    <div
      onClick={onOpen}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'grid',
        gridTemplateColumns: COL_TEMPLATE,
        minWidth: COL_MIN_WIDTH,
        // Solid hover gray — no backdrop-filter so scrolling stays fluid.
        background: hover ? '#f8fafc' : '#ffffff',
        cursor: 'pointer',
        transition: 'background 140ms ease',
      }}
    >
      {/* 1 · Customer — pinned column.  Solid backgrounds (no blur) so
          scrolling 100+ rows doesn't choke the GPU.  The sticky cell
          still needs its own bg to occlude content scrolling underneath. */}
      <div style={{
        ...CELL_STYLE, gap: 5,
        position: 'sticky', left: 0, zIndex: 1,
        background: hover ? '#f8fafc' : '#ffffff',
        boxShadow: '6px 0 14px -10px rgba(15, 23, 42, 0.12)',
        transition: 'background 140ms ease',
      }}>
        <div style={{
          fontSize: 13.5, fontWeight: 700, color: '#0a0a0a', letterSpacing: '-0.005em',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{fullName.toUpperCase()}</div>
        {c.email && (
          <div style={{
            fontSize: 11.5, color: '#2563eb',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{c.email.toLowerCase()}</div>
        )}
        {(c.homePhone || c.phone) && (
          <div style={{ display: 'flex', gap: 14, fontSize: 11.5, color: '#475569' }}>
            {c.homePhone && <span><span style={{ color: '#94a3b8', fontWeight: 500 }}>H</span> {formatPhone(c.homePhone)}</span>}
            {c.phone && <span><span style={{ color: '#94a3b8', fontWeight: 500 }}>C</span> {formatPhone(c.phone)}</span>}
          </div>
        )}
        {addressLine && (
          <div style={{ fontSize: 11, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {addressLine}
          </div>
        )}
        {locationLine && (
          <div style={{ fontSize: 11, color: '#94a3b8' }}>
            {locationLine}{c.zip ? ` ${c.zip}` : ''}
          </div>
        )}
        {c.dateOfBirth && (
          <div style={{ fontSize: 11, color: '#94a3b8' }}>
            <span style={{ fontWeight: 500 }}>DOB</span> {formatDate(c.dateOfBirth, 'mdy')}
          </div>
        )}
      </div>

      {/* 2 · Lead Info — 6 slots matching DealerCenter's Lead Info column.
          Workflow + Lost Reason aren't tracked in our schema yet; their
          em-dashes hold the row rhythm so the table doesn't shift when
          they're wired up later. */}
      <div style={CELL_STYLE}>
        <Pair label="Sales Rep" value={c.salesRepName} />
        <Pair label="Source" value={c.leadSource?.toUpperCase()} />
        <Pair label="Type" value={c.leadType?.toUpperCase()} />
        <Pair label="Workflow" value={null} />
        <Pair label="Cash Down" value={c.cashDown != null ? `$${c.cashDown.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : null} />
        <Pair label="Lost Reason" value={null} />
      </div>

      {/* 3 · Date */}
      <div style={CELL_STYLE}>
        <Pair label="Created" value={formatDate(c.createdAt, 'mdy')} />
        <Pair label="Days Old" value={String(daysOld)} />
      </div>

      {/* 4 · Inquiry Type / Status */}
      <div style={CELL_STYLE}>
        {inquiryEmpty ? (
          <EmptyCell />
        ) : (
          <span style={{
            alignSelf: 'flex-start',
            fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 999,
            background: status!.bg, color: status!.fg,
            textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>{status!.label}</span>
        )}
      </div>

      {/* 5 · Employment */}
      <div style={CELL_STYLE}>
        <Pair label="Employer" value={c.employerName?.toUpperCase()} />
        <Pair label="Length" value={lengthAtJob} />
        <Pair label="Income" value={c.employerMonthlyIncome != null ? `$${c.employerMonthlyIncome.toLocaleString()}` : null} />
        <Pair label="Work Phone" value={formatPhone(c.workPhone)} />
      </div>

      {/* 6 · Interested Vehicle */}
      <div style={CELL_STYLE}>
        <VehicleCell
          empty={!v}
          thumb={v?.heroUrl}
          headline={v ? [v.year, v.make, v.model].filter(Boolean).join(' ').toUpperCase() : undefined}
          price={v?.askingPrice ?? null}
          meta={v ? [
            v.mileage != null ? `${v.mileage.toLocaleString()} mi` : null,
            daysInStock != null ? `${daysInStock} days` : null,
          ].filter(Boolean).join(' · ') : null}
          stockNumber={v?.stockNumber}
        />
      </div>

      {/* 7 · Sold Vehicle — not tracked yet, single em-dash */}
      <div style={CELL_STYLE}><EmptyCell /></div>

      {/* 8 · Trade — not tracked yet */}
      <div style={CELL_STYLE}><EmptyCell /></div>

      {/* 9 · Customer Offer — not tracked yet */}
      <div style={CELL_STYLE}><EmptyCell /></div>

      {/* 10 · Deal Info — not tracked yet */}
      <div style={CELL_STYLE}><EmptyCell /></div>
    </div>
  )
}
