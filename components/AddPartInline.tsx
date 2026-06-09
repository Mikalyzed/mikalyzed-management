'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Inline part-add form used on both the recon board modal and the mechanic
 * board modal.  Type a name, press Add — the form expands to reveal an
 * optional link and an optional "assign to find" dropdown so the dealer can
 * route sourcing to whoever should hunt the part down.  A second Add press
 * (or Save) commits the request via POST /api/parts.
 *
 * Matches the visual language of the Add Task inline form on the recon modal:
 * a single bar with the dark satin pill submit.
 */
export default function AddPartInline({
  vehicleId,
  sourceItem,
  onAdded,
}: {
  vehicleId: string
  sourceItem?: string
  onAdded?: () => void
}) {
  const [name, setName] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [url, setUrl] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [saving, setSaving] = useState(false)
  const [users, setUsers] = useState<{ id: string; name: string }[]>([])
  const expandedRef = useRef<HTMLDivElement | null>(null)

  // When the form expands, the new fields can be off-screen inside a small
  // modal scroll container — scroll them into view so the user sees them
  // appear instead of wondering why nothing visibly happened.
  useEffect(() => {
    if (!expanded) return
    requestAnimationFrame(() => {
      expandedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }, [expanded])

  // Load assignable users only when the form expands — keeps the initial
  // network hit off the modal-open path for vehicles that never add parts.
  useEffect(() => {
    if (!expanded || users.length > 0) return
    fetch('/api/users')
      .then((r) => r.json())
      .then((d) => {
        const all = d.users || d
        setUsers(
          (all || [])
            .filter((u: { isActive?: boolean }) => u.isActive !== false)
            .map((u: { id: string; name: string }) => ({ id: u.id, name: u.name })),
        )
      })
      .catch(() => {})
  }, [expanded, users.length])

  function reset() {
    setName('')
    setUrl('')
    setAssigneeId('')
    setExpanded(false)
  }

  async function save() {
    if (!name.trim() || saving) return
    setSaving(true)
    try {
      await fetch('/api/parts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleId,
          name: name.trim(),
          url: url.trim() || null,
          assignedToId: assigneeId || null,
          ...(sourceItem ? { sourceItem } : {}),
        }),
      })
      reset()
      onAdded?.()
    } finally {
      setSaving(false)
    }
  }

  function handlePrimaryClick() {
    if (!name.trim()) return
    if (!expanded) {
      setExpanded(true)
      return
    }
    save()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          handlePrimaryClick()
        }}
        style={{ display: 'flex', gap: 8 }}
      >
        <input
          name="newPart"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="+ Add part..."
          style={{
            flex: 1,
            padding: '9px 12px',
            borderRadius: 10,
            border: '1px solid #e5e5e5',
            fontSize: 13,
            background: '#fff',
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={!name.trim() || saving}
          style={{
            padding: '9px 16px',
            borderRadius: 10,
            border: 'none',
            background: '#1a1a1a',
            color: '#dffd6e',
            fontSize: 13,
            fontWeight: 700,
            cursor: !name.trim() || saving ? 'default' : 'pointer',
            whiteSpace: 'nowrap',
            minHeight: 'auto',
            opacity: !name.trim() || saving ? 0.5 : 1,
            transition: 'opacity 140ms ease',
          }}
        >
          {expanded ? (saving ? 'Saving…' : 'Save') : 'Add'}
        </button>
      </form>

      {expanded && (
        <div
          ref={expandedRef}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            padding: '10px 12px',
            background: '#f8f8f6',
            border: '1px solid #e5e5e5',
            borderRadius: 10,
            scrollMarginBottom: 24,
          }}
        >
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>
            Link <span style={{ fontWeight: 400 }}>(optional — if you have it)</span>
          </label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            style={{
              padding: '8px 10px',
              borderRadius: 8,
              border: '1px solid #e5e5e5',
              fontSize: 12,
              background: '#fff',
              outline: 'none',
            }}
          />

          <label
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--text-muted)',
              marginTop: 4,
            }}
          >
            Assign to find{' '}
            <span style={{ fontWeight: 400 }}>(optional — if you don&apos;t have a link)</span>
          </label>
          <select
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            style={{
              padding: '8px 10px',
              borderRadius: 8,
              border: '1px solid #e5e5e5',
              fontSize: 12,
              background: '#fff',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="">— Unassigned —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
            <button
              type="button"
              onClick={reset}
              style={{
                padding: '6px 10px',
                borderRadius: 8,
                border: 'none',
                background: 'transparent',
                color: 'var(--text-muted)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                minHeight: 'auto',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
