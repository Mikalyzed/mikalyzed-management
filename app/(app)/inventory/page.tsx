'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type Vehicle = {
  id: string; stockNumber: string; vin: string | null; vehicleInfo: string
  year: number | null; make: string; model: string; color: string | null
  mileage: number | null; location: string | null; askingPrice: number | null
  vehicleCost: number | null
  purchaseType: string | null; purchasedFrom: string | null; titleStatus: string | null
  dateInStock: string | null; status: string
  heroUrl: string | null
  // Flags from the API so the card can render both badges when a car is
  // simultaneously on the recon board AND out at an external repair shop.
  inRecon?: boolean
  atExternal?: boolean
}

// ─── Helpers ───────────────────────────────────────────────────────

const money = (n: number | null | undefined): string => {
  if (n === null || n === undefined) return '—'
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

function daysSince(dateString: string | null): number | null {
  if (!dateString) return null
  const ms = Date.now() - new Date(dateString).getTime()
  if (!Number.isFinite(ms) || ms < 0) return null
  return Math.floor(ms / 86400000)
}

// Aging color tint — accentuates older stock (subtler than the old badge palette)
function agingColor(days: number | null): string {
  if (days === null) return 'rgba(0,0,0,0.55)'
  if (days <= 30) return '#06a55a'
  if (days <= 60) return '#b45309'
  if (days <= 90) return '#c2410c'
  return '#dc2626'
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split('\n').filter(l => l.trim())
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim())
  return lines.slice(1).map(line => {
    const values: string[] = []
    let current = ''
    let inQuotes = false
    for (const char of line) {
      if (char === '"') { inQuotes = !inQuotes; continue }
      if (char === ',' && !inQuotes) { values.push(current.trim()); current = ''; continue }
      current += char
    }
    values.push(current.trim())
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = values[i] || '' })
    return row
  })
}

function mapRow(row: Record<string, string>) {
  return {
    vehicleInfo: row['VehicleInfo'] || '',
    vin: row['Vin'] || row[' Vin'] || '',
    stockNumber: row['StockNumber'] || row[' StockNumber'] || '',
    color: row['Color'] || row[' Color'] || '',
    mileage: row['Mileage'] || row[' Mileage'] || '',
    location: row['Location'] || row[' Location'] || '',
    askingPrice: row['AskingPrice'] || row[' AskingPrice'] || '',
    vehicleCost: row['VehicleCost'] || row[' VehicleCost'] || '',
    purchaseType: row['PurchaseType'] || row[' PurchaseType'] || '',
    purchasedFrom: row['PurchasedFrom'] || row[' PurchasedFrom'] || '',
    titleStatus: row['TitleStatus'] || row[' TitleStatus'] || '',
    dateInStock: row['DateInStock'] || row[' DateInStock'] || '',
    customStatus: row['CustomStatus'] || row[' CustomStatus'] || '',
  }
}

// ─── Filter pills (All / In Recon / Consignment / Retail) ──────────

type FilterKey = 'all' | 'in_recon' | 'consignment' | 'retail' | 'sold'

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all',         label: 'All' },
  // "In Recon" bucket now folds in cars at external repair too — the user
  // treats both as "off the lot getting work done."  Each vehicle still has
  // a single InventoryVehicle.status, so there's no double-counting.
  { key: 'in_recon',    label: 'Recon + External' },
  { key: 'consignment', label: 'Consignment' },
  { key: 'retail',      label: 'Retail' },
  // Sold lives in its own tab — these cars are excluded from the API default
  // (and the All count) but admins still need to be able to find them, e.g.,
  // to send a sold car back through recon for a quick fix before delivery.
  { key: 'sold',        label: 'Sold' },
]

function matchesFilter(v: Vehicle, key: FilterKey): boolean {
  if (key === 'all') return true
  if (key === 'in_recon') return v.status === 'in_recon' || v.status === 'external_repair'
  if (key === 'sold') return v.status === 'sold'
  const pt = (v.purchaseType || '').trim().toUpperCase()
  if (key === 'consignment') return pt === 'CONSIGNMENT'
  if (key === 'retail') return pt.length > 0 && pt !== 'CONSIGNMENT'
  return true
}

// ─── Page ──────────────────────────────────────────────────────────

