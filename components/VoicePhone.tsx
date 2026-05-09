'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Device, Call as TwilioCall } from '@twilio/voice-sdk'

type CallState = 'idle' | 'connecting' | 'ringing' | 'in-call' | 'incoming' | 'ending'

type VoicePhoneAPI = {
  callContact: (opts: { to: string; contactId?: string; ownerId: string; fromNumber: string }) => Promise<void>
  hangup: () => void
  state: CallState
  durationSeconds: number
  remoteLabel: string | null
}

let _api: VoicePhoneAPI | null = null
export function getVoicePhoneAPI(): VoicePhoneAPI | null { return _api }

/**
 * Singleton-ish browser voice device. Mounts at the app shell, registers a
 * Twilio Device on session start, and exposes a small imperative API for the
 * Call button on contact pages.
 */
export default function VoicePhone() {
  const [state, setState] = useState<CallState>('idle')
  const [durationSeconds, setDurationSeconds] = useState(0)
  const [remoteLabel, setRemoteLabel] = useState<string | null>(null)
  const [muted, setMuted] = useState(false)
  const deviceRef = useRef<Device | null>(null)
  const activeCallRef = useRef<TwilioCall | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startedRef = useRef<number | null>(null)

  // Boot device on mount
  useEffect(() => {
    let cancelled = false
    async function boot() {
      try {
        const r = await fetch('/api/voice/token')
        if (!r.ok) return
        const { token } = await r.json()
        if (cancelled) return
        const device = new Device(token, {
          logLevel: 1,
          codecPreferences: [TwilioCall.Codec.Opus, TwilioCall.Codec.PCMU],
        })
        device.on('error', e => console.warn('[voice] device error', e?.message))
        device.on('incoming', incoming => {
          activeCallRef.current = incoming
          setRemoteLabel(incoming.parameters.From || 'Unknown')
          setState('incoming')
          incoming.on('accept', () => { setState('in-call'); startTick() })
          incoming.on('disconnect', () => { resetCall() })
          incoming.on('cancel', () => { resetCall() })
          incoming.on('reject', () => { resetCall() })
        })
        await device.register()
        deviceRef.current = device
      } catch (e) {
        console.warn('[voice] boot failed', e)
      }
    }
    boot()
    return () => {
      cancelled = true
      activeCallRef.current?.disconnect()
      deviceRef.current?.destroy()
      stopTick()
    }
  }, [])

  function startTick() {
    startedRef.current = Date.now()
    setDurationSeconds(0)
    if (tickRef.current) clearInterval(tickRef.current)
    tickRef.current = setInterval(() => {
      if (startedRef.current) setDurationSeconds(Math.floor((Date.now() - startedRef.current) / 1000))
    }, 1000)
  }
  function stopTick() {
    if (tickRef.current) clearInterval(tickRef.current)
    tickRef.current = null
    startedRef.current = null
  }
  const resetCall = useCallback(() => {
    activeCallRef.current = null
    setState('idle')
    setRemoteLabel(null)
    setMuted(false)
    stopTick()
  }, [])

  const callContact = useCallback(async (opts: { to: string; contactId?: string; ownerId: string; fromNumber: string }) => {
    if (!deviceRef.current) {
      alert('Voice device is still loading. Try again in a moment.')
      return
    }
    if (activeCallRef.current) {
      alert('Already on a call.')
      return
    }
    setRemoteLabel(opts.to)
    setState('connecting')
    try {
      const call = await deviceRef.current.connect({
        params: {
          To: opts.to,
          ownerId: opts.ownerId,
          fromNumber: opts.fromNumber,
          contactId: opts.contactId || '',
        },
      })
      activeCallRef.current = call
      call.on('ringing', () => setState('ringing'))
      call.on('accept', () => { setState('in-call'); startTick() })
      call.on('disconnect', () => resetCall())
      call.on('cancel', () => resetCall())
      call.on('reject', () => resetCall())
      call.on('error', e => console.warn('[voice] call error', e?.message))
    } catch (e) {
      console.error('[voice] connect failed', e)
      resetCall()
    }
  }, [resetCall])

  const hangup = useCallback(() => {
    setState('ending')
    activeCallRef.current?.disconnect()
  }, [])

  const accept = useCallback(() => {
    activeCallRef.current?.accept()
  }, [])
  const reject = useCallback(() => {
    activeCallRef.current?.reject()
    resetCall()
  }, [resetCall])

  const toggleMute = useCallback(() => {
    if (!activeCallRef.current) return
    const next = !muted
    activeCallRef.current.mute(next)
    setMuted(next)
  }, [muted])

  // Expose imperative API for Call buttons elsewhere
  useEffect(() => { _api = { callContact, hangup, state, durationSeconds, remoteLabel } }, [callContact, hangup, state, durationSeconds, remoteLabel])

  if (state === 'idle') return null

  const formatDur = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`
  const isIncoming = state === 'incoming'

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 100,
      width: 280, padding: 14, borderRadius: 12,
      background: '#1a1a1a', color: '#fff',
      boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
      fontFamily: 'inherit',
    }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: '#dffd6e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
        {isIncoming ? 'Incoming Call' : state === 'connecting' ? 'Calling…' : state === 'ringing' ? 'Ringing…' : state === 'ending' ? 'Hanging up…' : 'On call'}
      </p>
      <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 4, wordBreak: 'break-all' }}>
        {remoteLabel || '—'}
      </p>
      {state === 'in-call' && (
        <p style={{ fontSize: 13, color: '#a3a3a3', marginBottom: 12, fontVariantNumeric: 'tabular-nums' }}>
          {formatDur(durationSeconds)}
        </p>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        {isIncoming ? (
          <>
            <button onClick={accept} style={callBtn('#22c55e')}>Accept</button>
            <button onClick={reject} style={callBtn('#dc2626')}>Reject</button>
          </>
        ) : (
          <>
            {state === 'in-call' && (
              <button onClick={toggleMute} style={callBtn(muted ? '#f59e0b' : '#3a3a3a')}>
                {muted ? 'Muted' : 'Mute'}
              </button>
            )}
            <button onClick={hangup} style={callBtn('#dc2626')}>Hang Up</button>
          </>
        )}
      </div>
    </div>
  )
}

function callBtn(bg: string): React.CSSProperties {
  return {
    flex: 1, padding: '8px 12px', borderRadius: 8, border: 'none',
    background: bg, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
    minHeight: 36,
  }
}
