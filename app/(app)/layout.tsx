'use client'

import { useEffect, useState } from 'react'
import Nav from '@/components/Nav'
import VoicePhone from '@/components/VoicePhone'
import AskAI from '@/components/AskAI'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState('admin')
  const [name, setName] = useState('User')

  useEffect(() => {
    // Read from cookies
    const cookies = document.cookie.split(';').reduce((acc, c) => {
      const [k, v] = c.trim().split('=')
      acc[k] = v
      return acc
    }, {} as Record<string, string>)

    if (cookies.mm_user_role) setRole(cookies.mm_user_role)
    if (cookies.mm_user_name) setName(decodeURIComponent(cookies.mm_user_name))
  }, [])

  return (
    <div>
      <Nav role={role} userName={name} />
      <main className="main-content" style={{ padding: '20px 24px', paddingTop: '76px', paddingBottom: '40px' }}>
        <style>{`
          @media (min-width: 768px) {
            .main-content {
              margin-left: 220px !important;
              margin-right: 24px !important;
              padding: 32px 28px !important;
              padding-top: 32px !important;
              padding-bottom: 32px !important;
            }
          }
        `}</style>
        {children}
      </main>
      <VoicePhone />
      <AskAI />
    </div>
  )
}
