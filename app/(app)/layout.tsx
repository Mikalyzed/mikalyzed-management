'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Nav from '@/components/Nav'

type User = {
  id: string
  name: string
  email: string
  role: string
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => {
        if (!res.ok) throw new Error('Not authenticated')
        return res.json()
      })
      .then((data) => setUser(data.user))
      .catch(() => router.push('/login'))
      .finally(() => setLoading(false))
  }, [router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p style={{ color: 'var(--text-muted)' }}>Loading...</p>
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="md:ml-56">
      <Nav role={user.role} userName={user.name} />
      <main className="main-content p-4 md:p-6 max-w-7xl mx-auto">
        {children}
      </main>
    </div>
  )
}
