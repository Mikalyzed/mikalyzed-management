'use client'

/**
 * The app's confirm/info dialog — replaces window.confirm / window.alert
 * (native popups are off-brand and look terrible on iOS).
 *
 * Usage: hold a `ConfirmState | null` in state, render <ConfirmDialog
 * state={confirm} onClose={() => setConfirm(null)} />. Set `hideCancel` for
 * info-only dialogs.
 */
export type ConfirmState = {
  title: string
  message?: string
  confirmLabel?: string
  tone?: 'danger' | 'primary'
  hideCancel?: boolean
  onConfirm?: () => void
}

export default function ConfirmDialog({ state, onClose }: {
  state: ConfirmState | null
  onClose: () => void
}) {
  if (!state) return null
  const danger = state.tone === 'danger'
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 10050,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        role="alertdialog"
        style={{
          background: '#fff', borderRadius: 16, width: '100%', maxWidth: 380,
          padding: '22px 22px 18px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        }}
      >
        <p style={{ fontSize: 15.5, fontWeight: 700, letterSpacing: '-0.01em', margin: 0, lineHeight: 1.35 }}>
          {state.title}
        </p>
        {state.message && (
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '8px 0 0', lineHeight: 1.5 }}>
            {state.message}
          </p>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          {!state.hideCancel && (
            <button
              onClick={onClose}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 10, border: '1px solid var(--border)',
                background: '#fff', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', minHeight: 0,
                color: 'var(--text-primary)',
              }}
            >Cancel</button>
          )}
          <button
            onClick={() => { state.onConfirm?.(); onClose() }}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 10, minHeight: 0, cursor: 'pointer',
              fontSize: 13.5, fontWeight: 650,
              background: danger ? '#fdecef' : '#eaf0fe',
              color: danger ? '#b91c1c' : '#1d4ed8',
              border: danger ? '1px solid #fecaca' : '1px solid #bfd3fc',
            }}
          >{state.confirmLabel ?? (state.hideCancel ? 'OK' : 'Confirm')}</button>
        </div>
      </div>
    </div>
  )
}
