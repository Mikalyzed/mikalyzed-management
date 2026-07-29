'use client'

import { useEffect, useState } from 'react'
import ExternalRepairModal from '@/components/ExternalRepairModal'
import PartDetailModal from '@/components/PartDetailModal'
import RouteVehicleModal from '@/components/RouteVehicleModal'
import ConfirmDialog, { type ConfirmState } from '@/components/ConfirmDialog'

type Fix =
  | { kind: 'external_return_date'; externalId: string }
  | { kind: 'external_mark_sent'; externalId: string }
  | { kind: 'clear_awaiting_parts'; stageId: string }
  | { kind: 'part_status'; partId: string }
  | { kind: 'reschedule_stage'; stageId: string }
  | { kind: 'install_tasks'; vehicleId: string; canCreate: boolean; parts: Array<{ id: string; name: string }> }
  | { kind: 'confirm_received'; partId: string }
  | { kind: 'remove_task'; stageId: string; idx: number; item: string }
  | { kind: 'send_to_mechanic'; vehicleId: string; partId: string }

type Item = {
  severity: 'crit' | 'warn'
  stock: string | null
  vehicle: string | null
  where: string | null
  issue: string
  detail: string
  fix?: Fix
}

const DAY_MS = 86400000

const blueBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  flex: 1, // one action fills the card; two split 50/50; three split thirds
  background: '#eaf0fe', color: '#1d4ed8', border: '1px solid #bfd3fc',
  borderRadius: 9, padding: '6px 13px', fontSize: 12.5, fontWeight: 650,
  cursor: 'pointer', minHeight: 0, whiteSpace: 'nowrap',
}
const greenBtn: React.CSSProperties = {
  ...blueBtn, background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0',
}
const redBtn: React.CSSProperties = {
  ...blueBtn, background: '#fdecef', color: '#b91c1c', border: '1px solid #fecaca',
}

/**
 * Shop Watchlist — the morning meeting's rule catches as their own page, with
 * the fix executable right on each card. Cards drop off as the data is fixed.
 */
