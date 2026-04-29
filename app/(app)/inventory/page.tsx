'use client'

import { useEffect, useState } from 'react'

type Vehicle = {
  id: string; stockNumber: string; vin: string | null; vehicleInfo: string
  year: number | null; make: string; model: string; color: string | null
  mileage: number | null; location: string | null; askingPrice: number | null
  purchaseType: string | null; purchasedFrom: string | null; titleStatus: string | null
  dateInStock: string | null; status: string
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
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [total, setTotal] = useState(0)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<string | null>(null)

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>Inventory</h1>
          <span style={{ fontSize: 13, fontWeight: 600, padding: '4px 12px', borderRadius: 20, background: '#eff6ff', color: '#2563eb' }}>
            {total} Vehicles
          </span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search inventory..."
            style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, width: 220 }} />
          <label style={{
            padding: '8px 16px', borderRadius: 8, border: 'none',
            background: '#1a1a1a', color: '#dffd6e', fontSize: 14, fontWeight: 600,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
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
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border)' }}>
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
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, overflow: 'auto' }}>
          {/* Table header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '100px 2fr 160px 90px 90px 130px',
            borderBottom: '1px solid var(--border)', background: '#f9fafb',
            fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em',
          }}>
            {['Stock #', 'Vehicle', 'VIN', 'Color', 'Miles', 'Status'].map((h, i) => (
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
            return (
              <div key={v.id} style={{
                display: 'grid', gridTemplateColumns: '100px 2fr 160px 90px 90px 130px',
                borderBottom: '1px solid var(--border)', fontSize: 13, alignItems: 'center',
              }}>
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
                    fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 4,
                    background: statusColors.bg, color: statusColors.fg,
                  }}>{statusLabel}</span>
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
