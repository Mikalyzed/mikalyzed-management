'use client'

import { useEffect, useState } from 'react'
import Nav from '@/components/Nav'

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
      <main className="main-content" style={{ padding: '20px 24px', paddingBottom: '100px' }}>
        <style>{`
          @media (min-width: 768px) {
            .main-content {
              margin-left: 280px !important;
              margin-right: 40px !important;
              padding: 40px 32px !important;
              padding-bottom: 40px !important;
              max-width: 1200px !important;
            }
          }
          @media (min-width: 1440px) {
            .main-content {
              margin-right: auto !important;
              padding: 40px 48px !important;
            }
          }
        `}</style>
        {children}
      </main>
    </div>
  )
}
