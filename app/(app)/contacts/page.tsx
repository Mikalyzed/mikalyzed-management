'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

type Contact = {
  id: string; firstName: string; lastName: string; email: string | null; phone: string | null
  source: string; tags: string[]; createdAt: string
  _count: { opportunities: number }
}

const TAG_COLORS: Record<string, string> = {
  'website lead': '#3b82f6',
  'auto trader classics': '#f59e0b',
  'hemmings': '#8b5cf6',
  'carsforsale.com': '#06b6d4',
  'facebook': '#1d4ed8',
  'email': '#22c55e',
  'sales': '#ef4444',
  'name via lookup': '#ec4899',
}

function initialsColor(name: string) {
  const colors = ['#94a3b8', '#a78bfa', '#67e8f9', '#fbbf24', '#f87171', '#4ade80', '#fb923c', '#c084fc']
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

function formatTimeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `${minutes} minutes ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hours ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days > 1 ? 's' : ''} ago`
}

export default function ContactsPage() {
  const router = useRouter()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')
  const [page, setPage] = useState(1)
  const perPage = 50

  // Resizable columns
  const defaultWidths = [200, 140, 200, 110, 110, 140]
  const [colWidths, setColWidths] = useState(defaultWidths)
  const resizingCol = useRef<number | null>(null)
  const startX = useRef(0)
  const startWidth = useRef(0)

  const onMouseDown = useCallback((colIdx: number, e: React.MouseEvent) => {
    e.preventDefault()
    resizingCol.current = colIdx
    startX.current = e.clientX
    startWidth.current = colWidths[colIdx]

    const onMouseMove = (e: MouseEvent) => {
      if (resizingCol.current === null) return
      const diff = e.clientX - startX.current
      const newWidth = Math.max(60, startWidth.current + diff)
      setColWidths(prev => prev.map((w, i) => i === resizingCol.current ? newWidth : w))
    }

    const onMouseUp = () => {
      resizingCol.current = null
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [colWidths])

  const gridTemplate = colWidths.map(w => `${w}px`).join(' ')

  useEffect(() => {
    const t = setTimeout(() => { setSearchDebounced(search); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (searchDebounced) params.set('search', searchDebounced)
    params.set('limit', String(perPage))
    params.set('offset', String((page - 1) * perPage))
    fetch(`/api/contacts?${params}`).then(r => r.json()).then(d => {
      setContacts(d.contacts || [])
      setTotal(d.total || 0)
      setLoading(false)
    })
  }, [searchDebounced, page])

  const totalPages = Math.ceil(total / perPage)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>Contacts</h1>
          <span style={{ fontSize: 13, fontWeight: 600, padding: '4px 12px', borderRadius: 20, background: '#eff6ff', color: '#2563eb' }}>
            {total} Contacts
          </span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search Contacts"
            style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, width: 220 }} />
          <Link href="/leads/new" style={{
            padding: '8px 16px', borderRadius: 8, border: 'none',
            background: '#1a1a1a', color: '#dffd6e', fontSize: 14, fontWeight: 600,
            textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6,
          }}>
            + Add Contact
          </Link>
        </div>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>Loading...</p>
      ) : contacts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          {search ? 'No contacts match your search.' : 'No contacts yet.'}
        </div>
      ) : (
        <>
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, overflow: 'auto' }}>
            {/* Table header */}
            <div style={{
              display: 'grid', gridTemplateColumns: gridTemplate, minWidth: 'max-content',
              borderBottom: '1px solid var(--border)', background: '#f9fafb',
              fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em',
            }}>
              {['Contact name', 'Phone', 'Email', 'Created', 'Opportunities', 'Tags'].map((label, i) => (
                <span key={label} style={{
                  padding: '10px 12px', borderLeft: i > 0 ? '1px solid var(--border)' : 'none',
                  position: 'relative', userSelect: 'none',
                  paddingLeft: i === 0 ? 20 : 12,
                }}>
                  {label}
                  <span
                    onMouseDown={e => onMouseDown(i, e)}
                    style={{
                      position: 'absolute', right: 0, top: 0, bottom: 0, width: 6,
                      cursor: 'col-resize', background: 'transparent',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#d1d5db'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  />
                </span>
              ))}
            </div>

            {/* Table rows */}
            {contacts.map(c => {
              const fullName = `${c.firstName} ${c.lastName}`
              const bgColor = initialsColor(fullName)
              return (
                <div key={c.id} onClick={() => router.push(`/contacts/${c.id}`)} style={{
                  display: 'grid', gridTemplateColumns: gridTemplate, minWidth: 'max-content',
                  borderBottom: '1px solid var(--border)',
                  cursor: 'pointer', alignItems: 'center',
                  transition: 'background 0.1s',
                }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                  onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                >
                  {/* Name */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 20px' }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%', background: bgColor, color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 700, flexShrink: 0,
                    }}>
                      {c.firstName.charAt(0)}{c.lastName.charAt(0)}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{fullName}</span>
                  </div>

                  {/* Phone */}
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '8px 12px', borderLeft: '1px solid var(--border)' }}>{c.phone || '—'}</span>

                  {/* Email */}
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '8px 12px', borderLeft: '1px solid var(--border)' }}>
                    {c.email || '—'}
                  </span>

                  {/* Created */}
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 12px', borderLeft: '1px solid var(--border)' }}>
                    {new Date(c.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>

                  {/* Opportunities */}
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '8px 12px', borderLeft: '1px solid var(--border)' }}>
                    {c._count.opportunities > 0 ? `${c._count.opportunities} opp${c._count.opportunities > 1 ? 's' : ''}` : '—'}
                  </span>

                  {/* Tags */}
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', padding: '8px 12px', borderLeft: '1px solid var(--border)' }}>
                    {c.tags.map(tag => {
                      const color = TAG_COLORS[tag.toLowerCase()] || '#6b7280'
                      return (
                        <span key={tag} style={{
                          fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                          background: color + '15', color,
                          whiteSpace: 'nowrap',
                        }}>{tag}</span>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, fontSize: 13 }}>
              <span style={{ color: 'var(--text-muted)' }}>
                Page {page} of {totalPages}
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  style={{
                    padding: '6px 14px', borderRadius: 6, border: '1px solid var(--border)',
                    background: '#fff', fontSize: 13, cursor: page === 1 ? 'default' : 'pointer',
                    opacity: page === 1 ? 0.4 : 1,
                  }}>Prev</button>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  style={{
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
