'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import PipelineForm from '../_components/PipelineForm'

type Stage = { id: string; name: string; type: string; sortOrder: number; color: string | null }
type Pipeline = { id: string; name: string; color: string; stages: Stage[] }

export default function EditPipelinePage() {
  const { id } = useParams()
  const router = useRouter()
  const [pipeline, setPipeline] = useState<Pipeline | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch(`/api/pipelines/${id}`).then(r => r.json()).then(d => { setPipeline(d); setLoading(false) })
  }, [id])

  async function handleSave(name: string, color: string, stages: { id?: string; name: string; type: string }[]) {
    setSaving(true)
    const res = await fetch(`/api/pipelines/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color, stages }),
    })
    if (res.ok) {
      router.push('/pipelines')
    }
    setSaving(false)
  }

  if (loading) return <p style={{ color: 'var(--text-muted)', padding: 40, textAlign: 'center' }}>Loading...</p>
  if (!pipeline) return <p style={{ color: 'var(--text-muted)', padding: 40, textAlign: 'center' }}>Not found</p>

  return (
    <div style={{ maxWidth: 600 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, letterSpacing: '-0.02em' }}>Edit Pipeline</h1>
      <PipelineForm
        initialName={pipeline.name}
        initialColor={pipeline.color}
        initialStages={pipeline.stages.map(s => ({ id: s.id, name: s.name, type: s.type }))}
        onSave={handleSave}
        saving={saving}
      />
    </div>
  )
}
