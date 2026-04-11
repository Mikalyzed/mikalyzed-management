'use client'

import { useState, useRef } from 'react'

type Specs = {
  year: string; vehicleName: string
  spec1Label: string; spec1Value: string
  spec2Label: string; spec2Value: string
  spec3Label: string; spec3Value: string
  spec4Label: string; spec4Value: string
}

// Resize image client-side to max 2000px wide to stay under body limits
async function resizeImage(file: File): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const maxW = 2000
      let w = img.width
      let h = img.height
      if (w > maxW) { h = Math.round(h * (maxW / w)); w = maxW }
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, w, h)
      canvas.toBlob(blob => resolve(blob!), 'image/jpeg', 0.9)
    }
    img.src = URL.createObjectURL(file)
  })
}

export default function GenerateAdPage() {
  const [url, setUrl] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null)
  const [specs, setSpecs] = useState<Specs | null>(null)
  const [editing, setEditing] = useState(false)

  function handlePhoto(file: File) {
    setPhoto(file)
    const reader = new FileReader()
    reader.onload = () => setPhotoPreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  async function generate(overrideSpecs?: Specs) {
    if (!photo) { setError('Drop a photo first'); return }
    if (!url.trim() && !overrideSpecs && !specs) { setError('Paste a listing URL'); return }

    setLoading(true)
    setError('')
    setGeneratedUrl(null)

    try {
      let currentSpecs = overrideSpecs || specs

      // Step 1: Fetch specs from URL if we don't have them
      if (!currentSpecs) {
        setStatus('Analyzing listing...')
        const fetchRes = await fetch('/api/fetch-listing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        })
        const data = await fetchRes.json()
        if (data.error) { setError(data.error); setLoading(false); setStatus(''); return }
        currentSpecs = data as Specs
        setSpecs(currentSpecs)
      }

      // Step 2: Generate image
      setStatus('Generating ad...')
      const resizedPhoto = await resizeImage(photo)
      const formData = new FormData()
      formData.append('photo', resizedPhoto, 'photo.jpg')
      formData.append('year', currentSpecs.year || '')
      formData.append('vehicleName', currentSpecs.vehicleName || '')
      formData.append('spec1Label', currentSpecs.spec1Label || '')
      formData.append('spec1Value', currentSpecs.spec1Value || '')
      formData.append('spec2Label', currentSpecs.spec2Label || '')
      formData.append('spec2Value', currentSpecs.spec2Value || '')
      formData.append('spec3Label', currentSpecs.spec3Label || '')
      formData.append('spec3Value', currentSpecs.spec3Value || '')
      formData.append('spec4Label', currentSpecs.spec4Label || '')
      formData.append('spec4Value', currentSpecs.spec4Value || '')

      const genRes = await fetch('/api/generate-ad', { method: 'POST', body: formData })
      if (!genRes.ok) {
        const err = await genRes.json()
        setError(err.error || 'Failed to generate')
        setLoading(false); setStatus(''); return
      }

      const blob = await genRes.blob()
      setGeneratedUrl(URL.createObjectURL(blob))
      setStatus('')
    } catch (e: any) {
      setError(e.message || 'Something went wrong')
      setStatus('')
    }
    setLoading(false)
  }

  function download() {
    if (!generatedUrl) return
    const a = document.createElement('a')
    a.href = generatedUrl
    a.download = `ad-${specs?.vehicleName || 'vehicle'}.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  function reset() {
    setUrl('')
    setPhoto(null)
    setPhotoPreview(null)
    setSpecs(null)
    setGeneratedUrl(null)
    setEditing(false)
    setError('')
  }

  function updateSpec(field: keyof Specs, value: string) {
    if (!specs) return
    setSpecs({ ...specs, [field]: value })
  }

  const ready = photo && url.trim()

  // Show result view
  if (generatedUrl && specs) {
    return (
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Ad Generator</h1>
          <button onClick={reset} style={{
            padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)',
            background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>New Ad</button>
        </div>

        <div style={{ display: 'flex', gap: 24 }}>
          {/* Preview */}
          <div style={{ flex: 1 }}>
            <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
              <img src={generatedUrl} alt="Generated Ad" style={{ width: '100%', display: 'block' }} />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={download} style={{
                flex: 1, padding: '12px 0', borderRadius: 10, border: 'none',
                background: '#1a1a1a', color: '#dffd6e', fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}>Download PNG</button>
            </div>
          </div>

          {/* Editable specs */}
          <div style={{ width: 280, flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>Specs</span>
              {!editing && (
                <button onClick={() => setEditing(true)} style={{
                  fontSize: 12, fontWeight: 600, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer',
                }}>Edit</button>
              )}
            </div>

            {editing ? (
              <>
                <SpecInput label="Year" value={specs.year} onChange={v => updateSpec('year', v)} />
                <SpecInput label="Vehicle Name" value={specs.vehicleName} onChange={v => updateSpec('vehicleName', v)} />
                <div style={{ borderTop: '1px solid var(--border)', margin: '12px 0', paddingTop: 12 }}>
                  <SpecInput label="Spec 1 Label" value={specs.spec1Label} onChange={v => updateSpec('spec1Label', v)} />
                  <SpecInput label="Spec 1 Value" value={specs.spec1Value} onChange={v => updateSpec('spec1Value', v)} />
                  <SpecInput label="Spec 2 Label" value={specs.spec2Label} onChange={v => updateSpec('spec2Label', v)} />
                  <SpecInput label="Spec 2 Value" value={specs.spec2Value} onChange={v => updateSpec('spec2Value', v)} />
                  <SpecInput label="Spec 3 Label" value={specs.spec3Label} onChange={v => updateSpec('spec3Label', v)} />
                  <SpecInput label="Spec 3 Value" value={specs.spec3Value} onChange={v => updateSpec('spec3Value', v)} />
                  <SpecInput label="Spec 4 Label" value={specs.spec4Label} onChange={v => updateSpec('spec4Label', v)} />
                  <SpecInput label="Spec 4 Value" value={specs.spec4Value} onChange={v => updateSpec('spec4Value', v)} />
                </div>
                <button onClick={() => { setEditing(false); generate(specs) }} style={{
                  width: '100%', padding: '10px 0', borderRadius: 8, border: 'none',
                  background: '#1a1a1a', color: '#dffd6e', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                }}>Regenerate</button>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <SpecDisplay label="Year" value={specs.year} />
                <SpecDisplay label="Vehicle" value={specs.vehicleName} />
                <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
                <SpecDisplay label={specs.spec1Label} value={specs.spec1Value} />
                <SpecDisplay label={specs.spec2Label} value={specs.spec2Value} />
                <SpecDisplay label={specs.spec3Label} value={specs.spec3Value} />
                <SpecDisplay label={specs.spec4Label} value={specs.spec4Value} />
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Initial view — URL + Photo only
  return (
    <div style={{ maxWidth: 520, margin: '0 auto', paddingTop: 40 }}>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 6 }}>Ad Generator</h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>Paste a listing URL, drop a photo, and generate.</p>
      </div>

      {/* URL */}
      <div style={{ marginBottom: 20 }}>
        <input
          value={url} onChange={e => setUrl(e.target.value)}
          placeholder="Paste listing URL..."
          style={{
            width: '100%', padding: '14px 18px', borderRadius: 12,
            border: '1px solid var(--border)', fontSize: 15, outline: 'none',
            background: '#fff',
          }}
        />
      </div>

      {/* Photo */}
      <div style={{ marginBottom: 24 }}>
        {photoPreview ? (
          <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)' }}>
            <img src={photoPreview} alt="Preview" style={{ width: '100%', maxHeight: 280, objectFit: 'cover', display: 'block' }} />
            <button onClick={() => { setPhoto(null); setPhotoPreview(null) }} style={{
              position: 'absolute', top: 10, right: 10, width: 30, height: 30, borderRadius: '50%',
              background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', fontSize: 18, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>×</button>
          </div>
        ) : (
          <label
            onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#1a1a1a' }}
            onDragLeave={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--border)' }}
            onDrop={e => {
              e.preventDefault(); e.currentTarget.style.borderColor = 'var(--border)'
              const file = e.dataTransfer.files?.[0]
              if (file) handlePhoto(file)
            }}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              padding: '48px 20px', borderRadius: 12, border: '2px dashed var(--border)',
              background: '#fafafa', cursor: 'pointer', transition: 'border-color 0.15s',
            }}>
            <input type="file" accept="image/*" onChange={e => e.target.files?.[0] && handlePhoto(e.target.files[0])} style={{ display: 'none' }} />
            <svg width="32" height="32" fill="none" stroke="#999" strokeWidth="1.5" viewBox="0 0 24 24" style={{ marginBottom: 10 }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm12.75-11.25h.008v.008h-.008V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
            </svg>
            <span style={{ fontSize: 14, color: '#999', fontWeight: 500 }}>Drop car photo or click to upload</span>
          </label>
        )}
      </div>

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: '#fef2f2', color: '#ef4444', fontSize: 13, marginBottom: 16, border: '1px solid #fecaca' }}>
          {error}
        </div>
      )}

      {/* Generate */}
      <button onClick={() => generate()} disabled={loading || !ready} style={{
        width: '100%', padding: '16px 0', borderRadius: 12, border: 'none',
        background: ready && !loading ? '#1a1a1a' : '#e5e5e5',
        color: ready && !loading ? '#dffd6e' : '#999',
        fontSize: 16, fontWeight: 700, cursor: ready && !loading ? 'pointer' : 'default',
        transition: 'all 0.15s',
      }}>
        {loading ? (
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <span style={{ width: 16, height: 16, border: '2px solid #999', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 1s linear infinite' }} />
            {status}
          </span>
        ) : 'Generate Ad'}
      </button>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

function SpecInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)}
        style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13, background: '#f9fafb' }} />
    </div>
  )
}

function SpecDisplay({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{label}</span>
      <p style={{ fontSize: 14, fontWeight: 600, margin: '2px 0 0' }}>{value}</p>
    </div>
  )
}
