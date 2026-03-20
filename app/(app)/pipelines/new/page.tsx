'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import PipelineForm from '../_components/PipelineForm'

export default function NewPipelinePage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)

  async function handleSave(name: string, color: string, stages: { name: string; type: string }[]) {
    setSaving(true)
    const res = await fetch('/api/pipelines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color, stages }),
    })
    if (res.ok) {
      router.push('/pipelines')
    }
    setSaving(false)
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, letterSpacing: '-0.02em' }}>New Pipeline</h1>
      <PipelineForm onSave={handleSave} saving={saving} />
    </div>
  )
}