export default function InventoryPage() {
  const router = useRouter()
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [resolving, setResolving] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')
  const [canSeeMoney, setCanSeeMoney] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<string | null>(null)

  useEffect(() => {
    const cookies = document.cookie.split(';').reduce((acc, c) => {
      const [k, v] = c.trim().split('=')
      acc[k] = v
      return acc
    }, {} as Record<string, string>)
    if (cookies.mm_user_role === 'admin' || cookies.mm_user_role === 'sales_manager') setCanSeeMoney(true)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 300)
    return () => clearTimeout(t)
  }, [search])

  // API counts per status — used as the source of truth for the Sold pill
  // count, which can't be derived from `vehicles` (sold cars aren't in the
  // default fetch).  Kept separately from the client-side purchaseType
  // counts (Consignment / Retail) so each pill stays accurate.
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({})

  async function load() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (searchDebounced) params.set('search', searchDebounced)
      // When the Sold tab is active, fetch sold rows directly — they're
      // excluded from the API default for everything else.
      if (filter === 'sold') params.set('status', 'sold')
      const r = await fetch(`/api/inventory?${params}`)
      const text = await r.text()
      if (!r.ok) {
        console.error('[inventory] load failed', r.status, text.slice(0, 200))
        setVehicles([])
        setTotal(0)
        return
      }
      const d = text ? JSON.parse(text) : null
      setVehicles(d?.vehicles || [])
      setTotal(d?.total || 0)
      setStatusCounts(d?.counts || {})
    } catch (e) {
      console.error('[inventory] load error', e)
      setVehicles([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [searchDebounced, filter])

  const filterCounts = useMemo(() => {
    const counts: Record<FilterKey, number> = { all: 0, in_recon: 0, consignment: 0, retail: 0, sold: 0 }
    // Status-driven counts come from the API so they stay accurate even when
    // a status-specific tab (Sold) is selected and the vehicles array no
    // longer reflects the rest of inventory.
    counts.all = statusCounts.all ?? 0
    counts.in_recon = (statusCounts.in_recon ?? 0) + (statusCounts.external_repair ?? 0)
    counts.sold = statusCounts.sold ?? 0
    // purchaseType counts still come from the loaded vehicles — when Sold is
    // active these get zeroed, but that's the right answer for the Sold view.
    for (const v of vehicles) {
      if (matchesFilter(v, 'consignment')) counts.consignment++
      if (matchesFilter(v, 'retail'))      counts.retail++
    }
    return counts
  }, [vehicles, statusCounts])

  const filtered = useMemo(() => vehicles.filter(v => matchesFilter(v, filter)), [vehicles, filter])

  async function openVehicleDetail(stockNumber: string) {
    if (resolving) return
    setResolving(stockNumber)
    try {
      const res = await fetch('/api/vehicles/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stockNumber }),
      })
      const data = await res.json()
      if (data.vehicleId) router.push(`/vehicles/${data.vehicleId}`)
    } catch {}
    setResolving(null)
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportResult(null)
    const text = await file.text()
    const parsed = parseCSV(text)
    const rows = parsed.map(mapRow)
    const res = await fetch('/api/inventory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'import', rows }),
    })
    const result = await res.json()
    const parts = [`Imported: ${result.imported}`, `Skipped: ${result.skipped}`, `Errors: ${result.errors}`]
    if (result.markedSold) parts.push(`Marked sold: ${result.markedSold}`)
    setImportResult(parts.join(' · '))
    setImporting(false)
    load()
    e.target.value = ''
  }

  return (
    <div style={{ maxWidth: 1500, margin: '0 auto', position: 'relative' }}>


      {/* ─── Header row ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 22, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
          <span style={{
            fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
            padding: '4px 12px', borderRadius: 999,
            background: 'rgba(255, 255, 255, 0.6)',
            backdropFilter: 'blur(14px) saturate(180%)',
            WebkitBackdropFilter: 'blur(14px) saturate(180%)',
            color: 'rgba(0,0,0,0.6)',
            border: '1px solid rgba(255, 255, 255, 0.6)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8)',
          }}>{total} Vehicles</span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search stock, VIN, make, model…"
            style={{
              padding: '10px 16px', borderRadius: 999,
              border: '1px solid rgba(255, 255, 255, 0.55)',
              background: 'rgba(255, 255, 255, 0.55)',
              backdropFilter: 'blur(20px) saturate(180%)',
              WebkitBackdropFilter: 'blur(20px) saturate(180%)',
              fontSize: 13, fontWeight: 500, color: '#1d1d1f',
              width: 260, outline: 'none',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7), 0 2px 8px -2px rgba(31, 38, 135, 0.08)',
            }}
          />
          <label style={{
            padding: '10px 18px', borderRadius: 999, border: 'none',
            background: '#1d1d1f', color: '#dffd6e',
            fontSize: 13, fontWeight: 600, letterSpacing: '-0.005em',
            cursor: importing ? 'wait' : 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6,
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 14px -4px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)',
            transition: 'transform 160ms ease',
          }}>
            <input type="file" accept=".csv" onChange={handleImport} style={{ display: 'none' }} />
            {importing ? 'Importing…' : 'Import CSV'}
          </label>
        </div>
      </div>

      {importResult && (
        <div style={{
          padding: '10px 16px', borderRadius: 12,
          background: 'rgba(6, 165, 90, 0.08)',
          color: '#06a55a', fontSize: 12, fontWeight: 600,
          marginBottom: 16,
          border: '1px solid rgba(6, 165, 90, 0.18)',
        }}>
          {importResult}
        </div>
      )}

      {/* ─── Filter pills ───────────────────────────────────────────── */}
      <FilterPills filters={FILTERS} counts={filterCounts} active={filter} onChange={setFilter} />

      {/* ─── Ledger ─────────────────────────────────────────────────── */}
      {loading ? (
        <p style={{ color: 'rgba(0,0,0,0.5)', textAlign: 'center', padding: 60, fontStyle: 'italic' }}>Loading…</p>
      ) : filtered.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 60,
          color: 'rgba(0,0,0,0.5)', fontStyle: 'italic', fontSize: 14,
        }}>
          {search
            ? 'No vehicles match your search.'
            : filter === 'all'
              ? 'No inventory yet. Import a CSV to get started.'
              : `No vehicles in this filter.`}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map(v => (
            <VehicleLedgerRow
              key={v.id}
              vehicle={v}
              canSeeMoney={canSeeMoney}
              resolving={resolving === v.stockNumber}
              onOpen={() => openVehicleDetail(v.stockNumber)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Fluid satin filter capsule bar ────────────────────────────────

function FilterPills({
  filters, counts, active, onChange,
}: {
  filters: { key: FilterKey; label: string }[]
  counts: Record<FilterKey, number>
  active: FilterKey
  onChange: (k: FilterKey) => void
}) {
  // Each pill auto-sizes to its content (was flex: 1 = equal widths, which
  // forced labels longer than the slot — like "Recon + External 45" — to
  // overflow leftward into the dark indicator where their gray text became
  // invisible).  Indicator position + width is measured from the active
  // button's actual offsetLeft / offsetWidth so the dark capsule always sits
  // exactly under the active label, regardless of label length.
  const containerRef = useRef<HTMLDivElement | null>(null)
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null)

  useLayoutEffect(() => {
    function measure() {
      const idx = filters.findIndex(f => f.key === active)
      const btn = buttonRefs.current[idx >= 0 ? idx : 0]
      if (!btn) return
      setIndicator({ left: btn.offsetLeft, width: btn.offsetWidth })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [active, filters])

  return (
    <div ref={containerRef} style={{
      position: 'relative',
      display: 'inline-flex',
      padding: 4,
      marginBottom: 24,
      background: 'rgba(255, 255, 255, 0.5)',
      backdropFilter: 'blur(20px) saturate(180%)',
      WebkitBackdropFilter: 'blur(20px) saturate(180%)',
      borderRadius: 999,
      border: '1px solid rgba(255, 255, 255, 0.55)',
      boxShadow: [
        '0 4px 14px -4px rgba(31, 38, 135, 0.1)',
        'inset 0 1px 0 rgba(255, 255, 255, 0.75)',
        'inset 0 0 0 0.5px rgba(255, 255, 255, 0.35)',
      ].join(', '),
      maxWidth: '100%',
    }}>
      {/* Dark satin sliding indicator — left/width measured from the active button */}
      {indicator && (
        <div aria-hidden style={{
          position: 'absolute',
          top: 4, bottom: 4,
          left: indicator.left,
          width: indicator.width,
          background: 'linear-gradient(135deg, #1d1d1f 0%, #0a0a0a 100%)',
          borderRadius: 999,
          boxShadow: [
            '0 4px 14px -2px rgba(0, 0, 0, 0.35)',
            'inset 0 1px 0 rgba(255, 255, 255, 0.12)',
            'inset 0 -1px 0 rgba(0, 0, 0, 0.3)',
          ].join(', '),
          transition: 'left 380ms cubic-bezier(0.34, 1.56, 0.64, 1), width 380ms cubic-bezier(0.34, 1.56, 0.64, 1)',
          pointerEvents: 'none',
          zIndex: 0,
        }} />
      )}

      {filters.map((f, i) => {
        const isActive = f.key === active
        const count = counts[f.key]
        return (
          <button
            key={f.key}
            ref={(el) => { buttonRefs.current[i] = el }}
            onClick={() => onChange(f.key)}
            style={{
              position: 'relative',
              zIndex: 1,
              padding: '10px 18px',
              background: 'transparent',
              border: 'none',
              fontSize: 13,
              fontWeight: 600,
              color: isActive ? '#fff' : 'rgba(0, 0, 0, 0.55)',
              cursor: 'pointer',
              minHeight: 'auto',
              letterSpacing: '-0.005em',
              transition: 'color 220ms ease',
              whiteSpace: 'nowrap',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
              flexShrink: 0,
            }}
          >
            {f.label}
            <span style={{
              fontSize: 10, fontWeight: 700,
              padding: '1px 7px', borderRadius: 999,
              background: isActive ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.06)',
              color: isActive ? '#dffd6e' : 'rgba(0,0,0,0.5)',
              letterSpacing: '-0.005em',
              lineHeight: 1.5,
            }}>{count}</span>
          </button>
        )
      })}
    </div>
  )
}

// ─── Vehicle ledger row (glassmorphic, click anywhere to open) ─────

function VehicleLedgerRow({
  vehicle: v, canSeeMoney, resolving, onOpen,
}: {
  vehicle: Vehicle
  canSeeMoney: boolean
  resolving: boolean
  onOpen: () => void
}) {
  const [hovered, setHovered] = useState(false)

  const days = daysSince(v.dateInStock)
  const dayColor = agingColor(days)

  // Status capsule
  const status = statusLabel(v.status)
  const statusTone = statusTone1(v.status)
  // Type capsule
  const typeKey = (v.purchaseType || '').trim().toUpperCase()
  const typeLabelText = typeKey === 'FLOORING' ? 'Flooring'
    : typeKey === 'CONSIGNMENT' ? 'Consignment'
    : typeKey === 'TRADE-IN' || typeKey === 'TRADE IN' ? 'Trade-in'
    : v.purchaseType || null
  const typeTone = typeTone1(typeKey)

  // VIN now has its own line in the title block, so we render the full 17-char
  // value. CSS overflow/ellipsis still handles narrow viewports.
  const vinDisplay = v.vin || '—'

  // Title gets a hard 32-char cap so wide screens don't show a sprawling
  // "1985 Mercedes-Benz 380SL Convertible Roadster…" line.  CSS still handles
  // narrower viewports via overflow/ellipsis; this just caps the upper bound.
  const fullTitle = `${v.year ? `${v.year} ` : ''}${v.make} ${v.model}`.trim()
  const titleText = fullTitle.length > 32 ? `${fullTitle.slice(0, 32).trim()}…` : fullTitle

  return (
    <div
      onClick={onOpen}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}
      style={{
        position: 'relative',
        display: 'grid',
        // Column layout (left -> right):
        //   hero | title block (year/make/model + VIN + type below)
        //        | stock | color | mileage | days held
        //        | cost | asking (money roles only)
        //        | status pill (right-aligned)
        gridTemplateColumns: canSeeMoney
          ? '156px minmax(220px, 2.4fr) 84px 76px 88px 76px 88px 104px 116px'
          : '156px minmax(220px, 3fr) 90px 80px 92px 80px 116px',
        gap: 22,
        alignItems: 'center',
        padding: '14px 18px',
        // Perf: dropped backdrop-filter blur — with ~90+ cards on screen the
        // recomposite cost was the dominant scroll-jank source. Solid
        // translucent background + the existing inset highlights still read as
        // glassy. `contain` lets the browser skip off-screen rows entirely.
        background: hovered ? 'rgba(255, 255, 255, 0.96)' : 'rgba(255, 255, 255, 0.88)',
        borderRadius: 16,
        border: '1px solid rgba(255, 255, 255, 0.7)',
        boxShadow: hovered
          ? [
              '0 14px 36px -10px rgba(31, 38, 135, 0.22)',
              '0 0 28px -8px rgba(255, 255, 255, 0.5)',
              'inset 0 1px 0 rgba(255, 255, 255, 0.85)',
              'inset 0 0 0 0.5px rgba(255, 255, 255, 0.45)',
            ].join(', ')
          : [
              '0 6px 18px -8px rgba(31, 38, 135, 0.1)',
              'inset 0 1px 0 rgba(255, 255, 255, 0.7)',
              'inset 0 0 0 0.5px rgba(255, 255, 255, 0.3)',
            ].join(', '),
        transform: hovered ? 'translateY(-2px) scale(1.004)' : 'translateY(0) scale(1)',
        transition: 'transform 260ms cubic-bezier(0.25, 0.46, 0.45, 0.94), background 220ms ease, box-shadow 260ms ease',
        cursor: resolving ? 'wait' : 'pointer',
        opacity: resolving ? 0.7 : 1,
        WebkitTapHighlightColor: 'transparent',
        outline: 'none',
        // Isolate paint + layout so off-screen rows don't trigger work when
        // the visible area scrolls. Cheap; massive scroll-perf win.
        contain: 'layout style paint',
      }}
    >
      {/* ─── Hero 16:9 thumbnail ─── */}
      <HeroThumb url={v.heroUrl} alt={`${v.year || ''} ${v.make} ${v.model}`} />

      {/* ─── Title block: Year Make Model / VIN / Type ─── */}
      <div style={{ minWidth: 0 }}>
        <p title={titleText} style={{
          fontSize: 16, fontWeight: 700, letterSpacing: '-0.015em',
          color: '#0a0a0a', lineHeight: 1.2,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {titleText}
        </p>
        <p title={vinDisplay} style={{
          fontSize: 11, color: 'rgba(0,0,0,0.5)', fontWeight: 500, marginTop: 4,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{vinDisplay}</p>
        {typeLabelText && (
          <p style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: typeTone.fg, marginTop: 4,
          }}>{typeLabelText}</p>
        )}
      </div>

      {/* ─── Stock number ─── */}
      <ColumnValue label="Stock" value={v.stockNumber} mono={false} />

      {/* ─── Color ─── */}
      <ColumnValue label="Color" value={v.color || '—'} mono={false} />

      {/* ─── Mileage ─── */}
      <ColumnValue
        label="Mileage"
        value={v.mileage ? v.mileage.toLocaleString() : '—'}
        suffix={v.mileage ? 'mi' : undefined}
      />

      {/* ─── Days Held (accented) ─── */}
      <div>
        <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.45)', marginBottom: 4 }}>Days Held</p>
        <p style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.015em', color: dayColor, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
          {days !== null ? `${days}d` : '—'}
        </p>
      </div>

      {/* ─── Pricing spread: Cost + Asking side-by-side (admin/sales_manager only) ─── */}
      {canSeeMoney && (
        <>
          <div>
            <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.45)', marginBottom: 4 }}>Cost</p>
            <p style={{ fontSize: 14, fontWeight: 500, color: 'rgba(0,0,0,0.7)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.005em' }}>
              {money(v.vehicleCost)}
            </p>
          </div>
          <div>
            <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.45)', marginBottom: 4 }}>Asking</p>
            <p style={{ fontSize: 15, fontWeight: 800, color: '#0a0a0a', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.015em' }}>
              {money(v.askingPrice)}
            </p>
          </div>
        </>
      )}

      {/* ─── Status capsule(s) — right-aligned, last column.
          When both flags are set (live recon stage AND open external repair),
          render BOTH chips stacked so the dealer can see at a glance the car
          is in two buckets at once.  Otherwise the single canonical badge
          driven by InventoryVehicle.status. */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        {v.inRecon && v.atExternal ? (
          <>
            <SatinTag tone={statusTone1('in_recon')}>In Recon</SatinTag>
            <SatinTag tone={statusTone1('external_repair')}>External</SatinTag>
          </>
        ) : (
          <SatinTag tone={statusTone}>{status}</SatinTag>
        )}
      </div>
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────

function HeroThumb({ url, alt }: { url: string | null; alt: string }) {
  // 16:9 widescreen; ~156×88 at this column width
  return (
    <div style={{
      position: 'relative',
      aspectRatio: '16 / 9',
      borderRadius: 8,
      overflow: 'hidden',
      background: url ? '#0a0a0a' : 'linear-gradient(145deg, rgba(20, 22, 30, 0.92), rgba(35, 38, 50, 0.78))',
      boxShadow: [
        'inset 0 0 0 1px rgba(255, 255, 255, 0.12)',
        'inset 0 1px 2px rgba(255, 255, 255, 0.08)',
        '0 2px 6px -2px rgba(0, 0, 0, 0.18)',
      ].join(', '),
    }}>
      {url ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={url}
          alt={alt}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CarSilhouette />
        </div>
      )}
    </div>
  )
}

function CarSilhouette() {
  return (
    <svg width="50%" height="50%" viewBox="0 0 64 32" fill="none" stroke="rgba(255,255,255,0.32)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 22 C 6 17, 12 14, 20 13 L 28 8 C 32 6, 40 6, 46 8 L 54 13 C 58 14, 60 17, 60 22 L 60 24 L 4 24 Z" />
      <circle cx="16" cy="24" r="4" fill="rgba(0,0,0,0)" />
      <circle cx="48" cy="24" r="4" fill="rgba(0,0,0,0)" />
      <path d="M28 8 L 28 13 M 40 8 L 40 13" />
    </svg>
  )
}

function ColumnValue({ label, value, suffix, mono }: { label: string; value: string; suffix?: string; mono?: boolean }) {
  return (
    <div>
      <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.45)', marginBottom: 4 }}>{label}</p>
      <p style={{
        fontSize: 13, fontWeight: 600, color: 'rgba(0,0,0,0.78)',
        letterSpacing: '-0.005em',
        fontFamily: mono ? 'ui-monospace, SFMono-Regular, monospace' : undefined,
        fontVariantNumeric: 'tabular-nums',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {value}{suffix && <span style={{ fontWeight: 500, color: 'rgba(0,0,0,0.45)', marginLeft: 3 }}>{suffix}</span>}
      </p>
    </div>
  )
}

// Soft satin capsule for status / type tags.
// minWidth keeps short labels (Sold, External) the same visual size as longer
// ones (In Recon, In Stock) so the column reads as a clean stack of equal pills.
function SatinTag({ children, tone }: { children: React.ReactNode; tone: { bg: string; fg: string; dot?: string } }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      padding: '5px 11px',
      minWidth: 92,
      fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
      textTransform: 'uppercase',
      color: tone.fg,
      background: tone.bg,
      borderRadius: 999,
      backdropFilter: 'blur(10px) saturate(180%)',
      WebkitBackdropFilter: 'blur(10px) saturate(180%)',
      border: '1px solid rgba(255, 255, 255, 0.45)',
      boxShadow: [
        '0 1px 3px rgba(0, 0, 0, 0.04)',
        'inset 0 1px 0 rgba(255, 255, 255, 0.6)',
      ].join(', '),
      boxSizing: 'border-box',
    }}>
      {tone.dot && <span aria-hidden style={{ width: 5, height: 5, borderRadius: '50%', background: tone.dot, flexShrink: 0 }} />}
      {children}
    </span>
  )
}

// ─── Status / Type tone palettes ───────────────────────────────────

function statusLabel(s: string): string {
  if (s === 'external_repair') return 'External'
  if (s === 'in_recon')        return 'In Recon'
  if (s === 'sold')            return 'Sold'
  if (s === 'in_stock')        return 'In Stock'
  return s.replace(/_/g, ' ')
}

function statusTone1(s: string): { bg: string; fg: string; dot: string } {
  switch (s) {
    case 'in_stock':        return { bg: 'rgba(6, 165, 90, 0.14)',  fg: '#06794a', dot: '#06a55a' }
    case 'in_recon':        return { bg: 'rgba(124, 58, 237, 0.14)', fg: '#5b21b6', dot: '#7c3aed' }
    case 'external_repair': return { bg: 'rgba(180, 83, 9, 0.14)',   fg: '#92400e', dot: '#b45309' }
    case 'sold':            return { bg: 'rgba(0, 0, 0, 0.08)',      fg: 'rgba(0,0,0,0.55)', dot: 'rgba(0,0,0,0.4)' }
    default:                return { bg: 'rgba(0, 0, 0, 0.06)',      fg: 'rgba(0,0,0,0.55)', dot: 'rgba(0,0,0,0.4)' }
  }
}

function typeTone1(t: string): { bg: string; fg: string; dot: string } {
  switch (t) {
    case 'FLOORING':                  return { bg: 'rgba(37, 99, 235, 0.12)', fg: '#1d4ed8', dot: '#2563eb' }
    case 'CONSIGNMENT':               return { bg: 'rgba(180, 83, 9, 0.14)',  fg: '#92400e', dot: '#b45309' }
    case 'TRADE-IN': case 'TRADE IN': return { bg: 'rgba(0, 0, 0, 0.06)',     fg: 'rgba(0,0,0,0.6)', dot: 'rgba(0,0,0,0.35)' }
    default:                          return { bg: 'rgba(0, 0, 0, 0.06)',     fg: 'rgba(0,0,0,0.6)', dot: 'rgba(0,0,0,0.35)' }
  }
}
