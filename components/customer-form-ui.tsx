'use client'

import React, { useEffect, useRef, useState } from 'react'

// ─── Helpers ───────────────────────────────────────────────────────

// Auto-format a phone number as the user types: strip non-digits, cap at 10,
// insert dashes after the 3rd and 6th digit. So "5551234567" → "555-123-4567".
// Partial inputs work: 3 digits → "555", 4-6 → "555-1", "555-12", "555-123-4".
export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 10)
  if (digits.length === 0) return ''
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
}

// ─── Premium components for AddPartnerModal / AddCustomerModal ─────

export function SectionCard({ children }: { children: React.ReactNode }) {
  // V2 SubPanel aesthetic — translucent fill, inset white highlight on top
  // edge, subtle dark hairline border, soft drop shadow. Same visual
  // language as Mechanical Blueprint / Title Registration cards on the
  // build/title sub-tab.
  return (
    <div style={{
      background: 'rgba(241, 245, 249, 0.65)',
      borderRadius: 16,
      border: '1px solid rgba(15, 23, 42, 0.07)',
      padding: '16px 18px',
      marginBottom: 16,
      boxShadow: [
        'inset 0 1px 0 rgba(255, 255, 255, 0.9)',
        'inset 0 0 0 0.5px rgba(255, 255, 255, 0.5)',
        '0 4px 14px -6px rgba(15, 23, 42, 0.08)',
      ].join(', '),
    }}>{children}</div>
  )
}

export function SectionCardLabel({ children }: { children: React.ReactNode }) {
  // No accent line / no underline — just a clean uppercase label at top of
  // the card. Color is muted slate so the field values dominate visually.
  return (
    <h3 style={{
      fontSize: 11, fontWeight: 700, color: 'rgba(15, 23, 42, 0.55)',
      marginBottom: 12, letterSpacing: '0.12em',
      textTransform: 'uppercase',
    }}>{children}</h3>
  )
}

export function FieldStack({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
}

export function FieldRow({ children, cols }: { children: React.ReactNode; cols: number[] }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: cols.map(c => `${c}fr`).join(' '),
      gap: 8,
    }}>{children}</div>
  )
}

// FieldBackplate is now a transparent pass-through — the chip styling lives
// directly on the PremiumField row so the visual is one cohesive pill
// (label LEFT, bold value RIGHT) instead of a backplate-around-stacked-pair.
export function FieldBackplate({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

export function PremiumField({
  label, value, onChange, placeholder, required,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  required?: boolean
}) {
  const [focused, setFocused] = useState(false)
  const [hover, setHover] = useState(false)
  const bg = focused
    ? 'rgba(255, 255, 255, 0.95)'
    : hover
      ? 'rgba(255, 255, 255, 0.78)'
      : 'rgba(255, 255, 255, 0.55)'
  return (
    <label
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, minWidth: 0,
        padding: '10px 16px',
        borderRadius: 14,
        background: bg,
        border: focused
          ? '1px solid rgba(10, 132, 255, 0.45)'
          : '1px solid rgba(255, 255, 255, 0.7)',
        boxShadow: focused
          ? '0 0 0 3px rgba(10, 132, 255, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.95), 0 1px 2px rgba(15, 23, 42, 0.05)'
          : 'inset 0 1px 0 rgba(255, 255, 255, 0.95), inset 0 0 0 0.5px rgba(255, 255, 255, 0.5), 0 1px 2px rgba(15, 23, 42, 0.04)',
        transform: hover && !focused ? 'translateY(-0.5px)' : 'none',
        transition: 'background 180ms ease, border-color 160ms ease, box-shadow 160ms ease, transform 180ms ease',
        cursor: 'text',
      }}
    >
      <span style={{
        fontSize: 11.5, fontWeight: 600, color: 'rgba(15, 23, 42, 0.55)',
        letterSpacing: '-0.005em',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        flexShrink: 0, minWidth: 0, maxWidth: '38%',
      }}>
        {label}{required && <span style={{ color: '#dc2626', marginLeft: 2 }}>*</span>}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? '—'}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          flex: 1, minWidth: 0, textAlign: 'right',
          border: 'none', outline: 'none', background: 'transparent',
          fontSize: 13.5, fontWeight: 700, color: '#0a0a0a',
          letterSpacing: '-0.005em',
          padding: 0, margin: 0,
          fontVariantNumeric: 'tabular-nums',
        }}
      />
    </label>
  )
}