export default function WatchlistPage() {
  const [items, setItems] = useState<Item[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [externalId, setExternalId] = useState<string | null>(null)
  const [partId, setPartId] = useState<string | null>(null)
  const [routeVehicleId, setRouteVehicleId] = useState<string | null>(null)
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)
  const [expandedParts, setExpandedParts] = useState<Set<number>>(new Set())
  const [role, setRole] = useState('')

  const notify = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(t => (t === msg ? null : t)), 5000)
  }

  const load = () => fetch('/api/watchlist')
    .then(r => r.json())
    .then(d => { setItems(d.bottlenecks || []); setRole(d.role || '') })
    .catch(() => setItems([]))

  useEffect(() => { load() }, [])

  const run = async (fn: () => Promise<Response | null>, okMsg = 'Fixed — it drops off the list.') => {
    setBusy(true)
    try {
      const res = await fn()
      if (res?.ok) { notify(okMsg); await load() }
      else {
        const d = res ? await res.json().catch(() => ({})) : {}
        notify((d as { error?: string }).error || 'That fix did not go through.')
      }
    } finally { setBusy(false) }
  }

  const removeTask = (fix: Extract<Fix, { kind: 'remove_task' }>) => run(async () => {
    const stageRes = await fetch(`/api/stages/${fix.stageId}`)
    if (!stageRes.ok) return stageRes
    const { stage } = await stageRes.json()
    const checklist = Array.isArray(stage.checklist) ? [...stage.checklist] : []
    if (checklist[fix.idx]?.item !== fix.item) {
      notify('That checklist changed — refreshing.')
      await load()
      return null
    }
    checklist.splice(fix.idx, 1)
    return fetch(`/api/stages/${fix.stageId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checklist }),
    })
  }, 'Task removed.')

  /** Stranded part → mechanic, with the dashboard's ask-first 409 handling. */
  const sendToMechanic = async (vehicleId: string, vehicleLabel: string, partId: string) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/vehicles/${vehicleId}/send-to-mechanic`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partIds: [partId] }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) {
        notify(`${vehicleLabel} is in the Mechanic lane with its install task — assign it from the dashboard or recon board.`)
        await load()
      } else if (d.code === 'in_recon') {
        setConfirmState({
          title: `Car is in recon at ${d.stage}`,
          message: `${vehicleLabel} is mid-stage. Open routing to move it to mechanic? The install tasks pre-fill.`,
          confirmLabel: 'Open Routing',
          onConfirm: () => setRouteVehicleId(vehicleId),
        })
      } else if (d.code === 'external') {
        setConfirmState({
          title: `Car is at ${d.shop}`,
          message: `${vehicleLabel}${d.expectedBack ? ` is expected back ${d.expectedBack}.` : ' is out at the shop.'} The install is queued — it surfaces automatically in routing when the car returns.`,
          hideCancel: true,
        })
      } else {
        notify(d.error || 'Could not send to mechanic.')
      }
    } finally { setBusy(false) }
  }

  const actionsFor = (it: Item) => {
    const f = it.fix
    if (!f) return null
    switch (f.kind) {
      case 'external_return_date':
      case 'external_mark_sent':
        return <button style={blueBtn} disabled={busy} onClick={() => setExternalId(f.externalId)}>Open ›</button>
      case 'part_status':
        return <button style={blueBtn} disabled={busy} onClick={() => setPartId(f.partId)}>Open ›</button>
      case 'confirm_received':
        return (
          <>
            <button
              style={greenBtn} disabled={busy}
              onClick={() => run(() => fetch(`/api/parts/${f.partId}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'received' }),
              }))}
            >✓ Received</button>
            <button style={blueBtn} disabled={busy} onClick={() => setPartId(f.partId)}>Open ›</button>
          </>
        )
      case 'clear_awaiting_parts':
        return (
          <button
            style={greenBtn} disabled={busy}
            onClick={() => run(() => fetch(`/api/stages/${f.stageId}`, {
              method: 'PATCH', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ awaitingParts: false }),
            }), 'Flag cleared — the mechanic can resume.')}
          >✓ Parts Are Here — Resume</button>
        )
      case 'reschedule_stage':
        return (
          <>
            {[{ d: 1, l: '+1d' }, { d: 3, l: '+3d' }, { d: 7, l: '+1wk' }].map(o => (
              <button
                key={o.d} style={blueBtn} disabled={busy}
                onClick={() => run(() => fetch(`/api/stages/${f.stageId}`, {
                  method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ scheduledDate: new Date(Date.now() + o.d * DAY_MS).toISOString() }),
                }), 'Rescheduled.')}
              >{o.l}</button>
            ))}
          </>
        )
      case 'install_tasks':
        return f.canCreate ? (
          <button
            style={greenBtn} disabled={busy}
            onClick={() => run(() => fetch('/api/parts/install-tasks', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ vehicleId: f.vehicleId, partIds: f.parts.map(p => p.id), mode: 'create' }),
            }), 'Install tasks created.')}
          >✓ Create Install Tasks</button>
        ) : null
      case 'send_to_mechanic':
        return (
          <button
            style={blueBtn} disabled={busy}
            onClick={() => sendToMechanic(f.vehicleId, it.vehicle ?? 'This car', f.partId)}
          >→ Add Vehicle to Recon</button>
        )
      case 'remove_task':
        return (
          <button
            style={redBtn} disabled={busy}
            onClick={() => setConfirmState({
              title: 'Remove this task?',
              message: `"${f.item}" comes off the mechanic checklist. The part-flow install task stays.`,
              confirmLabel: 'Remove Task', tone: 'danger',
              onConfirm: () => removeTask(f),
            })}
          >Remove Task</button>
        )
      default:
        return null
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>Boards</div>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', margin: '2px 0 0' }}>Issues Detected</h1>
        </div>
        {items && (
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>
            {items.length === 0 ? 'All clear ✓' : `${items.length} detected — same rules as the morning meeting`}
          </span>
        )}
      </div>

      {!items ? (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</p>
      ) : items.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          No issues detected — every rule passes right now. ✓
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(330px, 100%), 1fr))', gap: 12 }}>
          {items.map((it, i) => (
            <div key={i} className="card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                {it.stock && (
                  <span style={{
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                    fontSize: 10.5, fontWeight: 600, color: 'var(--text-secondary)',
                    background: 'var(--bg-primary, #f8f8f6)', border: '1px solid var(--border)',
                    padding: '1px 6px', borderRadius: 6, whiteSpace: 'nowrap',
                  }}>#{it.stock}</span>
                )}
                <span style={{ flex: 1 }} />
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 650,
                  padding: '2px 9px', borderRadius: 100, whiteSpace: 'nowrap',
                  color: it.severity === 'crit' ? '#b91c1c' : '#b45309',
                  background: it.severity === 'crit' ? '#fdecef' : '#fdf3e7',
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: it.severity === 'crit' ? '#e11d48' : '#f59e0b' }} />
                  {it.severity === 'crit' ? 'Critical' : 'Watch'}
                </span>
              </div>
              <p style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: '-0.01em', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {it.vehicle ?? '—'}
              </p>
              <p style={{ fontSize: 12.5, fontWeight: 650, color: it.severity === 'crit' ? '#b91c1c' : '#b45309', margin: '2px 0 0' }}>
                {it.issue}
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0', lineHeight: 1.5, flex: 1 }}>
                {it.detail}
              </p>
              {it.where && (
                <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '6px 0 0' }}>Now: {it.where}</p>
              )}
              {it.fix?.kind === 'install_tasks' && it.fix.parts.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <button
                    onClick={() => setExpandedParts(prev => {
                      const next = new Set(prev)
                      if (next.has(i)) next.delete(i); else next.add(i)
                      return next
                    })}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      background: 'none', border: 'none', padding: 0, minHeight: 0, cursor: 'pointer',
                      fontSize: 12, fontWeight: 650, color: '#1d4ed8',
                    }}
                  >
                    {expandedParts.has(i) ? '▾ Hide parts' : `▸ Show ${it.fix.parts.length} parts`}
                  </button>
                  {expandedParts.has(i) && (
                    <div style={{ border: '1px solid var(--border-light, #f0f0ec)', borderRadius: 8, marginTop: 6, overflow: 'hidden' }}>
                      {it.fix.parts.map(pt => (
                        <div key={pt.id} style={{ padding: '6px 10px', fontSize: 12, borderBottom: '1px solid var(--border-light, #f0f0ec)', lineHeight: 1.4 }}>
                          {pt.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {actionsFor(it) && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                  {actionsFor(it)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {toast && (
        <div role="status" style={{
          position: 'fixed', left: '50%', bottom: 28, transform: 'translateX(-50%)', zIndex: 1400,
          maxWidth: 'min(560px, calc(100vw - 32px))',
          background: '#1a1a1a', color: '#fff', borderRadius: 12, padding: '12px 18px',
          fontSize: 13, fontWeight: 500, lineHeight: 1.45,
          boxShadow: '0 8px 24px rgba(24,24,27,0.28)',
        }}>{toast}</div>
      )}

      {externalId && (
        <ExternalRepairModal externalId={externalId} onClose={() => setExternalId(null)} onChanged={load} />
      )}
      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
      {routeVehicleId && (
        <RouteVehicleModal
          vehicleId={routeVehicleId}
          onClose={() => setRouteVehicleId(null)}
          onRouted={async () => { setRouteVehicleId(null); await load() }}
        />
      )}
      {partId && (
        <PartDetailModal
          partId={partId}
          isAdmin={role === 'admin'}
          role={role}
          onClose={() => setPartId(null)}
          onChanged={load}
        />
      )}
    </div>
  )
}
