'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type Vehicle = {
  id: string; stockNumber: string; vin: string | null; vehicleInfo: string
  year: number | null; make: string; model: string; color: string | null
  mileage: number | null; location: string | null; askingPrice: number | null
  vehicleCost: number | null
  purchaseType: string | null; purchasedFrom: string | null; titleStatus: string | null
  dateInStock: string | null; status: string
}

// Aging color coding (0-30 green, 31-60 yellow, 61-90 orange, 90+ red)
function agingColor(days: number | null): { bg: string; fg: string; label: string } {
  if (days === null) return { bg: '#f3f4f6', fg: '#6b7280', label: '—' }
  if (days <= 30) return { bg: '#dcfce7', fg: '#16a34a', label: `${days}d` }
  if (days <= 60) return { bg: '#fef3c7', fg: '#b45309', label: `${days}d` }
  if (days <= 90) return { bg: '#fed7aa', fg: '#c2410c', label: `${days}d` }
  return { bg: '#fee2e2', fg: '#991b1b', label: `${days}d` }
}

const moneyShort = (n: number | null | undefined) => {
  if (n === null || n === undefined) return '—'
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`
  return `$${Math.round(n)}`
}

// Demo flooring math — 0.025% daily on cost
function costPerDay(cost: number | null): number | null {
  if (cost === null || cost === undefined) return null
  return Math.round(cost * 0.00025 * 100) / 100
}

function daysSince(dateString: string | null): number | null {
  if (!dateString) return null
  const ms = Date.now() - new Date(dateString).getTime()
  if (!Number.isFinite(ms) || ms < 0) return null
  return Math.floor(ms / 86400000)
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split('\n').filter(l => l.trim())
  if (lines.length < 2) return []

  // Parse header - handle spaces after commas
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

const STATUS_TABS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'in_stock', label: 'In Stock' },
  { key: 'in_recon', label: 'In Recon' },
  { key: 'external_repair', label: 'External Repair' },
  { key: 'sold', label: 'Sold' },
  { key: 'removed', label: 'Removed' },
]

export default function InventoryPage() {
  const router = useRouter()
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [resolving, setResolving] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [canSeeMoney, setCanSeeMoney] = useState(false)

  useEffect(() => {
    const cookies = document.cookie.split(';').reduce((acc, c) => {
      const [k, v] = c.trim().split('=')
      acc[k] = v
      return acc
    }, {} as Record<string, string>)
    if (cookies.mm_user_role === 'admin' || cookies.mm_user_role === 'sales_manager') setCanSeeMoney(true)
  }, [])
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<string | null>(null)

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

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 300)
    return () => clearTimeout(t)
  }, [search])

  function load() {
    setLoading(true)
    const params = new URLSearchParams()
    if (searchDebounced) params.set('search', searchDebounced)
    if (statusFilter !== 'all') params.set('status', statusFilter)
    fetch(`/api/inventory?${params}`).then(r => r.json()).then(d => {
      setVehicles(d.vehicles || [])
      setTotal(d.total || 0)
      setCounts(d.counts || {})
      setLoading(false)
    })
  }

  useEffect(() => { load() }, [searchDebounced, statusFilter])

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
    const parts = [
      `Imported: ${result.imported}`,
      `Skipped: ${result.skipped}`,
      `Errors: ${result.errors}`,
    ]
    if (result.markedSold) parts.push(`Marked sold: ${result.markedSold}`)
    setImportResult(parts.join(' · '))
    setImporting(false)
    load()
    e.target.value = ''
  }

  return (
    <div>
      <div className="inventory-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>Inventory</h1>
          <span style={{ fontSize: 13, fontWeight: 600, padding: '4px 12px', borderRadius: 20, background: '#eff6ff', color: '#2563eb' }}>
            {total} Vehicles
          </span>
        </div>
        <div className="inventory-controls" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search inventory..."
            className="inventory-search"
            style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, width: 220 }} />
          <label className="inventory-import-btn" style={{
            padding: '8px 16px', borderRadius: 8, border: 'none',
            background: '#1a1a1a', color: '#dffd6e', fontSize: 14, fontWeight: 600,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
            whiteSpace: 'nowrap',
          }}>
            <input type="file" accept=".csv" onChange={handleImport} style={{ display: 'none' }} />
            {importing ? 'Importing...' : 'Import CSV'}
          </label>
        </div>
      </div>

      {importResult && (
        <div style={{ padding: '10px 16px', borderRadius: 8, background: '#f0fdf4', color: '#16a34a', fontSize: 13, marginBottom: 16, border: '1px solid #bbf7d0' }}>
          {importResult}
        </div>
      )}

      {/* Status tabs */}
      <div className="inventory-tabs" style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border)', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {STATUS_TABS.map(tab => {
          const active = statusFilter === tab.key
          const count = counts[tab.key] ?? 0
          return (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              style={{
                padding: '10px 14px', borderRadius: '8px 8px 0 0',
                border: 'none', background: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 600,
                color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                borderBottom: active ? '2px solid #1a1a1a' : '2px solid transparent',
                marginBottom: -1,
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              {tab.label}
              <span style={{
                fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 100,
                background: active ? '#1a1a1a' : 'var(--border)',
                color: active ? '#dffd6e' : 'var(--text-muted)',
              }}>{count}</span>
            </button>
          )
        })}
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>Loading...</p>
      ) : vehicles.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          {search ? 'No vehicles match your search.' : 'No inventory yet. Import a CSV to get started.'}
        </div>
      ) : (
        <>
        {/* Mobile card list */}
        <div className="mobile-only">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {vehicles.map(v => {
            const statusLabel = v.status === 'external_repair' ? 'External Repair'
              : v.status === 'in_recon' ? 'In Recon'
              : v.status === 'sold' ? 'Sold'
              : 'In Inventory'
            const statusColors = v.status === 'external_repair' ? { bg: '#fef3c7', fg: '#b45309' }
              : v.status === 'in_recon' ? { bg: '#ede9fe', fg: '#7c3aed' }
              : v.status === 'sold' ? { bg: '#f3f4f6', fg: '#6b7280' }
              : { bg: '#dcfce7', fg: '#15803d' }

            const typeKey = (v.purchaseType || '').trim().toUpperCase()
            const typeLabel = typeKey === 'FLOORING' ? 'Flooring'
              : typeKey === 'CONSIGNMENT' ? 'Consignment'
              : typeKey === 'TRADE-IN' || typeKey === 'TRADE IN' ? 'Trade-in'
              : v.purchaseType || null

            const aged = v.dateInStock
              ? Math.max(0, Math.floor((Date.now() - new Date(v.dateInStock).getTime()) / 86400000))
              : null
            const vinMasked = v.vin && v.vin.length > 6 ? `*****${v.vin.slice(-6)}` : (v.vin || '—')

            return (
              <div
                key={v.id}
                onClick={() => openVehicleDetail(v.stockNumber)}
                style={{
                  background: '#fff', border: '1px solid var(--border)', borderRadius: 14,
                  padding: 18,
                  cursor: resolving === v.stockNumber ? 'wait' : 'pointer',
                  opacity: resolving === v.stockNumber ? 0.6 : 1,
                  WebkitTapHighlightColor: 'transparent',
                  transition: 'transform 0.12s ease',
                }}
                onTouchStart={e => (e.currentTarget.style.transform = 'scale(0.985)')}
                onTouchEnd={e => (e.currentTarget.style.transform = '')}
              >
                {/* Title row — name (truncates) + status badge */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  marginBottom: 14,
                }}>
                  <p style={{
                    flex: 1, minWidth: 0,
                    fontSize: 14, fontWeight: 600, letterSpacing: '-0.005em',
                    textTransform: 'uppercase', lineHeight: 1.25,
                    color: '#2563eb',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {v.year ? `${v.year} ` : ''}{v.make} {v.model}
                  </p>
                  <span style={{
                    flexShrink: 0,
                    fontSize: 10, fontWeight: 700,
                    padding: '3px 9px', borderRadius: 100,
                    background: statusColors.bg, color: statusColors.fg,
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                  }}>{statusLabel}</span>
                </div>

                {/* Stats row */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
                  borderTop: '1px solid var(--border)',
                  borderBottom: '1px solid var(--border)',
                  padding: '14px 0',
                  marginBottom: 14,
                }}>
                  <div style={{ borderRight: '1px solid var(--border)', paddingRight: 10 }}>
                    <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Mileage</p>
                    <p style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{v.mileage ? `${v.mileage.toLocaleString()} mi` : '—'}</p>
                  </div>
                  <div style={{ borderRight: '1px solid var(--border)', paddingLeft: 12, paddingRight: 10 }}>
                    <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Price</p>
                    <p style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{v.askingPrice ? `$${v.askingPrice.toLocaleString()}` : '$ —'}</p>
                  </div>
                  <div style={{ paddingLeft: 12 }}>
                    <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Type</p>
                    <p style={{ fontSize: 13, fontWeight: 700 }}>{typeLabel || '—'}</p>
                  </div>
                </div>

                {/* Meta footer — 2-column grid */}
                <div style={{
                  fontSize: 11, color: 'var(--text-muted)',
                  display: 'grid', gridTemplateColumns: '1fr 1fr',
                  columnGap: 14, rowGap: 6,
                }}>
                  <span><span style={{ color: 'var(--text-muted)' }}>STOCK #:</span> <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{v.stockNumber}</span></span>
                  <span><span style={{ color: 'var(--text-muted)' }}>VIN:</span> <span style={{ color: 'var(--text-primary)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{vinMasked}</span></span>
                  <span><span style={{ color: 'var(--text-muted)' }}>COLOR:</span> <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{(v.color || '—').toUpperCase()}</span></span>
                  {aged !== null && (
                    <span><span style={{ color: 'var(--text-muted)' }}>AGED:</span> <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{aged} day{aged === 1 ? '' : 's'}</span></span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        </div>

        {/* Desktop table */}
        <div className="desktop-only" style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, overflow: 'auto' }}>
          {/* Table header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: canSeeMoney
              ? '95px 1.5fr 140px 75px 75px 75px 85px 100px 105px 105px'
              : '95px 1.7fr 145px 80px 80px 80px 110px 110px',
            borderBottom: '1px solid var(--border)', background: '#f9fafb',
            fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em',
          }}>
            {(canSeeMoney
              ? ['Stock #', 'Vehicle', 'VIN', 'Color', 'Miles', 'Days', 'Cost/Day', 'Asking', 'Status', 'Type']
              : ['Stock #', 'Vehicle', 'VIN', 'Color', 'Miles', 'Days', 'Status', 'Type']
            ).map((h, i) => (
              <span key={h} style={{ padding: '10px 12px', borderLeft: i > 0 ? '1px solid var(--border)' : 'none' }}>{h}</span>
            ))}
          </div>

          {/* Rows */}
          {vehicles.map(v => {
            const statusLabel = v.status === 'external_repair' ? 'External Repair'
              : v.status === 'in_recon' ? 'In Recon'
              : v.status === 'sold' ? 'Sold'
              : 'In Stock'
            const statusColors = v.status === 'external_repair' ? { bg: '#fef3c7', fg: '#b45309' }
              : v.status === 'in_recon' ? { bg: '#ede9fe', fg: '#7c3aed' }
              : v.status === 'sold' ? { bg: '#f3f4f6', fg: '#6b7280' }
              : { bg: '#dcfce7', fg: '#16a34a' }

            const typeKey = (v.purchaseType || '').trim().toUpperCase()
            const typeLabel = typeKey === 'FLOORING' ? 'Flooring'
              : typeKey === 'CONSIGNMENT' ? 'Consignment'
              : typeKey === 'TRADE-IN' || typeKey === 'TRADE IN' ? 'Trade-in'
              : v.purchaseType || null
            const typeColors = typeKey === 'FLOORING' ? { bg: '#dbeafe', fg: '#1d4ed8' }
              : typeKey === 'CONSIGNMENT' ? { bg: '#fef3c7', fg: '#b45309' }
              : typeKey === 'TRADE-IN' || typeKey === 'TRADE IN' ? { bg: '#f3f4f6', fg: '#6b7280' }
              : { bg: '#f3f4f6', fg: '#6b7280' }

            const days = daysSince(v.dateInStock)
            const aging = agingColor(days)
            const perDay = costPerDay(v.vehicleCost)

            return (
              <div
                key={v.id}
                onClick={() => openVehicleDetail(v.stockNumber)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: canSeeMoney
                    ? '95px 1.5fr 140px 75px 75px 75px 85px 100px 105px 105px'
                    : '95px 1.7fr 145px 80px 80px 80px 110px 110px',
                  borderBottom: '1px solid var(--border)', fontSize: 13, alignItems: 'center',
                  cursor: resolving === v.stockNumber ? 'wait' : 'pointer',
                  opacity: resolving === v.stockNumber ? 0.6 : 1,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}
              >
                <span style={{ padding: '8px 12px', fontWeight: 600 }}>{v.stockNumber}</span>
                <span style={{ padding: '8px 12px', borderLeft: '1px solid var(--border)' }}>
                  {v.year ? `${v.year} ` : ''}{v.make} {v.model}
                </span>
                <span style={{ padding: '8px 12px', borderLeft: '1px solid var(--border)', fontSize: 11, color: 'var(--text-muted)' }}>
                  {v.vin || '—'}
                </span>
                <span style={{ padding: '8px 12px', borderLeft: '1px solid var(--border)', color: 'var(--text-secondary)' }}>{v.color || '—'}</span>
                <span style={{ padding: '8px 12px', borderLeft: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                  {v.mileage ? v.mileage.toLocaleString() : '—'}
                </span>
                <span style={{ padding: '8px 12px', borderLeft: '1px solid var(--border)' }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4, whiteSpace: 'nowrap',
                    background: aging.bg, color: aging.fg,
                  }}>{aging.label}</span>
                </span>
                {canSeeMoney && (
                  <span style={{ padding: '8px 12px', borderLeft: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 12 }}>
                    {perDay !== null ? moneyShort(perDay) : '—'}
                  </span>
                )}
                {canSeeMoney && (
                  <span style={{ padding: '8px 12px', borderLeft: '1px solid var(--border)', fontWeight: 700, fontSize: 13 }}>
                    {v.askingPrice ? moneyShort(v.askingPrice) : '—'}
                  </span>
                )}
                <span style={{ padding: '8px 12px', borderLeft: '1px solid var(--border)' }}>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 4, whiteSpace: 'nowrap',
                    background: statusColors.bg, color: statusColors.fg,
                  }}>{statusLabel}</span>
                </span>
                <span style={{ padding: '8px 12px', borderLeft: '1px solid var(--border)' }}>
                  {typeLabel ? (
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 4, whiteSpace: 'nowrap',
                      background: typeColors.bg, color: typeColors.fg,
                    }}>{typeLabel}</span>
                  ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                </span>
              </div>
            )
          })}
        </div>
        </>
      )}

    </div>
  )
}
