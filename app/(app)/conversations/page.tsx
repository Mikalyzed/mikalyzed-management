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
  id: string; direction: string; channel: string; body: string; mediaUrl: string | null
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
  const [msgTab, setMsgTab] = useState<'sms' | 'internal'>('sms')
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
  }

  useEffect(() => {
    if (!selectedId) return
    const interval = setInterval(() => loadMessages(selectedId), 10000)
    return () => clearInterval(interval)
  }, [selectedId])

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
      <div style={{ width: 340, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: '#fff' }}>
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
              <button onClick={() => router.push(`/contacts/${selectedId}`)} style={{
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
                          <p style={{ fontSize: 14, lineHeight: 1.4, margin: 0, wordBreak: 'break-word' }}>{msg.body}</p>
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

            {/* Compose */}
            <div style={{ borderTop: '1px solid var(--border)', background: '#fff' }}>
              <div style={{ display: 'flex', padding: '0 20px', borderBottom: '1px solid var(--border)' }}>
                {[
                  { key: 'sms' as const, label: 'SMS' },
                  { key: 'internal' as const, label: 'Internal Note' },
                ].map(tab => (
                  <button key={tab.key} onClick={() => setMsgTab(tab.key)} style={{
                    padding: '10px 16px', fontSize: 13, fontWeight: 600, border: 'none', background: 'none', cursor: 'pointer',
                    borderBottom: msgTab === tab.key ? '2px solid #2563eb' : '2px solid transparent',
                    color: msgTab === tab.key ? '#2563eb' : 'var(--text-muted)',
                  }}>{tab.label}</button>
                ))}
              </div>
              <div style={{ padding: '12px 20px', display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                <textarea
                  value={msgText} onChange={e => setMsgText(e.target.value)}
                  placeholder={msgTab === 'internal' ? 'Add an internal note...' : 'Type a message...'}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                  rows={2}
                  style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14, outline: 'none', resize: 'none', fontFamily: 'inherit' }}
                />
                <button onClick={sendMessage} disabled={sending || !msgText.trim()} style={{
                  padding: '10px 20px', borderRadius: 10, border: 'none',
                  background: '#1a1a1a', color: '#dffd6e', fontSize: 14, fontWeight: 600,
                  cursor: 'pointer', opacity: sending || !msgText.trim() ? 0.5 : 1, whiteSpace: 'nowrap',
                }}>
                  {sending ? '...' : 'Send'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
