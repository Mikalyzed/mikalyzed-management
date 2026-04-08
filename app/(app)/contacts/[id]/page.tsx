'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

type ContactDetail = {
  id: string; firstName: string; lastName: string; email: string | null; phone: string | null
  secondaryPhone: string | null; dateOfBirth: string | null; contactType: string
  address: string | null; city: string | null; state: string | null; zip: string | null
  country: string | null; website: string | null; timezone: string | null
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

type Message = {
  id: string; direction: string; channel: string; body: string; mediaUrl: string | null
  status: string; createdAt: string; sender: { id: string; name: string } | null
}

export default function ContactDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const [contact, setContact] = useState<ContactDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [messages, setMessages] = useState<Message[]>([])
  const [msgText, setMsgText] = useState('')
  const [sending, setSending] = useState(false)
  const [msgTab, setMsgTab] = useState<'sms' | 'email' | 'internal'>('sms')
  const [rightTab, setRightTab] = useState<'activity' | 'notes' | 'tasks' | 'appointments'>('activity')
  const [activities, setActivities] = useState<any[]>([])
  const [oppNotes, setOppNotes] = useState<any[]>([])
  const [oppTasks, setOppTasks] = useState<any[]>([])
  const [newNote, setNewNote] = useState('')
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskDue, setNewTaskDue] = useState('')
  const [savingRight, setSavingRight] = useState(false)
  const [sections, setSections] = useState<Record<string, boolean>>({ contact: true, general: false })
  const [editing, setEditing] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(`/api/contacts/${id}`).then(r => r.json()).then(d => { setContact(d); setLoading(false) })
  }, [id])

  function loadMessages() {
    fetch(`/api/messages?contactId=${id}`).then(r => r.json()).then(d => {
      setMessages(d.messages || [])
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    })
  }

  useEffect(() => {
    loadMessages()
    const interval = setInterval(loadMessages, 15000)
    return () => clearInterval(interval)
  }, [id])

  function loadRightPanel() {
    if (!contact?.opportunities?.length) return
    const oppIds = contact.opportunities.map(o => o.id)
    // Fetch activities, notes, tasks for all opportunities
    Promise.all(oppIds.map(oid =>
      fetch(`/api/opportunities/${oid}`).then(r => r.json())
    )).then(opps => {
      const allActivities: any[] = []
      const allNotes: any[] = []
      const allTasks: any[] = []
      for (const opp of opps) {
        if (opp.activities) allActivities.push(...opp.activities)
        if (opp.notes) allNotes.push(...opp.notes)
        if (opp.tasks) allTasks.push(...opp.tasks)
      }
      setActivities(allActivities.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))
      setOppNotes(allNotes.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))
      setOppTasks(allTasks.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))
    })
  }

  useEffect(() => {
    if (contact) loadRightPanel()
  }, [contact])

  async function addNote() {
    if (!newNote.trim() || !contact?.opportunities?.length) return
    setSavingRight(true)
    const oppId = contact.opportunities[0].id
    await fetch(`/api/opportunities/${oppId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: newNote }),
    })
    setNewNote('')
    setSavingRight(false)
    // Refresh
    fetch(`/api/contacts/${id}`).then(r => r.json()).then(d => setContact(d))
    setTimeout(loadRightPanel, 500)
  }

  async function addTask() {
    if (!newTaskTitle.trim() || !contact?.opportunities?.length) return
    setSavingRight(true)
    const oppId = contact.opportunities[0].id
    await fetch(`/api/opportunities/${oppId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTaskTitle, dueDate: newTaskDue || null }),
    })
    setNewTaskTitle('')
    setNewTaskDue('')
    setSavingRight(false)
    setTimeout(loadRightPanel, 500)
  }

  async function toggleTask(oppId: string, taskId: string, currentStatus: string) {
    const newStatus = currentStatus === 'completed' ? 'pending' : 'completed'
    await fetch(`/api/opportunities/${oppId}/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    setTimeout(loadRightPanel, 300)
  }

  async function sendMessage() {
    if (!msgText.trim()) return
    if (msgTab === 'sms' && !contact?.phone) return
    setSending(true)
    try {
      if (msgTab === 'internal') {
        // Save internal note directly to messages table
        const res = await fetch('/api/messages/internal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contactId: id, body: msgText }),
        })
        if (res.ok) {
          setMsgText('')
          loadMessages()
        }
      } else {
        // Send SMS via Twilio
        const res = await fetch('/api/sms/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: contact!.phone, body: msgText, contactId: id }),
        })
        if (res.ok) {
          setMsgText('')
          loadMessages()
        }
      }
    } catch (e) { console.error(e) }
    setSending(false)
  }

  async function saveField(field: string, value: string) {
    setSaving(true)
    await fetch(`/api/contacts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value || null }),
    })
    setContact(prev => prev ? { ...prev, [field]: value || null } : prev)
    setEditing(prev => { const n = { ...prev }; delete n[field]; return n })
    setSaving(false)
  }

  if (loading) return <p style={{ color: 'var(--text-muted)', padding: 40, textAlign: 'center' }}>Loading...</p>
  if (!contact) return <p style={{ color: 'var(--text-muted)', padding: 40, textAlign: 'center' }}>Not found</p>

  function EditableField({ label, field, value }: { label: string; field: string; value: string | null }) {
    const isEditing = field in editing
    return (
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{label}</label>
        {isEditing ? (
          <input
            autoFocus
            value={editing[field]}
            onChange={e => setEditing(prev => ({ ...prev, [field]: e.target.value }))}
            onBlur={() => saveField(field, editing[field])}
            onKeyDown={e => e.key === 'Enter' && saveField(field, editing[field])}
            style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #2563eb', fontSize: 13, outline: 'none', background: '#fff' }}
          />
        ) : (
          <div
            onClick={() => setEditing(prev => ({ ...prev, [field]: value || '' }))}
            style={{
              padding: '7px 10px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
              color: value ? 'var(--text-primary)' : 'var(--text-muted)',
              background: '#f9fafb', border: '1px solid var(--border)',
            }}
          >
            {value || label}
          </div>
        )}
      </div>
    )
  }

  function SelectField({ label, field, value, options }: { label: string; field: string; value: string; options: { value: string; label: string }[] }) {
    return (
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{label}</label>
        <select
          value={value}
          onChange={e => saveField(field, e.target.value)}
          style={{ width: '100%', padding: '7px 10px', borderRadius: 6, fontSize: 13, background: '#f9fafb', border: '1px solid var(--border)', cursor: 'pointer' }}
        >
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
    )
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', margin: '-40px -32px -40px -32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--border)', marginBottom: 0 }}>
        <button onClick={() => router.push('/contacts')} style={{
          background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text-muted)', padding: 4,
        }}>←</button>
        <div style={{
          width: 36, height: 36, borderRadius: '50%', background: '#8b5cf6', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700,
        }}>
          {contact.firstName.charAt(0)}{contact.lastName.charAt(0)}
        </div>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>
            {contact.firstName} {contact.lastName}
          </h1>
        </div>
        {/* Action icons */}
        <div style={{ display: 'flex', gap: 6 }}>
          {contact.phone && (
            <a href={`tel:${contact.phone}`} style={{
              width: 36, height: 36, borderRadius: 8, border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', textDecoration: 'none',
            }}>
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
              </svg>
            </a>
          )}
          {contact.email && (
            <a href={`mailto:${contact.email}`} style={{
              width: 36, height: 36, borderRadius: 8, border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', textDecoration: 'none',
            }}>
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
              </svg>
            </a>
          )}
        </div>
      </div>

      {/* Three-panel layout */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', marginTop: 0 }}>

        {/* LEFT: Contact Fields */}
        <div style={{ width: 300, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          {/* Contact section */}
          <button onClick={() => setSections(s => ({ ...s, contact: !s.contact }))} style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
            padding: '12px 16px', border: 'none', borderBottom: '1px solid var(--border)',
            background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#2563eb',
          }}>
            <span style={{ transform: sections.contact ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', fontSize: 10 }}>▶</span>
            Contact
          </button>
          {sections.contact && (
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
              <EditableField label="First Name" field="firstName" value={contact.firstName} />
              <EditableField label="Last Name" field="lastName" value={contact.lastName} />
              <EditableField label="Email" field="email" value={contact.email} />
              <EditableField label="Phone" field="phone" value={contact.phone} />
              <EditableField label="Secondary Phone" field="secondaryPhone" value={contact.secondaryPhone} />
              <EditableField label="Date of Birth" field="dateOfBirth" value={contact.dateOfBirth ? new Date(contact.dateOfBirth).toLocaleDateString() : null} />
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Contact Source</label>
                <div style={{ padding: '7px 10px', borderRadius: 6, fontSize: 13, color: 'var(--text-secondary)', background: '#f9fafb', border: '1px solid var(--border)' }}>{contact.source}</div>
              </div>
              <SelectField label="Contact Type" field="contactType" value={contact.contactType} options={[
                { value: 'lead', label: 'Lead' },
                { value: 'customer', label: 'Customer' },
                { value: 'vendor', label: 'Vendor' },
              ]} />
              {contact.tags.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Tags</label>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {contact.tags.map(tag => (
                      <span key={tag} style={{ fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 4, background: '#f0f0ec', color: 'var(--text-secondary)' }}>{tag}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* General Info section */}
          <button onClick={() => setSections(s => ({ ...s, general: !s.general }))} style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
            padding: '12px 16px', border: 'none', borderBottom: '1px solid var(--border)',
            background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#2563eb',
          }}>
            <span style={{ transform: sections.general ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', fontSize: 10 }}>▶</span>
            General Info
          </button>
          {sections.general && (
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
              <EditableField label="Street Address" field="address" value={contact.address} />
              <EditableField label="City" field="city" value={contact.city} />
              <EditableField label="Country" field="country" value={contact.country} />
              <EditableField label="State" field="state" value={contact.state} />
              <EditableField label="Postal Code" field="zip" value={contact.zip} />
              <EditableField label="Website" field="website" value={contact.website} />
              <EditableField label="Time Zone" field="timezone" value={contact.timezone} />
            </div>
          )}

          {/* Opportunities — always visible below tabs */}
          <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px', flexShrink: 0, maxHeight: 200, overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>
                Opportunities ({contact.opportunities.length})
              </span>
              <Link href={`/leads/new?contactId=${id}`} style={{
                fontSize: 11, fontWeight: 600, color: '#2563eb', textDecoration: 'none',
              }}>+ Add</Link>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {contact.opportunities.map(opp => (
                <Link key={opp.id} href={`/leads/${opp.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div style={{
                    padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)',
                    borderLeft: `3px solid ${opp.pipeline.color}`, fontSize: 12,
                  }}>
                    <div style={{ fontWeight: 600, marginBottom: 2 }}>{opp.pipeline.name}</div>
                    <div style={{ color: 'var(--text-muted)' }}>
                      {opp.stage.name}
                      {opp.vehicleInterest && ` · ${opp.vehicleInterest}`}
                    </div>
                  </div>
                </Link>
              ))}
              {contact.opportunities.length === 0 && (
                <p style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>No opportunities</p>
              )}
            </div>
          </div>
        </div>

        {/* CENTER: Conversation */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* Message thread */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', background: '#f9fafb' }}>
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
                <p style={{ fontSize: 14, fontWeight: 500 }}>No messages yet</p>
                <p style={{ fontSize: 13, marginTop: 4 }}>Start a conversation below</p>
              </div>
            )}
            {messages.map((msg, i) => {
              const prevMsg = messages[i - 1]
              const showDate = !prevMsg || new Date(msg.createdAt).toDateString() !== new Date(prevMsg.createdAt).toDateString()
              return (
                <div key={msg.id}>
                  {showDate && (
                    <div style={{ textAlign: 'center', margin: '16px 0 12px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
                      {new Date(msg.createdAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </div>
                  )}
                  {msg.channel === 'internal' ? (
                    /* Internal note — full width yellow sticky */
                    <div style={{
                      display: 'flex', justifyContent: 'center', marginBottom: 6,
                    }}>
                      <div style={{
                        maxWidth: '85%', width: '100%', padding: '10px 14px', borderRadius: 10,
                        background: '#fefce8', border: '1px solid #fde047',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#a16207', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Internal Note</span>
                        </div>
                        <p style={{ fontSize: 13, lineHeight: 1.4, margin: 0, color: '#92400e', wordBreak: 'break-word' }}>{msg.body}</p>
                        <p style={{ fontSize: 10, margin: '4px 0 0', color: '#a16207', opacity: 0.7 }}>
                          {new Date(msg.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                          {msg.sender && ` · ${msg.sender.name}`}
                        </p>
                      </div>
                    </div>
                  ) : (
                    /* SMS / regular message */
                    <div style={{
                      display: 'flex', justifyContent: msg.direction === 'outbound' ? 'flex-end' : 'flex-start',
                      marginBottom: 6,
                    }}>
                    {msg.direction === 'inbound' && (
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%', background: '#e2e8f0', color: '#64748b',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, fontWeight: 700, marginRight: 8, flexShrink: 0, marginTop: 2,
                      }}>
                        {contact.firstName.charAt(0)}{contact.lastName.charAt(0)}
                      </div>
                    )}
                    <div style={{
                      maxWidth: '65%', padding: '10px 14px', borderRadius: 16,
                      background: msg.direction === 'outbound' ? '#1a1a1a' : '#fff',
                      color: msg.direction === 'outbound' ? '#fff' : 'var(--text-primary)',
                      border: msg.direction === 'inbound' ? '1px solid var(--border)' : 'none',
                      borderBottomRightRadius: msg.direction === 'outbound' ? 4 : 16,
                      borderBottomLeftRadius: msg.direction === 'inbound' ? 4 : 16,
                    }}>
                      {msg.mediaUrl && (
                        <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer">
                          <img src={msg.mediaUrl} alt="Media" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8, marginBottom: 4 }} />
                        </a>
                      )}
                      <p style={{ fontSize: 14, lineHeight: 1.4, margin: 0, wordBreak: 'break-word' }}>{msg.body}</p>
                      <p style={{ fontSize: 10, margin: '4px 0 0', opacity: 0.5 }}>
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                        {msg.sender && ` · ${msg.sender.name}`}
                        {msg.status === 'failed' && ' · Failed'}
                      </p>
                    </div>
                    {msg.direction === 'outbound' && msg.sender && (
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%', background: '#1a1a1a', color: '#dffd6e',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, fontWeight: 700, marginLeft: 8, flexShrink: 0, marginTop: 2,
                      }}>
                        {msg.sender.name.split(' ').map(n => n[0]).join('')}
                      </div>
                    )}
                  </div>
                  )}
                </div>
              )
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Compose area */}
          <div style={{ borderTop: '1px solid var(--border)', background: '#fff' }}>
            {/* Channel tabs */}
            <div style={{ display: 'flex', gap: 0, padding: '0 20px', borderBottom: '1px solid var(--border)' }}>
              {[
                { key: 'sms' as const, label: 'SMS' },
                { key: 'email' as const, label: 'Email' },
                { key: 'internal' as const, label: 'Internal Note' },
              ].map(tab => (
                <button key={tab.key} onClick={() => setMsgTab(tab.key)} style={{
                  padding: '10px 16px', fontSize: 13, fontWeight: 600, border: 'none', background: 'none',
                  cursor: 'pointer', borderBottom: msgTab === tab.key ? '2px solid #2563eb' : '2px solid transparent',
                  color: msgTab === tab.key ? '#2563eb' : 'var(--text-muted)',
                }}>{tab.label}</button>
              ))}
            </div>

            {/* From/To line for SMS */}
            {msgTab === 'sms' && contact.phone && (
              <div style={{ display: 'flex', gap: 20, padding: '8px 20px', fontSize: 12, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                <span>From: <strong style={{ color: 'var(--text-secondary)' }}>+1 786-798-8793</strong></span>
                <span>To: <strong style={{ color: 'var(--text-secondary)' }}>{contact.phone}</strong></span>
              </div>
            )}

            {/* Input */}
            <div style={{ padding: '12px 20px', display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <textarea
                value={msgText}
                onChange={e => setMsgText(e.target.value)}
                placeholder={msgTab === 'internal' ? 'Add an internal note...' : 'Type a message...'}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                rows={2}
                style={{
                  flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)',
                  fontSize: 14, outline: 'none', resize: 'none', fontFamily: 'inherit',
                }}
              />
              <button onClick={sendMessage} disabled={sending || !msgText.trim()} style={{
                padding: '10px 20px', borderRadius: 10, border: 'none',
                background: '#1a1a1a', color: '#dffd6e', fontSize: 14, fontWeight: 600,
                cursor: 'pointer', opacity: sending || !msgText.trim() ? 0.5 : 1, whiteSpace: 'nowrap',
              }}>
                {sending ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT: Activity / Notes / Tasks / Appointments */}
        <div style={{ width: 320, flexShrink: 0, borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0, overflowX: 'auto' }}>
            {[
              { key: 'activity' as const, label: 'Activity' },
              { key: 'notes' as const, label: 'Notes' },
              { key: 'tasks' as const, label: 'Tasks' },
              { key: 'appointments' as const, label: 'Appts' },
            ].map(tab => (
              <button key={tab.key} onClick={() => setRightTab(tab.key)} style={{
                flex: 1, padding: '10px 4px', fontSize: 12, fontWeight: 600, border: 'none', background: 'none', cursor: 'pointer',
                borderBottom: rightTab === tab.key ? '2px solid #2563eb' : '2px solid transparent',
                color: rightTab === tab.key ? '#2563eb' : 'var(--text-muted)', whiteSpace: 'nowrap',
              }}>{tab.label}</button>
            ))}
          </div>

          {/* Content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>

            {/* Activity Tab */}
            {rightTab === 'activity' && (
              <>
                {activities.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-muted)' }}>
                    <p style={{ fontSize: 13, fontWeight: 500 }}>No activity yet</p>
                    <p style={{ fontSize: 12, marginTop: 4 }}>Stage changes, messages, and more will appear here.</p>
                  </div>
                ) : (
                  <div style={{ position: 'relative', paddingLeft: 20 }}>
                    {/* Timeline line */}
                    <div style={{ position: 'absolute', left: 6, top: 8, bottom: 8, width: 1, background: 'var(--border)' }} />
                    {activities.map((a: any) => (
                      <div key={a.id} style={{ position: 'relative', marginBottom: 16 }}>
                        <div style={{
                          position: 'absolute', left: -17, top: 4, width: 10, height: 10, borderRadius: '50%',
                          background: a.type === 'stage_changed' ? '#2563eb' : a.type === 'lead_created' ? '#22c55e' : a.type === 'assigned' ? '#f59e0b' : '#94a3b8',
                          border: '2px solid #fff',
                        }} />
                        <p style={{ fontSize: 13, lineHeight: 1.4, color: 'var(--text-secondary)' }}>{a.description}</p>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                          {new Date(a.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at {new Date(a.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                          {a.actor && ` · ${a.actor.name}`}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Notes Tab */}
            {rightTab === 'notes' && (
              <>
                <div style={{ marginBottom: 12 }}>
                  <textarea value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Add a note..."
                    rows={3} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, resize: 'vertical', fontFamily: 'inherit' }} />
                  <button onClick={addNote} disabled={savingRight || !newNote.trim()} style={{
                    marginTop: 6, padding: '6px 14px', borderRadius: 6, border: 'none',
                    background: '#1a1a1a', color: '#dffd6e', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    opacity: savingRight || !newNote.trim() ? 0.5 : 1,
                  }}>{savingRight ? 'Saving...' : 'Add Note'}</button>
                </div>
                {oppNotes.length === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>No notes yet</p>
                ) : (
                  oppNotes.map((n: any) => (
                    <div key={n.id} style={{ padding: '10px 12px', background: '#f9fafb', borderRadius: 8, marginBottom: 8, border: '1px solid var(--border)' }}>
                      <p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-primary)', wordBreak: 'break-word' }}>{n.body}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                        {new Date(n.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at {new Date(n.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                        {n.createdBy && ` · ${n.createdBy.name}`}
                      </p>
                    </div>
                  ))
                )}
              </>
            )}

            {/* Tasks Tab */}
            {rightTab === 'tasks' && (
              <>
                <div style={{ marginBottom: 12 }}>
                  <input value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} placeholder="New task..."
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, marginBottom: 6 }}
                    onKeyDown={e => e.key === 'Enter' && addTask()} />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input type="date" value={newTaskDue} onChange={e => setNewTaskDue(e.target.value)}
                      style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12 }} />
                    <button onClick={addTask} disabled={savingRight || !newTaskTitle.trim()} style={{
                      padding: '6px 14px', borderRadius: 6, border: 'none',
                      background: '#1a1a1a', color: '#dffd6e', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      opacity: savingRight || !newTaskTitle.trim() ? 0.5 : 1,
                    }}>Add</button>
                  </div>
                </div>
                {oppTasks.length === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>No tasks yet</p>
                ) : (
                  oppTasks.map((t: any) => (
                    <div key={t.id} style={{
                      display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 0',
                      borderBottom: '1px solid var(--border)',
                    }}>
                      <input type="checkbox" checked={t.status === 'completed'}
                        onChange={() => toggleTask(t.opportunityId, t.id, t.status)}
                        style={{ marginTop: 2, cursor: 'pointer' }} />
                      <div style={{ flex: 1 }}>
                        <p style={{
                          fontSize: 13, color: t.status === 'completed' ? 'var(--text-muted)' : 'var(--text-primary)',
                          textDecoration: t.status === 'completed' ? 'line-through' : 'none',
                        }}>{t.title}</p>
                        {t.dueDate && (
                          <p style={{
                            fontSize: 11, marginTop: 2,
                            color: new Date(t.dueDate) < new Date() && t.status !== 'completed' ? '#ef4444' : 'var(--text-muted)',
                          }}>
                            Due: {new Date(t.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </>
            )}

            {/* Appointments Tab */}
            {rightTab === 'appointments' && (
              <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-muted)' }}>
                <p style={{ fontSize: 13, fontWeight: 500 }}>Appointments</p>
                <p style={{ fontSize: 12, marginTop: 4 }}>Schedule showings and visits. Coming soon.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