// Select + date variants of PremiumField sharing the same chip-pill shell.
const premiumFieldChipStyle = (focused: boolean, hover: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  gap: 12, minWidth: 0,
  padding: '10px 16px',
  borderRadius: 14,
  background: focused ? 'rgba(255, 255, 255, 0.95)' : hover ? 'rgba(255, 255, 255, 0.78)' : 'rgba(255, 255, 255, 0.55)',
  border: focused ? '1px solid rgba(10, 132, 255, 0.45)' : '1px solid rgba(255, 255, 255, 0.7)',
  boxShadow: focused
    ? '0 0 0 3px rgba(10, 132, 255, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.95), 0 1px 2px rgba(15, 23, 42, 0.05)'
    : 'inset 0 1px 0 rgba(255, 255, 255, 0.95), inset 0 0 0 0.5px rgba(255, 255, 255, 0.5), 0 1px 2px rgba(15, 23, 42, 0.04)',
  transform: hover && !focused ? 'translateY(-0.5px)' : 'none',
  transition: 'background 180ms ease, border-color 160ms ease, box-shadow 160ms ease, transform 180ms ease',
  cursor: 'pointer',
})

const premiumFieldChipLabelStyle: React.CSSProperties = {
  fontSize: 11.5, fontWeight: 600, color: 'rgba(15, 23, 42, 0.55)',
  letterSpacing: '-0.005em',
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  flexShrink: 0, minWidth: 0, maxWidth: '38%',
}

const premiumFieldChipInputStyle: React.CSSProperties = {
  flex: 1, minWidth: 0, textAlign: 'right',
  border: 'none', outline: 'none', background: 'transparent',
  fontSize: 13.5, fontWeight: 700, color: '#0a0a0a',
  letterSpacing: '-0.005em',
  padding: 0, margin: 0,
  fontVariantNumeric: 'tabular-nums',
}

export function PremiumFieldSelect({
  label, value, onChange, options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  const [focused, setFocused] = useState(false)
  const [hover, setHover] = useState(false)
  return (
    <label
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={premiumFieldChipStyle(focused, hover)}
    >
      <span style={premiumFieldChipLabelStyle}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{ ...premiumFieldChipInputStyle, appearance: 'none' }}
      >
        <option value="">—</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  )
}

export function PremiumFieldDate({
  label, value, onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
  const [focused, setFocused] = useState(false)
  const [hover, setHover] = useState(false)
  return (
    <label
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={premiumFieldChipStyle(focused, hover)}
    >
      <span style={premiumFieldChipLabelStyle}>{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={premiumFieldChipInputStyle}
      />
    </label>
  )
}

export function SalesRepPicker({
  value, label, onPick, onClear,
}: {
  value: string | null
  label: string
  onPick: (id: string, label: string) => void
  onClear: () => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ id: string; name: string; email: string; role: string }[]>([])
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function down(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', down)
    return () => document.removeEventListener('mousedown', down)
  }, [open])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(async () => {
      try {
        const r = await fetch('/api/users')
        const d = await r.json()
        const items: { id: string; name: string; email: string; role: string }[] = Array.isArray(d?.users) ? d.users : []
        const q = query.trim().toLowerCase()
        setResults(q
          ? items.filter(u => u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q))
          : items)
      } catch {
        setResults([])
      }
    }, 150)
    return () => clearTimeout(t)
  }, [query, open])

  if (value) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, padding: '12px 16px',
        background: 'rgba(0, 113, 227, 0.05)',
        border: '1px solid rgba(0, 113, 227, 0.2)',
        borderRadius: 12,
      }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(0,0,0,0.5)', textTransform: 'uppercase' }}>
            Assigned Sales Rep
          </p>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#0a0a0a', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {label || '—'}
          </p>
        </div>
        <button
          type="button"
          onClick={onClear}
          style={{
            background: 'none', border: 'none',
            color: '#0071e3', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', minHeight: 'auto', padding: 0,
          }}
        >Change</button>
      </div>
    )
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <FieldBackplate>
        <label style={premiumFieldChipStyle(false, false)}>
          <span style={premiumFieldChipLabelStyle}>Assign Sales Rep</span>
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            placeholder="Search by name or email"
            style={premiumFieldChipInputStyle}
          />
        </label>
      </FieldBackplate>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: '#fff', borderRadius: 10,
          border: '1px solid rgba(0,0,0,0.08)',
          boxShadow: '0 12px 28px rgba(15, 23, 42, 0.12)',
          zIndex: 50, maxHeight: 280, overflowY: 'auto',
        }}>
          {results.length === 0 && (
            <div style={{ padding: '10px 12px', color: 'rgba(0,0,0,0.45)', fontSize: 13 }}>
              No users
            </div>
          )}
          {results.map(u => (
            <button
              key={u.id}
              type="button"
              onClick={() => { onPick(u.id, u.name); setOpen(false); setQuery('') }}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                gap: 2, width: '100%', textAlign: 'left',
                padding: '8px 12px', background: 'none', border: 'none',
                cursor: 'pointer', color: '#0a0a0a', minHeight: 'auto',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,113,227,0.06)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>{u.name}</span>
              <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.5)' }}>{u.email} · {u.role}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Inline button variants for the row of 4 collapsible toggles below the
// Lead Info card. Each renders as a single uniform pill so the row of 4
// reads as one cohesive control strip.
export function CollapsibleSectionToggle({ label, open, onToggle }: { label: string; open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        padding: '10px 14px', borderRadius: 10,
        border: '1px solid rgba(15, 23, 42, 0.08)',
        background: open ? 'rgba(0, 113, 227, 0.08)' : 'rgba(255, 255, 255, 0.65)',
        color: open ? '#0071e3' : '#1d1d1f',
        fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
        minHeight: 'auto',
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.85), 0 1px 2px rgba(15, 23, 42, 0.04)',
      }}
    >{label}{open ? ' ▾' : ''}</button>
  )
}

