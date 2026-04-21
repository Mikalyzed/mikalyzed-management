'use client'

import { useEffect, useState } from 'react'
import VehicleSearch from '@/components/VehicleSearch'

type Entry = {
  id: string; vin6: string; carName: string
  wipeDown: boolean; tirePressure: boolean; matUnderCar: boolean; charger: boolean
  startedAt: string | null; finishedAt: string | null
  completedAt: string | null; createdAt: string
}

type PorterTask = {
  id: string; title: string; notes: string | null; status: string
  startedAt: string | null; completedAt: string | null; createdAt: string
  assignedTo: { id: string; name: string } | null
  createdBy: { id: string; name: string } | null
}

const CHECKS = [
  { key: 'wipeDown', label: 'Wipe Down' },
  { key: 'tirePressure', label: 'Tire Pressure' },
  { key: 'matUnderCar', label: 'Mat Under Car' },
  { key: 'charger', label: 'Charger' },
] as const

export default function PorterPage() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [tasks, setTasks] = useState<PorterTask[]>([])
  const [loading, setLoading] = useState(true)
  const [vin6, setVin6] = useState('')
  const [carName, setCarName] = useState('')
  const [newTask, setNewTask] = useState('')
  const [saving, setSaving] = useState(false)
  const [tick, setTick] = useState(0)
  const [isAdmin, setIsAdmin] = useState(false)
  const [view, setView] = useState<'today' | 'week'>('today')
  const [weeklyEntries, setWeeklyEntries] = useState<Entry[]>([])
  const [weeklyTasks, setWeeklyTasks] = useState<PorterTask[]>([])

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => {
      if (d.user?.role === 'admin') setIsAdmin(true)
    })
  }, [])

  // Timer tick every second
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  function formatDuration(startedAt: string | null, finishedAt: string | null) {
    if (!startedAt) return '--:--'
    const start = new Date(startedAt).getTime()
    const end = finishedAt ? new Date(finishedAt).getTime() : Date.now()
    const secs = Math.floor((end - start) / 1000)
    const m = Math.floor(secs / 60)
    const s = secs % 60
    if (m >= 60) {
      const h = Math.floor(m / 60)
      return `${h}h ${m % 60}m`
    }
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  function load() {
    fetch('/api/porter').then(r => r.json()).then(d => {
      setEntries(d.entries || [])
      setTasks(d.tasks || [])
      setWeeklyEntries(d.weeklyEntries || [])
      setWeeklyTasks(d.weeklyTasks || [])
      setLoading(false)
    })
  }

  useEffect(() => { load() }, [])

  async function addCar() {
    if (!vin6.trim() || !carName.trim()) return
    setSaving(true)
    await fetch('/api/porter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'addCar', vin6, carName }),
    })
    setVin6(''); setCarName('')
    setSaving(false)
    load()
  }

  async function toggle(entryId: string, field: string) {
    await fetch('/api/porter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'toggle', entryId, field }),
    })
    load()
  }

  async function startTimer(entryId: string) {
    await fetch('/api/porter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'startTimer', entryId }),
    })
    load()
  }

  async function stopTimer(entryId: string) {
    await fetch('/api/porter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'stopTimer', entryId }),
    })
    load()
  }

  async function deleteEntry(entryId: string) {
    if (!confirm('Remove this car?')) return
    await fetch('/api/porter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'deleteEntry', entryId }),
    })
    load()
  }

  async function addTask() {
    if (!newTask.trim()) return
    await fetch('/api/porter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'addTask', title: newTask }),
    })
    setNewTask('')
    load()
  }

  async function startTask(taskId: string) {
    await fetch('/api/porter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'startTask', taskId }),
    })
    load()
  }

  async function completeTask(taskId: string) {
    await fetch('/api/porter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'completeTask', taskId }),
    })
    load()
  }

  async function toggleTask(taskId: string) {
    await fetch('/api/porter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'toggleTask', taskId }),
    })
    load()
  }

  async function deleteTask(taskId: string) {
    if (!confirm('Delete this task?')) return
    await fetch('/api/porter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'deleteTask', taskId }),
    })
    load()
  }

  const pending = entries.filter(e => !e.completedAt)
  const completed = entries.filter(e => e.completedAt)

  if (loading) return <p style={{ color: 'var(--text-muted)', padding: 40, textAlign: 'center' }}>Loading...</p>

  const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'in_progress')
  const completedTasks = tasks.filter(t => t.status === 'completed')

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>
          {isAdmin ? 'Porter' : 'My Tasks'}
        </h1>
        {isAdmin && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setView('today')} style={{
              padding: '6px 16px', borderRadius: 8,
              border: `1px solid ${view === 'today' ? '#1a1a1a' : 'var(--border)'}`,
              background: view === 'today' ? '#1a1a1a' : '#fff',
              color: view === 'today' ? '#dffd6e' : 'var(--text-secondary)',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>Today</button>
            <button onClick={() => setView('week')} style={{
              padding: '6px 16px', borderRadius: 8,
              border: `1px solid ${view === 'week' ? '#1a1a1a' : 'var(--border)'}`,
              background: view === 'week' ? '#1a1a1a' : '#fff',
              color: view === 'week' ? '#dffd6e' : 'var(--text-secondary)',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>This Week</button>
          </div>
        )}
      </div>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 24 }}>
        {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
      </p>

      {/* Weekly View — Admin only */}
      {isAdmin && view === 'week' && (() => {
        // Group by day
        const dayMap: Record<string, { entries: Entry[]; tasks: PorterTask[] }> = {}
        for (const e of weeklyEntries) {
          const day = new Date(e.createdAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
          if (!dayMap[day]) dayMap[day] = { entries: [], tasks: [] }
          dayMap[day].entries.push(e)
        }
        for (const t of weeklyTasks) {
          const day = t.completedAt ? new Date(t.completedAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'Unknown'
          if (!dayMap[day]) dayMap[day] = { entries: [], tasks: [] }
          dayMap[day].tasks.push(t)
        }
        const days = Object.keys(dayMap)

        return (
          <div>
            {days.length === 0 && (
              <p style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 14 }}>No activity this week</p>
            )}
            {days.map(day => (
              <div key={day} style={{ marginBottom: 24 }}>
                <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: 'var(--text-secondary)' }}>{day}</p>

                {/* Vehicles */}
                {dayMap[day].entries.map(e => {
                  const allDone = e.wipeDown && e.tirePressure && e.matUnderCar && e.charger
                  return (
                    <div key={e.id} style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', marginBottom: 6,
                      background: allDone ? '#f0fdf4' : '#fff', border: `1px solid ${allDone ? '#bbf7d0' : 'var(--border)'}`, borderRadius: 10,
                    }}>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: 14, fontWeight: 600 }}>{e.carName}</span>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>...{e.vin6}</span>
                        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                          {CHECKS.map(c => (
                            <span key={c.key} style={{
                              fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                              background: (e as any)[c.key] ? '#dcfce7' : '#fef2f2',
                              color: (e as any)[c.key] ? '#16a34a' : '#ef4444',
                            }}>{(e as any)[c.key] ? '✓' : '✗'} {c.label}</span>
                          ))}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: allDone ? '#16a34a' : 'var(--text-muted)' }}>
                          {formatDuration(e.startedAt, e.finishedAt || e.completedAt)}
                        </span>
                        {e.startedAt && (
                          <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                            {new Date(e.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                            {e.finishedAt && ` — ${new Date(e.finishedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}

                {/* Tasks */}
                {dayMap[day].tasks.map(t => (
                  <div key={t.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', marginBottom: 6,
                    background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10,
                  }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: 6, background: '#22c55e',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: '#16a34a' }}>{t.title}</p>
                      {t.startedAt && (
                        <p style={{ fontSize: 10, color: '#22c55e', margin: '2px 0 0' }}>
                          {new Date(t.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                          {t.completedAt && ` — ${new Date(t.completedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
                        </p>
                      )}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: '#16a34a' }}>
                      {t.startedAt ? formatDuration(t.startedAt, t.completedAt) : '—'}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )
      })()}

      {view === 'today' && <>


      {/* Assigned Tasks — show on top so porter doesn't miss them */}
      {(pendingTasks.length > 0 || (isAdmin && true)) && (
        <div style={{ marginBottom: 28 }}>
          <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', marginBottom: 12 }}>
            Assigned Tasks {pendingTasks.length > 0 && `(${pendingTasks.length})`}
          </p>

          {/* Only admin can add tasks */}
          {isAdmin && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input value={newTask} onChange={e => setNewTask(e.target.value)} placeholder="Add a task..."
                onKeyDown={e => e.key === 'Enter' && addTask()}
                style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14 }} />
              <button onClick={addTask} disabled={!newTask.trim()} style={{
                padding: '10px 16px', borderRadius: 10, border: 'none',
                background: '#1a1a1a', color: '#dffd6e', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                opacity: !newTask.trim() ? 0.5 : 1,
              }}>Add</button>
            </div>
          )}

          {pendingTasks.length === 0 && !isAdmin && (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: 12 }}>No tasks assigned</p>
          )}

          {pendingTasks.map(t => (
            <div key={t.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', marginBottom: 6,
              background: t.status === 'in_progress' ? '#eff6ff' : '#fefce8',
              border: `1px solid ${t.status === 'in_progress' ? '#bfdbfe' : '#fde047'}`,
              borderRadius: 10,
            }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 14, fontWeight: 600, margin: 0, color: t.status === 'in_progress' ? '#1e40af' : '#92400e' }}>{t.title}</p>
                {isAdmin && t.createdBy && <p style={{ fontSize: 11, color: t.status === 'in_progress' ? '#3b82f6' : '#a16207', margin: '2px 0 0' }}>From {t.createdBy.name}</p>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {t.startedAt && (
                  <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: '#2563eb' }}>
                    {formatDuration(t.startedAt, t.completedAt)}
                  </span>
                )}
                {t.status === 'pending' && (
                  <button onClick={() => startTask(t.id)} style={{
                    padding: '5px 12px', borderRadius: 6, border: '1px solid #2563eb',
                    background: '#eff6ff', color: '#2563eb', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}>Start</button>
                )}
                {t.status === 'in_progress' && (
                  <button onClick={() => completeTask(t.id)} style={{
                    padding: '5px 12px', borderRadius: 6, border: '1px solid #16a34a',
                    background: '#f0fdf4', color: '#16a34a', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}>Done</button>
                )}
                {isAdmin && (
                  <button onClick={() => deleteTask(t.id)} style={{
                    fontSize: 16, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer',
                  }}>×</button>
                )}
              </div>
            </div>
          ))}

        </div>
      )}

      {/* Vehicle Checkup */}
      <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', marginBottom: 12 }}>
        Vehicle Checkup {pending.length > 0 && `· ${pending.length} remaining · ${completed.length} done`}
      </p>

      {/* Add car — search from inventory or manual entry */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <VehicleSearch
            placeholder="Search vehicle by stock #, name, or VIN..."
            onSelect={(v) => {
              setVin6(v.vin ? v.vin.slice(-6) : v.stockNumber.slice(-6))
              setCarName(`${v.year || ''} ${v.make} ${v.model}`.trim())
              setTimeout(() => addCar(), 100)
            }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input value={vin6} onChange={e => setVin6(e.target.value.slice(0, 6))} placeholder="Last 6 VIN"
              style={{ width: 110, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, textTransform: 'uppercase' }} />
            <input value={carName} onChange={e => setCarName(e.target.value)} placeholder="Car name"
              style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}
              onKeyDown={e => e.key === 'Enter' && addCar()} />
            <button onClick={addCar} disabled={saving || !vin6.trim() || !carName.trim()} style={{
              padding: '8px 16px', borderRadius: 8, border: 'none',
              background: '#1a1a1a', color: '#dffd6e', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', opacity: saving || !vin6.trim() || !carName.trim() ? 0.5 : 1,
            }}>Add</button>
          </div>
        </div>
      </div>

      {/* Pending cars */}
      {pending.length === 0 && completed.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
          <p style={{ fontSize: 16, fontWeight: 600 }}>No cars in queue</p>
          <p style={{ fontSize: 14, marginTop: 4 }}>Add a car above to get started</p>
        </div>
      )}

      {pending.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          {pending.map(entry => {
            const doneCount = CHECKS.filter(c => (entry as any)[c.key]).length
            return (
              <div key={entry.id} style={{
                background: '#fff', border: '1px solid var(--border)', borderRadius: 12,
                padding: '16px 20px', marginBottom: 10,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div>
                    <span style={{ fontSize: 16, fontWeight: 700 }}>{entry.carName}</span>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)', marginLeft: 10 }}>...{entry.vin6}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {/* Timer */}
                    <span style={{
                      fontSize: 14, fontWeight: 700, fontFamily: 'monospace',
                      color: entry.startedAt && !entry.finishedAt ? '#2563eb' : 'var(--text-muted)',
                    }}>
                      {formatDuration(entry.startedAt, entry.finishedAt)}
                    </span>
                    {!entry.startedAt ? (
                      <button onClick={() => startTimer(entry.id)} style={{
                        padding: '4px 10px', borderRadius: 6, border: '1px solid #2563eb',
                        background: '#eff6ff', color: '#2563eb', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      }}>Start</button>
                    ) : !entry.finishedAt ? (
                      <button onClick={() => stopTimer(entry.id)} style={{
                        padding: '4px 10px', borderRadius: 6, border: '1px solid #ef4444',
                        background: '#fef2f2', color: '#ef4444', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      }}>Done</button>
                    ) : (
                      <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>Finished</span>
                    )}
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>{doneCount}/4</span>
                    <button onClick={() => deleteEntry(entry.id)} style={{
                      fontSize: 16, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer',
                    }}>×</button>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {CHECKS.map(check => {
                    const done = (entry as any)[check.key]
                    return (
                      <button key={check.key} onClick={() => toggle(entry.id, check.key)} style={{
                        flex: 1, padding: '10px 0', borderRadius: 8,
                        border: done ? '2px solid #22c55e' : '2px solid var(--border)',
                        background: done ? '#f0fdf4' : '#fff',
                        color: done ? '#16a34a' : 'var(--text-secondary)',
                        fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}>
                        {done ? '✓ ' : ''}{check.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}


      {/* Completed Today — bottom of page */}
      {(completedTasks.length > 0 || completed.length > 0) && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 20, marginTop: 20 }}>
          <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', marginBottom: 12 }}>
            Completed Today
          </p>

          {completedTasks.map(t => (
            <div key={t.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', marginBottom: 6,
              background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10,
            }}>
              <div style={{
                width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                background: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: '#16a34a' }}>{t.title}</p>
                {t.startedAt && (
                  <p style={{ fontSize: 10, color: '#22c55e', margin: '2px 0 0' }}>
                    {new Date(t.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    {t.completedAt && ` — ${new Date(t.completedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
                  </p>
                )}
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: '#16a34a' }}>
                {t.startedAt ? formatDuration(t.startedAt, t.completedAt) : '—'}
              </span>
            </div>
          ))}

          {completed.map(entry => (
            <div key={entry.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', marginBottom: 6,
              background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10,
            }}>
              <div style={{
                width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                background: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: '#16a34a' }}>{entry.carName}</p>
                <p style={{ fontSize: 10, color: '#22c55e', margin: '2px 0 0' }}>
                  ...{entry.vin6}
                  {entry.startedAt && ` · Started ${new Date(entry.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: '#16a34a' }}>
                  {formatDuration(entry.startedAt, entry.finishedAt || entry.completedAt)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      </>}
    </div>
  )
}
