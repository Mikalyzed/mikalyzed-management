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
      {/* Soft mesh-gradient backdrop — single source for the glass pages.
          On desktop it's offset 220px from the left so the radial hot spots sit
          inside the visible content area instead of behind the fixed nav. */}
      <div aria-hidden className="app-mesh-bg" />
      <style>{`
        .app-mesh-bg {
          position: fixed;
          top: 0; right: 0; bottom: 0; left: 0;
          background:
            radial-gradient(at 24% 18%, hsla(220, 90%, 72%, 0.18) 0px, transparent 55%),
            radial-gradient(at 88% 6%, hsla(280, 80%, 68%, 0.16) 0px, transparent 55%),
            radial-gradient(at 74% 82%, hsla(190, 70%, 78%, 0.12) 0px, transparent 50%),
            radial-gradient(at 22% 92%, hsla(340, 75%, 72%, 0.14) 0px, transparent 55%);
          filter: blur(80px) saturate(110%);
          z-index: -1;
          pointer-events: none;
        }
        @media (min-width: 768px) {
          .main-content {
            margin-left: 220px !important;
            margin-right: 16px !important;
            padding: 24px 18px !important;
          }
          .app-mesh-bg { left: 220px; }
        }
      `}</style>
      <main className="main-content" style={{ padding: '16px 16px', paddingTop: 'calc(env(safe-area-inset-top, 0px) + 88px)', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 32px)' }}>
        {children}
      </main>
      <VoicePhone />
      <AskAI />
    </div>
  )
}