export function CollapsibleStubInline({ label }: { label: string }) {
  return (
    <button
      type="button"
      disabled
      title="Coming with sales pipeline"
      style={{
        padding: '10px 14px', borderRadius: 10,
        border: '1px solid rgba(15, 23, 42, 0.06)',
        background: 'rgba(15, 23, 42, 0.025)',
        color: 'rgba(0,0,0,0.4)',
        fontSize: 12.5, fontWeight: 600, cursor: 'not-allowed',
        minHeight: 'auto',
      }}
    >{label}</button>
  )
}

export function InterestedVehiclePicker({
  vehicleId, label, onPick, onClear,
}: {
  vehicleId: string | null
  label: string
  onPick: (id: string, label: string) => void
  onClear: () => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ id: string; stockNumber: string; year: number | null; make: string; model: string }[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const lastQueryRef = useRef('')

  useEffect(() => {
    if (!open) return
    function down(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', down)
    return () => document.removeEventListener('mousedown', down)
  }, [open])

  useEffect(() => {
    if (!open) return
    lastQueryRef.current = query
    const t = setTimeout(async () => {
      if (lastQueryRef.current !== query) return
      setLoading(true)
      try {
        const params = new URLSearchParams({ limit: '20' })
        if (query.trim()) params.set('search', query.trim())
        const r = await fetch(`/api/inventory?${params}`)
        const d = await r.json()
        const items = Array.isArray(d?.vehicles) ? d.vehicles : []
        setResults(items.map((v: { stockNumber: string; year?: number | null; make?: string; model?: string }) => ({
          id: v.stockNumber, // inventory route returns the inventory row; we use stockNumber as the key.
          stockNumber: v.stockNumber,
          year: v.year ?? null,
          make: v.make ?? '',
          model: v.model ?? '',
        })))
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 200)
    return () => clearTimeout(t)
  }, [query, open])

  // When a result is picked, we need the canonical Vehicle.id (not the
  // stock number). Resolve via /api/vehicles/resolve, then pass it up.
  async function pickInventoryRow(stockNumber: string, displayName: string) {
    try {
      const r = await fetch('/api/vehicles/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stockNumber }),
      })
      if (!r.ok) return
      const d = await r.json()
      if (d?.vehicleId) onPick(d.vehicleId, displayName)
    } catch { /* swallow */ }
    setOpen(false)
    setQuery('')
  }

  // Attached display when something is already picked.
  if (vehicleId) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, padding: '12px 16px',
        background: 'rgba(0, 113, 227, 0.05)',
        border: '1px solid rgba(0, 113, 227, 0.2)',
        borderRadius: 12,
      }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(0,0,0,0.5)', textTransform: 'uppercase' }}>
            Attached Vehicle
          </p>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#0a0a0a', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {label || '—'}
          </p>
        </div>
        <button
          type="button"
          onClick={onClear}
          style={{
            background: 'none', border: 'none',
            color: '#0071e3', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', minHeight: 'auto', padding: 0,
          }}
        >Change</button>
      </div>
    )
  }

  // Picker UI when nothing's attached.
  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <FieldBackplate>
        <label style={premiumFieldChipStyle(false, false)}>
          <span style={premiumFieldChipLabelStyle}>Search Vehicle</span>
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            placeholder="Year · make · model · stock #"
            style={premiumFieldChipInputStyle}
          />
        </label>
      </FieldBackplate>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: '#fff', borderRadius: 10,
          border: '1px solid rgba(0,0,0,0.08)',
          boxShadow: '0 12px 28px rgba(15, 23, 42, 0.12)',
          zIndex: 50, maxHeight: 280, overflowY: 'auto',
        }}>
          {loading && results.length === 0 && (
            <div style={{ padding: '10px 12px', color: 'rgba(0,0,0,0.45)', fontSize: 13 }}>Searching…</div>
          )}
          {!loading && results.length === 0 && (
            <div style={{ padding: '10px 12px', color: 'rgba(0,0,0,0.45)', fontSize: 13 }}>
              {query.trim() ? `No vehicle matching "${query.trim()}"` : 'Type to search inventory'}
            </div>
          )}
          {results.map(v => {
            const displayName = `${v.year ?? ''} ${v.make} ${v.model}`.trim() + ` · ${v.stockNumber}`
            return (
              <button
                key={v.stockNumber}
                type="button"
                onClick={() => { void pickInventoryRow(v.stockNumber, displayName) }}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                  gap: 2, width: '100%', textAlign: 'left',
                  padding: '8px 12px', background: 'none', border: 'none',
                  cursor: 'pointer', color: '#0a0a0a', minHeight: 'auto',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,113,227,0.06)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                <span style={{ fontSize: 13.5, fontWeight: 700 }}>
                  {v.year ?? ''} {v.make} {v.model}
                </span>
                <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.5)' }}>Stock #{v.stockNumber}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function PremiumPillButton({
  label, onClick, disabled,
}: { label: string; onClick: () => void; disabled?: boolean }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '9px 22px', borderRadius: 999,
        fontSize: 13, fontWeight: 700, letterSpacing: '-0.005em',
        background: disabled
          ? 'rgba(15, 23, 42, 0.2)'
          : hover
            ? 'linear-gradient(180deg, #2a2a2c 0%, #0a0a0c 100%)'
            : 'linear-gradient(180deg, #1d1d1f 0%, #0a0a0c 100%)',
        color: '#fff',
        border: '1px solid rgba(0, 0, 0, 0.4)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        minHeight: 'auto',
        boxShadow: disabled
          ? 'none'
          : [
              '0 6px 18px -6px rgba(15, 23, 42, 0.55)',
              '0 1px 2px rgba(15, 23, 42, 0.25)',
              'inset 0 1px 0 rgba(255, 255, 255, 0.18)',
            ].join(', '),
        transform: hover && !disabled ? 'translateY(-1px)' : 'translateY(0)',
        transition: 'background 200ms ease, transform 200ms ease, box-shadow 200ms ease',
      }}
    >{label}</button>
  )
}

