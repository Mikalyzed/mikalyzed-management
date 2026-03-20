'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { LEAD_SOURCE_LABELS, LEAD_SOURCE_COLORS } from '@/lib/crm'

type Contact = {
  id: string; firstName: string; lastName: string; email: string | null; phone: string | null
  source: string; tags: string[]; createdAt: string
  _count: { opportunities: number }
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    setLoading(true)
    const params = searchDebounced ? `?search=${encodeURIComponent(searchDebounced)}` : ''
    fetch(`/api/contacts${params}`).then(r => r.json()).then(d => {
      setContacts(d.contacts || [])
      setTotal(d.total || 0)
      setLoading(false)
    })
  }, [searchDebounced])

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>Contacts</h1>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 4 }}>{total} contacts</p>
        </div>
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, email, or phone..."
        className="input" style={{ marginBottom: 20, maxWidth: 400 }} />

      {loading ? (
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>Loading...</p>
      ) : contacts.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          {search ? 'No contacts match your search.' : 'No contacts yet. Create a lead to add a contact.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {contacts.map(c => {
            const sourceColor = LEAD_SOURCE_COLORS[c.source as keyof typeof LEAD_SOURCE_COLORS] || '#6b7280'
            return (
              <Link key={c.id} href={`/contacts/${c.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="card" style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', background: '#1a1a1a', color: '#dffd6e',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 700, flexShrink: 0,
                  }}>
                    {c.firstName.charAt(0)}{c.lastName.charAt(0)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>{c.firstName} {c.lastName}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                      {c.phone && <span>{c.phone}</span>}
                      {c.phone && c.email && <span> · </span>}
                      {c.email && <span>{c.email}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {c._count.opportunities > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', background: '#f0f0ec', padding: '2px 8px', borderRadius: 6 }}>
                        {c._count.opportunities} opp{c._count.opportunities !== 1 ? 's' : ''}
                      </span>
                    )}
                    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: sourceColor + '15', color: sourceColor }}>
                      {LEAD_SOURCE_LABELS[c.source as keyof typeof LEAD_SOURCE_LABELS] || c.source}
                    </span>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
