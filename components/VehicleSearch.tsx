'use client'

import { useState, useEffect, useRef } from 'react'

type InventoryResult = {
  id: string; stockNumber: string; vin: string | null
  year: number | null; make: string; model: string; color: string | null
}

type Props = {
  onSelect: (vehicle: InventoryResult) => void
  placeholder?: string
}

export default function VehicleSearch({ onSelect, placeholder = 'Search by stock #, VIN, or name...' }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<InventoryResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!query.trim() || query.length < 2) { setResults([]); return }
    setLoading(true)
    const t = setTimeout(() => {
      fetch(`/api/inventory?search=${encodeURIComponent(query)}&limit=8`)
        .then(r => r.json())
        .then(d => { setResults(d.vehicles || []); setLoading(false); setOpen(true) })
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function select(v: InventoryResult) {
    onSelect(v)
    setQuery('')
    setResults([])
    setOpen(false)
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder={placeholder}
        style={{
          width: '100%', padding: '10px 14px', borderRadius: 10,
          border: '1px solid var(--border)', fontSize: 14,
        }}
      />
      {open && results.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
          background: '#fff', border: '1px solid var(--border)', borderRadius: 10,
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)', zIndex: 100, maxHeight: 300, overflowY: 'auto',
        }}>
          {results.map(v => (
            <button key={v.id} onClick={() => select(v)} style={{
              width: '100%', padding: '10px 14px', border: 'none', background: 'none',
              textAlign: 'left', cursor: 'pointer', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: 10,
            }}
              onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <div>
                <span style={{ fontSize: 14, fontWeight: 600 }}>
                  {v.year ? `${v.year} ` : ''}{v.make} {v.model}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>#{v.stockNumber}</span>
              </div>
              {v.color && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>{v.color}</span>}
            </button>
          ))}
        </div>
      )}
      {open && loading && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
          background: '#fff', border: '1px solid var(--border)', borderRadius: 10,
          padding: '12px 14px', fontSize: 13, color: 'var(--text-muted)', textAlign: 'center',
        }}>Searching...</div>
      )}
    </div>
  )
}
