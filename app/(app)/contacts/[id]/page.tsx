'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { LEAD_SOURCE_LABELS, LEAD_SOURCE_COLORS } from '@/lib/crm'

type ContactDetail = {
  id: string; firstName: string; lastName: string; email: string | null; phone: string | null
  secondaryPhone: string | null; address: string | null; city: string | null; state: string | null; zip: string | null
  source: string; tags: string[]; notes: string | null; createdAt: string
  createdBy: { id: string; name: string } | null
  opportunities: Array<{
    id: string; source: string; vehicleInterest: string | null; createdAt: string
    pipeline: { id: string; name: string; color: string }
    stage: { id: string; name: string; type: string }
    assignee: { id: string; name: string } | null
    vehicle: { id: string; stockNumber: string; year: number; make: string; model: string } | null
  }>
}

export default function ContactDetailPage() {
  const { id } = useParams()
  const [contact, setContact] = useState<ContactDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/contacts/${id}`).then(r => r.json()).then(d => { setContact(d); setLoading(false) })
  }, [id])

  if (loading) return <p style={{ color: 'var(--text-muted)', padding: 40, textAlign: 'center' }}>Loading...</p>
  if (!contact) return <p style={{ color: 'var(--text-muted)', padding: 40, textAlign: 'center' }}>Not found</p>

  const sourceColor = LEAD_SOURCE_COLORS[contact.source as keyof typeof LEAD_SOURCE_COLORS] || '#6b7280'

  return (
    <div style={{ maxWidth: 600 }}>
      <Link href="/contacts" style={{ fontSize: 14, color: 'var(--text-muted)', textDecoration: 'none', fontWeight: 500, display: 'inline-block', marginBottom: 20, minHeight: 'auto' }}>
        ← Back to Contacts
      </Link>

      {/* Contact card */}
      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%', background: '#1a1a1a', color: '#dffd6e',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 700, flexShrink: 0,
          }}>
            {contact.firstName.charAt(0)}{contact.lastName.charAt(0)}
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>
              {contact.firstName} {contact.lastName}
            </h1>
            <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, background: sourceColor + '15', color: sourceColor }}>
              {LEAD_SOURCE_LABELS[contact.source as keyof typeof LEAD_SOURCE_LABELS] || contact.source}
            </span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
          {contact.phone && (
            <div>
              <div className="form-label">Phone</div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{contact.phone}</div>
            </div>
          )}
          {contact.secondaryPhone && (
            <div>
              <div className="form-label">Secondary Phone</div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{contact.secondaryPhone}</div>
            </div>
          )}
          {contact.email && (
            <div>
              <div className="form-label">Email</div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{contact.email}</div>
            </div>
          )}
          {(contact.address || contact.city) && (
            <div>
              <div className="form-label">Address</div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>
                {[contact.address, contact.city, contact.state, contact.zip].filter(Boolean).join(', ')}
              </div>
            </div>
          )}
          <div>
            <div className="form-label">Created</div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>
              {new Date(contact.createdAt).toLocaleDateString()}
              {contact.createdBy && ` by ${contact.createdBy.name}`}
            </div>
          </div>
        </div>

        {contact.notes && (
          <div style={{ marginTop: 16, padding: 14, background: 'var(--bg-primary)', borderRadius: 10 }}>
            <div className="form-label">Notes</div>
            <p style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--text-secondary)' }}>{contact.notes}</p>
          </div>
        )}

        {contact.tags.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
            {contact.tags.map(tag => (
              <span key={tag} style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, background: '#f0f0ec', color: 'var(--text-secondary)' }}>
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Opportunities */}
      <div className="section-label" style={{ marginBottom: 12 }}>
        Opportunities ({contact.opportunities.length})
      </div>
      {contact.opportunities.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>
          No opportunities yet
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {contact.opportunities.map(opp => (
            <Link key={opp.id} href={`/leads/${opp.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="card" style={{ padding: '14px 18px', borderLeft: `4px solid ${opp.pipeline.color}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: opp.pipeline.color }}>{opp.pipeline.name}</span>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                    background: opp.stage.type === 'won' ? '#f0fdf4' : opp.stage.type === 'lost' ? '#fef2f2' : '#f5f5f3',
                    color: opp.stage.type === 'won' ? '#16a34a' : opp.stage.type === 'lost' ? '#ef4444' : 'var(--text-secondary)',
                  }}>{opp.stage.name}</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  {opp.vehicle ? `${opp.vehicle.year} ${opp.vehicle.make} ${opp.vehicle.model}` : opp.vehicleInterest || 'General inquiry'}
                  {opp.assignee && ` · ${opp.assignee.name}`}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
