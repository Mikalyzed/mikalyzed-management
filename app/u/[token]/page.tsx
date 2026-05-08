'use client'

import { use, useEffect, useState } from 'react'

type Meta = {
  contact: { firstName: string; lastName: string }
  remaining: number
  expiresAt: string
}

type SignResponse = {
  uploadUrl: string
  key: string
}

type UploadStatus = 'idle' | 'uploading' | 'done' | 'error'
type UploadItem = {
  id: string
  name: string
  size: number
  status: UploadStatus
  progress: number
  error?: string
}

export default function PublicUploadPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [meta, setMeta] = useState<Meta | null>(null)
  const [linkError, setLinkError] = useState<string | null>(null)
  const [items, setItems] = useState<UploadItem[]>([])

  useEffect(() => {
    fetch(`/api/upload-links/${token}`)
      .then(r => r.json().then(data => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) setLinkError(data.error || 'Invalid link')
        else setMeta(data)
      })
      .catch(() => setLinkError('Could not load upload link'))
  }, [token])

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    const list: UploadItem[] = Array.from(files).map((f, i) => ({
      id: `${Date.now()}-${i}`,
      name: f.name,
      size: f.size,
      status: 'idle',
      progress: 0,
    }))
    setItems(prev => [...prev, ...list])

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const itemId = list[i].id
      try {
        await uploadFile(file, itemId)
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Upload failed'
        setItems(prev => prev.map(it => it.id === itemId ? { ...it, status: 'error', error: msg } : it))
      }
    }
  }

  async function uploadFile(file: File, itemId: string) {
    setItems(prev => prev.map(it => it.id === itemId ? { ...it, status: 'uploading', progress: 0 } : it))

    // Use multipart for large files; single PUT for small ones (multipart requires 5+ MB parts)
    const MULTIPART_THRESHOLD = 50 * 1024 * 1024 // 50 MB
    if (file.size >= MULTIPART_THRESHOLD) {
      await uploadMultipart(file, itemId)
    } else {
      await uploadSinglePut(file, itemId)
    }

    setItems(prev => prev.map(it => it.id === itemId ? { ...it, status: 'done', progress: 100 } : it))
  }

  async function uploadSinglePut(file: File, itemId: string) {
    const signRes = await fetch(`/api/upload-links/${token}/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contentType: file.type || 'application/octet-stream', fileName: file.name }),
    })
    if (!signRes.ok) {
      const err = await signRes.json().catch(() => ({}))
      throw new Error(err.error || 'Could not authorize upload')
    }
    const { uploadUrl, key }: SignResponse = await signRes.json()

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('PUT', uploadUrl)
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
      xhr.upload.onprogress = e => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100)
          setItems(prev => prev.map(it => it.id === itemId ? { ...it, progress: pct } : it))
        }
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve()
        else reject(new Error(`Upload failed (${xhr.status})`))
      }
      xhr.onerror = () => reject(new Error('Network error during upload'))
      xhr.send(file)
    })

    await fetch(`/api/upload-links/${token}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        r2Key: key,
        contentType: file.type,
        originalFilename: file.name,
      }),
    })
  }

  async function uploadMultipart(file: File, itemId: string) {
    const PART_SIZE = 10 * 1024 * 1024 // 10 MB per part
    const totalParts = Math.ceil(file.size / PART_SIZE)

    // 1. Start multipart
    const startRes = await fetch(`/api/upload-links/${token}/multipart/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contentType: file.type || 'application/octet-stream', fileName: file.name }),
    })
    if (!startRes.ok) {
      const err = await startRes.json().catch(() => ({}))
      throw new Error(err.error || 'Could not start upload')
    }
    const { uploadId, key }: { uploadId: string; key: string } = await startRes.json()

    // 2. Upload parts (3 in parallel)
    const PARALLEL = 3
    const partsState: { [partNumber: number]: number } = {} // bytes uploaded per part
    const completedParts: { partNumber: number; etag: string }[] = []

    function reportProgress() {
      const totalUploaded = Object.values(partsState).reduce((a, b) => a + b, 0)
      const pct = Math.min(99, Math.round((totalUploaded / file.size) * 100))
      setItems(prev => prev.map(it => it.id === itemId ? { ...it, progress: pct } : it))
    }

    async function uploadPartOnce(partNumber: number): Promise<string> {
      const start = (partNumber - 1) * PART_SIZE
      const end = Math.min(start + PART_SIZE, file.size)
      const blob = file.slice(start, end)

      const signRes = await fetch(`/api/upload-links/${token}/multipart/sign-part`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, uploadId, partNumber }),
      })
      if (!signRes.ok) throw new Error('Part sign failed')
      const { url } = await signRes.json()

      let lastReported = 0
      return new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', url)
        xhr.upload.onprogress = e => {
          if (e.lengthComputable) {
            partsState[partNumber] = e.loaded
            if (e.loaded - lastReported > 200_000 || e.loaded === e.total) {
              lastReported = e.loaded
              reportProgress()
            }
          }
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const etagHeader = xhr.getResponseHeader('ETag') || xhr.getResponseHeader('etag')
            if (!etagHeader) reject(new Error('No ETag returned by R2'))
            else resolve(etagHeader.replace(/"/g, ''))
          } else {
            reject(new Error(`Part ${partNumber} HTTP ${xhr.status}`))
          }
        }
        xhr.onerror = () => reject(new Error(`Part ${partNumber} network error`))
        xhr.send(blob)
      })
    }

    async function uploadPart(partNumber: number): Promise<void> {
      const MAX_ATTEMPTS = 4
      let lastErr: Error | null = null
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          // Reset progress for this part on retry
          partsState[partNumber] = 0
          reportProgress()
          const etag = await uploadPartOnce(partNumber)
          partsState[partNumber] = Math.min(file.size - (partNumber - 1) * PART_SIZE, PART_SIZE)
          completedParts.push({ partNumber, etag })
          reportProgress()
          return
        } catch (e) {
          lastErr = e instanceof Error ? e : new Error(String(e))
          if (attempt < MAX_ATTEMPTS) {
            // Exponential backoff: 1s, 2s, 4s
            await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)))
          }
        }
      }
      throw lastErr ?? new Error(`Part ${partNumber} failed`)
    }

    // Run in batches of PARALLEL
    const queue: number[] = []
    for (let p = 1; p <= totalParts; p++) queue.push(p)
    const inFlight: Promise<void>[] = []
    while (queue.length > 0 || inFlight.length > 0) {
      while (inFlight.length < PARALLEL && queue.length > 0) {
        const p = queue.shift()!
        const promise = uploadPart(p).finally(() => {
          const idx = inFlight.indexOf(promise)
          if (idx !== -1) inFlight.splice(idx, 1)
        })
        inFlight.push(promise)
      }
      if (inFlight.length > 0) {
        await Promise.race(inFlight)
      }
    }

    // 3. Complete
    const completeRes = await fetch(`/api/upload-links/${token}/multipart/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key,
        uploadId,
        parts: completedParts,
        contentType: file.type,
        originalFilename: file.name,
      }),
    })
    if (!completeRes.ok) {
      const err = await completeRes.json().catch(() => ({}))
      throw new Error(err.error || 'Failed to finalize upload')
    }
  }

  if (linkError) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, marginBottom: 8 }}>Link Unavailable</h1>
          <p style={{ color: '#666', fontSize: 15 }}>{linkError}</p>
          <p style={{ color: '#888', fontSize: 13, marginTop: 16 }}>Ask the person who sent you this link for a fresh one.</p>
        </div>
      </div>
    )
  }

  if (!meta) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}><p>Loading...</p></div>
      </div>
    )
  }

  const allDone = items.length > 0 && items.every(it => it.status === 'done')

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <p style={{ fontSize: 11, fontWeight: 700, color: '#737373', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
          Mikalyzed Auto Boutique
        </p>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.01em', margin: '6px 0 4px' }}>
          Send us photos & videos
        </h1>
        <p style={{ color: '#666', fontSize: 14, lineHeight: 1.5, marginBottom: 24 }}>
          Hi {meta.contact.firstName}! Drag in or pick files to share with us at full quality. Photos, videos, anything.
        </p>

        <label htmlFor="file-input" style={{
          display: 'block', padding: '32px 20px', border: '2px dashed #d4d4d4', borderRadius: 14,
          textAlign: 'center', cursor: 'pointer', background: '#fafafa', transition: 'all 0.15s ease',
        }}
        onDragOver={e => { e.preventDefault(); (e.currentTarget as HTMLElement).style.background = '#f0f0f0' }}
        onDragLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fafafa' }}
        onDrop={e => {
          e.preventDefault()
          ;(e.currentTarget as HTMLElement).style.background = '#fafafa'
          handleFiles(e.dataTransfer.files)
        }}
        >
          <p style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Tap to choose files</p>
          <p style={{ fontSize: 13, color: '#888', marginTop: 4 }}>or drag and drop here</p>
          <input
            id="file-input" type="file" multiple
            accept="image/*,video/*"
            onChange={e => handleFiles(e.target.files)}
            style={{ display: 'none' }}
          />
        </label>

        {items.length > 0 && (
          <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map(it => (
              <div key={it.id} style={{
                padding: '12px 14px', borderRadius: 10,
                background: it.status === 'done' ? '#f0fdf4' : it.status === 'error' ? '#fef2f2' : '#fff',
                border: '1px solid ' + (it.status === 'done' ? '#bbf7d0' : it.status === 'error' ? '#fecaca' : '#e5e5e5'),
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 500, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {it.name}
                    </p>
                    <p style={{ fontSize: 12, color: '#888', margin: '2px 0 0' }}>
                      {it.status === 'done' ? '✓ Sent' : it.status === 'error' ? '✗ ' + (it.error || 'Failed') : `Uploading… ${it.progress}%`}
                    </p>
                  </div>
                  <p style={{ fontSize: 12, color: '#888', flexShrink: 0 }}>{formatBytes(it.size)}</p>
                </div>
                {it.status === 'uploading' && (
                  <div style={{ height: 4, background: '#e5e5e5', borderRadius: 2, marginTop: 8, overflow: 'hidden' }}>
                    <div style={{ width: `${it.progress}%`, height: '100%', background: '#1a1a1a', transition: 'width 0.2s ease' }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {allDone && (
          <p style={{ marginTop: 20, padding: '12px 14px', borderRadius: 10, background: '#f0fdf4', color: '#166534', fontSize: 14, fontWeight: 600 }}>
            All set — we received your files. You can close this page or send more.
          </p>
        )}
      </div>
    </div>
  )
}

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

const pageStyle: React.CSSProperties = {
  minHeight: '100vh', display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
  padding: '40px 20px', background: '#f5f5f4',
}

const cardStyle: React.CSSProperties = {
  width: '100%', maxWidth: 520, background: '#fff', borderRadius: 16,
  padding: '32px 28px', boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.06)',
}