// ─── Customer dropdown option lists ─────────────────────────────────
// Fixed lists v1; could become admin-managed tables later (same pattern as
// cost_add_descriptions / cost_add_categories) if the dealership wants to
// extend them per market segment.
export const GENDER_OPTIONS = [
  { value: 'male',          label: 'Male' },
  { value: 'female',        label: 'Female' },
  { value: 'other',         label: 'Other' },
  { value: 'prefer_not',    label: 'Prefer not to say' },
]

export const ID_TYPE_OPTIONS = [
  { value: 'drivers_license', label: 'Driver License' },
  { value: 'state_id',        label: 'State ID' },
  { value: 'passport',        label: 'Passport' },
  { value: 'military_id',     label: 'Military ID' },
  { value: 'permanent_resident_card', label: 'Permanent Resident Card' },
  { value: 'other',           label: 'Other' },
]

export const LEAD_TYPE_OPTIONS = [
  { value: 'walk_in',   label: 'Walk-in' },
  { value: 'internet',  label: 'Internet' },
  { value: 'phone',     label: 'Phone' },
  { value: 'referral',  label: 'Referral' },
  { value: 'trade_in',  label: 'Trade-In' },
  { value: 'repeat',    label: 'Repeat' },
  { value: 'other',     label: 'Other' },
]

export const LEAD_SOURCE_OPTIONS = [
  { value: 'website',       label: 'Website' },
  { value: 'facebook',      label: 'Facebook' },
  { value: 'instagram',     label: 'Instagram' },
  { value: 'google',        label: 'Google' },
  { value: 'craigslist',    label: 'Craigslist' },
  { value: 'newspaper',     label: 'Newspaper' },
  { value: 'radio',         label: 'Radio' },
  { value: 'tv',            label: 'TV' },
  { value: 'word_of_mouth', label: 'Word of Mouth' },
  { value: 'repeat',        label: 'Repeat Customer' },
  { value: 'trade_in',      label: 'Trade-In' },
  { value: 'other',         label: 'Other' },
]

export const CUSTOMER_STATUS_OPTIONS = [
  { value: 'new',         label: 'New' },
  { value: 'contacted',   label: 'Contacted' },
  { value: 'hot',         label: 'Hot' },
  { value: 'warm',        label: 'Warm' },
  { value: 'cold',        label: 'Cold' },
  { value: 'negotiating', label: 'Negotiating' },
  { value: 'sold',        label: 'Sold' },
  { value: 'lost',        label: 'Lost' },
  { value: 'inactive',    label: 'Inactive' },
]
