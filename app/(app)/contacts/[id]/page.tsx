'use client'

import { useEffect, useState, useRef } from 'react'
import { getVoicePhoneAPI } from '@/components/VoicePhone'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
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
  id: string; direction: string; channel: string; body: string; mediaUrl: string | null; mediaContentType?: string | null; mediaPublicUrl?: string | null; r2Key?: string | null
  status: string; createdAt: string; sender: { id: string; name: string } | null
  kind?: 'message'
}

type CallEntry = {
  id: string; kind: 'call'; direction: string; status: string
  fromNumber: string; toNumber: string
  startedAt: string; durationSeconds: number | null
  recordingUrl: string | null
  recordingDurationSeconds: number | null
  transcription: string | null; transcriptionStatus: string | null
  voicemail: boolean
  owner: { id: string; name: string } | null
  createdAt: string
}

type ThreadItem = Message | CallEntry

export default function ContactDetailPage() {
  const params = useParams()
  const id = Array.isArray(params.id) ? params.id[0] : (params.id as string)
  const router = useRouter()
  const searchParams = useSearchParams()
  const backTo = searchParams.get('from') || '/contacts'
  const [contact, setContact] = useState<ContactDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [messages, setMessages] = useState<Message[]>([])
  const [calls, setCalls] = useState<CallEntry[]>([])
  const [expandedCalls, setExpandedCalls] = useState<Set<string>>(new Set())
  const [msgText, setMsgText] = useState('')
  const [sending, setSending] = useState(false)
  // msgTab kept for backwards compat with existing render code; reflects effective send mode
  const [msgTab, setMsgTab] = useState<'sms' | 'email' | 'internal'>('sms')
  const [channel, setChannel] = useState<'sms' | 'email' | 'internal'>('sms')
  const [showChannelMenu, setShowChannelMenu] = useState(false)
  const [composeMinimized, setComposeMinimized] = useState(false)
  const [emailSubject, setEmailSubject] = useState('')
  const internalMode = channel === 'internal'

  // Sync msgTab to channel so existing send logic + render conditions still work
  useEffect(() => { setMsgTab(channel) }, [channel])

  const iconBtn: React.CSSProperties = {
    width: 26, height: 26, borderRadius: 6, border: 'none', background: 'none',
    color: 'var(--text-muted)', cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 14, lineHeight: 1, padding: 0,
  }
  const [me, setMe] = useState<{ id: string; name: string; email: string; twilioNumber: string | null } | null>(null)
  const [rightTab, setRightTab] = useState<'activity' | 'notes' | 'tasks' | 'appointments'>('activity')
  const [activities, setActivities] = useState<any[]>([])
  const [oppNotes, setOppNotes] = useState<any[]>([])
  const [oppTasks, setOppTasks] = useState<any[]>([])
  const [dispositions, setDispositions] = useState<any[]>([])
  const [showDispositions, setShowDispositions] = useState(false)
  const [dispSaving, setDispSaving] = useState(false)
  const [newNote, setNewNote] = useState('')
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskDue, setNewTaskDue] = useState('')
  const [savingRight, setSavingRight] = useState(false)
  const [sections, setSections] = useState<Record<string, boolean>>({ contact: true, general: false })
  const [editing, setEditing] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [attachedFiles, setAttachedFiles] = useState<File[]>([])
  const [sendingUploadLink, setSendingUploadLink] = useState(false)

  useEffect(() => {
    fetch(`/api/contacts/${id}`).then(r => r.json()).then(d => { setContact(d); setLoading(false) })
    fetch('/api/settings/dispositions').then(r => r.json()).then(d => setDispositions(d.dispositions || []))
    fetch('/api/auth/me').then(r => r.json()).then(d => { if (d.user) setMe(d.user) }).catch(() => {})
  }, [id])

  function loadMessages() {
    fetch(`/api/messages?contactId=${id}`).then(r => r.json()).then(d => {
      setMessages(d.messages || [])
      setCalls(d.calls || [])
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    })
  }

  useEffect(() => {
    loadMessages()
    const interval = setInterval(loadMessages, 30000)
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

  async function logDisposition(disp: any) {
    if (!contact?.opportunities?.length) return
    setDispSaving(true)
    const oppId = contact.opportunities[0].id
    try {
      // Log the disposition
      await fetch(`/api/opportunities/${oppId}/dispositions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dispositionId: disp.id }),
      })
      // If disposition has auto-move, move the stage
      if (disp.moveToStageId) {
        await fetch(`/api/opportunities/${oppId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stageId: disp.moveToStageId }),
        })
      }
      // If disposition has follow-up, create a task
      if (disp.followUpMinutes) {
        const followUpAt = new Date(Date.now() + disp.followUpMinutes * 60000)
        await fetch(`/api/opportunities/${oppId}/tasks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: `Follow up: ${disp.name}`,
            dueDate: followUpAt.toISOString(),
          }),
        })
      }
      setShowDispositions(false)
      // Refresh data
      fetch(`/api/contacts/${id}`).then(r => r.json()).then(d => setContact(d))
      setTimeout(loadRightPanel, 500)
    } catch (e) { console.error(e) }
    setDispSaving(false)
  }

  async function sendUploadLinkToContact() {
    if (!contact?.phone) {
      alert('No phone number on file for this contact.')
      return
    }
    setSendingUploadLink(true)
    try {
      const linkRes = await fetch('/api/upload-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: id }),
      })
      if (!linkRes.ok) { alert('Could not generate link'); return }
      const { token } = await linkRes.json()
      const url = `${window.location.origin}/u/${token}`
      const body = `For full-quality photos & videos, upload here: ${url}`
      const smsRes = await fetch('/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: contact.phone, body, contactId: id }),
      })
      if (smsRes.ok) {
        loadMessages()
      } else {
        const err = await smsRes.json().catch(() => ({}))
        alert(`Link generated but SMS failed: ${err.error || smsRes.status}\n\nLink: ${url}`)
      }
    } catch (e) {
      console.error(e)
      alert('Something went wrong')
    } finally {
      setSendingUploadLink(false)
    }
  }

  async function sendMessage() {
    if (!msgText.trim()) return
    if (msgTab === 'sms' && !contact?.phone) return
    if (msgTab === 'email' && !contact?.email) { alert('No email on file for this contact.'); return }
    if (msgTab === 'email' && !emailSubject.trim()) { alert('Subject required.'); return }
    setSending(true)
    try {
      if (msgTab === 'internal') {
        const res = await fetch('/api/messages/internal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contactId: id, body: msgText }),
        })
        if (res.ok) { setMsgText(''); loadMessages() }
      } else if (msgTab === 'email') {
        const res = await fetch('/api/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contactId: id,
            to: contact!.email,
            subject: emailSubject,
            bodyText: msgText,
          }),
        })
        if (res.ok) {
          setMsgText('')
          setEmailSubject('')
          loadMessages()
        } else {
          const err = await res.json().catch(() => ({}))
          alert(`Email failed: ${err.error || res.status}`)
        }
      } else {
        const res = await fetch('/api/sms/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: contact!.phone, body: msgText, contactId: id }),
        })
        if (res.ok) { setMsgText(''); loadMessages() }
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
        <button onClick={() => router.push(backTo)} style={{
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
            <button
              data-tip="Call from browser"
              onClick={() => {
                const api = getVoicePhoneAPI()
                if (!api) { alert('Voice device still initializing — try again in a moment.'); return }
                if (!me?.twilioNumber) { alert('No Twilio number assigned to your account. Set one in /team.'); return }
                api.callContact({
                  to: contact.phone!,
                  contactId: id,
                  ownerId: me.id,
                  fromNumber: me.twilioNumber,
                })
              }}
              style={{
                width: 36, height: 36, borderRadius: 8, border: '1px solid var(--border)',
                background: '#fff', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)',
              }}>
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
              </svg>
            </button>
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
          {/* Disposition button */}
          {contact.opportunities.length > 0 && (
            <div style={{ position: 'relative' }}>
              <button onClick={() => setShowDispositions(!showDispositions)} style={{
                padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)',
                background: showDispositions ? '#1a1a1a' : '#fff', color: showDispositions ? '#dffd6e' : 'var(--text-secondary)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
              }}>
                Log Outcome
              </button>
              {showDispositions && (
                <div style={{
                  position: 'absolute', right: 0, top: 42, width: 220, background: '#fff',
                  border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                  zIndex: 100, padding: '6px 0',
                }}>
                  {dispositions.filter((d: any) => d.isActive).map((d: any) => (
                    <button key={d.id} onClick={() => logDisposition(d)} disabled={dispSaving} style={{
                      width: '100%', padding: '8px 14px', border: 'none', background: 'none',
                      fontSize: 13, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    >
                      <span>{d.name}</span>
                      {d.moveToStage && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>→ {d.moveToStage.name}</span>}
                      {d.followUpMinutes && <span style={{ fontSize: 10, color: '#2563eb' }}>{d.followUpMinutes >= 1440 ? `${Math.round(d.followUpMinutes / 1440)}d` : d.followUpMinutes >= 60 ? `${Math.round(d.followUpMinutes / 60)}h` : `${d.followUpMinutes}m`}</span>}
                    </button>
                  ))}
                  {dispositions.filter((d: any) => d.isActive).length === 0 && (
                    <p style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>No dispositions configured. Add them in Settings → Sales.</p>
                  )}
                </div>
              )}
            </div>
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
            {(() => {
              // Interleave messages + calls by createdAt
              const items: ThreadItem[] = [
                ...messages.map(m => ({ ...m, kind: 'message' as const })),
                ...calls,
              ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
              return items.map((item, i) => {
                if (item.kind === 'call') {
                  const prev = items[i - 1]
                  const showDate = !prev || new Date(item.createdAt).toDateString() !== new Date(prev.createdAt).toDateString()
                  const dur = item.recordingDurationSeconds || item.durationSeconds || 0
                  const minSec = `${Math.floor(dur / 60)}:${(dur % 60).toString().padStart(2, '0')}`
                  const isInbound = item.direction === 'inbound'
                  const isVoicemail = item.voicemail
                  const label = isVoicemail ? 'Voicemail' : isInbound ? 'Inbound' : 'Outbound'
                  const accent = isVoicemail ? '#a855f7' : isInbound ? '#16a34a' : '#2563eb'
                  return (
                    <div key={item.id}>
                      {showDate && (
                        <div style={{ textAlign: 'center', margin: '16px 0 12px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
                          {new Date(item.createdAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: isInbound ? 'flex-start' : 'flex-end', marginBottom: 6 }}>
                        {isInbound && (
                          <div style={{
                            width: 28, height: 28, borderRadius: '50%', background: '#e2e8f0', color: '#64748b',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 10, fontWeight: 700, marginRight: 8, flexShrink: 0, marginTop: 2,
                          }}>
                            {contact.firstName.charAt(0)}{contact.lastName.charAt(0)}
                          </div>
                        )}
                        <div style={{
                          maxWidth: expandedCalls.has(item.id) ? 520 : 360,
                          width: expandedCalls.has(item.id) ? '65%' : 'auto',
                          padding: '8px 10px', borderRadius: 8,
                          background: '#fff', border: '1px solid var(--border)',
                          borderLeft: `2px solid ${accent}`,
                          transition: 'max-width 0.55s cubic-bezier(0.4, 0, 0.2, 1), width 0.55s cubic-bezier(0.4, 0, 0.2, 1)',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: item.recordingUrl ? 4 : 0 }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
                            </svg>
                            <span style={{ fontSize: 11, fontWeight: 700, color: accent, letterSpacing: '0.02em' }}>{label}</span>
                            {dur > 0 && <span style={{ fontSize: 11, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>· {minSec}</span>}
                            {item.status && item.status !== 'completed' && !isVoicemail && (
                              <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'capitalize' }}>· {item.status.replace('-', ' ')}</span>
                            )}
                            <span style={{ flex: 1 }} />
                            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                              {new Date(item.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                              {item.owner && ` · ${item.owner.name}`}
                            </span>
                          </div>
                          {item.recordingUrl && (
                            <audio controls preload="none" src={item.recordingUrl}
                              onPlay={() => setExpandedCalls(prev => { const next = new Set(prev); next.add(item.id); return next })}
                              onPause={() => setExpandedCalls(prev => { const next = new Set(prev); next.delete(item.id); return next })}
                              onEnded={() => setExpandedCalls(prev => { const next = new Set(prev); next.delete(item.id); return next })}
                              style={{ display: 'block', width: '100%', height: 28 }} />
                          )}
                          {item.transcription && (
                            <p style={{ fontSize: 12, lineHeight: 1.4, margin: '6px 0 0', whiteSpace: 'pre-wrap', color: 'var(--text-secondary)' }}>{item.transcription}</p>
                          )}
                        </div>
                        {!isInbound && item.owner && (
                          <div style={{
                            width: 28, height: 28, borderRadius: '50%', background: '#1a1a1a', color: '#dffd6e',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 10, fontWeight: 700, marginLeft: 8, flexShrink: 0, marginTop: 2,
                          }}>
                            {item.owner.name.split(' ').map(n => n[0]).join('')}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                }
                const msg = item
                const prev = items[i - 1]
                const showDate = !prev || new Date(msg.createdAt).toDateString() !== new Date(prev.createdAt).toDateString()
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
                      {(msg.mediaUrl || msg.r2Key) && (() => {
                        const proxyUrl = msg.mediaPublicUrl || `/api/sms/media/${msg.id}`
                        const ct = msg.mediaContentType || ''
                        const isVideo = ct.startsWith('video')
                        const isAudio = ct.startsWith('audio')
                        const isImage = ct.startsWith('image') || (!isVideo && !isAudio)
                        const linkColor = msg.direction === 'outbound' ? '#dffd6e' : '#3b82f6'
                        return (
                          <div style={{ marginBottom: msg.body ? 6 : 0 }}>
                            {isVideo && (
                              <video src={proxyUrl} controls playsInline preload="metadata"
                                style={{ display: 'block', maxWidth: '100%', maxHeight: 420, borderRadius: 8, background: '#000' }} />
                            )}
                            {isAudio && (
                              <audio src={proxyUrl} controls preload="metadata" style={{ display: 'block', maxWidth: '100%' }} />
                            )}
                            {isImage && !isVideo && !isAudio && (
                              <a href={proxyUrl} target="_blank" rel="noopener noreferrer">
                                <img src={proxyUrl} alt="Media"
                                  style={{ display: 'block', maxWidth: '100%', maxHeight: 240, borderRadius: 8 }} />
                              </a>
                            )}
                            {(isVideo || isAudio) && (
                              <a href={proxyUrl} target="_blank" rel="noopener noreferrer"
                                style={{ fontSize: 11, color: linkColor, textDecoration: 'underline', marginTop: 4, display: 'inline-block' }}>
                                Open / Download
                              </a>
                            )}
                          </div>
                        )
                      })()}
                      {msg.body && (
                        <p style={{ fontSize: 14, lineHeight: 1.4, margin: 0, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{msg.body}</p>
                      )}
                      <p style={{ fontSize: 10, margin: '4px 0 0', opacity: 0.5 }}>
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                        {msg.channel === 'email' && ' · Email'}
                        {msg.channel === 'sms' && ' · SMS'}
                        {msg.channel === 'upload' && ' · Upload'}
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
              })
            })()}
            <div ref={messagesEndRef} />
          </div>

          {/* Compose area — slim, single bordered card */}
          <div style={{ padding: '8px 12px 10px', background: 'transparent' }}>
            <div style={{
              border: '1px solid var(--border)', borderRadius: 10,
              background: internalMode ? '#fefce8' : '#fff',
              overflow: 'visible',
            }}>
              {/* Top row: channel dropdown (only when expanded) */}
              {!composeMinimized && (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '3px 8px', background: internalMode ? '#fefce8' : '#f5f7fb',
                  fontSize: 13, minHeight: 30,
                  borderTopLeftRadius: 9, borderTopRightRadius: 9,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <ChannelDropdown
                      channel={channel} setChannel={setChannel}
                      open={showChannelMenu} setOpen={setShowChannelMenu}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)' }}>
                    <button title="Minimize" onClick={() => setComposeMinimized(true)} style={iconBtn}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    </button>
                  </div>
                </div>
              )}

              {/* From/To row — slim, no bottom border, just inline text with separator */}
              {!internalMode && (
                <div style={{
                  display: 'flex', alignItems: 'center', padding: '7px 14px',
                  fontSize: 12.5, flexWrap: 'wrap', gap: 0,
                }}>
                  <span style={{ color: 'var(--text-muted)', marginRight: 8, fontWeight: 600 }}>From:</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600, marginRight: 16 }}>
                    {channel === 'sms'
                      ? (me?.twilioNumber || '—')
                      : (me?.email || '—')}
                  </span>
                  <span style={{ width: 1, height: 14, background: 'var(--border)', marginRight: 16 }} />
                  <span style={{ color: 'var(--text-muted)', marginRight: 8, fontWeight: 600 }}>To:</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                    {channel === 'sms'
                      ? (contact.phone || '—')
                      : (contact.email || '—')}
                  </span>
                </div>
              )}

              {/* Subject row (email only) */}
              {!internalMode && channel === 'email' && (
                <div style={{ display: 'flex', alignItems: 'center', padding: '6px 14px', borderBottom: '1px solid var(--border-light)', gap: 8 }}>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Subject:</span>
                  <input
                    value={emailSubject}
                    onChange={e => setEmailSubject(e.target.value)}
                    placeholder="Enter subject"
                    style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13, fontWeight: 500, background: 'transparent', padding: '4px 0' }}
                  />
                </div>
              )}

              {/* Attached files row */}
              {!composeMinimized && attachedFiles.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '6px 14px 0' }}>
                  {attachedFiles.map((f, i) => (
                    <span key={i} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '4px 8px 4px 10px', borderRadius: 100,
                      background: '#f0f4ff', color: '#1d4ed8', fontSize: 12, fontWeight: 500,
                    }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" /></svg>
                      <span style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                      <button onClick={() => setAttachedFiles(prev => prev.filter((_, j) => j !== i))} style={{
                        border: 'none', background: 'none', color: '#1d4ed8', cursor: 'pointer', padding: 0, lineHeight: 1, fontSize: 14,
                      }}>×</button>
                    </span>
                  ))}
                </div>
              )}

              {/* Body + footer only show when expanded */}
              {!composeMinimized && (
                <textarea
                  value={msgText}
                  onChange={e => setMsgText(e.target.value)}
                  placeholder={internalMode ? 'Add an internal note...' : 'Type a message...'}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && channel === 'sms' && !internalMode) { e.preventDefault(); sendMessage() } }}
                  rows={3}
                  style={{
                    width: '100%', border: 'none', outline: 'none', resize: 'none',
                    padding: '4px 14px 10px', fontSize: 13, lineHeight: 1.45,
                    background: 'transparent', fontFamily: 'inherit',
                  }}
                />
              )}

              {/* Footer: action icons + send (expanded) */}
              {!composeMinimized && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '6px 8px 6px 12px', background: '#fafafa',
                borderBottomLeftRadius: 9, borderBottomRightRadius: 9,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)' }}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    style={{ display: 'none' }}
                    onChange={e => {
                      const files = Array.from(e.target.files || [])
                      if (files.length > 0) setAttachedFiles(prev => [...prev, ...files])
                      e.target.value = ''
                    }}
                  />
                  <button data-tip="Attach a file" onClick={() => fileInputRef.current?.click()} style={iconBtn}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" /></svg>
                  </button>
                  <button data-tip="Send upload link via SMS"
                    onClick={sendUploadLinkToContact}
                    disabled={sendingUploadLink}
                    style={{ ...iconBtn, opacity: sendingUploadLink ? 0.5 : 1 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.72" />
                      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.72-1.72" />
                    </svg>
                  </button>
                  <button data-tip="Insert from linked vehicle" style={iconBtn}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 16H9m10 0h1.5a.5.5 0 00.5-.5V13a3 3 0 00-2.4-2.94l-1.5-3A2 2 0 0015.2 6H8.8a2 2 0 00-1.9 1.06l-1.5 3A3 3 0 003 13v2.5a.5.5 0 00.5.5H5" />
                      <circle cx="7" cy="16" r="2" />
                      <circle cx="17" cy="16" r="2" />
                    </svg>
                  </button>
                  <button data-tip="Erase composer"
                    onClick={() => { setMsgText(''); setAttachedFiles([]); setEmailSubject('') }}
                    style={iconBtn}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="15" y1="9" x2="9" y2="15" />
                      <line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                  </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {channel === 'sms' && !internalMode && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      Chars: {msgText.length} | Segs: {Math.max(1, Math.ceil(msgText.length / 160))}
                    </span>
                  )}
                  <button
                    onClick={sendMessage}
                    disabled={sending || !msgText.trim()}
                    title="Send"
                    style={{
                      width: 28, height: 28, borderRadius: 6, border: 'none',
                      background: sending || !msgText.trim() ? '#e7efff' : '#cfdcff',
                      color: sending || !msgText.trim() ? '#94a3b8' : '#2563eb',
                      cursor: sending || !msgText.trim() ? 'not-allowed' : 'pointer',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      padding: 0,
                    }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: 'rotate(-15deg)' }}>
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  </button>
                </div>
              </div>
              )}

              {/* Minimized layout: single row with channel chip + textarea + send */}
              {composeMinimized && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px' }}>
                  <ChannelDropdown
                    channel={channel} setChannel={setChannel}
                    open={showChannelMenu} setOpen={setShowChannelMenu}
                    popUp
                  />
                  <input
                    value={msgText}
                    onChange={e => setMsgText(e.target.value)}
                    onFocus={() => setComposeMinimized(false)}
                    placeholder={internalMode ? 'Add an internal note...' : 'Type a message...'}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                    style={{
                      flex: 1, border: 'none', outline: 'none', background: 'transparent',
                      fontSize: 14, padding: '6px 8px', fontFamily: 'inherit',
                    }}
                  />
                  <button title="Expand" onClick={() => setComposeMinimized(false)} style={iconBtn}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></svg>
                  </button>
                  <button
                    onClick={sendMessage}
                    disabled={sending || !msgText.trim()}
                    title="Send"
                    style={{
                      width: 28, height: 28, borderRadius: 6, border: 'none',
                      background: sending || !msgText.trim() ? '#e7efff' : '#cfdcff',
                      color: sending || !msgText.trim() ? '#94a3b8' : '#2563eb',
                      cursor: sending || !msgText.trim() ? 'not-allowed' : 'pointer',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                    }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: 'rotate(-15deg)' }}>
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: Activity / Notes / Tasks / Appointments */}
        <div style={{ width: 280, flexShrink: 0, borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
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

type Channel = 'sms' | 'email' | 'internal'

function ChannelDropdown({
  channel, setChannel, open, setOpen, popUp,
}: {
  channel: Channel
  setChannel: (c: Channel) => void
  open: boolean
  setOpen: (next: boolean | ((prev: boolean) => boolean)) => void
  popUp?: boolean
}) {
  const labels: Record<Channel, string> = { sms: 'SMS', email: 'Email', internal: 'Internal Comment' }
  const isInternal = channel === 'internal'
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(s => !s)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: isInternal ? '#fef3c7' : '#e7efff',
          border: 'none', padding: '5px 12px', borderRadius: 8,
          fontSize: 13, fontWeight: 600,
          color: isInternal ? '#92400e' : '#2563eb',
          cursor: 'pointer',
        }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {channel === 'sms' && <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />}
          {channel === 'email' && <><path d="M4 4h16v16H4z" /><path d="M22 6L12 13 2 6" /></>}
          {channel === 'internal' && <><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></>}
        </svg>
        {labels[channel]}
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 4.5l3 3 3-3" /></svg>
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          ...(popUp
            ? { bottom: '100%', marginBottom: 6 }
            : { top: '100%', marginTop: 4 }),
          left: 0,
          background: '#fff', border: '1px solid var(--border)', borderRadius: 10,
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)', minWidth: 180, zIndex: 30, overflow: 'hidden',
        }}>
          {(['sms', 'email', 'internal'] as Channel[]).map(opt => (
            <button key={opt} onClick={() => { setChannel(opt); setOpen(false) }}
              style={{
                width: '100%', textAlign: 'left', padding: '9px 12px',
                border: 'none', background: channel === opt ? '#f5f5f3' : '#fff',
                fontSize: 13, fontWeight: 500, cursor: 'pointer',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
              {labels[opt]}
              {channel === opt && <span style={{ color: '#2563eb' }}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
