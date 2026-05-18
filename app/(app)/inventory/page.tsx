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

type AskTurn = { q: string; a: string | null }

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
  const [askOpen, setAskOpen] = useState(false)
  const [askInput, setAskInput] = useState('')
  const [askTurns, setAskTurns] = useState<AskTurn[]>([])
  const [asking, setAsking] = useState(false)

  async function handleAsk() {
    const q = askInput.trim()
    if (!q || asking) return
    setAsking(true)
    // Build history from completed prior turns (skip in-flight one)
    const history = askTurns
      .filter(t => t.a !== null)
      .flatMap(t => [
        { role: 'user' as const, content: t.q },
        { role: 'assistant' as const, content: t.a! },
      ])
    setAskTurns(t => [...t, { q, a: null }])
    setAskInput('')
    try {
      const res = await fetch('/api/inventory/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, history }),
      })
      const data = await res.json()
      const answer = data.answer || data.error || 'No response.'
      setAskTurns(t => t.map((turn, i) => i === t.length - 1 ? { ...turn, a: answer } : turn))
    } catch (e: any) {
      setAskTurns(t => t.map((turn, i) => i === t.length - 1 ? { ...turn, a: `Error: ${e.message}` } : turn))
    } finally {
      setAsking(false)
    }
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
            display: 'grid', gridTemplateColumns: '100px 2fr 160px 90px 90px 120px 130px',
            borderBottom: '1px solid var(--border)', background: '#f9fafb',
            fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em',
          }}>
            {['Stock #', 'Vehicle', 'VIN', 'Color', 'Miles', 'Status', 'Type'].map((h, i) => (
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

            return (
              <div key={v.id} style={{
                display: 'grid', gridTemplateColumns: '100px 2fr 160px 90px 90px 120px 130px',
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
      )}

      {/* Ask AI floating button + panel */}
      {!askOpen && (
        <button
          onClick={() => setAskOpen(true)}
          aria-label="Ask AI about inventory"
          style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 50,
            background: '#1a1a1a', color: '#dffd6e',
            border: 'none', borderRadius: 999,
            padding: '12px 18px', fontSize: 14, fontWeight: 600,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
            boxShadow: '0 6px 20px rgba(0,0,0,0.18)',
          }}
        >
          <span style={{ fontSize: 16 }}>✦</span> Ask AI
        </button>
      )}

      {askOpen && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 50,
          width: 380, maxHeight: 'calc(100vh - 48px)',
          background: '#fff', border: '1px solid var(--border)', borderRadius: 12,
          boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{
            padding: '12px 16px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: '#1a1a1a', color: '#fff',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600 }}>
              <span style={{ color: '#dffd6e' }}>✦</span> Ask AI about inventory
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {askTurns.length > 0 && (
                <button
                  onClick={() => setAskTurns([])}
                  aria-label="New chat"
                  title="New chat"
                  style={{
                    background: 'none', border: 'none', color: '#dffd6e',
                    cursor: 'pointer', fontSize: 12, fontWeight: 600,
                    padding: '4px 8px', borderRadius: 6,
                  }}
                >New chat</button>
              )}
              <button
                onClick={() => setAskOpen(false)}
                aria-label="Close"
                style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 4px' }}
              >×</button>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 200, maxHeight: 420 }}>
            {askTurns.length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Try:
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[
                    'How many flooring vehicles are in external repair or recon?',
                    'List all consignment vehicles in stock.',
                    'What is the average mileage of in-stock vehicles?',
                    'Which vehicles have been in stock the longest?',
                  ].map(s => (
                    <button
                      key={s}
                      onClick={() => setAskInput(s)}
                      style={{
                        textAlign: 'left', background: '#f9fafb', border: '1px solid var(--border)',
                        borderRadius: 6, padding: '6px 10px', fontSize: 12, cursor: 'pointer',
                        color: 'var(--text-secondary)',
                      }}
                    >{s}</button>
                  ))}
                </div>
              </div>
            )}
            {askTurns.map((turn, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{
                  alignSelf: 'flex-end', maxWidth: '85%',
                  background: '#1a1a1a', color: '#fff',
                  padding: '8px 12px', borderRadius: 12, borderBottomRightRadius: 4,
                  fontSize: 13, lineHeight: 1.45,
                }}>{turn.q}</div>
                <div style={{
                  alignSelf: 'flex-start', maxWidth: '92%',
                  background: '#f3f4f6', color: 'var(--text-primary)',
                  padding: '8px 12px', borderRadius: 12, borderBottomLeftRadius: 4,
                  fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap',
                }}>{turn.a === null ? <span style={{ color: 'var(--text-muted)' }}>Thinking…</span> : turn.a}</div>
              </div>
            ))}
          </div>

          <div style={{ padding: 12, borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
            <input
              value={askInput}
              onChange={e => setAskInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAsk() } }}
              placeholder="Ask about your inventory…"
              disabled={asking}
              style={{
                flex: 1, padding: '8px 12px', borderRadius: 8,
                border: '1px solid var(--border)', fontSize: 13,
              }}
            />
            <button
              onClick={handleAsk}
              disabled={asking || !askInput.trim()}
              style={{
                background: '#1a1a1a', color: '#dffd6e', border: 'none',
                borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600,
                cursor: asking || !askInput.trim() ? 'not-allowed' : 'pointer',
                opacity: asking || !askInput.trim() ? 0.6 : 1,
              }}
            >{asking ? '…' : 'Send'}</button>
          </div>
        </div>
      )}
    </div>
  )
}
