'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

type Conversation = {
  contactId: string
  contactName: string
  phone: string
  lastMessage: string
  lastDirection: string
  lastAt: string
  unread: number
}

type Message = {
  id: string; direction: string; channel: string; body: string; mediaUrl: string | null; mediaContentType?: string | null; mediaPublicUrl?: string | null; r2Key?: string | null
  status: string; createdAt: string; sender: { id: string; name: string } | null
}

type ContactInfo = {
  id: string; firstName: string; lastName: string; phone: string | null; email: string | null
}

function formatTimeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

export default function ConversationsPage() {
  const router = useRouter()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [contactInfo, setContactInfo] = useState<ContactInfo | null>(null)
  const [msgText, setMsgText] = useState('')
  const [sending, setSending] = useState(false)
  const [sendingUploadLink, setSendingUploadLink] = useState(false)
  const [emailSubject, setEmailSubject] = useState('')
  const [me, setMe] = useState<{ id: string; name: string; email: string; twilioNumber: string | null } | null>(null)
  const [msgTab, setMsgTab] = useState<'sms' | 'email' | 'internal'>('sms')
  const [channel, setChannel] = useState<'sms' | 'email' | 'internal'>('sms')
  const [showChannelMenu, setShowChannelMenu] = useState(false)
  const [composeMinimized, setComposeMinimized] = useState(false)
  const [attachedFiles, setAttachedFiles] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const internalMode = channel === 'internal'
  // Sync msgTab from channel so the existing sendMessage logic still works
  useEffect(() => { setMsgTab(channel) }, [channel])

  const iconBtn: React.CSSProperties = {
    width: 26, height: 26, borderRadius: 6, border: 'none', background: 'none',
    color: 'var(--text-muted)', cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 14, lineHeight: 1, padding: 0,
  }
  const [search, setSearch] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  function loadConversations() {
    fetch('/api/messages').then(r => r.json()).then(d => {
      setConversations(d.conversations || [])
      setLoading(false)
    })
  }

  useEffect(() => {
    loadConversations()
    fetch('/api/auth/me').then(r => r.json()).then(d => { if (d.user) setMe(d.user) }).catch(() => {})
    const interval = setInterval(loadConversations, 30000)
    return () => clearInterval(interval)
  }, [])

  function loadMessages(contactId: string) {
    fetch(`/api/messages?contactId=${contactId}`).then(r => r.json()).then(d => {
      setMessages(d.messages || [])
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    })
  }

  function selectConversation(contactId: string, name: string, phone: string) {
    setSelectedId(contactId)
    setContactInfo({ id: contactId, firstName: name.split(' ')[0], lastName: name.split(' ').slice(1).join(' '), phone, email: null })
    loadMessages(contactId)
    // Fetch full contact info for email + other fields
    fetch(`/api/contacts/${contactId}`)
      .then(r => r.json())
      .then(c => {
        if (c?.id) setContactInfo({ id: c.id, firstName: c.firstName, lastName: c.lastName, phone: c.phone, email: c.email })
      })
      .catch(() => {})
  }

  useEffect(() => {
    if (!selectedId) return
    const interval = setInterval(() => loadMessages(selectedId), 10000)
    return () => clearInterval(interval)
  }, [selectedId])

  async function sendUploadLink() {
    if (!selectedId) return
    const conv = conversations.find(c => c.contactId === selectedId)
    if (!conv?.phone) {
      alert('No phone number on file for this contact.')
      return
    }
    setSendingUploadLink(true)
    try {
      const linkRes = await fetch('/api/upload-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: selectedId }),
      })
      if (!linkRes.ok) { alert('Could not generate link'); return }
      const { token } = await linkRes.json()
      const url = `${window.location.origin}/u/${token}`
      const body = `For full-quality photos & videos, upload here: ${url}`
      const smsRes = await fetch('/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: conv.phone, body, contactId: selectedId }),
      })
      if (smsRes.ok) {
        loadMessages(selectedId)
        loadConversations()
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
    if (!msgText.trim() || !selectedId) return
    setSending(true)
    try {
      if (msgTab === 'internal') {
        const res = await fetch('/api/messages/internal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contactId: selectedId, body: msgText }),
        })
        if (res.ok) { setMsgText(''); loadMessages(selectedId) }
      } else if (msgTab === 'email') {
        if (!contactInfo?.email) {
          alert('No email on file for this contact.')
          setSending(false)
          return
        }
        if (!emailSubject.trim()) {
          alert('Subject required.')
          setSending(false)
          return
        }
        const res = await fetch('/api/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contactId: selectedId,
            to: contactInfo.email,
            subject: emailSubject,
            bodyText: msgText,
          }),
        })
        if (res.ok) {
          setMsgText('')
          setEmailSubject('')
          loadMessages(selectedId)
        } else {
          const err = await res.json().catch(() => ({}))
          alert(`Email failed: ${err.error || res.status}`)
        }
      } else {
        const conv = conversations.find(c => c.contactId === selectedId)
        if (!conv?.phone) return
        const res = await fetch('/api/sms/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: conv.phone, body: msgText, contactId: selectedId }),
        })
        if (res.ok) { setMsgText(''); loadMessages(selectedId) }
      }
    } catch (e) { console.error(e) }
    setSending(false)
    loadConversations()
  }

  const filtered = search
    ? conversations.filter(c => c.contactName.toLowerCase().includes(search.toLowerCase()) || c.phone?.includes(search))
    : conversations

  return (
    <div style={{ height: '100vh', display: 'flex', margin: '-40px -32px -40px -32px' }}>
      {/* Left: Conversation list */}
      <div style={{ width: 280, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: '#fff' }}>
        {/* Header */}
        <div style={{ padding: '16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>Conversations</h1>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search conversations..."
            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}
          />
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <p style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Loading...</p>
          ) : filtered.length === 0 ? (
            <p style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              {search ? 'No conversations match.' : 'No conversations yet.'}
            </p>
          ) : (
            filtered.map(c => (
              <div
                key={c.contactId}
                onClick={() => selectConversation(c.contactId, c.contactName, c.phone)}
                style={{
                  padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid var(--border)',
                  background: selectedId === c.contactId ? '#f0f7ff' : '#fff',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (selectedId !== c.contactId) e.currentTarget.style.background = '#f9fafb' }}
                onMouseLeave={e => { if (selectedId !== c.contactId) e.currentTarget.style.background = '#fff' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', background: '#8b5cf6', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 700, flexShrink: 0,
                  }}>
                    {c.contactName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 14, fontWeight: c.unread > 0 ? 700 : 500 }}>{c.contactName}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{formatTimeAgo(c.lastAt)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                      <p style={{
                        fontSize: 12, color: c.unread > 0 ? 'var(--text-primary)' : 'var(--text-muted)',
                        fontWeight: c.unread > 0 ? 600 : 400,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0,
                      }}>
                        {c.lastDirection === 'outbound' && 'You: '}{c.lastMessage}
                      </p>
                      {c.unread > 0 && (
                        <span style={{
                          background: '#2563eb', color: '#fff', fontSize: 10, fontWeight: 700,
                          width: 18, height: 18, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginLeft: 8,
                        }}>{c.unread}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right: Message thread */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fff' }}>
        {!selectedId ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Select a conversation</p>
              <p style={{ fontSize: 13 }}>Choose a contact from the left to view messages</p>
            </div>
          </div>
        ) : (
          <>
            {/* Contact header */}
            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%', background: '#8b5cf6', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
              }}>
                {contactInfo?.firstName?.[0]}{contactInfo?.lastName?.[0]}
              </div>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{contactInfo?.firstName} {contactInfo?.lastName}</span>
                {contactInfo?.phone && <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>{contactInfo.phone}</span>}
              </div>
              <button onClick={() => router.push(`/contacts/${selectedId}?from=/conversations`)} style={{
                padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)',
                background: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: 'var(--text-secondary)',
              }}>View Contact</button>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', background: '#f9fafb' }}>
              {messages.length === 0 && (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
                  <p style={{ fontSize: 14, fontWeight: 500 }}>No messages yet</p>
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
                      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}>
                        <div style={{
                          maxWidth: '85%', width: '100%', padding: '10px 14px', borderRadius: 10,
                          background: '#fefce8', border: '1px solid #fde047',
                        }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#a16207', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Internal Note</span>
                          <p style={{ fontSize: 13, lineHeight: 1.4, margin: '4px 0 0', color: '#92400e', wordBreak: 'break-word' }}>{msg.body}</p>
                          <p style={{ fontSize: 10, margin: '4px 0 0', color: '#a16207', opacity: 0.7 }}>
                            {new Date(msg.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                            {msg.sender && ` · ${msg.sender.name}`}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', justifyContent: msg.direction === 'outbound' ? 'flex-end' : 'flex-start', marginBottom: 6 }}>
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
                                      style={{ display: 'block', maxWidth: '100%', maxHeight: 280, borderRadius: 8 }} />
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
                            <p style={{ fontSize: 14, lineHeight: 1.4, margin: 0, wordBreak: 'break-word' }}>{msg.body}</p>
                          )}
                          <p style={{ fontSize: 10, margin: '4px 0 0', opacity: 0.5 }}>
                            {new Date(msg.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                            {msg.sender && ` · ${msg.sender.name}`}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Compose — slim card matching contact-detail style */}
            <div style={{ borderTop: '1px solid var(--border)', background: 'transparent', padding: '8px 12px 10px' }}>
              <div style={{
                border: '1px solid var(--border)', borderRadius: 10,
                background: internalMode ? '#fefce8' : '#fff',
                overflow: 'visible',
              }}>
                {/* Top row: channel dropdown + minimize (only when expanded) */}
                {!composeMinimized && (
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '3px 8px', background: internalMode ? '#fefce8' : '#f5f7fb',
                    fontSize: 13, minHeight: 30,
                    borderTopLeftRadius: 9, borderTopRightRadius: 9,
                  }}>
                    <ConvChannelDropdown
                      channel={channel} setChannel={setChannel}
                      open={showChannelMenu} setOpen={setShowChannelMenu}
                    />
                    <button data-tip="Minimize" onClick={() => setComposeMinimized(true)} style={iconBtn}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    </button>
                  </div>
                )}

                {/* From/To row */}
                {!internalMode && !composeMinimized && (
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
                        ? (contactInfo?.phone || '—')
                        : (contactInfo?.email || '—')}
                    </span>
                  </div>
                )}

                {/* Subject row (email only) */}
                {!internalMode && !composeMinimized && channel === 'email' && (
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

                {/* Attached files chips */}
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

                {/* Body */}
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
                        onClick={sendUploadLink}
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
                        data-tip="Send"
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
                  </div>
                )}

                {/* Minimized layout */}
                {composeMinimized && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px' }}>
                    <ConvChannelDropdown
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
                    <button data-tip="Expand" onClick={() => setComposeMinimized(false)} style={iconBtn}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></svg>
                    </button>
                    <button
                      onClick={sendMessage}
                      disabled={sending || !msgText.trim()}
                      data-tip="Send"
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
          </>
        )}
      </div>
    </div>
  )
}

type ConvChannel = 'sms' | 'email' | 'internal'

function ConvChannelDropdown({
  channel, setChannel, open, setOpen, popUp,
}: {
  channel: ConvChannel
  setChannel: (c: ConvChannel) => void
  open: boolean
  setOpen: (next: boolean | ((prev: boolean) => boolean)) => void
  popUp?: boolean
}) {
  const labels: Record<ConvChannel, string> = { sms: 'SMS', email: 'Email', internal: 'Internal Comment' }
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
          ...(popUp ? { bottom: '100%', marginBottom: 6 } : { top: '100%', marginTop: 4 }),
          left: 0,
          background: '#fff', border: '1px solid var(--border)', borderRadius: 10,
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)', minWidth: 180, zIndex: 30, overflow: 'hidden',
        }}>
          {(['sms', 'email', 'internal'] as ConvChannel[]).map(opt => (
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
