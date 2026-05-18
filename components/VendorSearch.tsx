'use client'

import { useState, useEffect, useRef } from 'react'

export type VendorResult = {
  id: string
  name: string
  phone: string | null
  notes: string | null
}

type Props = {
  onSelect: (vendor: VendorResult) => void
  placeholder?: string
  initialName?: string
}

export default function VendorSearch({ onSelect, placeholder = 'Search vendors…', initialName = '' }: Props) {
  const [query, setQuery] = useState(initialName)
  const [results, setResults] = useState<VendorResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!query.trim() || query.length < 1) { setResults([]); setOpen(false); return }
    setLoading(true)
    const t = setTimeout(() => {
      fetch(`/api/vendors?search=${encodeURIComponent(query)}&limit=10`)
        .then(r => r.json())
        .then(d => { setResults(d.vendors || []); setOpen(true) })
        .finally(() => setLoading(false))
    }, 200)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function select(v: VendorResult) {
    onSelect(v)
    setQuery(v.name)
    setResults([])
    setOpen(false)
  }

  async function createAndSelect() {
    const name = query.trim()
    if (!name || creating) return
    setCreating(true)
    try {
      const res = await fetch('/api/vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = await res.json()
      if (data.vendor) select(data.vendor)
    } catch {}
    setCreating(false)
  }

  const exactMatch = results.some(r => r.name.toLowerCase() === query.trim().toLowerCase())
  const showCreateOption = query.trim().length > 0 && !exactMatch && !loading

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        onFocus={() => (results.length > 0 || query.length > 0) && setOpen(true)}
        placeholder={placeholder}
        className="input"
        style={{ width: '100%' }}
      />
      {open && (results.length > 0 || showCreateOption) && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
          background: '#fff', border: '1px solid var(--border)', borderRadius: 10,
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)', zIndex: 1500, maxHeight: 300, overflowY: 'auto',
        }}>
          {results.map(v => (
            <button
              key={v.id}
              type="button"
              onClick={() => select(v)}
              style={{
                width: '100%', padding: '10px 14px', border: 'none', background: 'none',
                textAlign: 'left', cursor: 'pointer', borderBottom: '1px solid var(--border)',
                display: 'flex', flexDirection: 'column', gap: 2,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{v.name}</span>
              {v.phone && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{v.phone}</span>}
            </button>
          ))}
          {showCreateOption && (
            <button
              type="button"
              onClick={createAndSelect}
              disabled={creating}
              style={{
                width: '100%', padding: '10px 14px', border: 'none', background: '#f0fdf4',
                textAlign: 'left', cursor: creating ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 8,
                color: '#16a34a', fontSize: 13, fontWeight: 600,
                opacity: creating ? 0.6 : 1,
              }}
            >
              <span>+</span> {creating ? 'Adding…' : `Add new vendor: "${query.trim()}"`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
